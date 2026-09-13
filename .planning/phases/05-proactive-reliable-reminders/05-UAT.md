---
status: testing
phase: 05-proactive-reliable-reminders
source: [05-VERIFICATION.md, 05-10-SUMMARY.md]
started: 2026-09-13T01:46:08Z
updated: 2026-09-13T01:46:08Z
---

# Phase 05 — Native Telegram Acceptance

## Current Test

number: 1
name: Native planning reminder and Start authorization
expected: |
  The planning reminder names the current chat-local week without participant mentions.
  An authorized Start click opens or resumes the expected planning flow as the clicker.
  Unauthorized, stale and repeated clicks receive one clear acknowledgement and cannot create duplicate plans.
awaiting: native verification via gsd-verify-work 5

## Tests

### 1. Native planning reminder and Start authorization
expected: A real reminder names the current chat-local week without mentions. Current-policy authorized Start opens/resumes the correct flow; unauthorized, stale and replayed actions are safely acknowledged once. Record unavailable retired keyboards as a client limitation rather than fabricating a stale-click pass.
result: [pending]

### 2. Pending mentions and current-card navigation
expected: Follow-ups visibly mention only unanswered round participants and navigate to the current availability card. Verify available basic-group reply, public-supergroup and private-supergroup fixtures separately. Record push/sound observations separately from Web rendering; unavailable variants remain unresolved or explicitly waived.
result: [pending]

### 3. Live grace, restart recovery and obsolete suppression
expected: A freshly acknowledged card receives its publication grace; one restart produces at most one relevant catch-up within the permitted lateness window and respects spacing. Replanning, completion, cancellation and other obsolete states suppress old work. Use real elapsed time and one existing bot service; do not change the system clock or create a second poller.
result: [pending]

### 4. Fixture restoration and scoped acceptance
expected: Capture and restore settings, roster, roles and other temporary fixture changes. Cancel only test-created plans and preserve messages/history. Record before/after evidence and obtain explicit acceptance or specific residual waivers; no unobserved case is a pass.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Resume Context

- Automated implementation and verification are complete through source `8f2ffda`; final code review is clean and all 31 authored security mitigations are closed. `05-VALIDATION.md` distinguishes the 448-test full integration baseline from final affected checks; 381 units, types, formatting and Docker builds passed.
- Plan 05-10 remains at task 05-10-02. Its summary is explicitly `status: checkpoint`. Phase 5 and its seven requirements remain pending acceptance.
- Use `.codex/skills/gsd-verify-work/SKILL.md`, `.codex/skills/telegram-web-uat/SKILL.md` and the active runtime's browser skill. Read the Phase 4 continuation reference and current accepted Phase 4 evidence; preserve prior narrow waivers without extending them.
- Previously scoped fixture: `GSM_bot_test_group`, current migrated supergroup Bot API ID `-1004358185686`; actors A (`@greensmilemind`) and B (`@greenvaleratest`) only. Reconfirm the current signed-in account, group and baseline before live actions. Historical baseline values are not current-state proof.
- Execution only inspected browser availability and the existing service. It sent no live Telegram commands, changed no fixture settings, did not deploy the new image, and did not restart the existing bot/database. Existing history and volume remain intact. No Phase 5 live behavior or restoration is claimed observed.
- The images were built but not deployed to the running test service. Verify the running revision and migration readiness before testing new reminder behavior. Preserve the single-poller contract.
- Write a dated live report only when native verification actually runs, including Europe/Kyiv local time, actor, controls, outcomes and restoration. Link it from `05-LIVE-TEST.md` and update these subcases incrementally.

## Gaps

No implementation gap was identified by final verification. Native evidence is pending, not failed. Generic acknowledgment or approval alone does not establish these observations.
