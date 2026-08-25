---
schema_version: 1
open_count: 10
waived_count: 0
fixed_count: 2
total_count: 12
last_updated: 2026-08-25T08:29:29.263Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | tests/integration/chat-configuration.test.ts |  | chat-configuration integration suite could not run because Testcontainers found no container runtime. | fixed |  | 2026-08-20T10:41:17.877Z | 2026-08-24T11:27:29.003Z |
| 2 | 01 | deviation | tests/integration/chat-configuration.test.ts | 175 | Inherited failure: test reads inline_keyboard[0][0] expecting the planning-access button, but the 01-08/01-09 dashboard renders Edit time zone first. Stale test expectation, deferred to the phase regression gate. | open |  | 2026-08-21T09:11:58.906Z |  |
| 3 | 01 | deviation | tests/integration/chat-configuration.test.ts | 291 | Inherited failure: SettingsService.selectPlanningAccessPolicy resolves undefined for an unsupported policy instead of throwing 'Unsupported planning access policy'. Deferred to the phase regression gate. | open |  | 2026-08-21T09:11:59.053Z |  |
| 4 | 01 | deviation | src/telegram/callbacks.ts |  | F-3 (live-verify, critical): no private callback alert is ever shown, so 4 verbatim contract texts are unreachable. Silent failure - bot.catch stays quiet because no error is thrown. Blocks AC-5; isolated fix in callbacks.ts. Fix FIRST. | fixed |  | 2026-08-24T11:23:14.607Z | 2026-08-25T08:29:29.263Z |
| 5 | 01 | deviation | src/telegram/handlers.ts |  | F-7 (live-verify, critical): bot replies with the admin-denial text to an ordinary non-admin message - in a live group, to every one. Fix is check ordering in two handlers.ts branches. CAUTION: draft must be deleted BEFORE the denial is shown, or AC-4 breaks. | open |  | 2026-08-24T11:23:14.753Z |  |
| 6 | 01 | deviation | src/telegram/settings-handlers.ts |  | F-5 (live-verify, functional dead end): Edit daily boundaries collects only the start value; the daily end is permanently unreachable from the UI after setup. Existing pattern to follow: the two-field pair used by reminders. | open |  | 2026-08-24T11:23:14.887Z |  |
| 7 | 01 | deviation | src/domain/chat/schedule-validator.ts |  | F-6 (live-verify, validation): no defaultStart >= dailyStart check. A schedule where rehearsal starts an hour before the window opens is already committed in the database as evidence. | open |  | 2026-08-24T11:23:15.023Z |  |
| 8 | 01 | deviation | src/telegram/setup-handlers.ts |  | F-2 (live-verify, contract): setup wizard does not replace its card - each step appends a new one and leaves the previous buttons live. Coupled to F-3. Existing pattern to follow: editMessageText as used in settings and roster. | open |  | 2026-08-24T11:23:15.158Z |  |
| 9 | 01 | deviation | src/telegram/setup-handlers.ts |  | F-1 (live-verify, UX): wizard steps 3/5/6 do not say which time is being entered. Owner's original complaint on the live run. Existing pattern to follow: the leading sentence already used in step 7. | open |  | 2026-08-24T11:23:15.302Z |  |
| 10 | 01 | deviation | src/telegram/roster-renderers.ts |  | F-8 (live-verify, contract): empty-roster surface is missing its final line 'Reply to a member's message, then send /roster_add.' Header and body match the contract. | open |  | 2026-08-24T11:23:15.447Z |  |
| 11 | 01 | deviation | src/telegram/keyboards.ts |  | F-9 (live-verify, UI): truncated label 'Previous particip...' caused by 3 buttons in one row on setup step 8. Existing pattern to follow: one button per row as used in the dashboard. | open |  | 2026-08-24T11:23:15.595Z |  |
| 12 | 01 | unrun-verify | src/telegram/callbacks.ts |  | F-4 (live-verify, observability): no logging at all on the update path - all 6 logger calls live in src/app/main.ts and cover lifecycle only. Runbook step 2e (no raw coordinates in logs) therefore passes only VACUOUSLY, and silent failures like F-3 are undetectable. Redaction itself is genuinely covered by tests/unit/logger.test.ts:105-144 and the allow-list in src/shared/logger.ts:21-50. Non-blocking for the phase. | open |  | 2026-08-24T11:23:32.784Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "tests/integration/chat-configuration.test.ts",
    "line": null,
    "description": "chat-configuration integration suite could not run because Testcontainers found no container runtime.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-20T10:41:17.877Z",
    "resolved_at": "2026-08-24T11:27:29.003Z"
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "01",
    "file": "tests/integration/chat-configuration.test.ts",
    "line": 175,
    "description": "Inherited failure: test reads inline_keyboard[0][0] expecting the planning-access button, but the 01-08/01-09 dashboard renders Edit time zone first. Stale test expectation, deferred to the phase regression gate.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T09:11:58.906Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "01",
    "file": "tests/integration/chat-configuration.test.ts",
    "line": 291,
    "description": "Inherited failure: SettingsService.selectPlanningAccessPolicy resolves undefined for an unsupported policy instead of throwing 'Unsupported planning access policy'. Deferred to the phase regression gate.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-21T09:11:59.053Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/callbacks.ts",
    "line": null,
    "description": "F-3 (live-verify, critical): no private callback alert is ever shown, so 4 verbatim contract texts are unreachable. Silent failure - bot.catch stays quiet because no error is thrown. Blocks AC-5; isolated fix in callbacks.ts. Fix FIRST.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:14.607Z",
    "resolved_at": "2026-08-25T08:29:29.263Z"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/handlers.ts",
    "line": null,
    "description": "F-7 (live-verify, critical): bot replies with the admin-denial text to an ordinary non-admin message - in a live group, to every one. Fix is check ordering in two handlers.ts branches. CAUTION: draft must be deleted BEFORE the denial is shown, or AC-4 breaks.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:14.753Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/settings-handlers.ts",
    "line": null,
    "description": "F-5 (live-verify, functional dead end): Edit daily boundaries collects only the start value; the daily end is permanently unreachable from the UI after setup. Existing pattern to follow: the two-field pair used by reminders.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:14.887Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "01",
    "file": "src/domain/chat/schedule-validator.ts",
    "line": null,
    "description": "F-6 (live-verify, validation): no defaultStart >= dailyStart check. A schedule where rehearsal starts an hour before the window opens is already committed in the database as evidence.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:15.023Z",
    "resolved_at": null
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/setup-handlers.ts",
    "line": null,
    "description": "F-2 (live-verify, contract): setup wizard does not replace its card - each step appends a new one and leaves the previous buttons live. Coupled to F-3. Existing pattern to follow: editMessageText as used in settings and roster.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:15.158Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/setup-handlers.ts",
    "line": null,
    "description": "F-1 (live-verify, UX): wizard steps 3/5/6 do not say which time is being entered. Owner's original complaint on the live run. Existing pattern to follow: the leading sentence already used in step 7.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:15.302Z",
    "resolved_at": null
  },
  {
    "id": 10,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/roster-renderers.ts",
    "line": null,
    "description": "F-8 (live-verify, contract): empty-roster surface is missing its final line 'Reply to a member's message, then send /roster_add.' Header and body match the contract.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:15.447Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "deviation",
    "phase": "01",
    "file": "src/telegram/keyboards.ts",
    "line": null,
    "description": "F-9 (live-verify, UI): truncated label 'Previous particip...' caused by 3 buttons in one row on setup step 8. Existing pattern to follow: one button per row as used in the dashboard.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:15.595Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/telegram/callbacks.ts",
    "line": null,
    "description": "F-4 (live-verify, observability): no logging at all on the update path - all 6 logger calls live in src/app/main.ts and cover lifecycle only. Runbook step 2e (no raw coordinates in logs) therefore passes only VACUOUSLY, and silent failures like F-3 are undetectable. Redaction itself is genuinely covered by tests/unit/logger.test.ts:105-144 and the allow-list in src/shared/logger.ts:21-50. Non-blocking for the phase.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-24T11:23:32.784Z",
    "resolved_at": null
  }
]
````
