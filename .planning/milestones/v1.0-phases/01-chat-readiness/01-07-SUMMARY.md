---
phase: 01-chat-readiness
plan: 07
subsystem: telegram-setup
tags: [grammy, prisma, postgresql, setup, transactions, authorization]
requires:
  - phase: 01-06
    provides: complete validated actor-bound setup drafts
provides:
  - atomic reviewed-draft promotion into ChatConfiguration
  - revision-safe, single-use save and cancellation callback actions
  - PostgreSQL coverage for restart persistence and failed save invariants
affects: [01-08, settings, roster, planning-access]
actuals:
  tokens: 9741
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - complete setup drafts cross into active configuration only in a short Prisma transaction
    - consumed save actions are deterministic duplicate no-ops
key-files:
  created:
    - tests/fakes/chat-readiness.ts
    - tests/integration/chat-configuration.test.ts
  modified:
    - src/domain/chat/setup-service.ts
    - src/telegram/setup-handlers.ts
    - src/telegram/renderers.ts
    - src/telegram/keyboards.ts
    - src/shared/callback-schema.ts
    - tests/unit/schedule-settings.test.ts
key-decisions:
  - "Save configuration is the only callback that promotes a complete draft into ChatConfiguration."
  - "Save performs action validation, full draft validation, revision comparison, write, action consumption, and draft deletion in one Prisma transaction."
  - "An expired draft is deleted inside a committed expiry transaction while conflicts and failures roll back every active-configuration mutation."
patterns-established:
  - "Use expectedRevision plus updateMany count checks to prevent stale configuration overwrites."
  - "Reauthorize protected save callbacks before entering the persistence transaction."
requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-05, AUTH-01, AUTH-02]
coverage:
  - id: D1
    description: "Complete fixed-order review with Save configuration and Cancel setup controls"
    requirement: CONF-01
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#renders a complete review with save before cancel"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#renders every review value in the fixed order"
        status: pass
    human_judgment: false
  - id: D2
    description: "Atomic complete-draft promotion, duplicate no-op, conflict preservation, and restart durability"
    requirement: CONF-02
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#chat configuration promotion"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fresh current-administrator check prevents demoted actors from saving"
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#reauthorizes a save callback"
        status: pass
    human_judgment: false
duration: 8min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 07: Atomic configuration activation Summary

**A complete administrator-owned setup draft now becomes durable chat configuration only through a revision-safe Prisma transaction, with committed settings preserved on every rejected path.**

## Accomplishments

- Added fixed-order configuration review plus `Save configuration` and `Cancel setup` controls backed by opaque, owner-bound callback actions.
- Promoted all eight settings, action consumption, and draft deletion atomically after fresh authorization and complete validation.
- Proved PostgreSQL migration, conflict, expiry, persistence-failure, duplicate, cancellation, demotion, and fresh-client restart behavior in integration tests.

## Verification

- `npm run format:check` — passed.
- `npm run test:unit -- setup` — passed (5 tests).
- `npm run test:unit -- schedule-settings` — passed (6 tests).
- `npm run test:integration -- chat-configuration` — passed (7 tests, migrated PostgreSQL container).
- `npm run build` — passed.

## Task Commits

1. **Task 1 RED: Review and atomically activate the complete chat configuration** — `1e8cfe1` (test)
2. **Task 1 GREEN: Review and atomically activate the complete chat configuration** — `754d54c` (feat)

## Files Created/Modified

- `src/domain/chat/setup-service.ts` — transactional save/cancel operations, complete-draft validation, and revision-safe persistence.
- `src/telegram/setup-handlers.ts` — fresh authorization then save/cancel result handling with safe copy.
- `src/telegram/renderers.ts` and `src/telegram/keyboards.ts` — complete review and committed-success projections.
- `src/shared/callback-schema.ts` — validated save/cancel callback targets.
- `tests/fakes/chat-readiness.ts` and `tests/integration/chat-configuration.test.ts` — deterministic seams and migrated PostgreSQL coverage.

## Decisions Made

- A completed action returns `Already applied.` without any second mutation; stale actions receive the existing safe stale copy.
- Generic validation, revision, and persistence failures keep the prior active configuration unchanged and return the generic save copy.
- Cancellation is actor-bound and removes only the initiating administrator's draft.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Commit expired-draft cleanup instead of rolling it back**

- **Found during:** Task 1 integration review.
- **Issue:** Throwing the expiry result from inside the transaction rolled back the intended expired-draft deletion.
- **Fix:** Returned the expiry result after deletion so the transaction commits only the draft cleanup, never an active-configuration write.
- **Files modified:** `src/domain/chat/setup-service.ts`, `tests/integration/chat-configuration.test.ts`.
- **Verification:** Migrated PostgreSQL integration suite passed.
- **Committed in:** `754d54c`.

**2. [Rule 3 - Blocking issue] Removed the confirmed empty timezone migration residue**

- **Found during:** Task 1 integration verification.
- **Issue:** Prisma `migrate deploy` rejected an empty untracked `20260820094000_timezone_setup` directory with P3015.
- **Fix:** After Plan 01-05 provenance confirmation, validated the exact directory was real, empty, and not a symlink, then removed only that directory with `rmdir`.
- **Files modified:** None; only the empty directory was removed.
- **Verification:** `npm run test:integration -- chat-configuration` passed against migrated PostgreSQL.
- **Committed in:** Not applicable — the accidental directory was untracked.

---

**Total deviations:** 2 auto-fixed (Rule 1, Rule 3).
**Impact on plan:** Both fixes preserve the planned atomicity and migration verification guarantees without changing schema or scope.

## Issues Encountered

None remaining.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The next phase can consume only committed `ChatConfiguration` values, while draft mutations remain isolated until an explicit reviewed save.

## Self-Check: PASSED

- Confirmed the transactional service, renderer, handler, fake, and integration-test files exist.
- Confirmed commits `1e8cfe1` and `754d54c` exist in Git history.
- No placeholder or TODO stubs were found in the plan's implementation and test files.
