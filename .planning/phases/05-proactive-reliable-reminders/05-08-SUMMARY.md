---
phase: 05-proactive-reliable-reminders
plan: "08"
subsystem: reminders
tags: [recovery, postgres, idempotency, grammy, retries]
requires:
  - phase: 05-07
    provides: Acknowledged publication, pending snapshot followups and durable suppression
provides:
  - Latest eligible catch-up selection with durable coalesced, skipped and obsolete dispositions
  - Conservative abandoned reservation recovery preserving potentially delivered spacing
  - Explicit rejection classification and bounded retry ownership with conditional spacing restoration
  - Real queue recreation, concurrent database claims and Telegram callback replay verification
affects: [05-09, 05-10]
tech-stack:
  added: []
  patterns: [Exact observed reservation recovery, Transactional stream coalescing, Conditional spacing restoration]
key-files:
  created: [tests/helpers/reminders.ts, tests/integration/reminder-recovery.test.ts, tests/integration/reminder-delivery.test.ts, tests/integration/reminder-idempotency.test.ts]
  modified: [src/domain/reminders/reminder-service.ts, src/domain/reminders/reminder-occurrences.ts, tests/unit/reminder-occurrences.test.ts]
key-decisions:
  - Coalesce only currently eligible occurrences under the same chat and round locks that reserve the actual send instant.
  - Preserve original scheduled spacing suppression even when a later scan would satisfy actual-time spacing.
  - Treat only an explicit grammY sendMessage 4xx rejection as proven non-delivery; malformed errors, transport errors and server failures remain unknown.
  - Recover exact observed abandoned reservation identities and exclude active ownership across service instances in the one-process deployment.
requirements-completed: [RELI-02, RELI-03, REM-03, REM-05]
coverage:
  - id: bounded-recovery
    description: Recovery delivers the latest eligible missed occurrence within two hours and durably consumes older or suppressed work.
    requirement: RELI-03
    verification:
      - kind: integration
        ref: tests/integration/reminder-recovery.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/reminder-occurrences.test.ts
        status: pass
    human_judgment: false
  - id: conservative-delivery
    description: Unknown delivery is terminal and known rejection retries only within original eligibility and ownership.
    requirement: RELI-02
    verification:
      - kind: integration
        ref: tests/integration/reminder-delivery.test.ts
        status: pass
    human_judgment: false
  - id: replay-and-competing-claims
    description: Independent database clients and repeated real Telegram callbacks preserve one delivery, domain records and revisions.
    requirement: RELI-02
    verification:
      - kind: integration
        ref: tests/integration/reminder-idempotency.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 12319
  tasks: 2
  commits: 6
duration: 15min
completed: 2026-09-13
status: complete
---

# Phase 5 Plan 8: Bounded Recovery and Delivery Ownership Summary

**Latest eligible catch-up reminders survive restart without backlog replay, and only proven non-delivery can retry within the original deadline.**

## Accomplishments

- Added pure `coalesceDueOccurrences`, with inclusive two-hour eligibility and separate obsolete, skipped and coalesced outputs. The service applies these results while holding chat-state and round coordination locks, before claiming the latest eligible occurrence. Generation, lifecycle, publication and current snapshot guards remain authoritative.
- Recovery at 12:00 coalesces accumulated 10:00 and 11:00 work and sends 12:00 once. Real pg-boss queue and service recreation against the same migrated database preserves that result. Expired work, originally grace-blocked rows and old generations cannot become recovery sends.
- A 14:00 catch-up at 15:50 permanently skips 16:00, including when the next scan happens at 16:30; 16:20 remains eligible at the exact 30-minute boundary. Original due-time suppression and actual-attempt spacing are both checked.
- `recoverAbandonedReservations` runs before reconciliation. It observes at most 100 abandoned RESERVED rows, excludes live in-process attempts, then conditionally updates only those exact IDs and attempt IDs to UNKNOWN. It never releases their spacing or emits group recovery notices.
- `classifyReminderDelivery` uses the actual grammY error class, send method and numeric status. Accepted positive message IDs become SENT. Explicit 4xx rejection becomes terminal REJECTED unless a 429 has a valid positive retry interval. Network errors, ambiguous server failures, malformed statuses or malformed success acknowledgments become UNKNOWN.
- A due flood retry reclaims the same occurrence with a new attempt ID, preserves its original due time and rechecks deadline, generation, lifecycle, publication and spacing. Exactly two hours passes; one millisecond beyond it skips. Non-delivery restores prior spacing only under the chat/round locks and current attempt ownership, with an additional newer-potential-delivery check. Unknown results and accepted outcomes with failed persistence remain consumed.
- Two independent Prisma clients racing the same row or different due rows produce one send. Real planning-start, availability and cancellation callbacks traverse `createBot`; repeating identical updates, repeating tokens with new callback IDs, and reconnecting the database preserve records, response values, revision/transition fields and occurrence identities.

## Task Commits

1. **05-08-01: Bounded recovery** — RED `f021501`, GREEN `bff3bc6`.
2. **05-08-02: Delivery and idempotency** — RED `9d9a61f`, additional replay/race RED `7697508`, GREEN `e99cd69`.

The documentation commit contains this summary. The parent orchestrator owns STATE, ROADMAP and requirement-state updates.

## Verification

- Node 24.19: `npm run build` passed after the final implementation.
- `npm test -- tests/unit/reminder-occurrences.test.ts`: **7 passed**.
- Final targeted batch of recovery, delivery, idempotency, followups, tracer and actions: **53 passed across 6 integration files**.
- After adding malformed-status defense and boundary coverage, the full delivery file passed **23 tests**, replacing its previous 19-test pass. Thus the current combined focused evidence is **57 passing tests across those six files**, not a claim of an additional 57-test simultaneous run.
- Required Plan 08 files have passing evidence: recovery 6, idempotency 4, delivery 23, occurrence units 7. Prior followup cases in the same regression batch retain blocked/unblocked and obsolete-lifecycle coverage. Future-only generation behavior remains covered by the unchanged earlier settings implementation and its Plan 06 evidence.
- RED evidence: initial recovery had three expected failures; delivery classification had twelve expected failures; the paused recovery-write race failed before exact-identity cleanup; malformed status failed before numeric validation.
- Changed files formatted with Prettier; scoped `git diff --check` passed. No tracked file deletions.
- Real-DB tests apply committed migrations and queue provisioning through the existing helper. Telegram calls use test transport; no live messages or poller were started.

## Deviations from Plan

**1. [Rule 2 - Missing critical protection] Restrict recovery writes to observed ownership.**
- A broad RESERVED cleanup with a snapshot of active attempt IDs could run late and consume a new reservation created after that snapshot.
- A deterministic paused-write regression reproduced the failure. Cleanup now selects bounded identities and matches both ID and attempt ID, rechecking live ownership before writing.
- Files: reminder service and delivery tests. RED `7697508`, GREEN `e99cd69`.

**2. [Rule 2 - Input validation] Reject malformed status classification.**
- `NaN` bypassed simple numeric range comparisons and could incorrectly release spacing as a known rejection.
- Added integer validation and a failing regression before the fix. Malformed acknowledgment tests also prove conservative consumption.
- Files: reminder service and delivery tests; GREEN `e99cd69`.

**3. [Rule 3 - Shared fixture] Add a focused reminder integration fixture.**
- Added `tests/helpers/reminders.ts` outside the listed production/test paths to share migrated-database fixture setup across all three new suites without duplicating it.
- No production surface change; commit `f021501`.

## Decisions and Residual Risks

- The module-wide active-attempt registry protects independently recreated services within the explicitly single-process deployment. It is not a distributed lease for simultaneously active bot processes. Durable claim/spacing locks still protect competing database clients.
- Plan 09 still owns canonical-chat reminder transfer, migration invalidation and current-card recovery. It must preserve terminal history, original due times, spacing, and previous-attempt metadata. Old-chat payload and full migration behavior are not claimed here.
- Plan 09 also owns draining reconciliation/startup work and full partial-startup cleanup. This plan leaves the existing queue/main runtime contracts unchanged except for the recovery call before generation. Public `recoverAbandonedReservations` can be used by that runtime; it performs bounded cleanup and does not dispatch.
- Network sends remain outside database transactions. An in-flight reservation cannot be retroactively undone by a later lifecycle commit. Unknown delivery intentionally accepts a possible missed reminder; no exactly-once Telegram delivery claim is made.
- Context7 MCP/CLI were unavailable. Error contracts were checked against installed grammY 1.45.1 source and official [grammY error documentation](https://grammy.dev/guide/errors) and [Bot API response parameters](https://core.telegram.org/bots/api#responseparameters).
- No new dependencies, schema, endpoints or trust boundaries. No credentials, participant text or raw error payloads are added to logs.

## Self-Check: PASSED

- All seven source/test files listed above exist; all five task commit hashes exist.
- No TODO, FIXME, placeholder, skipped-test or unrun task verification deliverable remains in the changed files. Filtered diagnostic test invocations were followed by complete file runs.
- Existing unrelated configuration, migration-lock and agent-runtime changes were preserved.
- Both tasks have RED commits preceding GREEN commits; no plan-level TDD gate is missing.

Actuals use `ceil(realized source/test diff characters / 4)` across `f021501^..e99cd69`: 49,274 characters, 12,319 estimated tokens. They are not harness token usage.
