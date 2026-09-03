---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-03T13:21:00Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-03T13:21:00Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 2

**Summary:**

- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: The deployment guard rejects every normal database stopped after Phase 1

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** 497f53f
**Status:** fixed: requires human verification
**Applied fix:** The deployment classifier now recognizes databases without either planning table as safe pre-planning states and validates an existing Prisma migration ledger against the committed migration-directory prefix. A PostgreSQL regression stops immediately before `20260831100411_planning_rounds` and requires the entire remaining history to deploy.

### CR-02: Zero preflight counts can launch a migration that fails after partially committing

**Files modified:** `prisma/migrate-deploy.mjs`, `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`, `tests/integration/migration-preflight.test.ts`
**Commits:** c760002, e780bd9
**Status:** fixed: requires human verification
**Applied fix:** The diagnostic guard now counts missing rounds or memberships plus chat/user mismatches. The authoritative migration assertions and every enum, index, backfill, and constraint change run in one transaction. Real PostgreSQL cases cover missing, mismatched-user, and cross-chat bindings, preserve pre-migration schema/data/ledger state on preflight refusal, and prove late-statement failure rolls back earlier DDL. The composite foreign-key identifier also matches Prisma's 63-byte convention, leaving no schema drift.

### WR-01: Preflight approval and migration execution have an unprotected race window

**Files modified:** `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`, `tests/integration/migration-preflight.test.ts`
**Commits:** 00af70f, 800a866, ea07117
**Status:** fixed: requires human verification
**Applied fix:** The migration acquires `SHARE ROW EXCLUSIVE` locks on rounds, participants, and memberships before its in-transaction checks and retains them through constraint creation and commit. A deterministic PostgreSQL advisory-lock barrier proves a concurrent unsafe writer blocks and times out while those table locks are held, after which the migration completes atomically.

### WR-02: Inherited Prisma stderr can disclose row and database identifiers

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commits:** 7a939ed, a10e1de, b37816a
**Status:** fixed
**Applied fix:** Prisma child stdout and stderr are now piped into independent 64 KiB bounded captures before forwarding. Datasource target lines, PostgreSQL `DETAIL` values, database URLs, and keyword-form credentials are redacted while migration and SQLSTATE recovery metadata remain visible. The PostgreSQL failure regression supplies distinctive fake membership/chat/user values and verifies none escape in either stream.

## Verification

- Isolated worktrees: JavaScript syntax checks, TypeScript typechecks, Prisma schema validation, scoped Prettier checks, and the unit suite passed while each finding was applied.
- Main checkout after transactional fast-forward: `npm run typecheck` passed; `npm run test:unit` passed (24 files, 267 tests); scoped formatting and `git diff --check` passed; Prisma schema validation passed.
- Main checkout with Docker access: the focused migration-preflight suite passed (11 tests), and the full integration suite passed (13 files, 129 tests).
- Docker migrate image: the `migrate` target built successfully, replayed all nine committed migrations into disposable PostgreSQL 18.4, and `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` reported `No difference detected`.

---

_Fixed: 2026-09-03T13:21:00Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 2_
