---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-01T07:56:14Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - prisma/migrations/20260831100411_planning_rounds/migration.sql
  - prisma/schema.prisma
  - src/app/create-bot.ts
  - src/domain/auth/authorization-service.ts
  - src/domain/auth/planning-access-service.ts
  - src/domain/planning/planning-service.ts
  - src/domain/planning/slot-generator.ts
  - src/domain/planning/target-week.ts
  - src/domain/roster/roster-service.ts
  - src/infrastructure/time/civil.ts
  - src/infrastructure/time/zoned-clock.ts
  - src/shared/callback-schema.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/planning-renderers.ts
  - src/telegram/roster-renderers.ts
  - tests/fakes/chat-readiness.ts
  - tests/integration/chat-configuration.test.ts
  - tests/integration/chat-readiness.e2e.test.ts
  - tests/integration/planning-confirm.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/planning-round.test.ts
  - tests/integration/planning-takeover.test.ts
  - tests/unit/callback-authority.test.ts
  - tests/unit/planning-day-card.test.ts
  - tests/unit/planning-keyboards.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/planning-ownership.test.ts
  - tests/unit/planning-start-authorization.test.ts
  - tests/unit/planning-time-card.test.ts
  - tests/unit/roster-rendering.test.ts
  - tests/unit/slot-generation.test.ts
  - tests/unit/target-week.test.ts
  - tests/unit/zoned-clock.test.ts
findings:
  critical: 1
  warning: 10
  info: 0
  total: 11
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-01T07:56:14Z
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Adversarial pass over the Phase 2 planning wizard, focused on the five areas the phase
context named: transaction correctness, authorization, DST/timezone arithmetic, Telegram
hazards, and the Zod callback boundary.

Things that held up under attack and are **not** reported below, so a later reader knows
they were actually checked:

- **`status`/`activeWeekStart` never diverge.** All six write sites were enumerated
  (`planning-service.ts:879, 977, 1091, 1184, 1337, 1414`). Every one that changes `status`
  changes `activeWeekStart` in the same statement; the three step transitions touch neither.
- **Every mutating transition is guarded.** `selectDay`, `selectTime`, `back`, `confirm`
  and `takeover` all follow the same order — validate, resolve ownership from
  `PlanningRound.authorUserId`, refuse read-only, then CAS the callback row
  (`consumedAt: null`, `count === 1`), then CAS the round on `revision`. Every read-only
  refusal genuinely leaves the row unconsumed.
- **Ownership authority is never taken from the wire.** `resolveOwnership` reads the durable
  `authorUserId` column, never `CallbackAction.actorUserId` and never the token. `takeover`
  re-resolves the role at tap time through the non-destructive `currentRole`, so a refused
  takeover cannot destroy an unrelated wizard.
- **HTML escaping is sound.** Every user-controlled string on a `parse_mode: "HTML"` card
  goes through `memberLabel`, which escapes exactly once; nothing double-escapes.
- **`callback_data` is well inside 64 bytes.** `v1:` + a 36-char UUID = 39 bytes; no date,
  minute or round id is ever on the wire.
- **DST reasoning in `zoned-clock.ts` is correct.** The ±1-day offset probe with the
  `offsetMsAt(tz, c) === naive - c` survivor filter correctly yields unique / ambiguous
  (earlier wins) / skipped, and works for non-whole-hour zones.
- **`answerCallbackQuery` single-shot guard** (`callbacks.ts:257-263`) plus the `finally`
  fallback means no update can leave a client spinning.

The blocker below is a domain-logic gap in week selection that lets the bot commit two
confirmed rehearsals for the same week. The warnings cluster around the re-anchor path,
which is the least atomic part of the phase.

## Critical Issues

### CR-01: `/plan` targets an already-claimed week when both the current and next week are confirmed

**File:** `src/domain/planning/target-week.ts:139-146`, `src/domain/planning/planning-service.ts:871-878`

**Issue:** `targetWeekStart` asks the claim predicate exactly once, about the current week,
and rolls forward unconditionally:

```ts
const monday = mondayOf(nowCivil);
const current = isoDate(monday);
return isClaimed(current) ? isoDate(addDays(monday, 7)) : current;
```

The returned week is never itself tested for a claim. Reachable in three commands:

1. Wed 2026-08-26, `/plan` → round A targets `2026-08-24`; author confirms.
2. Same day, `/plan` → `2026-08-24` is claimed → round B targets `2026-08-31`; author confirms.
3. Same day, `/plan` → `2026-08-24` is still the only week asked about, still claimed →
   round C **also** targets `2026-08-31`.

Nothing downstream catches it. `@@unique([chatId, activeWeekStart])` does not fire, because
round B released `activeWeekStart` to `NULL` when it confirmed — the unique index only
constrains *live* rounds. Round C therefore becomes a second `CONFIRMED` round with
`targetWeekStart = '2026-08-31'`, and Phase 3 will run two availability rounds for the same
week against two participant snapshots. `weekIsClaimed` — the "ONE named function" the whole
Phase 4 extension point rests on — is bypassed for the week that actually gets used.

`tests/unit/target-week.test.ts:44-58` asserts the single-question behaviour
(`expect(asked).toEqual([MONDAY])`) and `tests/integration/planning-round.test.ts:582-632`
only ever claims one week, so the case is untested in both suites.

**Fix:** Advance until an unclaimed week is found, with a bound so a pathological chat cannot
spin:

```ts
/** How far ahead the search may run before giving up (52 weeks = one year). */
const MAX_WEEK_LOOKAHEAD = 52;

export function targetWeekStart(
  nowCivil: CivilDate,
  isClaimed: (weekStart: string) => boolean,
): string {
  let monday = mondayOf(nowCivil);
  for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
    const candidate = isoDate(monday);
    if (!isClaimed(candidate)) return candidate;
    monday = addDays(monday, 7);
  }
  throw new RangeError("No unclaimed week within the lookahead window.");
}
```

`startOrResume` already loads every `CONFIRMED` round for the chat into `claiming`, so the
extra questions cost nothing. Update `tests/unit/target-week.test.ts` to assert the
two-consecutive-claimed-weeks case, and add an integration case that seeds two confirmed
rounds and asserts the third `/plan` targets `2026-09-07`.

## Warnings

### WR-01: A lost `revision` race spends the Confirm token and leaves the card permanently dead

**File:** `src/domain/planning/planning-service.ts:1323-1358` (with `1646-1653`)

**Issue:** `confirm` consumes the callback row first, then guards the promotion:

```ts
if (consumed.count !== 1) return { kind: "duplicate" };
const promoted = await tx.planningRound.updateMany({
  where: { id: round.id, revision: expectedRevision ?? round.revision, status: DRAFT },
  ...
});
if (promoted.count !== 1) return { kind: "stale" };
```

On the `stale` branch the Confirm token is already spent and the round is still `DRAFT`. The
review card in the chat now has a Confirm button that can never work again; the author's only
recovery is `/plan_status`, which may itself be inside its 60 s cooldown.

The reason this is reachable rather than theoretical is `reanchor`
(`planning-service.ts:1646-1653`), which does `revision: { increment: 1 }` on **any** member's
`/plan_status`. That directly contradicts this module's own stated invariant twenty lines
earlier at `planning-service.ts:1565-1568`:

> "The claim deliberately does NOT bump `revision`. […] bumping would make a bystander's
> request invalidate the author's in-flight tap — handing anyone in the chat a way to break
> the author's card once a minute."

The claim does not bump it; the `reanchor` that runs immediately afterwards on the same code
path does. Today only grammY's per-chat `sequentialize` prevents the interleave, and this
service explicitly disclaims relying on it — "`sequentialize` only narrows the race window;
the constraint is the guarantee" (`planning-service.ts:838-839`). Any second bot process
reopens it.

**Fix:** Either stop `reanchor` bumping `revision` (it does not change any wizard value, so
it does not need to invalidate anything), or make `confirm`'s post-consume failure
self-healing by releasing the row it just spent:

```ts
// Option A — preferred: a re-anchor is not a step transition, so it must not
// invalidate one. Drop the increment and guard on the anchor instead.
const reanchored = await this.prisma.planningRound.updateMany({
  where: { id: roundId, revision: expectedRevision },
  data: {
    anchorMessageId: messageId,
    lastStatusPostedAt: now,
    ...(refreshActivity ? { lastActivityAt: now } : {}),
  },
});
```

If the increment must stay, release the token on the losing branch before returning
`stale`, so the card survives:

```ts
if (promoted.count !== 1) {
  await tx.callbackAction.updateMany({
    where: { token: callbackToken },
    data: { consumedAt: null },
  });
  return { kind: "stale" };
}
```

### WR-02: A failed re-anchor leaves two live cards and an anchor pointing at the wrong one

**File:** `src/telegram/planning-handlers.ts:703-733`

**Issue:** `repostAnchor` posts the new card (with live, freshly minted tokens), then tries to
record it:

```ts
const reanchored = await deps.planning.reanchor(round.id, messageId, round.revision, ...);
if (reanchored.kind !== "reanchored") {
  logPlanningFailure(...);
  return;                       // <- clearSupersededCard never runs
}
```

On the early return the chat is left in a genuinely broken state:

- the new message at the bottom has a live keyboard whose tokens are unconsumed and unexpired;
- the old message still has its keyboard, because `clearSupersededCard` is below the return;
- `round.anchorMessageId` still names the **old** message.

So when the author taps a button on the new card, the transition commits and `editAnchor`
(`planning-handlers.ts:526-578`) edits the *old* message, hundreds of messages up. The card
the author is looking at never changes, so it reads as a dead bot, and both keyboards stay
pressable — precisely the two-live-cards hazard `clearSupersededCard`'s own doc comment
(threat T-02-13) exists to close.

**Fix:** Clear the superseded keyboard on the failure path too, and tell the user the re-post
did not take:

```ts
if (reanchored.kind !== "reanchored") {
  logPlanningFailure(deps, PLANNING_CATCH_SITES.anchor, route, context,
    new Error(`Anchor not recorded: ${reanchored.kind}`));
  // The new card is un-anchored and its buttons would edit the wrong message.
  // Strip its markup rather than leaving two pressable cards in the chat.
  await clearSupersededCard(ctx, deps, context, route, messageId, card);
  return;
}
```

### WR-03: The terminal confirmed card silently drops the owner line, un-attributing a taken-over round

**File:** `src/telegram/planning-handlers.ts:1091-1097`

**Issue:** `renderConfirmedStep` supports an owner line (`planning-renderers.ts:424-426`), and
`planningOwnerLine`'s contract (`planning-renderers.ts:128-134`) is explicit that it is
"Stated on EVERY card rather than only on the one a takeover produces", because:

> "A line that appeared at the moment of the hand-over and vanished on the next tap would say
> 'this round changed hands' for exactly one render and then quietly stop being true to a
> reader scrolling back — which is the silent re-attribution the decision exists to prevent."

But `dispatchConfirm` builds the projection without `owner`:

```ts
renderConfirmedStep({
  selectedDate: result.round.selectedDate ?? result.round.targetWeekStart,
  startMinute: result.round.selectedStartMinute ?? result.round.dailyStartMinute,
  durationMinutes: result.round.durationMinutes,
  members: result.members,
})
```

The confirmed card is the one card that persists in chat history forever, and it is exactly
the card that loses the attribution. After an administrator takeover the permanent record
names nobody.

**Fix:** Resolve the owner from the same durable column the refusal reads and pass it:

```ts
renderConfirmedStep({
  selectedDate: result.round.selectedDate ?? result.round.targetWeekStart,
  startMinute: result.round.selectedStartMinute ?? result.round.dailyStartMinute,
  durationMinutes: result.round.durationMinutes,
  members: result.members,
  owner: await resolveTelegramIdentity(deps.prisma, result.round.authorUserId),
})
```

(or expose a `confirmedStepProjection` on `PlanningService` so the surface does not read the
identity itself). Add an assertion to `tests/integration/planning-takeover.test.ts` that the
post-takeover confirmed card names the new owner.

### WR-04: The `/plan_status` cooldown does not cover the three branches that reply without a round

**File:** `src/telegram/planning-handlers.ts:912-948` (constant at `src/domain/planning/planning-service.ts:69-79`)

**Issue:** `PLANNING_STATUS_COOLDOWN_MS` is stored in `PlanningRound.lastStatusPostedAt`, so it
can only rate-limit a chat that *has* a draft round. The `no-active-round`, `unconfigured` and
`failed` branches each `await ctx.reply(...)` with no rate limit whatsoever, and D-15 opens
`/plan_status` to every chat member. The constant's own rationale names this exact threat:

> "D-15 opens `/plan_status` to everyone in the chat, which makes it the only side-effecting
> command in the phase that no role gates. Without a cooldown it is an unrated flood vector."

In a chat with no draft round — the common state — any member can drive one bot `sendMessage`
per message they send, plus a `getChatMember` call, a `chatConfiguration.findUnique` and a
`supersedeStaleRounds` UPDATE. Telegram's per-chat flood control will 429 the bot, which
degrades every other surface in the chat, not just `/plan_status`.

**Fix:** Move the cooldown off the round row so it also covers the no-round case — e.g. a
`ChatConfiguration.lastStatusPostedAt` column claimed with the same `updateMany` CAS, or a
dedicated `chat_status_cooldowns` row keyed by `chatId` — and claim it before the round lookup
rather than after it. At minimum, make the `no-active-round` reply silent-after-first, the way
the `cooling-down` branch already is.

### WR-05: `callback_actions` rows are never reaped

**File:** `src/domain/planning/planning-service.ts:649-670`, `1678-1704` (no delete site anywhere in `src/`)

**Issue:** `grep -rn "callbackAction.delete\|deleteMany" src/` finds no deletion of
`callback_actions` at all. Phase 2 substantially increases the mint rate: every `/plan`,
every step transition and every successful `/plan_status` mints a full step set (7 day rows,
or 10-plus-1 time rows, or 2 review rows), and a chat can drive one `/plan_status` per minute
indefinitely. Almost none of these rows are ever consumed — a step mints seven day tokens and
at most one is spent — and expired rows are never removed. The table grows without bound, and
the boundary's `findUnique` on every callback plus
`@@index([chatId, actorUserId, expiresAt])` both degrade with it.

**Fix:** Add a retention sweep on the same read-time principle the phase already uses for
stale rounds (no scheduler needed):

```ts
/** Rows older than this can no longer be presented, so they are only weight. */
const CALLBACK_RETENTION_MS = 24 * 60 * 60 * 1000;

async reapExpiredActions(chatId: bigint, now: Date) {
  await this.prisma.callbackAction.deleteMany({
    where: { chatId, expiresAt: { lt: new Date(now.getTime() - CALLBACK_RETENTION_MS) } },
  });
}
```

Call it beside `supersedeStaleRounds` in `startOrResume` and `status`, and add an index on
`expiresAt` to keep the delete cheap.

### WR-06: Dead action members in the Zod boundary and a dead enum member in the schema

**File:** `src/shared/callback-schema.ts:260`, `prisma/schema.prisma:30`

**Issue:** `planningTargetSchema` accepts five control actions:

```ts
action: z.enum(["back", "confirm", "cancel", "takeover", "refuse-past"]),
```

`"cancel"` and `"refuse-past"` are never minted (`stepTargets` at
`planning-service.ts:612-639` emits only `day`, `time`, `back`, `confirm`; `mintTakeoverAction`
emits `takeover`) and have no dispatch branch — they fall through to the
`"planning-action-not-yet-supported"` catch-all at `planning-handlers.ts:1317-1330`.
Similarly, `PlanningRoundStatus.ABANDONED` is declared in the schema and the migration but
never written anywhere in `src/`.

A validator that accepts vocabulary the system cannot produce is a widened attack surface for
no benefit, and a status the state machine can never reach invites a later reader to assume
an abandonment path exists.

**Fix:** Narrow the enum to what is actually minted, and drop the branch that only exists to
refuse it:

```ts
action: z.enum(["back", "confirm", "takeover"]),
```

Either remove `ABANDONED` from `PlanningRoundStatus` (a migration, since the phase is not yet
shipped) or add a comment on the enum member naming the phase that will write it, so its
absence is a decision rather than a gap.

### WR-07: Broken grammar on the review card for a single-member roster

**File:** `src/telegram/planning-renderers.ts:386`

**Issue:**

```ts
`<b>Asking these ${members.length === 1 ? "band member" : `${members.length} band members`}:</b>`
```

For a one-member roster this renders **"Asking these band member:"**. The singular arm drops
the count but keeps the plural determiner. `grep -rn "Asking these" tests/` returns nothing,
so no test covers either arm of this branch — the review card's headline is untested for the
smallest valid roster.

**Fix:**

```ts
members.length === 1
  ? "<b>Asking this band member:</b>"
  : `<b>Asking these ${members.length} band members:</b>`
```

Add a case to `tests/unit/planning-time-card.test.ts` (or a new review-card test) covering
rosters of size 1 and 2.

### WR-08: `PlanningParticipant.membershipId` is an unconstrained, unindexed string

**File:** `prisma/schema.prisma:184-193`, `prisma/migrations/20260831100411_planning_rounds/migration.sql:39-46`

**Issue:** The model doc calls this table "a durable cross-phase contract" that "Phase 3 reads
to decide exactly who may answer the availability card", but `membershipId` is a bare
`String` with no `@relation` to `ChatMembership` and no foreign key in the migration —
unlike `roundId`, which has both. Nothing prevents a participant row from naming a membership
that does not exist. It survives today only because roster removal is a soft delete
(`deactivatedAt`); the moment any code hard-deletes a membership, or a chat is purged, the
snapshot silently points at nothing and Phase 3 has no way to detect it.

Separately, `wasPreviousParticipant` (`planning-service.ts:733-744`) filters on
`telegramUserId` and runs on every `/plan`, but the only index is the composite unique
`(round_id, telegram_user_id)` whose leading column is `round_id` — so that query cannot use
it.

**Fix:** Declare the relation so the database enforces it, and index the column the policy
query filters on:

```prisma
model PlanningParticipant {
  id             String         @id @default(cuid())
  roundId        String         @map("round_id")
  telegramUserId BigInt         @map("telegram_user_id")
  membershipId   String         @map("membership_id")
  round          PlanningRound  @relation(fields: [roundId], references: [id], onDelete: Cascade)
  membership     ChatMembership @relation(fields: [membershipId], references: [id], onDelete: Restrict)

  @@unique([roundId, telegramUserId])
  @@index([telegramUserId])
  @@map("planning_participants")
}
```

`onDelete: Restrict` matches the existing `ChatMembership -> TelegramUser` policy: a
membership that a confirmed round snapshotted must not be destroyed.

### WR-09: The confirm lineup is read before the atomic gate, so a concurrent roster change is snapshotted stale

**File:** `src/domain/planning/planning-service.ts:1320-1370`

**Issue:** The lineup is read at line 1320, the callback CAS runs at 1323, and the participant
rows are written at 1364:

```ts
const members = await listActiveMemberships(tx, chatId);   // 1320
if (members.length === 0) return { kind: "empty-roster" };
const consumed = await tx.callbackAction.updateMany({...}); // 1323
...
await tx.planningParticipant.createMany({ data: members.map(...) }); // 1364
```

Prisma interactive transactions run at PostgreSQL's default `READ COMMITTED`, and this read
takes no row lock on `chat_memberships`. A `/roster` removal or `/roster_add` committing
between 1320 and 1364 is invisible to this transaction, so the durable snapshot Phase 3 reads
can include a member removed seconds earlier, or omit one just added. The doc comment at
1315-1319 ("read inside the transaction through the same function `/roster` reads") implies an
atomicity that `READ COMMITTED` does not provide.

**Fix:** Either take the snapshot *after* the consume CAS (it is the only thing between them,
and moving the read down costs nothing but requires keeping the empty-roster check where it
is, as a second read), or lock the membership rows for the duration:

```ts
// Re-read the lineup under a row lock once the atomic gate has been won, so the
// snapshot cannot be overtaken by a roster change that commits mid-transaction.
await tx.$queryRaw`
  SELECT 1 FROM chat_memberships
  WHERE chat_id = ${chatId} AND active_at IS NOT NULL AND deactivated_at IS NULL
  FOR SHARE`;
const lineup = await listActiveMemberships(tx, chatId);
```

At minimum, correct the comment so the next reader does not inherit the false guarantee.

### WR-10: A non-member tapping a planning button is told the wrong reason

**File:** `src/telegram/callbacks.ts:390-395` (text at `src/telegram/callbacks.ts:33`)

**Issue:** The boundary refuses a route-resolved non-member through the shared helper:

```ts
if (!isCurrentMember(role)) {
  return await denyNonAdministrator(CALLBACK_BOUNDARY_BRANCHES.deniedNonMember, action.kind);
}
```

`denyNonAdministrator` always answers `CALLBACK_DENIAL` = *"Only current chat administrators
can do that."* That is true for the three `current-admin` routes, and false for the planning
route, where D-02/D-15 admit any member and authority comes from `authorUserId`. The `reason`
field was carefully split into `not-a-current-chat-member` so operators can tell the two
apart, but the user-visible copy was not — so a band member whose membership lookup returned
`unknown` during a Telegram blip is told they lack administrator rights, and will go and ask
to be promoted. The planning surface's own `PLANNING_STATUS_DENIAL` ("Only people in this chat
can check the rehearsal plan.") is the correct wording and already exists.

**Fix:** Carry the refusal text on the route the way `staleText` already is, and use it:

```ts
export type CallbackRoute = Readonly<{
  staleText: string;
  /** The alert a non-member sees. Distinct from `staleText`: the button is fine,
   *  the tapper is not in the chat. */
  nonMemberText: string;
  authority: CallbackAuthority;
  actorBinding: CallbackActorBinding;
  dispatch: CallbackDispatcher;
}>;
```

with `nonMemberText: "Only people in this chat can use this card."` on
`planningCallbackRoute`. `tests/unit/callback-authority.test.ts` should assert the two
refusals produce different text.

---

_Reviewed: 2026-09-01T07:56:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
