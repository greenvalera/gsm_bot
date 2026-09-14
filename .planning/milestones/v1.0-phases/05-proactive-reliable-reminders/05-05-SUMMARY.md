---
phase: 05-proactive-reliable-reminders
plan: "05"
subsystem: reminders
tags: [telegram, authorization, callbacks, prisma]
requires:
  - phase: 05-04
    provides: Calendar-correct weekly occurrence reservation and reconciliation
provides:
  - Week-labelled planning reminders with persisted opaque public Start capabilities
  - Current-policy authorization and transaction-coupled reminder consumption
affects: [05-06, 05-08, 05-10]
tech-stack:
  added: []
  patterns: [Public capability with fresh authorization, Transaction-coupled callback consumption]
key-files:
  created: [src/telegram/reminder-renderers.ts, tests/unit/reminder-renderers.test.ts, tests/integration/reminder-actions.test.ts, tests/integration/reminder-start.test.ts]
  modified: [src/domain/reminders/reminder-service.ts, src/shared/callback-schema.ts, src/app/main.ts, src/telegram/handlers.ts, src/telegram/planning-handlers.ts, src/domain/planning/planning-service.ts, tests/integration/reminder-tracer.test.ts, tests/integration/reminder-weekly.test.ts]
key-decisions:
  - The actual initialized bot Telegram ID is publisher identity only; the freshly authorized clicker remains the planning author.
  - Capability consumption and round creation/resume commit together; duplicate attempts cannot mint another set of planning controls.
  - Reuse the existing exhaustive PLANNING route and its route-resolved actor binding without adding a callback enum or migration.
requirements-completed: [REM-01, REM-02, RELI-02]
actuals:
  tokens: 8562
  tasks: 2
  commits: 5
duration: 10min
completed: 2026-09-13
status: complete
---

# Phase 05 Plan 05: Public Planning Reminder Actions Summary

Planning reminders now display the target week and a Start planning button whose opaque capability rechecks current policy and starts or resumes that exact week once.

## Accomplishments

- Pure rendering names the Monday and Sunday dates, provides one Start planning button, and includes no participant mentions.
- The occurrence reservation transaction persists a PLANNING capability before transport. Its target names the durable occurrence and target week; the wire token contains only a UUID and stays below Telegram's 64-byte limit. Reservation locking ensures one capability per occurrence and reuse when a known-rejection policy restores PENDING.
- Composition calls bot.init before reading botInfo.id, supplies that real publisher identity, and uses the renderer for weekly sends. Initialization failure disconnects Prisma. No live Telegram calls or poller were started during verification.
- The shared authorizePlanningStart helper preserves /plan's current role, configured policy and previous-participant checks. Reminder clicks use that helper through the existing exhaustive callback route. Unknown and departed membership fail closed.
- PlanningService.startOrResume accepts an optional reminder context. Its transaction locks the capability, revalidates chat/expiry/occurrence/current manual target week, consumes the action, and creates or resumes the draft. Failed creation rolls back consumption. Repeats cannot create another round or mint more planning controls. Reminder paths skip unrelated housekeeping before validation.
- Wrong-chat, expired, stale-week and claimed-week actions acknowledge once without redirecting into a later week. The existing callback boundary remains the single acknowledgement owner and fallback.

## Task Commits

1. Task 05-05-01 RED: e17b8eb — specify opaque planning reminder rendering.
2. Task 05-05-01 GREEN: f03466d — publish week-bound opaque reminder capabilities.
3. Task 05-05-02 RED: 71fbb8e — specify current-policy reminder start authorization.
4. Task 05-05-02 GREEN: 564d2cb — authorize and atomically consume reminder start actions.
5. Documentation completion commit follows this self-check.

## Verification

- Node 24.19.0; TypeScript noEmit and focused Prettier checks passed.
- Full unit suite: 376 passed across 29 files, including the new pure renderer test.
- Real PostgreSQL capability, tracer and weekly suites: 14 passed. Capability coverage checks persistence before transport, publisher ID, timezone-correct expiry, concurrent occurrence dispatch, recreated service and retry capability reuse.
- Real PostgreSQL reminder-start and existing planning-recovery suites: 55 passed, including 13 reminder tests. Coverage includes administrator-only, anyone and prior-participant policy; policy changes after send; departed/unknown membership; duplicate updates and callback IDs; wrong chat; exact expiry; stale/claimed week; current draft resume; and transaction rollback on failed round insertion.
- Disposable test databases apply the committed application migrations and reviewed queue provisioning through the existing helper. A test fixture's redundant nested chatId was corrected after Prisma rejected it; the final expanded suite passes.
- No tracked files deleted. No new placeholder implementation, skipped tests or unrun plan verification commands remain.

## Deviations from Plan

- **[Rule 2 - Correctness] Transaction-coupled start required a narrow PlanningService change.** Consuming in the Telegram handler before calling startOrResume could strand an action on failure, while ordinary resume remints controls on every retry. The optional reminder context keeps existing /plan calls unchanged and consumes alongside the durable result. Parent explicitly confirmed this necessary extension. Fixed in 564d2cb.
- **[Rule 3 - Composition] main.ts was omitted from the file list despite required renderer wiring.** Added actual bot initialization and publisher identity, rendering, and initialization-failure pool cleanup. Existing tracer/weekly test constructors now supply a test bot identity. Fixed in f03466d and 564d2cb.
- callbacks.ts required no source edit: its existing PLANNING registration is already exhaustive and route-resolved, and dispatchPlanningCallback handles the new dedicated target parser.

## TDD Gate Compliance

Both tasks have RED commits followed by GREEN commits. The renderer RED failed because its module did not yet exist; the callback RED had two expected behavior failures before dispatch existed. The capability integration test was added during Task 1 GREEN rather than before implementation, so that portion did not independently observe RED. Final real-database capability behavior is verified.

## Coverage Boundaries and Residual Risks

REM-01 and REM-02 coverage here concerns reminder presentation, authorized entry, exact target binding and existing suppression regressions. Calendar generation belongs to 05-04 and lifecycle hooks to 05-06. RELI-02 coverage here concerns occurrence capability uniqueness and callback start/resume idempotency; the broader phase includes other transitions and delivery policies.

Known-rejection retry classification remains assigned to 05-08. This plan verifies capability reuse by restoring PENDING in the fixture; it does not claim that classifier is already installed. Unknown sends remain consumed under the existing service policy, without guaranteed exactly-once Telegram delivery. For a nonexistent next-Monday midnight, capability expiry conservatively precedes the boundary. Live Telegram presentation acceptance remains assigned to end-of-phase verification.

Context7 tools and ctx7 CLI were unavailable. The [official grammY Bot reference](https://grammy.dev/ref/core/bot) confirms botInfo availability after explicit initialization; the existing pinned APIs and source contracts were reused.

STATE and ROADMAP updates are owned by the parent orchestrator to avoid overlapping writes.

## Self-Check: PASSED

All four newly created implementation/test files exist; all four task commit hashes exist in local history. Automated checks above passed against the committed implementation. Summary is written at the required path.
