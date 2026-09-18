---
phase: 08-localized-reminders-and-bilingual-verification
plan: "01"
subsystem: localization
tags: [telegram, reminders, i18n, civil-dates]
requires:
  - phase: 07-ukrainian-planning-and-lifecycle
    provides: Typed catalogs and civil-date presentation helpers
provides:
  - Current-language durable planning reminder transport
  - Calendar-complete Ukrainian reminder week ranges
  - Typed bilingual follow-up phrase contracts for plan 08-02
affects: [08-02, 08-03, 08-04, 08-05]
tech-stack:
  added: []
  patterns: [Resolve presentation locale at the production send boundary, Civil-only week arithmetic]
key-files:
  created: [tests/integration/localized-reminders.test.ts]
  modified: [src/app/main.ts, src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, src/shared/i18n/planning-format.ts, src/telegram/reminder-renderers.ts, tests/unit/planning-format.test.ts]
key-decisions:
  - Keep English ISO week ranges and follow-up date/start/duration wording unchanged.
  - Requirement completion remains pending later phase plans and acceptance.
requirements-completed: []
actuals:
  tokens: 3462
  tasks: 2
  commits: 4
duration: 5min continuation; prior tracer duration not recorded
completed: 2026-09-19
status: complete
---

# Phase 8 Plan 1: Current-language Planning Reminders Summary

**Durable planning reminders resolve the current chat locale before rendering, with Ukrainian calendar ranges and unchanged start capabilities.**

## Accomplishments

- The shared production transport captures en-to-uk, uk-to-en and absent-preference delivery using persisted occurrences; callback data, due time, identity, generation and acknowledgement remain intact.
- Ukrainian same-month, cross-month, cross-year and leap-year weeks omit years while English retains its original ISO range.
- Follow-up heading, pending mentions, link and basic-group recovery contracts exist in both typed catalogs. The heading carries the plan clarification's startTime and durationMinutes for unchanged English wording. Plan 08-02 connects these complete phrases to follow-up rendering.
- User explicitly approved the Task 1 tracer before this Task 2 continuation.

## Task Commits

1. Task 1 RED: `7c42e66` — persisted current-language send tests.
2. Task 1 GREEN: `26096ca` — production planning reminder transport and bilingual copy.
3. Task 2 RED: `834f0f4` — four week-boundary cases failed because formatReminderWeekRange did not exist.
4. Task 2 GREEN: `9abc724` — complete helper, renderer integration and follow-up catalogs.

Checkpoint documentation commits: `586f695`, `6efda5a`.

## Verification

At Task 1 revision `26096ca`: 26 integration cases, 5 renderer unit cases, typecheck and scoped formatting passed, as recorded in the checkpoint.

On the exact source subsequently committed as `9abc724`:

- `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/reminder-renderers.test.ts`: 35/35 passed.
- `npm run typecheck`: passed.
- `npm run test:integration -- tests/integration/localized-reminders.test.ts tests/integration/reminder-delivery.test.ts`: 26/26 passed using disposable PostgreSQL containers and migrations; no live fixture database.
- Scoped Prettier formatting applied; `git diff --check` passed. GREEN commit contains no tracked-file deletions.

Both TDD tasks have ordered RED and GREEN commits. Actual tokens are ceil(realized eight-file diff characters / 4), not harness usage. Four implementation/test commits exclude checkpoint and closeout documentation.

## Deviations from Plan

No implementation deviation. The Task 1 fixture needed effectiveFrom one millisecond before due time to respect the existing exclusive eligibility boundary; no domain behavior changed.

GSD discovery also counts 08-PLAN-CHECK.md as a sixth plan. Canonical phase progress retains five executable plans. Requirement completion is deliberately deferred because LREM-01 and LREM-02 span subsequent plans, rather than overstating acceptance here.

## Residual Acceptance and Safety

Native wording acceptance and target-image verification remain the later plan 08-05 scope. No deployment or live Telegram send was performed. Existing HTML escaping, user-ID link construction, navigation validation, limits, authorization and claim semantics remain unchanged. No new trust boundary, dependency, schema or unresolved implementation stub was introduced.

## Self-Check: PASSED

All eight scoped artifacts exist and all four task commits exist. Both tasks' automated commands passed. The approved checkpoint can be cleared; continue with plan 08-02.
