---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "01"
subsystem: localization
tags: [prisma, postgresql, telegram, i18n, migrations]
requires:
  - phase: 05-proactive-reliable-reminders
    provides: Composed bot, durable domain records and guarded committed migrations
provides:
  - Independent bigint-keyed language preferences with en/uk database constraint
  - Explicit-locale typed catalog and persisted settings language row
  - Fresh, upgrade, repeat and drift migration verification
affects: [06-02, 06-03, 06-04, 06-06, 06-07]
tech-stack:
  added: []
  patterns: [Explicit locale rendering, configuration-independent preference ownership]
key-files:
  created:
    - prisma/migrations/20260916180000_chat_language_preferences/migration.sql
    - src/shared/i18n/index.ts
    - tests/integration/localization-tracer.test.ts
    - tests/integration/chat-language-migration.test.ts
  modified:
    - prisma/schema.prisma
    - src/telegram/settings-handlers.ts
    - prisma/migrate-deploy.mjs
    - tests/integration/migration-preflight.test.ts
key-decisions:
  - Missing preferences remain implicit English without creating configuration or preference rows.
  - Existing ordered migration-ledger validation already discovers committed migrations and needs no special-case change.
requirements-completed: [LANG-03, LANG-04, LANG-05, L10N-01]
coverage:
  - id: locale-settings-tracer
    description: Persisted group locale selects the settings language row independently of client language and schedule readiness.
    verification:
      - kind: integration
        ref: tests/integration/localization-tracer.test.ts
        status: pass
    human_judgment: false
  - id: language-schema-gate
    description: Committed migrations preserve domain rows and validate the exact preference catalog.
    verification:
      - kind: integration
        ref: tests/integration/chat-language-migration.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/migration-preflight.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 4328
  tasks: 2
  commits: 5
duration: 11min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 1: Persisted Locale and Migration Boundary Summary

**Settings now reads independent chat language preferences from migrated PostgreSQL and renders a typed English or Ukrainian language row.**

## Accomplishments

- Added `ChatLanguagePreference` without a configuration foreign key. Bigint chat ownership, explicit-selection metadata, timestamps, default English and an en/uk CHECK are durable.
- Added `Locale`, `MessageParameters`, mapped `MessageCatalog` and pure `renderMessage(locale, key, params)`. Both complete initial catalogs cover language selection, language row, change confirmation, bilingual navigation, language names and timezone introductory copy.
- Kept complete and incomplete settings projections separate. Reading language does not manufacture schedule data, change domain revisions or use Telegram client language.
- Extended exact migration catalog verification for physical column order, defaults, primary key, index and CHECK. Existing checksum/order validation discovers the new migration automatically.
- Verified domain-row equality across predecessor upgrade and repeated deployment for configuration, memberships, setup drafts, settings drafts, planning rounds/participants and reminder state/occurrences.

## Task Commits

1. Task 1 RED: `cd68441` — composed settings locale behavioral tests.
2. Task 1 GREEN: `5e0c2b5` — independent preference schema and explicit-locale rendering.
3. Task 2 RED: `8a54dd7` — upgrade/repeat deployment and catalog drift tests.
4. Task 2 GREEN: `c173986` — exact locale catalog deployment guard.

The summary is committed separately. No worktrees or branches were created. Pre-existing unrelated workspace changes were preserved; the settings handler's pre-existing dirty status contained no substantive diff before these additions.

## Verification Evidence

Tested implementation revision: `c173986` (identical implementation to the final green test run). Runtime: Node 24.19.0, Docker server 29.1.3, disposable PostgreSQL image `postgres:18.4`.

- Task 1 RED: three cases failed for missing `Language: English` and absent `chat_language_preferences`; this was recorded only after Docker was functional.
- `npm run db:generate`: passed. The repository config requires DATABASE_URL even for generation, so the command ran with a URL obtained from an actual disposable Testcontainers database; no configured real database was used.
- `npm run test:integration -- tests/integration/localization-tracer.test.ts`: 3/3 passed, then 3/3 passed again at the tracer feedback gate before Task 2.
- Task 2 RED: three new cases failed because preflight/post-deploy validation did not recognize the language catalog. The name filter intentionally excluded existing cases during this RED-only run.
- `npm run test:integration -- tests/integration/chat-language-migration.test.ts tests/integration/migration-preflight.test.ts tests/integration/localization-tracer.test.ts`: **40/40 passed**, 3 files, 153.96 seconds. This includes fresh wrapper deployment, predecessor upgrade, already-migrated deployment, repeat deployment, `prisma migrate status`, invalid locale rejection, exact column order, ledger uniqueness/order and dropped-CHECK rejection.
- `npm run test:unit -- tests/unit/settings.test.ts tests/unit/schedule-settings.test.ts tests/unit/settings-dashboard-keyboard.test.ts`: **15/15 passed**.
- `npm run test:integration -- tests/integration/chat-readiness.e2e.test.ts`: **9/9 passed**, including configured settings, setup/roster continuity, stale and unauthorized callbacks and exactly-once acknowledgement.
- `npm run typecheck`: passed after all implementation changes.
- Targeted Prettier check of all six changed TypeScript/JavaScript files: passed.

## Deviations from Plan

- Environment recovery preceded implementation: Docker Desktop initially failed to provide a working runtime. The orchestrator repaired stale runtime sockets reversibly; the first Testcontainers run failed during setup and was not counted as behavioral RED. Once Docker recovered, all real database gates ran successfully.
- Prisma generation required a DATABASE_URL that was absent from the shell. A disposable container supplied it for generation; no persistent environment or real database was changed.
- No ledger algorithm change was necessary: existing ordered committed migration discovery and checksum validation already handle the additive migration, as the new upgrade/repeat tests demonstrate.

## Scope and Remaining Phase Work

This slice renders the current language row. Administrator language selection, full onboarding translation and group migration transfer remain the explicit work of later Phase 6 plans. No placeholder implementation prevents this plan's tracer or migration goal. No new callback kinds, authorization paths, network endpoints or unmodeled trust boundaries were introduced. No Telegram messages were sent; all bot API calls were intercepted by test harnesses.

## TDD Gate Compliance

Both tasks have a failing behavioral test commit followed by an implementation commit. Final suites contain no skipped tests. Actual token cost uses `ceil(realized implementation diff characters / 4)`, excluding this summary and unrelated workspace edits.

## Self-Check: PASSED

All eight planned implementation/test files exist. All four task commits exist in Git. No task commit deleted tracked files. All required verification commands passed against disposable PostgreSQL. STATE and ROADMAP updates are owned by the parent orchestrator after this summary commit.
