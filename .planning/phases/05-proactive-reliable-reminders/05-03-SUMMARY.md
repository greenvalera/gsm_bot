---
phase: 05-proactive-reliable-reminders
plan: "03"
subsystem: reminders
tags: [postgresql, pg-boss, coordination, telegram]
requires:
  - phase: 05-02
    provides: Durable ledger and provisioned queue
provides:
  - Real queue to PostgreSQL reservation to injected Telegram transport tracer
  - Shared migration-aware chat coordinator for updates and worker
  - Runtime queue startup and shutdown composition
affects: [05-04, 05-05, 05-06, 05-09]
requirements-completed: [RELI-02, RELI-03, REM-01]
tech-stack:
  added: []
  patterns: [Consumed send reservations, Shared multi-key application coordination]
key-files:
  created: [src/domain/reminders/reminder-service.ts, src/shared/chat-coordinator.ts, tests/integration/reminder-tracer.test.ts, tests/integration/reminder-coordination.test.ts]
  modified: [src/app/main.ts, src/app/create-bot.ts]
key-decisions:
  - A persisted RESERVED row remains consumed after outcome-write failure or restart.
  - The same coordinator instance holds chat identity across reload, reservation, HTTP and outcome persistence.
  - Current tracer dispatch claims planning-start occurrences only; later plans extend policy and presentation.
actuals:
  tokens: 5812
  tasks: 2
  commits: 5
duration: 8min
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 03: Durable Reminder Tracer Summary

The real pg-boss worker now dispatches a PostgreSQL planning-start reservation through an injected Telegram transport, while updates and worker sends share chat coordination.

## Accomplishments

- ReminderService exposes reconcile, dispatch and draining stop. Recovery scans at most 100 due planning-start rows per wake; queue payloads carry no recipient or schedule authority.
- Dispatch locks chat reminder state, reloads occurrence/configuration/generation/migration/current week and active process, then commits RESERVED with an attempt identity before HTTP. Future and obsolete work cannot send. A duplicate or recreated service never replays RESERVED, SENT or UNKNOWN.
- Accepted outcomes persist message IDs. Transport exceptions become terminal UNKNOWN; outcome-write failure leaves the committed RESERVED row consumed. Technical diagnostics use finite reason codes and omit raw external errors and participant payloads.
- Main wires the real queue and bot.api transport, closes clients on queue startup failure and drains work before Prisma disconnect on shutdown. No live poller or Telegram send was started during implementation.
- ChatCoordinator registers sorted unique keys synchronously before awaiting predecessors, preserving migration old/new identity exclusion without partial acquisition. createBot installs it before migrationBoundary and every handler; production passes that same instance to reminders.

## Commits

- 4852156 — RED: durable reminder transport reservation tests (missing service).
- 78d332b — GREEN: ledger dispatch and production queue wiring.
- a429d5d — RED: shared worker/update/migration coordination tests (missing coordinator).
- 1daebe3 — GREEN: shared coordinator and database/application lock boundary proof.
- Summary documentation commit follows self-check.

## Verification

- Node 24.19.0, TypeScript noEmit: passed.
- Tracer: initially four real PostgreSQL tests passed; post-GREEN tracer feedback rerun also passed four. Parent applied configured mode:yolo and human_verify_mode:end-of-phase to intermediate feedback, without claiming human approval.
- Final focused integration verification: ten tests passed across tracer and coordination suites. The queue, migration provisioning and database are real; only the external Telegram transport is injected.
- Tests cover duplicate/recreated dispatch, timeout, accepted send followed by trigger-induced outcome-write failure, generation invalidation, waiting for an earlier settings transition, database lock release during HTTP, same-chat exclusion, independent chat progress, migration key pairs and release after errors.
- Full unit suite: 365 tests passed across 26 files.
- Focused Prettier formatting passed. No tracked file deletions introduced.

## Deviations and Remaining Phase Work

The plan is a thin planning-start tracer. Full calendar generation is Plan 04; follow-up eligibility, exact-round spacing and authoritative participant rendering are Plans 05/06; known rejection retry classification and recovery coalescing are later phase delivery work. The tracer deliberately leaves FOLLOW_UP rows untouched and uses a functional /plan text entry until the planned Start planning callback renderer lands. These are phase sequencing boundaries, not production claims of completed Phase 5 functionality.

Task 2's settings/cancel/response contention labels exercise the shared coordinator primitive. A separate real PostgreSQL tracer test proves a durable settings-generation mutation before reservation suppresses delivery and an update queued after reservation waits for HTTP completion. Exact lifecycle handler races and two distinct follow-up occurrence spacing remain dependent on their later planned implementation.

STATE, ROADMAP and cross-phase ledger metadata are owned by the parent orchestrator. Existing unrelated dirty files were preserved. No new external security surface beyond the planned Telegram send and database claim was introduced.

## Self-Check: PASSED

All six source/test artifacts exist. All four listed RED/GREEN commits exist, with both RED commits preceding their GREEN commits. Final focused and unit verification passed. This summary is written on disk; parent owns state advancement.
