---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-05T06:29:01Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 7
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-05T06:29:01Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 7

**Summary:**

- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### CR-01: Exact-prefix validation ignores colliding non-table relations and non-enum types

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** 9a46e86
**Status:** fixed: requires independent review
**Applied fix:** The preflight namespace catalog now compares every application-owned relation object, including indexes, and every standalone user-defined type rather than filtering to tables and enums. Each accepted migration prefix derives its exact permitted relation-name/kind and type-name/kind sets. A future `PlanningRoundStatus` domain and a future `chat_status_cooldowns` view are rejected before Prisma starts, with regression assertions proving the ledger and pending schema remain unchanged.

### CR-02: Invalid indexes can satisfy the final-prefix catalog

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** 9a46e86
**Status:** fixed: requires independent review
**Applied fix:** Every expected index must now have the exact normalized definition and be valid, ready, and live according to `pg_index`. The regression deliberately leaves a same-named invalid unique index after a failed concurrent build and proves deploy refuses the final prefix without changing migration history or index state.

### WR-01: Planning transaction failures lose their original error before logging

**Files modified:** `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts`, `tests/unit/planning-logging.test.ts`
**Commit:** 3bea40a
**Status:** fixed: requires independent review
**Applied fix:** All planning service failure variants now carry the caught value. Start, day/time selection, Back, takeover, re-anchor, and initial anchor handling route that value through the existing failure logger under `err`; expected no-op conflicts remain bounded non-error results. Tests drive start, selection, Back, takeover, confirm, and re-anchor failures, assert the original error is retained, and verify Telegram receives only generic failure copy.

## Verification

- Typed GSD fixer agents were quota-blocked and produced no partial changes; the orchestrator applied the scoped fixes directly inside the active GSD review-fix workflow.
- `node --check prisma/migrate-deploy.mjs` passed.
- `npm run typecheck` passed.
- `npm run test:unit` passed: 24 files, 270 tests.
- `npx vitest run --project integration tests/integration/migration-preflight.test.ts` passed with Docker/PostgreSQL: 1 file, 26 tests.
- Scoped Prettier and `git diff --check` passed.

---

_Fixed: 2026-09-05T06:29:01Z_
_Fixer: Codex orchestrator fallback_
_Iteration: 7_
