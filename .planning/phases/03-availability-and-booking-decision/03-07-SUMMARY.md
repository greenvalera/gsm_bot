---
phase: 03-availability-and-booking-decision
plan: 07
subsystem: database
tags: [prisma, postgres, telegram, callback-tokens, capability-lifetime, ordering]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides: "The ready-to-book announcement, its booking control and `loadAvailabilityActions`' load-never-mint lookup (03-03), and the `/plan_status` re-post widened to every recoverable position (03-04, D-03)"
  - phase: 03-availability-and-booking-decision
    provides: "The shared `claimReadyAnnouncementWindow` compare-and-set and the `card` seam threaded into `renderStep` (03-06)"
provides:
  - "PlanningService.ensureBookingRequestAction — the round's ONE standing booking capability, loaded if it exists and minted only if it does not"
  - "A total `orderBy: [{ createdAt: asc }, { token: asc }]` on both capability lookups, making the last-row-wins collapse in `controlTokens` deterministic"
  - "A draft-status guard on `mintTakeoverAction`, so the phase's most open command performs no capability write for a round that could never spend it"
  - "A supersede-then-mint step in `requestBooking`, bounding the live confirm/keep pair at one"
  - "Eleven integration cases proving each bound against real PostgreSQL"
affects: [phase-04, phase-05-reminders, any future path that renders a planning keyboard or mints a planning capability]

actuals:
  tokens: 9543
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Ensure-then-mint: a capability the design calls standing is created in exactly ONE place and loaded everywhere else, so its live count is answerable in a single query at any instant rather than being a function of how the round got here"
    - "A lookup whose result is collapsed last-row-wins carries its ORDER as part of its contract; an unordered read makes the rendered surface depend on physical row order"
    - "Supersede-then-mint inside one transaction: the replacement and the revocation commit together, so there is never an instant with zero live capabilities or with two"
    - "Expire, never delete, to bound a capability set — the callback boundary already refuses an expired row, and the retention sweep measures from expiry, so the audit trail survives"

key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - tests/integration/planning-booking.test.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-recovery.test.ts

key-decisions:
  - "D-23: the standing booking capability is ENSURED, not consumed and not swept — the invariant is 'at most one live book-request row per round', assertable in a single query at any instant"
  - "D-24: the deterministic order is `createdAt` then `token`, ASCENDING — a total order over the table with no new index, and ascending so the newest row is the one the last-row-wins collapse keeps"
  - "D-25: the superseded confirmation pair is EXPIRED, never deleted — the boundary refuses it as stale, and `reapExpiredActions` still reaps it on its own schedule"
  - "The determinism case seeds its duplicate with an EARLIER `createdAt` than the original, not a later one, because that is the variant that actually goes red without the `orderBy`"

patterns-established:
  - "Ensure-then-mint for standing capabilities: one creation site, every other path loads"
  - "Order is contract wherever a query result is collapsed by a last-wins loop"
  - "Bound a capability set by expiring the superseded rows inside the transaction that mints their replacement"

requirements-completed: [AVAIL-01, AVAIL-04, AVAIL-07, LIFE-01]

coverage:
  - id: D1
    description: "The live `book-request` count for a round is exactly one at every instant, however many request/keep cycles the round has been through — the count is answerable rather than merely eventually-small (gap G-02)"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#leaves exactly one live standing row across five request/keep cycles"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#performs no CallbackAction insert for the standing capability on a keep"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/domain/planning/planning-service.ts | grep -c 'mintBookingRequestAction' == 2 — the definition and the single delegation from the ensure lookup"
        status: pass
    human_judgment: false
  - id: D2
    description: "A post-cooldown re-announcement carries the round's EXISTING booking capability and writes no new one; the announcement claim is no longer a minting site once the round already has a live control"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#posts a fresh announcement after the cooldown and clears the old copy"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two renders of an unchanged round produce byte-identical keyboards, tokens included: `loadAvailabilityActions` returns its rows under a total deterministic order, so the last-row-wins collapse in `controlTokens` cannot resolve differently between two runs (the AVAIL-04 / AVAIL-07 ordering edge, re-authored at the keyboard level)"
    requirement: "AVAIL-04"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#renders the NEWEST row for a duplicated control, twice identically"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/domain/planning/planning-service.ts | grep -c '{ createdAt: \"asc\" }' == 2 — both lookups carry the ascending order"
        status: pass
    human_judgment: false
  - id: D4
    description: "`/plan_status` writes no capability row that the round it describes could never use: `mintTakeoverAction` refuses any round that is not a draft, so a status request for a confirmed or booked round performs no `CallbackAction` insert at all (gap G-04)"
    requirement: "AVAIL-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#G-04 — writes no takeover row for a CONFIRMED round"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#G-04 — writes no takeover row for a BOOKED round"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#G-04 — repeated status requests for a confirmed round write nothing at all"
        status: pass
    human_judgment: false
  - id: D5
    description: "The takeover control's eligible set is unchanged by this closure — a draft round abandoned for the inactivity window still offers a current administrator who is not the author a Take over control, still binds the row to the administrator, and still refuses the owner (AUTH-03)"
    requirement: "AVAIL-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#G-04 — still offers takeover on an abandoned DRAFT round, and mints exactly one row"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#G-04 — still writes nothing for a draft round when the asker owns it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts (14 draft-era cases, unchanged and passing)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Opening the booking confirmation twice leaves exactly one live confirm/keep pair: the previous pair is expired in the same transaction that mints the replacement, so no `book-apply` token stays valid while unreachable from screen (review finding WR-06)"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#leaves one live pair after a second request, and the visible token is the one that works"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#leaves two live rows after ten consecutive requests, not twenty"
        status: pass
    human_judgment: false
  - id: D7
    description: "The superseded rows are expired, not deleted: they remain in the table with an expiry at or before the second request's clock, so the retention sweep still reaps them on its own schedule and the token-release audit trail is intact (D-25)"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#expires the superseded pair rather than deleting it (D-25)"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-action-retention.test.ts and tests/integration/planning-token-release.test.ts (14 cases, unchanged and passing)"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/domain/planning/planning-service.ts | grep -c 'callbackAction.deleteMany' == 1 — the pre-existing retention sweep and nothing else"
        status: pass
    human_judgment: false
  - id: D8
    description: "Bounding the confirmation pair did not become binding it: D-19 holds, a second eligible person can still complete the most recent confirmation, and a request the gate refuses expires nothing because every refusal is read-only and precedes any write"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#still lets a second eligible person complete the MOST RECENT confirmation (D-19)"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#expires nothing when the gate refuses the request"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#lets a second eligible person complete a confirmation the author opened (pre-existing D-19 case, unchanged and passing)"
        status: pass
    human_judgment: false

# Metrics
duration: 22 min
completed: 2026-09-07
status: complete
---

# Phase 3 Plan 7: Standing Capabilities, Bounded and Ordered Summary

**Gaps G-02 and G-04 and review finding WR-06 closed: the round's booking control is now created in exactly one place and loaded everywhere else, both capability lookups return their rows under a total order, `/plan_status` writes nothing for a round that could never spend it, and a double-tapped booking request leaves one live confirm/keep pair instead of a growing set of valid tokens nobody can see.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-07T11:16:00Z
- **Completed:** 2026-09-07T11:38:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **The standing booking capability is genuinely standing (G-02).** A new private `ensureBookingRequestAction` performs the same exact-match lookup `loadAvailabilityActions` performs for the `book-request` target, under the same total order, and delegates to `mintBookingRequestAction` only when no live row exists. Both former minting sites — the `post` branch of `answerAvailability` and `keepBooking`'s `kept` return — now go through it, and `mintBookingRequestAction` is called from exactly one place. Five request/keep cycles leave the live count where they found it, and the token on the restored announcement is byte-identical each time.
- **The keyboard stopped depending on physical row order (D-24).** Both lookups carry `orderBy: [{ createdAt: "asc" }, { token: "asc" }]` — a total order, because `token` is the table's primary key, so no new index. This is what makes the AVAIL-04 / AVAIL-07 ordering guarantee true of the *buttons* as well as of the lines: `controlTokens` collapses the rows last-row-wins, so an unordered read let two renders of an unchanged round differ and falsified the edit path's render fingerprint.
- **The phase's most open command performs no wasted capability write (G-04).** `mintTakeoverAction` refuses any round that is not a draft, as its first refusal. Before this, `isTakeoverEligible` measured elapsed author silence alone — true for essentially every confirmed round after half an hour and for every booked round forever — so `/plan_status` inserted one unusable `CallbackAction` per request, and the codebase sat one row-constant edit away from rendering a live take-over-a-booked-rehearsal control.
- **One live booking confirmation pair per round (WR-06).** `requestBooking` expires the round's previous `book-apply` / `book-keep` rows in one `updateMany` before minting the replacement, inside the same transaction — so there is never an instant with zero live pairs or with two. Ten consecutive taps leave two live rows rather than twenty, the superseded confirm token answers as stale at the callback boundary, and the token the requester can actually see is the one that books.
- **Eleven new integration cases against real PostgreSQL**, plus one pre-existing case re-authored because it asserted the defect. Every one of the three fixes was demonstrated RED first.

## Task Commits

Each task carried `tdd="true"` and produced a RED and a GREEN commit.

1. **Task 1 RED: failing gates for the standing capability and row order** — `4999dca` (test)
2. **Task 1 GREEN: ensure-then-mint plus the total order** — `71108cd` (feat)
3. **Task 2 RED: failing gates for the missing takeover status guard** — `7c53c81` (test)
4. **Task 2 GREEN: the takeover mint refuses every non-draft round** — `1f47daa` (feat)
5. **Task 3 RED: failing gates for the unbounded confirmation pair** — `e370453` (test)
6. **Task 3 GREEN: supersede-then-mint in `requestBooking`** — `11670be` (feat)

No REFACTOR commit was needed for any of the three.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | `4999dca` | `71108cd` | — | Pass |
| 2 | `7c53c81` | `1f47daa` | — | Pass |
| 3 | `e370453` | `11670be` | — | Pass |

Every RED commit was recorded with observed failures, and each failure was the
one the fix addresses rather than an import or syntax error:

- Task 1: a fresh booking token on the first keep (`expected 'v1:25f0…' to be 'v1:ddff…'`), the standing row count going `1 -> 2`, the re-announcement rendering a different token, and the duplicated control resolving to the seeded older row.
- Task 2: `expected 23 to be 22`, `expected 26 to be 25`, `expected 24 to be 23` — one wasted insert per request, for the confirmed, booked and repeated-request cases.
- Task 3: `expected 2 to be 1` live rows after a second request and inside the ten-tap loop, and a superseded row still carrying its original thirty-minute expiry.

## Files Created/Modified

- `src/domain/planning/planning-service.ts` — added private `ensureBookingRequestAction`; `mintBookingRequestAction`'s doc comment now names itself the mint half and says why it is kept rather than inlined; `loadAvailabilityActions` gained the `orderBy` and a paragraph recording that the order is part of its contract; the answer path's `post` branch and `keepBooking`'s `kept` return call the ensure lookup; `mintTakeoverAction` gained the draft guard as its first refusal and a fourth documented reason; `requestBooking` gained the supersede `updateMany` after the gate and before the mint.
- `src/telegram/planning-handlers.ts` — `dispatchBookKeep`'s doc comment corrected: the service ENSURES the standing request action rather than minting a fresh one (comment only; no behaviour change).
- `tests/integration/planning-booking.test.ts` — target/count helpers for the standing capability and the confirmation pair; two G-02 cases; five WR-06 cases; one pre-existing case re-authored.
- `tests/integration/planning-availability.test.ts` — a live-standing-row counter; the post-cooldown re-announce case extended with the existing-token and count assertions; a new D-24 determinism describe block that seeds a duplicate answer row directly.
- `tests/integration/planning-recovery.test.ts` — `reachAvailability` gained optional `role` and `now` options; chat/takeover row counters; five G-04 cases (three negatives, two regression guards for the narrowing).

## Decisions Made

- **D-23 (ensure, not expire-then-mint).** G-02 had two possible closures. Ensure-then-mint is taken because it makes the count *answerable* rather than merely eventually-small: the invariant afterwards is "at most one live `book-request` row per round", verifiable in a single query at any instant. Expiring on re-mint would leave the count correct only between sweeps and would keep the rendered token moving, which is what falsifies the render fingerprint.
- **D-24 (ascending `createdAt` then `token`).** A total order over the table with no new column and no new index, because `token` is the primary key. Ascending rather than descending, because `controlTokens` collapses last-row-wins and ascending therefore means the *newest* row wins — the behaviour a reader of that loop expects.
- **D-25 (expire, never delete).** The callback boundary already refuses a row past its expiry before the dispatcher runs, so a superseded confirm token answers as stale — the established refusal shape. Deleting would erase the token-release audit trail and race `reapExpiredActions`, which measures retention *from* expiry.
- **The determinism case seeds its duplicate OLDER, not newer.** The plan specified a `createdAt` strictly later than the original's. Written that way the case passes vacuously: PostgreSQL returns rows in heap order for an unordered `findMany`, so the physically-last row is the seeded one, and if the seeded row is also the newest then the unordered read already produces the "correct" answer. Seeding it *older* keeps the plan's assertion verbatim — "the token rendered equals the NEWEST row's token" — while making the case genuinely red without the `orderBy`. The plan itself flags this hazard ("the case cannot pass reliably"); this resolves it in the direction that preserves the assertion's power.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The determinism case as specified would have passed vacuously**

- **Found during:** Task 1 (RED)
- **Issue:** The plan's step 2 asks for the seeded duplicate to carry a `createdAt` strictly LATER than the original's, and step 4 asserts the rendered token is the newest row's. Under an unordered `findMany` PostgreSQL returns heap order, so the physically-last row is the seeded one — which under that seeding is also the newest. The assertion would therefore have been satisfied without the `orderBy`, and the one probe edge this plan re-opens would have been asserted by nothing.
- **Fix:** Seeded the duplicate with a `createdAt` one second EARLIER than the original's. The plan's stated purpose ("so the two rows have a defined newest") and its assertion (the newest row's token wins) are both preserved exactly; only the direction of the offset changed.
- **Files modified:** `tests/integration/planning-availability.test.ts`
- **Verification:** Recorded RED with `expected 'v1:0758ff9f-…' to be 'seeded-duplicate-…'` — the render picked the seeded older row. Green after the `orderBy`.
- **Committed in:** `4999dca` / `71108cd`

**2. [Rule 1 - Bug] A pre-existing booking case asserted the WR-06 defect itself**

- **Found during:** Task 3
- **Issue:** `refuses a second live confirmation once the round is booked` drove two booking requests and then booked with the FIRST pair's confirm token, relying on that token still being live after the second request opened a second pair. That is precisely the behaviour WR-06 asks to be removed, so the case could not survive the fix as written.
- **Fix:** Re-authored around the property that survives: a second tap still opens a fresh pair (the request row is still standing) and now supersedes the first; the round is booked with the pair that is actually on screen; and the live control that *was* outstanding when the round booked — its sibling keep token — is refused as already booked and is not consumed. Every original assertion that remains true is kept, and the test name now describes what it checks.
- **Files modified:** `tests/integration/planning-booking.test.ts`
- **Verification:** Passes both before and after the Task 3 implementation, which is what a preserved-behaviour guard should do.
- **Committed in:** `e370453`

**3. [Rule 1 - Bug] Three Task 2 cases asserted nothing as first written**

- **Found during:** Task 2 (RED)
- **Issue:** Written with the harness's fixed clock, the confirmed/booked/repeated-request cases all passed immediately — not because the guard existed, but because `isTakeoverEligible` was false for a round whose `lastActivityAt` was seconds old, so no mint was attempted at all.
- **Fix:** Threaded a clock through and advanced past `PLANNING_INACTIVITY_MS` before the status request, which is the state essentially every confirmed round is in half an hour after its last answer and every booked round is in forever. All three then went red by exactly one row.
- **Files modified:** `tests/integration/planning-recovery.test.ts`
- **Verification:** `expected 23 to be 22`, `expected 26 to be 25`, `expected 24 to be 23` before the guard; all green after.
- **Committed in:** `7c53c81` / `1f47daa`

**4. [Rule 1 - Bug] `dispatchBookKeep`'s doc comment became false**

- **Found during:** Task 1 (GREEN)
- **Issue:** The handler's doc comment stated that "the service mints a fresh request action inside the same transaction that spends the keep token" — true before this plan, false after it, and the comment is exactly where a future reader would look to learn the keep path's capability semantics.
- **Fix:** Corrected to say the service ENSURES the round's standing request action, with the reason. Comment only; `src/telegram/planning-handlers.ts` is outside the plan's `files_modified` list but a doc comment made false by this plan's own change is drift this plan introduced.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `npm run typecheck`, `npm run lint` and all 560 tests pass; no behavioural change.
- **Committed in:** `71108cd`

**5. [Rule 3 - Blocking] Integration suite could not start: `./node_modules/.bin/prisma` absent in the worktree**

- **Found during:** Task 1 (RED), before the first test run
- **Issue:** `tests/helpers/postgres.ts` spawns the Prisma CLI at the literal relative path `./node_modules/.bin/prisma`. Git worktrees do not carry `node_modules` (it is gitignored), so every integration test would have errored with `spawn ./node_modules/.bin/prisma ENOENT` — the same gap plan 03-06 hit.
- **Fix:** Symlinked the worktree's `node_modules/.bin` to the parent checkout's. **No package was installed**, nothing was added to `package.json` or the lockfile, and the change lives entirely inside a gitignored directory — worktree environment provisioning, not a dependency change.
- **Files modified:** none tracked.
- **Verification:** `npm run test:integration` — 15 files, 226 tests, all passing.
- **Committed in:** nothing to commit (gitignored).

---

**Total deviations:** 5 auto-fixed (4 bugs, 1 blocking)
**Impact on plan:** None on scope or design. Three were tests that would have asserted nothing as specified — caught by insisting each RED commit actually go red for the right reason. One was documentation drift this plan's own change introduced. One was the known worktree environment gap. Every prohibition holds: the `book-request` row is not consumed on use, the two answer tokens are neither consumable nor expiring nor reduced to one, `mintTakeoverAction`'s eligible set only narrowed and no takeover control was added to any non-draft card, and no callback row is deleted to bound the confirm/keep pair — `callbackAction.deleteMany` still appears on exactly one non-comment line, the pre-existing retention sweep.

## Issues Encountered

None. No checkpoint was reached, no authentication gate was hit, and no verification command went unrun.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run --project integration planning-booking planning-availability planning-recovery planning-takeover` | 102/102 pass |
| `npx vitest run --project integration planning-action-retention planning-token-release` | 14/14 pass — the retention sweep and the release audit trail are unaffected by expiring rather than deleting |
| `npm run test:integration` | 15 files, 226 tests pass (213 before this plan, +13) |
| `npm run test:unit` | 25 files, 334 tests pass |
| `npm run typecheck` | exits 0 |
| `npm run lint` | exits 0 |

Acceptance greps, all satisfied:

| Criterion | Required | Actual |
|---|---|---|
| `mintBookingRequestAction` on non-comment lines | exactly 2 | 2 |
| `ensureBookingRequestAction` on non-comment lines | at least 3 | 3 |
| `{ createdAt: "asc" }` on non-comment lines | at least 2 | 2 |
| `round.status !== PlanningRoundStatus.DRAFT` on non-comment lines | at least 1 | 7 |
| `takeover` in `planning-recovery.test.ts` | at least 6 | 18 |
| `mintBookingConfirmationActions` on non-comment lines | exactly 2 | 2 |
| `callbackAction.deleteMany` on non-comment lines | exactly 1 | 1 |

The plan's fourth verification item — "at any instant during the booking round trip, a single query answers how many live capability rows of each kind a round has" — is the shape of every count helper added here: `liveBookingRequestsFor`, `liveConfirmationsFor` and the pre-existing `actionsFor` are each one `count` over an exact serialized target, and they answer one, at most one pair, and exactly two respectively.

## Known Stubs

None. No `TODO`, `FIXME`, `.skip(` or `.todo(` appears in any file this plan touched, and no `<verify>` went unrun. Nothing was appended to `.planning/WINDOWS.md` because this plan opened no window.

## Threat Flags

None. The plan's register is fully addressed: T-03-45 and T-03-46 by the ensure lookup and the total order, T-03-47 and T-03-48 by the draft guard, T-03-49 and T-03-50 by the supersede step, and T-03-SC holds — no package was installed, no `package.json` or lockfile change was made. No new network endpoint, auth path, file access pattern or schema change was introduced; `prisma/schema.prisma` was read for the `CallbackAction` model and not modified, so the schema gate remains NOT APPLICABLE.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Gaps G-02 and G-04 are closed, and review finding WR-06 with them. G-03 remains open and is closed by `03-08-PLAN.md`; WR-04, WR-05, WR-07 and IN-01 through IN-03 are closed by `03-08` and `03-09`.
- The ensure-then-mint lookup is the seam any future path that wants to render a booking control must use. A path that mints directly would re-open G-02, and the five-cycle case goes red the moment one does.
- `requirements.ready-ids` reports AVAIL-01, AVAIL-07 and LIFE-01 still blocked by sibling plans in this phase that have no SUMMARY yet; AVAIL-04 was already complete. `REQUIREMENTS.md` therefore needed no write and is unchanged.
- STATE.md and ROADMAP.md were deliberately left untouched — the orchestrator owns them.

## Self-Check: PASSED

- All five modified files exist on disk.
- All six commits (`4999dca`, `71108cd`, `7c53c81`, `1f47daa`, `e370453`, `11670be`) are present in `git log`.
- `git diff --diff-filter=D 6d0fb0f..HEAD` is empty — no file was deleted.
- Every task's `<acceptance_criteria>` was re-run and passes (table above); the plan-level `<verification>` commands were all run and are logged above.

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-07*
