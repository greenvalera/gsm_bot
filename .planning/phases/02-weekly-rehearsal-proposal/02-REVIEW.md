---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-04T21:22:28Z
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
  critical: 3
  warning: 1
  info: 0
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-04T21:22:28Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The post-`a8887e1` tree closes the two literal failures in the prior report: a missing `chat_memberships` table, premature cooldown table, and malformed cooldown table are now rejected before Prisma starts. The migration history also verifies the exact committed prefix, completion state, and checksums; the integrity migration's explicit transaction, write-blocking locks, and rollback test are coherent; and child stdout/stderr are consumed and bounded. However, the new catalog guard is still not exact for Phase 1, its supposedly exact Phase 2 comparisons omit constraint and index properties that change behavior, and confirmation can durably schedule a rehearsal whose start has already passed. A stale-round compare-and-set also has an avoidable concurrency hole.

The supplied verification evidence reports a passing syntax check, typecheck, 267 unit tests, and 18 Docker/PostgreSQL migration-preflight tests. Those suites do not exercise the four cases below and do not establish their absence.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Valid Phase 1 ledgers still bypass exact schema validation

**Classification:** BLOCKER
**File:** `prisma/migrate-deploy.mjs:406-507`
**Issue:** `hasRequiredPhaseOneCatalog` validates the exact enum label lists, but it checks only one column on `callback_actions`, no columns or constraints on `chat_configurations`, `setup_drafts`, or `settings_edit_drafts`, and only a subset of the roster catalog. It also does not require planning-era enums to be absent before the planning migration. Consequently, a database with a valid, checksum-matching Phase 1 prefix can drop (for example) `chat_configurations.timezone` and still be classified as `pre-planning`; all pending migrations then succeed while the runtime remains permanently incompatible with its Prisma schema. A valid prefix with a premature `PlanningRoundStatus` enum also passes preflight, after which the planning migration fails at `CREATE TYPE` and records a failed migration rather than failing before mutation. The existing drift regression at `tests/integration/migration-preflight.test.ts:228-284` drops an entire table and does not cover definition-level Phase 1 drift or future enums.
**Fix:** Define the complete expected catalog for every accepted pre-planning prefix: exact relations, enums, ordered columns with types/nullability/defaults, constraints, and indexes for every application table at that prefix. Require objects belonging to later migrations to be absent. Add regressions that drop a required base column and create each future planning enum while leaving the ledger untouched; assert refusal, an unchanged ledger, and no newly created planning objects.

### CR-02: “Exact” Phase 2 catalog matching ignores behavior-changing constraint and index properties

**Classification:** BLOCKER
**File:** `prisma/migrate-deploy.mjs:255-309`
**Issue:** The constraint query deliberately loads only primary and foreign keys (`contype IN ('p', 'f')`), so `hasExactConstraints` cannot see unexpected CHECK, UNIQUE-constraint, or exclusion constraints. For example, adding `CHECK (status <> 'CONFIRMED')` to `planning_rounds` passes preflight but makes every confirmation fail. The index projection records only name, uniqueness, key expressions, and predicate; it omits `indnullsnotdistinct`, access method, INCLUDE columns, collations, and operator classes. On PostgreSQL 18, replacing `planning_rounds_chat_id_active_week_start_key` with the same-named `UNIQUE NULLS NOT DISTINCT (chat_id, active_week_start)` is accepted as identical. It changes a core invariant: after one confirmed round releases `active_week_start` to NULL, a later confirmation for the same chat fails because NULLs are no longer distinct. Thus the counts at lines 386-403 and the checks at lines 637-660 can report an exact match for a behaviorally different schema.
**Fix:** Compare normalized `pg_get_constraintdef` output for all constraints on guarded tables and normalized full `pg_get_indexdef` output for every expected index, while rejecting unexpected constraints/indexes. Alternatively, include every semantic catalog property explicitly, including constraint type/definition and index access method, key versus INCLUDE attributes, collation, opclass, and `indnullsnotdistinct`. Add final-prefix drift tests for an unexpected CHECK and a same-named `NULLS NOT DISTINCT` active-week index.

### CR-03: Confirm can promote a slot after the rehearsal has started

**Classification:** BLOCKER
**File:** `src/domain/planning/planning-service.ts:1375-1405`
**Issue:** `selectTime` correctly re-evaluates `slotAvailability` at tap time, and that policy explicitly treats `instantMs <= now` as past (`src/domain/planning/slot-generator.ts:66-89`). `confirm`, however, only rechecks that the selected minute belongs to the snapshotted window and that the wall clock exists. It resolves `startsAt` and proceeds to promotion without comparing it with `now`. A user can select a 15:00 slot at 14:59 and use the still-live 30-minute Confirm token at 15:01; the service writes a `CONFIRMED` round with `startsAt < confirmedAt`. The same path permits a Sunday review card to be confirmed after the chat-local Monday boundary. This creates durable schedule data that the selector's own validity rule says is no longer actionable.
**Fix:** Reuse `slotAvailability(round.timezone, civil, selectedStartMinute, now)` inside the confirm transaction before roster locking or token consumption, and refuse both `past` and `nonexistent` results without spending the Confirm token. Add integration cases that advance the injected clock past the chosen start and across the target week's Monday boundary, then assert the round and token remain unchanged.

## Warnings

### WR-01: A concurrent revision-only update can make stale-week supersession silently lose

**Classification:** WARNING
**File:** `src/domain/planning/planning-service.ts:1535-1564`
**Issue:** `supersedeStaleRounds` reads each draft's revision and performs a single `updateMany` guarded by that revision. If a concurrent re-anchor, status claim, or other draft transition increments the revision after the read but leaves the row `DRAFT`, the supersession matches zero rows and is not retried. Its callers then immediately query for a live draft (`startOrResume` at lines 919-938 and `status` at lines 1740-1754), so they can resume, reject on ownership, or repost last week's stale round even though read-time reaping was meant to make that impossible. The recovery test at `tests/integration/planning-recovery.test.ts:391-448` covers the opposite ordering—supersession wins before re-anchoring—not a re-anchor/revision update winning between the reaper's read and write. Per-chat sequentialization and the single-worker deployment narrow exposure, but the service otherwise supports and tests database-level concurrency, and a later request is required to self-heal the missed transition.
**Fix:** Make the terminal transition conditional on stable facts (`id`, `status: DRAFT`, and a still-stale target week) rather than the previously read revision, while continuing to increment the revision so an in-flight re-anchor loses. If revision must remain in the predicate, re-read and retry every zero-count draft until it is terminal or no longer stale. Add a deterministic two-client regression that increments the draft revision between the reaper's read and guarded update and asserts the same reaping call still supersedes it.

---

_Reviewed: 2026-09-04T21:22:28Z_
_Reviewer: Codex generic-agent reviewer fallback_
_Depth: standard_
