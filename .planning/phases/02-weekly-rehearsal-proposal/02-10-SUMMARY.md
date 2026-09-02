---
phase: 02-weekly-rehearsal-proposal
plan: 10
subsystem: planning
tags: [prisma, postgres, transactions, callbacks, concurrency, testcontainers]

requires:
  - phase: 02-03
    provides: Durable day-step callback actions and revision-guarded day selection
  - phase: 02-04
    provides: Durable time-step callback actions and revision-guarded time selection
  - phase: 02-05
    provides: Back and Confirm transitions with exactly-once callback consumption
  - phase: 02-06
    provides: Inactivity-gated takeover and independent-client concurrency patterns
provides:
  - One transactional releaseAction helper shared by selectDay, selectTime, back, confirm, and takeover after a lost revision race
  - Deterministic committed-competitor coverage proving lost taps remain retryable
  - Real PostgreSQL concurrency coverage proving one transition and one revision bump regardless of the winner
  - Regression coverage proving successful transitions remain exactly-once
affects: [availability collection, planning recovery, callback reliability, phase 02-11]

actuals:
  tokens: 6840
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Release a consumed callback only when the guarded state write matches zero rows, and release it inside the same transaction"
    - "Drive a deterministic lost race by intercepting the guarded update and committing a revision bump through a separate Prisma client"
    - "Assert concurrent outcomes from persisted invariants and token ownership rather than pinning an unpredictable winner"

key-files:
  created:
    - tests/helpers/racing-client.ts
    - tests/integration/planning-token-release.test.ts
  modified:
    - src/domain/planning/planning-service.ts

key-decisions:
  - "Token release is one private PlanningService helper used only after a guarded round write loses; successful transitions never call it."
  - "Deterministic lost-race branch tests and genuinely concurrent invariant tests are complementary: the former proves retryability at the exact branch, while the latter proves the database admits exactly one winner."
  - "Concurrent assertions derive the winner from the final round and callback ledger, so scheduler ordering cannot make the suite flaky."

patterns-established:
  - "Callback consume and lost-race release form one transaction, leaving a refusal indistinguishable from never consuming the action."
  - "Cross-client race tests read the round and callback rows only after every competing promise settles."

requirements-completed: [PLAN-04, PLAN-06, AUTH-03, RELI-01]

coverage:
  - id: D1
    description: "A day selection that loses its revision race leaves its token unconsumed, and the same token advances the round on retry"
    requirement: PLAN-04
    verification:
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#leaves the day token spendable and applies it on the next tap"
        status: pass
    human_judgment: false
  - id: D2
    description: "Time selection and Back release their tokens after a lost revision race, remain retryable, and preserve successful-transition idempotency"
    requirement: PLAN-06
    verification:
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#leaves the time token spendable and applies it on the next tap"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#leaves the single Back token spendable and applies it on the next tap"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#moves exactly once when the same Back token races"
        status: pass
    human_judgment: false
  - id: D3
    description: "Takeover and Confirm use the same release helper after a lost guard while a successful takeover remains spent and refuses replay"
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#leaves a takeover token spendable after a pinned revision loses"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#leaves a takeover token spendable after a committed competitor wins"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#keeps a successful takeover spent and refuses its replay"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#preserves confirm's lost-race release and same-token retry"
        status: pass
      - kind: other
        ref: "Static release gates: 6 releaseAction references, five guarded call sites, and one consumedAt-clear implementation"
        status: pass
    human_judgment: false
  - id: D4
    description: "Separate PostgreSQL clients racing different days, the same Back, or Back against takeover produce exactly one applied transition, one revision bump, and a matching token ledger"
    requirement: RELI-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#advances exactly once when different day tokens race"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#moves exactly once when the same Back token races"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-token-release.test.ts#applies exactly one control when Back races takeover"
        status: pass
      - kind: integration
        ref: "Docker: planning-token-release.test.ts passed 10/10 on three consecutive runs"
        status: pass
    human_judgment: false

duration: 7h 35m
completed: 2026-09-02
status: complete
---

# Phase 2 Plan 10: Callback Token Lost-Race Release Summary

**Lost callback races now return the token transactionally across all five planning transitions, with deterministic committed-competitor tests and winner-agnostic PostgreSQL concurrency proofs.**

## Performance

- **Duration:** 7h 35m wall time, including brokered Docker verification and atomic commit handoffs
- **Started:** 2026-09-02T07:26:34Z
- **Completed:** 2026-09-02T15:01:46Z
- **Tasks:** 3 (five commits: two RED/GREEN pairs and one concurrency-test commit)
- **Files modified:** 3 (2 created)

## Accomplishments

- A single private `releaseAction` helper now clears `consumedAt` inside the caller's transaction when `selectDay`, `selectTime`, `back`, `confirm`, or `takeover` loses its guarded round update.
- A one-shot Prisma transaction wrapper deterministically lands a committed competing revision between the round read and guarded update, proving day, time, Back, and takeover tokens remain spendable and work on retry.
- Successful step and takeover transitions remain exactly-once: their tokens stay consumed, replays are refused, and the round receives no second revision bump.
- Three separate-client PostgreSQL races prove different DAY tokens, the same Back token, and Back versus takeover always yield one durable winner and a callback ledger matching the persisted outcome without assuming which request wins.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Expose lost-race token spending for day, time, and Back** — `abe3e22` (test)
2. **Task 1 GREEN: Release step tokens after lost races** — `637d7ee` (fix)
3. **Task 2 RED: Expose takeover token loss and preserve idempotency/Confirm coverage** — `bcc04c7` (test)
4. **Task 2 GREEN: Centralize takeover and Confirm release** — `9e32a34` (fix)
5. **Task 3: Prove concurrent token invariants** — `d56943d` (test)

## Files Created/Modified

- `tests/helpers/racing-client.ts` — Proxies interactive Prisma transactions and triggers one committed competitor immediately before the first guarded `updateMany`.
- `tests/integration/planning-token-release.test.ts` — Covers deterministic lost races, retries, successful-transition idempotency, Confirm regression, and three real concurrent pairs.
- `src/domain/planning/planning-service.ts` — Adds the shared transactional release helper and calls it from all five lost-guard branches.

## Decisions Made

- Release is legal only after the guarded round mutation reports no match. Earlier read-only refusals remain before consumption, and a successful write never resurrects its spent token.
- Deterministic branch coverage and real concurrent invariant coverage are both retained because each proves a different part of the contract.
- Race tests use separate Prisma clients and infer the winner from durable state, avoiding process serialization and flaky scheduler-order assertions.

## Verification

- Task 2 focused Docker-backed suites: **36/36 tests passed**.
- `tests/integration/planning-token-release.test.ts`: **10/10 tests passed on three consecutive Docker runs**.
- Full integration project: **10 files, 104 tests passed**, with no skipped or todo tests.
- Full unit project: **24 files, 257 tests passed**.
- `npm run typecheck`: passed.
- `npm run format:check`: passed.
- Static gates passed: `releaseAction` count 6; step-transition release sites 3; Confirm/takeover release sites 2; `consumedAt` clear implementations 1; race-helper literal `planningRound.updateMany` count 0 and `updateMany` interception count 1; `Promise.all` count 4; `connect()` count 10.
- `package.json` and `package-lock.json` are unchanged across the plan commits.

## Deviations from Plan

None - the plan was implemented as written. Docker execution and git commits were brokered by the orchestrator because the executor worktree had scoped access; this changed execution mechanics only, not product scope or behavior.

## Issues Encountered

- The isolated worktree used an ignored `node_modules/.bin/prisma` symlink to the primary checkout's shared dependency tree so the Prisma CLI could resolve without installing or modifying packages. The symlink is untracked and ignored, package files remain unchanged, and no product deviation resulted.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-02-5's callback-token lost-race defect is closed with deterministic retry proofs and repeated real-concurrency verification.
- The shared planning service is ready for Plan 02-11's confirm-time lineup snapshot and callback-action retention work.
- No blockers or unresolved verification issues remain.

## Self-Check: PASSED

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-09-02*
