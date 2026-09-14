---
phase: 01-chat-readiness
plan: 24
subsystem: telegram
tags: [grammy, prisma, postgres, testcontainers, vitest, setup-wizard]

# Dependency graph
requires:
  - phase: 01-chat-readiness
    provides: "01-18's SetupDraft.expectedRevision binding, which makes a wizard opened on a configured chat savable instead of doomed to a revision conflict"
  - phase: 01-chat-readiness
    provides: "01-22's redaction-safe setup surface and its requireActive/beginOrResume split in SetupService"
provides:
  - "A four-state `/setup` entry projection: unconfigured first entry, live resume, lapsed draft, and configured re-entry"
  - "Real-PostgreSQL command-level coverage of every one of those states on its own chat"
  - "A composed-bot regression proving `/setup` after a committed save and a bot restart opens a revision-bound wizard"
affects: [live-verification, uat, planning-rounds]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4).
actuals:
  tokens: 19000
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Durable-state classification before mutation: `/setup` calls requireActive first and only creates a draft on `missing`"
    - "Positive committed-row read as the branch oracle for configured-vs-unconfigured copy"
    - "One chat id per durable entry state in integration tests, so no case inherits another's rows"
    - "Positive keyboard-shape assertions (exact rows and labels) rather than absence-only checks"

key-files:
  created: []
  modified:
    - src/telegram/setup-handlers.ts
    - tests/integration/walking-skeleton.test.ts
    - tests/integration/chat-readiness.e2e.test.ts

key-decisions:
  - "Read ChatConfiguration AFTER beginOrResume, so the existence check and the draft's expectedRevision observe the same committed row"
  - "The expired branch mutates nothing further — requireActive already deleted the lapsed row and a same-update replacement would discard collected values"
  - "No setup-mode flag and no schema field: the four states are already fully determined by the SetupDraft and ChatConfiguration rows"
  - "Broken window 15 stays open — the code path is fixed and covered, but UAT test 22 is a live-Telegram check this plan cannot perform"

patterns-established:
  - "Entry-state matrix: a command that branches on durable state gets one deterministic projection per state, each pinned by its own test"
  - "RED confirmation by reverting only the implementation file and re-running the new tests, proving they fail for the intended reason"

requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-05, AUTH-02]

coverage:
  - id: D1
    description: "Authorized `/setup` in a configured chat with no draft creates a revision-bound draft and renders `Setup in progress` / `Step 1 of 8`, never the unconfigured sentence"
    requirement: "CONF-01"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#opens a revision-bound wizard directly when the chat is already configured"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster"
        status: pass
    human_judgment: false
  - id: D2
    description: "A second `/setup` by the owner of a live draft renders that draft's exact current step, preserving its id, collected values, and expectedRevision"
    requirement: "CONF-02"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#resumes a live draft at its exact current step without resetting it"
        status: pass
    human_judgment: false
  - id: D3
    description: "`/setup` after the actor's draft TTL returns the setup-expiry sentence, leaves no draft row, and creates no replacement draft or action in that update"
    requirement: "CONF-03"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#reports the setup expiry and starts no mutation once the draft lapses"
        status: pass
    human_judgment: false
  - id: D4
    description: "The unconfigured first entry keeps the original bold readiness focal point and mints exactly one `Start setup` action"
    requirement: "CONF-05"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#creates one actor-bound draft and sends the readiness prompt on first entry"
        status: pass
    human_judgment: false
  - id: D5
    description: "Current-administrator authorization still precedes every setup/configuration read; a denied actor creates no draft"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#denies non-administrators without creating a draft"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#fails closed when current membership evidence is unavailable"
        status: pass
    human_judgment: false
  - id: D6
    description: "F-11 / broken window 15 confirmed closed in the real Telegram client (UAT test 22)"
    verification: []
    human_judgment: true
    rationale: "The plan's own success criteria hold UAT test 22 pending until the final live Telegram re-run. No integration test observes the real client, and the live run is the evidence the window was opened by."

# Metrics
duration: 14 min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 24: State-Aware `/setup` Entry Summary

**`/setup` now classifies durable state before mutating anything — a configured chat opens a revision-bound Step 1 wizard instead of being told it is not configured (F-11), a live draft resumes at its exact step, and a lapsed draft reports expiry without silently replacing itself.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-26T18:48:00Z
- **Completed:** 2026-08-26T19:02:26Z
- **Tasks:** 2
- **Files modified:** 3 (plus 1 planning artifact created)

## Accomplishments

- Closed the F-11 code path: `handleSetupCommand` calls `requireActive` before creating anything, so the unconfigured readiness card is emitted only for the one state it actually describes.
- Bound the configured re-entry to the committed revision, so the eight steps a re-configuring administrator walks now end in a save rather than 01-18's conflict branch.
- Turned the walking-skeleton suite's stale repeated-readiness expectation into a four-state matrix, each state on its own chat id with one deterministic projection.
- Extended the migrated e2e so `/setup` after a committed save *and* a bot reconstruction is proven to open the wizard from PostgreSQL alone.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer, TDD RED): failing test for configured `/setup` entry** — `6b2e4ef` (test)
2. **Task 1 (tracer, TDD GREEN): project durable state on every `/setup` entry** — `55498a5` (feat)
3. **Task 2 (TDD): lock the `/setup` entry-state matrix** — `6491ce8` (test)

_Task 2 needed no production change: the state machine it locks was built by the tracer, and its RED was confirmed by reverting the implementation file (see TDD Gate Compliance)._

## Files Created/Modified

- `src/telegram/setup-handlers.ts` — `handleSetupCommand` now branches on `requireActive` (`expired` → expiry copy and no further mutation; `active` → `replyWithStep` on the draft's current step; `missing` → `beginOrResume`, then a positive `chatConfiguration.findUnique` decides between Step 1 and the readiness card).
- `tests/integration/walking-skeleton.test.ts` — four durable entry states on four chat ids; `messageUpdate` takes an optional chat id; a non-throwing `keyboardRows` helper enables positive keyboard-shape assertions.
- `tests/integration/chat-readiness.e2e.test.ts` — post-restart `/setup` regression with an exact-empty keyboard assertion and an `expectedRevision`-vs-committed-revision check; added a non-throwing `keyboardRowsOf` helper.
- `.planning/phases/01-chat-readiness/deferred-items.md` — created, recording out-of-scope pre-existing failures (below).

## Decisions Made

- **Committed-row read placed after `beginOrResume`.** `beginOrResume` internally reads the active revision to bind `expectedRevision`. Reading the configuration afterwards means the branch decision and the binding observe the same row; a save that lands between them then surfaces as the genuine conflict it is, rather than as a card that is quietly wrong.
- **The expired branch creates nothing.** `requireActive` already deletes the lapsed row. Calling `beginOrResume` in the same update would hand the actor a blank Step 1 while telling them their setup expired — discarding what they had collected under cover of an expiry message.
- **No setup-mode flag, no schema change.** The four states are already fully determined by `SetupDraft` and `ChatConfiguration`. Nothing was pushed to Prisma; `prisma/`, `package.json`, and `package-lock.json` are byte-identical to the base commit.
- **Broken window 15 left `open`.** The plan's success criteria keep UAT test 22 pending until the live Telegram re-run, and the window was opened by that live run. Closing it from an integration-green state would remove the very gate that would catch a discrepancy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies and generated the Prisma client in the fresh worktree**

- **Found during:** Task 1 (before the RED run)
- **Issue:** The worktree had no `node_modules` and no `src/generated/prisma` (both gitignored), so neither `tsc` nor `vitest` could run at all.
- **Fix:** `npm ci` against the committed lockfile, then `DATABASE_URL=… npx prisma generate`. The `DATABASE_URL` was a throwaway local value needed only because `prisma.config.ts` resolves it at config load; `prisma generate` performs no connection.
- **Files modified:** None tracked — both outputs are gitignored.
- **Verification:** `npm run build` clean on the untouched base tree before any edit.
- **Committed in:** N/A (no tracked files changed)

**2. [Rule 1 - Bug] Repaired three walking-skeleton tests that encoded the F-11 behavior**

- **Found during:** Task 1 (GREEN)
- **Issue:** `creates then resumes one actor-bound draft and sends the readiness prompt` asserted the readiness card for a *second* `/setup` — precisely the falsehood this plan removes. Two callback tests then harvested their `Start setup` token from a `/setup` that, correctly, no longer mints one once a draft exists.
- **Fix:** The first test became a first-entry assertion with an exact single-button keyboard check; the two callback tests clear the chat's draft first so they really are first entries. The resume assertion the old test gestured at is now its own case in Task 2's matrix, with real values to preserve.
- **Files modified:** `tests/integration/walking-skeleton.test.ts`
- **Verification:** All 6 walking-skeleton tests plus all 9 e2e tests pass; both suites confirmed to fail without the implementation.
- **Committed in:** `55498a5`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Neither expands scope. The first is worktree environment setup that leaves no tracked change; the second is the plan's own stated intent — the stale expectation Task 2 was commissioned to replace.

## Out of Scope (Deferred)

`npm run test:integration` surfaces two failures in `tests/integration/chat-configuration.test.ts` on the `/settings` planning-access surface. Both were confirmed **not** caused by this plan: they reproduce identically with `src/telegram/setup-handlers.ts` reverted to its pre-01-24 state, on the same worktree and container. Per the executor scope boundary they were logged, not fixed:

- `.planning/phases/01-chat-readiness/deferred-items.md` (full detail)
- `.planning/WINDOWS.md` — appended as an open `unmet-truth` entry so they remain visible at ship time.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|---|---|---|---|---|
| 1 (tracer) | `6b2e4ef` | `55498a5` | — | Pass |
| 2 | `6491ce8` | n/a | — | Pass (see note) |

Task 2 produced no `feat(01-24)` commit because it required no production change — Task 1's tracer had already built the full state machine its `<action>` describes. Rather than record an unverified gate, Task 2's RED was demonstrated explicitly: `src/telegram/setup-handlers.ts` was restored to its pre-Task-1 content and the suites re-run. All four new or extended cases failed, each with the F-11 symptom:

- configured entry, resume, and post-restart e2e: `expected '<b>Set up rehearsal planning</b>' to be 'Setup in progress'`
- expiry: `expected '<b>Set up rehearsal planning</b>\nThi…' to be 'This setup expired after 30 minutes o…'`

The implementation file was then restored with `git checkout -- src/telegram/setup-handlers.ts` and the tree verified clean against `HEAD`.

## Tracer Feedback Gate

Task 1 is a `type="tracer"`. Its `<verify>` was re-run end to end after its commit and before any Task 2 work: `npx vitest run --project integration --no-file-parallelism tests/integration/walking-skeleton.test.ts` (6/6) and `npm run build` (clean). The plan carries `autonomous: true` and the project runs `workflow.human_verify_mode: end-of-phase`, so the passing automated gate advanced execution rather than halting for mid-flight sign-off; the live confirmation is carried forward as coverage entry D6 / UAT test 22.

## Verification Results

| Check | Result |
|---|---|
| `npm run build` | Pass (clean `tsc --noEmit`) |
| `npx vitest run --project integration --no-file-parallelism tests/integration/walking-skeleton.test.ts tests/integration/chat-readiness.e2e.test.ts` | Pass — 17/17 |
| `npm run format:check` | Pass — all files match Prettier style |
| No Prisma migration or package manifest changed | Confirmed — `git diff base..HEAD -- prisma package.json package-lock.json` is empty |
| `npm run test:unit` | Pass — 74/74 |
| `npm run test:integration` (full) | 34/36 — the 2 failures are the pre-existing `chat-configuration.test.ts` cases deferred above |

## Issues Encountered

None beyond the deviations and the deferred pre-existing failures recorded above.

## Known Stubs

None. No `TODO`, `FIXME`, placeholder value, skipped test, or unwired data source was introduced. (Two `placeholder` matches in the e2e file are pre-existing prose comments describing the `Looking up time zone…` in-flight message, not stubs.)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The F-11 code path is closed and pinned by real-PostgreSQL coverage of all four entry states, including after a bot reconstruction.
- **Blocker for phase sign-off:** UAT test 22 stays pending and broken window 15 stays `open` until the live Telegram re-run confirms the fix in the real client. That re-run is the remaining work for AC-5.
- **Carried forward, untouched by this plan:** the owner-deferred N-6 text-input card replacement, UAT test 16's pagination check, and the two deferred `chat-configuration.test.ts` failures.

## Self-Check: PASSED

- `src/telegram/setup-handlers.ts` — FOUND
- `tests/integration/walking-skeleton.test.ts` — FOUND
- `tests/integration/chat-readiness.e2e.test.ts` — FOUND
- `.planning/phases/01-chat-readiness/deferred-items.md` — FOUND
- Commit `6b2e4ef` — FOUND
- Commit `55498a5` — FOUND
- Commit `6491ce8` — FOUND

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-26*
