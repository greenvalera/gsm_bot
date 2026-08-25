---
phase: 01-chat-readiness
plan: 16
subsystem: telegram
tags: [grammy, telegram, callback-query, answercallbackquery, integration-testing]

# Dependency graph
requires:
  - phase: 01-13
    provides: The single acknowledge-authorize-parse-load-dispatch callback boundary that this plan reorders
provides:
  - A single-shot callback acknowledgement bound to callback_query.id, so the one answer Telegram honours is the one carrying the outcome
  - Reachability for all four Copywriting Contract alert texts (SETUP_STALE_TEXT, GENERIC_STALE_TEXT, CALLBACK_DENIAL, "Already applied.")
  - A boundary-level fallback acknowledgement for branches that choose no outcome text
  - An e2e transport double that models Telegram's one-answer-per-query rule (duplicateAnswers/firstOf/answersFor)
affects: [01-19, 01-20, 01-21, 01-22, availability-card, callback-surfaces]

# Actuals (#2632)
actuals:
  tokens: 21800
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single-shot ctx.answerCallbackQuery override bound to one update, with a guarded try/finally fallback"
    - "Test doubles must model the external API's idempotency/uniqueness rules, not just its success envelope"

key-files:
  created: []
  modified:
    - src/telegram/callbacks.ts
    - tests/integration/chat-readiness.e2e.test.ts
    - tests/integration/walking-skeleton.test.ts
    - tests/integration/chat-configuration.test.ts
    - .planning/PROJECT.md
    - .planning/WINDOWS.md

key-decisions:
  - "A callback is acknowledged exactly once per callback_query.id; the acknowledgement is deferred to the branch that owns the outcome, with a boundary-level fallback when no branch chose a text. The fresh current-role lookup still precedes every token parse and durable read, and unavailable membership evidence still denies fail-closed. Supersedes '[Phase 01]: Protected callbacks acknowledge before a live role lookup; unavailable membership evidence denies access fail-closed.'"
  - "The e2e transport double flags every second answer for one callback_query_id, and boundary assertions read the FIRST answer, so a regression can fail for the right reason."

patterns-established:
  - "Single-shot API guard: bind the original method, override it as an own property for the lifetime of one update, and let the first caller win"
  - "Fallback-in-finally: guard the fallback's own delivery failure so it can never replace or mask an in-flight error from the handler body"

requirements-completed: [AUTH-02, CONF-01, ROST-02]

coverage:
  - id: D1
    description: "The callback boundary issues exactly one answerCallbackQuery per callback_query.id on every exercised path"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#answers every callback exactly once, after a fresh role lookup, with the answer that carries the outcome"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#rejects malformed, missing, expired, cross-chat, cross-actor, duplicate, and demoted callbacks without changing authoritative state"
        status: pass
    human_judgment: false
  - id: D2
    description: "An expired setup action surfaces the verbatim SETUP_STALE_TEXT with show_alert as the first and only answer"
    requirement: "CONF-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#surfaces the setup-specific stale copy as the honoured answer for an expired setup action"
        status: pass
    human_judgment: false
  - id: D3
    description: "A demoted actor tapping any protected button gets the verbatim CALLBACK_DENIAL, after a fresh role lookup and before any token parse or durable action read"
    requirement: "AUTH-02"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#denies a demoted actor with the verbatim callback alert before parsing the token or reading the action"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#denies a callback with a single alert-bearing answer, after its current role check and without mutating a draft"
        status: pass
    human_judgment: false
  - id: D4
    description: "A repeat tap on an already-consumed save action surfaces the verbatim 'Already applied.' as the honoured answer"
    requirement: "CONF-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#rejects malformed, missing, expired, cross-chat, cross-actor, duplicate, and demoted callbacks without changing authoritative state"
        status: pass
    human_judgment: false
  - id: D5
    description: "An unparseable or unresolvable token surfaces the verbatim GENERIC_STALE_TEXT as the honoured answer on settings and roster surfaces"
    requirement: "ROST-02"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#answers every callback exactly once, after a fresh role lookup, with the answer that carries the outcome"
        status: pass
    human_judgment: false
  - id: D6
    description: "A callback whose branch chooses no outcome text is still acknowledged, so no client keeps showing progress"
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#answers every callback exactly once, after a fresh role lookup, with the answer that carries the outcome"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#answers an approved callback exactly once, after the current role lookup"
        status: pass
    human_judgment: false
  - id: D7
    description: "The e2e transport double models Telegram's one-answer-per-query rule and exposes duplicateAnswers/firstOf/answersFor"
    verification:
      - kind: integration
        ref: "npx vitest run --project integration tests/integration/chat-readiness.e2e.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "The superseding acknowledgement decision is recorded so PROJECT.md and STATE.md cannot drift"
    verification:
      - kind: other
        ref: "grep -c 'callback_query' .planning/PROJECT.md"
        status: pass
    human_judgment: true
    rationale: "Only the PROJECT.md half landed. The parallel-wave contract reserves STATE.md writes for the orchestrator, so the superseded STATE.md bullet is still present and must be replaced by hand (tracked as broken window 13). A human must confirm the two documents agree."
  - id: D9
    description: "The four contract alert texts actually appear as private alerts in a live Telegram client"
    verification: []
    human_judgment: true
    rationale: "F-3 was found on a live run and the automated proof is a transport double, not Telegram. Only a live tap can confirm the alert renders. Note the live route to the 'Already applied.' surface is removed by plan 01-19, so the automated replay is the standing gate for that one text."

# Metrics
duration: 14 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 16: Callback Acknowledgement Ordering Summary

**A single-shot `answerCallbackQuery` guard bound to `callback_query.id` makes the one answer Telegram honours the one that carries the outcome, so all four contract alert texts become reachable on every protected surface.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-25T08:16:22Z
- **Completed:** 2026-08-25T08:30:19Z
- **Tasks:** 3 (Task 2 ran RED → GREEN)
- **Files modified:** 6

## Accomplishments

- Removed the unconditional bare pre-answer at `callbacks.ts:111` that silently burned the single answer slot for every callback in the bot, and replaced it with a single-shot guard bound to `ctx.callbackQuery.id`.
- Deferred the bare acknowledgement into a `try/finally` fallback that fires only when no branch chose an outcome text, so a client is never left showing progress — and guarded the fallback's own delivery so it can never replace or mask an in-flight handler error.
- Made all 24 alert-bearing `ctx.answerCallbackQuery({ text, show_alert })` sites reachable without editing any of `setup-handlers.ts`, `settings-handlers.ts` or `roster-handlers.ts` — they all travel through the guard on `ctx`.
- Hardened the e2e transport double to model Telegram's one-answer-per-query rule, then flipped every boundary assertion from the last (discarded) answer to the first (honoured) one, so the suite can no longer ratify this defect.
- Closed broken window 4 (F-3), the phase blocker.

## Task Commits

1. **Task 1: Model Telegram's one-answer-per-query rule in the e2e transport double** — `03db10e` (test)
2. **Task 2 (RED): Assert the honoured answer carries the outcome** — `ef87623` (test)
3. **Task 2 (GREEN): Make the honoured answer the one carrying the outcome** — `106f2ee` (feat)
4. **Task 3: Re-record the acknowledgement decision this fix reinterprets** — `e4deb69` (docs)

No REFACTOR commit: the GREEN implementation is already minimal (one bound method, one boolean, one guarded fallback).

## Files Created/Modified

- `src/telegram/callbacks.ts` — single-shot acknowledgement guard, `try/finally` fallback, updated boundary contract docs. The only `src/` file touched.
- `tests/integration/chat-readiness.e2e.test.ts` — faithful transport double plus `duplicateAnswers()`/`firstOf()`/`answersFor()`; boundary assertions now read the honoured answer; two new regressions (expired setup action, demoted actor).
- `tests/integration/walking-skeleton.test.ts` — two stale gates rewritten (they asserted the removed pre-answer ordering by name and by assertion).
- `tests/integration/chat-configuration.test.ts` — two stale gates that expected two answers per query, plus three position-based call selections that assumed the acknowledgement came first.
- `.planning/PROJECT.md` — superseding acknowledgement decision in the Key Decisions table.
- `.planning/WINDOWS.md` — window 4 marked fixed; window 13 opened for the deferred STATE.md sync.

## Decisions Made

- **The acknowledgement moves; nothing else does.** The fresh `requireCurrentAdministrator` lookup still runs before the token parse, the durable read, and dispatch. Fix direction (b) from the diagnosis was taken over (a): a single-shot guard collapses every branch to one API call, so no per-branch audit of the 24 call sites was needed and no feature handler changed.
- **The fallback is guarded, not bare.** `finally { if (!answered) try { await ctx.answerCallbackQuery() } catch {} }` — an acknowledgement failure must never replace an in-flight error from the body; `bot.catch` stays the terminal seam (mitigates T-01-16-03).
- **`answersFor`/`duplicateAnswers` are cumulative across `reset()`.** A wasted answer stays wasted regardless of which assertion window observed it, which is what makes "no duplicates anywhere in this file" assertable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Two walking-skeleton gates asserted the removed pre-answer ordering**

- **Found during:** Task 2 (GREEN), running the full integration project
- **Issue:** `tests/integration/walking-skeleton.test.ts` had two tests named "acknowledges … before checking its current role" whose assertions (`events.slice(0,2) === ["answerCallbackQuery","membership"]` and a three-event sequence with two answers) encoded the exact defect this plan removes. They went red the moment the guard landed. The plan named only the e2e file, so this second ratifying suite was not anticipated.
- **Fix:** Renamed both tests to state the new contract and rewrote their assertions — role lookup first, exactly one `answerCallbackQuery`, and for the denial path that the single answer is the alert.
- **Files modified:** `tests/integration/walking-skeleton.test.ts`
- **Verification:** `npx vitest run --project integration tests/integration/walking-skeleton.test.ts` — 5 passed.
- **Committed in:** `106f2ee`

**2. [Rule 1 - Bug] Two chat-configuration gates expected two answers per query, and three assertions selected cards by absolute position**

- **Found during:** Task 2 (GREEN), running the full integration project
- **Issue:** Two demoted-actor tests asserted `calls.map(m) === ["answerCallbackQuery","answerCallbackQuery"]` — a direct assertion of the wasted answer. Separately, three `calls.at(-1)` selections assumed the acknowledgement was the *first* call, so with the fallback now last they selected the acknowledgement instead of the rendered card.
- **Fix:** Both method sequences now expect a single answer. The three positional selections go through a local `lastRendered()` helper that skips acknowledgements.
- **Files modified:** `tests/integration/chat-configuration.test.ts`
- **Verification:** File returned to its exact pre-existing baseline — the same 2 failures, at the same assertions, with the same messages as at base commit `d381400` (verified by running the file in the untouched main checkout). The 2 failures introduced by this plan are gone; broken windows 2 and 3 are deliberately left open.
- **Committed in:** `106f2ee`

**3. [Rule 3 - Blocking] Colliding synthetic callback_query ids in the e2e file**

- **Found during:** Task 2 (RED)
- **Issue:** The harness derives `callback_query.id` from `update_id`, and the duplicate-tap block reused ids `2_210`–`2_212`, which `completeSetup(harness, chatId, 2_200)` had already spent. `answersFor("callback-2210")` therefore counted answers from two unrelated taps, making a per-query count unassertable.
- **Fix:** Renumbered that block to `2_220`–`2_227`. Verified every other test's id range is disjoint.
- **Files modified:** `tests/integration/chat-readiness.e2e.test.ts`
- **Verification:** `answersFor("callback-2220")` has length 1; RED failed for the right reason afterwards.
- **Committed in:** `ef87623`

### Deferred (not auto-fixed)

**4. [Rule 3 - Blocking] Task 3's STATE.md edit conflicts with the parallel-wave contract**

- **Found during:** Task 3
- **Issue:** Task 3 requires replacing the superseded `[Phase 01]` acknowledgement bullet in `.planning/STATE.md`. This dispatch runs as a worktree agent in a wave, and its instructions reserve all STATE.md and ROADMAP.md writes for the orchestrator after merge, precisely to avoid sibling-agent conflicts on shared files.
- **Resolution:** PROJECT.md (the durable, plan-owned record) carries the decision. The STATE.md half is handed to the orchestrator via `key-decisions` above and tracked as **broken window 13** so it cannot be silently lost. Exact edit required — remove:
  > `- [Phase 01]: Protected callbacks acknowledge before a live role lookup; unavailable membership evidence denies access fail-closed.`
  and replace with:
  > `- [Phase 01]: A callback is acknowledged exactly once per callback_query.id, deferred to the branch that owns the outcome, with a boundary-level fallback when no branch chose a text; the fresh current-role lookup still precedes every token parse and durable read, and unavailable membership evidence still denies fail-closed.`
- **Files modified:** none (deliberately)

---

**Total deviations:** 3 auto-fixed (2 bugs in stale gates, 1 blocking test-data collision), 1 deferred by contract.
**Impact on plan:** No scope creep into `src/` — `git diff --name-only` confirms `src/telegram/callbacks.ts` is the only source file changed, satisfying acceptance criterion 6. The two auto-fixed test files were unavoidable: they ratified the defect being removed, exactly like the escape cause the plan already identified in the e2e file.

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` (unit) | PASS — 10 files, 52 tests |
| `npx vitest run --project integration tests/integration/chat-readiness.e2e.test.ts` | PASS — 9 tests (7 pre-existing + 2 new regressions) |
| `npx vitest run --project integration --no-file-parallelism` (whole project) | 30 passed, 2 failed — both pre-existing broken windows 2 and 3, byte-identical to the base-commit baseline |
| `npm run format:check` | PASS |
| `git diff --name-only` under `src/telegram/` | `callbacks.ts` only |
| `windows status` | `open_count` 11 → 10 on closing window 4 (then 11 again after opening window 13) |

### Task 2 acceptance criteria

| Criterion | Result |
|---|---|
| Exactly one answerCallbackQuery per callback_query.id on every exercised path | PASS — `duplicateAnswers()` empty in every callback-exercising test |
| Expired setup tap surfaces verbatim SETUP_STALE_TEXT as first and only answer | PASS |
| Non-administrator tap surfaces verbatim CALLBACK_DENIAL after a fresh role lookup | PASS — a Prisma proxy that throws on `callbackAction` access proves no durable read precedes the denial |
| Repeat tap on a consumed save surfaces verbatim "Already applied." as first and only answer | PASS |
| A branch with no text still receives an acknowledgement | PASS |
| No file under `src/telegram` other than `callbacks.ts` modified | PASS |

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree, so nothing could be verified. Resolved by symlinking the main checkout's `node_modules` and running `prisma generate` with a placeholder `DATABASE_URL`. Both paths are gitignored; no tracked file was affected and no package was installed, added or upgraded (threat T-01-16-SC holds — the lockfile is untouched).
- **Running the whole integration project in parallel produces spurious `P1001` container errors.** Four Testcontainers Postgres instances start concurrently and two fail to become reachable. Serial execution (`--no-file-parallelism`) or per-file runs are clean. This is a pre-existing harness characteristic, unrelated to this plan; recorded here so a future run does not misread it as a regression.
- **Broken windows 2 and 3 remain open by design.** Both are pre-existing `chat-configuration.test.ts` failures (a stale keyboard-position expectation and `SettingsService.selectPlanningAccessPolicy` not throwing on an unsupported policy). They are outside this plan's scope; their failure signatures were captured before and after the change to prove this plan neither fixed nor worsened them.

## Known Stubs

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 01-19 (F-2) must run next, as the plan's ordering constraint states.** F-3 is now fixed, which means an expired button that should not be on screen now produces a visible alert instead of silence. 01-19 removes the button. The two together deliver the intended behaviour.
- The `Already applied.` surface has no live route once 01-19 edits the review card away; the automated replay in `chat-readiness.e2e.test.ts` is the standing gate for that contract text.
- **Two items are owed to the orchestrator:** the STATE.md decision bullet replacement (broken window 13, exact wording above), and the usual post-merge STATE.md/ROADMAP.md progress writes.
- A live Telegram tap is still the only proof the alerts render to a real client (coverage D9).

## Self-Check: PASSED

- All 6 modified files present on disk; SUMMARY.md present.
- All 5 commits present on `worktree-agent-a0e9b3734e4a1c4c9`: `03db10e`, `ef87623`, `106f2ee`, `e4deb69`, `b3c74a3`.
- Working tree clean; no untracked artifacts (`node_modules` and `src/generated` are gitignored).

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
