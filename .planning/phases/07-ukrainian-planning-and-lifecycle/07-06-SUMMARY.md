---
phase: 07-ukrainian-planning-and-lifecycle
plan: "06"
subsystem: telegram
tags: [localization, ukrainian, idempotency, recovery, postgres]
requires:
  - phase: 07-05
    provides: Localized planning feedback and per-card locale through lifecycle controls
provides:
  - Current-language ordinary refresh for duplicate day/time selections and availability answers
  - Read-only reuse of existing capabilities without domain transitions or announcement claims
  - Cold-cache, not-modified, rejected edit and in-flight locale boundary regressions
  - Composed switching, recovery, serialization and lifecycle state evidence
affects: [07-verification, 08]
tech-stack:
  added: []
  patterns: [Authorized read-only duplicate refresh, Full-payload render fingerprint]
key-files:
  created: [tests/unit/planning-language-render.test.ts, tests/integration/planning-language-switch.e2e.test.ts]
  modified: [src/telegram/planning-handlers.ts, tests/integration/localized-lifecycle.e2e.test.ts, tests/integration/localized-planning.e2e.test.ts]
key-decisions:
  - Repeated actions reuse persisted current-round controls and never mint capabilities or claim announcement delivery solely to repaint a language change.
  - Consumed draft selections require current round ownership again before repainting; confirmed answers require current participant membership.
  - Preserve status recovery reanchoring and its revision increment; language-only changes themselves leave the complete durable planning and reminder snapshot unchanged.
requirements-completed: [LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02]
actuals:
  tokens: 8456
  tasks: 2
  commits: 6
coverage:
  - id: ordinary-language-update
    description: Real settings language controls switch both directions before duplicate selections, answers and status recovery without changing planning or reminder state.
    requirement: LANG-06
    verification:
      - kind: integration
        ref: tests/integration/planning-language-switch.e2e.test.ts
        status: pass
    human_judgment: false
  - id: render-cache-and-delivery
    description: Full text and keyboard fingerprints survive cold module reconstruction, not-modified responses, rejected translations and in-flight preference changes.
    requirement: LANG-06
    verification:
      - kind: unit
        ref: tests/unit/planning-language-render.test.ts
        status: pass
    human_judgment: false
  - id: switched-lifecycle-recovery
    description: Ready, blocked, booked and cancelled recovery retains claims, timestamps and action placement after switching language.
    requirement: TEXT-03
    verification:
      - kind: integration
        ref: tests/integration/localized-lifecycle.e2e.test.ts
        status: pass
    human_judgment: false
  - id: ukrainian-wording-judgment
    description: Natural Ukrainian dates and durations, neutral participant status and truthful distinction between readiness and external booking.
    verification: []
    human_judgment: true
    rationale: Descriptor-less no-blame/transparency prohibitions and the raw TEXT-03/unclassified probe require explicit end-of-phase judgment; automated strings do not resolve them.
duration: 14min
completed: 2026-09-18
status: complete
---

# Phase 7 Plan 6: Safe Mid-Round Language Switching Summary

**Repeated planning selections and availability answers now repaint text and controls in the current group language without changing durable planning state or announcement entitlement.**

## Accomplishments

- Added an authorized duplicate refresh path in the existing planning handler. It reads current round state and unconsumed, unexpired persisted actions, reuses the established renderers and full-payload fingerprint, and never mints replacement controls solely for language.
- Rechecked current ownership on consumed draft tokens because their domain duplicate result precedes ownership checks. Availability refresh requires the actor to remain in the round participant snapshot. Existing callback membership and settings administrator checks remain authoritative.
- Preserved successful/not-modified cache population and retried rejected translations on the next ordinary update. A failed state read or edit reports saved-state recovery guidance rather than suggesting another domain mutation.
- Added six cache/failure unit cases, eleven composed switching cases, and eight switched lifecycle cases. Assertions inspect outbound text/keyboard, acknowledgement count, actual message identity and persisted rows.
- Seeded real reminder generation and pending occurrence due times so language-only invariance is checked against nonempty durable scheduling data.

## Task Commits

1. **Task 1: Refresh ordinary no-op card updates without a domain transition**
   - `d3ccb9e` — RED: expose missing translated duplicate refresh.
   - `c87393b` — GREEN: refresh authorized duplicate cards in the current language.
2. **Task 2: Harden switching across cold cache, concurrent actions and failed delivery**
   - `fd4fabf` — RED: cache reconstruction, complete payload, failure and recovery regressions.
   - `0216afb` — GREEN: truthful read-failure recovery and composed delivery/interleaving coverage.

The summary and tracking are committed separately after task commits. No tracked files were deleted by these commits.

## Verification

- Docker prerequisite: `docker info --format '{{.ServerVersion}}'` succeeded, server **29.1.3**.
- Task 1 RED initially demonstrated missing card edits for duplicate selections and answers. Status test assumptions were corrected to retain the existing intentional revision increment when status recovery reanchors.
- `npm run test:integration -- tests/integration/planning-language-switch.e2e.test.ts -t "ordinary update"` — **6/6 passed**, 8.42 seconds.
- Task 2 RED demonstrated that failed state reads incorrectly retained ordinary duplicate feedback. The implementation now reports recovery guidance.
- `npm run test:unit -- tests/unit/planning-language-render.test.ts` — **6/6 passed**, 0.665 seconds. The same file also passed in the final affected unit union.
- `npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/localized-planning-cards.test.ts tests/unit/localized-lifecycle-cards.test.ts tests/unit/localized-planning-feedback.test.ts tests/unit/planning-language-render.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts` — **278/278 passed in 13 files**, 0.838 seconds.
- `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts tests/integration/localized-planning-feedback.e2e.test.ts tests/integration/planning-language-switch.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts` — **261/262 passed**, 104.28 seconds. The sole failure was the earlier tracer's obsolete expectation that changing language then repeating a selection produces no edit.
- After updating only that tracer assertion, `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/planning-language-switch.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts` — **55/55 passed**, 27.63 seconds. The other nine affected files passed **207/207** in the preceding union; no production changes occurred between these runs. All **262 distinct affected integration tests** therefore have passing evidence; this is not represented as a single all-green union run.
- `npm run build` — passed.
- `npm run build:runtime` — passed.
- `npm run format:check` — passed across the repository. The subsequent tracer-only assertion edit was formatted with the same installed Prettier.
- Scoped `git diff --check` — passed. Global diff checking reports a pre-existing extra EOF blank line in `.codex/config.toml`; it is unrelated and unchanged.

## Decisions and Threat Coverage

- LANG-06: both switching directions cover DAY, TIME, REVIEW and CONFIRMED status recovery; duplicate day/time/answer refresh preserves complete planning rows, actions, ownership, participant snapshots, selected civil date, authoritative timezone, instants, configuration and populated reminder schedule state.
- D-01 through D-12: the existing catalog/date/duration suites remain green. New switched cards assert matching body and controls, authoritative ranges and distinct ready/booked/cancelled behavior without altering those choices.
- D-13 through D-16: role demotion, consumed-token ownership, current-language recovery and exactly one callback acknowledgement remain covered. Duplicate feedback still reports the already-applied action.
- T-07-06-01: only current owners/participants may trigger duplicate repaint. Real settings callbacks recheck current administrator role and leave denied language capabilities unconsumed.
- T-07-06-02: the affected bilingual identity suites remain green; the new fixture includes hostile HTML names and uses existing renderers rather than a second escaping path.
- T-07-06-03: no language-only revision increment, no minted replacement capability, no manufactured claim, no repeat announcement on directive none, successful/not-modified cache only, and preserved uncertainty/reanchor semantics are asserted.

No new network endpoint, authorization mechanism, file-access surface or schema boundary was introduced. No production stub, skipped test, dependency installation or authentication gate was added.

## Deviations from Plan

**[Rule 1 - Direct regression adjustment] Update the earlier duplicate feedback tracer.**

The Plan 01 tracer in `tests/integration/localized-planning.e2e.test.ts` expected only an alert after changing the language. That contradicted this plan's newly implemented ordinary refresh. It now requires the Ukrainian text-and-keyboard edit, exactly one acknowledgement and an unchanged durable snapshot. This extra test file is the only file outside the declared plan list; commit `0216afb` contains the adjustment.

Status recovery intentionally reanchors and increments revision, so its tests assert the established behavior separately from language-only invariance. Cancelled rounds remain absent from active status lookup and return the localized no-active-plan response; old answer controls return localized cancellation feedback. No domain behavior was changed to satisfy an incorrect test assumption.

Actual tokens use **33,824 realized source/test diff characters divided by four**, rounded up, relative to `6fc1768`; they are not harness usage. Extensive pre-existing unrelated source/config/runtime edits were preserved.

Tracking helpers advanced the last plan to verification, recorded metrics/decision/session, and updated ROADMAP to 6/6 implemented while retaining In Progress. `state.update-progress` reported the existing missing prose Progress field limitation; frontmatter summary counts already show 13/13 implemented plans. Accumulated STATE decisions/metrics were retained. Requirement acceptance involving pending human judgment was not marked complete.

## Pending Phase Acceptance

The plan's implementation coverage is complete. Independent review, phase regression/verification and explicit wording judgment remain outside this executor's completed scope. Shared requirements requiring that judgment remain pending in REQUIREMENTS.md; `requirements-completed` above records this plan's implementation coverage, not a phase acceptance verdict.

Keep the raw **TEXT-03/unclassified** probe unresolved. Descriptor-less **no-blame participant wording** and **readiness versus external-booking transparency** remain flagged for explicit end-of-phase judgment. Review full Ukrainian dates, natural durations and selected wording alongside those prohibitions. Historical native Telegram waivers remain valid; no live Telegram action or new waiver was introduced. Actual reminder delivery, full outbound inventory and runtime-image locale acceptance belong to Phase 08.

## Self-Check: PASSED

Both created test files and this summary exist. Task commits `d3ccb9e`, `c87393b`, `fd4fabf` and `0216afb` exist, with RED before GREEN for both tasks. Required automated evidence is recorded above; no verification was silently skipped.
