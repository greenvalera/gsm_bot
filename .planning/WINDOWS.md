---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-08-20T10:41:17.877Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | tests/integration/chat-configuration.test.ts |  | chat-configuration integration suite could not run because Testcontainers found no container runtime. | open |  | 2026-08-20T10:41:17.877Z |  |

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
  }
]
````
