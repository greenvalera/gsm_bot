# Deferred Items — Phase 01 chat-readiness

Out-of-scope discoveries logged during execution. These were NOT fixed, because
they are not caused by the task that found them (executor scope boundary).

## Superseded finding — historical text retained verbatim

The original finding below is retained exactly as recorded for audit. The
subsequent resolution supersedes its open status without erasing that history.

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

## Resolution

### Captured Testcontainers evidence

On 2026-08-28 from 21:59:51Z through 21:59:57Z, Docker 29.7.2 ran
`npx vitest run --project integration tests/integration/chat-configuration.test.ts`
against Testcontainers PostgreSQL. The observed result was **1 test file passed
and 12 tests passed**, including these two assertions by name:

- `renders committed settings in fixed order and changes planning access only after review`
- `rejects stale, expired, duplicate, and invalid planning-access saves without revision changes`

This evidence closes the failures historically cited at
`chat-configuration.test.ts:186` and `chat-configuration.test.ts:302`; current
line numbers have moved as the test gained explicit regression coverage.

### Commit provenance

- `40b77dc` — `test(01-25): address the settings dashboard action by label` —
  replaced the positional `inline_keyboard[0][0]` read with the unique
  `callbackTokenFor(..., "Edit planning access")` label lookup. That test-only
  change closed the dashboard-label assertion without reordering production UI.
- `cfa3ddc` — `test(01-25): pin unsupported policy selection as fail-soft` —
  replaced the inherited throw expectation with an `undefined` expectation plus
  durable before/after assertions. Direct `git show` inspection confirms this
  commit changed only `tests/integration/chat-configuration.test.ts`; it changed
  no production file.

The invalid-policy assertion passes because the test was rewritten to pin the
fail-soft contract, not because `SettingsService.selectPlanningAccessPolicy`
was changed to throw.

Plan 01-28 later added unrelated time-zone-prompt coverage to
`tests/integration/chat-readiness.e2e.test.ts`, not to this test file. Therefore
the present contents or current diff of `chat-configuration.test.ts` are not the
provenance source; the commits above are.

### Contract verdict

The intended invalid-policy contract is **fail-soft**:

1. `SettingsService.selectValue` is designed to return
   `SettingsReview | undefined`; stale, mis-bound, expired, unavailable,
   schedule-invalid, and unsupported values all resolve through the same
   `undefined` rejection surface.
2. `src/telegram/settings-handlers.ts` maps an `undefined` selection review to
   the existing stale private callback alert, so rejection is user-visible
   rather than silent.
3. The rewritten integration assertion proves durable non-mutation of both the
   committed configuration (policy and revision) and the actor-bound draft
   (field, expiry, and replacement payload), then proves the same draft still
   accepts and saves a valid value. An unsupported value therefore cannot pass
   by destroying the workflow.

The only `Unsupported planning access policy.` exception remains on the setup
path in `SetupService.setPlanningAccessPolicy`; it is not the settings-edit
contract. Per D-12, planning-access policy continues to broaden access beyond
current administrators rather than replacing administrator access.

Broken window 16 duplicates broken windows 2 and 3. Those two ledger entries
were already marked fixed on 2026-08-26 at 19:11:59Z and 19:12:04Z,
respectively, minutes after `40b77dc` and `cfa3ddc` landed. Window 16 can now be
closed against this reconciled evidence without pretending a production defect
was fixed.
