---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-04T21:47:47Z
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
  warning: 1
  info: 0
  total: 3
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-09-04T21:47:47Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The current 46-file Phase 02 scope was reviewed from scratch at standard depth. The confirmation path revalidates the chosen civil date and slot before consuming the action token, leaves the token unconsumed on past, week-rollover, nonexistent-DST-time, and empty-roster refusals, locks the existing membership rows before taking a fresh roster snapshot, and releases the token if the revision-guarded promotion loses a race. Stale-week supersession also remains terminal under concurrent revision-only re-anchor activity because its guarded update keys on draft status and the stale target week rather than on the previously observed revision.

The migration preflight remains unsafe in two catalog states that its exact-prefix contract is intended to reject. The supplied passing syntax check, typecheck, 267 unit tests, and 62 focused PostgreSQL tests do not exercise either state. One additional warning concerns database failures that are converted to result unions after their original causes have been discarded.

## Critical Issues

### CR-01: Exact-prefix validation ignores colliding non-table relations and non-enum types

**Classification:** BLOCKER

**File:** `prisma/migrate-deploy.mjs:289-311`

**Issue:** `loadApplicationCatalog` records only ordinary/partitioned tables from `pg_class` (`relkind IN ('r', 'p')`) and only enum types from `pg_type`. Other schema objects are invisible to every exact-prefix comparison. A database can therefore have the correct migration ledger and the exact expected table/enum catalog while already containing a view, materialized view, foreign table, sequence, composite type, domain, or other standalone type with a name that a pending migration will create. For example, a valid Phase 1 prefix plus a view named `chat_status_cooldowns` passes preflight; Prisma then applies the planning migration before failing when the cooldown migration tries to create the table. A domain or composite type named `PlanningRoundStatus` similarly passes the pre-planning catalog check and fails at `CREATE TYPE`. The guard has therefore permitted mutation and partial migration advancement in states it claims to reject before deployment.

**Fix:** Build the namespace catalog from all application-owned relation kinds and standalone types relevant to migration name collisions, not only tables and enums. Specify the exact permitted object-name/type-kind set for every accepted migration prefix and reject unexpected objects before invoking Prisma. Add preflight regressions for at least a same-named view and a same-named domain/composite type at each prefix where that name belongs to a future migration; assert a refused deployment, an unchanged ledger, and no newly created migration objects.

### CR-02: Invalid indexes can satisfy the final-prefix catalog

**Classification:** BLOCKER

**File:** `prisma/migrate-deploy.mjs:349-363`

**Issue:** The index catalog compares only `pg_get_indexdef`; it does not load `pg_index.indisvalid`, `indisready`, or `indislive`. PostgreSQL can retain a same-named index with the expected definition but with an invalid/unready state, most notably after a failed `CREATE UNIQUE INDEX CONCURRENTLY`. If the Prisma ledger already contains the final valid Phase 02 prefix, that index satisfies the exact catalog and there is no pending migration to rebuild it. The deploy command reports success even though the uniqueness invariant represented by the index—such as the one-active-round-per-chat/week guard—is not enforced.

**Fix:** Include the index validity, readiness, and liveness flags in the catalog and require all expected indexes to be valid, ready, and live. Add a final-prefix preflight test that leaves an invalid same-named unique index with the expected definition and asserts deployment refusal without ledger mutation.

## Warnings

### WR-01: Planning transaction failures lose their original error before logging

**Classification:** WARNING

**Files:** `src/domain/planning/planning-service.ts:978-981,1080-1082,1197-1199,1292-1294,1718-1720,1895-1897,1966-1968`; `src/telegram/planning-handlers.ts:799-832,1096-1104,1322-1330,1500-1508`

**Issue:** Most planning-service catch branches return only `{ kind: "failed" }` and discard the caught value. The handlers then emit a bounded outcome and reason, but they cannot attach the database/client exception as the logger's `err` field. Failures such as connectivity loss, transaction aborts, constraint violations, and programming errors therefore collapse into the same operational event without a stack or database error code. The confirm path already demonstrates the better pattern by preserving the error in its failure result, so the inconsistency is especially likely to impede diagnosis outside confirmation.

**Fix:** Preserve the caught value on each internal-failure result (for example, `{ kind: "failed", error }`) while continuing to map expected conflicts such as `week-taken` explicitly. Route the retained value through the existing planning failure logger as `err`. Extend the logging tests to verify that each failed service operation records the originating error without exposing it to Telegram users.

## Positive Observations

- Confirmation checks the selected slot against the current instant and current target week before token consumption, so stale civil dates, DST gaps, and rolled weeks remain retryable.
- Confirmation snapshots the active roster inside the transaction after locking the existing membership rows and refuses an empty roster before promotion.
- A lost confirmation revision race releases the claimed token within the same transaction, preserving retryability.
- Stale-round supersession is guarded by draft status and stale target week, so concurrent re-anchor revision changes cannot revive or indefinitely preserve a stale round.
- Callback payload validation, ownership checks, compact action tokens, and explicit callback acknowledgements are consistently exercised across the scoped handlers and tests.

## Review Footer

Codex generic-agent reviewer fallback
