---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-04T16:30:00Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 5
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-04T16:30:00Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 5

**Summary:**

- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### CR-01: A drifted Phase 1 schema is accepted solely from its migration ledger

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** a8887e1
**Status:** fixed: requires human verification
**Applied fix:** Every accepted Phase 1 prefix now requires the migration names, completion state, and checksums to match the committed prefix and validates the catalog objects consumed by pending planning migrations. This includes the roster tables, membership identity columns, primary/foreign keys, unique index definitions, callback expiry column, and prefix-dependent enum values. A PostgreSQL regression drops `chat_memberships` from a valid Phase 1 prefix and proves the wrapper refuses before creating any planning objects or changing the migration ledger.

### CR-02: Cooldown-prefix catalog validation accepts premature and malformed tables

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** a8887e1
**Status:** fixed: requires human verification
**Applied fix:** The preflight now models the exact catalog claimed by each planning-era prefix. It validates planning and cooldown table kinds; exact column order, types, nullability, and defaults; enum labels; primary and foreign-key definitions; index uniqueness, columns, and predicates; and the integrity migration's external indexes. Objects belonging to a future migration must be absent. PostgreSQL regressions prove that both a premature cooldown table and a cooldown ledger with a missing required column fail closed before Prisma starts.

## Verification

- The specialized fixer hit its usage limit before completing this iteration, so the orchestrator preserved its uncommitted Phase 1 catalog work and completed the bounded fix inline in the active GSD review workflow.
- `node --check prisma/migrate-deploy.mjs` passed.
- `npm run typecheck` passed.
- `npm run test:unit` passed: 24 files, 267 tests.
- `npm run test:integration -- tests/integration/migration-preflight.test.ts` passed with Docker/PostgreSQL 18.4: 1 file, 18 tests.
- Scoped Prettier and `git diff --check` passed.
- The transaction rollback regression now uses an event-triggered late DDL failure, preserving proof that the integrity migration rolls back earlier statements even though the stricter preflight rejects conflicting catalog objects before Prisma starts.

---

_Fixed: 2026-09-04T16:30:00Z_
_Fixer: Codex orchestrator (specialized-fixer fallback)_
_Iteration: 5_
