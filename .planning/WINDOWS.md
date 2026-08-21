---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-08-21T09:11:59.053Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | tests/integration/chat-configuration.test.ts |  | chat-configuration integration suite could not run because Testcontainers found no container runtime. | open |  | 2026-08-20T10:41:17.877Z |  |
| 2 | 01 | deviation | tests/integration/chat-configuration.test.ts | 175 | Inherited failure: test reads inline_keyboard[0][0] expecting the planning-access button, but the 01-08/01-09 dashboard renders Edit time zone first. Stale test expectation, deferred to the phase regression gate. | open |  | 2026-08-21T09:11:58.906Z |  |
| 3 | 01 | deviation | tests/integration/chat-configuration.test.ts | 291 | Inherited failure: SettingsService.selectPlanningAccessPolicy resolves undefined for an unsupported policy instead of throwing 'Unsupported planning access policy'. Deferred to the phase regression gate. | open |  | 2026-08-21T09:11:59.053Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "tests/integration/chat-configuration.test.ts",
    "line": null,
    "description": "chat-configuration integration suite could not run because Testcontainers found no container runtime.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-20T10:41:17.877Z",
    "resolved_at": null
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
  }
]
````
