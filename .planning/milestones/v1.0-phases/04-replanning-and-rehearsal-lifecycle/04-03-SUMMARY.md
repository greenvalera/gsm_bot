---
phase: 04-replanning-and-rehearsal-lifecycle
plan: "03"
subsystem: planning
tags: [telegram, cancellation, authorization, lifecycle]
status: complete
requires:
  - phase: 04-02
    provides: Shared announcement slot and terminal refusal vocabulary
provides:
  - Confirmed cancellation from drafts, confirmed proposals, and booked rehearsals
  - Durable cancellation audit and retained participant standing
  - Independent correction of both Telegram cards and booked cancellation notice
affects: [04-04, 04-05, 05-reminders-and-reliability]
tech-stack:
  added: []
  patterns: [transactional lifecycle gate, shared lifecycle control placement, exhaustive cancellation dispatch]
key-files:
  created:
    - tests/integration/planning-cancel.test.ts
    - tests/integration/planning-cancel-telegram.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/shared/callback-schema.ts
    - src/telegram/handlers.ts
    - src/telegram/keyboards.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-booking.test.ts
    - tests/integration/planning-confirm.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/integration/planning-round.test.ts
    - tests/unit/planning-availability-card.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/unit/update-route-ownership.test.ts
key-decisions:
  - Cancellation uses a separate eligible-status set and freshly authorizes every action before consumption.
  - Participant snapshots retain standing across cancelled and superseded history, including replanned drafts.
  - One message carries lifecycle controls while the availability anchor retains its answer controls.
  - Existing booked rounds receive newly minted cancellation controls with a future expiry even after their rehearsal time.
requirements-completed: [LIFE-03, LIFE-06]
coverage:
  - id: D1
    description: Author or current administrator can confirm cancellation without consuming refused actions.
    requirement: LIFE-03
    verification:
      - kind: integration
        ref: tests/integration/planning-cancel.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/planning-cancel-telegram.test.ts
        status: pass
    human_judgment: true
    rationale: Real Telegram notification prominence and confirmation clarity remain end-of-phase UAT judgments.
  - id: D2
    description: Cancellation preserves historical participant standing and corrects both durable message surfaces.
    requirement: LIFE-06
    verification:
      - kind: integration
        ref: tests/integration/planning-round.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/planning-cancel-telegram.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 24052
  tasks: 3
  commits: 12
duration: 23min
completed: 2026-09-09
---

# Phase 4 Plan 3: Rehearsal Cancellation Summary

Cancellation now requires a fresh authorized confirmation, preserves rehearsal history, and corrects both Telegram cards independently while notifying the group when a booked rehearsal is cancelled.

## Tasks and Commits

1. Domain lifecycle and standing: `51eb145` RED, `cfef367` GREEN. The same production commit makes cancellation reachable and widens historical participant standing. Transactions retain snapshots, record cancellation actor/time, release the active week, increment revision once, and keep refused tokens unconsumed.
2. Cards and control placement: `08d16e1` RED, `4222018` GREEN. Cancellation confirmation, settled notice, and terminal availability rendering expose no undo action. Shared controls remain available to eligible people regardless of the last actor's role.
3. Telegram command and callbacks: `3a550dc`, `27cfd96`, `e06c4d8`, `3edad46`, and `55723c5` add failing surface regressions; `46b911c` aligns existing booking/recovery expectations; `5e6cad1` completes production dispatch and remaining regression expectations. `/plan_cancel` and three inline actions share exhaustive result handling, immediate acknowledgement, and distinct outcome/reason logging.

The documentation commit records this summary. Actual tokens are the realized source/test diff character count divided by four and rounded up, not harness usage. Sixteen production/test files changed; no dependency or migration was added.

## Deviations from Plan

- **[Rule 1 - Bug] Serialize cancellation with answers and replan.** The lifecycle gate now takes the existing per-round advisory lock before reading the round, preventing a concurrent answer from mutating participant history after cancellation. A race integration test verifies both valid orderings.
- **[Rule 1 - Bug] Keep old booked cancellation controls live.** Newly minted requests use at least the wizard lifetime when the original availability expiry is past. A recovered past-end booked round can therefore still be cancelled.
- **[Rule 2 - Correctness] Preserve controls across every redraw.** Declining cancellation restores answer, Replan, and booking controls as appropriate; declining booking also restores Cancel. The single-message requirement applies to lifecycle controls, while answer buttons remain on the availability anchor. Independent Telegram tests caught and pinned these redraw paths.
- **[Rule 1 - Documentation] Correct the draft snapshot assumption.** Replanned drafts already snapshot the roster. Standing therefore checks historical participation without a status filter; it does not assume all drafts lack participants.
- **[Rule 2 - Maintainability] Share exhaustive cancellation result dispatch.** Three action wrappers use one exhaustive `finishCancel` branch ladder rather than repeating identical logic. Each route retains distinct refusal/failure reasons and success branches use explicit typed reason constants.

## Automated Validation

- Full unit suite: **348 passed**, 25 files.
- Full integration invocation: **259 passed, 12 failed** out of 271; failures were existing exact keyboard expectations that omitted the new cancellation control. After correcting those expectations, complete affected suites passed: availability 39, planning round 20, confirmation 19, booking 25, and recovery 42. This composed evidence covers all **271 integration tests**; a second full invocation was unnecessary for expectation-only fixes.
- Cancellation service tests: 7 passed, including authorization demotion, revision conflict, replay, future token expiry, and answer/cancel serialization. Telegram cancellation surface tests: 9 passed, including both-message correction after the first edit fails and preserving controls after declines.
- TypeScript passed. Temporarily removing the cancellation `already-cancelled` branch caused the expected `never` exhaustiveness error; the branch was restored and TypeScript passed again.
- Scoped Prettier and whitespace checks passed. Repository-wide formatting remains a pre-existing unrelated failure and was not broadened into this plan.
- TDD RED commits precede both domain and renderer GREEN commits; independent Telegram RED tests precede the final surface GREEN commit.

## Limitations and Follow-up

Telegram correction is best effort after the durable cancellation commits: an edit failure is logged, the other message is still corrected, and the database transition is not rolled back. A booked cancellation sends its separate group notice. Real Telegram presentation remains in the phase UAT runbook. Command execution is wired; this repository does not manage Telegram's command menu through `setMyCommands`.

No implementation stubs, skipped tests, new dependency, or additional unmodeled security surface were introduced. Existing uses of the word placeholder describe deliberate unbound capability actors, not missing functionality. State and roadmap advancement belong to the parent phase orchestrator.

## Self-Check: PASSED

All sixteen listed source/test artifacts exist, all eleven implementation/test commits above are present, and the complete plan summary is written at the required path.
