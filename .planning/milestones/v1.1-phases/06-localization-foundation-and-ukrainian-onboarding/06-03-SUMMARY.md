---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "03"
subsystem: localization
tags: [telegram, i18n, onboarding, ukrainian]
requires:
  - phase: 06-02
    provides: Durable language selection and actor-owned setup continuation
provides:
  - Typed complete English and Ukrainian onboarding catalogs
  - Pure localized setup and settings projections with compatible signatures
  - Current-language setup transitions, validation and recovery responses
affects: [06-04, 06-05, 06-07]
tech-stack:
  added: []
  patterns: [Typed phrase payloads, response-time locale resolution, projection-owned HTML escaping]
key-files:
  created:
    - src/shared/i18n/en.ts
    - src/shared/i18n/uk.ts
    - tests/unit/i18n.test.ts
  modified:
    - src/shared/i18n/index.ts
    - src/telegram/renderers.ts
    - src/telegram/keyboards.ts
    - src/telegram/setup-handlers.ts
    - tests/unit/language-navigation.test.ts
    - tests/unit/timezone-prompt-copy.test.ts
key-decisions:
  - Catalog string payloads are escaped once by HTML projections; plain button labels retain raw identifiers.
  - Compatible trailing locale arguments default to English for callers awaiting their owning migration.
  - Setup feedback resolves locale after awaited domain transitions; language remains independent of draft cancellation and expiry.
requirements-completed: [LANG-01, LANG-03, LANG-04, TEXT-01, L10N-01]
coverage:
  - id: typed-bilingual-onboarding
    description: All eight setup steps, review and committed projections support explicit locale without Telegram context.
    verification:
      - kind: unit
        ref: tests/unit/i18n.test.ts
        status: pass
    human_judgment: false
  - id: current-language-setup
    description: Older prompts accept normal input and subsequent transitions, timezone results and recovery render the current language.
    verification:
      - kind: unit
        ref: tests/unit/language-navigation.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/timezone-prompt-copy.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 19685
  tasks: 2
  commits: 5
duration: 11min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 3: Bilingual Onboarding Summary

**The complete setup wizard now renders English or Ukrainian from typed catalogs, retaining valid drafts and showing the current group language after each transition.**

## Accomplishments

- Extracted English and Ukrainian catalogs with a common mapped parameter contract and no missing-key fallback. Added full setup phrases, shared settings/roster labels and recovery phrases, weekday/policy labels, duration inflection and stable civil-time display.
- Added compatible explicit-locale setup/settings renderer contracts. All eight steps, reminder edit substeps, review and saved configuration render Ukrainian; review and saved configuration include the language row. Empty incomplete drafts show only their current prompt.
- Added localized setup button factories while retaining English compatibility exports. Settings dashboard/review/access keyboard functions accept a trailing locale, preserving existing token arguments and full-width policy rows.
- Replaced the temporary timezone-only Ukrainian handler branch with the full renderer. Setup success, cancellation, duplicate/stale/expired actions, invalid time/duration/schedule input, resolver failure and candidate selection use typed phrases. Ukrainian copy uses informal singular instructions and the approved access-policy labels.
- Old-language text inputs remain valid. Tests change preference during the durable write and during timezone resolution, then prove the result renders Ukrainian without changing entered values or domain validity rules.
- Reused the existing HTML escaper at the projection boundary for dynamic timezone/setting values. Pure catalog tests preserve Ukrainian/emoji Unicode, verify nonempty matching catalog keys and prove a background-style payload renders without a Telegram context. Compile-only negative tests reject unknown keys and missing/wrong payloads.

## Task Commits

1. Task 1 RED: `bdd0b9c` — bilingual onboarding projection tests.
2. Task 1 GREEN: `601cf7c` — typed catalogs and pure setup/settings projections.
3. Task 2 RED: `4a5dc9a` — current-language transitions and controls.
4. Task 2 GREEN: `566b425` — setup controls and response-time feedback.

The summary is committed separately. Execution used the shared checkout without branches or worktrees. Existing dirty files were preserved; the owned renderer/test files initially had no substantive diff beyond line endings.

## Verification Evidence

Runtime: Node 24.19.0. Implementation revision: `566b425`. All Telegram calls were local fakes; no live messages were sent.

- Task 1 RED: **11/11 failed** for missing Ukrainian projections, review language, escaping and typed background phrase.
- Task 1 GREEN: `npm run test:unit -- tests/unit/i18n.test.ts`: **12/12 passed**; intermediate `npm run typecheck` passed with legacy callers unchanged.
- Task 2 RED: **6 failed, 3 passed** for old-prompt transitions, localized feedback/expiry/candidates and localized controls.
- Final affected regression command: `npm run test:unit -- tests/unit/setup.test.ts tests/unit/timezone-prompt-copy.test.ts tests/unit/language-navigation.test.ts tests/unit/i18n.test.ts tests/unit/settings.test.ts tests/unit/schedule-settings.test.ts tests/unit/settings-dashboard-keyboard.test.ts tests/unit/callback-authority.test.ts`: **70/70 passed**, eight files. Includes existing authority/acknowledgement regression tests and English settings compatibility.
- After explicitly representing absent preferences as `null` in the navigation fake, its focused rerun passed **16/16**.
- Final `npm run typecheck`: passed, including catalog negative type assertions.
- Targeted Prettier check: passed for all nine changed source/test files.
- No skipped tests, unrun required verification commands, new dependencies or schema changes. Database behavior remains covered by predecessor plans; this plan's required verification is unit tests and typecheck.

## Deviations from Plan

- The existing `tests/unit/setup.test.ts` needed no changes: its domain tests passed unchanged. New setup transition/outcome coverage belongs in `language-navigation.test.ts`, whose handler harness already models preferences.
- Corrected a new keyboard assertion to ignore grammY's pre-existing trailing empty row; production row/callback behavior remains unchanged.

## Remaining Phase Scope

Plan 04 must pass explicit locale from settings handlers; plan 05 owns roster renderer/handler migration, and plan 07 owns remaining common boundary feedback. Catalogs already provide their shared phrase contract. English defaults intentionally support these staged callers. Full planning/lifecycle/reminder delivery remains out of scope. No stubs block this plan's goal and no new unmodeled trust surface was introduced. Native-client wording and visual acceptance remain end-of-phase verification.

## TDD Gate Compliance

Both tasks have a failing behavioral test commit followed by a green implementation commit. Actual token cost is the ceiling of realized implementation/test diff characters divided by four, excluding this summary and unrelated workspace changes.

## Self-Check: PASSED

All nine changed implementation/test artifacts and four task commits exist. No task commit deleted tracked files. Required tests, intermediate/final typechecks and final formatting checks passed. STATE, ROADMAP and global requirement updates remain owned by the parent orchestrator after this summary commit.
