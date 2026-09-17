---
phase: 07-ukrainian-planning-and-lifecycle
plan: "04"
subsystem: telegram
tags: [localization, ukrainian, lifecycle, booking, postgres]
requires:
  - phase: 07-03
    provides: Localized planning cards, stable control bindings and explicit render locale
provides:
  - Bilingual readiness, blocked, booking, cancellation, change and retired-message projections
  - Catalog-backed lifecycle controls preserving existing callback action semantics
  - Per-card locale carried through appended lifecycle controls
  - Real PostgreSQL bilingual lifecycle and concurrency regressions
affects: [07-05, 07-06, 08]
tech-stack:
  added: []
  patterns: [Whole-phrase lifecycle catalogs, Internal per-card presentation locale]
key-files:
  created: [tests/unit/localized-lifecycle-cards.test.ts, tests/integration/localized-lifecycle.e2e.test.ts]
  modified: [src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, src/telegram/planning-renderers.ts, src/telegram/keyboards.ts, src/telegram/planning-handlers.ts, tests/unit/planning-keyboards.test.ts, tests/unit/i18n.test.ts]
key-decisions:
  - Retain the card's resolved locale when appending lifecycle controls so a later preference read cannot produce a mixed-language payload.
  - Reuse existing locale dispatch, durable claims and recovery transitions; translate presentation without granting announcement entitlement.
requirements-completed: [TEXT-03, LFMT-01, LANG-06]
actuals:
  tokens: 13030
  tasks: 3
  commits: 8
coverage:
  - id: bilingual-lifecycle-cards
    description: Exact selected Ukrainian readiness, blocked and manual-booking wording with distinct cancellation, superseded and retired-copy recovery facts.
    requirement: TEXT-03
    verification:
      - kind: unit
        ref: tests/unit/localized-lifecycle-cards.test.ts
        status: pass
    human_judgment: false
  - id: lifecycle-controls
    description: Ukrainian booking confirmation and Back retain book-apply/book-keep; change/cancellation controls preserve capability lookup, omission and callback budgets.
    verification:
      - kind: unit
        ref: tests/unit/planning-keyboards.test.ts#lifecycle controls
        status: pass
    human_judgment: false
  - id: composed-lifecycle
    description: Both languages preserve authority, booking eligibility, successor links, roster resnapshotting, cancellation notification rules, recovery and concurrent claim counts.
    verification:
      - kind: integration
        ref: tests/integration/localized-lifecycle.e2e.test.ts
        status: pass
    human_judgment: false
  - id: booking-transparency
    description: Readiness must remain distinct from reporting an externally confirmed studio booking.
    verification: []
    human_judgment: true
    rationale: End-of-phase wording judgment remains pending; exact-string tests do not replace it.
  - id: text03-unclassified-probe
    description: The raw TEXT-03 probe has no classified predicate and remains unresolved.
    verification: []
    human_judgment: true
    rationale: Concrete named lifecycle evidence does not classify or dismiss the raw probe.
duration: 15 min
completed: 2026-09-18
status: complete
---

# Phase 7 Plan 4: Ukrainian Lifecycle and Manual Booking Summary

**Readiness, manual booking, replanning, cancellation and recovery now render Ukrainian lifecycle facts and controls while retaining English behavior, current authority and durable announcement rules.**

## Performance

- Started: approximately 2026-09-17T22:22:00Z (2026-09-18 locally).
- Completed implementation verification: 2026-09-17T22:36:00Z.
- Tasks: 3 completed; 10 implementation/test files changed.
- Actual token estimate: 13,030, calculated as ceiling of 52,118 realized diff characters divided by four, base `0db3f04` through `de711b9`. This is not harness token usage.

## Accomplishments

- D-05 is exactly `Усі можуть! Час бронювати репетицію.`; D-08 is `Цей час підходить не всім. Обери іншу дату й час.`.
- D-06 booking request is `Студію заброньовано`. D-07 asks `Студію вже заброньовано на цей час?`, retains the real date/range, and offers `Так, заброньовано` / `Назад`; Back still resolves to `book-keep`.
- Lifecycle phrases cover all nine named renderers and cancellation-slot fragments. Names remain escaped once, fallback identities remain masked/localized, and blocked announcements retain mention suppression.
- Cancel/change confirmations retain their exact transition semantics. Retired copies claim only that the copy is no longer current; superseded records retain successor recovery; retracted announcements withdraw the earlier fact.
- All production cards now carry internal optional locale context. `withoutEmptyKeyboard` preserves it, and appended lifecycle controls reuse it. Telegram payloads and render fingerprints continue to contain only the existing text/markup fields.
- Real-database journeys exercise request/apply authority rechecks, lost unanimity, Back, repeated booking, blocked replanning, active-roster resnapshotting, old controls, booked date/time changes, three cancellation states, missing-message handling and `/plan_status` reanchoring.
- Concurrent final answers create one announcement, and concurrent eligible replan actions create one successor and one new card. The broader existing suite retains cancelled/no-round distinctions, claim compensation and uncertain-delivery behavior.

## Task Commits

1. Task 1 — lifecycle messages: RED `76832a8`; GREEN `49d211c`.
2. Task 2 — localized lifecycle controls: RED `6225e42`; GREEN `631bc91`.
3. Task 3 — composed bilingual journeys and locale consistency: RED `8c9fa47`; GREEN `de711b9`.

No task commit deleted tracked files. Source/test changes are committed separately from close-out documentation.

## Verification

- `docker info --format '{{.ServerVersion}}'`: passed, Docker 29.1.3. The existing fixture started migrated PostgreSQL successfully.
- `npm run test:unit -- tests/unit/localized-lifecycle-cards.test.ts`: 8 passed. The first RED run exposed the untranslated Ukrainian lifecycle text; an empty-keyboard serialization expectation and existing catalog phrase expectations were corrected without changing their semantics.
- `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-lifecycle-cards.test.ts`: 26 passed, 480 ms. RED failed the Ukrainian lifecycle label/action comparison.
- `npm run test:integration -- tests/integration/localized-lifecycle.e2e.test.ts`: 24 passed, 10.66 s. The RED run reproduced mixed-language text/lifecycle rows in both directions. Fixture corrections aligned roster deactivation and recovery expectations with existing domain behavior.
- Catalog parity initially identified the new `time` sample parameter; adding it makes every typed entry nonempty and free of undefined interpolation.
- Affected unit union: 259 passed in 11 files, 764 ms. Command: `npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/localized-planning-cards.test.ts tests/unit/localized-lifecycle-cards.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts`.
- Affected PostgreSQL union: 183 passed in 10 files, 86.01 s. Command: `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts`.
- `npm run build`, `npm run build:runtime`, `npm run format:check`, and the scoped `git diff --check`: passed.

The unions cover currently implemented affected suites. Later-plan feedback/switching tests and Phase 8 reminder/runtime-image checks are not claimed here.

## Decisions Made

Keep one locale for a complete card payload. Carry that presentation context with the pure card instead of rereading preferences when appending controls. It does not affect domain state, stable callback values, fingerprint comparisons or notification entitlement. Preserve `dispatchAnnouncement`'s early return for `none` and reuse its already-localized body branches.

## Deviations from Plan

No scope deviations. Task 3 found and repaired missed presentation plumbing as explicitly allowed: independently resolving the lifecycle-row locale could mismatch the already-rendered body. The added adversarial integration test demonstrates both language directions. Other dispatch seams already received locale through Plan 02 and needed no redundant rewrites.

## Security and Stub Review

- T-07-04-01: request/apply denial, demotion and lost-unanimity tests preserve eligibility and unconsumed capabilities. Locale never confers authority.
- T-07-04-02: lifecycle cards use localized HTML labels once; escaped hostile labels and masked IDs pass. Existing plain callback identity/truncation behavior remains unchanged and passes the affected regressions.
- T-07-04-03: repeated and concurrent actions preserve transition counts, successor identity, claims, notification counts and recovery placement. Text-and-markup fingerprints remain unchanged.
- No new network endpoint, schema, authentication or file-access trust boundary.
- No new stubs, TODO/FIXME placeholders, skipped tests or unrun plan verification. No broken-window entry added.

## Pending Judgment and Tracking

The raw TEXT-03/unclassified probe remains unresolved in the plan assumption record. Booking-transparency and idiomatic Ukrainian wording remain pending end-of-phase judgment. Automated results do not close either item. Broader localized denials and no-round feedback belong to Plan 05; switching reconciliation belongs to Plan 06.

Shared requirement IDs are not newly marked complete before their remaining declaring plans finish. Pre-existing workspace edits and accumulated STATE.md changes are preserved; the orchestrator owns the shared STATE.md commit.

State advanced to Plan 5 of 6; execution metric, decision and session were recorded. Roadmap progress is 4/6. The inherited `state.update-progress` helper limitation returned `Progress field not found in STATE.md`; other state updates succeeded, and the existing state format was preserved.

## Self-Check: PASSED

Both new test files exist. All six task commit objects were verified with `git cat-file`. All task verification, affected regressions, typecheck, runtime build and formatting passed. No plan-owned source/test changes remain uncommitted.
