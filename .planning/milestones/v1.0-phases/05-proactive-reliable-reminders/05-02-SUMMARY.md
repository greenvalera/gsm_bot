---
phase: 05-proactive-reliable-reminders
plan: "02"
subsystem: database
tags: [pg-boss, prisma, postgresql, migrations, reminders]
requires:
  - phase: 05-01
    provides: Explicit exact-pin and schema approval
provides:
  - Reviewed pg-boss construction and deploy-only queue provisioning
  - Durable reminder state and occurrence ledger with exact application catalog verification
  - No-DDL runtime queue adapter and disposable PostgreSQL proofs
affects: [05-03, 05-04, 05-05, 05-09]
actuals:
  tokens: 108412
  tasks: 2
  commits: 7
tech-stack:
  added: [pg-boss 12.27.0]
  patterns: [Migration-owned queue DDL, Durable bounded reconciliation wakeups]
key-files:
  created: [prisma/provision-reminders.mjs, prisma/queue/pg-boss-12.27.0.sql, prisma/migrations/20260913000000_reminder_ledger/migration.sql, src/infrastructure/jobs/reminder-queue.ts, tests/integration/reminder-queue.test.ts]
  modified: [package.json, package-lock.json, prisma/schema.prisma, prisma/migrate-deploy.mjs, tests/helpers/postgres.ts, tests/integration/migration-preflight.test.ts, src/generated/prisma]
key-decisions:
  - Disable pg-boss cron monitoring because its startup calls createQueue even with migrate disabled.
  - Enqueue durable short-policy reconciliation jobs every 30 seconds and on startup; the application ledger owns schedule recovery.
  - Disable persisted queue statistics to prevent supervisor partition DDL while retaining expiry and retention maintenance.
requirements-completed: [RELI-02, RELI-03]
duration: 12min
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 02: Durable Reminder Persistence Summary

Reviewed pg-boss 12.27.0 construction SQL and the reminder ledger now deploy before runtime, with fresh/upgrade/idempotency checks and a queue adapter proven to issue no DDL.

## Accomplishments

- The exact approved dependency pin is committed. Construction SQL is generated from its exported API and compared against that API before provisioning. Provisioning uses a session advisory lock, rejects partial/mismatched queue schemas, validates schema version 37 and library schema drift, and idempotently creates the named queue outside runtime.
- The queue accepts only a bounded chat identity or an empty global reconciliation hint. Runtime checks queue schema and options, sets migrate:false and schedule:false, disables statistics partition writes, explicitly supervises expired jobs, and drains on stop. Queue jobs have bounded retries, retention and expiration; no Telegram retry wrapper exists here.
- The application migration adds ChatReminderState, ReminderOccurrence, exact occurrence uniqueness, chat/exact-round foreign keys, disposition/due index, and four nullable round publication/spacing timestamps. Existing configurations receive generation 1 at the migration activation instant. Historic publication times and occurrences are not invented.
- The existing strict migration catalog now includes all new tables, columns, enums, constraints and indexes. Migration deployment validates the application catalog again after Prisma deploy, then provisions the queue separately. The disposable test helper preserves before/none modes and provisions only after full migration deploy/status.

## Task Commits

1. `39c8e1b` — RED: queue startup contract, initially missing adapter.
2. `39464e0` — GREEN: pinned queue dependency, reviewed construction, deploy provisioning and adapter.
3. `94fece6` — RED: fresh/upgrade ledger deployment tests failed before migration existed.
4. `d98e986` — GREEN: application ledger migration, strict catalog and runtime negative tests.
5. `e7ee18a` — Required tracked Prisma client regeneration.
6. `9450550` — Adapt the damaged-catalog regression fixture for the new foreign key.
7. Summary documentation commit follows this file's self-check.

## Verification

- `node --check prisma/provision-reminders.mjs`: passed.
- Prisma generate 7.9.1: passed after committed migrations were exercised in disposable PostgreSQL 18.4. Generation used a non-secret local configuration URL; generation itself does not connect to it.
- `tsc --noEmit`: passed after regeneration.
- `vitest run --project integration tests/integration/reminder-queue.test.ts`: five tests passed. Coverage includes fresh deploy twice, Phase 4 upgrade twice with stable activation/no historic publication, deliberately missing ledger column, missing queue schema/name, mismatched schema version and queue options, bounded identity delivery, and a PostgreSQL event trigger rejecting DDL during actual queue startup/wake/supervision.
- Existing migration-preflight suite: 33 of 34 passed initially. The remaining fixture failed before exercising preflight because its deliberate DROP now encountered the exact-round FK. After the fixture-only fix, that test passed in a targeted rerun. No assertion was weakened; all 34 cases have passing evidence.
- Focused Prettier formatting passed after a transient Windows write error was retried. Generated Prisma code retains generator formatting.
- No tracked file deletions, unfinished stubs or skipped test declarations were introduced.

## Deviations from Plan

- **Task sequencing:** Task 1 was marked TDD but listed no test file. Its queue contract tests were created in the already-planned Task 2 test file for RED, then extended for Task 2. Plan scope did not gain another test file.
- **Required generated artifacts:** The plan requires db:generate but omitted tracked generated Prisma derivatives. Those twelve generated files were committed separately after generation/typecheck. The parent explicitly confirmed this routine scope adjustment; defect register entry 22 records it as fixed.
- **Rule 1 — dependent fixture:** The existing damaged-catalog test must explicitly drop reminder_occurrences with the two planning tables to reproduce its intended corruption now that an exact-round FK exists. This one-line compatibility adjustment is committed at 9450550.
- **No-DDL runtime details:** Pin source inspection showed cron startup calls createQueue, and persisted queue statistics can provision partitions. Disabled those paths and used a 30-second pulse of durable jobs with explicit startup recovery; the application ledger remains the schedule authority. Official pinned constructor documentation was checked at https://github.com/timgit/pg-boss/blob/12.27.0/docs/api/constructor.md; Context7/ctx7 were unavailable, so installed pinned source/types supplied exact API details.

## Residual Risks and Next Plan

This prerequisite does not yet implement the full reminder policy or transport; Plan 03 supplies the behavioral tracer. The pulse runs only while the process is alive; durable ledger reconciliation on startup recovers eligible missed occurrences. This is not a promise of exactly-once Telegram delivery.

The existing npm audit reports five findings in the Prisma/deepmerge-ts/mysql2/fast-uri dependency paths, not pg-boss. `--omit=dev` still reports them because Prisma is an optional peer of @prisma/client; runtime exposure has not been assumed absent. No unrelated dependency upgrades were attempted.

STATE.md and ROADMAP.md updates are owned by the parent orchestrator. Existing unrelated workspace changes, including migration_lock.toml, were preserved.

## Self-Check: PASSED

All five created plan artifacts and tracked generated client models exist. Six implementation/test commits listed above exist in history. Both task RED/GREEN commit sequences are present. Focused checks and all migration preflight cases have passing evidence.
