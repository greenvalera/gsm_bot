---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-04T07:36:16Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 4
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-04T07:36:16Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 4

**Summary:**

- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: Complete-looking ledgerless schemas bypass migration-history validation

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** c175144
**Status:** fixed: requires human verification
**Applied fix:** Every nonempty planning schema now requires an existing Prisma ledger whose active rows are finished, ordered, checksum-matched entries from the committed migration prefix. The guard validates the planning columns, enums, indexes, constraints, and successor objects claimed by that prefix before returning an inherited state. PostgreSQL regressions prove that complete-looking ledgerless tables and a checksum-valid ledger with catalog drift both fail closed without spawning Prisma or creating/changing the ledger.

### CR-02: Superseding a round does not invalidate an in-flight status repost

**Files modified:** `src/domain/planning/planning-service.ts`, `tests/integration/planning-recovery.test.ts`
**Commit:** a669f61
**Status:** fixed: requires human verification
**Applied fix:** `supersedeStaleRounds` now advances `revision` in the same compare-and-set that changes the round to `SUPERSEDED` and releases `activeWeekStart`. `reanchor` additionally requires `status: DRAFT`, preventing any terminal round from acquiring a newly posted anchor. A PostgreSQL-backed handler race supersedes an unanchored draft while `sendMessage` is in flight and verifies that re-anchoring is stale, the terminal row remains unanchored, and the new keyboard is stripped.

## Verification

- Verification ran in the main checkout because `workflow.use_worktrees=false` was temporarily selected for this fixer run.
- `node -c prisma/migrate-deploy.mjs` passed.
- `npm run typecheck` passed.
- Scoped Prettier and `git diff --check` checks passed for both findings.
- `npm run test:integration -- tests/integration/migration-preflight.test.ts` passed with Docker/PostgreSQL 18.4: 1 file, 15 tests. This includes the ledgerless-schema and catalog-drift regressions plus the existing transactional and bounded/redacted-output cases.
- `npm run test:integration -- tests/integration/planning-recovery.test.ts` passed with Docker/PostgreSQL 18.4: 1 file, 19 tests. This includes the new supersession/re-anchor race and existing recovery, cooldown, concurrency, and timezone coverage.

---

_Fixed: 2026-09-04T07:36:16Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 4_
