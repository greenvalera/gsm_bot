---
phase: 02-weekly-rehearsal-proposal
plan: 11
subsystem: planning
tags: [prisma, postgres, row-locks, retention, callbacks, concurrency]

requires:
  - phase: 02-09
    provides: Participant membership foreign key and callback expiry index
  - phase: 02-10
    provides: Racing-client interception seam and lost-race callback release
provides:
  - Confirm-time RowShareLock that holds existing chat memberships until snapshot commit
  - Seven-day post-expiry callback-action retention sweep on planning reads
  - Failure-tolerant housekeeping that cannot refuse plan or status commands
  - PostgreSQL proofs for lock presence, retention boundary, chat scope, and action-kind independence
affects: [availability authorization, planning reliability, database operations, callback lifecycle]

actuals:
  tokens: 3539
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Acquire a transaction-scoped row-share lock before reading a durable authorization snapshot"
    - "Run idempotent retention beside existing read-time housekeeping and isolate its failures from the primary command"
    - "Measure retention from capability expiry and sweep every dead action kind within one chat"

key-files:
  created:
    - tests/integration/planning-action-retention.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - tests/integration/planning-confirm.test.ts
    - tests/unit/planning-logging.test.ts

key-decisions:
  - "Confirm locks every existing membership row for the chat, while listActiveMemberships remains the sole active-lineup predicate."
  - "A concurrent brand-new membership insert is deliberately allowed and joins after the proposal; removals and reactivations of existing rows wait for confirm to commit."
  - "Callback retention is seven days after expiry, chat-scoped, action-kind agnostic, and best-effort."
  - "The old no-delete proxy is retired in favor of exact recursive guards forbidding planningRound and planningParticipant deletion."

patterns-established:
  - "Observe PostgreSQL lock guarantees from a separate connection while the transaction is paused before its guarded write."
  - "Assert retention survivors by token identity on both sides of the cutoff."

requirements-completed: [PLAN-08, PLAN-10, RELI-01]

coverage:
  - id: D1
    description: "Confirm holds a RowShareLock on the chat membership relation from before lineup read until transaction commit"
    requirement: PLAN-08
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#holds a RowShareLock on the chat memberships until confirm commits"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#confirming the proposal"
        status: pass
    human_judgment: false
  - id: D2
    description: "Planning reads remove only callback actions whose expiry is more than seven days old for the current chat, across all action kinds"
    requirement: PLAN-10
    verification:
      - kind: integration
        ref: "tests/integration/planning-action-retention.test.ts#reaps only long-expired actions for the chat when planning starts"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-action-retention.test.ts#uses the same retention boundary when planning status is read"
        status: pass
    human_judgment: false
  - id: D3
    description: "Retention failure cannot prevent round creation, and planning history remains undeleted"
    requirement: RELI-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-action-retention.test.ts#still creates the round when the retention sweep fails"
        status: pass
      - kind: other
        ref: "Recursive static guards find one callbackAction.deleteMany and zero planningRound/planningParticipant deletes"
        status: pass
    human_judgment: false

duration: 7m
completed: 2026-09-02
status: complete
---

# Phase 2 Plan 11: Confirm Lock and Callback Retention Summary

**Confirm now freezes existing roster rows until the participant snapshot commits, while planning reads safely reap only long-dead callback capabilities.**

## Performance

- **Duration:** 7 minutes
- **Started:** 2026-09-02T20:04:40Z
- **Completed:** 2026-09-02T20:11:36Z
- **Tasks:** 2
- **Files modified:** 4 (1 created)

## Accomplishments

- Added a chat-scoped `FOR SHARE` read before the confirm lineup query and proved PostgreSQL holds `RowShareLock` while the transaction remains open.
- Preserved empty-roster retryability, concurrent-confirm idempotency, lineup identity, and all existing confirm behavior across the expanded suite.
- Added seven-day post-expiry callback retention beside both planning read paths, removing long-dead capabilities across action kinds without touching other chats or recent/live rows.
- Made retention best-effort so a failed delete cannot prevent round creation or status reporting, and replaced the retired broad no-delete proxy with exact recursive history guards.

## Task Commits

1. **Task 1 RED: Expose the unlocked confirm lineup read** — `f766ef1` (test)
2. **Task 1 GREEN: Hold existing memberships through confirm commit** — `eb4fb44` (feat)
3. **Task 2 RED: Expose unbounded callback action retention** — `1e5c34f` (test)
4. **Test formatting: Normalize both gap suites** — `7d3401d` (style)
5. **Task 2 GREEN: Reap expired callback actions on reads** — `522bc82` (feat)

## Files Created/Modified

- `src/domain/planning/planning-service.ts` — Adds the lineup lock, retention constant, chat-scoped sweep, and two failure-isolated call sites.
- `tests/integration/planning-confirm.test.ts` — Observes the granted row-share lock through a separate database connection before confirm commits.
- `tests/integration/planning-action-retention.test.ts` — Proves retention boundaries, survivor identities, chat scoping, cross-kind behavior, and failure tolerance.
- `tests/unit/planning-logging.test.ts` — Models the raw-query and retention-delete seams used by real planning paths.

## Decisions Made

- Lock all existing membership rows for the chat rather than duplicating the active-membership predicate in raw SQL. The roster service remains the single inclusion authority, while the superset lock also prevents mid-confirm reactivation.
- Accept concurrent inserts as members joining after the proposal. Row locks cannot predicate-lock nonexistent memberships under READ COMMITTED, and that ordering does not contradict the committed snapshot.
- Retain expired callback rows for seven days, comfortably beyond their thirty-minute live lifetime, for diagnostics while bounding lifetime database growth.
- Sweep all action kinds because expiration is the capability-deadness rule; filtering to planning actions would preserve unbounded growth in other bot surfaces.

## Verification

- Task 1 PostgreSQL confirm suite: **1 file, 16 tests passed**.
- Task 2 retention/recovery suites: **3 files, 32 tests passed**.
- Full integration project: **12 files, 114 tests passed**.
- Full unit project: **24 files, 263 tests passed**.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- Static gates passed: one `FOR SHARE`; one `READ COMMITTED` explanation; three `reapExpiredActions` references; one planning-domain `callbackAction.deleteMany`; zero round/participant deletes; zero scheduler mechanisms.
- `package.json` and `package-lock.json` are unchanged.

## Deviations from Plan

None - the implementation and verification follow the plan. Work was completed directly in the GSD-created isolated worktree after the process executor exhausted its usage quota while loading context; this changed orchestration only, not scope or behavior.

## Issues Encountered

- The isolated worktree reused the primary checkout dependency tree through an ignored `node_modules` symlink. No package installation or lockfile change occurred.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Every elected G-02-5 implementation gap is now closed: callback races release their tokens, participant identity is enforced, lineup snapshot reads are locked, dead vocabulary is removed, and expired capabilities are bounded.
- Phase 3 can consume planning participants as a durable authorization contract.

## Self-Check: PASSED

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-09-02*
