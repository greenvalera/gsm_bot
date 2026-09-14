---
phase: 01-chat-readiness
plan: 06
subsystem: telegram-setup
tags: [grammy, prisma, setup, schedule, validation]
requires:
  - 01-05
provides:
  - strict local-time and schedule-invariant validation
  - actor-bound setup transitions for weekday, schedule, reminders, and planning access
  - review-ready but still inactive draft projection
affects:
  - 01-07
  - 01-08
tech-stack:
  added: []
  patterns:
    - opaque callback actions are validated against the currently expected setup step
    - complete schedule invariants run before draft field persistence
key-files:
  created:
    - src/domain/chat/types.ts
    - src/domain/chat/schedule-validator.ts
    - src/telegram/keyboards.ts
    - src/telegram/renderers.ts
  modified:
    - src/domain/chat/setup-service.ts
    - src/shared/callback-schema.ts
    - src/telegram/setup-handlers.ts
    - tests/unit/schedule-settings.test.ts
key-decisions:
  - "Use strict 24-hour minute-of-day values for every draft schedule and reminder time."
  - "Keep setup progression schema-neutral by deriving it from validated draft fields and storing only a transient reminder-entry sentinel."
actuals:
  tokens: 9955
  tasks: 1
  commits: 2
requirements-completed: [CONF-02, CONF-03, CONF-05, AUTH-01, AUTH-02]
coverage:
  - id: D1
    description: "Strict local-time parsing and schedule boundary invariants"
    requirement: CONF-03
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#parses and formats only strict zero-padded 24-hour local times"
        status: pass
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#rejects exact schedule boundary conflicts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Actor-bound weekday, reminder, and planning-access draft flow"
    requirement: CONF-02
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#preserves valid draft values when a completed schedule conflicts and reaches review with defaults"
        status: pass
      - kind: unit
        ref: "tests/unit/setup.test.ts"
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 06: Validated schedule and policy setup Summary

**The actor-bound setup draft now collects weekday, strict local schedule, reminders, and planning access through a complete review-ready configuration without activating it.**

## Accomplishments

- Added strict `HH:MM` parsing, zero-padded rendering, and complete daily-boundary validation.
- Implemented steps 2–8 with the approved weekday layout, default reminder pair, policy choices, and review projection.
- Kept every text and callback continuation behind the existing live administrator check, opaque token binding, and stale-step guard.

## Verification

- `npm run format:check` — passed.
- `npm run test:unit -- schedule-settings` — passed (5 tests).
- `npm run test:unit -- setup` — passed (5 tests).
- `npm run build` — passed.

## Task Commits

1. **Task 1 RED: Collect schedule, reminder, and planning-access values with complete invariants** — `58f9b7f` (test)
2. **Task 1 GREEN: Collect schedule, reminder, and planning-access values with complete invariants** — `8d8a670` (feat)

## Decisions Made

- Times are stored as minutes since local midnight and rendered only as strict `HH:MM`; the confirmed IANA timezone remains the draft's authority for interpretation.
- The existing draft schema remains unchanged. A transient `-1` reminder value represents only the first-entry prompt; review accepts exactly two valid local times.
- A callback action must match the currently expected draft step before consumption, preventing delayed sibling buttons from changing a later setup state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rejected stale callback actions from prior setup steps**
- **Found during:** Task 1 verification.
- **Issue:** A still-unconsumed sibling button could otherwise mutate a later draft step.
- **Fix:** Checked that each opaque callback action is valid for the draft's current expected step before consuming it.
- **Files modified:** `src/telegram/setup-handlers.ts`
- **Verification:** Focused unit suites and TypeScript compilation passed.
- **Committed in:** `8d8a670`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The guard preserves the plan's actor-bound, idempotent continuation boundary without expanding schema or scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-07 can add the final review controls and atomically promote this already-valid draft into active chat configuration.

## Self-Check: PASSED

- Confirmed all created and modified implementation files exist.
- Confirmed commits `58f9b7f` and `8d8a670` exist in Git history.
- No placeholder or TODO stubs were found in the plan's implementation and test files.
