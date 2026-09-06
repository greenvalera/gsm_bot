---
phase: 03-availability-and-booking-decision
reviewed: 2026-09-06T20:26:18Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - prisma/migrate-deploy.mjs
  - prisma/migrations/20260905120000_availability_and_booking/migration.sql
  - prisma/schema.prisma
  - src/domain/planning/planning-service.ts
  - src/domain/planning/target-week.ts
  - src/shared/callback-schema.ts
  - src/telegram/keyboards.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/planning-renderers.ts
  - tests/integration/migration-preflight.test.ts
  - tests/integration/planning-availability.test.ts
  - tests/integration/planning-booking.test.ts
  - tests/integration/planning-confirm.test.ts
  - tests/integration/planning-participant-integrity.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/planning-round.test.ts
  - tests/unit/planning-availability-card.test.ts
  - tests/unit/planning-keyboards.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/target-week.test.ts
findings:
  critical: 1
  warning: 7
  info: 3
  total: 11
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-09-06T20:26:18Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

Phase 3 adds the availability card, the per-participant answer transitions, the
`BOOKED` lifecycle position, the ready-to-book announcement and the manual
"Mark as booked" round trip. The exactly-once machinery the phase leans on is
genuinely correct where it is claimed to be: every `book-apply` / `book-keep`
consume is a `consumedAt IS NULL` compare-and-set asserting `count === 1`
(`planning-service.ts:2622-2632`, `:2552-2561`), the `CONFIRMED -> BOOKED`
write is guarded on `status` **and** `revision` with a `releaseAction` on the
lost race (`:2634-2657`), every booking refusal is a read that precedes the
consume (`openBookingGate`, `:2681-2743`), authorization is re-derived from
`PlanningRound.authorUserId` plus a role resolved at tap time and never from
the wire, and `answerAvailability` correctly moves the atomic gate from the
shared token to the `PlanningParticipant` row. `npm run typecheck` and
`npm run test:unit` (330 tests) both pass.

The defects cluster around the second message the phase introduced — the
announcement — and around capability lifetime. Three related problems:
(1) `/plan_status` re-posts the ready-to-book announcement as a **new group
message** gated only by the 60-second status cooldown, bypassing the 30-minute
`READY_ANNOUNCE_COOLDOWN_MS` that D-18 exists to enforce; (2) `mintTakeoverAction`
gained no status guard when D-03 widened `/plan_status` to non-draft rounds, so
it now mints unusable `PLANNING` capability rows on the phase's most open
command; (3) three sites re-mint what the plan calls "standing" capabilities
(`keepBooking`, and every post-cooldown re-announce), so the number of live
`book-request` rows grows without bound and `controlTokens` picks between them
non-deterministically. Separately, a lost `announcementMessageId` write leaves a
"Ready to book" message that no code path can ever retract or close.

There is no structural pre-pass in this review; all findings below are narrative.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: `/plan_status` re-announcement bypasses the 30-minute announcement cooldown

**Severity:** BLOCKER
**File:** `src/telegram/planning-handlers.ts:1514-1541`, `src/domain/planning/planning-service.ts:98-115`

**Issue:**
`READY_ANNOUNCE_COOLDOWN_MS` (30 min) is documented as the mechanism that stops
the band being notified repeatedly about the same slot: *"at one minute a
flip-flopping tap could notify the whole band repeatedly inside a single
conversation."* That guarantee is enforced only on the answer path, through
`claimAnnouncement`'s compare-and-set on `readyAnnouncedAt`.

`handlePlanStatusCommand` reaches the same group notification through a
completely different door:

```ts
const readyToBook =
  result.round.status === PlanningRoundStatus.CONFIRMED &&
  result.round.readyAnnouncedAt !== null &&
  projection?.outcome === "all-available";

await repostAnchor(..., { slot: readyToBook ? "announcement" : "anchor", ... });
```

`repostAnchor` with `slot: "announcement"` calls `ctx.reply(...)` — a **new**
message carrying the full "Ready to book … Time to book the rehearsal." copy
and the live `Mark as booked` control. `readyAnnouncedAt` is neither consulted
nor advanced on this path; the only gate is
`PLANNING_STATUS_COOLDOWN_MS` = 60 s, and D-15 opens `/plan_status` to **every
member of the chat**. Any band member can therefore re-notify the whole group
with the ready-to-book announcement once a minute, indefinitely, for as long as
the round stays unanimous. `tests/integration/planning-recovery.test.ts:1500`
asserts the re-post happens and asserts nothing about the announcement cooldown.

Secondary consequence on the same path: every re-post rewrites the previous
announcement's text via `clearSupersededCard` using the *new* card's body, so
the chat accumulates N identical "Ready to book" messages, all but the last
without buttons.

**Fix:** Consult (and, if a fresh notification is intended, claim) the
announcement cooldown before choosing the announcement slot. Either prefer an
in-place edit of `announcementMessageId` when the window has not elapsed, or
gate the slot choice on a service-level claim:

```ts
// planning-service.ts — new method, same compare-and-set shape as claimAnnouncement
async claimAnnouncementRepost(roundId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - READY_ANNOUNCE_COOLDOWN_MS);
  const claimed = await this.prisma.planningRound.updateMany({
    where: {
      id: roundId,
      status: PlanningRoundStatus.CONFIRMED,
      readyAnnouncedAt: { lte: cutoff },
    },
    data: { readyAnnouncedAt: now },
  });
  return claimed.count === 1;
}
```

```ts
// planning-handlers.ts
const readyToBook =
  result.round.status === PlanningRoundStatus.CONFIRMED &&
  result.round.readyAnnouncedAt !== null &&
  projection?.outcome === "all-available" &&
  (await deps.planning.claimAnnouncementRepost(result.round.id, now));
```

Inside the window the round then falls through to the ordinary
`slot: "anchor"` availability-card re-post, which is the quiet message
`/plan_status` is actually for.

### Warnings

#### WR-01: `mintTakeoverAction` has no round-status guard, so `/plan_status` mints dead `PLANNING` capability rows on confirmed and booked rounds

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:3234-3262`, `src/telegram/planning-handlers.ts:1501-1506`

**Issue:**
Before this phase, `status()` only ever returned a `DRAFT` round, so
`mintTakeoverAction` could only be reached with a draft. D-03 widened the read
to `RECOVERABLE_ROUND_STATUSES` (`DRAFT | CONFIRMED | BOOKED`) but
`mintTakeoverAction` still guards on only three things:

```ts
if (round.authorUserId === actorId) return undefined;
if (!isAdministratorRole(role)) return undefined;
if (!isTakeoverEligible(round, now)) return undefined;
```

`isTakeoverEligible` is `now - lastActivityAt >= 30 min`, which is true for
essentially every confirmed or booked round (an availability round runs for
days). So every `/plan_status` issued by a chat administrator who is not the
round's author now `INSERT`s a `CallbackAction` row with a `takeover` target for
a non-draft round — up to one per minute per chat, forever.

The row is unusable today (`takeover()` refuses `round.status !== DRAFT`, and
neither `PLANNING_AVAILABILITY_ROWS` nor `PLANNING_BOOKING_ROWS` contains a
takeover control, so `planningControlRows` drops it), which is why this is a
warning and not a blocker. It is still an unbounded write on the phase's most
open command, and it is one row-constant edit away from becoming a live
"take over a booked rehearsal" button. No test covers the non-draft case —
`grep -n takeover tests/integration/planning-recovery.test.ts` returns only the
draft-era assertions.

**Fix:** Add the status guard where the eligibility is decided, so the mint and
the transition agree:

```ts
async mintTakeoverAction(round, actorId, role, now) {
  // Takeover applies to the WIZARD only. D-03 widened /plan_status to confirmed
  // and booked rounds; those positions have no author to take over from.
  if (round.status !== PlanningRoundStatus.DRAFT) return undefined;
  if (round.authorUserId === actorId) return undefined;
  ...
}
```

#### WR-02: standing `book-request` capabilities are re-minted, not looked up, so live booking tokens grow without bound and the rendered control is non-deterministic

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:2560-2566` (`keepBooking`), `:2402-2404` (`answerAvailability`), `:1304-1345` (`loadAvailabilityActions`)

**Issue:**
The plan's stated invariant is that standing capabilities *"are looked up rather
than re-minted, because re-minting … is a capability-inflation vector"*, and
`loadAvailabilityActions` implements exactly that for the two answer tokens.
The `book-request` row is declared to be the same kind of standing capability
(`:1198-1216`: *"A STANDING capability, like the answer rows … it is never
consumed"*), but two paths mint a fresh one anyway:

- `keepBooking` returns `actions: [await this.mintBookingRequestAction(tx, gate.round, now)]` on **every** keep;
- `answerAvailability` mints one on **every** `post` directive, which fires again after each 30-minute cooldown window.

Neither path revokes, consumes or expires the previous row. A round that goes
through N request/keep cycles or N re-announcements ends up with N+1 live
`book-request` rows.

`loadAvailabilityActions` then reads them all with no `orderBy`, and
`controlTokens` collapses them with `tokens.set(action.target.action, action.token)`
— last row wins, from an unordered `findMany`. Consequences:

1. The token behind `Mark as booked` on a re-rendered announcement is whichever
   row PostgreSQL happened to return last, so two renders of an unchanged round
   can produce two different keyboards. That in turn defeats the
   `LAST_RENDER` no-op fingerprint (see WR-05) and turns `dispatchAnnouncement`'s
   `edit` directive into a real `editMessageText` where it was meant to be a
   no-op.
2. Stale, unconsumed booking capabilities remain valid for the whole round
   lifetime (`availabilityExpiresAt` = `endsAt + 24 h`), reachable by anyone who
   scraped the older message's `reply_markup`. Eligibility is still re-checked in
   `openBookingGate`, so this is not an escalation — but "how many live booking
   capabilities does this round have" becomes unanswerable, which is precisely
   the property the standing-capability design was defending.

**Fix:** Load rather than mint in both places, matching `loadAvailabilityActions`'
existing contract, and mint only when no live row exists:

```ts
private async ensureBookingRequestAction(
  tx: Prisma.TransactionClient,
  round: PlanningRound,
  now: Date,
): Promise<MintedPlanningAction> {
  const targetId = createPlanningTarget({ action: "book-request", roundId: round.id });
  const existing = await tx.callbackAction.findFirst({
    where: { chatId: round.chatId, kind: CallbackActionKind.PLANNING,
             targetId, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (existing !== null) return { token: existing.token, target: { action: "book-request", roundId: round.id } };
  return await this.mintBookingRequestAction(tx, round, now);
}
```

and call it from both `keepBooking` and the `announcement === "post"` branch.
Add an `orderBy` to `loadAvailabilityActions` regardless, so the token a render
picks is deterministic.

#### WR-03: a lost `announcementMessageId` write leaves a "Ready to book" message that nothing can ever retract or close

**Severity:** WARNING
**File:** `src/telegram/planning-handlers.ts:1846-1867`, `src/domain/planning/planning-service.ts:2248-2262`, `:2378-2396`

**Issue:**
`recordAnnouncement` is a post-transaction, post-network write with no
compensation:

```ts
const recorded = await deps.planning.recordAnnouncement(round.id, messageId, now);
if (recorded.kind !== "recorded") {
  // The message IS live; only the round's pointer to it is missing, so
  // nothing is rolled back and nothing else is sent.
  logPlanningFailure(...); return;
}
```

The comment is accurate about what happens, but not about the consequence.
Every correction path in the phase is guarded on `announcementMessageId !== null`:

- `claimAnnouncement` (`:2253-2260`) returns `"none"` instead of `"retract"` when the pointer is null;
- `retractStaleAnnouncement` (`planning-handlers.ts:2222`) returns immediately;
- `closeBookedRound` (`:2497`) skips the closing edit;
- `dispatchAnnouncement`'s `edit`/`retract` branch (`:1770`) returns immediately.

So a single failed `recordAnnouncement` produces a group message that
permanently asserts "Everyone who was asked can make it — Time to book the
rehearsal" with a live `Mark as booked` control, even after a participant flips
to *cannot attend* and even after the round is booked. That is threat T-03-27
reached from the recovery path rather than from the tap path. A tap on the
orphan's control also reaches `dispatchBookRequest`'s `offered` branch, which
skips its edit for the same null check and answers with a bare acknowledgement —
so the tapper sees nothing at all while a confirm/keep pair is minted behind
them.

The same null-pointer window exists (much more narrowly) between the answer
transaction committing and `recordAnnouncement` landing: `claimAnnouncement`
reads `round.announcementMessageId` from the pre-write snapshot rather than
re-reading it, so a *cannot attend* answer processed inside that window silently
skips the retraction. `sequentialize` by `chat.id` closes it for a single
process, but the surrounding comments claim statement-level guarantees
(*"`sequentialize` only narrows the window; the statement is the guarantee"*)
that this particular decision does not have.

**Fix:** Give the orphan a recovery path rather than leaving it uncorrectable.
Minimum: make `readyAnnouncedAt` releasable when the pointer could not be
recorded, so the next answer re-announces cleanly —

```ts
if (recorded.kind !== "recorded") {
  logPlanningFailure(...);
  // The claim bought the right to announce a message we can no longer address.
  // Release it so the next answer re-announces into a message we can correct.
  await deps.planning.releaseAnnouncementClaim(round.id, now);
  return;
}
```

and strip the orphan's markup with the existing `clearSupersededCard(ctx, deps,
context, "callback:PLANNING", messageId, card)` before returning, so it at least
stops being actionable. Better still, derive the retract/edit decision inside
`claimAnnouncement` from a re-read of the round row rather than from the
snapshot captured at the top of `answerAvailability`.

#### WR-04: `boundedLabel` budgets in code points against a Telegram limit counted in UTF-16 units

**Severity:** WARNING
**File:** `src/telegram/planning-handlers.ts:205-240`

**Issue:**

```ts
function boundedLabel(label: string, budget: number) {
  const points = [...label];
  if (points.length <= budget) return label;
  return `${points.slice(0, Math.max(0, budget - 1)).join("")}…`;
}
```

The surrogate-pair reasoning is right, but the *budget* is wrong. Telegram's
length limits (message text, and `answerCallbackQuery` text) are counted in
UTF-16 code units, not code points. `planningNotAuthorText` computes
`budget = 200 - 5 - 54 = 141` code points; `plainMemberLabel` can return up to
~165 code points (`first_name` 64 + space + `last_name` 64 + `" — @"` +
`username` 32), unescaped. A display name made of astral-plane glyphs therefore
produces up to 282 UTF-16 units of label, and an alert of ~341 units — well over
the 200 cap the module's own comment calls out as *"not a style rule: Telegram
REJECTS a longer alert with a 400, and a rejected answer is an unacknowledged
callback."*

Worse, `refuseNonAuthor`'s `answerCallbackQuery` is not wrapped in a try/catch,
so the `GrammyError` escapes to `bot.catch` and the bystander's tap is left
spinning. An author with an emoji-heavy display name breaks the refusal for
every other member of the chat.

`tests/unit/planning-availability-card.test.ts:687` holds this constant to the
cap, but measures with the same code-point metric, so the test cannot see it.

**Fix:** Truncate on code-point boundaries while measuring in UTF-16 units:

```ts
function boundedLabel(label: string, budget: number) {
  if (label.length <= budget) return label; // String#length IS the UTF-16 count
  const points = [...label];
  let used = 0;
  const kept: string[] = [];
  for (const point of points) {
    if (used + point.length > budget - 1) break; // reserve one unit for "…"
    kept.push(point);
    used += point.length;
  }
  return `${kept.join("")}…`;
}
```

and assert with `.length` (not `[...s].length`) in the unit test.

#### WR-05: the `ALREADY_APPLIED` acknowledgement and the `anchor-unchanged` / `ready-to-book-announced` log lines depend on process memory

**Severity:** WARNING
**File:** `src/telegram/planning-handlers.ts:918-998`, `:1026-1036`, `:1783-1800`

**Issue:**
`editRoundMessage` returns `"unchanged"` only on a `LAST_RENDER` cache **hit**.
On a cache miss for a card that is in fact identical, it issues the edit,
Telegram answers `message is not modified`, `isNotModified` absorbs it and the
function returns `"edited"`. The two branches then behave differently:

- `editAnchor` emits `outcome: "anchor-unchanged"` and the `"Already applied."`
  alert on `"unchanged"`, and stays silent on `"edited"`.
- `dispatchAnnouncement` logs `ready-to-book-announced` on `"edited"` and stays
  silent on `"unchanged"`.

`LAST_RENDER` is a process-global `Map` capped at 128 entries shared by every
chat, evicted FIFO (`rememberRender` re-`set`s an existing key without moving
it, so it is not LRU). So for identical durable inputs, whether the user sees
`"Already applied."` or a bare acknowledgement — and whether an operator sees an
`anchor-unchanged` or a `ready-to-book-announced` line — depends on how many
other chats have been active and on how recently the process restarted.

That undercuts the module's own contract: *"a deliberate no-op and a swallowed
failure must never look alike to an operator (finding F-4)"* and the
`planning-logging.test.ts` gate that asserts no two branches choose the same
answer. The gate holds statically; the runtime behaviour does not.

**Fix:** Derive "nothing changed" from the durable outcome rather than from the
cache. Keep `LAST_RENDER` strictly as a request-saving optimisation and let the
`isNotModified` catch report it honestly:

```ts
type RoundMessageEditResult = "edited" | "unchanged" | "failed";

// cache hit  -> "unchanged"
// not-modified from Telegram -> "unchanged"   (was: "edited")
} catch (error) {
  if (!isNotModified(error)) { ...; return "failed"; }
  rememberRender(key, fingerprint);
  return "unchanged";
}
```

Then both call sites behave identically whether or not the cache was warm.

#### WR-06: `requestBooking` mints a fresh confirm/keep pair on every tap and never revokes the previous one

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:2461-2492`, `:1258-1280`

**Issue:**
`requestBooking` deliberately does not consume the `book-request` row (correct —
it is a standing capability), but it also does nothing about a confirmation that
is already open. Every tap calls `mintBookingConfirmationActions`, writing two
new `CallbackAction` rows with a 30-minute lifetime, and edits the announcement
to a keyboard bearing the new tokens. The previous pair stays unconsumed and
valid but unreachable from screen.

An author or administrator tapping `Mark as booked` in a loop therefore writes
2 rows and issues 1 `editMessageText` per tap (the fingerprint cache cannot
suppress it — the tokens differ every time), which is exactly the flood-control
pressure `PLANNING_CATCH_SITES.deliveryFlood` documents wanting to avoid. It
also leaves a growing set of live `book-apply` tokens that are no longer
displayed anywhere.

The eligible set is author + administrators, so this is not an unprivileged
abuse vector — but it is unbounded write amplification triggered by an ordinary
double-tap on a button labelled with an irreversible action.

**Fix:** Reuse a live confirmation pair when one exists for the round, or expire
the previous pair in the same transaction:

```ts
await tx.callbackAction.updateMany({
  where: {
    chatId: round.chatId,
    kind: CallbackActionKind.PLANNING,
    targetId: { in: [
      createPlanningTarget({ action: "book-apply", roundId: round.id }),
      createPlanningTarget({ action: "book-keep",  roundId: round.id }),
    ] },
    consumedAt: null,
  },
  data: { expiresAt: now },
});
const actions = await this.mintBookingConfirmationActions(tx, round, now);
```

#### WR-07: `hasExactDefinitions` matches by existence, so duplicate catalog entries can pass the migration preflight

**Severity:** WARNING
**File:** `prisma/migrate-deploy.mjs:787-802`

**Issue:**

```js
function hasExactDefinitions(actual, expected, normalize) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every(([name, typeOrDefinition, maybeDefinition]) =>
      actual.some((entry) => { ... })
    )
  );
}
```

The check is "same cardinality, and every expected entry matches *some* actual
entry". If the live catalog contains a duplicate of one expected entry plus one
entry that matches nothing expected, the length check still passes and the
unexpected object is never surfaced — the preflight would report a clean
baseline for a schema carrying an extra constraint or index. Given this script's
whole purpose is to refuse to migrate an inconsistent database, a set-equality
check is what the assertion needs.

**Fix:** Match each expected entry to a distinct actual entry, and fail on any
leftover:

```js
function hasExactDefinitions(actual, expected, normalize) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  const remaining = [...actual];
  for (const [name, typeOrDefinition, maybeDefinition] of expected) {
    const expectedDefinition = maybeDefinition ?? typeOrDefinition;
    const index = remaining.findIndex(
      (entry) =>
        entry.name === name &&
        (maybeDefinition === undefined || entry.type === typeOrDefinition) &&
        normalize(entry.definition) === normalize(expectedDefinition),
    );
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}
```

### Info

#### IN-01: unreachable ternary branch in the migration catalog's enum expectation

**Severity:** INFO
**File:** `prisma/migrate-deploy.mjs:761-767`

`PlanningRoundStatus` is derived as
`integrityApplied ? (availabilityApplied ? [...BOOKED] : [...]) : ["DRAFT","CONFIRMED","ABANDONED","SUPERSEDED"]`.
Because migrations apply in lexicographic order, `availabilityApplied`
(`20260905…`) implies `integrityApplied` (`20260902…`), so the
`!integrityApplied && availabilityApplied` combination is unreachable and the
nested ternary encodes a state that cannot exist. A flat lookup keyed on the
latest applied migration would say the same thing without the dead branch, and
would not silently produce a wrong expectation if a future migration is inserted
out of order.

#### IN-02: `recordAnnouncement` takes an injected clock it never uses

**Severity:** INFO
**File:** `src/domain/planning/planning-service.ts:2264-2280`

`async recordAnnouncement(roundId, messageId, _now: Date)` accepts and discards
the clock. The doc comment explains this as future-proofing, which is a
reasonable call, but it means the parameter is untestable and every caller pays
a `deps.now()` for nothing. Either write a timestamp (the sibling
`reanchorAnnouncement` writes `lastStatusPostedAt: now` and this one does not,
so the two announcement-recording paths already leave different traces), or drop
the parameter until a column needs it.

#### IN-03: `logPlanningFailure` synthesises `new Error("Anchor not recorded: …")` to reach the `err` binding

**Severity:** INFO
**File:** `src/telegram/planning-handlers.ts:1218-1236`, `:1377-1395`, `:1849-1861`

Three sites construct a throwaway `Error` purely so a non-exception outcome can
travel under the `err` key the redactor renders. It works, but it puts a
synthetic stack in the log and makes `err.name === "Error"` meaningless for
these lines. A dedicated bounded `reason` (the module already has a rich reason
vocabulary) would carry the same information without pretending an exception
occurred.

---

_Reviewed: 2026-09-06T20:26:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
