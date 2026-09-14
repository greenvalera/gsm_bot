---
phase: 03-availability-and-booking-decision
plan: 03
subsystem: api
tags: [prisma, postgres, grammy, telegram, vitest, testcontainers]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-01's tracer: the BOOKED enum value and its migration, the shared
      never-consumed answer tokens, availabilityStepProjection, and the private
      availabilityActions token lookup this plan absorbs into
      loadAvailabilityActions"
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-02's availability card: renderAvailabilityCard, its legend and
      outcome sentences, AnswerResult.answered.owner, and the BRANCHES logging
      gate this plan extends with three distinguishable re-post reasons"
  - phase: 02-weekly-rehearsal-proposal
    provides:
      "WEEK_CLAIMING_STATUSES and weekIsClaimed, the status()/reanchor() cooldown
      and compare-and-set pair, repostAnchor's post-reanchor-clear ordering, and
      the PLANNING_REASONS / PLANNING_OUTCOMES bounded vocabulary"
provides:
  - "WEEK_CLAIMING_STATUSES widened with BOOKED, and all three INNER filters that narrow past it (:786 previousRehearsal, :809 wasPreviousParticipant, :949 startOrResume's claiming read) now read the constant"
  - "mintStepActions branches on STATUS before STEP — a non-draft round mints no wizard confirm/back pair"
  - "RECOVERABLE_ROUND_STATUSES — the draft/confirmed/booked set /plan_status and reanchor admit, deliberately separate from WEEK_CLAIMING_STATUSES"
  - "/plan_status as a working recovery path: the live availability card for a collecting round, a control-free summary for a booked one (D-03/D-16)"
  - "PlanningService.loadAvailabilityActions — one load-not-mint token lookup shared by the answer re-render and the status re-post (T-03-18)"
  - "PlanningService.availabilityProjection — the read half renderStep needs, over the confirm-time snapshot"
  - "withoutEmptyKeyboard — an empty grammY InlineKeyboard is dropped so a booked summary carries no reply_markup at all"
  - "Three distinguishable log reasons under the one status-reposted outcome: card-reposted-at-chat-bottom, availability-card-reposted, booked-summary-reposted"
affects:
  - 03-04-ready-to-book-announcement
  - 03-05-manual-booking
  - phase-04-lifecycle
  - phase-05-reminders

actuals:
  tokens: 78948
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Position-before-step branching: a promoted round keeps REVIEW in its `step` column forever, so every render and mint site asks `status` first and `step` only inside the draft branch"
    - "Two named status sets, never one: WEEK_CLAIMING_STATUSES answers 'does this round hold its week', RECOVERABLE_ROUND_STATUSES answers 'can this round be re-posted', and they disagree on both DRAFT and BOOKED"
    - "Load-not-mint for a standing capability: a surface open to every chat member re-reads the round's existing tokens instead of minting, so capability count per round is bounded"
    - "An empty InlineKeyboard is dropped rather than sent: grammY serializes it as `[[]]`, which still claims a markup"

key-files:
  created: []
  modified:
    - src/domain/planning/target-week.ts
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - tests/unit/target-week.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-round.test.ts
    - tests/integration/planning-recovery.test.ts

key-decisions:
  - "RECOVERABLE_ROUND_STATUSES is a SECOND constant rather than a reuse of WEEK_CLAIMING_STATUSES. The two sets disagree at both ends — a DRAFT round is recoverable and claims no week, a BOOKED round does both — so sharing one list would make a Phase 4 edit to either question silently change the other"
  - "The status() cooldown claim widened together with the round read, in the same commit. A claim still naming DRAFT alone would never match the confirmed round the read just returned, so every status request for a collecting round would answer cooling-down forever — the widening is only correct as a pair"
  - "The private availabilityActions helper from 03-01 was RENAMED to loadAvailabilityActions and reused, not duplicated. The plan named a new method; a second parallel token lookup would have been free to drift from the answer path's, and the two would then disagree about which capabilities a card carries"
  - "The booked round's control-free card is produced by DROPPING the keyboard, not by sending an empty one. The plan asserted markupOf would omit reply_markup on its own, but planningKeyboard always returns an InlineKeyboard and grammY serializes an empty one as `[[]]` — a claimed markup that paints an empty strip. withoutEmptyKeyboard is the missing step"
  - "loadAvailabilityActions now asserts consumedAt: null. The answer rows are never consumed today, so this changes nothing now; it stops a future transition that starts spending one from leaving a dead token on a re-posted keyboard"
  - "The re-post reason is chosen from the round's POSITION, the same input renderStep branches on, so the log line and the card in the chat cannot drift apart"

patterns-established:
  - "Site-numbered test names (`SITE :949 — ...`): each widened call site owns a named assertion, so a site reverted alone fails a test that names it rather than an aggregate"
  - "A constant's CONTENTS are pinned by their own case (`lists exactly the three recoverable positions, superseded excluded`), so a widening that swept a terminal status in is a failing test rather than a silent authorization change"
  - "A Prisma double that EVALUATES `{ in }` rather than throwing on it, so a status guard written in that operator is exercised by the unit gate instead of waved through"

requirements-completed: []

coverage:
  - id: D1
    description:
      "WEEK_CLAIMING_STATUSES lists the confirmed and booked labels, and
      weekIsClaimed reports a week claimed when its only round is booked (D-15)"
    requirement: LIFE-01
    verification:
      - kind: unit
        ref: "tests/unit/target-week.test.ts#counts a booked round as claiming its week, exactly as a confirmed one does"
        status: pass
      - kind: unit
        ref: "tests/unit/target-week.test.ts#lists exactly the two week-claiming statuses, confirmed first"
        status: pass
      - kind: unit
        ref: "tests/unit/target-week.test.ts#counts neither a draft nor a superseded round"
        status: pass
    human_judgment: false
  - id: D2
    description:
      "SITE :949 — a booked round claims its target week: startOrResume offers a
      later week rather than re-opening a booked one, and refuses with the
      no-free-week result only when every candidate week is claimed"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :949 — offers a different week rather than re-opening a booked one"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :949 — refuses when every candidate week is claimed by a booked round"
        status: pass
    human_judgment: false
  - id: D3
    description:
      "SITE :786 — a booked round is still the chat's previous rehearsal, so the
      PLAN-05 usual-day and PLAN-07 last-rehearsal markers do not regress the
      moment a chat starts booking"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :786 — a booked round is still the chat's previous rehearsal"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :786 — still prefers the most recent qualifying round"
        status: pass
    human_judgment: false
  - id: D4
    description:
      "SITE :809 — a member who appears only in a booked round's participant
      snapshot is still admitted by the PREVIOUS_PARTICIPANTS planning-access
      policy, and a superseded round still admits nobody (AUTH-01, T-03-16)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :809 — still admits a member who appears only in a booked round"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#SITE :809 — a superseded round still claims nothing and admits nobody"
        status: pass
    human_judgment: false
  - id: D5
    description:
      "mintStepActions returns an empty list and creates zero callback_actions
      rows for a round that has left the wizard (RESEARCH Pattern 7)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#mints no wizard controls for a round that has left the wizard"
        status: pass
    human_judgment: false
  - id: D6
    description:
      "SITE :1774 — /plan_status for a CONFIRMED round re-posts the live
      availability card with both answer controls instead of the no-active-round
      reply (D-03)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#SITE :1774 — re-posts the live availability card with both answer controls"
        status: pass
    human_judgment: false
  - id: D7
    description:
      "The re-post REUSES the round's two existing answer tokens and mints none:
      the live answer-capability count is two before and after, and a token from
      the re-posted keyboard still records an answer (T-03-18)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#SITE :1774 — reuses the round's existing answer tokens rather than minting more"
        status: pass
    human_judgment: false
  - id: D8
    description:
      "/plan_status for a BOOKED round posts a control-free summary — no
      reply_markup at all, not an empty keyboard (D-16)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#SITE :1774 — re-posts a booked round as a control-free summary (D-16)"
        status: pass
    human_judgment: false
  - id: D9
    description:
      "The negative half of the widening: a chat whose newest round is superseded
      still gets the no-active-round reply and still claims the chat-level
      cooldown for it; and a second request for a CONFIRMED round is refused as
      cooling-down from the first (T-03-20)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#still answers no-active-round when the newest round is superseded"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#rate-limits a second status request for a confirmed round"
        status: pass
    human_judgment: false
  - id: D10
    description:
      "SITE :1887 — reanchor admits the draft, confirmed and booked positions at
      the expected revision and still refuses a superseded round and a
      mismatched revision, with the anchor and cooldown stamp still moving
      together (T-03-19)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#admits the draft, confirmed and booked positions at the expected revision"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#still refuses a superseded round and a mismatched revision"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#lists exactly the three recoverable positions, superseded excluded"
        status: pass
    human_judgment: false
  - id: D11
    description:
      "Each of the three status re-post shapes emits exactly one log line whose
      outcome-and-reason pair is unique across the whole branch enumeration
      (T-03-22)"
    requirement: AVAIL-01
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a status request that re-posts the availability card"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a status request that re-posts a booked round's summary"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
    human_judgment: false

# Metrics
duration: 29 min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 03: Recovery and Status Summary

**`BOOKED` carried through the three inner week/authorization filters, and `/plan_status` turned into a working recovery path that re-posts the live availability card for a collecting round and a control-free summary for a booked one — reusing the round's existing answer tokens rather than minting more.**

## Performance

- **Duration:** 29 min of execution across two runs (first run 2026-09-05T22:20Z–22:37Z, interrupted; continuation run 2026-09-06T06:14Z–06:29Z)
- **Started:** 2026-09-05T22:20:00Z (approx., first run)
- **Completed:** 2026-09-06T06:29:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- **All five call sites named in RESEARCH Pattern 7 are changed, each with its own passing assertion.** The five were separable ways to ship a silent regression, so none of them shares a test with another.
- **`WEEK_CLAIMING_STATUSES` gained `BOOKED` and stopped being dead code at three sites.** It is an *inner* filter: `previousRehearsal` (:786), `wasPreviousParticipant` (:809) and `startOrResume`'s claiming read (:949) each handed it a row set they had already narrowed with a hard-coded literal, so widening the constant alone would have changed nothing at any of them. `:809` is an authorization filter — the sole input to the `PREVIOUS_PARTICIPANTS` policy — so leaving it narrow would have silently denied members the day a chat first booked.
- **A non-draft round mints no wizard controls.** `stepTargets` falls through its day and time branches into the review branch for any other input, so a promoted round reaching `mintStepActions` used to mint a live Confirm/Back pair for controls its card does not have. The guard is STATUS before STEP, because `step` stops being meaningful the moment a round leaves the wizard.
- **`/plan_status` works for a round that has left the wizard (D-03).** Both gates had to widen together: `status()`'s round read and `reanchor()`'s compare-and-set. Widening either alone leaves the path unreachable, and widening the round read without the cooldown claim beside it would have answered every request for a confirmed round with `cooling-down` forever.
- **The re-post mints nothing (T-03-18).** `/plan_status` is open to every member of the chat, so a re-post that minted would let anyone inflate the number of live write capabilities for one round without limit. `loadAvailabilityActions` reads the round's two standing answer rows; the integration case proves the count is two before and after, and that a token taken off the *re-posted* keyboard still records an answer.
- **A booked round's summary carries no keyboard at all (D-16).** Not an empty one — grammY serializes an empty `InlineKeyboard` as `[[]]`, which still claims a markup.
- **Three re-posts under one outcome stay tellable apart in the logs (T-03-22).** `availability-card-reposted` and `booked-summary-reposted` joined the bounded reason vocabulary and the `BRANCHES` gate, which requires globally unique outcome-and-reason pairs.

## Task Commits

Each task was committed atomically, RED then GREEN:

1. **Task 1: the three week/authorization filters — sites :786, :809 and :949** — `2b54c38` (test), `52c53af` (feat)
2. **Task 2: the recovery path — sites :1774 and :1887, and the status re-post for non-draft rounds** — `4925955` (test), `af6eebf` (feat)

_Task 2's RED commit landed in the first run; its GREEN implementation is the continuation run's only production commit._

## Files Created/Modified

- `src/domain/planning/target-week.ts` — `WEEK_CLAIMING_STATUSES` gains `BOOKED`; the comment records that the list is an INNER filter three queries also read, and names Phase 4's LIFE-02/LIFE-06 as the next editor
- `src/domain/planning/planning-service.ts` — `RECOVERABLE_ROUND_STATUSES`; the three widened week/authorization filters; `mintStepActions`' status guard; `status()`'s widened round read, widened cooldown claim and position-chosen action set; `loadAvailabilityActions` (absorbed from 03-01's private `availabilityActions`, now asserting `consumedAt: null`); `availabilityProjection`; `reanchor()`'s widened compare-and-set
- `src/telegram/planning-handlers.ts` — `renderStep`'s status-before-step branch; `withoutEmptyKeyboard`; `repostReasonFor`; two new `PLANNING_REASONS` entries
- `tests/unit/target-week.test.ts` — `weekIsClaimed` over a booked row, and the constant's pinned contents
- `tests/unit/planning-logging.test.ts` — three pinned re-post reasons in `BRANCHES`; the Prisma double now EVALUATES a `{ in }` status guard rather than throwing on it
- `tests/integration/planning-round.test.ts` — one real-PostgreSQL case per widened site, plus the superseded negative and the no-mint assertion
- `tests/integration/planning-recovery.test.ts` — the confirmed re-post, the load-not-mint token count, the control-free booked summary, the superseded refusal, the confirmed-round cooldown, and `reanchor` across every admitted and refused position

## Decisions Made

- **`RECOVERABLE_ROUND_STATUSES` is a second constant, not a reuse.** The two sets disagree at both ends: a `DRAFT` round is recoverable and claims no week; a `BOOKED` round does both. Sharing one list would make a Phase 4 edit to either question silently change the other, so the plan's instruction not to reuse was followed and pinned by its own test.
- **The private `availabilityActions` helper from 03-01 was renamed and reused rather than duplicated.** The plan specified a new `loadAvailabilityActions` method; adding one beside the existing helper would have left two parallel token lookups free to drift, and they would then have disagreed about which capabilities a card carries. Consolidating that seam was explicitly in scope.
- **`loadAvailabilityActions` now asserts `consumedAt: null`.** The answer rows are never consumed today, so nothing changes now; it stops a future transition that starts spending one from leaving a dead token on a re-posted keyboard.
- **The booked summary drops its keyboard rather than sending an empty one.** See deviation 1 below.
- **The re-post reason is derived from the round's position**, the same input `renderStep` branches on, so the log line cannot describe a different card from the one the chat received.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's control-free card mechanism does not produce a control-free card**

- **Found during:** Task 2 (renderStep's status branch)
- **Issue:** The plan states that for a booked round "`planningControlRows` drops all of them and `markupOf` omits `reply_markup` entirely". It does not. `renderAvailabilityCard` ends in `planningKeyboard(...)`, which always returns an `InlineKeyboard` — never `undefined` — and grammY serializes a keyboard with no resolved rows as `{"inline_keyboard":[[]]}`. `markupOf` only omits `reply_markup` when `card.keyboard === undefined`, so following the plan literally would have sent a claimed-but-empty markup. The committed test asserts exactly this (`expect(posted?.payload.reply_markup).toBeUndefined()`, with the comment "Not an empty keyboard — no keyboard at all").
- **Fix:** Added `withoutEmptyKeyboard`, which returns the card without a `keyboard` field when every resolved row is empty. `markupOf` then leaves `reply_markup` off the payload, and no disabled-button concept is needed.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `tests/integration/planning-recovery.test.ts#SITE :1774 — re-posts a booked round as a control-free summary (D-16)` passes
- **Committed in:** `af6eebf`

**2. [Rule 1 - Bug] A committed RED test counted the wrong rows and could never have gone green**

- **Found during:** Task 2 (running the committed integration suite)
- **Issue:** `planning-recovery.test.ts`'s `actionsFor` helper counted `callbackAction` rows with `targetId: { contains: '"roundId":"<id>"' }` — every token the wizard ever minted against the round, consumed or not: seven day tokens, ten slot tokens, the trailing controls, and the two answer rows. Its own assertion `expect(before).toBe(2)` therefore failed with 22, and its doc comment ("Every *unconsumed* callback row") did not describe the query either. Worse, a substring count would have reported "unchanged" just as happily if the re-post had minted a third *answer* row and consumed a stale one — so the helper could not detect the capability inflation it exists to detect (T-03-18).
- **Fix:** Narrowed `actionsFor` to count unconsumed rows matching the two exact serialized answer targets `mintAvailabilityActions` writes. The author's `toBe(2)` assertion and the before/after equality both stand unchanged, and the count is now the number actually under test: how many buttons can write to this round.
- **Files modified:** `tests/integration/planning-recovery.test.ts`
- **Verification:** the case now passes with `before === 2`; deliberately re-running it against a minting implementation fails
- **Committed in:** `af6eebf`

**3. [Rule 3 - Blocking] Two committed integration cases shared one chat id**

- **Found during:** Task 2 (running the committed integration suite)
- **Issue:** The new "still answers no-active-round when the newest round is superseded" case used `-1008000000034n`, already configured by "strips a repost superseded between delivery and re-anchoring" earlier in the same file. All cases share one container, so the second `chatConfiguration.create` failed the unique key on `chat_id` before any assertion ran.
- **Fix:** Gave the new case its own chat id (`-1008000000036n`) and recorded why in a comment.
- **Files modified:** `tests/integration/planning-recovery.test.ts`
- **Verification:** `npx vitest run --project integration tests/integration/planning-recovery.test.ts` — 28 passed
- **Committed in:** `af6eebf`

**4. [Process] This plan was executed across two runs**

- The first executor completed Task 1 (RED + GREEN) and committed Task 2's RED tests, then was killed by a provider rate limit immediately before writing Task 2's implementation. The continuation run resumed at Task 2's GREEN with the committed tests as its executable spec. No committed test was weakened, deleted or rewritten to make the implementation pass — the three test changes above are the two genuine defects and the chat-id collision, each documented here as the instructions require.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking) plus 1 process note
**Impact on plan:** All three fixes were required for the plan's own acceptance criteria to be satisfiable. Deviations 2 and 3 restore assertions the plan asked for; deviation 1 supplies the one mechanical step the plan's `<action>` narrative omitted. No scope creep — no new behaviour was added beyond the plan's five call sites and the two service methods it names.

## Threat Flags

None — this plan introduces no network endpoint, no new auth path, no new file access and no schema change. The two boundaries it touches (`wasPreviousParticipant` as an authorization input, and the status re-post as a capability source) are both already in the plan's `<threat_model>` as T-03-16 and T-03-18, and both are mitigated and asserted.

## Known Stubs

None. Every symbol this plan declares is reached by a passing test, and no `<verify>` block went unrun.

## Issues Encountered

- **A fresh worktree has no `node_modules` and no generated Prisma client.** `npm ci` plus a `prisma generate` under a dummy `DATABASE_URL` (the config resolves the variable at load time even for a generate that never connects) was needed before any test could run. No dependency file was edited.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **03-04 (ready-to-book announcement)** and **03-05 (manual booking)** can proceed. 03-05 is the plan that first writes `BOOKED`; every read side is now ready for it — the week claim, the previous-rehearsal read, the `PREVIOUS_PARTICIPANTS` admission, the wizard's mint guard, and the control-free status re-post all already handle the position, each proved against a directly seeded booked round.
- **`RECOVERABLE_ROUND_STATUSES` is the seam Phase 4's lifecycle work lands on.** A new position that renders its own card must be added to that constant, to `renderStep`'s branch, and to `repostReasonFor` — the last is enforced, because the `BRANCHES` gate fails a re-post shape that reuses another one's reason.
- **No blockers.** `npm run typecheck`, `npm run lint`, `npm run test:unit` (303 passed) and `npm run test:integration` (175 passed) are all green on this worktree.

## Self-Check: PASSED

Files (all `modified`, none `created`):

- `src/domain/planning/target-week.ts` — FOUND
- `src/domain/planning/planning-service.ts` — FOUND
- `src/telegram/planning-handlers.ts` — FOUND
- `tests/unit/target-week.test.ts` — FOUND
- `tests/unit/planning-logging.test.ts` — FOUND
- `tests/integration/planning-round.test.ts` — FOUND
- `tests/integration/planning-recovery.test.ts` — FOUND

Commits: `2b54c38` FOUND, `52c53af` FOUND, `4925955` FOUND, `af6eebf` FOUND.

Acceptance criteria, re-run after the final commit:

| Criterion | Command | Result |
|---|---|---|
| T1 — constant read by `weekIsClaimed` | `grep -c WEEK_CLAIMING_STATUSES src/domain/planning/target-week.ts` | 3 (≥2) PASS |
| T1 — SITE :786 | `awk '/async previousRehearsal\(/,/^  \}$/' … \| grep -c` | 1 PASS |
| T1 — SITE :809 | `awk '/async wasPreviousParticipant\(/,/^  \}$/' … \| grep -c` | 1 PASS |
| T1 — SITE :949 | `grep -A 3 'const claiming = await tx.planningRound.findMany' … \| grep -c` | 1 PASS |
| T1 — service total | `grep -c WEEK_CLAIMING_STATUSES src/domain/planning/planning-service.ts` | 7 (≥4) PASS |
| T2 — constant total | `grep -c RECOVERABLE_ROUND_STATUSES src/domain/planning/planning-service.ts` | 6 (≥4) PASS |
| T2 — SITE :1774 | `awk '/^  async status\(/,/^  \}$/' … \| grep -c` | 2 (≥2) PASS |
| T2 — SITE :1887 | `awk '/^  async reanchor\(/,/^  \}$/' … \| grep -c` | 1 PASS |
| T2 — loader | `grep -c loadAvailabilityActions …planning-service.ts` | 3 (≥2) PASS |
| T2 — projection | `grep -c availabilityProjection` in service / handlers | 1 / 1 (≥1 each) PASS |
| T2 — reasons in handlers | `grep -c 'availability-card-reposted\|booked-summary-reposted' …planning-handlers.ts` | 4 (≥4) PASS |
| T2 — reasons in unit test | same over `tests/unit/planning-logging.test.ts` | 2 (≥2) PASS |

Plan-level `<verification>`:

| Command | Result |
|---|---|
| `npx vitest run --project unit tests/unit/target-week.test.ts` | PASS |
| `npx vitest run --project unit tests/unit/planning-logging.test.ts` | PASS (51 tests, no indistinguishable-branch failure) |
| `npx vitest run --project integration tests/integration/planning-round.test.ts` | PASS |
| `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | PASS (28 tests) |
| `npm run test:unit` | PASS (25 files, 303 tests) |
| `npm run test:integration` | PASS (14 files, 175 tests) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-06*
