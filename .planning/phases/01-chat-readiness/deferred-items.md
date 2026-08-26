# Deferred Items — Phase 01 chat-readiness

Out-of-scope discoveries logged during execution. These were NOT fixed, because
they are not caused by the task that found them (executor scope boundary).

## Pre-existing integration failures in `tests/integration/chat-configuration.test.ts`

- **Found during:** 01-24 plan-level verification (full `npm run test:integration`).
- **Failing tests:**
  - `renders committed settings in fixed order and changes planning access only after review`
    — `chat-configuration.test.ts:186`: expected the rendered prompt to contain
    `Choose who can start`, received the `<b>Time zone</b>` edit prompt.
  - `rejects stale, expired, duplicate, and invalid planning-access saves without revision changes`
    — `chat-configuration.test.ts:302`: an invalid planning-access save resolved
    `undefined` instead of rejecting with `Unsupported planning access policy`.
- **Why deferred:** Both failures reproduce identically with `src/telegram/setup-handlers.ts`
  reverted to its pre-01-24 state, on the same worktree and the same database
  container. They live on the `/settings` planning-access surface, which plan
  01-24 does not touch — 01-24 changes `handleSetupCommand` only.
- **Scope:** Belongs to the settings/planning-access surface, not to the `/setup`
  entry-state matrix. Needs its own plan or a `/gsd-debug` session.
- **Not a regression of:** 01-24. `walking-skeleton.test.ts`,
  `chat-readiness.e2e.test.ts`, `roster-repository.test.ts`,
  `schedule-window-repair.test.ts` and the full unit suite all pass.
