---
phase: 05-proactive-reliable-reminders
plan: "04"
subsystem: reminders
tags: [civil-time, dst, prisma, reconciliation]
requires:
  - phase: 05-03
    provides: Durable reservation service and periodic queue reconciliation
provides:
  - Bounded civil occurrence enumeration and pure current-state eligibility
  - Current-week daily planning reminders generated from persisted activation
affects: [05-05, 05-06, 05-07, 05-09]
tech-stack:
  added: []
  patterns: [Civil recurrence with instant boundaries, Database conflict-safe occurrence insertion]
key-files:
  created: [src/domain/reminders/reminder-occurrences.ts, src/domain/reminders/reminder-policy.ts, tests/unit/reminder-occurrences.test.ts, tests/unit/reminder-policy.test.ts, tests/integration/reminder-weekly.test.ts]
  modified: [src/domain/reminders/reminder-service.ts, tests/integration/reminder-tracer.test.ts]
key-decisions:
  - DST gaps are skipped and overlaps select the earlier instant once, an implementation assumption from research.
  - Reconstruction covers the inclusive two-hour recovery window through tomorrow's civil day, never pre-generating next week's planning reminders.
  - Compound occurrence identities use createMany skipDuplicates to make concurrent reconstruction conflict-safe.
requirements-completed: [REM-01, REM-02, REM-03, RELI-03]
actuals:
  tokens: 5963
  tasks: 2
  commits: 5
duration: 9min
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 04: Calendar-Correct Weekly Reminders Summary

Planning reminders now reconstruct current-week 10:00 work from durable activation, suppress active drafts and claimed weeks, and reserve delivery against freshly loaded state.

## Accomplishments

- Pure occurrence enumeration reuses CivilDate arithmetic, MinuteOfDay and resolveWallClock. It sorts and deduplicates follow-up minutes, skips gaps, chooses earlier overlaps, preserves fixed rehearsal cutoff instants, and rejects candidates at or before the current generation boundary.
- Pure eligibility distinguishes active drafts from confirmed/booked claims. It uses current local Monday independently of manual lookahead, honors quietUntil and migration/generation guards, and exposes follow-up publication, spacing, start and authoritative availabilityOutcome checks for the next plan.
- Reconciliation reads configured chats with persisted reminder state in keyset pages of 100, generates only a bounded civil horizon, inserts immutable identities with database conflict handling, and dispatches at most 100 due ledger rows per wake. Boot and durable periodic wakeups already invoke this service.
- Reservation reevaluates the shared policy after acquiring the chat-state lock. Existing consumed identities remain consumed across recreated service instances and repeated wakeups. Current-week suppression does not chase a future manually selectable week.

## Commits

- eeb72b6: RED civil recurrence and eligibility tests; both suites failed for missing modules.
- a5fa9e0: GREEN pure calendar and policy implementation.
- 966915e: RED durable weekly reconciliation tests; eight tests failed before generation existed.
- 084747a: GREEN bounded weekly generation and conflict-safe insertion.
- Documentation completion commit follows self-check.

## Verification

- Node 24.19.0; TypeScript noEmit passed.
- Focused calendar and policy suites: ten tests passed.
- Real PostgreSQL weekly and tracer suites: thirteen tests passed, including eight new weekly cases. Committed application migrations and reviewed pg-boss provisioning were applied by the existing disposable database helper.
- Full unit suite: 375 tests passed across 28 files. Existing manual planning tests remain unchanged.
- Focused Prettier formatting passed. No tracked file deletions introduced.
- Coverage includes Monday/Sunday/year boundaries, exact setup time, persisted activation across months offline, inclusive two-hour recovery, duplicates, DST gap/overlap, timezone generation changes, fixed rehearsal cutoff, unavailable-before-pending, publication grace and attempt-spacing boundaries, draft/confirmed/booked suppression, next Monday resumption, concurrency and reservation-time draft revalidation.

## Deviations from Plan

**[Rule 1 - Bug] Compound upsert could race during concurrent reconstruction.** The new real-database test reproduced P2002 when both reconcilers attempted the same absent identity. Replaced client-side upsert with createMany and skipDuplicates, preserving the unique ledger identity through PostgreSQL conflict handling. Verified by rerunning concurrent reconciliation and recreated-service delivery tests. Fixed in 084747a. Context7 MCP and CLI were unavailable; the [official Prisma 7 API reference](https://www.prisma.io/docs/orm/v7/reference/prisma-client-reference) documents both the upsert race and skipDuplicates semantics.

**[Rule 3 - Blocking compatibility] Tracer count assertion assumed no future generation.** Narrowed its uniqueness count to the current due identity, preserving its original duplicate check while allowing the newly required tomorrow row. Tracer behavior passes unchanged otherwise. Fixed in 084747a.

## Scope and Remaining Phase Work

Requirement metadata records plan traceability, not phase-wide completion. REM-01/REM-02 weekly delivery is implemented here; REM-03 has pure recurrence/eligibility building blocks, while follow-up reconciliation, authoritative recipient delivery and lifecycle integration remain Plan 05 and subsequent plans. RELI-03 weekly reconstruction is tested here; follow-up recovery coalescing and delivery classification remain later work. The service still deliberately leaves FOLLOW_UP rows unclaimed until those planned integrations land. This is an explicit sequencing boundary, not an unimplemented weekly capability.

The calendar can prepare tomorrow within the current week, but never next week before Monday. Future rows have no delivery authority: reservation reloads configuration and lifecycle state. Cancel/settings mutation hooks remain owned by later plans; this plan already respects their persisted quiet/generation boundaries. No additional authentication, network endpoint, schema or logging surface was introduced. No skipped tests, TODOs, or blocking stubs were introduced.

Execution used the parent's documented isolation-none fallback for the configured harness mismatch. Parent owns STATE, ROADMAP and phase-wide requirement updates. Existing unrelated dirty files were preserved.

## Self-Check: PASSED

All seven source/test files exist. All four RED/GREEN commit hashes were checked in git history, with each RED preceding its GREEN. The summary exists on disk. Focused real-database tests, all units and typechecking passed.
