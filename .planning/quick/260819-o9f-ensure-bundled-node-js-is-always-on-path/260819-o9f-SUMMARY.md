---
quick_id: 260819-o9f
status: complete
commit: b9a576f
---

# Summary

Added a trusted project-scoped Codex configuration that prepends the desktop app's bundled Node.js directory to the shell `PATH` for new sessions.

## Verification

- Bundled runtime: Node.js `v24.19.0`.
- `codex --strict-config --version`: passed; project configuration parsed successfully.
- `codex doctor --json`: `config.load` reported `ok` for this project directory.

The current running session retains its original environment; the configured `PATH` applies when a new session starts.
