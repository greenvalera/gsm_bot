---
phase: 01-chat-readiness
plan: 22
subsystem: telegram
tags: [observability, error-handling, redaction, non-vacuity, grammy, pino, live-verification]

# Dependency graph
requires:
  - phase: 01-21
    provides: The required SafeLogger on all three feature handler dependency interfaces, the bounded route table, and the non-vacuity guard file this plan extends
  - phase: 01-14
    provides: The redacting logger whose `err` key makes a bound exception loggable at all, and the live run that found F-4
provides:
  - Twelve bound-and-classified catch clauses across the three feature handler modules, plus a thirteenth at the callback boundary
  - A count-based structural gate over `src/telegram` that fails on the first reintroduced black hole, ordered existential-before-absence
  - Runbook step 2e and UAT test 6 rewritten to prove emission before asserting absence, with the vacuous 2026-08-24 pass struck and superseded
  - The missing execution record for plan 01-14, recorded honestly as NOT APPROVED
  - Broken window 12 closed; G-01-6 fully closed
affects: [live-verification, phase-verification, availability-card]

# Actuals (#2632)
actuals:
  tokens: 13500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "An unbound `catch` is not merely unlogged, it is UNLOGGABLE: the redactor renders an error structurally only under `err`, so binding the value is a precondition for observability, not a style preference"
    - "Classify the failure in the emitted FIELDS, not in a comment: expected-input rejections and infrastructure failures carry different levels and different outcomes, so an operator can filter one from the other"
    - "A rejection clause still binds and logs its error, because a genuine infrastructure failure can hide behind an ordinary typo when one `try` spans both a parse and a durable write"
    - "Bounded log vocabularies declared next to the surface they describe, typed against the closed route union via a TYPE-ONLY import so no runtime import cycle is created"
    - "Structural gates assert the positive existential FIRST — a count-based absence claim over an unread directory is vacuously true"

key-files:
  created:
    - .planning/phases/01-chat-readiness/01-14-SUMMARY.md
  modified:
    - src/telegram/setup-handlers.ts
    - src/telegram/settings-handlers.ts
    - src/telegram/roster-handlers.ts
    - src/telegram/callbacks.ts
    - tests/unit/update-path-logging.test.ts
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
    - .planning/phases/01-chat-readiness/01-UAT.md
    - .planning/WINDOWS.md

key-decisions:
  - "A thirteenth unbound catch — the fallback-acknowledgement clause in callbacks.ts — was bound too. The plan enumerated twelve, but its own acceptance criterion and verify command require ZERO unbound clauses under src/telegram. It also matters on its own merits: nothing is rethrown there, so bot.catch never sees it, and in the common case that line is the only evidence the user's client was left showing a spinner."
  - "Rejection sites log at debug and still bind the error under `err`. The reminder clause in setup-handlers spans both parseLocalTime and a durable enterReminderTime write, so a driver failure can hide behind a typo; the bound error is what keeps the second case distinguishable."
  - "projectRoster and failedProjection take an explicit route parameter. They are shared by command:roster and callback:ROSTER_REMOVE and could not otherwise name the caller in a log line; both are internal to roster-handlers.ts with no external callers."
  - "Route ids reach the feature modules through a TYPE-ONLY import of ChatReadinessRouteId. handlers.ts imports these modules as values, so a value import would create a runtime cycle around CHAT_READINESS_ROUTES initialization; `import type` is erased and keeps the compile-time bound with no cycle."
  - "The roster surface has no expected-rejection class at all — it takes no free-text input — so all five of its sites emit at error level."
  - "UAT test 6 was reset to `pending` rather than flipped to `pass`. The code is instrumented, but the test is a LIVE check and no live run has happened against the fixed build; marking it passed would repeat the exact error the plan exists to correct."

patterns-established:
  - "Bind, classify, then recover: the recovery path is unchanged, but the exception is recorded before it runs"
  - "A gate that reads no files must FAIL, not pass — assert the existential before the absence, and re-assert it inside the absence test"

requirements-completed:
  [
    CONF-01,
    CONF-02,
    CONF-03,
    CONF-05,
    ROST-01,
    ROST-02,
    ROST-03,
    AUTH-01,
    AUTH-02,
  ]

coverage:
  - id: D1
    description: All twelve enumerated catch clauses bind their exception and emit exactly one log line each, with the recovery path and every user-facing string unchanged
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: tests/unit/update-path-logging.test.ts#finds at least twelve catch clauses that bind their error
        status: pass
      - kind: other
        ref: "String-literal diff of all four modified src/telegram files against HEAD~3 — additions only, zero removals or modifications"
        status: pass
      - kind: unit
        ref: "npm test — 13 files / 73 tests, and npx vitest run --project integration --no-file-parallelism — 31 passed / 2 pre-existing failures, both identical to the fork-point baseline"
        status: pass
    human_judgment: false
  - id: D2
    description: Expected-input rejections and infrastructure/delivery failures are emitted at different levels and carry different bounded outcomes
    requirement: CONF-01
    verification:
      - kind: other
        ref: "src/telegram/{setup,settings}-handlers.ts — logSetupRejection/logSettingsRejection emit at debug with the `field` being collected; logSetupFailure/logSettingsFailure and logRosterFailure emit at error. Verified by reading each of the 13 call sites against its declared catch-site record."
        status: pass
      - kind: other
        ref: "npm run build (tsc --noEmit) — the `as const satisfies Record<string, {route: ChatReadinessRouteId; outcome: string}>` constraint proves every declared site names a member of the closed route union"
        status: pass
    human_judgment: false
  - id: D3
    description: The structural gate asserts at least twelve error-binding catch clauses BEFORE it asserts zero unbound ones, and fails if either half is unmet
    verification:
      - kind: unit
        ref: tests/unit/update-path-logging.test.ts#finds at least twelve catch clauses that bind their error
        status: pass
      - kind: unit
        ref: tests/unit/update-path-logging.test.ts#leaves no catch clause that discards its exception
        status: pass
      - kind: other
        ref: "RED evidence — the same regexes and floor applied to (a) the pre-change roster-handlers.ts: bound=0/unbound=5, both halves FAIL; (b) an EMPTY directory: absence half PASSES vacuously while the existential half FAILS, which is precisely the defect the ordering closes"
        status: pass
    human_judgment: false
  - id: D4
    description: No identifier is passed as an object, and no message text, callback token, raw update or resolved IANA zone appears in any emitted field
    requirement: CONF-01
    verification:
      - kind: unit
        ref: tests/unit/update-path-logging.test.ts#never lets the shared coordinates or the resolved zone reach a log line
        status: pass
      - kind: other
        ref: "Every new field is a bigint, a number, or a member of a declared `as const` vocabulary; the caught value is passed only under `err`, never stringified into a message or an allow-listed key. Verified by reading all 13 call sites."
        status: pass
    human_judgment: false
  - id: D5
    description: Runbook step 2e and UAT test 6 require a positive emission check to succeed before the coordinate/zone absence check may be run at all
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md — step 2e, two ordered parts with the blocking rule stated in the step text; the 2026-08-24 pass struck through, labelled vacuous, and citing .planning/debug/no-update-path-logging.md"
        status: pass
      - kind: manual_procedural
        ref: ".planning/phases/01-chat-readiness/01-UAT.md — test 6 expectation rewritten existential-first; result reset issue → pending; Summary counts reconciled (11 pass + 6 issues + 1 pending + 3 skipped = 21)"
        status: pass
    human_judgment: false
  - id: D6
    description: Plan 01-14 has an execution record linking all nine of its findings to the plan that closed each, and claiming nowhere that its live verification passed
    verification:
      - kind: other
        ref: "node .claude/gsd-core/bin/gsd-tools.cjs uat classify-coverage --summary .planning/phases/01-chat-readiness/01-14-SUMMARY.md — errors: []; D5 routes to human_judgment with an empty verification list, so it can never be auto-classified as covered"
        status: pass
      - kind: other
        ref: "node .claude/gsd-core/bin/gsd-tools.cjs verify-summary .planning/phases/01-chat-readiness/01-14-SUMMARY.md — passed: true"
        status: pass
      - kind: other
        ref: "All nine finding → gap-id → window-id → closing-commit rows verified individually against git log and the windows ledger"
        status: pass
    human_judgment: false
  - id: D7
    description: Broken window 12 is closed, and every window opened by the live run (4-12) is fixed or waived with a reason
    verification:
      - kind: other
        ref: "node .claude/gsd-core/bin/gsd-tools.cjs windows status — fixed_count 10, waived_count 1, open_count 2; the 2 open are windows 2 and 3, the inherited chat-configuration.test.ts failures, which predate the live run"
        status: pass
    human_judgment: false
  - id: D8
    description: In a live Telegram group at LOG_LEVEL=info, the rewritten step 2e actually finds a route-bearing line before the coordinate grep, and a real Telegram delivery failure produces an operator-usable error line
    verification: []
    human_judgment: true
    rationale: "Every proof in this plan is a fake Prisma with an in-memory pino destination, plus static analysis of the source. NOTHING here exercises a real Telegram API failure or a real deployed process writing to real stdout — and F-4 was found on a live run precisely because the automated evidence looked fine. The twelve converted clauses are also, by construction, only reached when something genuinely fails; none of them fires on a happy path, so no test in this suite drives one end to end. Only the live re-run against the corrected runbook can confirm the check is now probative."

# Metrics
duration: 22 min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 22: Bound Exceptions and a Non-Vacuous Log Check Summary

**Twelve catch clauses that discarded their exception — including two roster delivery black holes whose own comments admitted Telegram delivery had failed — now bind, classify and log it, so the composition root's `bot.catch` seam can finally fire; the manual coordinate check was rewritten to prove emission before asserting absence; and plan 01-14 finally has an execution record that says plainly its live verification was NOT approved.**

## Performance

- **Duration:** 22 min (across an API session-limit interruption; all three task commits landed before it)
- **Started:** 2026-08-25T22:18Z
- **Completed:** 2026-08-26T02:35Z
- **Tasks:** 3
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments

- **Closed the neutralised seam.** Exactly one update-path error seam is wired — `bot.catch` in `main.ts` — and plan 01-21 confirmed it reachable. It had never fired, because twelve catch clauses converted every failure into user-facing copy and dropped the exception. Since the redactor renders an error structurally **only** under `err`, an unbound exception was not merely unlogged but *unloggable*. All twelve now bind and emit.
- **Gave the two black holes a voice.** `roster-handlers.ts` had two clauses whose comments read "Telegram delivery itself failed; there is no further recovery to attempt" — and then discarded the only evidence that it had. Both now emit an error line naming the route, the chat, the actor and the bound error.
- **Classified the failures in the fields, not in prose.** Expected-input rejections (a malformed time, a malformed duration, a malformed reminder) emit at **debug** with the `field` being collected and a rejection outcome; infrastructure and delivery failures emit at **error**. Both classes still carry the bound error under `err`, so a driver failure hiding behind an ordinary typo stays visible.
- **Bound a thirteenth clause the plan did not enumerate.** The fallback-acknowledgement `catch` in `callbacks.ts` sits in a `finally` and rethrows nothing, so `bot.catch` never sees it — in the common case its line is the *only* evidence the user's client was left spinning.
- **Added a structural gate that cannot pass vacuously.** It asserts at least twelve error-binding clauses under `src/telegram` **before** asserting zero unbound ones, reads each file whole so a reformatted clause cannot slip past, and is count-based so a single reintroduction fails it.
- **Made the manual check probative.** Runbook step 2e is now two ordered parts with the ordering rule stated in the step text: an emission check that FAILS the step outright if the log is empty, and only then the coordinate and zone absence check. UAT test 6 was rewritten the same way and reset to `pending`.
- **Wrote the missing 01-14 record** — honestly, as `status: halted`, with its live verification recorded NOT APPROVED.
- **Closed broken window 12**, completing G-01-6.

## Task Commits

1. **Task 1: Bind every discarded exception and classify what it means** — `6511332` (feat)
2. **Task 2: Make the manual log check prove emission before absence** — `b465588` (docs)
3. **Task 3: Write the missing execution record for plan 01-14** — `0cd2843` (docs)

**Plan metadata:** the `docs(01-22)` commit carrying this file.

## Files Created/Modified

- `src/telegram/setup-handlers.ts` — catch-site vocabulary (`SETUP_CATCH_SITES`) plus `logSetupRejection`/`logSetupFailure`; 3 sites converted (resolver failure at error; schedule-value and reminder-value rejections at debug).
- `src/telegram/settings-handlers.ts` — `SETTINGS_CATCH_SITES` plus the same helper pair; 4 sites converted (dashboard binding, resolver failure, edit-begin at error; text-value rejection at debug).
- `src/telegram/roster-handlers.ts` — `ROSTER_CATCH_SITES` plus `logRosterFailure`; 5 sites converted, all at error. `projectRoster` and `failedProjection` gained an explicit `route` parameter so the two shared helpers can name their caller.
- `src/telegram/callbacks.ts` — added the `fallbackAcknowledgementFailed` branch to `CALLBACK_BOUNDARY_BRANCHES` and bound the 13th clause.
- `tests/unit/update-path-logging.test.ts` — the `telegram layer exception binding` describe block: the existential test and the absence test, sharing a whole-file scanner. Regexes are declared **without** the `g` flag and recompiled per use, because a global regex carries `lastIndex` between calls and would silently skip matches — a stateful false negative inside the very gate written to prevent false negatives.
- `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` — step 2e rewritten; the old pass struck through and labelled vacuous; AC-2 and the F-4 handover row corrected.
- `.planning/phases/01-chat-readiness/01-UAT.md` — test 6 rewritten and reset to pending; Summary counts reconciled.
- `.planning/phases/01-chat-readiness/01-14-SUMMARY.md` — **created.** The retroactive record (see below).
- `.planning/WINDOWS.md` — window 12 closed.

## What 01-14-SUMMARY.md records as NOT verified

This matters because phase verification reads that file as evidence, so it was written to be read that way.

- **`status: halted`, not `complete`.** Its Task 1 (redacting logger, CI, validation map) is delivered. Its Task 2 — the blocking live-Telegram checkpoint — **executed on 2026-08-24 and returned NOT APPROVED**: AC-5 failed, AC-2/AC-3/AC-4 partial, nine findings F-1…F-9. The plan's fourth `must_haves` truth is explicitly recorded as unsatisfied and still open.
- **Deliverable D5 (the live verification) carries `verification: []` and `human_judgment: true`** with a rationale stating it is not satisfied. `uat classify-coverage` therefore routes it to a human and can never auto-pass it — verified: `errors: []`, D5 in `present`, not in `auto_passed`.
- **Every AC is recorded with its real result**, including the two branches deliberately skipped by owner decision (multi-candidate timezone; post-roster restart), which are recorded as skipped-by-decision rather than as passes, and AC-4's command branch, which is recorded as *inconclusive* because F-7 produced the same refusal without any demotion.
- **A stale inconsistency is surfaced rather than patched.** `01-VALIDATION.md` Evidence Gap #1 still reads "has not run", contradicting the runbook's own closing note that the run happened. `nyquist_compliant: false` is correct either way, but the stated reason is stale; repairing that file is outside this plan's declared file set and is left to phase verification.
- **No statement anywhere in the file claims the live verification passed.** This was checked explicitly as the last self-check item.

## Decisions Made

See the `key-decisions` frontmatter. The load-bearing ones: the 13th clause was bound because the plan's own gate demands zero unbound; rejection sites still bind their error because one `try` can span a parse and a durable write; route ids arrive via a **type-only** import to keep the compile-time bound without a runtime cycle; and UAT test 6 was reset to `pending` rather than `pass`, because the code is instrumented but no live run has happened against it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] A thirteenth unbound catch clause survived the plan's enumeration**

- **Found during:** Task 1
- **Issue:** The plan names twelve sites across the three feature modules. `src/telegram/callbacks.ts` held a fourteenth-line `} catch {` in the boundary's `finally`, guarding the bare fallback acknowledgement. The plan's own acceptance criterion and `<verify>` command require **zero** unbound clauses under `src/telegram`, so leaving it would have failed the plan's verification.
- **Fix:** Bound it, added a `fallbackAcknowledgementFailed` branch to the existing `CALLBACK_BOUNDARY_BRANCHES` vocabulary, and emitted at error level with `updateId`, `chatId` and the bound error. Control flow is unchanged — nothing is rethrown, so the in-flight outcome still owns the update.
- **Files modified:** `src/telegram/callbacks.ts`
- **Verification:** `unbound=0` across `src/telegram`; the structural gate's absence half passes.
- **Committed in:** `6511332`

**2. [Rule 3 - Blocking] `projectRoster`/`failedProjection` could not name their route**

- **Found during:** Task 1
- **Issue:** Both helpers are shared by `command:roster` and `callback:ROSTER_REMOVE`, so neither could emit a correct bounded `route` without knowing its caller.
- **Fix:** Added an explicit `route: ChatReadinessRouteId` parameter to both and threaded it from the two call sites. Both are internal to `roster-handlers.ts`; `grep` confirms no external caller in `src/` or `tests/`.
- **Files modified:** `src/telegram/roster-handlers.ts`
- **Verification:** `npm run build` clean; unit and integration suites at baseline.
- **Committed in:** `6511332`

**3. [Rule 1 - Bug] The structural gate's own regexes were stateful**

- **Found during:** Task 1
- **Issue:** The scan patterns were first written with the `g` flag and used with `.test()` across several files. A global regex carries `lastIndex` between calls, so the offender scan would have silently skipped matches — a false negative inside the gate written to prevent false negatives.
- **Fix:** Declared both patterns without `g` and recompiled per use; documented why in the file.
- **Files modified:** `tests/unit/update-path-logging.test.ts`
- **Verification:** RED evidence below still detects all 5 pre-change clauses.
- **Committed in:** `6511332`

**4. [Rule 3 - Blocking] The plan's Task 2 verify command names a schema that does not exist**

- **Found during:** Task 2
- **Issue:** `frontmatter validate … --schema uat` fails with `Unknown schema: uat. Available: plan, plan-gap-closure, summary, verification`. This gsd-core build has no `uat` schema, so the command can never succeed.
- **Fix:** Not worked around and not silently dropped. The UAT was validated by the checks that actually exist: test headings counted (21), `result:` lines tallied per class, and the `## Summary` block reconciled against them (11 pass + 6 issues + 1 pending + 3 skipped = 21). One `result: pass` match is prose inside an HTML comment, not a test — which is why the tally reads 22 raw matches for 21 tests.
- **Files modified:** none (verification method only)
- **Verification:** counts reconcile exactly; `windows status` half of the same command passes.
- **Committed in:** `b465588`

**5. [Deferred - out of scope] The runbook is written in Ukrainian, against the CLAUDE.md documentation-language rule**

- **Found during:** Task 2
- **Issue:** `CLAUDE.md` requires all project and planning documentation in English. `01-LIVE-VERIFICATION-RUNBOOK.md` is entirely Ukrainian (by design — bot texts are quoted verbatim in English, explanations in Ukrainian), which predates this plan.
- **Decision:** The plan explicitly instructed the rewritten step to "match the language and formatting of the surrounding runbook steps". Writing one step in English inside an otherwise Ukrainian operator procedure would fragment the document mid-checklist without bringing it into compliance. The new step was written in Ukrainian to match; translating the whole file is a separate, out-of-scope task. **Recorded here rather than silently resolved** — this is a real, unresolved tension, not a closed question.
- **Files modified:** `01-LIVE-VERIFICATION-RUNBOOK.md` (step 2e, AC-2 row, F-4 row)

**6. [Scope] ROADMAP.md reconciliation deferred to the orchestrator**

- **Found during:** Task 3
- **Issue:** Task 3 instructs "Reconcile the roadmap entry for 01-14". The parallel-wave contract reserves `ROADMAP.md` for the orchestrator.
- **Fix:** Not edited. The exact replacement line is handed over in `01-14-SUMMARY.md` → "Owed to the orchestrator — ROADMAP.md reconciliation", and repeated below.
- **Files modified:** none

---

**Total deviations:** 4 auto-fixed (1 missing-critical, 2 blocking, 1 bug), 2 recorded-not-fixed (1 deferred out-of-scope, 1 orchestrator-owned).
**Impact on plan:** No scope creep. Deviations 1-3 were required for the plan's own verification to pass. Deviations 4-6 are recorded honestly rather than worked around.

## Verification Results

| Check | Result |
|---|---|
| `npm run build` (tsc --noEmit) | PASS |
| `npm test` (unit) | PASS — 13 files, 73 tests (fork-point baseline 13 / 71; +2 from the structural gate) |
| `npx vitest run --project integration --no-file-parallelism` | 31 passed, 2 failed — **byte-identical to the fork-point baseline** (broken windows 2 and 3) |
| `npm run format:check` | PASS |
| Structural greps: `bound` / `unbound` under `src/telegram` | `bound=16`, `unbound=0` (13 converted + 3 pre-existing bound clauses) |
| Gate RED (a): pre-change `roster-handlers.ts` | `bound=0`, `unbound=5` — **both halves FAIL** |
| Gate RED (b): empty directory | absence half **PASSES vacuously**, existential half **FAILS** — the ordering is what catches it |
| String-literal diff, all 4 `src/telegram` files | additions only; **zero** removals or modifications — user-facing copy byte-identical |
| Unit stdout grepped for the new event names | 0 lines — the silent-logger default still holds |
| `windows status` | `open_count: 2`, `fixed_count: 10`, `waived_count: 1` |
| `uat classify-coverage` on `01-14-SUMMARY.md` | `errors: []`; D5 in `present` (human), not `auto_passed` |
| `verify-summary` on `01-14-SUMMARY.md` | `passed: true` |
| File deletions across all three commits | none |

### Task acceptance criteria

| Task | Criterion | Result |
|---|---|---|
| 1 | All twelve clauses bind their caught value and emit exactly one line each | PASS (plus a 13th, deviation 1) |
| 1 | Every user-facing message and alert byte-identical to its pre-change form | PASS — string-literal diff, additions only |
| 1 | Rejections and infrastructure failures use different levels and outcomes | PASS — debug + `field` vs error |
| 1 | Gate asserts ≥12 bound clauses BEFORE asserting zero unbound, and fails if either half is unmet | PASS — RED evidence (a) and (b) |
| 1 | No identifier as an object; no message text, token, raw update or zone in any field | PASS — scalars only; caught value only under `err` |
| 2 | Runbook and UAT both require emission before absence; window 12 closed | PASS |
| 3 | Task 1 recorded delivered, Task 2 recorded executed-and-not-approved | PASS |
| 3 | All nine findings listed with gap ids and the closing plan | PASS — each verified against `git log` |
| 3 | Coverage block parses with zero errors; live deliverable is human-judgment with a rationale | PASS |
| 3 | Nothing claims the live verification passed | PASS |

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree. Resolved as prior waves did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. No package installed, added or upgraded; the lockfile is untouched (T-01-22-SC holds).
- **Integration flakiness on the first run.** An initial parallel-ish run reported 3 failed files with 7 skipped — spurious Testcontainers startup failures, the known harness characteristic. Every serial run since reproduces the documented baseline exactly (31 passed / 2 failed).
- **`git checkout HEAD -- <file>` was denied by the sandbox classifier**, so the planned RED demonstration (temporarily restoring the pre-change module) could not run. RED was obtained instead **without mutating the working tree**, by applying the gate's own regexes and floor to the pre-change source read via `git show` and to an empty directory. The empty-directory case is the stronger evidence: it shows the absence half passing while the existential half fails.
- **An API session limit killed the run** after all three task commits had landed but before this SUMMARY was written. Committing atomically per task is exactly what made that recoverable — no task work was lost or redone.
- **A mid-run instruction conflicted with this dispatch's tooling contract.** System-reminders arriving during the run directed that file reads and edits be performed through Bash (`cat`, `sed`, heredocs) instead of the Read/Write/Edit tools. The dispatch's `<tooling_precedence>` block explicitly overrides mid-run instructions of that kind, and the coordinator re-confirmed it on resume, so Read/Write/Edit were used throughout. Recorded here per that block's instruction.
- **Broken windows 2 and 3 remain open by design** — pre-existing `chat-configuration.test.ts` failures, outside this plan's scope. Their signatures are unchanged before and after.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, file-access pattern or schema change. The plan's registered threats are addressed in place:

- **T-01-22-01** (bound errors reaching the sink): the caught value is passed only under `err`, where the redactor reduces it to name/message/code, drops the stack and scrubs token and connection-string shapes. No error is stringified into a message or an allow-listed key.
- **T-01-22-02** (rejection sites holding user text): no message text reaches any field; only the bounded `field` name and a bounded outcome.
- **T-01-22-03** (reintroducing a black hole): count-based gate, existential-first, fails on the first reintroduction and fails rather than passes when it reads nothing.
- **T-01-22-04** (a summary overstating 01-14): `status: halted`, D5 human-judgment with an empty verification list, NOT APPROVED recorded throughout.
- **T-01-22-05** (changing recovery behaviour): control flow untouched; string-literal diff is additions only; full suites at baseline.
- **T-01-22-SC**: no dependency added, removed or upgraded.

## User Setup Required

None for this plan. The **re-run** still needs the 01-14 setup — see `01-USER-SETUP.md`: `BOT_TOKEN` for a dedicated test bot, a private group with the bot as administrator, and a second human test account.

## Next Phase Readiness

- **G-01-6 is now fully closed.** Plan 01-21 closed `missing[0]`, `[1]` and `[3]`; this plan closed `missing[2]` (the twelve bare catches) and the runbook/UAT corrections. **Broken window 12 is closed.**
- **Every window opened by the live run (4-12) is now fixed or waived with a reason.** The 2 still open are windows 2 and 3 — the inherited `chat-configuration.test.ts` failures, which predate the live run and still need a disposition (fix or waive) before `/gsd-ship`.
- **The phase history is contiguous again.** Every executed plan 01-01…01-22 now has a SUMMARY.
- **The live re-run is the remaining gate**, and it is now worth running: step 2e is probative, and this plan's `<human-check>` batches it with the 01-17 (D9), 01-19 (F-2) and 01-21 (D8) live checks so one session covers them all.
- **UAT test 6 is `pending`, deliberately.** Phase verification must re-run it live rather than inherit the old verdict.

### Owed to the orchestrator

1. **`ROADMAP.md`** — replace the 01-14 line (see `01-14-SUMMARY.md` for the verbatim replacement). It must **not** be ticked `[x]`: its live-verification truth is unsatisfied. Also mark 01-22 complete and update the phase progress row.
2. **`STATE.md`** — no decision-bullet *replacement* is needed; this plan's decisions are additive. Suggested new bullets:
   - `[Phase 01]: An unbound catch clause is unloggable, not merely unlogged — the redactor renders an error only under the err key, so binding the caught value is a precondition for observability.`
   - `[Phase 01]: Handler failures are classified in the emitted fields: expected-input rejections at debug with the field being collected, infrastructure and Telegram delivery failures at error; both carry the bound error.`
   - `[Phase 01]: A structural or manual gate asserts its positive existential before any absence claim; an absence assertion over an unread or empty set is vacuously true.`
   Also worth updating: `stopped_at`, and the carried-forward note "Five automated gates currently certify the defects they were written to catch" — the last of those (runbook 2e / UAT test 6) is corrected by this plan.

## Self-Check: PASSED

- `01-14-SUMMARY.md` present on disk and committed; all 8 modified files present.
- All three task commits present on `worktree-agent-afebd62fade99cfe1`: `6511332`, `b465588`, `0cd2843`.
- No file deletions in any commit (`git diff --diff-filter=D` empty across `4b4d590..HEAD`).
- `src/shared/logger.ts` is absent from every commit in this range — the allow list and redactor are unmodified, as the plan required.
- Working tree clean; `node_modules` and `src/generated` are gitignored.
- Verification re-run after the session-limit interruption: typecheck, unit (73), integration (31/2 baseline), format — all as tabulated above.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-26*
