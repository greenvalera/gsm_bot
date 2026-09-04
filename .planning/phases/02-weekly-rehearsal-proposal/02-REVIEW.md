---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-04T07:39:23Z
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
  critical: 2
  warning: 0
  info: 0
  total: 2
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-04T07:39:23Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The supersession/re-anchor fix is sound: supersession now advances the revision, re-anchoring also requires DRAFT status, and the regression test exercises the delivery-to-CAS race. The inherited migration guard rejects a ledgerless complete-looking schema, but two legitimate-prefix drift paths still reach Prisma instead of failing closed. Type checking and all 267 unit tests passed. Migration integration tests remain unavailable because this environment has no container runtime.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A drifted Phase 1 schema is accepted solely from its migration ledger

**Classification:** BLOCKER
**File:** `prisma/migrate-deploy.mjs:337-347`
**Issue:** When both planning tables are absent, a present ledger is considered safe using only migration names, completion flags, and checksums. This branch does not validate any catalog object created by that prefix and does not even require `chat_memberships`, despite already reading its presence. A database with a valid Phase 1 ledger but a dropped `chat_memberships` table therefore passes as `pre-planning`. Prisma can commit the planning and cooldown migrations before the integrity migration fails at `LOCK TABLE chat_memberships`, leaving the database partially advanced and recording a failed migration instead of refusing before mutation.
**Fix:** Define and validate the required Phase 1 catalog for every accepted pre-planning prefix (including the tables, enums, columns, keys, and definitions consumed by pending migrations), or perform an authoritative drift comparison before invoking Prisma. Add a regression test that creates the valid prefix, drops `chat_memberships`, runs the wrapper, and asserts an inconsistent-baseline exit with an unchanged migration ledger and no planning objects created.

### CR-02: Cooldown-prefix catalog validation accepts both premature and malformed tables

**Classification:** BLOCKER
**File:** `prisma/migrate-deploy.mjs:210-312`
**Issue:** The catalog check treats `chat_status_cooldowns` as a Boolean name-presence condition only when the cooldown migration appears in the ledger. For a planning-only prefix, an already-present table of that name is not rejected, so Prisma starts and the pending `CREATE TABLE` migration fails and writes a failed migration record. For a prefix that includes the cooldown migration, any relation with that name passes even if required columns, types, nullability, primary key, or defaults are missing; Prisma will never replay the recorded migration, and runtime cooldown operations then fail permanently. The same name-only approach is used for the integrity migration's external indexes, and planning constraints are compared by names rather than definitions.
**Fix:** Model the exact expected catalog for each accepted ledger prefix. Require future objects to be absent before their migration, and after a migration require table kinds plus column types/nullability/defaults, key/index definitions, and foreign-key definitions—not only object names. Add tests for a planning-only prefix with a premature cooldown table and a cooldown-applied prefix with a required cooldown column removed; both must fail before Prisma is spawned.

---

_Reviewed: 2026-09-04T07:39:23Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
