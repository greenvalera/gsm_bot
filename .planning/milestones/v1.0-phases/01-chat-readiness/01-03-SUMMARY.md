---
phase: 01-chat-readiness
plan: 03
subsystem: runtime configuration and verification infrastructure
tags: [typescript, zod, prisma, postgresql, testcontainers, vitest]
requires:
  - phase: 01-02
    provides: "Migrated Prisma 7 /setup tracer with injected clock and membership seams"
provides:
  - "Strict TypeScript compiler settings for authored application and test code"
  - "Secret-safe Zod boot configuration with explicit production, test, and smoke modes"
  - "Shared Prisma 7 adapter factory and migrated PostgreSQL 18 integration fixture"
affects: [01-04, 01-05, 01-06, 01-07, 01-08, 01-09, test-infrastructure]
actuals:
  tokens: 4177
  tasks: 1
  commits: 1
tech-stack:
  added: []
  patterns:
    - "Validate environment configuration before constructing external clients, and report keys without values."
    - "Use committed Prisma migrations in each disposable PostgreSQL integration database."
key-files:
  created:
    - tsconfig.json
    - vitest.config.ts
    - src/app/config.ts
    - src/infrastructure/db/prisma.ts
    - tests/helpers/postgres.ts
    - tests/unit/config.test.ts
  modified:
    - package.json
    - src/app/create-bot.ts
    - tests/integration/walking-skeleton.test.ts
key-decisions:
  - "Use explicit APP_MODE values instead of inferring test or smoke behavior from NODE_ENV."
  - "Run unit and container-backed integration tests as distinct Vitest projects; integration files are serial with 60-second bounds."
  - "Use Prisma 7's required PostgreSQL driver adapter only through createPrismaClient."
patterns-established:
  - "Keep Telegram membership and clock dependencies injected while strict compiler settings propagate through the tracer."
  - "Test database setup applies prisma migrate deploy and never schema push."
requirements-completed: [CONF-01, AUTH-02]
coverage:
  - id: D1
    description: "Boot configuration rejects missing or invalid token/database inputs without including secret values in errors."
    requirement: CONF-01
    verification:
      - kind: unit
        ref: "tests/unit/config.test.ts#loadConfig"
        status: pass
      - kind: other
        ref: "npm run format:check && npm run lint && npm run typecheck && npm run test:unit"
        status: pass
    human_judgment: false
  - id: D2
    description: "The protected /setup tracer runs on a fresh PostgreSQL 18 container after committed migrations through the shared Prisma factory."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#walking-skeleton"
        status: pass
      - kind: other
        ref: "npm run test:integration -- walking-skeleton"
        status: pass
    human_judgment: false
duration: 8 min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 03: Strict Configuration and Test Seams Summary

**Strict TypeScript, secret-safe Zod configuration, and reusable PostgreSQL 18 migration fixtures now provide deterministic feedback around the protected `/setup` tracer.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-08-20T09:22:40Z
- **Tasks:** 1/1
- **Files modified:** 9
- **Measured unit-test duration:** 245ms (under the required 60 seconds)

## Accomplishments

- Enabled strict TypeScript including unchecked-index and exact-optional-property checks across authored source and tests.
- Added `loadConfig` validation for the bot token, direct PostgreSQL URL, log level, and explicit production/test/smoke modes; validation errors name only invalid keys.
- Extracted Prisma 7 adapter construction and PostgreSQL 18 `migrate deploy` fixture setup, then ran the existing walker through that shared path.

## Task Commits

1. **Task 1: Establish strict configuration and deterministic Wave 0 verification seams** — `204cf03` (feat)

## Files Created/Modified

- `tsconfig.json` and `vitest.config.ts` — strict compiler and separated deterministic test-suite contracts.
- `src/app/config.ts` — secret-safe Zod boot configuration.
- `src/infrastructure/db/prisma.ts` — Prisma 7 PostgreSQL adapter client factory.
- `tests/helpers/postgres.ts` — disposable PostgreSQL 18 container and committed-migration helper.
- `tests/unit/config.test.ts` — missing/invalid configuration and secret-redaction tests.
- `tests/integration/walking-skeleton.test.ts` — tracer migrated to shared database and Prisma seams.

## Decisions Made

- Kept test and smoke behavior explicit in `APP_MODE`; runtime behavior is not inferred from ambient Node environment flags.
- Kept integration tests serial and bounded because each file owns a disposable PostgreSQL container.
- Retained injected membership and clock dependencies so later demotion and expiry tests do not depend on process-global state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Strict typing] Repaired pre-existing optional values exposed by the new compiler contract.**

- **Found during:** Task 1 verification
- **Issue:** `exactOptionalPropertyTypes` rejected an undefined `botInfo` option, weak test doubles, and unchecked array accesses in the existing tracer.
- **Fix:** Omitted undefined bot options, used concrete grammY/Prisma types in the tracer, and checked optional callback/message records before use.
- **Files modified:** `src/app/create-bot.ts`, `tests/integration/walking-skeleton.test.ts`, `tests/helpers/postgres.ts`
- **Verification:** `npm run typecheck` and both test suites pass.
- **Committed in:** `204cf03`

**Total deviations:** 1 auto-fixed (Rule 1).

## Issues Encountered

- The sandbox cannot reach a container runtime; the planned PostgreSQL verification passed when rerun with access to the local Docker runtime.

## User Setup Required

None - no external service configuration was added.

## Next Phase Readiness

Later plans can use the shared strict configuration, Prisma factory, and migrated PostgreSQL fixture without adding unapproved packages. The exact approved lockfile and the `geo-tz` Docker data obligation remain unchanged.

## Self-Check: PASSED

- Task commit `204cf03` exists in Git history.
- All created configuration, database, and test helper files exist.
- `npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run test:integration -- walking-skeleton` passed.

---

*Phase: 01-chat-readiness*
*Completed: 2026-08-20*
