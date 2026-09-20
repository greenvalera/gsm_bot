---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "04"
subsystem: localization
tags: [telegram, settings, ukrainian, i18n]
requires:
  - phase: 06-03
    provides: Typed catalogs and localized settings projections
  - phase: 06-02
    provides: Independent language selection and incomplete settings navigation
provides:
  - Current-language settings prompts, reviews, dashboards and recovery
  - Language controls retained after schedule save and keep
  - Behavioral proof that language changes preserve valid settings confirmations
affects: [06-05, 06-07]
tech-stack:
  added: []
  patterns: [Response-time locale resolution, isolated preference writes, HTML projection escaping]
key-files:
  created: [tests/unit/settings-localization.test.ts]
  modified: [src/telegram/settings-handlers.ts, tests/unit/update-path-logging.test.ts]
key-decisions:
  - Centralize the language row and button in the dashboard used by both command and save/keep paths.
  - Resolve locale after awaited service and action creation operations at each output boundary.
requirements-completed: [LANG-02, LANG-04, TEXT-01]
coverage:
  - id: bilingual-settings
    description: Every editable settings field has bilingual prompts, reviews, controls and operational feedback.
    verification:
      - kind: unit
        ref: tests/unit/settings-localization.test.ts
        status: pass
    human_judgment: false
  - id: open-edit-preservation
    description: Original confirmations remain valid after language-only changes; conflicts, expiry and actor checks remain enforced.
    verification:
      - kind: unit
        ref: tests/unit/settings-localization.test.ts#settings edits across language changes
        status: pass
      - kind: unit
        ref: tests/unit/language-selection.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 8580
  tasks: 2
  commits: 6
duration: 7min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 4: Current-Language Settings Summary

**Settings now render the current group language through edits, reviews, timezone lookup and recovery while preserving valid confirmations and schedule revisions across language changes.**

## Accomplishments

- Threaded explicit current locale through all settings controller projections and keyboards. Reused existing catalog phrases for invalid time, duration, reminders, schedule, failed reads/writes, stale/duplicate callbacks and expired drafts.
- Centralized the language row and bilingual navigation button in `createDashboard`, retaining them after both save and keep. Incomplete settings still expose only language and Continue setup without fabricating schedule data.
- Resolve the group preference after asynchronous domain operations, timezone resolution and callback creation. English/Ukrainian field prompts and reviews retain stable values and keyboard layouts.
- Added 69 settings localization tests, including real SettingsService and LanguageService over focused durable delegates. Tests snapshot draft identity, expected revision, payload, expiry, ownership, configuration and reminder metadata immediately around language mutation; both switching directions keep the original save confirmation valid. Separate tests preserve rejection of genuine revision conflicts, expired drafts and other actors.
- Reused the HTML escaper for timezone candidate content, preserving plain button text and Unicode. No new production dependencies, schema changes or live Telegram sends.

## Task Commits

1. Task 1 RED: `bd89989` — 42 bilingual controller cases, 25 expected missing-behavior failures.
2. Task 1 GREEN: `8b3ec14` — current-language settings controller and retained language navigation.
3. Task 2 RED: `3356545` — real-service open-edit invariants and failing hostile timezone candidate escaping assertion.
4. Task 2 GREEN: `0e925cf` — safe candidate HTML and completed switching regression matrix.
5. Integration fixture repair: `6519ab0` — default locale lookup in the update logging fixture.

## Verification

- Task 1 command: settings-localization, settings-dashboard-keyboard and schedule-settings — 54 tests passed at the task boundary.
- Task 2 command: settings, settings-localization and language-navigation — 70 tests passed before additional security/regression cases.
- Final targeted command: `npm run test:unit -- tests/unit/settings.test.ts tests/unit/settings-localization.test.ts tests/unit/settings-dashboard-keyboard.test.ts tests/unit/schedule-settings.test.ts tests/unit/language-navigation.test.ts tests/unit/language-selection.test.ts tests/unit/callback-authority.test.ts` — 7 files, 129 tests passed.
- `npm run test:unit -- tests/unit/update-path-logging.test.ts` — 7 tests passed after the fixture repair; positive logging and sensitive-value absence assertions remain intact.
- `npm run typecheck` — passed after final fixture repair.
- Targeted Prettier formatting and `git diff --check` passed. No placeholders, skipped tests or unrun plan verification commands remain.
- Existing language-selection boundary tests prove fresh authorization, denied writes, stale/consumed/unsupported rejection and exactly one callback acknowledgement, including silent same-language navigation. No callback authority rules were changed.

## Deviations from Plan

1. **[Rule 1 - Bug] Escape newly projected timezone candidates.** The new HTML candidate projection initially interpolated resolver strings directly. A hostile Unicode test failed, then passed after reusing the existing projection escaper. Fixed in `0e925cf`.
2. **[Rule 3 - Blocking integration fixture] Supply the absent locale delegate in update-path logging tests.** An expanded affected check exposed three setup-route failures because the fake Prisma client lacked `chatLanguagePreference.findUnique`. The orchestrator authorized the minimal fixture repair; five lines restore implicit English without weakening logging assertions. Fixed in `6519ab0`.

The existing catalogs already contained all required phrases, so no catalog changes were needed. Existing dirty settings/dashboard tests were executed but preserved untouched. The dedicated localization suite contains the new controller and durable-service tests. State, roadmap and requirements updates are owned by the phase orchestrator.

## Security and Scope

Existing callback actor/chat binding, expiry, consumption, administrator authorization and expected-revision checks remain authoritative. Preference updates do not invoke schedule writes. No new network/auth/schema surface or unresolved high/critical threat was introduced. PostgreSQL composition proof remains assigned to plan 06-07; these tests do not claim database integration coverage.

## Self-Check: PASSED

- All three implementation/test paths exist.
- All five task and fixture commits verified in repository history.
- Both tasks completed and the required summary exists on disk.

## Next Phase Readiness

Settings localization is ready for roster integration and final composed phase verification. No additional user setup is required.
