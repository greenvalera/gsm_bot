---
phase: 04-replanning-and-rehearsal-lifecycle
plan: "04"
subsystem: planning
tags: [telegram, replanning, lifecycle, authorization]
status: complete
requires:
  - phase: 04-03
    provides: Fresh lifecycle authorization, confirmation pairs, shared control placement
  - phase: 04-01
    provides: Token-agnostic supersedeAndCreate transaction seam
provides:
  - Named same-week change confirmation from command and inline controls
  - One supersession transaction and one Telegram replacement effect path for change and replan
  - Shared Cancel and Change controls across all live lifecycle redraws
affects: [04-05, 05-reminders-and-reliability]
tech-stack:
  added: []
  patterns: [shared successor transaction, shared successor delivery, exhaustive change dispatch]
key-files:
  created:
    - tests/integration/planning-change-telegram.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/shared/callback-schema.ts
    - src/telegram/handlers.ts
    - src/telegram/keyboards.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-booking.test.ts
    - tests/integration/planning-cancel-telegram.test.ts
    - tests/integration/planning-confirm.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/integration/planning-replan.test.ts
    - tests/integration/planning-round.test.ts
    - tests/unit/planning-availability-card.test.ts
    - tests/unit/planning-keyboards.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/unit/update-route-ownership.test.ts
key-decisions:
  - Change copies the old target week verbatim; changing weeks requires cancellation followed by planning start.
  - Change and replan consume their own tokens before calling the same token-agnostic supersession method.
  - Change uses a distinct changed success result so replanned remains unambiguous terminal refusal advice.
  - Lifecycle controls share one message while availability answers remain on their anchor.
requirements-completed: [LIFE-04, AVAIL-06]
coverage:
  - id: D1
    description: Authorized confirmed changes preserve the target week and reset availability using the replan transaction.
    requirement: LIFE-04
    verification:
      - kind: integration
        ref: tests/integration/planning-replan.test.ts#confirmed same-week changes
        status: pass
      - kind: integration
        ref: tests/integration/planning-change-telegram.test.ts
        status: pass
    human_judgment: true
    rationale: Real Telegram confirmation clarity and older-message presentation remain phase UAT judgments.
  - id: D2
    description: Change and replan share durable successor semantics and identical normalized Telegram replacement effects.
    requirement: AVAIL-06
    verification:
      - kind: integration
        ref: tests/integration/planning-replan.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/planning-change-telegram.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 20862
  tasks: 2
  commits: 10
duration: 16min active execution across an interrupted session
completed: 2026-09-09
---

# Phase 4 Plan 4: Same-week Rehearsal Changes Summary

Authors and current administrators can confirm a date/time change through `/plan_change` or the shared lifecycle controls, producing a fresh same-week draft through the existing replan transaction and message effects.

## Tasks and Commits

1. Domain change confirmation: `ab52825` RED and `bdd1c12` GREEN. Requests expire prior confirmation pairs, keeps consume only the decline token, and applies freshly authorize before locking the roster and consuming their own token. `supersedeAndCreate` remains the sole implementation, with exactly two callers. Empty rosters and week collisions leave the apply capability unconsumed.
2. Command, inline controls, and delivery: `5be3913`, `0f2361d`, `827ceab`, `ea702fa`, and `f208cd3` provide surface, route, logging, named-slot and equivalence regressions; `dcf38c1` updates recovered-card expectations; `8ad329e` completes the production surface and remaining regressions. `withLifecycleControls` adds both controls consistently, and `deliverSuccessor` owns both paths' terminal edits and fresh day-selector delivery.

The documentation commit records this summary. Actual tokens are the realized source/test diff character count divided by four, rounded up; they are not harness token usage. Eighteen production/test files changed. No dependency, database table, or migration was added.

## Decisions and Deviations

- **Same-week scope is structural.** The successor copies the old `targetWeekStart`; neither callback targets nor the shared transaction accept an alternate week. A cross-week change was rejected because confirm does not check week ownership. The specified alternative is cancellation, then `/plan`; Plan 04-05 supplies rolling-week selection.
- **[Rule 2 - Correctness] Name the selected slot in confirmation.** Review found that generic “this rehearsal” wording could obscure which older round `/plan_change` selected. The shared slot formatter now includes its selected day/time; drafts without selections use the existing generic rehearsal-plan label. Unit and Telegram RED tests preceded this correction.
- **[Rule 2 - Maintainability] Share message effects and control rendering.** The existing cancellation-only helper became `withLifecycleControls`, retaining availability answers and restoring booking/Replan plus both lifecycle controls after declines. The replan effect body was extracted without duplicating terminal edits or successor posting.
- **[Rule 2 - Exhaustiveness] Share one change result ladder.** Three thin dispatchers call exhaustive `finishChange`; every route retains distinct failure/refusal reasons. Success uses `changed` to avoid colliding with the existing `replanned` refusal discriminant.

## Automated Validation

- Final complete unit invocation: **352 passed**, 25 files.
- Final complete integration invocation: **288 passed**, 20 files, 240.36 seconds, against real PostgreSQL Testcontainers.
- The earlier full integration invocation was interrupted and is not completion evidence. Final reruns use the completed named confirmation and updated lifecycle expectations.
- Domain tests compare successor fields, live settings, roster snapshots, cleared responses, and token consumption across equivalent replan/change fixtures. A spy modifies one observable result in the actual shared seam and verifies both callers reflect it with exactly two invocations.
- Telegram tests compare normalized replacement API sequences for equivalent fixtures, cover draft/confirmed/booked changes, demotion, replay, named slots, and retained controls after decline.
- TypeScript and scoped Prettier checks passed. Temporarily removing the change `already-cancelled` switch branch produced the expected `never` exhaustiveness error; restoring it returned the build check to green.
- TDD RED commits precede domain and surface GREEN commits. No tests were skipped. The repository-wide formatting debt remains outside this plan; touched files pass formatting.

## Limitations and Follow-up

Telegram terminal edits and successor delivery remain best effort after the durable transition commits; delivery failure does not undo supersession. The real Telegram command/inline workflow, including cards below newer traffic, remains in the phase UAT runbook. The bot does not manage `setMyCommands`; an operator-maintained BotFather menu can list `/plan_change` separately.

No implementation stubs or new unmodeled security surface were found. State and roadmap advancement belong to the parent phase orchestrator.

## Self-Check: PASSED

All eighteen source/test artifacts exist and the nine implementation/test commits listed above are present. The required summary is written at this path.
