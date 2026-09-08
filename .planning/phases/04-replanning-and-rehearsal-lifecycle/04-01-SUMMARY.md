---
phase: 04-replanning-and-rehearsal-lifecycle
plan: 01
subsystem: planning
tags: [postgres, prisma, telegram, replanning]
requires:
  - phase: 03
    provides: Durable availability and booking transitions
provides:
  - Immediate blocking on the first unavailable answer
  - Transactional fresh-attempt replanning with preserved history
  - Guarded cancellation schema migration
affects: [04-02, 04-03, 04-04, 04-05]
tech-stack:
  added: []
  patterns: [transaction-scoped advisory locking, immutable attempt history]
key-files:
  created: [prisma/migrations/20260908215724_cancellation/migration.sql, tests/integration/planning-replan.test.ts, tests/integration/planning-replan-telegram.test.ts]
  modified: [src/domain/planning/planning-service.ts, src/telegram/planning-handlers.ts, src/telegram/planning-renderers.ts, prisma/migrate-deploy.mjs]
key-decisions:
  - Replanning creates a new round in the same target week and preserves the previous attempt.
  - Shared group controls are visible to the group; eligibility is freshly authorized on every tap.
requirements-completed: [AVAIL-05, AVAIL-06]
coverage:
  - id: immediate-blocking
    description: The first unavailable answer blocks the round and identifies the blocker safely.
    requirement: AVAIL-05
    verification:
      - kind: unit
        ref: tests/unit/planning-availability-card.test.ts
        status: pass
    human_judgment: false
  - id: fresh-attempt
    description: Eligible authors and administrators replan into a fresh same-week attempt with current roster and settings.
    requirement: AVAIL-06
    verification:
      - kind: integration
        ref: tests/integration/planning-replan.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/planning-replan-telegram.test.ts
        status: pass
    human_judgment: true
    rationale: Real Telegram layout and group interaction still require live UAT.
completed: 2026-09-09
status: complete
---

# Phase 04 Plan 01 Summary

The first unavailable answer now blocks a rehearsal, and an eligible replan creates a fresh attempt while retaining the old round and answers.

## Accomplishments

- Added nullable cancellation and successor history columns, with CANCELLED appended to the enum and complete catalog/ledger preflight verification.
- Added author/admin replanning with current roster/settings snapshots, guarded week ownership transfer, token consumption, rollback, and concurrent-answer serialization.
- Added a shared Replan control, a terminal old-attempt card, and a fresh successor anchor.

## Task Commits

1. Task 1 migration and preflight: `4af715b`.
2. Task 2 failing behavioral tests: `3e2b3bc`.
3. Task 2 implementation and integration coverage: `c250e89`.

## Automated Validation

- All 342 unit tests and all 253 integration tests (17 files) passed in the final clean run.
- Type checking, generated-client consistency, touched-file formatting, schema drift, codebase drift, and UI safety gates passed.
- PostgreSQL 18.4, Node 24.19.0, and Docker 29.1.3 were used. No dependency versions changed.
- Independent review found two issues, both corrected: shared-button visibility after an ordinary member blocks, and answer/replan concurrency. Re-review found no actionable defects.
- Repository-wide formatting remains a preexisting failure across 655 files, largely agent tooling; only touched files were formatted.

## Deviations from Plan

- Invoked Prisma through Node and its installed JavaScript entrypoint so migration helpers work on Windows as well as Unix.
- Minted the group-visible replan control on behalf of the round author because Telegram cannot personalize a shared message's buttons. Every tap still receives fresh author/admin authorization.
- Used a transaction advisory lock shared by answers and replans to prevent a concurrent reversal from racing the blocking decision.
- Reconfirmation replaces the successor draft's roster snapshot transactionally, matching the existing confirm-time snapshot contract without duplicate participants.

## Remaining Work

Blocked announcements and specific terminal-button refusals are implemented by Plan 04-02. Cancellation, voluntary changes, and lifecycle date defaults remain in Plans 04-03 through 04-05. Live UAT has not been performed; the phase runbook records expected scenarios rather than pass evidence.

## Self-Check

PASS: The three task commits exist, the migration and both new integration test files exist, and the final unit/integration runs pass. Plan 04-01 implementation is complete; the scope of its automated evidence and the pending live UAT are recorded above.
