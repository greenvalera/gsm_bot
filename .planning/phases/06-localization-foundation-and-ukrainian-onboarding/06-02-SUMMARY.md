---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "02"
subsystem: localization
tags: [telegram, prisma, onboarding, language]
requires:
  - phase: 06-01
    provides: Independent preferences and typed initial catalogs
provides:
  - Atomic administrator language choices with same-locale no-op semantics
  - First-setup language selection and incomplete settings navigation
  - Actor-owned setup continuation with persisted language
affects: [06-03, 06-04, 06-06, 06-07]
tech-stack:
  added: []
  patterns: [Per-chat transaction advisory lock, strict stored language targets, callback navigation adapters]
key-files:
  created:
    - src/domain/chat/language-service.ts
    - src/telegram/language-handlers.ts
    - tests/unit/language-selection.test.ts
    - tests/unit/language-navigation.test.ts
  modified:
    - src/shared/callback-schema.ts
    - src/telegram/callbacks.ts
    - src/telegram/setup-handlers.ts
    - src/telegram/settings-handlers.ts
    - tests/integration/localization-tracer.test.ts
    - tests/integration/chat-readiness.e2e.test.ts
key-decisions:
  - Preference selection and callback consumption share a transaction; a per-chat advisory lock orders independent service instances.
  - Language callback navigation edits the originating card through narrow reply adapters.
  - Continue setup invokes beginOrResume for the current actor; expired drafts restart with the persisted locale.
requirements-completed: [LANG-01, LANG-02, LANG-03, LANG-04, LANG-05]
coverage:
  - id: language-choice-authority
    description: Valid administrator selections persist independently; stale and unauthorized actions do not change preferences and receive exactly one acknowledgement.
    verification:
      - kind: unit
        ref: tests/unit/language-selection.test.ts
        status: pass
    human_judgment: false
  - id: language-navigation
    description: Setup and settings expose durable language controls and actor-owned continuation through the composed bot.
    verification:
      - kind: unit
        ref: tests/unit/language-navigation.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/localization-tracer.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 9677
  tasks: 2
  commits: 6
duration: 11min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 2: Durable Language Selection and Navigation Summary

**Administrators can select English or Ukrainian before configuration, change language through settings, and continue their own setup draft without resetting its values.**

## Accomplishments

- Added strict stored open/select/continue targets under existing SETTINGS_EDIT opaque tokens. Existing fresh-role, actor, chat and expiry checks remain the authority boundary.
- LanguageService resolves implicit English, records initial explicit English once, and skips repeated preference writes for the current explicit locale. Preference timestamps remain unchanged for that no-op.
- Token consumption and selection share a PostgreSQL transaction. Per-chat transaction advisory locks serialize selections across service instances without configuration revision coupling. Independently valid screens remain usable; the last accepted choice wins.
- First unconfigured /setup asks for English / Українська before creating a draft. A choice advances directly to timezone. Timezone exposes Мова / Language. Configured legacy chats retain English.
- Incomplete /settings renders a language row, bilingual entry and localized Continue setup. Complete /settings appends the language row and entry to the existing dashboard.
- Callback return navigation edits its original message. Changed choices acknowledge in the new language; unchanged choices receive a bare acknowledgement with no extra confirmation.
- Continue setup uses the acting administrator's beginOrResume path. Database tests prove values survive, another actor receives a separate draft, and expiration restarts in saved Ukrainian.

## Task Commits

1. `7862380` — Task 1 RED: durable selection tests.
2. `ea9cc00` — Task 1 GREEN: transactional service, codec and callback route.
3. `485edc8` — Current Telegram bot fixture capability fields required by typecheck.
4. `2c9e738` — Task 2 RED: first setup, timezone and incomplete-settings navigation.
5. `0d179f9` — Task 2 GREEN: navigation, real database tracer and adjusted readiness regression fixtures.

This summary is committed separately. No worktree or branch was created. Unrelated pre-existing changes were preserved.

## Verification Evidence

Final implementation revision: `0d179f9`. Node 24.19.0; disposable migrated PostgreSQL 18.4; intercepted Telegram API only.

- Task 1 RED failed because the planned service module did not yet exist. After implementation, a BigInt test-title formatting issue and a mock method name were corrected. The service cases and real callback boundary matrix pass.
- Task 2 RED: all four navigation cases failed for the expected absent behaviors.
- `npm run test:unit -- tests/unit/language-navigation.test.ts tests/unit/language-selection.test.ts tests/unit/setup.test.ts tests/unit/settings.test.ts tests/unit/timezone-prompt-copy.test.ts tests/unit/callback-authority.test.ts tests/unit/settings-dashboard-keyboard.test.ts tests/unit/schedule-settings.test.ts`: **61/61 passed**, eight files.
- `npm run test:integration -- tests/integration/localization-tracer.test.ts tests/integration/chat-readiness.e2e.test.ts`: **15/15 passed**, two files, 10.88 seconds. Includes six locale tracer cases and nine existing composed readiness cases.
- `npm run typecheck`: passed after the final behavior changes.
- Targeted Prettier check on all ten changed source/test files: passed.
- No task commit deleted tracked files. No tests were skipped and no required verification was omitted.

## Deviations from Plan

- [Rule 2 - Integration] Task 2 also updated callbacks.ts to route Continue setup through beginOrResume and edit the originating card. This is necessary production wiring for D-16 and existing no-extra-card behavior.
- [Rule 3 - Regression fixtures] Updated existing chat-readiness.e2e setup helpers to choose English instead of the superseded Start setup entry. Its expired START_SETUP test now expires the real timezone-candidate action, preserving setup-specific stale coverage. The timezone keyboard assertion now expects the required bilingual entry. No unrelated source behavior changed.
- [Rule 3 - Test types] Added current UserFromGetMe capability fields after typecheck identified the fixture mismatch. A separate test correction commit records this transparently.

## Remaining Phase Scope

Full setup/settings/roster translation remains in plans 03–05. The timezone-only Ukrainian projection here is functional and will be consolidated into the localized renderer in plan 03. Plan 04 owns normal settings-edit result localization and dashboard consolidation. Existing common authorization/stale feedback remains under plan 07's feedback work. No implementation stubs block this plan's navigation goals. No new network endpoint, schema or authorization surface was introduced outside the declared threat model. Native-client visual acceptance remains end-of-phase work; no live Telegram messages were sent.

## Self-Check: PASSED

All ten source/test artifacts and five task commits exist. Final tests and typecheck pass. Summary is written to its canonical path. STATE, ROADMAP and global requirements updates remain owned by the parent orchestrator after this summary commit.
