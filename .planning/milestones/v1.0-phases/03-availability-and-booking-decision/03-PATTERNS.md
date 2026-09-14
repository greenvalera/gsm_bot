# Phase 3: Availability and Booking Decision - Pattern Map

**Mapped:** 2026-09-05
**Files analyzed:** 16 (2 new source, 9 modified source, 1 new migration, 4 test groups)
**Analogs found:** 16 / 16

Phase 3 introduces **no new file kind**. Every file below either already exists
or has an exact in-repo analog shipped by Phase 1 or Phase 2. The default
instruction for the planner is **extend the named analog in place**, not invent a
new module. Where RESEARCH.md names a hardened defect (F-1/F-2 shared tokens,
F-7 status-filter ripple, Pitfalls 1/2/5/6/9/10), the analog below is the
*repaired* shape — re-deriving it re-introduces the defect.

Every line number was read from source this session.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `prisma/schema.prisma` | modified | model | CRUD | `PlanningRound` / `PlanningParticipant` / `PlanningRoundStatus`, same file | exact |
| `prisma/migrations/2026xxxx_availability/migration.sql` | new | migration | batch | `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql` | role-match (see note: this one is additive-only, so it needs *no* LOCK/DO block) |
| `prisma/migrate-deploy.mjs` | modified | config | batch | its own `INTEGRITY_MIGRATION` / `integrityApplied` gating, same file | exact (self) |
| `src/domain/planning/target-week.ts` | modified | utility | transform | `WEEK_CLAIMING_STATUSES`, same file (lines 26-28) | exact (self) |
| `src/domain/planning/planning-service.ts` — `mintAvailabilityActions` | modified | service | CRUD | `mintStepActions` (:699-729) + `mintTakeoverAction` (:1920-1950) | exact |
| `src/domain/planning/planning-service.ts` — `confirm` extension | modified | service | CRUD | `confirm` itself (:1340-1520) | exact (self) |
| `src/domain/planning/planning-service.ts` — `answerAvailability` | modified | service | CRUD | `confirm`'s transaction skeleton (:1348-1362) + `status`'s compare-and-set claim (:1783-1796) | role-match (the participant-row gate is new; the *shape* is the claim) |
| `src/domain/planning/planning-service.ts` — `requestBooking` / `applyBooking` | modified | service | CRUD | `confirm` (token consume + revision-guarded `updateMany` + `releaseAction`) and `takeover`'s role thunk | exact |
| `src/domain/planning/planning-service.ts` — `availabilityStepProjection` | modified | service | transform | `reviewStepProjection` (:886-909) / `ReviewStepProjection` (:499-515) | exact |
| `src/domain/planning/planning-service.ts` — F-7 status filters | modified | service | CRUD | the five literals at :786, :809, :949, :1774, :1887 | exact (self) |
| `src/shared/callback-schema.ts` | modified | utility | transform | `planningTargetSchema` back/confirm/takeover member (:105-110) | exact (self) |
| `src/telegram/keyboards.ts` | modified | component | transform | `PLANNING_MARKER_*` (:161-170), `PLANNING_REVIEW_ROWS` (:196-201), `planningControlRows` (:224-246) | exact (self) |
| `src/telegram/planning-renderers.ts` | modified | component | transform | `renderReviewStep` (:375-409) + `renderConfirmedStep` (:420-437) + `lineupLines` (:354-356) | exact |
| `src/telegram/planning-handlers.ts` | modified | controller | event-driven | `dispatchConfirm` (:1147-1246), `dispatchTakeover` (:1267-…), `editAnchor` (:569-620), `repostAnchor` (:715-…) | exact |
| `tests/unit/planning-availability-card.test.ts` | new | test | — | `tests/unit/planning-day-card.test.ts` / `planning-time-card.test.ts` | exact |
| `tests/integration/planning-availability.test.ts`, `planning-booking.test.ts` | new | test | — | `tests/integration/planning-confirm.test.ts` + `tests/helpers/racing-client.ts` | exact |
| `tests/unit/planning-logging.test.ts` (`BRANCHES`), `tests/integration/migration-preflight.test.ts` (`TARGET_MIGRATION`) | modified | test | — | themselves | exact (self) |

**No new route id.** `callback:PLANNING` in `src/telegram/handlers.ts:82-94` already
covers every Phase 3 button; the `CallbackActionKind` enum needs **no** new member
either — every new action rides `CallbackActionKind.PLANNING` and is distinguished
by `targetId`. (`registerCallbackBoundary` is `exhaustive: true`; a second
registration would never run — `src/telegram/callbacks.ts:523-548`.)

---

## Pattern Assignments

### `prisma/schema.prisma` (model, CRUD)

**Analog:** the planning models already in the file.

Copy verbatim: `BigInt` + `@map("snake_case")` for ids, `@db.Timestamptz(3)` on
every instant, `revision Int` untouched on `PlanningRound`, `@@map` to a
snake_case plural table.

Two hard constraints from the analogs:

1. **Append `BOOKED` LAST** in the `PlanningRoundStatus` block. The preflight
   compares enum labels *in order* (below), and PostgreSQL appends a new label
   at the end.
2. **Every new column is nullable with no default**, so the generated SQL never
   references the `'BOOKED'` literal (Pitfall 1). `PlanningParticipant` has no
   `revision`/`createdAt`/`updatedAt` — do not add one; the compare-and-set is
   on the value.

After the edit run `npm run db:generate` in the same task — `src/generated/prisma/**`
is committed and the compiler cannot see the enum value otherwise.

---

### `prisma/migrations/…/migration.sql` (migration, batch)

**Analog:** `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`

That file opens with an explicit `BEGIN;`, a `LOCK TABLE … IN SHARE ROW EXCLUSIVE
MODE`, and authoritative `DO $$ … RAISE EXCEPTION USING ERRCODE = '23514'` data
checks:

```sql
BEGIN;

LOCK TABLE "planning_rounds", "planning_participants", "chat_memberships"
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "planning_rounds" WHERE "status"::text = 'ABANDONED'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Planning participant integrity migration blocked by legacy round state';
  END IF;
```

**Copy the ceremony only if the migration is destructive.** Phase 3's is purely
additive (one `CREATE TYPE`, one `ALTER TYPE … ADD VALUE`, four/two nullable
`ADD COLUMN`s), so it needs **no** lock and **no** blocking check — and it must
contain no `'BOOKED'` string literal anywhere. What to copy is the *decision
rule*: a migration that could invalidate inherited rows gets the lock + `DO`
block; one that cannot, does not.

---

### `prisma/migrate-deploy.mjs` (config, batch)

**Analog:** the `INTEGRITY_MIGRATION` gating already in the same file.

**Constant + flag pattern** (:11-18, :438-443):

```javascript
const PLANNING_MIGRATION = "20260831100411_planning_rounds";
const INTEGRITY_MIGRATION = "20260902152000_planning_participant_integrity";
...
  const planningApplied = migrationNames.includes(PLANNING_MIGRATION);
  const integrityApplied = migrationNames.includes(INTEGRITY_MIGRATION);
  const participantColumns = integrityApplied
    ? [...BASE_PARTICIPANT_COLUMNS, ["chat_id", "bigint", true, null]]
    : BASE_PARTICIPANT_COLUMNS;
```

Add `const AVAILABILITY_MIGRATION = "…";` and `const availabilityApplied = …`,
then extend the same three places:

**Gated enum catalog** (:734-741) — the order-sensitive list:

```javascript
    ...(planningApplied
      ? {
          PlanningRoundStatus: integrityApplied
            ? ["DRAFT", "CONFIRMED", "SUPERSEDED"]
            : ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"],
          PlanningStep: ["DAY", "TIME", "REVIEW"],
        }
      : {}),
```

Becomes a further nesting on `availabilityApplied` (`…, "BOOKED"`), plus a new
`ParticipantAvailability: ["AVAILABLE", "UNAVAILABLE"]` entry behind the same
flag. The order-sensitivity is real (:281-287):

```javascript
function hasExactValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
```

**Column catalog** (:95-124) — the tuple shape is `[name, type, notNull, default]`:

```javascript
const PLANNING_ROUND_COLUMNS = [
  ["id", "text", true, null],
  ["chat_id", "bigint", true, null],
  ["status", '"PlanningRoundStatus"', true, `'DRAFT'::"PlanningRoundStatus"`],
  ["last_status_posted_at", "timestamp(3) with time zone", false, null],
  ["revision", "integer", true, "1"],
];
const BASE_PARTICIPANT_COLUMNS = [
  ["id", "text", true, null],
  ["round_id", "text", true, null],
  ["telegram_user_id", "bigint", true, null],
  ["membership_id", "text", true, null],
];
```

New columns must be added *behind the flag*, exactly the way `participantColumns`
conditionally appends `chat_id`, so a pre-migration database still passes.

Then bump `TARGET_MIGRATION` in `tests/integration/migration-preflight.test.ts:14`
and add pre-/post-migration cases modelled on
`"checks a clean inherited database before applying the pending integrity migration"`
(:849) which uses `exclusiveCutoff: TARGET_MIGRATION`.

---

### `src/domain/planning/target-week.ts` (utility, transform)

**Analog:** itself. This is a two-line edit and the comment already names Phase 4
as the next editor — Phase 3 gets there first.

```typescript
export const WEEK_CLAIMING_STATUSES: readonly PlanningRoundStatus[] = [
  PlanningRoundStatus.CONFIRMED,
];
```
(:26-28)

`weekIsClaimed` (:29-38) already consults the constant; **nothing else in this
file changes.** The work is in `planning-service.ts` (below), where four queries
bypass the constant with a hard-coded literal.

---

### `src/domain/planning/planning-service.ts` — token minting (service, CRUD)

**Analog:** `mintStepActions` (:699-729) for the `createMany` shape,
`mintTakeoverAction` (:1920-1950) for a mint that is *not* part of the step set.

```typescript
  async mintStepActions(
    tx: Prisma.TransactionClient,
    round: PlanningRound,
    now: Date,
  ): Promise<readonly MintedPlanningAction[]> {
    const minted = this.stepTargets(round).map((target) => ({
      token: createCallbackToken(),
      target,
    }));
    if (minted.length === 0) return minted;
    await tx.callbackAction.createMany({
      data: minted.map((action) => ({
        token: action.token,
        kind: CallbackActionKind.PLANNING,
        chatId: round.chatId,
        actorUserId: round.authorUserId,
        targetId: createPlanningTarget(action.target),
        expiresAt: actionExpiresAt(now),
      })),
    });
    return minted;
  }
```

Copy this **exactly**, with two deliberate departures the planner must comment on
in code:

1. `expiresAt: availabilityExpiresAt(round, now)` instead of `actionExpiresAt(now)`
   — `actionExpiresAt` (:618-620) is `now + PLANNING_ACTION_LIFETIME_MS` and
   `PLANNING_ACTION_LIFETIME_MS = 30 * 60 * 1000` (:60) would kill the buttons
   long before the rehearsal (Pitfall 6).
2. `actorUserId: round.authorUserId` is retained *as a placeholder only* — the
   column is NOT NULL and the boundary never compares it on this route.

**Also copy `stepTargets`' branch discipline** (:662-698): it currently falls
through DAY/TIME into the REVIEW branch. A `CONFIRMED` round reaching it mints a
`confirm` + `back` pair for a round that has neither — branch on **status before
step**.

---

### `src/domain/planning/planning-service.ts` — the answer transition (service, CRUD)

**Analog for the transaction skeleton:** `confirm` (:1348-1362).

```typescript
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.PLANNING ||
          action.chatId !== chatId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parsePlanningTarget(action.targetId);
        if (!target.success || target.data.action !== "confirm")
          return { kind: "stale" };
```

Copy every line **except** `if (action.consumedAt !== null) return { kind: "duplicate" }`
and the consume/release pair — the answer token is a standing capability
(RESEARCH F-1/F-2). Keep the `catch (error) { return { kind: "failed", error }; }`
wrapper verbatim (:1517-1519): a caught value that never reaches the surface is
unloggable, since only `err` is rendered structurally.

**Analog for the compare-and-set gate:** `status`'s cooldown claim (:1783-1796) —
this is the *exact* shape the participant gate and the `readyAnnouncedAt` claim
both copy:

```typescript
        const cutoff = new Date(now.getTime() - PLANNING_STATUS_COOLDOWN_MS);
        const claimed = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            status: PlanningRoundStatus.DRAFT,
            OR: [
              { lastStatusPostedAt: null },
              { lastStatusPostedAt: { lte: cutoff } },
            ],
          },
          data: { lastStatusPostedAt: now },
        });
        if (claimed.count !== 1) return { kind: "cooling-down", round };
```

Note the `OR: [{ … : null }, { … }]` form is **already the house style** for a
nullable-column predicate — Pitfall 5's recommended
`OR: [{ availability: null }, { availability: { not: answer } }]` is not a new
invention, it is this line.

Its doc comment (:1737-1750) carries the rationale to reuse verbatim for
`readyAnnouncedAt`: *"the cooldown lives in the WHERE clause rather than in an
`if` above it, so two concurrent transactions cannot both observe a clear
window"*, and *"a Telegram outage cannot be used as a flood amplifier: the claim
is durable even when the send that follows it fails."*

**Do NOT copy the revision guard** from `confirm` (:1465-1478) into the answer
path — copy it into **booking** instead (next section).

---

### `src/domain/planning/planning-service.ts` — booking (service, CRUD)

**Analog:** `confirm`'s consume-then-guard pair, verbatim (:1451-1483):

```typescript
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        // The idempotency AND concurrency guarantee, in one statement: a single
        // atomic compare-and-set at the database, not an application-level
        // check-then-act. Two simultaneous taps both reach here; exactly one
        // sees `count === 1`.
        if (consumed.count !== 1) return { kind: "duplicate" };

        const promoted = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            revision: expectedRevision ?? round.revision,
            status: PlanningRoundStatus.DRAFT,
          },
          data: {
            status: PlanningRoundStatus.CONFIRMED,
            activeWeekStart: null,
            confirmedAt: now,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (promoted.count !== 1) {
          // The guarded write lost, so the earlier consume must not survive.
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }
```

`book-apply` is `status: CONFIRMED → BOOKED` in the identical shape, including
the `releaseAction` on the lost race (`releaseAction` is at :731; its doc comment
states releasing after a *successful* write would resurrect a spent action).

**Analog for the fresh-role check (D-13):** `dispatchTakeover`'s thunk
(`planning-handlers.ts:1276-1285`):

```typescript
  const result = await deps.planning.takeover(
    context.chatId,
    context.actorId,
    action.token,
    null,
    now,
    () => deps.authorization.currentRole(context.chatId, context.actorId),
  );
```

Copy the thunk form exactly — the role is resolved at tap time, outside the
transaction, through the **non-destructive** `currentRole`. Its doc comment
(:1258-1266) names the reason: the administrator-requirement helper deletes the
actor's setup and settings drafts on denial (threat T-02-14).

**Analog for the request/confirm/keep triple:** `rosterRemovalConfirmationKeyboard`
(`keyboards.ts:338-345`) plus `rosterRemovalTargetSchema`'s
`action: z.enum(["request", "confirm", "keep"])` (`callback-schema.ts:70-76`).

---

### `src/domain/planning/planning-service.ts` — the projection (service, transform)

**Analog:** `ReviewStepProjection` (:499-515).

```typescript
export type ReviewStepProjection = Readonly<{
  selectedDate: string;
  startMinute: MinuteOfDay;
  durationMinutes: number;
  members: readonly RosterMember[];
  /**
   * Who owns the round right now, for the card's attribution line (D-02/D-13).
   * Optional on the projection TYPE only so a focused unit fixture can build a
   * projection without an identity read; every production path populates it
   * from `PlanningRound.authorUserId` …
   */
  owner?: TelegramIdentity;
}>;
```

Copy: `Readonly<{…}>`, civil `selectedDate: string` (never an instant),
`startMinute: MinuteOfDay`, the optional `owner?` with the same
"optional-for-fixtures-only" comment. `AvailabilityStepProjection` adds
`participants`, `answeredCount`, `totalCount`, and the single derived `outcome`.

The marker-union precedent is `DayMarker` (:215) — **one value per cell, never a
set of flags** — with the comment stating the reason: *"so the D-08 tie rule is
structural: there is nowhere to put a second marker even if a later edit wanted
one."* `ParticipantMarker` copies that.

---

### `src/domain/planning/planning-service.ts` — the F-7 status filters (service, CRUD)

**Analog:** itself. Five literals, four of which must widen:

```typescript
        status: PlanningRoundStatus.CONFIRMED,                       // :786  previousRehearsal
        round: { chatId, status: PlanningRoundStatus.CONFIRMED },    // :809  wasPreviousParticipant
          where: { chatId, status: PlanningRoundStatus.CONFIRMED },  // :949  startOrResume claiming read
          where: { chatId, status: PlanningRoundStatus.DRAFT },      // :1774 status()
          status: PlanningRoundStatus.DRAFT,                         // :1887 reanchor()
```

The first three become `{ in: WEEK_CLAIMING_STATUSES }`. The last two (`status()`
and `reanchor()`) must widen to admit `CONFIRMED`/`BOOKED` or D-03's recovery
path is unreachable. `:809`'s is an **authorization** filter
(`PREVIOUS_PARTICIPANTS`, AUTH-01) — leaving it is a security regression, not a
cosmetic one.

`reanchor`'s doc comment (:1858-1874) explains the `refreshActivity` seam and why
`status` is part of its compare-and-set; carry both properties when widening.

---

### `src/shared/callback-schema.ts` (utility, transform)

**Analog:** the member directly above the new ones (:105-110).

```typescript
  z
    .object({
      action: z.enum(["back", "confirm", "takeover"]),
      roundId: z.string().min(1),
    })
    .strict(),
```

Copy: `.strict()` on every member, `roundId: z.string().min(1)`, values as
`z.enum` of literal strings, and **no** identity/date/authorization claim on the
wire. The header comment (:85-90) states the rule and must be extended to name
the new minting sites, since the vocabulary is *derived from* them.
`createPlanningTarget`/`parsePlanningTarget` (:174-190) need no change — the
try/catch-around-`JSON.parse` shape already covers the widened union.

---

### `src/telegram/keyboards.ts` (component, transform)

**Analog:** the planning marker constants (:161-170) and `PLANNING_REVIEW_ROWS`
(:196-201).

```typescript
export const PLANNING_MARKER_DEFAULT = "⭐";
export const PLANNING_MARKER_PREVIOUS = "🔁";
export const PLANNING_MARKER_UNAVAILABLE = "🚫";
export const PLANNING_MARKER_CHOSEN = "✅";

export const PLANNING_REVIEW_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_CONFIRM_LABEL, action: "confirm" }],
    [{ text: PLANNING_BACK_LABEL, action: "back" }],
  ];
```

Copy: **leading glyphs, never word suffixes** (finding F-9 — Telegram sizes
buttons by row width and drops the label tail first); **one control per row** for
the same reason; rows declared as *data* so a unit test can assert the serialized
shape.

`PlanningControlAction = "back" | "confirm" | "takeover"` (:179) widens with the
answer and booking actions, and `planningControlRows` (:224-246) is reused
unchanged — its **drop-an-unminted-control** behaviour is exactly what renders a
booked, control-free card:

```typescript
      const token = tokenFor(button.action);
      if (token === undefined) continue;
```

Do not add a "disabled button" concept; absence of a minted token *is* the
mechanism.

---

### `src/telegram/planning-renderers.ts` (component, transform)

**Analog:** `renderReviewStep` (:375-409) for structure, `renderConfirmedStep`
(:420-437) for the header D-02 folds in, `lineupLines` (:354-356) for the list.

**The list line — reuse, never re-derive** (:354-356):

```typescript
function lineupLines(members: readonly RosterMember[]) {
  return sortRosterMembers(members).map((member) => `• ${memberLabel(member)}`);
}
```

Its doc comment is the D-08/D-10 rule verbatim: `sortRosterMembers` carries the
`Intl.Collator` order, `memberLabel` carries the `Telegram user ••••NNNN` mask
(T-01-21) **and already escapes** — escaping again renders `&amp;amp;`. The
availability line is this function plus a leading marker glyph.

**Header + body assembly** (:390-401):

```typescript
  const lines = [
    `<b>Confirm the rehearsal — ${dayHeadingLabel(parseCivilDate(projection.selectedDate))}</b>`,
    `Start ${formatLocalTime(projection.startMinute)} · ${projection.durationMinutes} minutes.`,
    "",
    lineupHeading,
    ...members,
    "",
    availabilitySentence,
  ];
  if (projection.owner !== undefined) {
    lines.push(planningOwnerLine(projection.owner));
  }
```

Copy: the civil-pair heading (`dayHeadingLabel(parseCivilDate(...))` +
`formatLocalTime(...)`, **never an instant** — DST policy rule 5), the
`lines.join("\n")` return, and the conditional owner line.

**Legend pattern** (:96-118, :144-148, :183-191) — copy all three pieces:

```typescript
export const PLANNING_DAY_LEGEND: Readonly<
  Record<Exclude<DayMarker, "none">, string>
> = {
  default: `${PLANNING_MARKER_DEFAULT} usual day`,
  previous: `${PLANNING_MARKER_PREVIOUS} last rehearsal`,
  past: `${PLANNING_MARKER_UNAVAILABLE} already past`,
};

/** Fixed legend order, so the line does not reshuffle between renders. */
const LEGEND_ORDER: readonly Exclude<DayMarker, "none">[] = [...];

function legendLine(entries: readonly string[], chosen: boolean) {
  const all = chosen ? [...entries, PLANNING_CHOSEN_LEGEND] : entries;
  return all.length === 0 ? null : all.join("   ·   ");
}

function legendFor(projection: DayStepProjection): string | null {
  const used = new Set(projection.days.map((day) => day.marker));
  return legendLine(
    LEGEND_ORDER.filter((marker) => used.has(marker)).map(...),
    ...,
  );
}
```

The "advertise only the markers actually used" rule and the fixed order are both
D-08 requirements already implemented here.

**Module contract to preserve** (:40-47): *"Pure planning card text. No I/O, no
token minting, no clock — the same inputs always render the same bytes, which is
what makes the Pitfall 3 'is this edit a no-op' comparison meaningful."* The
availability renderer must stay a total function of its projection.

**Deprecated line to move or delete:** `renderConfirmedStep` ends with
`"The availability round is next."` (:431). D-02 makes it false; the unit
assertions on that copy move with it.

---

### `src/telegram/planning-handlers.ts` (controller, event-driven)

**Analog:** `dispatchConfirm` (:1147-1246) — the closed-result-union fan-out
every new branch copies.

```typescript
  if (result.kind === "duplicate") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "duplicate-tap",
      roundId,
      "confirm-already-applied",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "not-author") {
    await refuseNonAuthor(ctx, deps, context, result.owner, roundId);
    return;
  }
  if (result.kind === "failed") {
    // The caught value travelled out of the transaction so it can be bound
    // under `err` here — the only key the redactor renders structurally.
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.confirm,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
    return;
  }
  logPlanning(deps, "callback:PLANNING", context, "stale-action", roundId,
    "confirm-target-no-longer-actionable");
  await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
```

Copy exactly: **one `logPlanning` + one `answerCallbackQuery` per branch, from
the branch that owns the outcome** (never up front — finding F-3), a trailing
unguarded stale fallthrough, and `show_alert: true`.

**Refusal-alert analog for D-07/D-13** — `refuseNonAuthor` (:428-447) and its
text builder (:149-151):

```typescript
export function planningNotAuthorText(owner: TelegramIdentity) {
  return `Only ${plainMemberLabel(owner)} can use this card's buttons — they started this plan.`;
}
```

`plainMemberLabel`, not `memberLabel`: callback alerts are plain text. Its comment
also carries the critical structural rule — the refusal performs **no
`editMessageText` at all**, because nothing durable changed and re-rendering
would spend the author's card on a stranger's mistake. D-07's non-participant
refusal copies that exactly.

**Dispatcher fan-out** (:1372-1412):

```typescript
  const target = parsePlanningTarget(action.targetId);
  if (!target.success) { … "unparseable-planning-target" … }
  if (target.data.action === "back") { await dispatchBack(…); return; }
  if (target.data.action === "confirm") { await dispatchConfirm(…); return; }
  if (target.data.action === "takeover") { await dispatchTakeover(…); return; }
```

New actions get one `if` each, in the same early-return style, above the
day/time tail.

**Edit path** — `editAnchor` (:569-620). Reuse it; do not write a second edit
helper. It already owns the fingerprint skip, the not-modified absorption and
the delivery catch site:

```typescript
  const key = `${round.chatId.toString()}:${round.anchorMessageId}`;
  const fingerprint = JSON.stringify({ text: card.text, reply_markup: card.keyboard });
  if (LAST_RENDER.get(key) === fingerprint) { … "rendered-card-already-matches" … }
  try {
    await ctx.api.editMessageText(
      context.chatId.toString(), round.anchorMessageId, card.text,
      { parse_mode: "HTML", ...markupOf(card) },
    );
    rememberRender(key, fingerprint);
  } catch (error) {
    if (!isNotModified(error)) {
      logPlanningFailure(deps, PLANNING_CATCH_SITES.delivery, "callback:PLANNING", context, error);
      return;
    }
    rememberRender(key, fingerprint);
  }
```

`markupOf` (:456-459) is the `exactOptionalPropertyTypes` shape — spread `{}`,
never `reply_markup: undefined`; omitting it is how the booked card drops its
buttons. Any 429 classification goes **beside `isNotModified`** (:535-541) and
into `PLANNING_CATCH_SITES.delivery`'s family — classify and absorb, never retry
inside a `sequentialize`d handler.

**Control-free re-render analog:** `clearSupersededCard` (:668-701) shows the
edit-without-`reply_markup` call and the absorb-with-its-own-catch-site pattern.
Note Pitfall 7: it must **not** be applied to the availability card when the
anchor moves to the announcement.

**Bounded vocabularies** (:239-266 outcomes, :278-356 reasons). Every new branch
needs a new entry in both plus an entry in the `BRANCHES` array of
`tests/unit/planning-logging.test.ts:488`. Copy the existing per-control naming
discipline, stated in the file:

```typescript
  // --- deliberate no-ops, ONE reason per control so two dead buttons never
  //     look alike to an operator
  "selection-already-applied",
  "back-already-applied",
  "confirm-already-applied",
  "takeover-already-applied",
```

Catch-site pattern (:172-224) — one entry per absorbed failure, each an
`{ outcome, reason }` pair:

```typescript
  /** The confirm transaction itself threw; the round was NOT promoted. */
  confirm: { outcome: "confirm-failed", reason: "confirm-transaction-threw" },
```

**Log-field constraint:** `logPlanning` (:392-411) emits only
`event/route/chatId/actorId/outcome/roundId/reason`. There is no
`telegramUserId`, `participantId` or `answeredCount` on the redactor's allow list
(`src/shared/logger.ts:21-50`) — express counts as `count` or omit them.

---

### Tests

**`tests/unit/planning-availability-card.test.ts`** — analog
`tests/unit/planning-day-card.test.ts` / `planning-time-card.test.ts`: build a
projection fixture by hand (that is why `owner?` is optional), assert on the
rendered text and on the *serialized* keyboard shape, and hold labels to the
24-visible-character rule. Add the ≤200-character assertion over every exported
refusal constant (Pitfall 8).

**`tests/integration/planning-availability.test.ts` / `planning-booking.test.ts`** —
analog `tests/integration/planning-confirm.test.ts`, with
`tests/helpers/racing-client.ts`'s `withPlanningRoundInterference(prisma, interfere)`
for the two-concurrent-final-answers case. Its doc comment states the contract:
one committed write interposed immediately before a transaction's first guarded
planning-round update, firing at most once per wrapper. `sequentialize` hides
this class of defect in a single-process unit test — the racing client is the
only thing that catches it.

**`tests/unit/planning-logging.test.ts`** — extend `BRANCHES` (:488-493):

```typescript
const BRANCHES: readonly Readonly<{
  name: string;
  outcome: string;
  reason?: string;
  run: () => Promise<Run>;
}>[] = [
  {
    name: "a day tap that advances the round",
    outcome: "day-selected",
    run: () => driveCallback({ round: createRound(…), target: {…} }),
  },
```

The gate asserts `BRANCHES.length >= 10`, ≥3 members in each of the
`duplicate-tap` / `stale-action` / `select-failed` families, and **exactly one**
matching line per branch (:848-879).

---

## Shared Patterns

### Callback boundary — what it does and does NOT check

**Source:** `src/telegram/callbacks.ts:406-437`, `:503-516`
**Apply to:** every new Phase 3 callback branch

```typescript
        // A route-resolved kind still requires the actor to be in the chat.
        // `left`, `kicked` and an unrefreshable `unknown` all fail closed here,
        // before the dispatcher sees the update.
        if (!isCurrentMember(role)) { … }
      }

      const now = deps.now();
      if (
        action.chatId !== context.chatId ||
        action.expiresAt <= now ||
        (route.actorBinding === "strict" &&
          action.actorUserId !== context.actorId)
      ) { … route.staleText … }
```

```typescript
export function planningCallbackRoute(deps: PlanningHandlerDependencies) {
  return {
    staleText: PLANNING_STALE_TEXT,
    nonMemberText: PLANNING_NON_MEMBER_DENIAL,
    authority: "route-resolved",
    actorBinding: "route-resolved",
```

Two consequences the planner must state in the plan:

1. `actorBinding: "route-resolved"` means the actor comparison is **skipped** —
   a shared answer token is already dispatchable today. No route change needed.
2. The boundary enforces chat membership, **not** snapshot membership. AVAIL-03
   is a fact only the dispatcher can check (Pitfall 4). It also refuses
   `expiresAt <= now` *before* the dispatcher runs — which is why the answer
   token lifetime must be round-derived.

### Identity rendering

**Source:** `src/telegram/roster-renderers.ts:39-77`
**Apply to:** every card line and every callback alert in this phase

```typescript
export function plainMemberLabel(member: RosterIdentity): string { … 
  return `Telegram user ••••${member.telegramUserId.toString().slice(-4)}`;
}
export function memberLabel(member: RosterIdentity) {
  return escapeHtml(plainMemberLabel(member));
}
export function sortRosterMembers<T extends RosterIdentity>(members: readonly T[]): T[] {
  return [...members].sort((left, right) => {
    const byLabel = LABEL_COLLATOR.compare(memberLabel(left), memberLabel(right));
    if (byLabel !== 0) return byLabel;
    if (left.telegramUserId === right.telegramUserId) return 0;
    return left.telegramUserId < right.telegramUserId ? -1 : 1;
  });
}
```

`memberLabel` for HTML card text, `plainMemberLabel` for `answerCallbackQuery`,
`sortRosterMembers` for D-08's never-reshuffling order (the bigint tie-breaker is
what makes it stable). The `AvailabilityParticipantCell` must therefore carry the
four `RosterIdentity` fields verbatim so it can be passed straight in.

### Database compare-and-set as the only idempotency mechanism

**Source:** `planning-service.ts:1451-1463` (token consume),
`:1783-1796` (cooldown claim), `:1830-1856` (`claimRoundlessStatusReply`)
**Apply to:** the participant answer gate, the `readyAnnouncedAt` claim, the
booking apply

Three shipped instances of the same rule. `claimRoundlessStatusReply`'s comment
states the general form: *"The two statements are a compare-and-set, not a
check-then-act"*, and *"it is claimed BEFORE the reply … a durable claim cannot
be undone by a Telegram outage, so an outage cannot be used as a flood
amplifier."* Both sentences apply verbatim to AVAIL-07's announcement.

### The service contract

**Source:** `planning-service.ts:621-635`
**Apply to:** every new `PlanningService` method

> *"Every method takes an injected `now` and returns a closed `kind` union rather
> than throwing to the handler, so a Telegram surface never has to interpret an
> exception to decide what to say. Nothing in this service reads `Date.now()`."*

Plus the `ConfirmResult` header comment (:160-167): a `failed` variant **carries
the caught value**, because a caught value bound under any key but `err` is
unloggable (finding F-4).

---

## No Analog Found

None. Every Phase 3 file has a shipped in-repo analog.

The two *structural departures* (RESEARCH F-1/F-2) are departures from a pattern,
not absences of one — and both have a blessed in-repo precedent to point at:

| Departure | Nearest precedent | Note for the planner |
|---|---|---|
| A shared, never-consumed `CallbackAction` row | Phase 1's roster `page`/`retry` actions (`rosterRemovalTargetSchema`'s second union member, `callback-schema.ts:77-82`) — chat/expiry-bound rows that are never consumed | STATE.md records this as blessed for *reads*; Phase 3 extends it to a write, with the exactly-once property moved onto the participant row. Call this out explicitly in the plan and in a code comment. |
| An answer transition with **no** round-level `expectedRevision` | none — every shipped transition has one | Deliberate. A round-level guard would refuse a legitimate concurrent answer as `stale`. The comment must say so, or a reviewer will "fix" it. |

---

## Metadata

**Analog search scope:** `prisma/`, `src/domain/planning/`, `src/domain/roster/`,
`src/domain/auth/`, `src/shared/`, `src/telegram/`, `src/app/`, `tests/unit/`,
`tests/integration/`, `tests/helpers/`
**Files scanned:** 14 read in full or in targeted ranges; 9 migrations and 37 test
files enumerated
**Pattern extraction date:** 2026-09-05
