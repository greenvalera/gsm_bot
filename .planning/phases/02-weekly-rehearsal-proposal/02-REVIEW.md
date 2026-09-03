---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-03T13:28:07Z
depth: standard
files_reviewed: 46
files_reviewed_list:
  - package.json
  - prisma/migrate-deploy.mjs
  - prisma/migrations/20260831100411_planning_rounds/migration.sql
  - prisma/migrations/20260901120000_chat_status_cooldowns/migration.sql
  - prisma/migrations/20260902152000_planning_participant_integrity/migration.sql
  - prisma/schema.prisma
  - src/app/create-bot.ts
  - src/domain/auth/authorization-service.ts
  - src/domain/auth/planning-access-service.ts
  - src/domain/planning/planning-service.ts
  - src/domain/planning/slot-generator.ts
  - src/domain/planning/target-week.ts
  - src/domain/roster/roster-service.ts
  - src/infrastructure/time/civil.ts
  - src/infrastructure/time/zoned-clock.ts
  - src/shared/callback-schema.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/planning-renderers.ts
  - src/telegram/roster-renderers.ts
  - tests/fakes/chat-readiness.ts
  - tests/helpers/postgres.ts
  - tests/helpers/racing-client.ts
  - tests/integration/chat-configuration.test.ts
  - tests/integration/chat-readiness.e2e.test.ts
  - tests/integration/migration-preflight.test.ts
  - tests/integration/planning-action-retention.test.ts
  - tests/integration/planning-confirm.test.ts
  - tests/integration/planning-participant-integrity.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/planning-round.test.ts
  - tests/integration/planning-takeover.test.ts
  - tests/integration/planning-token-release.test.ts
  - tests/unit/callback-authority.test.ts
  - tests/unit/planning-day-card.test.ts
  - tests/unit/planning-keyboards.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/planning-ownership.test.ts
  - tests/unit/planning-start-authorization.test.ts
  - tests/unit/planning-time-card.test.ts
  - tests/unit/roster-rendering.test.ts
  - tests/unit/slot-generation.test.ts
  - tests/unit/target-week.test.ts
  - tests/unit/zoned-clock.test.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-03T13:28:07Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The two blockers and two warnings from the preceding review are genuinely closed. The
application-level CR-01 and WR-01 through WR-06 fixes also remain intact. A fresh
adversarial pass found one new blocker in the migration-prefix classifier: when both
planning tables are absent, it accepts any otherwise valid applied-migration prefix—even a
prefix that says the planning migrations have already completed. Because Prisma deploy
does not repair schema drift, the wrapper can exit successfully while the two core planning
tables remain missing.

The repository passed `npm run typecheck`, all 267 unit tests, and all 129 integration tests
across 13 files with Docker/PostgreSQL 18.4. The missing-table state was additionally
reproduced against a disposable fully migrated database: after dropping
`planning_participants` and `planning_rounds`, `npm run db:migrate:deploy` exited 0, reported
no pending migrations, and left both tables absent with all nine migrations still recorded
as applied. `src/generated/prisma/**` was treated as generated output; the schema and
migration sources were reviewed instead.

## Narrative Findings (AI reviewer)

### Convergence verification

- Former CR-01 is closed: a valid Phase-1 prefix is accepted by
  `prisma/migrate-deploy.mjs:144-150,251-256` and exercised end to end at
  `tests/integration/migration-preflight.test.ts:153-190`.
- Former CR-02 is closed for unsafe inherited data and statement failures: the preflight
  counts missing, cross-chat, and mismatched-user bindings at
  `prisma/migrate-deploy.mjs:10-19,156-170`; the migration repeats those checks under a
  transaction and rolls every statement back at
  `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql:1-73`.
  The mismatch and forced-late-failure cases are covered at
  `tests/integration/migration-preflight.test.ts:349-514`.
- Former WR-01 is closed: write-blocking locks are acquired before the authoritative checks
  and held through commit at
  `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql:1-36,73`,
  with a concurrent-writer regression at
  `tests/integration/migration-preflight.test.ts:516-582`.
- Former WR-02 is closed: Prisma streams are captured, bounded, and redacted before
  forwarding at `prisma/migrate-deploy.mjs:28-84,178-206`, with recovery metadata and
  identifier suppression covered at
  `tests/integration/migration-preflight.test.ts:584-629`.
- The seven earlier application findings remain closed at the same authority and state
  boundaries: per-round timezone cleanup (`src/domain/planning/planning-service.ts:1534-1562`),
  initial-card cleanup (`src/telegram/planning-handlers.ts:886-908`), composite participant
  identity (`prisma/schema.prisma:192-230`), lazy participant-history authorization
  (`src/telegram/handlers.ts:587-606`), exact cooldown boundaries
  (`src/domain/planning/planning-service.ts:1758-1769,1805-1815`), retention failure logging
  (`src/domain/planning/planning-service.ts:632-647,922-929,1741-1745`), and retryable
  callback acknowledgement (`src/telegram/callbacks.ts:262-273,447-475`).

## Critical Issues

### CR-01: An applied planning prefix with both planning tables missing is accepted as safe

**Classification:** BLOCKER

**File:** `prisma/migrate-deploy.mjs:96-120,144-150,251-256`

**Issue:** `hasValidMigrationPrefix` verifies only that every active ledger row matches the
same index in the committed migration list. It does not require that the prefix end before
`20260831100411_planning_rounds`. The caller invokes it precisely when both
`planning_rounds` and `planning_participants` are absent, then labels any successful result
`pre-planning` and launches Prisma.

This is incorrect when the ledger already includes the planning migration (or all current
migrations) but the tables are missing because of drift or an incomplete manual recovery.
The applied names still form a valid committed prefix, so the guard prints
`Safe pre-planning migration prefix detected`. Prisma sees the migrations as already
applied, reports `No pending migrations to apply`, and exits 0; neither layer recreates the
tables. Compose can consequently start the bot against an unusable database, turning the
first planning query into a production outage. The existing partial-schema case at
`tests/integration/migration-preflight.test.ts:631-662` covers exactly one planning table
present, but not both absent with a post-planning ledger.

The behavior was reproduced on disposable PostgreSQL after applying all nine migrations
and dropping both planning tables: the supported deployment command exited 0, both
`to_regclass` results remained null, and all nine successful migration rows remained in the
ledger.

**Fix:** Make prefix validity conditional on the observed schema state. When both planning
tables are absent, require the active ledger to be an exact committed prefix that ends
strictly before `20260831100411_planning_rounds`; if that migration or any successor is
recorded, classify the database as inconsistent and refuse before spawning Prisma. When
`_prisma_migrations` is absent, accept only a genuinely empty application schema rather
than an arbitrary nonempty database. Add a PostgreSQL regression that fully migrates a
database, drops both planning tables, runs the supported command, and asserts a non-zero
inconsistent-baseline result with no success message.

---

_Reviewed: 2026-09-03T13:28:07Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
