---
phase: 07-ukrainian-planning-and-lifecycle
plan: "02"
subsystem: telegram
tags: [localization, ukrainian, civil-dates, durations, dst, postgres]
requires:
  - phase: 07-01
    provides: Durable-locale planning feedback and composed PostgreSQL fixture
provides:
  - Shared civil-date headings and compact calendar labels in English and Ukrainian
  - Exact natural hour/minute duration formatting through both catalogs
  - Authoritative rehearsal time ranges across DST and later chat timezone changes
affects: [07-03, 07-04, 07-06, 08]
tech-stack:
  added: []
  patterns: [Pure civil-date lexicons, Explicit locale at render boundaries, Presentation-only resolved wall-minute ranges]
key-files:
  created: [src/shared/i18n/planning-format.ts, tests/unit/planning-format.test.ts]
  modified: [src/telegram/planning-renderers.ts, src/telegram/planning-handlers.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, tests/unit/i18n.test.ts, tests/unit/planning-availability-card.test.ts, tests/unit/planning-time-card.test.ts, tests/integration/localized-planning.e2e.test.ts, tests/integration/chat-readiness.e2e.test.ts]
key-decisions:
  - Use civil dates for labels and round timezone plus resolved instants for range ends; later chat settings never relabel a committed rehearsal.
  - Keep strict 00:00 through 23:59 wall-minute formatting and existing input validation; midnight ends render 00:00.
requirements-completed: [LFMT-01, LFMT-02, LANG-06]
actuals:
  tokens: 12537
  tasks: 3
  commits: 7
coverage:
  - id: civil-date-labels
    description: Full Ukrainian weekdays and genitive months without years, with compact date-aligned marked buttons.
    verification:
      - kind: unit
        ref: tests/unit/planning-format.test.ts#planning civil-date presentation
        status: pass
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#real day card
        status: pass
    human_judgment: false
  - id: natural-duration
    description: Both catalogs display exact hours/minutes with grammatical count forms.
    verification:
      - kind: unit
        ref: tests/unit/planning-format.test.ts#natural planning duration
        status: pass
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts
        status: pass
    human_judgment: false
  - id: authoritative-range
    description: Review and committed cards show time ranges without repeated duration and retain authoritative timezone meaning.
    verification:
      - kind: unit
        ref: tests/unit/planning-availability-card.test.ts#uses an authoritative range
        status: pass
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#authoritative range
        status: pass
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#resolves review and committed ranges across a DST clock change
        status: pass
    human_judgment: false
duration: 11 min
completed: 2026-09-18
status: complete
---

# Phase 7 Plan 2: Calendar, Time-range and Duration Presentation Summary

**Planning cards now use Ukrainian civil-date labels, grammatical bilingual durations, and authoritative 24-hour ranges that survive DST and later timezone changes.**

## Performance

- Started: approximately 2026-09-17T21:55:30Z
- Completed: 2026-09-17T22:06:30Z (2026-09-18 locally)
- Tasks: 3
- Files changed: 11 production/test files, plus this summary and state tracking
- Actual tokens: realized production/test diff characters (50,147) divided by four, rounded up; not harness usage.

## Accomplishments

- Added pure `formatPlanningDate` and `formatPlanningDayButton` with full Ukrainian weekday/genitive-month lexicons, no displayed years, and existing compact English headings. Marked buttons use their token's actual civil date. Covered all weekdays/months, leap day, year boundaries, and two host TZ settings.
- Threaded locale through planning renderer entry points and direct interactive delivery boundaries while retaining status-before-step routing, shared availability projections, card kind, authorization, callbacks and escaping.
- Added independent unit inflection and exact quotient/remainder duration decomposition. Both `duration.value` catalogs delegate to the helper without a runtime catalog import cycle. Covered counts 0, 1, 2, 5, 11, 14, 21, 22, 25, 101, 111 for hours and minutes in both locales, and totals 0/59/60/61/90/119/120/121.
- Review, availability, booking and related announcement cards use a pure resolved wall-minute range. Production handlers resolve committed `endsAt` in the round timezone; review derives the end instant through the existing wall-clock resolver and elapsed duration. Existing English wording otherwise remains intact.
- Composed PostgreSQL tests assert outbound payloads and durable selections/timestamps/participants, including Kyiv's 2026 autumn clock change and later change of the chat timezone to Los Angeles.

## Task Commits

1. Task 1 RED: `0aeb399` — Ukrainian civil-date and durable day-card locale regressions.
2. Task 1 GREEN: `bc20b3a` — shared civil-date formatting and explicit render locale.
3. Task 2 RED: `9d4dbdc` — natural hours/minutes catalog expectations.
4. Task 2 GREEN: `000d74b` — grammatical unit forms and duration decomposition.
5. Task 3 RED: `de77e35` — ranges, DST, and changed-chat-timezone regressions.
6. Task 3 GREEN: `7118650` — authoritative time ranges and updated affected English expectations.

## Verification

- Task 1 RED: `npm run test:unit -- tests/unit/planning-format.test.ts` failed 2 expected English-versus-Ukrainian assertions; composed `-t "real day card"` failed on its English heading.
- Task 1 GREEN: formatter/day/time unit suites passed 67/67 (673ms); composed localized planning passed 5/5 (7.31s).
- Task 2 RED: named formatter/i18n suites failed 7 natural-duration assertions. GREEN: `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/i18n.test.ts` passed 35/35 (376ms).
- Task 3 RED: availability fixtures failed both locale range assertions; composed range cases failed 3/3 on old start-plus-duration output. GREEN: named formatter/availability suites passed 64/64 (595ms); complete localized planning passed 8/8 (7.42s).
- Final unit command: `npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts` — 210/210 passed, 9 suites (770ms).
- Final PostgreSQL command: `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts` — 155/155 passed, 9 suites (76.35s).
- Additional affected duration integration: `npm run test:integration -- tests/integration/chat-readiness.e2e.test.ts` — 9/9 passed (7.54s).
- `npm run build`, `npm run build:runtime`, and `npm run format:check` passed. Prettier was applied only to owned files.
- Later plans' not-yet-created localization suites were not claimed as executed. Filtered RED runs excluded other cases only through `-t`; no source test was skipped.

## Decisions Made

D-09 through D-12 implemented. Ukrainian dates have full weekday/genitive month and no year; compact buttons retain glyphs/geometry. Separate duration surfaces use natural units. Summary lines contain only the 24-hour range. Existing strict minute bounds remain unchanged: midnight is 00:00, not an added 24:00 input convention. Full Ukrainian copy, native-language judgment and phase-wide shared requirements remain with sibling plans and final verification.

## Deviations from Plan

**[Rule 1 - Bug] Updated two additional directly affected regression files.** The review-card test in `tests/unit/planning-time-card.test.ts` still required the now-removed `120` duration; the setup/settings journey in `tests/integration/chat-readiness.e2e.test.ts` required old minute-only English text. Updated only those assertions, preserving behavior/state checks. Verified 210 unit and 9 readiness integration tests. Included in `7118650`.

The pre-existing dirty STATE.md is updated on disk but excluded from metadata staging to preserve unrelated/orchestrator hunks, matching plan 07-01. Shared LFMT-01/LFMT-02/LANG-06 requirement checkboxes remain pending until their declaring sibling plans complete.

## Issues Encountered

The installed TypeScript 7 package exposes no compiler AST API; a one-off edit helper was replaced with a local balanced-call transformation and the result passed TypeScript and regression checks. No packages were installed. No remaining failures, stubs, auth gates, skipped tests, or new security surfaces.

## Next Plan Readiness

Ready for 07-03. Renderer locale parameters precede the optional presentation-only range object; all production range consumers pass an explicitly resolved range. English default parameters retain compatibility with existing pure fixtures. Domain projections, schema, scheduling, callbacks and announcement claims remain unchanged.

## Self-Check: PASSED

All eleven changed source/test files and this summary exist. All six task commits are in current branch history; each task has RED before GREEN. No task commit deleted tracked files.
