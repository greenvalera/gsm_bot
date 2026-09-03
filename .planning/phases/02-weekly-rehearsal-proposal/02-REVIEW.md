---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-03T12:55:06Z
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
  warning: 2
  info: 0
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-03T12:55:06Z
**Depth:** standard
**Files Reviewed:** 46
**Status:** issues_found

## Summary

The application-level fixes for the previous CR-01 and WR-01 through WR-06 are present and
covered by focused regression tests. The fresh adversarial pass found four new defects in
the T-02-30 migration-deployment seam: two blockers and two warnings. The guard rejects a
normal Phase-1 database, and its definition of safe participant data is weaker than the
composite foreign key it deploys. The latter case was reproduced against disposable
PostgreSQL: both preflight counts printed zero, Prisma started, the foreign key failed, and
the database was left with a failed migration after earlier statements had committed.

The repository passed `npm run typecheck`, all 267 unit tests, and all 123 integration tests
across 13 files with Docker/PostgreSQL 18.4. The two blocker reproductions used additional
disposable PostgreSQL databases because neither missing state is covered by the committed
suite. `src/generated/prisma/**` was treated as generated output; the schema and migration
sources were reviewed instead.

## Narrative Findings (AI reviewer)

### Previous finding verification

- Previous CR-01 is closed: stale cleanup uses each draft's snapshotted timezone and a
  revision-guarded write at `src/domain/planning/planning-service.ts:1534-1562`; the
  Honolulu/Kiritimati boundary is covered at
  `tests/integration/planning-recovery.test.ts:639-684`.
- Previous WR-01 is closed: a failed initial anchor now strips the new card at
  `src/telegram/planning-handlers.ts:886-908`, covered at
  `tests/unit/planning-logging.test.ts:805-816`.
- Previous WR-02 is closed in the target schema and application writes: composite round,
  chat, membership, and user relations are declared at `prisma/schema.prisma:192-230`, and
  Confirm supplies `chatId` at `src/domain/planning/planning-service.ts:1478-1484`.
- Previous WR-03 is closed: participant history is loaded only for eligible non-admin
  members under `PREVIOUS_PARTICIPANTS` at `src/telegram/handlers.ts:587-606`.
- Previous WR-04 is closed: both cooldown compare-and-set predicates use `lte` at
  `src/domain/planning/planning-service.ts:1758-1769,1805-1815`, with exact 59,999/60,000 ms
  boundaries at `tests/integration/planning-recovery.test.ts:544-571,836-852`.
- Previous WR-05 is closed in the production composition root: `PlanningService` receives
  the logger at `src/app/create-bot.ts:67-79` and reports both best-effort sweep failures at
  `src/domain/planning/planning-service.ts:632-647,922-929,1741-1745`.
- Previous WR-06 is closed: the acknowledgement guard marks success only after delivery
  resolves at `src/telegram/callbacks.ts:262-273`, and a rejected first attempt reaches one
  bare fallback in `tests/unit/callback-authority.test.ts:255-278`.

## Critical Issues

### CR-01: The deployment guard rejects every normal database stopped after Phase 1

**Classification:** BLOCKER

**File:** `prisma/migrate-deploy.mjs:26-44,118-131`

**Issue:** The classifier calls a database fresh only when `planning_rounds`,
`planning_participants`, and `chat_memberships` are all absent, and calls every mixed state
inconsistent. But `chat_memberships` is created by the Phase-1 roster migration, before the
Phase-2 planning tables. A legitimate database with all committed Phase-1 migrations
therefore has the exact tuple `(false, false, true)` and is refused before Prisma can apply
Phase 2. This makes the new supported `db:migrate:deploy` command unable to perform the
project's real Phase-1-to-Phase-2 upgrade.

The defect was reproduced with `startPostgresTestContainer({ mode: "before",
exclusiveCutoff: "20260831100411_planning_rounds" })`: the command exited 1 with
`Inconsistent planning schema baseline` and did not start migrations. The suite tests only
an entirely empty database, an immediately-pre-integrity database, and an artificial
`planning_rounds`-only partial schema at
`tests/integration/migration-preflight.test.ts:89-190,281-312`, so the valid prefix is
missing.

**Fix:** Classify `(planning_rounds absent, planning_participants absent)` as a safe
pre-planning migration prefix regardless of whether Phase 1 already created
`chat_memberships`. Prefer validating the applied migration prefix through
`_prisma_migrations` rather than inferring its validity solely from three tables. Add a real
PostgreSQL case at the exclusive cutoff immediately before
`20260831100411_planning_rounds` and require the complete remaining history to deploy.

### CR-02: Zero preflight counts can launch a migration that fails after partially committing

**Classification:** BLOCKER

**File:** `prisma/migrate-deploy.mjs:6-9,46-58,139-150`; `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql:1-36`

**Issue:** The participant preflight only checks whether `membership_id` resolves to any
membership row. The migration's new foreign key is stricter: the membership must also have
the round's chat and the participant's Telegram user. An inherited row with a real
membership ID but a mismatched user or cross-chat membership therefore reports
`dangling participant memberships: 0`, releases migration authority, and fails at the
composite foreign key on line 36.

The migration compounds the damage by committing the enum replacement on line 10; its
indexes, backfill, and constraints are outside that transaction. A disposable reproduction
with a mismatched user produced both preflight counts as zero and then Prisma P3018/SQLSTATE
23503. Afterwards `ABANDONED` was already removed, `planning_participants.chat_id` already
existed, and the `_prisma_migrations` row had no `finished_at`. Subsequent migrations are
blocked until an operator manually recovers the partially applied migration. The existing
blocked-data test covers only a missing membership ID at
`tests/integration/migration-preflight.test.ts:192-279`; the participant-integrity tests
prove the final constraint rejects mismatches but do not exercise them through deployment.

**Fix:** Expand the inherited-data guard to join participants to both their round and
membership and count user/chat mismatches as well as missing memberships. More importantly,
make the migration atomic: begin before the safety assertions and commit only after every
index, backfill, and constraint succeeds. Put the authoritative assertions inside that
transaction so a failed condition rolls back all DDL. Add blocked migration-preflight cases
for mismatched user and cross-chat membership and assert the enum, columns, constraints,
data, and migration ledger are all unchanged after refusal.

## Warnings

### WR-01: Preflight approval and migration execution have an unprotected race window

**Classification:** WARNING

**File:** `prisma/migrate-deploy.mjs:46-73,107-150`

**Issue:** `inspectDatabase` runs both counts, closes its PostgreSQL connection, returns to
`main`, and only then spawns Prisma in another process and connection. No transaction or
lock spans those operations. A legacy writer, administrator, or concurrent maintenance job
can create an `ABANDONED` or invalid participant row after the zero counts but before the
relevant DDL validates existing rows. Depending on timing, the migration either fails or
enters the same partially applied state described in CR-02. The guard proves only that the
database was safe at an earlier instant, not when migration authority was exercised.

**Fix:** Treat the JavaScript preflight as operator diagnostics only. Perform the binding
checks inside the migration's single transaction after taking write-blocking locks on the
three affected tables, and keep those locks until every schema change commits. Add a
concurrency test that attempts an unsafe write between preflight and constraint creation
and proves either the writer blocks or the whole migration rolls back.

### WR-02: Inherited Prisma stderr can disclose row and database identifiers

**Classification:** WARNING

**File:** `prisma/migrate-deploy.mjs:66-73`

**Issue:** The guard's own diagnostics are bounded, but the Prisma child inherits stdout
and stderr unchanged. In the CR-02 reproduction Prisma printed the database host/port plus
the foreign-key `DETAIL`, including the participant's membership ID, chat ID, and Telegram
user ID. That contradicts the T-02-30-I requirement that deployment diagnostics not expose
connection details or row identifiers. Any other data-dependent migration error can bypass
the runner's careful aggregate-only messages in the same way.

**Fix:** Pipe the child streams through a bounded redaction layer before forwarding them.
At minimum suppress PostgreSQL `DETAIL` key values and Prisma datasource target lines, and
scrub URL/credential forms while preserving the migration name and error code needed for
recovery. Add an end-to-end failure case with distinctive fake identifiers and assert none
appear in captured stdout or stderr.

---

_Reviewed: 2026-09-03T12:55:06Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
