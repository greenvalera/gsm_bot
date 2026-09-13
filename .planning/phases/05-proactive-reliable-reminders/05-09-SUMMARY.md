---
phase: 05-proactive-reliable-reminders
plan: "09"
subsystem: reminders
tags: [migration, runtime, shutdown, postgres, recovery]
requires:
  - phase: 05-08
    provides: Durable delivery ownership and bounded abandoned-reservation recovery
provides:
  - Canonical chat migration preserving reminder history, quiet periods and attempt spacing
  - Future-only migrated schedules and fresh acknowledged availability recovery grace
  - Explicit runtime resource ownership, admission cutoff and bounded draining
  - Independent dispatch failure isolation and current-anchor navigation fallback
affects: [05-10]
tech-stack:
  added: []
  patterns: [Transactional FK staging, Conservative occurrence collision precedence, Idempotent ordered cleanup]
key-files:
  created: [tests/integration/reminder-migration.test.ts, tests/integration/reminder-runtime.test.ts]
  modified: [src/domain/chat/migration-service.ts, src/domain/reminders/reminder-service.ts, src/app/main.ts, src/infrastructure/jobs/reminder-queue.ts]
key-decisions:
  - Merge destination reminder-only state while retaining source settings; destination roster, rounds, drafts and callbacks remain conflicting state.
  - Preserve first publication and spacing while requiring a new acknowledged anchor and recovery grace after migration.
  - Treat failed chat metadata lookup as optional navigation enrichment and fall back to the authoritative current-card reply.
  - After drain expiry leave the reserved attempt consumed and ignore late transport results rather than reopen a disconnected database.
requirements-completed: [REM-05, RELI-02, RELI-03]
coverage:
  - id: reminder-migration
    description: Migrated reminder identities preserve terminal delivery and suppression history while retiring pending work.
    requirement: REM-05
    verification:
      - kind: integration
        ref: tests/integration/reminder-migration.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/chat-migration.test.ts
        status: pass
    human_judgment: false
  - id: runtime-ownership
    description: Startup failures and repeated shutdown close resources in order; paused sends remain consumed.
    requirement: RELI-03
    verification:
      - kind: integration
        ref: tests/integration/reminder-runtime.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 8085
  tasks: 2
  commits: 7
duration: 12min
completed: 2026-09-13
status: complete
---

# Phase 5 Plan 9: Migration and Runtime Ownership Summary

**Reminder history survives group migration, and runtime shutdown closes admission before bounded delivery drain and ordered resource cleanup.**

## Accomplishments

- Extended the existing migration transaction and table lock set to reminder states and occurrences. The initial test reproduced a composite foreign-key failure: configuration-first cascading changed occurrence chat IDs before their round parent. Occurrences now follow the same exact staging/restoration approach as participant snapshots inside the transaction.
- Preserved occurrence IDs, immutable round IDs, original due times, attempt IDs, reservation/outcome details and previous spacing. Pending and retryable work becomes obsolete. The new schedule generation exceeds both source and destination generations, with a future-only effective boundary. Quiet and planning-spacing boundaries use their maximum values.
- Destination configuration with reminder state and no roster, rounds, drafts or callbacks can merge. Existing unrelated destination workflow state still fails transactionally, and an absent source cannot destroy destination configuration. Colliding occurrence identities retain the most conservative potential-delivery disposition before suppressed/non-delivery history; sent identity wins over pending work.
- Old queued chat hints resolve through the migration tombstone before reconciliation. No round reference is interpreted as a successor. Availability anchors clear, original first publication and attempt spacing remain, and the grace marker is renewed at actual acknowledged recovery.
- Added an import-safe `startRuntime` seam in main for resource ownership tests. Queue readiness occurs before abandoned-reservation recovery and initial reconciliation; worker delivery is gated until startup is ready. One runner starts only after that sequence. Runtime does not construct queue schema or create queues.
- Shutdown immediately disables queue and reminder admission, stops the runner, drains active reconciliation/dispatch, stops the queue, and disconnects Prisma. Repeated shutdown calls share one promise. A rejected cleanup stage cannot skip later resources. Runner and reminder drain deadlines are each 30 seconds by default; queue uses its existing 30-second graceful stop. Process exit is never forced ahead of settlement.
- Paused external delivery remains RESERVED after reminder drain expiry. Late success or rejection then performs no outcome write and cannot release spacing. Subsequent startup recovery can consume that abandoned reservation as UNKNOWN under the existing ownership rules.
- A failed metadata lookup now falls back to reply navigation to the current authoritative availability anchor, with IDs and a reason code only in logs. Per-occurrence reconciliation exceptions cannot abort dispatch for later healthy chats. Runner's direct console error logging is disabled in favor of application handling.

## Task Commits

1. **05-09-01: Migration** — RED `7b6070a`, collision RED `0666ae8`, GREEN `0eef5f0`.
2. **05-09-02: Runtime** — RED `9c4fa77`, metadata/paused-send RED `94b4cd8`, GREEN `bb2e3f8`.

The final documentation commit contains this summary. Parent orchestration owns STATE, ROADMAP and requirement state.

## Verification

- Final Node 24.19 typecheck: `npm run build` passed.
- Final full unit suite: **381 tests passed across 29 files**.
- Final required task verification: **19 integration tests passed across three files**: runtime 11, reminder migration 2, existing chat migration 6.
- Earlier focused regression: **44 passed** across runtime, reminder migration, existing chat migration, queue and delivery suites. A later focused batch: **42 passed** across runtime, migration, recovery and followups. These are separate runs and are not represented as a single combined run; runtime gained further tests and shutdown guards afterward.
- Migration tests include consumed reservation preservation, terminal collision precedence, maximum quiet/spacing boundaries, duplicate migration, obsolete queued source work, and fresh acknowledged card-recovery grace. Existing migration tests retain conflicting-destination rejection and bot-level status recovery.
- Runtime tests inject failures at initialization, queue start, abandoned recovery, reconciliation and runner start; verify repeated stop, rejected runner cleanup, bounded paused runner, startup/teardown worker gating, paused HTTP with consumed reservation, and a failed first chat followed by a healthy chat. Lifecycle tests exercise the same function called by main; actual process signals and live polling were not started.
- Real database tests use the existing disposable PostgreSQL migration-and-provisioning helper. No live messages, local band data changes or second poller.
- Changed files formatted with Prettier; scoped `git diff --check` passed. No tracked file deletions.

## Deviations from Plan

**1. [Rule 1 - Bug] Isolate metadata and dispatch failures found by independent review.**
- The reviewer identified that getChat failure preceded the send error boundary and aborted global reconciliation, starving later chats.
- A failing real-database metadata regression preceded the fix. The final cross-chat test proves a failed lookup/send cannot block the healthy chat. Reply navigation still references the durable current anchor.
- Files: reminder service and runtime tests. RED `94b4cd8`, GREEN `bb2e3f8`.

**2. [Rule 2 - Shutdown correctness] Ignore late delivery outcomes after drain expiry.**
- Without this guard, a pending HTTP request could settle after Prisma disconnect and cause the client to reopen a database connection or restore rejected-attempt spacing during shutdown.
- The timeout leaves the already committed reservation consumed and skips further outcome persistence. The paused-send test verifies that even late success remains RESERVED.
- Files: reminder service and runtime tests. GREEN `bb2e3f8`.

## Decisions and Residual Risks

- Whole-phase build, full integration regression, security/code review convergence and live Telegram acceptance remain Plan 10/orchestrator work. These focused tests do not claim live acceptance.
- The deployment still supports one polling/delivery process. The module ownership registry is not a distributed multi-process lease. An external transport request already in flight cannot be unsent; uncertainty is deliberately consumed.
- Reminder-only destination merge does not merge independently active band workflows. Existing destination roster/round/draft/callback conflicts remain an explicit operator boundary.
- Context7 MCP and CLI were unavailable. Runtime API behavior was checked against installed runner declarations and official [grammY runner documentation](https://grammy.dev/plugins/runner) and [pg-boss 12.27.0 operations documentation](https://raw.githubusercontent.com/timgit/pg-boss/12.27.0/docs/api/ops.md).
- No new schema, dependencies, endpoints or credential-handling surface was introduced. Existing unknown-delivery and conditional-spacing protections remain.

## Self-Check: PASSED

- All six listed source/test deliverables exist, and all six task commit hashes exist.
- Both tasks have RED before GREEN. No TODO, FIXME, placeholder, skipped-test or unrun task verification remains in the changed files.
- Preserved unrelated user/runtime files and the separate review fixer's source edits; staged only plan-owned files.
- Actuals are `ceil(realized diff characters / 4)` for these six files over `7b6070a^..bb2e3f8`, not harness token usage.
