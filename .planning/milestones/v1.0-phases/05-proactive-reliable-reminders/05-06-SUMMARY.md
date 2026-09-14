---
phase: 05-proactive-reliable-reminders
plan: "06"
subsystem: reminders
tags: [prisma, lifecycle, settings, transactions]
requires:
  - phase: 05-05
    provides: Durable weekly reminders and authorized planning entry
provides:
  - Transactional setup activation and schedule generation replacement
  - Durable cancelled-week suppression with timezone-preserving boundaries
  - Atomic immutable-round reminder invalidation on lifecycle changes
affects: [05-07, 05-08, 05-09, 05-10]
tech-stack:
  added: []
  patterns: [Transaction-accepting reminder helpers, Durable generation cutoff]
key-files:
  created: [tests/integration/reminder-settings.test.ts, tests/integration/reminder-lifecycle.test.ts]
  modified: [src/domain/chat/setup-service.ts, src/domain/chat/settings-service.ts, src/domain/reminders/reminder-service.ts, src/domain/planning/planning-service.ts, tests/unit/planning-logging.test.ts]
key-decisions:
  - Preserve the cancelled civil week and never shorten its absolute quiet boundary after timezone changes.
  - Invalidate pending and rejected old-generation work, including missed old work, while leaving consumed reservations untouched.
  - Reconciliation reconstructs future work from the committed boundary without requiring a successful postcommit wake.
requirements-completed: [REM-01, REM-03, REM-05, RELI-02, RELI-03]
actuals:
  tokens: 7504
  tasks: 2
  commits: 5
duration: 11min
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 06: Atomic Reminder Settings and Lifecycle Summary

Setup and schedule saves now commit durable reminder eligibility with their callbacks; cancellation silences the current week across restart and terminal transitions invalidate old-round work.

## Accomplishments

- Initial setup creates generation 1 with effectiveFrom equal to the successful save instant. Repeated saves do not reset activation. Re-running setup with changed timezone or reminder times replaces the generation too.
- Reminder-time and timezone saves increment generation, establish a strictly future cutoff, and obsolete pending/rejected old work in the same transaction as configuration and callback consumption. Unrelated settings preserve eligibility and real missed work. No queue success is needed to preserve the new boundary.
- Timezone changes retain configured wall-clock reminder minutes and preserve agreed startsAt/endsAt, firstAvailabilityPublishedAt, and lastReminderAttemptAt. The original cancelled civil week is retained; its next-Monday boundary is recomputed in the new timezone only when doing so extends quietUntil. Midnight gaps use the first valid wall minute and overlaps use the established earlier-instant resolver.
- Cancellation of the current chat-local target week writes quietWeekStart and quietUntil atomically, invalidates that week's pending/rejected planning reminders, and preserves immediate manual planning. Cancellation of another week does not silence the current week.
- Cancellation, booking, confirmed change, blocked replan, and stale-draft supersession obsolete pending/rejected occurrences by immutable round ID. Reservations and completed outcomes remain consumed. Stale-draft reaping now encloses the terminal update and ledger invalidation in one transaction.

## Task Commits

1. Task 1 RED: d48b66e — specify atomic reminder schedule edits.
2. Task 1 GREEN: eac6f06 — activate and replace reminder schedules atomically.
3. Task 2 RED: af6255c — specify durable cancellation and lifecycle invalidation.
4. Task 2 GREEN: 92b4c03 — persist cancellation quiet weeks and obsolete round reminders.
5. Documentation completion commit follows this summary.

## Verification

- Node 24.19.0; TypeScript noEmit and focused Prettier passed.
- Full unit suite: 376 passed across 29 files.
- Reminder settings: 7 real-PostgreSQL tests passed. Includes duplicate save/setup, activation rollback after partial writes, settings rollback after generation write, unrelated-setting preservation, fixed rehearsal/protective timestamps, extended timezone quiet boundary, and strictly future enumeration after past/equal time insertion.
- Reminder lifecycle: 10 real-PostgreSQL tests passed. Includes DRAFT/CONFIRMED/BOOKED cancellation, repeated application, recreated reminder services suppressing the rest of the week and resuming next Monday, immediate manual planning, cancellation rollback, other-week cancellation, replan, booking, confirmed change, and stale-draft reaping.
- Existing chat configuration integration suite plus reminder settings: 19 passed. Existing cancel/replan/booking/round suites: 69 passed.
- Both plan verification suites were run non-watch through the installed Vitest CLI with the integration project, equivalent to the npm scripts. Disposable databases applied committed migrations and reviewed queue provisioning through the existing helper. No live Telegram calls or poller started.
- No tracked files deleted and no new skipped tests or placeholder implementation. The pre-existing unrelated .codex/config.toml trailing blank-line warning was left untouched.

## TDD Gate Compliance

Both tasks have failing behavior tests committed before implementation and GREEN commits afterward. Task 1 first RED also exposed a fixture typo (availabilityPublishedAt instead of firstAvailabilityPublishedAt), corrected before its RED commit; generation and invented-backlog assertions independently failed as expected. Additional setup/rollback and transition cases were added during GREEN, so those did not independently observe RED. One follow-up enumeration test initially named the input minutes incorrectly; corrected against the existing typed contract and passed.

## Deviations from Plan

- **[Rule 3 - Test compatibility]** Updated the existing planning logging fake with an empty reminderOccurrence updateMany delegate. Booking now invalidates durable reminders, so the fake's absent delegate made the successful-booking logging branches unreachable. The two failing unit assertions passed after this narrow change in 92b4c03. tests/fakes/chat-readiness.ts required no change because it exposes configuration fixtures rather than transactional delegates.
- **[Rule 2 - Atomic lifecycle]** Wrapped stale-draft supersession's previously standalone update in a transaction with occurrence invalidation, preserving its existing predicates. This is required to ensure the lifecycle update cannot commit alone when ledger persistence fails.

## Coverage Boundaries and Residual Risks

REM-01 coverage concerns activation and cancellation suppression. REM-03/REM-05 coverage concerns schedule persistence, new-generation cutoff, and lifecycle invalidation; RELI-02/RELI-03 concern atomic duplicate/rollback and recreated-service behavior. Requirement IDs identify this plan's contribution, not independent completion of every phase-wide behavior.

Follow-up generation/dispatch and publication acknowledgement are assigned to 05-07; recovery/classification to 05-08. This plan does not claim an end-to-end follow-up send at exact startsAt, blocked/unblocked suppression, or preservation of a historically blocked slot across recovery. Those must be verified after the follow-up dispatcher exists; unblocking must not manufacture a new occurrence or revive one previously suppressed. Protective timestamp preservation is verified directly in PostgreSQL here, with dispatch-time spacing/grace integration remaining for those later plans. No exactly-once Telegram delivery guarantee is made.

The helper import creates a function-only ESM cycle through reminder-policy and planning-service. No cross-module function is called during initialization; both import entry points and service execution passed the unit and integration suites. No framework API changes or new dependencies were introduced.

STATE and ROADMAP updates are owned by the parent orchestrator. Sequential shared-checkout execution used the existing branch and preserved unrelated dirty/untracked files.

## Self-Check: PASSED

Both new test files exist and all four task commit hashes are present in local git history. Required suites, regression suites, typechecking and formatting passed against the committed implementation. This summary exists at the required path.
