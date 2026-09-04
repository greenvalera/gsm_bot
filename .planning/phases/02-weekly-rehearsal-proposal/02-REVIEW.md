---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-04T07:21:05Z
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

**Reviewed:** 2026-09-04T07:21:05Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The fix correctly rejects a ledger that claims migrations after the planning migration when both planning tables are absent. Two release-blocking correctness gaps remain: an adjacent ledgerless-schema path still bypasses ledger validation, and superseding a round does not invalidate an in-flight status repost. Type checking and all 267 unit tests passed. The migration-preflight integration test could not be executed because Testcontainers found no container runtime.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Complete-looking ledgerless schemas bypass migration-history validation

**Classification:** BLOCKER
**File:** `prisma/migrate-deploy.mjs:154-193`
**Issue:** `hasSafePrePlanningBaseline` is called only when both planning tables are absent. If a ledgerless or independently-created database contains `planning_rounds`, `planning_participants`, and `chat_memberships`, preflight classifies it as `inherited` solely from table names and two data-count queries. It never requires `_prisma_migrations` or verifies that those tables match the committed schema. `prisma migrate deploy` can then create a new ledger and start replaying the migration history into an unmanaged schema, failing after mutations or applying migrations against incompatible columns and constraints. The new regression tests cover a ledgerless database with an unrelated table, but not this all-three-tables branch.
**Fix:** Validate migration history for every non-empty schema before returning `inherited`. Require an existing, finished, ordered committed prefix that includes the planning migration, and verify catalog objects required by the claimed prefix (or use an authoritative schema-drift check) before spawning Prisma. Add a test that creates all three expected table names without `_prisma_migrations`, asserts an inconsistent-schema exit, and confirms the ledger was not created.

### CR-02: Superseding a round does not invalidate an in-flight status repost

**Classification:** BLOCKER
**Files:** `src/domain/planning/planning-service.ts:1549-1558`, `src/domain/planning/planning-service.ts:1857-1865`, `src/telegram/planning-handlers.ts:706-755`
**Issue:** `supersedeStaleRounds` changes a DRAFT to SUPERSEDED without incrementing `revision`. A concurrent `/plan_status` can already have read the DRAFT and rendered its card; after supersession it posts that card and `reanchor` still succeeds because it guards only by id and the unchanged revision, not by DRAFT status. The terminal round is assigned the new anchor and users receive a fresh, pressable-looking card whose callbacks can no longer transition the round. Existing recovery coverage races re-anchoring with a revision change, so it does not exercise this terminal-state race.
**Fix:** Increment `revision` atomically in `supersedeStaleRounds`, and include `status: PlanningRoundStatus.DRAFT` in `reanchor`'s compare-and-set predicate. Add a concurrency test that supersedes the round between `reply` and `reanchor`, then asserts re-anchoring is stale, the newly posted keyboard is stripped, and the superseded row remains unanchored.

---

_Reviewed: 2026-09-04T07:21:05Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
