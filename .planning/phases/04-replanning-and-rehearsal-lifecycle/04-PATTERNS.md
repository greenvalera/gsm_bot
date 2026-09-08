# Phase 4: Replanning and Rehearsal Lifecycle - Pattern Map

**Mapped:** 2026-09-08
**Files analyzed:** 13 modified + 1 created (migration) + ~5 test files
**Analogs found:** 14 / 14 (this phase creates no file without an in-repo analog)

Every excerpt below was read from the working tree this session. Where RESEARCH.md's
line numbers drifted, the corrected location is noted inline.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `prisma/migrations/2026MMDDHHMMSS_cancellation/migration.sql` (**new**) | migration | batch DDL | `prisma/migrations/20260905120000_availability_and_booking/migration.sql` | exact |
| `prisma/schema.prisma` | model | — | its own `BOOKED` / `bookedAt` block (lines 38-48, 214-217) | exact (self) |
| `prisma/migrate-deploy.mjs` | config/preflight | batch | its own `AVAILABILITY_MIGRATION` arms (lines 14, 447-451, 491-501) | exact (self) |
| `src/domain/planning/planning-service.ts` → `replanRound()` | service | CRUD (transactional) | `confirm()` — same file, lines 2113-2308 | exact |
| `src/domain/planning/planning-service.ts` → cancel confirm/apply pair | service | request-response (confirm-then-apply) | `openBookingGate` + `requestBooking` / `keepBooking` / `applyBooking` — lines 2742-3080 | exact |
| `src/domain/planning/planning-service.ts` → `availabilityOutcome()` | utility (pure) | transform | itself, lines 697-717 | exact (self) |
| `src/domain/planning/planning-service.ts` → `claimAnnouncement()` | service | event-driven claim | itself, lines 2386-2427 | exact (self) |
| `src/domain/planning/planning-service.ts` → `previousRehearsal()` / `wasPreviousParticipant()` | service | read query | themselves, lines 1494-1537 | exact (self) |
| `src/domain/planning/target-week.ts` → `targetWeekStart()` | utility (pure) | transform | itself + `weekDates` (lines 93-112); `isPastDay` at `planning-service.ts:373-382` | exact (self) |
| `src/shared/callback-schema.ts` | config/schema | transform | the `book-request / book-apply / book-keep` member (lines 122-128) | exact |
| `src/telegram/handlers.ts` | route | request-response | `command:plan_status` route (lines 249-267) + `bot.command("plan_status")` (lines 635-660) | exact |
| `src/telegram/keyboards.ts` | component | — | `PLANNING_BOOKING_CONFIRM_ROWS` (lines 300-313) + `PLANNING_AVAILABILITY_ROWS` (269-281) | exact |
| `src/telegram/planning-renderers.ts` | component | — | `AVAILABILITY_OUTCOME_SENTENCES` + `renderAvailabilityCard` (lines 456-575) | exact |
| `src/telegram/planning-handlers.ts` | controller | request-response | `dispatchBookApply` refusal ladder (lines ~2900-3040) | exact |
| `tests/unit/planning-*.test.ts` (new cases) | test | — | `tests/unit/planning-availability-card.test.ts` | exact |
| `tests/integration/planning-*.test.ts` (new) | test | — | `tests/integration/planning-booking.test.ts`, `planning-confirm.test.ts` | exact |
| `tests/integration/migration-preflight.test.ts` | test | — | its own `TARGET_MIGRATION` cases (lines 26, 1068, 1167) | exact (self) |

## Pattern Assignments

### `prisma/migrations/<new>/migration.sql` (migration, batch DDL)

**Analog:** `prisma/migrations/20260905120000_availability_and_booking/migration.sql` — verified verbatim, the whole file:

```sql
-- CreateEnum
CREATE TYPE "ParticipantAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "PlanningRoundStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "planning_participants" ADD COLUMN     "answered_at" TIMESTAMPTZ(3),
ADD COLUMN     "availability" "ParticipantAvailability";

-- AlterTable
ALTER TABLE "planning_rounds" ADD COLUMN     "announcement_message_id" INTEGER,
ADD COLUMN     "booked_at" TIMESTAMPTZ(3),
ADD COLUMN     "booked_by_user_id" BIGINT,
ADD COLUMN     "ready_announced_at" TIMESTAMPTZ(3);
```

**Copy exactly:** one `ALTER TYPE ... ADD VALUE 'CANCELLED';` plus one `ALTER TABLE
"planning_rounds" ADD COLUMN` group with **no defaults and no reference to the new
label** — this is the precedent for adding a label and nullable columns in ONE
migration. The label must appear exactly once in the generated SQL.

**Column order is transcribed, never guessed.** `ADD COLUMN`s are emitted
alphabetically by Prisma, so the expected physical order for the three new columns is
`cancelled_at`, `cancelled_by_user_id`, `superseded_by_round_id` — but the plan must
generate the migration first and read the emitted order before touching the preflight.

---

### `prisma/schema.prisma` (model)

**Analog:** its own `BOOKED` block. Verified at lines 37-48:

```prisma
/// The round's single durable lifecycle position.
///
/// `BOOKED` is appended LAST and the order is load-bearing twice over:
/// PostgreSQL appends a new label at the end of `enumsortorder`, and
/// `hasExactValues` in `prisma/migrate-deploy.mjs` compares the catalog's labels
/// index by index. A member inserted in the middle would fail the deploy
/// preflight on a correctly migrated database.
enum PlanningRoundStatus {
  DRAFT
  CONFIRMED
  SUPERSEDED
  BOOKED
}
```

**Detail-column pattern to copy** (verified lines 214-218):

```prisma
  /// LIFE-01, as the timestamp DETAIL of `status = BOOKED`, never as the
  /// authority for "is it booked". Nullable with no default, so this migration
  /// never has to reference the new enum label.
  bookedAt              DateTime?           @map("booked_at") @db.Timestamptz(3)
  bookedByUserId        BigInt?             @map("booked_by_user_id")
```

`cancelledAt` / `cancelledByUserId` are the same shape with `CANCELLED` substituted;
`supersededByRoundId String? @map("superseded_by_round_id")`.

**Two doc comments this phase must REWRITE, not just extend** (they assert facts D-03
and D-19 falsify):
- `readyAnnouncedAt`, lines 204-209: *"NULL means the round has never been announced ready to book"* — D-03 gives the column a second meaning.
- `activeWeekStart`, lines 183-187, already states the rule the replan transaction relies on: *"`status` and `activeWeekStart` MUST always be changed in one transaction."*

Constraint that governs the replan create — verified line 226: `@@unique([chatId, activeWeekStart])`.

---

### `prisma/migrate-deploy.mjs` (preflight config)

**Analog:** its own availability arms. Verified:

Line 14: `const AVAILABILITY_MIGRATION = "20260905120000_availability_and_booking";`

Lines 447-451 (`PLANNING_ROUND_STATUS_LABELS`, appended in order; `planningRoundStatusLabels` takes the LAST applied pair):

```js
const PLANNING_ROUND_STATUS_LABELS = [
  [PLANNING_MIGRATION, ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"]],
  [INTEGRITY_MIGRATION, ["DRAFT", "CONFIRMED", "SUPERSEDED"]],
  [AVAILABILITY_MIGRATION, ["DRAFT", "CONFIRMED", "SUPERSEDED", "BOOKED"]],
];
```

Lines ~476-501 (`roundColumns`, and the ordering rule stated in its own comment):

```js
  // Both lists are ordered by PHYSICAL column position (`attnum`), because
  // `hasExactColumns` compares index by index. An `ADD COLUMN` lands after every
  // existing column, and PostgreSQL orders the statements of one `ALTER TABLE`
  // alphabetically in Prisma's generated SQL — so the appended tuples follow the
  // migration's own order, not the Prisma model's.
  const roundColumns = [
    ...PLANNING_ROUND_COLUMNS,
    ...(availabilityApplied
      ? [
          ["announcement_message_id", "integer", false, null],
          ["booked_at", "timestamp(3) with time zone", false, null],
          ["booked_by_user_id", "bigint", false, null],
          ["ready_announced_at", "timestamp(3) with time zone", false, null],
        ]
      : []),
  ];
```

The `false` in position 3 is `notNull`; all three new columns are nullable, so — per
`notNullConstraints` (verified, filters on `[, , notNull]`) — **no** constraint entry
is added.

Tuple type strings to copy: `timestamp(3) with time zone` for `@db.Timestamptz(3)`,
`bigint` for `BigInt?`, `text` for `String?`.

---

### `planning-service.ts` → `replanRound()` (service, transactional CRUD)

**Analog:** `confirm()`, same file, lines 2113-2308. Verified sequence, copy statement
for statement:

**1. The roster lock + empty-roster refusal (D-07)** — lines 2203-2222:

```ts
        // READ COMMITTED gives a bare read no protection from a membership
        // change committed before our later snapshot write. Lock every existing
        // membership row for this chat...
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM chat_memberships
          WHERE chat_id = ${chatId}
          FOR SHARE
        `;

        const members = await listActiveMemberships(tx, chatId);
        if (members.length === 0) return { kind: "empty-roster" };
```

**2. The consume compare-and-set** — lines 2224-2236:

```ts
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        // The idempotency AND concurrency guarantee, in one statement...
        if (consumed.count !== 1) return { kind: "duplicate" };
```

**3. The guarded transition + release-on-lost-race** — lines 2238-2263:

```ts
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
            startsAt,
            endsAt,
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

The supersede half of the replan is this statement with
`status: PlanningRoundStatus.SUPERSEDED, activeWeekStart: null` — the same
status-and-key-in-one-statement discipline. Second precedent for the exact supersede
data block, `supersedeStaleRounds`, verified lines 3110-3144:

```ts
        data: {
          status: PlanningRoundStatus.SUPERSEDED,
          activeWeekStart: null,
          revision: { increment: 1 },
        },
```

**4. The participant snapshot (D-07 re-snapshot)** — lines 2269-2276, note it writes
`roundId` from a variable, which is the one line the replan changes (to the NEW round's id):

```ts
        await tx.planningParticipant.createMany({
          data: members.map((member) => ({
            roundId: round.id,
            chatId: round.chatId,
            telegramUserId: member.telegramUserId,
            membershipId: member.membershipId,
          })),
        });
```

**5. Re-read after the write, then mint** — lines 2278-2290:

```ts
        const confirmed = await tx.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        const answerActions = await this.mintAvailabilityActions(tx, confirmed, now);
```

**6. The outer error shape** — lines 2302-2306: `} catch (error) { return { kind: "failed", error }; }`.

**Unique-violation handling for a concurrent `/plan`:** copy `startOrResume`'s
`isUniqueViolation(error)` → `week-taken` mapping (`planning-service.ts:1042-1048`, mapped at 1756-1759).

---

### `planning-service.ts` → cancel confirm-then-apply pair (service, request-response)

**Analog:** `openBookingGate` (lines 3007-3080) + `applyBooking` (2938-3000) + `requestBooking` (2794-2806).

**The read-only gate, verified lines 3026-3070** — every refusal is a READ and precedes any write:

```ts
    const refuse = (refusal: BookingRefusal) =>
      ({ kind: "refused", refusal }) as const;

    const action = await tx.callbackAction.findUnique({
      where: { token: callbackToken },
    });
    if (
      action === null ||
      action.kind !== CallbackActionKind.PLANNING ||
      action.chatId !== chatId ||
      action.expiresAt <= now
    )
      return refuse({ kind: "stale" });
    if (action.consumedAt !== null) return refuse({ kind: "duplicate" });
    const target = parsePlanningTarget(action.targetId);
    if (!target.success || target.data.action !== expected)
      return refuse({ kind: "stale" });

    const round = await tx.planningRound.findUnique({
      where: { id: target.data.roundId },
    });
    if (round === null || round.chatId !== chatId)
      return refuse({ kind: "stale" });
    // D-16: the round is closed, and a booking cannot be recorded twice.
    if (round.status === PlanningRoundStatus.BOOKED)
      return refuse({ kind: "already-booked" });
    if (round.status !== PlanningRoundStatus.CONFIRMED)
      return refuse({ kind: "stale" });

    // D-13. The role was resolved at TAP time and is evaluated HERE, from the
    // author column this transaction just read — never from an eligibility flag
    // that travelled on the wire or was captured when the control was drawn.
    if (round.authorUserId !== actorId && !isAdministratorRole(role))
      return refuse({ kind: "not-eligible" });
```

This is the exact block D-09/AVAIL-08 extends: the two status tests
(`=== BOOKED` and `!== CONFIRMED`) gain `SUPERSEDED → replanned` and
`CANCELLED → already-cancelled` arms **before** the fallthrough. The mirror pair in
`answerAvailability` (verified lines 2626-2629) must gain the same arms.

**The apply-path role re-resolution** — `applyBooking`, verified lines 2938-2955:

```ts
    try {
      const role = await resolveRole();
      return await this.prisma.$transaction(async (tx) => {
        const gate = await this.openBookingGate(
          tx, chatId, actorId, callbackToken, "book-apply", now, role,
        );
        if (gate.kind !== "eligible") return gate.refusal;
```

**The apply transition + re-read** — verified lines 2957-2996; copy the `data` block
shape with `CANCELLED`, `cancelledAt`, `cancelledByUserId`, `activeWeekStart: null`:

```ts
        const booked = await tx.planningRound.updateMany({
          where: {
            id: gate.round.id,
            revision: expectedRevision ?? gate.round.revision,
            status: PlanningRoundStatus.CONFIRMED,
          },
          data: {
            status: PlanningRoundStatus.BOOKED,
            bookedAt: now,
            bookedByUserId: actorId,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (booked.count !== 1) {
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }
        return {
          kind: "booked",
          round: await tx.planningRound.findUniqueOrThrow({
            where: { id: gate.round.id },
          }),
          participants: availabilityParticipants(gate.rows),
        };
```

The re-read is load-bearing for D-15: the closing render must be driven by the position
this transaction wrote. **But D-15's post-vs-edit decision reads the PRE-transition
status from `gate.round`**, not from the re-read.

**Expiring the previous confirmation pair** — `requestBooking`, verified lines 2795-2806:

```ts
        await tx.callbackAction.updateMany({
          where: {
            chatId: gate.round.chatId,
            kind: CallbackActionKind.PLANNING,
            targetId: {
              in: (["book-apply", "book-keep"] as const).map((action) =>
                createPlanningTarget({ action, roundId: gate.round.id }),
              ),
            },
            consumedAt: null,
          },
          data: { expiresAt: now },
        });
```

Its own comment (verified lines 2770-2779) records both the defect it closes and the
placement rule: *"Placed AFTER the gate has answered eligible, so every read-only
refusal still precedes every write."* Copy this for `cancel-*` and `change-*` pairs —
and **do NOT** apply it to a superseded round's `answer` / `book-request` rows
(Pitfall 5: expiring them moves the refusal above the dispatcher, where the copy is
fixed to `PLANNING_STALE_TEXT`).

---

### `planning-service.ts` → `availabilityOutcome()` (pure utility, transform)

**Analog:** itself. Verified lines 697-717, including the doc comment D-01 falsifies:

```ts
/**
 * The ONE derivation of what an availability round currently says (D-05).
 *
 * Order is load-bearing: a round with anybody still pending is `collecting`
 * whatever the answers so far are, because D-05's "the slot does not work" is a
 * statement about a COMPLETE set of answers. Only once every participant has
 * spoken does a single "cannot attend" make the round `blocked`. An empty
 * lineup answers `collecting` and is unreachable in production — Confirm
 * refuses an empty roster — but it is answered rather than thrown, because a
 * total function cannot be called at the wrong moment.
 */
export function availabilityOutcome(
  participants: readonly Readonly<{ marker: ParticipantMarker }>[],
): AvailabilityOutcome {
  if (participants.length === 0) return "collecting";
  if (participants.some((cell) => cell.marker === "pending"))
    return "collecting";
  return participants.every((cell) => cell.marker === "available")
    ? "all-available"
    : "blocked";
}
```

The prose is the only statement of the old rule anywhere; it must be rewritten in the
same edit. The `ParticipantMarker` values are produced by `participantMarker` (verified
lines 688-695): `"pending" | "available" | "unavailable"`.

**Consumer that changes copy:** `AVAILABILITY_OUTCOME_SENTENCES` — see the renderer
section. **Consumer that must NOT change:** `openBookingGate`'s
`if (outcome !== "all-available")` (verified lines 3068-3077) — behaviour is identical
under the reorder.

---

### `planning-service.ts` → `claimAnnouncement()` (service, event-driven claim)

**Analog:** itself. Verified lines 2386-2427 — the three-way branch D-03 widens:

```ts
    const current =
      (await tx.planningRound.findUnique({ where: { id: round.id } })) ?? round;
    if (outcome !== "all-available") {
      // Unanimity is gone. Only a round that actually has an announcement on
      // screen has anything to retract; one that never announced says nothing.
      return {
        round: current,
        directive:
          current.readyAnnouncedAt !== null &&
          current.announcementMessageId !== null
            ? "retract"
            : "none",
      };
    }
    if (await this.claimReadyAnnouncementWindow(tx, round.id, now)) {
      return { round: current, directive: "post" };
    }
    // The claim was refused: either a concurrent transaction won it, or the
    // window has not elapsed. Either way this answer must not notify the band.
    // If a message is already on screen it is edited so it stays truthful.
    return {
      round: current,
      directive: current.announcementMessageId === null ? "none" : "edit",
    };
```

D-03's edit: `all-available` → claim, `blocked` → claim, `collecting` → retract/none.
`claimReadyAnnouncementWindow`'s `status: CONFIRMED` guard stays untouched (verified
just above, at ~2348-2362) — only the caller's outcome test widens.

---

### `planning-service.ts` → `previousRehearsal()` / `wasPreviousParticipant()` (read queries)

**Analog:** themselves. Verified lines 1494-1537:

```ts
  async previousRehearsal(
    chatId: bigint,
    now: Date,
  ): Promise<PlanningRound | null> {
    return await this.prisma.planningRound.findFirst({
      where: {
        chatId,
        status: { in: [...WEEK_CLAIMING_STATUSES] },
        startsAt: { lt: now },
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    });
  }
```

D-16: `startsAt: { lt: now }` → `endsAt: { lt: now }`. `orderBy` stays (A2).

```ts
  async wasPreviousParticipant(
    chatId: bigint,
    actorId: bigint,
  ): Promise<boolean> {
    const count = await this.prisma.planningParticipant.count({
      where: {
        telegramUserId: actorId,
        round: { chatId, status: { in: [...WEEK_CLAIMING_STATUSES] } },
      },
    });
    return count > 0;
  }
```

D-19: `round: { chatId }`. Its doc comment (verified 1508-1524) asserts the coupling
being removed — *"The status set is therefore read from `WEEK_CLAIMING_STATUSES` rather
than restated"* and *"The two questions share a status filter and nothing else"* — and
must be rewritten in the same edit.

---

### `src/domain/planning/target-week.ts` → `targetWeekStart()` (pure utility)

**Analog:** itself. Verified lines 93-112, whole function plus the helper it will call:

```ts
export function targetWeekStart(
  nowCivil: CivilDate,
  isClaimed: (weekStart: string) => boolean,
): string | null {
  let monday = mondayOf(nowCivil);
  for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
    const candidate = isoDate(monday);
    if (!isClaimed(candidate)) return candidate;
    monday = addDays(monday, 7);
  }
  return null;
}

/** The seven civil dates of a target week, Monday first, as "YYYY-MM-DD". */
export function weekDates(weekStart: string): readonly string[] {
  const monday = mondayOf(parseCivilDate(weekStart));
  return [0, 1, 2, 3, 4, 5, 6].map((offset) =>
    isoDate(addDays(monday, offset)),
  );
}
```

The signature takes no new parameter, so the eight `tests/unit/target-week.test.ts`
call sites compile unchanged.

`WEEK_CLAIMING_STATUSES`, verified lines 42-45, needs **no edit** for LIFE-06 —
`CANCELLED` is released by absence. Its comment already names this phase:
*"Phase 4's LIFE-02 / LIFE-06 is the next editor of the set below."* LIFE-02 is
already satisfied: `PlanningRoundStatus.BOOKED` is present.

**Cycle trap (Pitfall 7):** `isPastDay` currently lives in `planning-service.ts:373-382`,
which imports `WEEK_CLAIMING_STATUSES` from this module. Move `isPastDay` down into
`target-week.ts` and re-export it so `classifyDay` and existing test imports are unchanged.

---

### `src/shared/callback-schema.ts` (schema/config, transform)

**Analog:** the booking member, verified lines 122-128:

```ts
  z
    .object({
      action: z.enum(["book-request", "book-apply", "book-keep"]),
      roundId: z.string().min(1),
    })
    .strict(),
```

Copy this shape exactly for `replan` / `cancel-*` / `change-*`. The block comment above
the union (verified lines 85-96) states the rule the new members inherit: *"The wire
token stays an opaque `v1:<uuid>`; the date, minute, answer and round id live ONLY in
the server-side `CallbackAction.targetId` … Nothing on the wire is ever an authorization
claim (threat T-01-05)."*

**No `CallbackActionKind` migration:** every planning target already travels under
`CallbackActionKind.PLANNING`.

---

### `src/telegram/handlers.ts` (routes + command registration)

**Analog A — the route table entry.** Verified lines 249-267 (`command:plan_status`),
and the closed union at 82-94 that must gain `"command:plan_cancel"` / `"command:plan_change"`:

```ts
  {
    id: "command:plan_status",
    kind: "command",
    filter: "plan_status",
    surface: "planning",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "chat-member",
  },
```

For cancel/change use `authority: "route-resolved"` — LIFE-03/LIFE-04 admit the round's
AUTHOR as well as an administrator, which the route cannot decide. `chatReadinessRouteId`
(verified lines 284-301) throws on a route id absent from `ROUTE_BY_ID`, so the union
member and the table row must land together.

**Analog B — the handler registration.** Verified lines 635-660:

```ts
  bot.command("plan_status", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:plan_status", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(PLANNING_STATUS_DENIAL);
      return;
    }
    const currentRole = await services.authorization.currentRole(
      context.chatId,
      context.actorId,
    );
    if (!isCurrentMember(currentRole)) {
      logRoute(services, "command:plan_status", updateId, "denied", context);
      await ctx.reply(PLANNING_STATUS_DENIAL);
      return;
    }
    logRoute(
      services, "command:plan_status", updateId,
      "authorized-and-dispatched", context,
    );
    await handlePlanStatusCommand(ctx, services, context, currentRole);
  });
```

Note it uses `services.authorization.currentRole` — the non-destructive accessor — never
the administrator-requirement helper (threat T-02-14). Copy that choice.

---

### `src/telegram/keyboards.ts` (component)

**Analog:** `PLANNING_BOOKING_CONFIRM_ROWS`, verified lines 300-313 — the D-14
confirmation-pair shape, commit first, way-out under it:

```ts
export const PLANNING_BOOKING_CONFIRM_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_BOOK_CONFIRM_LABEL, action: "book-apply" }],
    [{ text: PLANNING_BOOK_KEEP_LABEL, action: "book-keep" }],
  ];
```

**Comment to update, not just extend** — `PLANNING_AVAILABILITY_ROWS`, verified lines
269-281: *"There is no third control: this phase ships no replan action and the card must
not imply one is a tap away (D-05)."* D-02 adds exactly that third control.

**Control-dropping is the mechanism for conditional controls** — verified lines 319-338:

```ts
export function planningControlRows(
  rows: readonly (readonly PlanningControlButton[])[],
  tokenFor: (action: PlanningControlAction) => string | undefined,
): readonly (readonly PlanningKeyboardButton[])[] {
  ...
      const token = tokenFor(button.action);
      if (token === undefined) continue;
```

An ineligible actor's control is simply not minted. `PlanningControlAction` is the closed
union at line 193 that gains the new members.

---

### `src/telegram/planning-renderers.ts` (component)

**Analog:** `AVAILABILITY_OUTCOME_SENTENCES` + `renderAvailabilityCard`. Verified lines 456-575.

**The copy table (total map, never a conditional chain):**

```ts
const AVAILABILITY_OUTCOME_SENTENCES: Readonly<
  Record<AvailabilityOutcome, string>
> = {
  collecting: "Answers are still coming in.",
  "all-available": "Everyone can make it.",
  blocked: "This slot doesn't work for the whole band.",
};
```

Its comment states the constraint every new render inherits: *"the renderer CHOOSES copy
from a state `availabilityOutcome` already decided and never re-derives it"* — and the
sentence D-02 falsifies: *"Phase 3 ships no replan action, and a card hinting at a tap
that does not exist is worse than one that says nothing."*

**Naming the blocker (D-02) reuses the card's existing sort/label pair** — verified lines 550-575:

```ts
    ...sortRosterMembers(projection.participants).map(
      (participant) =>
        `${PARTICIPANT_MARKER_GLYPHS[participant.marker]} ${memberLabel(participant)}`,
    ),
    "",
    projection.booked
      ? AVAILABILITY_BOOKED_SENTENCE
      : AVAILABILITY_OUTCOME_SENTENCES[projection.outcome],
```

`memberLabel` ALREADY escapes and carries the `Telegram user ••••NNNN` mask (T-01-21) —
do not escape a second time. The blocked-blocker list is
`projection.participants.filter(p => p.marker === "unavailable")` through the same pair.

**Pitfall 10 lives here:** `AVAILABILITY_BOOKED_SENTENCE = "This rehearsal is booked."`
is chosen by `projection.booked`, i.e. by `round.status === BOOKED`
(`planning-service.ts:748-750`). Once the status is `CANCELLED` the flag goes false and
the card falls through to *"Everyone can make it."* — so the cancelled state needs its own
explicit render, not a fall-through.

---

### `src/telegram/planning-handlers.ts` (controller)

**Analog:** `dispatchBookApply`'s refusal ladder — one `if (result.kind === …)` block per
union member, each owning exactly one `answerCallbackQuery`, verified ~2960-3040:

```ts
  if (result.kind === "already-booked") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "round-already-booked",
      roundId,
      "booking-already-recorded",
    );
    await ctx.answerCallbackQuery({
      text: PLANNING_ALREADY_BOOKED,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "duplicate") {
    logPlanning(deps, "callback:PLANNING", context, "duplicate-tap", roundId,
      "booking-apply-already-applied");
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "failed") {
    logPlanningFailure(deps, PLANNING_CATCH_SITES.booking, "callback:PLANNING",
      context, result.error);
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
    return;
  }
  logPlanning(deps, "callback:PLANNING", context, "stale-action", roundId,
    "booking-apply-target-no-longer-actionable");
  await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
```

**The trailing block is the Pitfall-4 trap, confirmed:** it is unguarded, so a new
`BookingRefusal` member silently lands there and typechecks. `CALLBACK_STALE` is verified
at lines 107-108 as byte-identical to `PLANNING_STALE_TEXT`:

```ts
const CALLBACK_STALE =
  "This planning action is no longer available. Send /plan to start again.";
const ALREADY_APPLIED = "Already applied.";
```

D-09's copy is declared beside these, as its own named constant, in the same style.

**New log vocabulary goes into the two closed arrays** — verified at lines 423 and 497,
`PLANNING_OUTCOMES` / `PLANNING_REASONS`, each member carrying a doc comment stating why
it is a distinct fact (e.g. `"round-owned-by-another-member"`: *"the tapped button is
perfectly valid and unspent, and the ONLY thing wrong is who pressed it"*). Copy that
justification-per-member convention.

**The D-03 predicate to extract (Pitfall 2)** — verified at `renderStep`, lines 996-1001:

```ts
    if (
      card === "announcement" ||
      (round.status === PlanningRoundStatus.CONFIRMED &&
        round.readyAnnouncedAt !== null &&
        projection.outcome === "all-available")
    ) {
      return withoutEmptyKeyboard(
        renderReadyAnnouncement(projection, controlTokens(actions)),
      );
    }
```

Its own comment (lines 951-965) explains why the slot claim and the message body must
agree: *"Gating only the SLOT would leave this predicate in charge of the message body, so
a refused claim would still post the ready-to-book copy with a live booking control (D-21a,
gap G-01)."* `handlePlanStatusCommand`'s `readyToBook` at ~1773-1776 restates it and must
move in lockstep — extract one named predicate consumed by both.

---

### Tests

**Unit analog:** `tests/unit/planning-availability-card.test.ts` — verified header. Fixtures
are hand-built `AvailabilityStepProjection` values, not database rows, and the file imports
the domain derivation, the keyboard labels/glyph constants, and the renderers together:

```ts
import {
  availabilityOutcome,
  type AvailabilityParticipantCell,
  type AvailabilityStepProjection,
  type ParticipantMarker,
} from "../../src/domain/planning/planning-service.js";
import {
  PLANNING_BOOK_CONFIRM_LABEL, PLANNING_CAN_ATTEND_LABEL,
  PLANNING_MARKER_CANNOT_ATTEND, ..., type PlanningControlAction,
} from "../../src/telegram/keyboards.js";
```

Copy this for the blocked-card render test (Pitfall 1 requires both an
`availabilityOutcome([unavailable, pending]) === "blocked"` unit assertion **and** a
rendering assertion that the card names the blocker).

**Integration analog:** `tests/integration/planning-confirm.test.ts` (for `replanRound`'s
transaction) and `planning-booking.test.ts` (for the cancel confirm-apply pair, and it
holds the four `previousRehearsal` assertions at lines ~1176-1201 whose expectations move
to the `endsAt` boundary). Both run against `postgres:18.4` via
`tests/helpers/postgres.ts`.

**Migration preflight analog:** `tests/integration/migration-preflight.test.ts`. Verified
line 26 — `const TARGET_MIGRATION = "20260905120000_availability_and_booking";` — with a
comment above it (lines 15-25) explicitly warning that the older migration's own
behavioural cases must NOT be retargeted at the newest migration:

> *"Pointing those at the newest migration would silently retarget them at a purely
> additive migration that does none of those things, and they would pass while proving
> nothing."*

So: move only the two `TARGET_MIGRATION`-keyed cases (`stopped one migration short`,
~line 1068; `fully migrated`, ~line 1167), and add a new case for the cancellation
migration.

## Shared Patterns

### Eligibility resolution (D-04, D-14) — apply to every new domain transition
**Source:** `planning-service.ts:3064-3070` (quoted in full above).
`round.authorUserId !== actorId && !isAdministratorRole(role)` evaluated **inside** the
transaction, from a role resolved at tap time by
`AuthorizationService.currentRole`. Never the administrator-requirement helper — the rule
is stated in prose at `planning-handlers.ts:42-49`: *"that path deletes the acting user's
setup and settings drafts on denial."*

### Exactly-once transition — apply to every new confirm/apply pair
**Source:** `planning-service.ts:2224-2236` and `2957-2980` (quoted above). One
`updateMany` compare-and-set on `consumedAt: null` asserting `count === 1`, then a guarded
`updateMany` on `status` + `revision`, then `releaseAction` in the same transaction on a
lost race — never after a successful write.

### Status-is-authority — apply to every render and every read query
**Source:** `applyBooking`'s doc comment, verified ~2916-2920: *"No call site anywhere may
branch on either being non-null to decide whether a round is booked — `PlanningRound.status`
is the single lifecycle position."* `cancelledAt` / `cancelledByUserId` are detail only.

### Three separate status sets — never merge
**Sources:** `target-week.ts:42-45` (`WEEK_CLAIMING_STATUSES`),
`planning-service.ts:160-173` (`RECOVERABLE_ROUND_STATUSES`, whose comment forbids the
sharing), and the cancel guard's own inline `{ in: [DRAFT, CONFIRMED, BOOKED] }`. Phase 4
touches all three differently; they stay three constants.

### Error boundary
**Source:** `confirm()`, lines 2302-2306: `} catch (error) { return { kind: "failed", error }; }`
at the service, and `logPlanningFailure(deps, PLANNING_CATCH_SITES.<site>, …)` +
`answerCallbackQuery({ text: SAVE_FAILED })` at the dispatcher. An unbound catch clause is
unloggable (STATE.md).

### Control-bearing message (D-11)
**Source:** stated inline twice today — `planning-handlers.ts:2589-2608`
(`if (result.round.announcementMessageId !== null)`, comment: *"The ANNOUNCEMENT is the
message that carries the booking control (D-17)"*) and `closeBookedRound` at ~2861-2895.
Phase 4 adds three more consumers; extract one helper
(`round.announcementMessageId ?? round.anchorMessageId`) rather than a fourth restatement.

### Terminal card with no controls
**Source:** `withoutEmptyKeyboard(card)` — `planning-handlers.ts:916-930`. grammY's
`InlineKeyboard` is never `undefined`; an empty one still paints a control strip.

## No Analog Found

None. Every file this phase touches already exists, and every new construct has a
Phase 2 or Phase 3 precedent in the same file. The two constructs with the weakest
precedent, and where the planner should expect judgement rather than copying:

| Construct | Role | Data Flow | Note |
|-----------|------|-----------|------|
| `supersededByRoundId` link column | model | — | No self-referential scalar exists on `PlanningRound` today; nearest shape is `PlanningParticipant.membershipId` (a plain nullable id, no Prisma relation). Recommend the same: a bare `String?` scalar, no `@relation`. |
| Blocked-state announcement body | component | — | `renderReadyAnnouncement` is the structural analog (same `lineupLines`, same civil-pair repetition, same "never a mention" rule), but its copy is entirely new. |

## Metadata

**Analog search scope:** `src/domain/planning/`, `src/telegram/`, `src/shared/`,
`prisma/`, `prisma/migrations/`, `tests/unit/`, `tests/integration/`
**Files scanned:** 11 source/config files read at targeted ranges; 10 migration
directories and 39 test files enumerated
**Pattern extraction date:** 2026-09-08
