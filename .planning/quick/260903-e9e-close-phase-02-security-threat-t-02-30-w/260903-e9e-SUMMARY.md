---
phase: 02-weekly-rehearsal-proposal
plan: 01
quick_id: 260903-e9e
subsystem: database
tags: [postgres, prisma, migrations, security, testcontainers]

requires:
  - phase: 02-09
    provides: Participant-integrity migration and the two inherited-data preflight queries
provides:
  - Fail-closed migration deployment guard for fresh, inherited, and inconsistent planning schemas
  - Deterministic PostgreSQL coverage for clean and blocked inherited databases
  - Exact migration-prefix fixture support without changing committed migration contents
affects: [deployment, compose, ci, phase-02-security]

actuals:
  tokens: 5576
  tasks: 1
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Release migration authority only after bounded PostgreSQL preflight checks complete and the client closes"
    - "Construct inherited integration fixtures from an exact committed migration-history prefix"

key-files:
  created:
    - prisma/migrate-deploy.mjs
    - tests/integration/migration-preflight.test.ts
  modified:
    - package.json
    - tests/helpers/postgres.ts

key-decisions:
  - "All three planning tables absent is fresh, all three present is inherited, and any mixed state fails closed."
  - "PostgreSQL count strings are parsed as bigint so preflight decisions cannot lose precision."
  - "The preflight connection always closes before the repository-local Prisma executable receives migration authority."

patterns-established:
  - "The supported db:migrate:deploy package command is the only deployment seam and owns inherited-data safety checks."
  - "Integration tests may select migrations before an exact exclusive cutoff while the default helper still applies the full history."

requirements-completed: [PLAN-01, PLAN-02, PLAN-08]

coverage:
  - id: D1
    description: "The supported deployment command classifies fresh and inherited planning schemas before invoking Prisma"
    requirement: PLAN-01
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#replays every committed migration for a fresh database"
        status: pass
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#checks a clean inherited database before applying the pending integrity migration"
        status: pass
    human_judgment: false
  - id: D2
    description: "Unsafe inherited data reports both exact counts and preserves every anomalous row without starting the pending migration"
    requirement: PLAN-02
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#refuses blocked inherited data without starting the integrity migration"
        status: pass
    human_judgment: false
  - id: D3
    description: "Partial planning schemas fail closed and CI plus Compose retain the guarded npm command"
    requirement: PLAN-08
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#fails closed for a partial inherited schema"
        status: pass
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#routes CI and Compose through only the guarded package command"
        status: pass
      - kind: other
        ref: "docker build --target migrate and image file-presence check"
        status: pass
    human_judgment: false

duration: 10m
completed: 2026-09-03
status: complete
---

# Quick Task 260903-e9e: Guarded Migration Deploy Summary

**A fail-closed PostgreSQL preflight now protects inherited databases before the participant-integrity migration while preserving full fresh-database replay.**

## Performance

- **Duration:** 10 minutes
- **Started:** 2026-09-03T12:34:03Z
- **Completed:** 2026-09-03T12:44:24Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments

- Replaced bare `prisma migrate deploy` with a single guarded runner that distinguishes fresh, inherited, and inconsistent planning schemas.
- Executed the exact legacy-status and dangling-membership counts independently, using precision-safe `bigint` decisions and bounded diagnostics that never expose connection details or row identities.
- Proved fresh replay, clean inherited deployment, blocked inherited preservation, partial-baseline refusal, and CI/Compose wiring against disposable PostgreSQL 18.4 databases.
- Added exact migration-prefix fixtures under ignored `node_modules/.cache` storage without changing committed migrations or the default fully migrated helper behavior.

## Task Commits

1. **Task 1 RED: Specify guarded migration deployment** — `5540bf5` (test)
2. **Task 1 GREEN: Guard inherited migration deployment** — `6a725a3` (feat)

## Files Created/Modified

- `prisma/migrate-deploy.mjs` — Classifies schema state, runs both exact counts, refuses unsafe or indeterminate states, and only then starts the repository-local Prisma CLI.
- `package.json` — Routes `db:migrate:deploy` through the guarded runner.
- `tests/helpers/postgres.ts` — Supports no-migration and exact exclusive-cutoff test databases while keeping full migration replay as the zero-argument default.
- `tests/integration/migration-preflight.test.ts` — Proves process output ordering, migration records, catalog effects, blocked-row preservation, partial-baseline refusal, and operational wiring.

## Decisions Made

- A mixed planning-table baseline is unsafe even if Prisma could potentially repair it; deployment refuses it before Prisma starts.
- Both anomaly queries run and both aggregate counts are reported before the decision, so operators receive the complete bounded diagnosis in one attempt.
- Disposable prefix histories are copied byte-for-byte and selected lexicographically before an asserted exact cutoff, preventing typo-driven empty fixtures.

## Verification

- TDD RED: focused suite failed all **5 tests** against the original bare deployment path.
- Focused migration preflight suite: **1 file, 5 tests passed**.
- Full integration project: **13 files, 123 tests passed**.
- Full unit project: **24 files, 267 tests passed**.
- `npm run typecheck`: passed.
- `prisma validate`: passed.
- Scoped Prettier check over all four owned files: passed.
- Migrate-stage Docker image build: passed; `/app/prisma/migrate-deploy.mjs` exists in the image.
- Protected scope diff: no changes to `package-lock.json`, Prisma schema/migrations, CI, Compose, or Dockerfile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Waited for PostgreSQL's stable second readiness event**

- **Found during:** Task 1 GREEN verification
- **Issue:** A no-migration fixture returned after PostgreSQL's pre-initialization readiness log, then lost connections during the image's initialization restart.
- **Fix:** Required the existing readiness log twice, matching PostgreSQL's final stable startup state.
- **Files modified:** `tests/helpers/postgres.ts`
- **Verification:** Focused suite passed repeatedly and the complete 13-file integration project passed.
- **Committed in:** `6a725a3`

---

**Total deviations:** 1 auto-fixed bug
**Impact on plan:** The correction makes the required fresh and partial-baseline fixtures deterministic without changing production behavior or existing helper callers.

## Issues Encountered

- Prisma writes some informational lines to stderr, so the ordering assertion uses the target migration's `Applying migration` stdout line as the positive proof that both zero-count messages appeared before Prisma began the pending migration.

## Known Stubs

None.

## User Setup Required

None - the supported CI and Compose migration command inherits the guard automatically.

## Next Phase Readiness

- T-02-30 now has executable, fail-closed coverage on the deployment seam used by CI and Compose.
- Phase 02 security can be re-audited with deterministic clean and blocked inherited-database evidence.

## Self-Check: PASSED

---
*Quick task: 260903-e9e*
*Completed: 2026-09-03*
