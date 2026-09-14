---
phase: 04-replanning-and-rehearsal-lifecycle
plan: "02"
subsystem: planning
tags: [telegram, prisma, availability, lifecycle]
status: complete
requires:
  - phase: 04-01
    provides: Immediate blocking, superseded attempts, cancellation schema position
provides:
  - Shared announcement slot for ready and blocked outcomes
  - Distinct superseded and cancelled callback alerts with exhaustive dispatch
affects: [04-03, 04-04, 05-reminders-and-reliability]
tech-stack:
  added: []
  patterns: [shared announcement body selector, exhaustive terminal refusal branches]
key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - prisma/schema.prisma
    - src/generated/prisma/internal/class.ts
    - src/generated/prisma/models/PlanningRound.ts
    - tests/unit/planning-availability-card.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/integration/planning-replan.test.ts
    - tests/integration/planning-replan-telegram.test.ts
key-decisions:
  - Collecting clears the announcement pointer while preserving the notification cooldown claim and returning the old message id for correction.
  - Blocked announcement identity labels omit usernames and normalize at signs in names before the existing HTML escaper.
  - Terminal answer and booking tokens remain live until their own expiry so the dispatcher can give specific advice.
requirements-completed: [AVAIL-05, AVAIL-08]
coverage:
  - id: D1
    description: A blocked round uses the same announcement slot and cooldown as a ready round, with status recovery and reopening.
    requirement: AVAIL-05
    verification:
      - kind: integration
        ref: tests/integration/planning-availability.test.ts#blocked announcement slot (D-03)
        status: pass
    human_judgment: true
    rationale: Real Telegram notification prominence and copy clarity remain end-of-phase UAT judgments.
  - id: D2
    description: Live old controls receive distinct replanned or cancelled alerts without mutating the successor.
    requirement: AVAIL-08
    verification:
      - kind: unit
        ref: tests/unit/planning-logging.test.ts#terminal round refusal copy and branch ownership
        status: pass
      - kind: integration
        ref: tests/integration/planning-replan-telegram.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 18654
  tasks: 2
  commits: 5
duration: 15min
completed: 2026-09-09
---

# Phase 4 Plan 2: Shared Announcements and Terminal Refusals Summary

**Blocked and ready outcomes share one notification claim, and old attempt buttons explain whether a rehearsal was replanned or cancelled.**

## Accomplishments

- The first unavailable response posts a blocked announcement; additional blockers edit it within the existing window. Reopening retracts it, clears its pointer, and keeps the cooldown so rapid toggles cannot post again.
- `announcementBody` selects the ready, blocked, or absent body for both normal rendering and status recovery. The availability anchor and announcement pointers remain separate.
- Blocker names use the existing masked-label/HTML-escaping path without raw username or name mentions.
- Answer and all three booking dispatchers explicitly handle both terminal facts with eight unique log pairs and exactly one acknowledgement each. Exhaustiveness now rejects an omitted refusal branch at typecheck.
- Old unexpired tokens reach these dispatchers; expired ones retain the callback boundary's generic refusal. Successor participants remain unchanged.

## Task Commits

1. Task 1 RED: `d26463a` — specify the shared blocked announcement slot.
2. Task 1 GREEN: `4a074d5` — announce blocked slots through the shared cooldown.
3. Task 2 RED: `52c69a3` — specify distinct terminal callback refusals.
4. Task 2 GREEN and review corrections: `d226a9f` — explain terminal callbacks with exhaustive refusal branches.

The fifth commit records this summary. Root orchestration owns subsequent STATE and ROADMAP updates.

## Automated Validation

- Full unit suite: **345 passed**, 25 files.
- Full integration invocation: **253 passed and one obsolete Phase 3 expectation failed**, 17 files / 254 tests. That failure expected the collecting-status log reason for a now-blocked round; all card and pointer assertions passed. Updated the reason and reran the entire affected recovery suite: **42 passed**. Together these runs cover every integration test with a passing final result; no second full invocation was needed for this assertion-only correction.
- Targeted terminal suites: **36 passed**, including real PostgreSQL, the real Telegram dispatcher harness, booking, and action retention.
- Availability suite: **39 passed** during Task 1. The later explicit rapid reopen/reblock assertion was rerun separately and passed.
- TypeScript build (`tsc --noEmit`) passed. Scoped Prettier checks passed; generated Prisma client was regenerated for schema comments.
- Removed the answer/replanned branch temporarily: TypeScript failed with `"replanned"` not assignable to `never`. Restored the branch and confirmed typecheck passes.
- `claimReadyAnnouncementWindow` compared unchanged against `c250e89`, including its status and cooldown WHERE conditions, after normalizing platform line endings. A superseded-round claim is refused in the integration test.
- Independent root review found and rechecked the raw-at-sign name issue; no remaining actionable findings.

## Decisions Made

The collecting transition follows the plan's explicit pointer-clearing behavior. It returns the pre-clear snapshot to the renderer, which can correct the old message, while retaining `readyAnnouncedAt` to prevent another notification inside the window. With no live pointer, a rapid reblock remains visible on the availability card until the window permits a new announcement.

## Deviations from Plan

- **[Rule 1 - Bug] Prevented mentions hidden in display names.** Suppressing the username column alone still allowed `@handle` in first/last names. Normalized these at signs before the existing label escaper; the unit test covers this input. Fixed in `d226a9f`.
- **[Rule 1 - Bug] Updated booking-refusal correction to the shared body.** A stale booking tap must preserve the blocked announcement rather than replace it with collecting copy. Its correction uses the same body selector and replan-control minting helper. Fixed in `4a074d5`.
- Added the real callback-boundary assertions to the existing `planning-replan-telegram.test.ts` harness rather than duplicating that harness inside the service-only replan suite. The requested domain concurrency expectation was updated in `planning-replan.test.ts`.
- The whole-repository lint command has the previously recorded unrelated formatting baseline (including local agent tooling). Only touched files were formatted and checked; unrelated files were preserved.

## Limitations and Next Steps

Telegram delivery remains best effort after durable transitions. When collecting clears the announcement pointer and the subsequent correction edit fails, that old message no longer has a durable retry address. The answer and cooldown remain committed; this plan does not add a delivery outbox or retry worker.

Live Telegram UAT is still pending for notification behavior and message clarity; this summary is automated evidence, not a claim that a person completed UAT. No new dependency, migration, endpoint, or trust boundary was introduced. No implementation stubs or intentionally skipped tests remain.

Actual tokens are the realized production/test/generated diff character count divided by four, rounded up; they are not harness token usage.

## Self-Check: PASSED

All twelve changed production/test/generated files exist, all four task commits resolve, both TDD tasks have RED then GREEN commits, and the final automated evidence is recorded above.
