---
phase: 02-weekly-rehearsal-proposal
plan: 09
subsystem: database
tags: [prisma, postgres, foreign-keys, indexes, callbacks, zod]

requires:
  - phase: 02-07
    provides: Corrected planning copy and logging surfaces used by the callback dispatcher
provides:
  - Restricting membership foreign key for durable planning participant snapshots
  - User-id and callback-expiry indexes for previous-participant and retention queries
  - Reachable-only PlanningRoundStatus enum and callback action vocabulary
  - PostgreSQL catalog tests for constraints, cascade policy, indexes, and enum labels
affects: [availability collection, participant authorization, callback retention, phase 02-11]

actuals:
  tokens: 185139
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Protect cross-phase snapshot identity with a database foreign key and Restrict deletion policy"
    - "Verify database contracts through pg_indexes and pg_enum instead of treating the Prisma schema as its own evidence"
    - "Derive accepted callback actions from the complete set of minting sites"

key-files:
  created:
    - prisma/migrations/20260902152000_planning_participant_integrity/migration.sql
    - src/generated/prisma/client.ts
    - tests/integration/planning-participant-integrity.test.ts
  modified:
    - prisma/schema.prisma
    - src/shared/callback-schema.ts
    - src/telegram/planning-handlers.ts
    - tests/unit/planning-logging.test.ts

key-decisions:
  - "PlanningParticipant references ChatMembership with onDelete: Restrict, while deleting a PlanningRound retains its existing participant cascade."
  - "The status migration removes the unreachable enum value without deleting or rewriting application rows."
  - "Unknown planning actions are rejected by Zod and reuse the stale-action/unparseable-planning-target trace rather than retaining a dedicated dead dispatcher branch."

patterns-established:
  - "Forward migrations are replayed into a disposable PostgreSQL instance and diffed against schema.prisma before merge."
  - "Catalog tests assert index leading columns and enum labels from the live database."

requirements-completed: [PLAN-01, PLAN-02, PLAN-08]

coverage:
  - id: D1
    description: "Participant snapshots require an existing membership, and referenced memberships cannot be deleted while the snapshot survives"
    requirement: PLAN-02
    verification:
      - kind: integration
        ref: "tests/integration/planning-participant-integrity.test.ts#planning participant referential integrity"
        status: pass
      - kind: other
        ref: "prisma migrate deploy plus migrate diff returned No difference detected"
        status: pass
    human_judgment: false
  - id: D2
    description: "Participant user lookup and callback expiry retention each have an index with the queried column first"
    requirement: PLAN-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-participant-integrity.test.ts#has indexes led by participant user id and callback expiry"
        status: pass
    human_judgment: false
  - id: D3
    description: "PlanningRoundStatus exposes only reachable labels in PostgreSQL and the generated Prisma client"
    requirement: PLAN-08
    verification:
      - kind: integration
        ref: "tests/integration/planning-participant-integrity.test.ts#offers exactly the three reachable planning round statuses"
        status: pass
      - kind: other
        ref: "src/generated/prisma/enums.ts contains no removed status label"
        status: pass
    human_judgment: false
  - id: D4
    description: "The planning callback parser accepts exactly day, time, back, confirm, and takeover, rejecting any other action at the parse boundary"
    requirement: PLAN-01
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#a token naming an action outside the minted vocabulary"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false

duration: 9m
completed: 2026-09-02
status: complete
---

# Phase 2 Plan 09: Participant Integrity and Callback Vocabulary Summary

**Planning participant snapshots now have enforced membership identity, query-aligned indexes, reachable-only status and callback vocabularies, and live PostgreSQL proofs.**

## Performance

- **Duration:** 9 minutes
- **Started:** 2026-09-02T19:51:00Z
- **Completed:** 2026-09-02T19:59:49Z
- **Tasks:** 3
- **Files modified:** 23 (18 generated Prisma files committed as required)

## Accomplishments

- Added a restricting `PlanningParticipant.membership` foreign key, preserving the existing round-side cascade while preventing dangling participant snapshots.
- Added leading-column indexes for previous-participant lookups and callback expiry retention, and proved both from PostgreSQL catalog data.
- Removed the unreachable planning status from the schema, migration history output, live database, and regenerated Prisma client without deleting or rewriting rows.
- Narrowed planning callback parsing to the five actions actually minted and replaced the dead dispatch refusal with a tested parse-boundary stale response.

## Task Commits

1. **Task 1: Enforce schema integrity, indexes, and reachable statuses** — `2c95a9c` (feat)
2. **Task 2: Prove the database contract on PostgreSQL** — `3ea6be1` (test)
3. **Task 2: Satisfy exact optional fixture typing** — `8b973bf` (fix)
4. **Task 3 RED: Require unknown actions to fail at the parser boundary** — `157d9dc` (test)
5. **Task 3 GREEN: Narrow the planning callback vocabulary** — `384c01b` (feat)
6. **Plan formatting: Normalize the new integration suite** — `c0d9fd0` (style)

## Files Created/Modified

- `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql` — Rebuilds the enum, creates both indexes, and adds the restricting membership foreign key.
- `prisma/schema.prisma` — Declares the relation, deletion policy, indexes, and three reachable statuses.
- `src/generated/prisma/` — Commits the regenerated Prisma 7.9.1 client matching the new schema.
- `tests/integration/planning-participant-integrity.test.ts` — Exercises FK rejection, soft-deactivated membership acceptance, Restrict and Cascade policies, indexes, and enum labels on PostgreSQL 18.4.
- `src/shared/callback-schema.ts` — Limits control actions to back, confirm, and takeover alongside day and time targets.
- `src/telegram/planning-handlers.ts` — Removes the dead unsupported-action branch and its private log vocabulary.
- `tests/unit/planning-logging.test.ts` — Drives a raw unknown target through the parse-boundary stale response and exact reason.

## Decisions Made

- Membership deletion is restricted because Phase 3 consumes the participant snapshot as an authorization contract; soft deactivation remains valid because the referenced row still exists.
- Callback actions accepted by the validator are derived from `stepTargets` and `mintTakeoverAction`, so the boundary cannot drift wider than the producer vocabulary.
- Historical rows carrying an action that was never minted need no compatibility branch; if one exists despite that invariant, it receives the same stale alert through parse failure.

## Verification

- Disposable migration replay: all 9 migrations applied; `prisma migrate diff` reported **No difference detected**.
- Migration preflight queries returned **0** removed-status rows and **0** dangling participant memberships.
- New PostgreSQL integrity suite: **1 file, 6 tests passed**.
- Full integration project: **11 files, 110 tests passed**.
- Full unit project: **24 files, 263 tests passed**.
- Focused planning logging suite: **38 tests passed**.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- Static acceptance gates passed, disposable containers were removed, and `package.json` / `package-lock.json` are unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. Prisma rejected `migrate dev` in its non-interactive execution environment**

- **Found during:** Task 1 migration generation
- **Issue:** Prisma 7.9.1 applied the inherited migrations but then refused migration creation because `migrate dev` requires an interactive terminal.
- **Fix:** Generated the exact SQL with `prisma migrate diff --from-config-datasource --to-schema --script` against the fully migrated disposable database, reviewed it, then replayed the committed history into a second disposable database and proved zero drift.
- **Files modified:** `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`
- **Verification:** All 9 migrations applied and `migrate diff --exit-code` returned `No difference detected.`
- **Committed in:** `2c95a9c`

---

**Total deviations:** 1 auto-fixed tooling constraint
**Impact on plan:** The migration contents and safety proof are unchanged; no development or persistent database volume was touched.

## Issues Encountered

- The first catalog assertion assumed PostgreSQL would quote a simple index column in `pg_indexes.indexdef`. PostgreSQL emitted the unquoted identifier; the assertion was corrected to accept both valid renderings while still proving the leading column.
- The isolated worktree reused the primary checkout dependency tree through an ignored `node_modules` symlink; no package installation or lockfile change occurred.

## User Setup Required

Before the next deployment, apply the migration to the inherited development volume using the plan's two zero-count preflight queries and confirm the participant count is unchanged. This operational check was intentionally not run unattended against persistent data.

## Next Phase Readiness

- Plan 02-11 can rely on the callback expiry index for retention and the membership constraint for confirm-time lineup validation.
- G-02-5's schema and callback-vocabulary findings are closed automatically; the persistent-volume forward-application check remains an explicit pre-deploy procedure.

## Self-Check: PASSED

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-09-02*
