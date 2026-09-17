---
phase: 07-ukrainian-planning-and-lifecycle
plan: "03"
subsystem: telegram
tags: [localization, ukrainian, planning, keyboards, postgres]
requires:
  - phase: 07-02
    provides: Explicit render locale and authoritative calendar/time-range formatting
provides:
  - Bilingual day, time, review and availability cards with localized identities and state legends
  - Locale-aware planning control rows with unchanged opaque action bindings
  - Exported localizedPlainMemberLabel for subsequent plain feedback
  - Composed bilingual planning and takeover evidence against migrated PostgreSQL
affects: [07-04, 07-05, 07-06, 08]
tech-stack:
  added: []
  patterns: [Typed whole-phrase planning catalog, Locale-aware row factories with English compatibility aliases]
key-files:
  created: [tests/unit/localized-planning-cards.test.ts]
  modified: [src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, src/telegram/planning-renderers.ts, src/telegram/keyboards.ts, src/telegram/roster-renderers.ts, tests/unit/planning-keyboards.test.ts, tests/unit/i18n.test.ts, tests/integration/localized-planning.e2e.test.ts]
key-decisions:
  - Keep the existing stable roster comparator independent of presentation locale so translated fallback labels cannot reorder participants.
  - Use count-independent Ukrainian constructions with exact integers for lineup and response totals.
  - Reuse Plan 02 locale dispatch already present on all named handler seams; no redundant handler edits.
requirements-completed: [TEXT-02, LFMT-02, LANG-06]
actuals:
  tokens: 13047
  tasks: 3
  commits: 8
coverage:
  - id: localized-planning-cards
    description: Bilingual card headings, prompts, organizer, legends, outcomes and exact counts preserve empty states, adjacent slots and stable ordering.
    requirement: TEXT-02
    verification:
      - kind: unit
        ref: tests/unit/localized-planning-cards.test.ts
        status: pass
    human_judgment: false
  - id: localized-planning-controls
    description: Exact D-01 and D-04 labels preserve token bindings, token omission, row geometry and callback byte limits.
    verification:
      - kind: unit
        ref: tests/unit/planning-keyboards.test.ts#live planning controls
        status: pass
    human_judgment: false
  - id: bilingual-planning-workflow
    description: Real command/callback navigation and administrator takeover preserve the selected slot and participant snapshot with safe identities and single acknowledgements.
    verification:
      - kind: integration
        ref: tests/integration/localized-planning.e2e.test.ts#planning workflow
        status: pass
    human_judgment: false
  - id: neutral-participant-wording
    description: Participant status and blocked-slot copy must not shame or blame people for being unavailable.
    verification: []
    human_judgment: true
    rationale: Descriptor-less prohibition and idiomatic Ukrainian wording require the planned end-of-phase judgment.
duration: 12 min
completed: 2026-09-18
status: complete
---

# Phase 7 Plan 3: Ukrainian Planning Cards and Controls Summary

**Day, time, review and availability cards now render complete Ukrainian planning copy and live controls while preserving English output, token authority and durable participant snapshots.**

## Performance

- Started: 2026-09-17T22:08:40Z (2026-09-18 locally)
- Completed: 2026-09-17T22:20:30Z
- Tasks: 3 completed
- Files modified: 10
- Actual token estimate: 13,047, computed as ceiling of realized implementation/test diff characters divided by four, from base 59515c6 through 7d471f6.

## Accomplishments

- Typed whole planning phrases cover all four card kinds, owner labels, used-marker legends, review instructions, counts, collecting/blocked/all-available facts and booked/cancelled summaries.
- D-01 controls are `👍 Можу` / `👎 Не можу`; D-02 legend text is `Очікуємо відповідь` / `Може` / `Не може`; D-03 is `Організатор: ...`; D-04 is `Стати організатором`.
- Control factories retain the existing English exported constants as compatibility aliases. Action values and lookup remain unchanged; missing capabilities produce no buttons. Day rows remain 4/3 and time rows 3/3/3/1.
- Empty/single/multiple rosters, marker ties, adjacent slots, collator-equal names and count boundaries 0/1/2/5/11/14/21/22/25/101/111 have bilingual regression coverage. Ukrainian totals use grammatically invariant constructions (`Учасників, яких запитаємо: N`, `Відповіли N з M`).
- PostgreSQL journeys verify real token consumption, denied actor non-mutation, single acknowledgement, safe long Unicode/HTML names, masked fallback identities, unchanged date/time on answer and takeover, and persistent participant snapshots after roster removal.

## Task Commits

1. Task 1 — translate projections and participant state: RED `403a981`; GREEN `5faa424`.
2. Task 2 — live localized controls: RED `c6be8f5`; GREEN `13b9072`.
3. Task 3 — composed dispatch and identity integration: RED `a66c2f0`; GREEN `7d471f6`.

All task commits exist. No tracked files were deleted.

## Verification

- `docker info --format '{{.ServerVersion}}'`: passed, Docker 29.1.3. Existing migrated PostgreSQL fixture started successfully.
- `npm run test:unit -- tests/unit/localized-planning-cards.test.ts`: 32 passed. Before implementation, Ukrainian expectations failed as intended; fixture assumptions about empty keyboard serialization and marker glyph were corrected before the RED commit.
- `npm run test:unit -- tests/unit/localized-planning-cards.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts`: 135 passed, 751 ms.
- `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-planning-cards.test.ts`: 46 passed, 519 ms. The preceding RED run failed exactly the two Ukrainian control cases.
- `npm run test:unit -- tests/unit/i18n.test.ts`: 15 passed. RED failed because localizedPlainMemberLabel was not exported. Existing parity sample fields cover every new catalog parameter (`value`, `label`, `total`); compile-time misuse checks remain intact.
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "planning workflow"`: both initial composed language journeys passed; the final unfiltered suite also includes both takeover journeys. Initial fixture mistakes (extra existing lifecycle controls and membership removal column name) were corrected without changing production behavior.
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts`: 12 passed, 7.84 s; no skipped tests in this full run.
- Affected unit union: 247 passed in 10 files, 763 ms. Command: `npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/localized-planning-cards.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts`.
- Affected PostgreSQL union: 159 passed in 9 files, 75.66 s. Command: `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts`.
- `npm run build`, `npm run build:runtime`, and `npm run format:check`: passed.

The final unions contain the currently implemented affected suites from 07-VALIDATION.md. Suites owned by later plans have not been created or claimed here.

## Decisions Made

Keep sorting independent of translated labels to retain stable ties and participant positions. Do not derive outcomes, permissions or callback targets from translated text. Reuse the existing explicit locale argument on renderStep, replaceAnchor/repostAnchor and direct confirmation/answer renders; those named seams were already completed by Plan 02.

## Deviations from Plan

No behavioral scope deviations. Two planned edits were unnecessary after inspection: planning-handlers.ts already threads locale through every named path, and catalog parity samples already provide all required parameter names. Those paths were verified through composed tests rather than rewritten.

## Security and Stub Review

- T-07-03-01: actor denial and takeover tests preserve current authority, token consumption and selected-state rules. No locale-derived authorization added.
- T-07-03-02: cards use localizedMemberLabel exactly once; plain surfaces now have the exported unescaped localizedPlainMemberLabel seam. Masked IDs, long astral names, HTML escaping, 200-unit denial budget and 4096-unit ordinary card budget pass.
- T-07-03-03: no-op fingerprint, revision checks and durable claims are unchanged. Existing retry/duplicate/uncertain-delivery and recovery regressions pass.
- No new network, schema, authentication or file-access trust boundary.
- No new stubs, TODO/FIXME placeholders, intentionally skipped tests or unrun plan verification. No new broken-window entry.

## Pending Judgment and Next Plan

The descriptor-less no-blame prohibition remains flagged-unverified for end-of-phase wording judgment. No human wording approval is inferred from automated string tests. Lifecycle-specific cards and appended lifecycle controls are owned by 07-04; broader localized feedback and safe language-switch reconciliation remain with 07-05/07-06. Phase 8 reminder/runtime-image scope is unchanged.

Pre-existing working-tree changes were preserved. STATE.md contains inherited authorized execution changes and remains unstaged; only this plan's source/test files and close-out artifacts are committed.

## Self-Check: PASSED

The new test file exists, all six task commits were verified with git cat-file, phase-owned source/test files have no remaining diff, and the final test/build/format commands passed.
