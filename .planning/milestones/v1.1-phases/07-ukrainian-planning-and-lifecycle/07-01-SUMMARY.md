---
phase: 07-ukrainian-planning-and-lifecycle
plan: "01"
subsystem: telegram
tags: [localization, ukrainian, callbacks, recovery, postgres]
requires:
  - phase: 06-localization-foundation-and-ukrainian-onboarding
    provides: Durable chat language preferences and typed catalogs
provides:
  - Durable-locale duplicate selection acknowledgement
  - Separate localized safe retry and committed card recovery feedback
  - Composed PostgreSQL regressions for duplicate and failure classification
affects: [07-03, 07-05, 07-06]
tech-stack:
  added: []
  patterns: [Resolve durable locale at branch-owned feedback boundaries]
key-files:
  created: [tests/integration/localized-planning.e2e.test.ts]
  modified: [src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, src/telegram/planning-handlers.ts]
key-decisions:
  - Preserve silent uncertain announcement delivery and its durable claim.
  - Use committed recovery copy only after the anchor edit fails; selection transaction failure retains safe retry copy.
requirements-completed: [LANG-06, TEXT-04]
actuals:
  tokens: 3230
  tasks: 2
  commits: 5
coverage:
  - id: duplicate-feedback
    description: Consumed selection replay acknowledges once in the current durable language without another mutation.
    verification:
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#duplicate feedback tracer
        status: pass
    human_judgment: false
  - id: retry-classification
    description: Rejected transaction, committed edit failure and uncertain announcement delivery retain distinct truthful outcomes.
    verification:
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#retry classification
        status: pass
    human_judgment: false
duration: 6 min
completed: 2026-09-18
status: complete
---

# Phase 7 Plan 1: Durable-locale Callback Feedback Summary

**Consumed planning selections now acknowledge in the durable group language, with separate safe-retry and committed-card-recovery messages.**

## Performance

- Started: 2026-09-17T21:48:30Z
- Completed: 2026-09-17T21:54:30Z (2026-09-18 locally)
- Tasks: 2
- Files changed: 5 production/test files, plus planning metadata
- Actual tokens use realized code/test diff characters divided by four, rounded up; not harness usage.

## Accomplishments

- Added typed `planning.applied`, `planning.retrySafe`, and `planning.savedRecovery` English/Ukrainian entries.
- Replayed real consumed day tokens through `createBot.handleUpdate`, after changing durable language, with opposing Telegram client languages and independent groups. Exactly one alert is sent; round, participant and callback-action snapshots remain identical.
- Injected a definitely unexecuted transaction rejection and verified unchanged state and D-15 retry text. Retried the same token with a failed Telegram edit and verified committed revision, consumed token and distinct recovery guidance.
- Verified uncertain announcement transport failure retains the participant answer and durable announcement claim, sends no compensating notification and gets a bare acknowledgement.

## Task Commits

1. Task 1 RED: `fd68ca5` — prove durable-locale duplicate callback feedback.
2. Task 1 GREEN: `6ac0a9f` — localize consumed planning selection acknowledgement.
3. Task 2 RED: `02445d6` — distinguish safe retries from committed delivery failures.
4. Task 2 GREEN: `ce68053` — distinguish localized retry and committed recovery feedback.

## Verification

- `docker info --format '{{.ServerVersion}}'`: passed, Docker server 29.1.3, checked before both task integration runs.
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "duplicate feedback tracer"`: RED failed on expected Ukrainian versus actual English; GREEN passed 1/1 (5.96s), post-commit tracer gate rerun passed 1/1 (6.01s).
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "retry classification"`: RED exposed untranslated retry and missing committed recovery; GREEN passed 3/3 selected cases (6.07s). The tracer was excluded by the name filter, not skipped in source.
- `npm run build`: passed.
- `npm run test:unit -- tests/unit/i18n.test.ts tests/unit/callback-authority.test.ts tests/unit/planning-ownership.test.ts`: 40/40 passed (489ms).
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-recovery.test.ts`: 85/85 passed across 3 suites (23.08s), including all 4 new cases.
- Prettier applied only to the five owned files. No dependencies or schema changes.

## Decisions Made

D-15 and D-16 are asserted literally. Existing English duplicate and safe retry wording is retained. Failed edits after committed changes now have explicit English/Ukrainian recovery guidance. Uncertain announcement-send behavior and logs are unchanged. Remaining planning/lifecycle copy is intentionally assigned to later plans.

## Deviations from Plan

None in implementation. The orchestrator confirmed that the user's full-phase execution authorization permits continuation after the automated tracer passed, despite inactive auto flags. Existing unrelated working-tree changes were preserved; the pre-existing dirty STATE.md is updated on disk but excluded from this plan's metadata staging to avoid including unrelated hunks.

## Issues Encountered

The initial uncertain-send test used the shortened label `Confirm`; corrected it to the actual `Confirm rehearsal` control before the RED commit. No remaining failures, stubs, skipped tests, package installs, auth gates or new security surfaces.

## Next Plan Readiness

Ready for 07-02. Shared LANG-06/TEXT-04 requirements remain pending until all declaring sibling plans complete. Full phase inventory and native-language judgment remain with later plan/phase verification.

## Self-Check: PASSED

All five implementation/test files and this summary exist. All four task commits were verified in the current branch. No task commit deleted tracked files.
