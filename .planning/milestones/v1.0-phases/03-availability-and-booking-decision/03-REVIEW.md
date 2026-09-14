---
phase: 03-availability-and-booking-decision
reviewed: 2026-09-07T00:00:00Z
depth: standard
files_reviewed: 22
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
  - tests/helpers/racing-client.ts
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
  - tests/unit/planning-ownership.test.ts
  - tests/unit/target-week.test.ts
findings:
  critical: 0
  warning: 6
  info: 0
  total: 6
status: issues_found
---

# Phase 3: Code Review Report (re-review after gap closure)

**Reviewed:** 2026-09-07
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found (no blockers)

## Summary

This is a re-review of the closed state after gap plans 03-06 through 03-09. I re-derived
each claimed closure from the source rather than from the summaries, then hunted for new
defects across the whole changed surface.

**All ten claimed closures hold.** Details in "Closure verification" below. The security
posture of the phase is sound: every callback is acknowledged (the boundary's `finally`
fallback in `src/telegram/callbacks.ts:446-454` guarantees it), authorization is re-derived
from `PlanningRound.authorUserId` plus a tap-time `currentRole` inside every booking
transaction, nothing on the wire is an authorization claim (tokens are 39-byte opaque
`v1:<uuid>`, well inside the 64-byte `callback_data` limit), every alert string is under
200 UTF-16 code units, every state transition is a compare-and-set, and the one raw SQL
statement (`planning-service.ts:2205-2209`) is a parameterised tagged template.

Six warnings remain. Two of them (WR-01, WR-03) are observability defects that make a
database outage indistinguishable from a benign refusal on precisely the paths that leave
a live group message orphaned — the same class of defect finding F-4 and IN-03 exist to
prevent, applied inconsistently. One (WR-02) is a genuine, unasserted user-visible
regression on the one card that persists in chat history forever. The remaining three are
maintainability/coverage gaps.

I found no blocker. That is a real result, not a pass by omission: I traced the announcement
claim/release/record triangle, the three booking transitions, the D-33 asymmetry, the
capability-count invariants, the enum/catalog preflight, and the alert-budget arithmetic,
and each holds under the concurrency and failure interleavings I could construct.

## Closure verification

| Finding | Claim | Holds? | Evidence |
|---|---|---|---|
| G-01 (BLOCKER) | `/plan_status` cannot re-notify the band | **Yes** | `claimReadyAnnouncementWindow` (`planning-service.ts:2348-2363`) is the single compare-and-set; `claimAnnouncement` and `claimAnnouncementRepost` are both callers. `handlePlanStatusCommand` (`planning-handlers.ts:1774-1780`) claims *before* announcing, short-circuited behind the ready-to-book predicate (D-22), and the claim result drives `slot` **and** `card` (`planning-handlers.ts:1801-1812`) so a refused claim cannot render the ready-to-book body. `renderStep`'s explicit-`card` branch (`planning-handlers.ts:991-1005`) wins over its own predicate. |
| G-02 | One live `book-request` per round | **Yes** | `ensureBookingRequestAction` (`planning-service.ts:1287-1311`) loads-then-mints; `mintBookingRequestAction` has exactly one caller (`:1310`); both former mint sites (`:2690` answer-post, `:2880` keep) route through it. See WR-06 for the residual encapsulation gap. |
| G-03 | Orphaned announcement compensated | **Yes** | `releaseAnnouncementClaim` (`planning-service.ts:2549-2573`) carries all four guards including the `announcementMessageId: null` discriminator and the `readyAnnouncedAt: claimedAt` compare-and-set. `dispatchAnnouncement`'s failed-record branch (`planning-handlers.ts:2157-2202`) releases, strips and logs in that order and posts nothing. The `/plan_status` slot is excluded by the guard, not by convention. |
| G-04 | `/plan_status` writes no wasted capability | **Yes** | `mintTakeoverAction`'s first refusal is `round.status !== DRAFT` (`planning-service.ts:3569`). |
| G-05 | Requirement ledger in step | **Yes** | `.planning/REQUIREMENTS.md` marks AVAIL-01/02/03/04/07 and LIFE-01 complete for Phase 3; AVAIL-05/06 correctly still Phase 4. |
| WR-04 | Alert budget in UTF-16 code units | **Yes** | `boundedLabel` (`planning-handlers.ts:219-233`) compares `String#length` against the budget and walks code points summing `point.length`. Measured: the worst legitimate member (64+64+32 astral glyphs) now yields a **199**-unit alert, `isWellFormed() === true`. Previously 335. The `refuseNonAuthor` acknowledgement is wrapped with its own `ownershipAlert` catch site (`:838-865`). |
| WR-05 | Not-modified reported as `unchanged` | **Yes** | `editRoundMessage`'s not-modified catch returns `"unchanged"` and populates the fingerprint (`planning-handlers.ts:1195-1200`). `grep -cF "new Error(" src/telegram/planning-handlers.ts` is 0. |
| WR-06 | One live confirm/keep pair | **Yes** | `requestBooking` expires the previous pair in one `updateMany` after the gate and before the mint (`planning-service.ts:2794-2806`). Expire-never-delete is correct: the boundary refuses `expiresAt <= now`. |
| WR-07 | Preflight states set-equality | **Yes** (code) | `hasExactDefinitions` (`prisma/migrate-deploy.mjs:840-856`) is a genuine injective consuming match. See WR-05 below for the coverage caveat. |
| IN-01 | Flat enum derivation | **Yes** | `PLANNING_ROUND_STATUS_LABELS` + `planningRoundStatusLabels` (`prisma/migrate-deploy.mjs:447-459`) take the last applied pair; the unreachable fourth arm is gone. The declaration-order assumption is safe because `migrationHistoryState` independently rejects an out-of-order history. |

Also verified independently: the appended column tuples in `expectedApplicationCatalog`
(`migrate-deploy.mjs:481-500`) match the physical `attnum` order the migration produces
(`announcement_message_id, booked_at, booked_by_user_id, ready_announced_at` on
`planning_rounds`; `answered_at, availability` on `planning_participants`), and
`ALTER TYPE ... ADD VALUE 'BOOKED'` is never referenced in the same migration, so Prisma's
single-transaction application is safe.

---

## Narrative Findings (AI reviewer)

### WR-01: `dispatchAnnouncement` discards a real exception from `recordAnnouncement`

**Severity:** WARNING
**File:** `src/telegram/planning-handlers.ts:2156-2201`

**Issue:** The failed-record branch tests `recorded.kind !== "recorded"` and routes both
`failed` and `stale` to `logPlanningNotRecorded`, which by construction emits **no `err`
key at all**. When `recordAnnouncement` catches a genuine Prisma exception into
`{ kind: "failed", error }` (`planning-service.ts:2497-2499`), that error is dropped on the
floor. Nothing else in the process sees it.

This is not a style nit; it is the module contradicting its own stated invariant:

- `logPlanningNotRecorded`'s doc comment (`:735-752`) explicitly says it exists for
  "a failure that **NOTHING THREW**" and that binding a caught value under any key but
  `err` makes it unloggable.
- The two sibling call sites for exactly this shape **do** split: `/plan`'s initial anchor
  (`:1616-1638`) and `repostAnchor`'s re-anchor (`:1438-1454`) each branch on
  `kind === "failed"` to `logPlanningFailure` with the real error.
- This is the one path where the failure has already put a **live, unaddressable group
  message** in the chat. It is the branch that most needs a cause.

The same branch also discards `releaseAnnouncementClaim`'s error: a `{ kind: "failed" }`
release is folded into the same bucket as `refused` (`:2196-2199`), so a second failed
durable write is invisible too.

Two integration cases and one unit gate currently *assert* the defect — the fixture
`RECORD_THREW` at `tests/integration/planning-availability.test.ts:1677-1680` carries a real
`Error` and `:1873` asserts `failures[0]?.err` is `undefined`. Fixing the code means
correcting those assertions; they are enshrining the bug, not protecting behaviour.

**Fix:**

```ts
const released = await deps.planning.releaseAnnouncementClaim(
  round.id, now, round.readyAnnouncedAt,
);
await clearSupersededCard(ctx, deps, context, "callback:PLANNING", messageId, card);

// A thrown pointer write keeps its cause; a `stale` one never had one.
if (recorded.kind === "failed") {
  logPlanningFailure(
    deps, PLANNING_CATCH_SITES.announcementRecord,
    "callback:PLANNING", context, recorded.error,
  );
} else {
  logPlanningNotRecorded(
    deps, PLANNING_CATCH_SITES.announcementRecord, "callback:PLANNING", context,
    released.kind === "released"
      ? "announcement-claim-released"
      : PLANNING_CATCH_SITES.announcementRecord.reason,
  );
}
if (released.kind === "failed") {
  logPlanningFailure(
    deps, PLANNING_CATCH_SITES.announcementRecord,
    "callback:PLANNING", context, released.error,
  );
}
```

Then update `tests/integration/planning-availability.test.ts:1873` (and the sibling case
near `:1720`) to assert `err` is defined for the `RECORD_THREW` fixture, and add a `stale`
fixture that keeps the `err`-is-undefined assertion. The `BRANCHES` entry in
`tests/unit/planning-logging.test.ts:1294-1310` should be re-seeded with a stale (not
thrown) fault so it keeps covering the reason it names.

---

### WR-02: the booked round's terminal card silently drops its "Planned by …" attribution

**Severity:** WARNING
**File:** `src/telegram/planning-handlers.ts:2868-2880`

**Issue:** `closeBookedRound` builds `availabilityStepProjection(round, participants)` with
**no third `owner` argument**, so `AvailabilityStepProjection.owner` is absent and
`renderAvailabilityCard` skips `planningOwnerLine` (`planning-renderers.ts:566-568`). The
availability card is edited one last time — the render that stays in chat history forever —
and the `Planned by X.` line that was on every previous render of that same message
disappears.

Every other render of that card carries the owner: `confirm` publication
(`planning-handlers.ts:1984-1991`), each answer (`:2280-2286`), and `/plan_status` via
`availabilityProjection` (`planning-service.ts:1659`). `closeBookedRound` is the single
exception, and it is the one the design's own comments single out as the render that must
*not* drop it:

> "The confirmed card is the ONE card that stays in chat history forever, so it is the last
> card that may drop the attribution: a line that appeared at the hand-over and vanished on
> the terminal render would quietly stop being true to anyone scrolling back."
> — `planning-service.ts:258-266`

> "an attribution line that survived publication but vanished at the first answer would
> silently un-attribute the round" — `planning-service.ts:826-833`

After an administrator takeover this is the whole of D-13's promise being lost at exactly
the moment the record becomes permanent. No test covers it: the only `Planned by` assertion
in the suite is `tests/integration/planning-availability.test.ts:670` on the collecting card;
`tests/integration/planning-booking.test.ts` never asserts the closed card's body beyond
`toContain("booked")` (`:1116-1117`).

The root cause is upstream: `BookingApplyResult["booked"]`
(`planning-service.ts:938-946`) carries `round` and `participants` but no `owner`, so the
surface has nothing to pass.

**Fix:** add `owner` to the `booked` result, resolved inside the apply transaction from the
row it just wrote, and thread it through.

```ts
// planning-service.ts — BookingApplyResult "booked" member
owner: TelegramIdentity;

// applyBooking, in the success return
const bookedRound = await tx.planningRound.findUniqueOrThrow({
  where: { id: gate.round.id },
});
return {
  kind: "booked",
  round: bookedRound,
  owner: await resolveTelegramIdentity(tx, bookedRound.authorUserId),
  participants: availabilityParticipants(gate.rows),
};

// planning-handlers.ts — closeBookedRound signature + body
async function closeBookedRound(..., owner: TelegramIdentity) {
  const projection = availabilityStepProjection(round, participants, owner);
```

Add an assertion to the booking round-trip integration case that the closed anchor still
contains `Planned by`, and one that it still does after a takeover.

---

### WR-03: a thrown announcement claim is logged as a cooldown refusal

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:2455-2461`; caller
`src/telegram/planning-handlers.ts:1774-1800`

**Issue:** `claimAnnouncementRepost` swallows *every* exception into `false` with a bare
`catch {}` and no log line. Failing closed is the right safety decision — an unclaimed
window is not a licence to notify — but the caller then chooses its reason purely from the
boolean:

```ts
announce ? "announcement-reposted"
         : readyToBook ? "announcement-repost-inside-announce-cooldown"
                       : repostReasonFor(result.round.status)
```

So a PostgreSQL outage during the claim is recorded as
`announcement-repost-inside-announce-cooldown`, whose own doc comment
(`planning-handlers.ts:548-563`) asserts the exact opposite of what happened: "the request
was well formed and the round genuinely IS ready to book … the only thing that happened is
that the band was told recently enough". An operator counting refused re-announcements is
now counting database failures as rate-limiting working correctly — the precise
indistinguishability finding F-4 and IN-03 exist to prevent, and the same class as WR-01.

The service already holds a logger and already has the pattern for this
(`logHousekeepingFailure`, `:1069-1084`).

**Fix:**

```ts
async claimAnnouncementRepost(
  chatId: bigint, roundId: string, now: Date,
): Promise<boolean> {
  try {
    return await this.claimReadyAnnouncementWindow(this.prisma, roundId, now);
  } catch (error) {
    // Fail closed, but never silently: a thrown claim is not a cooldown refusal.
    this.logger?.error(
      {
        event: "planning.announcement.failure",
        outcome: "announce-failed",
        reason: "announcement-claim-threw",
        chatId,
        err: error,
      },
      "Ready-to-book announcement claim failed",
    );
    return false;
  }
}
```

The same argument applies, more weakly, to `claimRoundlessStatusReply`'s bare
`catch { return false; }` (`:3421-3428`): a P2002 there is an expected lost race, but any
other exception silently turns `/plan_status` into a no-reply. Narrowing the catch to
`isUniqueViolation(error)` and logging the rest would separate the two.

---

### WR-04: `/plan_status` re-posts a BOOKED round forever; the no-active-round copy is unreachable

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:3333-3338`

**Issue:** `status()` selects the newest round in `RECOVERABLE_ROUND_STATUSES`, which this
phase widened to include `BOOKED`, with **no recency bound**:

```ts
const round = await tx.planningRound.findFirst({
  where: { chatId, status: { in: [...RECOVERABLE_ROUND_STATUSES] } },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
});
if (round === null) return { kind: "no-active-round" };
```

`supersedeStaleRounds` only retires **DRAFT** rounds whose week is behind the chat
(`:3110-3132`), so a BOOKED round stays "recoverable" permanently. Consequences:

1. From the moment a chat books its first rehearsal, `status()` can never again return
   `no-active-round` unless every round is deleted. `PLANNING_NO_ACTIVE_ROUND`
   ("Nobody is planning a rehearsal right now. Send /plan to start one.") becomes dead copy
   for that chat, and with it the whole `claimRoundlessStatusReply` chat-level cooldown path
   (`planning-handlers.ts:1706-1718`).
2. `/plan_status` in the gap between one rehearsal happening and the next `/plan` re-posts a
   *past* rehearsal's closed summary as though it were the current plan — and, worse, moves
   `anchorMessageId` to that fresh copy and strips the original. The same round is
   simultaneously "the previous rehearsal" (`previousRehearsal`, `:1494+`, which selects
   `startsAt < now` week-claiming rounds) and "the live round".

D-03's rationale ("a BOOKED one is showing the closed summary of what they agreed") is
sound for the window between booking and the rehearsal. It does not justify an unbounded
one. This may be an accepted product behaviour rather than an accident — but it is not
stated anywhere as bounded, and no test pins the boundary.

**Fix:** bound the BOOKED arm to a round the chat can still act on, and let anything older
fall through to `no-active-round`:

```ts
const round = await tx.planningRound.findFirst({
  where: {
    chatId,
    OR: [
      { status: { in: [PlanningRoundStatus.DRAFT, PlanningRoundStatus.CONFIRMED] } },
      // A booked rehearsal is recoverable until it has actually happened.
      { status: PlanningRoundStatus.BOOKED, endsAt: { gt: now } },
    ],
  },
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
});
```

Add an integration case: book a round, advance the clock past `endsAt`, then `/plan_status`
answers `PLANNING_NO_ACTIVE_ROUND` and re-posts nothing. If the unbounded behaviour is in
fact intended, record it as a decision and add a test that pins it, so the next reader does
not have to guess.

---

### WR-05: the WR-07/IN-01 preflight rewrite has no test that fails against the old predicate

**Severity:** WARNING
**File:** `prisma/migrate-deploy.mjs:816-856`; `tests/integration/migration-preflight.test.ts:629-720`

**Issue:** The rewrite is correct (verified above), and the executor's honesty about the
missing RED is commendable. But the conclusion drawn — "IN-01's dead branch cannot be made
to go red either — a branch that is unreachable is unreachable from a test too" — is true
only at the level the tests were written at. `hasExactDefinitions` and
`planningRoundStatusLabels` are **pure functions over plain arrays**. Nothing requires their
inputs to come from PostgreSQL, and the admitted-shape argument ("the collapse needs two
expected entries sharing a name, and PostgreSQL makes names unique") is an argument about
what a *database* can produce, not about what the *function* can be called with.

A direct unit test does go red against the pre-fix predicate:

```js
hasExactDefinitions(
  [{ name: "a", definition: "d" }, { name: "z", definition: "other" }],
  [["a", "d"], ["a", "d"]],
  (x) => x,
);
// old form: cardinalities agree (2 === 2) and both expected entries match the SAME
//           actual entry  -> true  (the WR-07 hole)
// new form: the first match is spliced out, the second finds nothing -> false
```

As it stands, `prisma/migrate-deploy.mjs` has **no exports at all** and calls `await main()`
at module scope (`:1081`), so the functions are unreachable from a test file. The practical
consequence: if someone reverts `hasExactDefinitions` to the weaker form tomorrow, all 30
preflight cases still pass, and the property the rewrite exists to state is protected by a
comment alone.

Secondary note in the same function: `return remaining.length === 0` (`:855`) can never be
false. The early `actual.length !== expected.length` guard plus exactly one `splice` per
expected entry make it a tautology. That is harmless today, but it makes the injectivity
property look like it is enforced by a runtime check when it is actually enforced by the
cardinality guard — a future editor who relaxes the guard would silently reopen WR-07.

**Fix:** move the pure catalog helpers into `prisma/schema-catalog.mjs` (no side effects,
named exports), import them from `migrate-deploy.mjs`, and add
`tests/unit/schema-catalog.test.ts` covering: the duplicate-name collapse above; an extra
actual entry with matching cardinality; and `planningRoundStatusLabels` over all reachable
migration prefixes plus the empty set. Alternatively, guard the entrypoint
(`if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();`) and export
the helpers from the existing file.

---

### WR-06: the mint half of the booking capability is public while the invariant-bearing ensure half is private

**Severity:** WARNING
**File:** `src/domain/planning/planning-service.ts:1238-1258` and `:1287-1311`

**Issue:** `ensureBookingRequestAction`, which *is* the D-23 "at most one live
`book-request` row per round" invariant, is `private`. `mintBookingRequestAction`, which
unconditionally inserts a second live row, is `public` — and has no caller anywhere in
`src/` or `tests/` other than the ensure. Its own doc comment says so:

> "The MINT HALF only. Every caller goes through `ensureBookingRequestAction` instead …
> this method is reached from there and from nowhere else."

The visibility is exactly inverted relative to the invariant. The one method that can break
G-02 is the reachable one; the one that preserves it cannot be called. That is the shape a
future plan reintroduces the gap through — a new booking-adjacent transition reaches for the
public method because it is the only one it can see.

**Fix:** make the mint private and, if an external caller is ever genuinely needed, expose
the ensure instead.

```ts
- async mintBookingRequestAction(
+ private async mintBookingRequestAction(
    tx: Prisma.TransactionClient, round: PlanningRound, now: Date,
  ): Promise<MintedPlanningAction> {
```

`npm run typecheck` should pass unchanged; nothing outside the class references it.

---

## Observations (verified, not raised as findings)

These are things I checked and deliberately decided not to file, recorded so the next
reviewer does not re-derive them:

- **`requestBooking`'s supersede has no `expiresAt` filter** (`planning-service.ts:2794-2806`).
  It sets `expiresAt: now` on rows that may already be expired, which moves their expiry
  *forward*. It never makes a row live — the boundary refuses `expiresAt <= now` and every
  later request carries a later `now` — so the only effect is a slightly longer retention
  window before `reapExpiredActions` collects them. Not worth a change.
- **`repostAnchor`'s "the announcement slot is reached only for a non-null pointer" comment**
  (`:1462-1473`) is not strictly guaranteed: if `releaseAnnouncementClaim` itself fails, a
  round can hold a non-null `readyAnnouncedAt` with a null `announcementMessageId`, and the
  next post-cooldown `/plan_status` reaches the slot with `supersededMessageId === null`.
  The branch behaves correctly in that state (post, re-anchor, nothing to clear), so the
  comment is imprecise rather than the code wrong.
- **Concurrent `keepBooking` and an answer-path `post` could both call
  `ensureBookingRequestAction` and both mint.** The window requires READ COMMITTED
  interleaving between the `findMany` and the `create` in two transactions for the same
  round. `sequentialize` by `chat.id` (`src/app/create-bot.ts:62`) serialises the two
  updates in practice, and both paths are already gated by their own compare-and-set. I
  could not construct a reachable interleaving.
- **`editAnchor` answers `CALLBACK_STALE` when `anchorMessageId` is null even though the
  answer committed** (`:1218-1221`). Pre-existing, narrow, and the durable write is correct.
- **`rememberRender` evicts on `size >= LIMIT` before checking whether the key already
  exists**, so a repeat write can evict one entry needlessly. It is a request-saver only
  (D-28), so nothing observable depends on it.
- Static sweep of the changed source: no `as any`, no `@ts-ignore`/`@ts-expect-error`, no
  non-null assertions, no `console.log`/`debugger`, no `TODO`/`FIXME`/`HACK`, no empty catch
  blocks, no `==`, no commented-out code.

---

_Reviewed: 2026-09-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
