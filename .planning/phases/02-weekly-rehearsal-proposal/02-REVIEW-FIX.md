---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-04T21:40:00Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 6
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-04T21:40:00Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 6

**Summary:**

- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Valid Phase 1 ledgers still bypass exact schema validation

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** f36862f
**Status:** fixed: requires human verification
**Applied fix:** Every accepted committed prefix now maps to one exact application catalog. The preflight compares the complete expected relation and enum sets; ordered columns with types, nullability, and defaults; every PostgreSQL 18 constraint and its normalized `pg_get_constraintdef`; and every index's normalized full `pg_get_indexdef`. Objects belonging to later migrations are absent by construction. PostgreSQL regressions cover a dropped Phase 1 configuration column and each premature planning enum while proving the ledger and planning objects remain unchanged.

### CR-02: Exact Phase 2 matching ignores behavior-changing constraint and index properties

**Files modified:** `prisma/migrate-deploy.mjs`, `tests/integration/migration-preflight.test.ts`
**Commit:** f36862f
**Status:** fixed: requires human verification
**Applied fix:** Constraint validation now includes all constraint types and normalized definitions, so unexpected `CHECK`, UNIQUE, exclusion, and not-null constraints are visible and rejected. Index validation compares the full normalized PostgreSQL definition, covering access method, uniqueness, NULL-distinctness, key and INCLUDE attributes, collations, operator classes, expressions, and predicates. Regressions prove refusal for an unexpected confirmation-blocking CHECK and a same-named `UNIQUE NULLS NOT DISTINCT` active-week index.

### CR-03: Confirm can promote a slot after the rehearsal has started

**Files modified:** `src/domain/planning/planning-service.ts`, `tests/integration/planning-confirm.test.ts`
**Commit:** 83f8dc5
**Status:** fixed: requires human verification
**Applied fix:** Confirm now reuses `slotAvailability` with the transaction's injected current time before roster locking or callback consumption. Past and nonexistent wall times return stale without mutating the round, spending the Confirm capability, or snapshotting participants. PostgreSQL-backed handler regressions cover the selected start passing, the chat-local Monday boundary, and a now-nonexistent DST wall clock.

### WR-01: Concurrent revision activity can make stale-week supersession silently lose

**Files modified:** `src/domain/planning/planning-service.ts`, `tests/helpers/racing-client.ts`, `tests/integration/planning-recovery.test.ts`
**Commit:** 83f8dc5
**Status:** fixed: requires human verification
**Applied fix:** Stale-round supersession is now guarded by the stable transition facts—round identity, DRAFT status, and a target week still behind the round's snapshotted local current week—rather than by a previously read revision. The transition still increments revision so in-flight reanchors lose. A deterministic independent-client regression commits a revision update between the reaper read and update and proves the same call supersedes the round.

## Verification

- Typed GSD fixer/reviewer agents were quota-blocked, so two isolated generic fixer workstreams implemented non-overlapping migration and planning changes; the orchestrator inspected, integrated, and committed them centrally.
- `node --check prisma/migrate-deploy.mjs` passed.
- `npm run typecheck` passed.
- `npm run test:unit` passed: 24 files, 267 tests.
- `npm run test:integration -- tests/integration/migration-preflight.test.ts tests/integration/planning-confirm.test.ts tests/integration/planning-recovery.test.ts` passed with Docker/PostgreSQL 18.4: 3 files, 62 tests.
- Focused migration-preflight coverage is 23/23; focused confirmation and recovery coverage is 39/39.
- Scoped Prettier and `git diff --check` passed.

---

_Fixed: 2026-09-04T21:40:00Z_
_Fixer: Codex generic-agent fallback workstreams + orchestrator_
_Iteration: 6_
