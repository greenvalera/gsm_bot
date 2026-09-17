---
phase: 07-ukrainian-planning-and-lifecycle
plan: "05"
subsystem: telegram
tags: [localization, ukrainian, feedback, authorization, postgres]
requires:
  - phase: 07-04
    provides: Localized lifecycle cards and explicit per-card locale
provides:
  - Bilingual semantic planning refusals, instructions and recovery messages
  - Localized command and callback boundaries preserving authority order
  - Unicode-safe localized plain owner alerts bounded to 200 UTF-16 units
  - Real PostgreSQL feedback and precedence matrix in both languages
affects: [07-06, 08]
tech-stack:
  added: []
  patterns: [Semantic feedback descriptors, Whole-phrase bounded owner alerts]
key-files:
  created: [tests/unit/localized-planning-feedback.test.ts, tests/integration/localized-planning-feedback.e2e.test.ts]
  modified: [src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, src/telegram/planning-handlers.ts, src/telegram/callbacks.ts, src/telegram/handlers.ts, tests/unit/onboarding-feedback.test.ts, tests/unit/callback-authority.test.ts, tests/unit/i18n.test.ts]
key-decisions:
  - Keep branch-owned acknowledgement and existing role/token/expiry ordering; locale is presentation only.
  - Compute owner-label budget from the complete selected-language phrase with an empty label, then truncate on code-point boundaries.
  - Preserve English compatibility exports and use existing planning.applied and planning.retrySafe contracts only for the corresponding domain outcomes.
requirements-completed: [TEXT-04, LANG-06]
actuals:
  tokens: 24317
  tasks: 3
  commits: 7
coverage:
  - id: planning-feedback
    description: Bilingual planning validation, denials, stale outcomes, duplicates and recovery retain their distinct facts and command destinations.
    requirement: TEXT-04
    verification:
      - kind: integration
        ref: tests/integration/localized-planning-feedback.e2e.test.ts
        status: pass
    human_judgment: false
  - id: owner-alerts
    description: Localized plain owner alerts preserve masked identities, hostile names and Unicode boundaries within Telegram's 200-unit limit.
    verification:
      - kind: unit
        ref: tests/unit/localized-planning-feedback.test.ts
        status: pass
    human_judgment: false
  - id: authority-precedence
    description: Real tokens retain current-membership precedence, exact expiry boundaries, consumed-action distinctions, one acknowledgement and unchanged unauthorized state.
    verification:
      - kind: integration
        ref: tests/integration/localized-planning-feedback.e2e.test.ts
        status: pass
    human_judgment: false
  - id: ukrainian-wording
    description: Conversational Ukrainian feedback and role descriptions remain subject to end-of-phase wording judgment.
    verification: []
    human_judgment: true
    rationale: Automated exact-string and branch tests do not replace native wording judgment.
duration: 17min
completed: 2026-09-18
status: complete
---

# Phase 07 Plan 05: Localized Planning Feedback Summary

**Planning instructions, denials and recovery now resolve the current group language while retaining durable authority, result precedence and one delivered callback acknowledgement.**

## Accomplishments

- Added typed whole-phrase feedback for configuration, access, week availability, past/nonexistent slots, empty roster, takeover, participant eligibility, booking, cancellation, change, replanning and publication recovery. Existing English compatibility exports remain available.
- Applied exact D-14 superseded guidance and reused Plan 01's D-15/D-16 retry/duplicate classifications. Cancellation, generic expiry, no round, booked state, safe retry and committed publication recovery remain distinct.
- Planning callback routes now carry semantic descriptors. Command refusals use the same catalog boundaries without changing authorization order or deleting planning actors' onboarding drafts.
- Owner alerts use the already-exported localized plain identity helper from Plan 03. Their label budget derives from the selected-language whole phrase; HTML-sensitive names stay plain and long astral names are truncated without splitting surrogate pairs.
- Added 60 composed bilingual PostgreSQL cases. Unmocked cases cover fresh roles, missing actor/chat, unknown/malformed tokens, wrong chat/actor, missing targets/rounds, exact expiry offsets, consumed actions, empty roster and terminal states. A separate exhaustive refusal matrix injects domain outcomes behind real token rows and the real dispatcher; it checks every response and unchanged database snapshots without claiming to retest those domain transitions.

## Task Commits

1. Task 1 RED: `5fba075` — Ukrainian planning refusal outcomes.
2. Task 1 GREEN: `ef693bb` — semantic feedback catalogs and handler wiring.
3. Task 2 RED: `ea189e4` — boundary descriptors and bounded owner alerts.
4. Task 2 GREEN: `87b146c` — localized command/callback boundaries and owner alerts.
5. Task 3 RED: `3a591cb` — real boundary matrix exposed two replan copy omissions.
6. Task 3 GREEN: `8280b81` — replan messages and expanded refusal/precedence regressions.

The seventh commit records this summary, roadmap progress and the resolved deviation ledger. State updates remain available to the orchestrator with the previously accumulated authorized state changes preserved.

## Verification

- Docker prerequisite: `docker info --format '{{.ServerVersion}}'` succeeded, server 29.1.3.
- Task 1 named unit check: 4/4 passed after its RED failure for actual English output.
- Task 2 named unit check (`localized-planning-feedback`, `callback-authority`, `planning-ownership`): 34/34 passed after 4 expected RED failures.
- Task 3 initial corrected matrix: 42/44 passed, with precisely the two untranslated Ukrainian replan messages failing before their fix.
- Final affected unit union from `07-VALIDATION.md`, excluding not-yet-created Plan 06 tests: **272/272**, 12 files, 0.798 seconds.
- Final affected integration union from `07-VALIDATION.md`, excluding not-yet-created Plan 06 tests: **243/243**, 11 files, 94.89 seconds. This includes **60/60** new localized feedback cases and existing planning, lifecycle, recovery and onboarding regressions.
- `npm run build` and `npm run build:runtime`: passed.
- `npm run format:check`: passed after formatting the new integration file.
- Scoped `git diff --check`: passed. No tracked file deletions in task commits.

Exact final unit command:

```text
npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/localized-planning-cards.test.ts tests/unit/localized-lifecycle-cards.test.ts tests/unit/localized-planning-feedback.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts
```

Exact final integration command:

```text
npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts tests/integration/localized-planning-feedback.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts
```

## Deviations from Plan

**[Rule 1 - Bug] Closed two replan literal omissions discovered during Task 3.** The expanded boundary tests reached the replan-specific not-eligible and empty-roster messages missed by Task 1's constant inventory. Added semantic keys and wired both branches in `8280b81`; the Ukrainian tests failed before and passed after. This required Task 3 to revisit the three catalogs and planning handler. Recorded as WINDOWS entry 23 and marked fixed.

`roster-renderers.ts` needed no edit: Plan 03 already exported the required localized plain-label function. No new shared helper was introduced. Initial test development corrected fixture model/label names and a mistaken assertion about a nonexistent request column; production behavior was not changed to satisfy those fixture mistakes.

## Decision and Threat Coverage

- D-13: action-specific author/admin, takeover-admin, participant-snapshot and current-member denials retain their actual eligibility facts. Start denial continues to identify the configured planning-access policy, preserving English behavior.
- D-14: exact superseded text points to `/plan_status`; generic expiry and no-round guidance retain `/plan`.
- D-15: safe transaction failures use retry guidance; lifecycle publication recovery does not claim the durable action failed.
- D-16: completed repeats use the existing applied contract, with equality/past-expiry still taking the existing stale route.
- T-07-05-01: injected fresh roles and actual dispatcher precedence checks preserve fail-closed membership, token/chat binding and drafts.
- T-07-05-02: bounded plain alerts, masked IDs, valid astral boundaries and exactly-once HTML escaping are covered.
- T-07-05-03: existing claims, fingerprints and transitions are unchanged; full affected regression suites pass.

No new endpoint, schema, auth mechanism or file-access surface was introduced. Stub/placeholder scan found no new production stubs. No authentication gate or dependency installation was needed. No verification was skipped. Shared requirements remain open at phase level pending Plan 06 and phase verification.

## Next Plan

Plan 07-06 owns active-card language switching and final phase acceptance. Human wording judgment and the prior unclassified TEXT-03 probe remain pending at the phase boundary. Actual reminder delivery and runtime-image inventory remain Phase 08; only existing interactive reminder-start feedback is covered here.

## Self-Check: PASSED

Both new test artifacts exist. All six task commits were verified in git history. Required automated checks passed; unrelated pre-existing workspace changes were preserved.
