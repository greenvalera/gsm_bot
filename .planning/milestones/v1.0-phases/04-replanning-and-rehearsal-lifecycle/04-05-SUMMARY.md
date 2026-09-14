---
phase: 04-replanning-and-rehearsal-lifecycle
plan: "05"
subsystem: planning
tags: [lifecycle, defaults, civil-dates, target-week]
status: complete
requires:
  - phase: 04-04
    provides: Complete cancellation and same-week change lifecycle
provides:
  - Previous-rehearsal defaults only after the scheduled end
  - Shared civil-day selectability in day cards and week selection
affects: [05-reminders-and-reliability]
tech-stack:
  added: []
  patterns: [scheduled-end history filter, shared pure civil-day predicate]
key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/domain/planning/target-week.ts
    - tests/unit/target-week.test.ts
    - tests/unit/planning-day-card.test.ts
    - tests/integration/planning-round.test.ts
    - tests/integration/planning-booking.test.ts
key-decisions:
  - Previous rehearsal filters on scheduled end but orders by scheduled start.
  - Today remains selectable; date-level selection does not inspect generated hours.
  - The past-day rule lives in target-week and is re-exported from the service for compatibility.
requirements-completed: [LIFE-02, LIFE-05, LIFE-06]
coverage:
  - id: D1
    description: Only completed confirmed or booked rehearsals supply historical defaults.
    requirement: LIFE-05
    verification:
      - kind: integration
        ref: tests/integration/planning-round.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/planning-booking.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Booked weeks remain claimed and cancelled weeks are available under the shared civil-day rule.
    requirement: LIFE-06
    verification:
      - kind: unit
        ref: tests/unit/target-week.test.ts#lifecycle week selectability
        status: pass
    human_judgment: true
    rationale: Today-only weeks with no remaining hours remain an explicit phase UAT limitation.
actuals:
  tokens: 3571
  tasks: 2
  commits: 5
duration: 7min
completed: 2026-09-09
---

# Phase 4 Plan 5: Lifecycle Defaults Summary

Historical rehearsal defaults now require the scheduled end to have passed, and target-week selection uses the same civil-day rule as the day card.

## Tasks and Commits

1. Scheduled-end history: `4dd6faf` RED and `c147eb3` GREEN. The query filters `endsAt < now`, preserves confirmed/booked status eligibility, and retains descending start ordering. Tests cover a rehearsal in progress, exact end, just after end, cancelled/superseded exclusions, and differing durations. Existing direct fixtures now include the scheduled end written by the real confirmation transition.
2. Shared day selectability: `0e1cd25` RED and `0fcf598` GREEN. `isPastDay` moved to `target-week.ts` and is re-exported from the service. `weekHasSelectableDay` joins the unchanged claim predicate inside the bounded two-argument search. Booked/confirmed claims, cancelled release, Monday/Tuesday/Sunday and entirely past-week helper cases are pinned.

The documentation commit records this summary. Actual tokens are the six-file realized diff character count divided by four, rounded up; unrelated review corrections and harness usage are excluded.

## Deviations and Decisions

- **[Rule 1 - Conflicting plan example] Preserve today selectability.** The proposed exhausted-Sunday scenario cannot occur under the locked `isPastDay(day, today) = day < today` rule: Sunday itself remains selectable. The test therefore proves an unclaimed Sunday retains its current week, while the helper rejects an entirely past week. The search starts at the current week's Monday and moves forward, so valid present inputs cannot exhaust the current week at date granularity. No hour-level logic or third argument was introduced.
- **Scheduled-end ordering remains on starts.** A long rehearsal that began earlier can finish after a later short rehearsal; defaults still describe the most recently started completed rehearsal. No fallback or explicit null guard was added, because SQL comparison excludes null ends and confirmation writes the end atomically.
- **Historical standing remains unchanged.** A source comparison verified `wasPreviousParticipant` is byte-identical to Plan 04-04. Existing positive/negative authorization coverage was rerun. Stale test comments describing the old status restriction were corrected.

## Automated Validation

- Full unit suite: **360 passed**, 25 files.
- Full integration suite: **290 passed**, 20 files, 236.85 seconds, using real PostgreSQL Testcontainers.
- Focused history suites: 89 passed; focused week/day/time suites: 88 passed.
- TypeScript and scoped Prettier checks passed. Source checks prove one `isPastDay` implementation, no reverse service import from target-week, and unchanged participant standing.
- Both tasks have failing RED tests before their GREEN commits. No tests were skipped and no dependencies or schema changes were introduced.
- Repository-wide formatting remains unrelated pre-existing debt; all six touched files pass formatting.

## Limitations and Follow-up

A week whose sole remaining day is today can still be offered when all its generated hours have passed. This preserves the existing day-level contract and remains a UAT limitation. Independent phase review findings in lifecycle message handling belong to the parent orchestrator's follow-up fixes, not these completed read changes.

No implementation stubs or new security surface were introduced. State and roadmap updates belong to the parent orchestrator.

## Self-Check: PASSED

All six listed artifacts and all four task commits exist. The required summary is written at this path.
