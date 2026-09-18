---
phase: 08-localized-reminders-and-bilingual-verification
plan: "02"
subsystem: localization
tags: [reminders, telegram, i18n, unicode]
requires:
  - phase: 08-01
    provides: Typed reminder catalogs and production localization conventions
provides:
  - Current-language follow-up payloads with authoritative saved rehearsal ranges
  - Bilingual safe pending mentions and group-specific navigation
affects: [08-03, 08-04, 08-05]
tech-stack:
  added: []
  patterns: [Resolve locale after external metadata and outside claim transaction]
key-files:
  created: []
  modified: [src/telegram/reminder-renderers.ts, src/domain/reminders/reminder-service.ts, tests/integration/localized-reminders.test.ts, tests/unit/reminder-renderers.test.ts]
key-decisions:
  - Preserve English wording and basic-group single-line navigation; Ukrainian recovery uses its separate selected line.
  - Legacy English renderer callers may omit endMinute; Ukrainian requires the authoritative endMinute and otherwise returns unsendable.
requirements-completed: []
actuals:
  tokens: 4423
  tasks: 2
  commits: 4
duration: 6min
completed: 2026-09-19
status: complete
coverage:
  - id: followup-delivery
    description: Current persisted locale and saved timezone determine follow-up payloads, including midnight and DST ranges.
    verification:
      - kind: integration
        ref: tests/integration/localized-reminders.test.ts
        status: pass
    human_judgment: false
  - id: navigation-safety
    description: Pending-only mentions retain ordering, escaping, Unicode safety, capacity refusal and group-specific navigation.
    verification:
      - kind: unit
        ref: tests/unit/reminder-renderers.test.ts
        status: pass
    human_judgment: false
  - id: native-wording
    description: Ukrainian reminder wording in native Telegram.
    verification: []
    human_judgment: true
    rationale: Native wording acceptance remains plan 08-05 and subsequent UAT scope.
---

# Phase 8 Plan 2: Localized Follow-up Delivery Summary

**Pending reminders use the current chat language, the saved round timezone and authoritative end instant, while preserving durable claims and all real mention destinations.**

## Accomplishments

- Locale resolves after awaited chat metadata and immediately before the existing projection/claim transaction, avoiding nested LanguageService lock acquisition.
- Ukrainian heading and pending text follow the selected wording. Midnight and DST ranges use saved endsAt or the established wall-clock-plus-duration fallback in the round timezone. English wording is unchanged.
- Public/private supergroup links and basic-group reply parameters retain their destinations. Ukrainian basic recovery occupies its own line. Fallback labels are localized without altering stable roster sorting.
- Encoded HTML budgets count all localized navigation and copy before Unicode code-point label shortening; every pending mention survives or the renderer returns unsendable.

## Task Commits

1. Task 1 RED: `2dcb267` — four expected failures in Ukrainian current-locale and saved-range cases.
2. Task 1 GREEN: `ca5f5d4` — current-language follow-up body and authoritative end-minute projection.
3. Task 2 RED: `65af8a4` — expected Ukrainian navigation failure with bilingual safety regressions.
4. Task 2 GREEN: `3f89e80` — localized navigation and fallback labels.

## Verification

Exact source committed as `3f89e80` passed:

- `npm run test:unit -- tests/unit/reminder-renderers.test.ts`: 8/8, covering both locales, 60 and impossible-capacity mention sets, hostile labels, astral Unicode, equal names, zero/one pending and invalid navigation.
- `npm run test:integration -- tests/integration/localized-reminders.test.ts tests/integration/reminder-delivery.test.ts`: 31/31 using fresh disposable migrated PostgreSQL containers. Tests capture outbound sends after both committed switch directions and retain durable duplicate/unknown-delivery behavior.
- `npm run typecheck`: passed.
- Scoped Prettier check and `git diff --check`: passed. No tracked-file deletions in task commits.

Both task TDD sequences have RED then GREEN commits. Actual tokens are ceil(realized four-file diff characters / 4), excluding documentation.

## Deviations from Plan

No production-scope deviation. The renderer keeps endMinute optional for existing English callers, where no displayed end is used; Ukrainian missing-end input safely returns unsendable. Test authoring corrected an English fallback expectation to the existing catalog label before the RED commit.

## Residual Acceptance and Safety

Requirements remain pending phase-wide verification. Native acceptance and target-image verification remain later plan scope. No live Telegram activity, deployment, dependency installation or schema change occurred. No unresolved stubs, skipped tests, unrun task verification or new security boundary was introduced. All unrelated workspace changes were preserved.

## Self-Check: PASSED

All four scoped artifacts and all four task commits exist; mandatory automated commands passed. Ready for plan 08-03.
