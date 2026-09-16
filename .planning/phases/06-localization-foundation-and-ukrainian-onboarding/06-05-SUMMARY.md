---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "05"
subsystem: localization
tags: [telegram, roster, ukrainian, i18n]
requires:
  - phase: 06-03
    provides: Typed English and Ukrainian catalogs
  - phase: 06-04
    provides: Response-time locale resolution pattern
provides:
  - Localized roster pages, navigation, loading and recovery
  - Current-language add and removal outcomes with stable membership identity
  - Real-service evidence that language selection preserves open removal confirmations
affects: [06-07]
tech-stack:
  added: []
  patterns: [Response-time locale resolution, compatible shared identity helpers, catalog-owned phrases]
key-files:
  created: [tests/unit/roster-localization.test.ts]
  modified: [src/telegram/roster-renderers.ts, src/telegram/roster-handlers.ts, src/telegram/keyboards.ts, tests/unit/roster-rendering.test.ts]
key-decisions:
  - Keep shared single-argument identity helpers compatible with existing Array.map consumers; use localizedMemberLabel in migrated roster projections.
  - Resolve locale after roster reads, action binding and membership writes immediately before output.
requirements-completed: [TEXT-01, LANG-04]
coverage:
  - id: localized-roster-projections
    description: Empty, single-member and paginated roster states retain names, callback targets and navigation in both languages.
    verification:
      - kind: unit
        ref: tests/unit/roster-rendering.test.ts
        status: pass
    human_judgment: false
  - id: open-removal-language-switch
    description: Minted English removal and keep confirmations survive language selection unchanged and complete in Ukrainian with exactly one acknowledgement.
    verification:
      - kind: unit
        ref: tests/unit/roster-localization.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 8137
  tasks: 2
  commits: 5
duration: 8min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 5: Ukrainian Roster Summary

**Roster pages and add/remove interactions now render the current group language while preserving member identity, action validity and exactly-once acknowledgement.**

## Accomplishments

- Localized empty, loading, failed, populated and paginated roster projections using the existing complete phrase catalogs. Ukrainian headings use **Склад гурту**; the existing catalog retains **Додати учасника** for the settings entry. No new roster workflow or command was introduced.
- Localized previous/next/retry and removal/keep controls without changing opaque token values, stable member ordering, pagination, HTML mode or action targets.
- Localized reply instructions, added/already-active outcomes, removal review, cancellation, success and dispatcher recovery. Operational removal failures retain the prior stale recovery destination instead of introducing a new behavior.
- Resolve the preference after asynchronous roster reads, action creation and add/remove transitions. Dynamic labels are escaped once, retain Cyrillic, combining and astral characters, and mask fallback Telegram IDs.
- Added a controller harness using actual RosterService and LanguageService over focused durable delegates and intercepted grammY API calls. Language selection leaves snapshots of membership and action maps unchanged. Both remove and keep then use the original minted confirmation and acknowledge once; current administrator rejection and genuine removed-member races remain enforced.

## Task Commits

1. Task 1 RED: `9e59ed6` — specify bilingual roster projections and action identity.
2. Task 1 GREEN: `2f47c63` — localize roster pages and navigation at response time.
3. Task 2 RED: `6441463` — cover roster outcomes across durable language changes.
4. Task 2 GREEN: `7cf3b8f` — render roster outcomes using current group language.

The summary is committed separately. Shared checkout execution preserved existing unrelated modifications; owned dirty paths had only line-ending differences before this work.

## Verification

Runtime: Node 24.19.0. No live Telegram messages, dependency installations or schema changes.

- Task 1 RED: 3 expected localization failures, 28 passing tests.
- Task 1 GREEN: roster-rendering and i18n suites, **31/31 passed**.
- Task 2 RED: 13 expected localization failures, 11 passing tests.
- Task 2 GREEN: roster-add, roster-remove and roster-localization suites, **24/24 passed**.
- Final affected regression: roster-rendering, i18n, roster-add, roster-remove, roster-localization, callback-authority and update-path-logging, **75/75 passed across seven files**.
- `npm run typecheck`: passed after both implementation tasks.
- Targeted Prettier check: all five changed source/test files passed. Scoped `git diff --check`: passed.
- Encoding tests cover `<>&`, Cyrillic, combining marks and astral names, representative page UTF-16 lengths below 4096, localized alerts below 200, masked identities and callback UTF-8 lengths at most 64 bytes. Existing name and page-size semantics remain unchanged.
- No skipped tests, placeholder implementations or unrun plan verification commands remain. These tests establish controller/domain composition over fakes; PostgreSQL composition remains plan 06-07, and native-client wording/legibility remains end-of-phase acceptance.

## Deviations from Plan

1. **[Rule 3 - Required integration seam] Localize roster keyboard helpers.** `src/telegram/keyboards.ts` still contained English-only roster labels. Added compatible trailing locale parameters to its three roster factories. Existing catalogs already supplied every phrase, so no catalog edits were needed.
2. **[Rule 1 - Compatibility] Preserve shared identity helper signatures.** Intermediate typecheck exposed existing Array.map callers that pass a numeric second argument. Retained their single-argument helpers and introduced explicit `localizedMemberLabel` for migrated roster callers; typecheck then passed without modifying planning renderers.
3. New controller tests live in the dedicated localization suite; existing roster-add and roster-remove domain suites passed unchanged.

## Scope and Deferred Observations

Shared router authorization denials and callback-boundary stale messages remain owned by plan 06-07. This plan preserves those authority checks and localizes roster-owned outcomes. No new network, authentication, schema or other trust boundary was introduced; no scoped high/critical threat remains unresolved.

An unscoped diff whitespace check also reported pre-existing `.codex/config.toml` blank EOF and generated `src/generated/prisma/internal/prismaNamespace.ts` trailing whitespace. Neither belongs to this plan; the scoped check passed. Existing historical roster debt was not expanded into this slice.

## TDD Gate Compliance

Both tasks have a failing behavioral-test commit followed by a passing implementation commit. Actual tokens are the ceiling of realized source/test diff characters divided by four, excluding this summary and unrelated workspace changes.

## Self-Check: PASSED

All five implementation/test files exist, all four task commits appear in history, and no task commit deleted tracked files. Required targeted tests, typecheck and formatting passed. STATE, ROADMAP, config and global requirements updates remain owned by the parent orchestrator after the summary commit.
