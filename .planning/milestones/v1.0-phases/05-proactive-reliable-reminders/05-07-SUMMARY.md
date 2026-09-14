---
phase: 05-proactive-reliable-reminders
plan: "07"
subsystem: reminders
tags: [telegram, prisma, publication, snapshot, followups]
requires:
  - phase: 05-06
    provides: Transactional schedule generations and lifecycle invalidation
provides:
  - Guarded first and current availability publication acknowledgments
  - Pending snapshot followups with original-due grace and atomic same-round spacing
  - Permanent suppression of due reminders when unblocking before reconciliation
  - Escaped bounded mentions and current-card navigation for supported group types
affects: [05-08, 05-09, 05-10]
tech-stack:
  added: []
  patterns: [Acknowledgment after external success, Shared round advisory lock, Transactional suppression reconstruction]
key-files:
  created: [tests/integration/reminder-publication.test.ts, tests/integration/reminder-followups.test.ts]
  modified: [src/domain/planning/planning-service.ts, src/telegram/planning-handlers.ts, src/domain/reminders/reminder-service.ts, src/telegram/reminder-renderers.ts, src/app/main.ts, tests/unit/reminder-renderers.test.ts, tests/integration/planning-recovery.test.ts]
key-decisions:
  - Record publication only after external success for the exact current chat and availability anchor; ordinary reanchors preserve first and recovered migration grace.
  - Materialize due occurrences as obsolete during unblock so missed worker scans cannot revive work suppressed while blocked.
  - Preserve every pending mention by shortening escaped labels; consume known unsendable content without reserving delivery spacing.
requirements-completed: [REM-03, REM-04, REM-05]
coverage:
  - id: publication
    description: Failed publication stays silent; acknowledged recovery establishes durable grace for the current availability card.
    requirement: REM-03
    verification:
      - kind: integration
        ref: tests/integration/reminder-publication.test.ts
        status: pass
    human_judgment: false
  - id: followups
    description: Only pending snapshot participants receive followups, with blocked, lifecycle, start, grace and spacing suppression.
    requirement: REM-04
    verification:
      - kind: integration
        ref: tests/integration/reminder-followups.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/reminder-renderers.test.ts
        status: pass
    human_judgment: false
  - id: navigation
    description: Telegram clients show usable public/private supergroup links and basic-group native reply navigation.
    requirement: REM-04
    verification:
      - kind: unit
        ref: tests/unit/reminder-renderers.test.ts
        status: pass
    human_judgment: true
    rationale: Plan 10 must observe native clients; link/reply payload tests do not establish live client behavior.
actuals:
  tokens: 13070
  tasks: 2
  commits: 6
duration: 16min
completed: 2026-09-13
status: complete
---

# Phase 5 Plan 7: Publication and Pending Followups Summary

**Acknowledged availability cards enable bounded pending-member followups with durable grace, spacing, and blocked-round suppression.**

## Accomplishments

- Successful availability edits, recognized Telegram not-modified responses and guarded status reposts acknowledge the exact availability anchor. Failed sends, failed pointer persistence, another chat and announcement pointers cannot enable reminders. Legacy rounds require successful recovery. Ordinary reanchors preserve grace, including after a migrated card has been recovered.
- Reconciliation reconstructs configured followup times for immutable confirmed rounds. Claim reloads the authoritative snapshot, shares chat/round coordination with answers and checks current status, start instant, acknowledged anchor, original-due publication grace and actual-attempt spacing. Exactly 30 minutes passes; rehearsal-start equality is silent.
- Pending identities use the same display ordering as availability cards, regardless of response query order or live roster changes. Mentions contain real Telegram user IDs with escaped labels. The renderer preserves every mention within a conservative encoded-HTML limit and records unsendable content without silently dropping participants or splitting messages.
- Production transport resolves current Telegram chat metadata and sends public username links, documented private-supergroup links or basic-group native replies to the current card. Answer controls remain on the card.
- Unblocking materializes the bounded past recovery window as obsolete in the answer transaction. This prevents a scheduler that missed the blocked interval from reviving its occurrences. Future scheduled times remain eligible.

## Task Commits

1. **05-07-01: Publication acknowledgment** — RED `84fba09`; GREEN `08b7345`.
2. **05-07-02: Pending followups** — RED `6f9a919`; additional failing recovery regression `4ae7644`; GREEN `e55508f`.

The final documentation commit contains this summary. Parent orchestrator owns STATE, ROADMAP and requirement-state updates.

## Verification

- Node 24.19; `npm run build` passed.
- `npm test` passed: **380 tests across 29 unit files**.
- Focused renderer verification passed: **5 tests**.
- Required real-PostgreSQL publication and followup files passed in the final targeted batch: **7 publication tests and 18 followup tests**.
- Targeted reminder, availability and planning-recovery regression batch: **120 passed, 1 failed** initially. The sole failure was the stale-draft race fixture described below. After correcting its interception point, the entire **42-test planning-recovery file passed**. The remaining 79 tests passed in the original batch; no unexplained failure remains.
- Changed files were formatted with Prettier. An unrelated existing blank line in `.codex/config.toml` was reported by whole-working-tree `git diff --check`; this plan did not change that file.
- Tests use committed database migrations and mocked Telegram transport; no live messages or additional poller were started.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical integration] Wire production followup transport.**
- `src/app/main.ts` was outside the declared task file lists but is required to make the feature operational.
- Added current-chat metadata lookup and HTML/reply send composition through the existing runtime coordinator.
- Explicitly authorized by parent orchestrator; commit `e55508f`.

**2. [Rule 1 - Bug] Prevent unblocking from reconstructing suppressed due work.**
- A real-DB test proved that changing the unavailable answer before any worker scan revived the blocked 10:00 reminder at 10:20.
- Materialize and obsolete the bounded due window in the same answer transaction, with chat-state lock preceding round advisory lock. The dispatcher now takes the same round advisory lock as availability updates.
- Files: planning service, reminder service and followup tests. RED `4ae7644`, GREEN `e55508f`.

**3. [Rule 3 - Blocking fixture compatibility] Restore stale-reaper race interception.**
- Plan 06 moved stale-round updates inside a transaction. The older planning-recovery test intercepted only direct delegate updates, so its competing write never ran and anchor 100 remained instead of expected 101.
- Switched that test to the existing transactional interference helper. Kept the competing write, supersession, anchor and double-revision assertions intact. Parent explicitly authorized this compatibility fix.
- File: `tests/integration/planning-recovery.test.ts`; commit `e55508f`; 42 tests passed after correction.

## Decisions and Residual Risks

- Followups are an optional dependency for existing isolated planning-reminder compositions, but production supplies both current-chat lookup and send implementations.
- Original scheduled due time determines grace eligibility even during downtime; skipped occurrences are terminal. Potentially delivered unknown sends retain spacing.
- No new dependencies, schema or trust boundaries were introduced. Diagnostics contain bounded reason codes and identifiers, not participant labels or credentials.
- Plan 08 still owns latest-occurrence recovery coalescing, classified known rejection retry, and fuller crash schedules. This summary does not claim those later deliverables are complete.
- Plan 09 owns real group-migration state transfer. Here migration publication tests simulate its documented cleared-anchor/grace marker contract.
- Native Telegram Web mention/link/reply behavior remains Plan 10 live verification, especially basic-group reply navigation. No live-client pass is asserted.
- Context7 MCP and CLI were unavailable. Telegram APIs were checked against the official [Bot API](https://core.telegram.org/bots/api#sendmessage) and [message-link documentation](https://core.telegram.org/api/links#message-links), plus installed grammY types.

## Self-Check: PASSED

- Both new integration files and all listed implementation files exist.
- Commits `84fba09`, `08b7345`, `6f9a919`, `4ae7644` and `e55508f` exist.
- No new implementation stubs, skipped tests or unrun task verification commands remain. Native-client testing belongs to the explicitly subsequent Plan 10.
- No tracked file deletions in task commits. Existing unrelated runtime/configuration artifacts were preserved.

## TDD Gate Compliance

Both tasks have failing RED commits followed by GREEN implementation commits. The additional unblock regression was observed failing before its fix.

Actual token estimate is `ceil(realized source/test diff characters / 4)` over `84fba09^..e55508f`: 52,278 characters, 13,070 estimated tokens. It is not a harness token count.
