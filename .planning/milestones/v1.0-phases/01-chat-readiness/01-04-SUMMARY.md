---
phase: 01-chat-readiness
plan: 04
subsystem: deployment runtime
tags: [docker, compose, node, prisma, grammy, geo-tz]
requires:
  - phase: 01-03
    provides: "Strict boot configuration, Prisma client factory, and migrated PostgreSQL tracer"
provides:
  - "Pinned multi-stage non-root Node 24 production image"
  - "Compose PostgreSQL health, committed-migration, and single-bot startup topology"
  - "Build and runtime gates for geo-tz boundary data"
affects: [01-05, 01-14, deployment, ci]
actuals:
  tokens: 1787
  tasks: 1
  commits: 2
tech-stack:
  added: [Docker Compose, OpenSSL runtime support]
  patterns:
    - "Compile TypeScript into a dedicated runtime output while keeping the developer typecheck no-emit."
    - "Gate one long-poll bot process behind PostgreSQL health and prisma migrate deploy."
    - "Treat geo-tz boundary files as required runtime data and smoke-test them in every image stage."
key-files:
  created:
    - Dockerfile
    - .dockerignore
    - compose.yaml
    - tsconfig.build.json
    - src/app/main.ts
  modified:
    - package.json
key-decisions:
  - "Use separate migration and production-dependency Docker stages so migrations retain Prisma CLI while the bot image omits development dependencies."
  - "Keep geo-tz in node_modules and validate geo-tz/dist/find-now against a known coordinate before the image can pass."
  - "Inject bot and database secrets with Compose environment interpolation; no credential is committed."
patterns-established:
  - "Register chat-key sequentialization before starting one grammY runner, then await runner stop before disconnecting Prisma on signals."
requirements-completed: [CONF-01, AUTH-02]
coverage:
  - id: D1
    description: "A non-root production image contains compiled application output, no TypeScript development tooling, and readable geo-tz boundary data."
    requirement: CONF-01
    verification:
      - kind: integration
        ref: "docker build -t gsmbot:phase-01 . && docker run --rm gsmbot:phase-01 sh -lc 'test non-root, compiled Prisma import, and geo-tz find-now lookup'"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compose waits for healthy PostgreSQL and successful committed Prisma migration before the single long-poll bot starts."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "docker compose config -q && docker compose run --rm --no-deps migrate"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#walking-skeleton"
        status: pass
    human_judgment: false
duration: 20 min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 04: Reproducible Docker Runtime Summary

**A non-root Node 24 image now runs the compiled Telegram tracer behind healthy PostgreSQL and committed migrations, with geo-tz boundary data verified inside the image.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-20T09:14:00Z
- **Completed:** 2026-08-20T09:34:41Z
- **Tasks:** 1/1
- **Files modified:** 6

## Accomplishments

- Added a pinned multi-stage `node:24.19-bookworm-slim` image that compiles the TypeScript service, generates Prisma Client, prunes development dependencies, and runs as user `gsmbot`.
- Added Compose PostgreSQL 18.4 health checks, one-shot `prisma migrate deploy`, and a single bot service that cannot start until both prerequisites pass.
- Added build and runtime smoke gates for `node_modules/geo-tz/data` and `geo-tz/dist/find-now`; the known Seattle coordinate resolves inside the production image.
- Added the main composition root with Pino error logging, live Telegram membership lookup, chat-key sequentialization, and graceful SIGTERM/SIGINT shutdown.

## Task Commits

1. **Task 1: Package the proven tracer as the reproducible development deployment** — `7e2fdca` (feat)

## Files Created/Modified

- `Dockerfile` — audited-lockfile build, Prisma generation/migration stages, non-root runtime, and geo-tz data gates.
- `.dockerignore` — excludes local dependencies, planning artifacts, secrets, and test output from the image context.
- `compose.yaml` — PostgreSQL health, one-shot migration, and single-worker service graph.
- `tsconfig.build.json` — emits Node-runnable production JavaScript without changing the no-emit developer compiler contract.
- `src/app/main.ts` — application composition root and graceful long-poll runner lifecycle.
- `package.json` — runtime build and documented `docker compose up --build bot` script.

## Decisions Made

- Kept the migration stage unpruned so it can run Prisma CLI, while the production stage copies only pruned dependencies and compiled output.
- Left `GEO_TZ_DATA_PATH` unset because `geo-tz` retains its default package-relative data directory in the runtime image.
- Required `BOT_TOKEN` and `POSTGRES_PASSWORD` through Compose interpolation; `npm run docker:up` is the local full-stack command after supplying both values.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added an emitting TypeScript build configuration.**

- **Found during:** Task 1
- **Issue:** The existing TypeScript configuration intentionally used `noEmit`, so the production image could not contain compiled application output.
- **Fix:** Added `tsconfig.build.json` with production output and `rewriteRelativeImportExtensions`, then made Docker build that output.
- **Files modified:** `tsconfig.build.json`, `package.json`, `Dockerfile`
- **Verification:** `npm run build:runtime` and the in-image compiled Prisma import passed.
- **Committed in:** `7e2fdca`

**2. [Rule 3 - Blocking issue] Installed OpenSSL in build and runtime stages.**

- **Found during:** Task 1 migration verification
- **Issue:** Prisma reported that the slim image could not detect OpenSSL while running the committed migration.
- **Fix:** Installed the minimal OpenSSL package in both image stages before generating or using Prisma artifacts.
- **Files modified:** `Dockerfile`
- **Verification:** `docker compose run --rm --no-deps migrate` completed without the OpenSSL warning.
- **Committed in:** `7e2fdca`

**Total deviations:** 2 auto-fixed (Rule 2 and Rule 3).

## Issues Encountered

- The sandbox cannot access the Docker daemon. Image, Compose, migration, and integration verification were rerun with approved local Docker access; temporary Compose containers and network were removed afterward, while the named development volume remains available.
- The planning state helper left its YAML plan counter stale; an additional helper call advanced the rendered counter once too far. The recorded position was reconciled to Plan 5, which matches the five completed summaries on disk.

## User Setup Required

Set `BOT_TOKEN` and `POSTGRES_PASSWORD` in the shell or an uncommitted environment file, then run `npm run docker:up`.

## Next Phase Readiness

Later chat-readiness plans can run against the same reproducible Compose path. The production image preserves the approved `geo-tz@8.1.8` data directory and will reject missing or unreadable timezone boundaries at build time.

## Self-Check: PASSED

- The six task files exist and task commit `7e2fdca` is present in Git history.
- `npm run format:check`, `npm run typecheck`, `npm run build:runtime`, `npm run test:unit`, and `npm run test:integration -- walking-skeleton` passed.
- `docker compose config -q`, `docker build -t gsmbot:phase-01 .`, the non-root geo-tz runtime smoke test, and `docker compose run --rm --no-deps migrate` passed.

---

*Phase: 01-chat-readiness*
*Completed: 2026-08-20*
