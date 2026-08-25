---
phase: 01-chat-readiness
plan: 21
subsystem: telegram
tags: [pino, structured-logging, observability, grammy, redaction, non-vacuity]

# Dependency graph
requires:
  - phase: 01-16
    provides: The single-shot callback boundary whose terminating branches are instrumented here
  - phase: 01-17
    provides: The narrowed carrier routes, including the deliberately silent no-in-flight-action branch
  - phase: 01-20
    provides: The tree this plan forked from
provides:
  - A required SafeLogger member on ChatReadinessServices, CallbackBoundaryDependencies and the three feature handler dependency interfaces
  - An optional logger on BotDependencies, defaulted to a silent-level logger so every existing suite stays byte-for-byte quiet
  - One info-level route record per handled update on all six non-callback routes, carrying updateId, chatId, actorId and a route id resolved from the route table
  - A distinct event/outcome/reason triple on all seven terminating exits of the callback boundary, including the ones that answer nothing
  - A closed ChatReadinessRouteId union plus a runtime table lookup, so no hand-written route string can reach a log line
  - The non-vacuity guard — a positive existential asserted before any absence claim, which fails when the update path emits nothing
affects: [01-22, live-verification, availability-card]

# Actuals (#2632)
actuals:
  tokens: 9244
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional logger at the composition root, REQUIRED on every container below it: callers that never asked for logs get a silent-level substitute rather than handlers checking for an absent logger"
    - "Bounded log vocabularies declared next to the thing they describe — route ids as a closed union plus a runtime table lookup, outcomes/reasons as `as const` records"
    - "Non-vacuity guard: assert the positive existential BEFORE any negative grep, and re-assert it inside each absence test so the file cannot pass vacuously when reordered or run in isolation"
    - "Absence assertions match concrete fixture values, never field names, so a renamed key cannot make a leak test pass"

key-files:
  created:
    - tests/unit/update-path-logging.test.ts
  modified:
    - src/app/create-bot.ts
    - src/app/main.ts
    - src/telegram/handlers.ts
    - src/telegram/callbacks.ts
    - src/telegram/setup-handlers.ts
    - src/telegram/settings-handlers.ts
    - src/telegram/roster-handlers.ts
    - tests/unit/update-route-ownership.test.ts
    - tests/unit/roster-rendering.test.ts

key-decisions:
  - "The logger is OPTIONAL on BotDependencies and REQUIRED on every container below it. createBot substitutes createLogger({ level: 'silent' }) when omitted, so handlers never branch on an absent logger and no existing suite had to be told about logging."
  - "Route identifiers are a closed union type AND a runtime lookup against CHAT_READINESS_ROUTES. The union bounds the vocabulary at compile time; the lookup proves at run time that an emitted label is a member of the table, so the table cannot drift from what the logs claim (T-01-21-06)."
  - "The three unresolved callback branches share an outcome but carry three different reasons, supplied at the call site rather than chosen inside the shared `unresolved` helper — logging inside the helper would have made them indistinguishable, which is the exact failure being closed."
  - "The callback boundary emits its terminating triple at INFO, not debug. A record only visible at debug would not exist in a production log, which is where F-4 was found; steady-state volume stays at one line per update (T-01-21-05)."
  - "The message:text slash-prefix early return stays unlogged: that route does not HANDLE a command update, the owning command route emits its own line, and logging both would double-count every command."

patterns-established:
  - "Silent-by-default injection: an optional dependency at the composition root becomes a required one below it via substitution, not via optional chaining at every call site"
  - "Prove emission before proving absence — a negative assertion over an unproven set is not a test"

requirements-completed: [AUTH-02, CONF-01]

coverage:
  - id: D1
    description: "All three update-path dependency containers carry a required logger, supplied from the composition root that already held one in scope"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#emits at least one line carrying an update identifier and a bounded route identifier"
        status: pass
      - kind: other
        ref: "npm run typecheck (required member on ChatReadinessServices, CallbackBoundaryDependencies and the three feature interfaces)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each of the six non-callback routes emits one info line per handled update carrying the update identifier and a bounded route id"
    requirement: "CONF-01"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#emits at least one line carrying an update identifier and a bounded route identifier"
        status: pass
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#emits the one-line-per-update route record at the default configured level"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every terminating branch of the callback boundary emits a distinct event/outcome/reason triple, including the branches that return silently; the three unresolved branches are mutually distinguishable"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#identifies the stale callback branch by its own outcome and reason"
        status: pass
      - kind: other
        ref: "grep -o 'reason: \"[a-z-]*\"' src/telegram/callbacks.ts | sort -u — 7 distinct reasons over 7 terminating exits"
        status: pass
    human_judgment: false
  - id: D4
    description: "The non-vacuity guard: the positive existential is asserted first and fails when the update path emits nothing, so the coordinate check can never again pass over an empty set"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#emits at least one line carrying an update identifier and a bounded route identifier"
        status: pass
      - kind: other
        ref: "RED evidence — the same file run against the Task 1 tree (wiring present, zero log call sites) fails 4 of 5 with 'expected 0 to be greater than 0'"
        status: pass
    human_judgment: false
  - id: D5
    description: "Neither the shared coordinates nor the resolved IANA zone reaches any log line, asserted against the concrete fixture values rather than field names"
    requirement: "CONF-01"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#never lets the shared coordinates or the resolved zone reach a log line"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every route identifier that reaches a log line is a member of the declared route table"
    verification:
      - kind: unit
        ref: "tests/unit/update-path-logging.test.ts#only ever names routes that are members of the declared route table"
        status: pass
    human_judgment: false
  - id: D7
    description: "A bot constructed without an explicit logger emits nothing, so existing suites stay quiet"
    verification:
      - kind: other
        ref: "npm test and npx vitest run --project integration --no-file-parallelism piped through grep -c for the new event names — 0 lines in both"
        status: pass
    human_judgment: false
  - id: D8
    description: "In a live Telegram group at LOG_LEVEL=info, handling one update actually produces one route record on stdout, and the coordinate grep now runs against a non-empty set"
    verification: []
    human_judgment: true
    rationale: "F-4 was found on a live run and every proof here is a fake Prisma plus an in-memory pino destination, not the deployed process writing to real stdout. Runbook step 2e and UAT test 6 still assert the OLD, vacuous form of this check; plan 01-22 owns correcting them. Only a live re-run against the corrected runbook can confirm the check is now probative."

# Metrics
duration: 13 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 21: Update Path Logging Summary

**The Telegram update path gets a voice: a required `SafeLogger` on all three dependency containers fed from the composition root, one bounded route record per handled update, a distinct event/outcome/reason triple on all seven callback-boundary exits — and a guard that asserts emission BEFORE it asserts absence, so the "no raw coordinates in logs" check can never again be vacuously true.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-25T19:01:00Z
- **Completed:** 2026-08-25T19:13:49Z
- **Tasks:** 3
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- **Closed the structural root cause.** `main.ts` built a logger at `:28` and did not pass it at `:42-47`. It does now, and `BotDependencies` accepts it. The three update-path containers plus the three feature handler interfaces all declare a **required** logger, so a handler can no longer be structurally incapable of logging.
- **Made the silence audible.** All six non-callback routes emit one info line per handled update. Critically that includes the `no-in-flight-action` branch plan 01-17 made deliberately silent in the chat — an operator can now tell a deliberate no-op from a swallowed failure (T-01-21-04).
- **Instrumented all seven terminating exits of the callback boundary**, including the four that return without answering. The three that funnel through the shared `unresolved` helper carry three different reasons, supplied at the call site.
- **Bounded the vocabulary at both compile time and run time.** `ChatReadinessRouteId` is a closed union and `chatReadinessRouteId()` resolves it against `CHAT_READINESS_ROUTES`, so a hand-written route label cannot reach a log line and the table cannot drift from what the logs claim.
- **Killed the vacuity.** The new guard asserts the positive existential first, re-asserts it inside every absence test, and matches absence against the concrete latitude, longitude and IANA zone the fixture actually sent. Run against the Task 1 tree it fails 4 of 5 with `expected 0 to be greater than 0` — the exact failure F-4 should have produced and did not.
- **Left the existing suites byte-for-byte silent.** `npm test` and the integration project produce zero lines matching the new event names.

## Task Commits

1. **Task 1: Give the update path a logger it can actually reach** — `e65299d` (feat)
2. **Task 2: Make every route and every boundary exit observable** — `f7db377` (feat)
3. **Task 3: Prove emission before proving absence** — `1edbbfc` (test)

**Plan metadata:** see the `docs(01-21)` commit that carries this file.

## Files Created/Modified

- `tests/unit/update-path-logging.test.ts` — **created.** The non-vacuity guard. Drives a real location update and a real stale-callback update through `createBot` with a pino destination collector; five cases covering the existential, the default level, coordinate/zone absence, stale-branch identification, and route-vocabulary membership.
- `src/app/create-bot.ts` — optional `logger` on `BotDependencies`; substitutes `createLogger({ level: "silent" })` when omitted; threads it into `registerChatReadinessHandlers`.
- `src/app/main.ts` — passes the composition-root logger into `createBot`. One line; the structural root cause.
- `src/telegram/handlers.ts` — required `logger` on `ChatReadinessServices`; `ChatReadinessRouteId` union; `ROUTE_BY_ID` map and `chatReadinessRouteId()`; `CHAT_READINESS_ROUTE_OUTCOMES` vocabulary; `routeFields`/`logRoute`/`logRouteDetail`; every terminating branch of all six routes instrumented.
- `src/telegram/callbacks.ts` — required `logger` on `CallbackBoundaryDependencies`; `CALLBACK_BOUNDARY_BRANCHES` vocabulary; `logCallbackBranch`; all seven exits instrumented plus two debug detail lines; boundary doc comment records the new contract.
- `src/telegram/setup-handlers.ts`, `settings-handlers.ts`, `roster-handlers.ts` — required `logger` on each dependency interface (interface + import only; **no** call sites, and the 12 bare catches are untouched — they belong to 01-22).
- `tests/unit/update-route-ownership.test.ts`, `tests/unit/roster-rendering.test.ts` — silent logger added to the two harnesses that register handlers directly and therefore bypass `createBot`'s substitution.

## Decisions Made

- **Optional above, required below.** Making the member required everywhere would have forced every `createBot` call site in the suite to care about logging; making it optional everywhere would have put `?.` at every call site and left the door open to the exact structural silence being fixed. The substitution at the composition root gives both properties.
- **The callback boundary logs its terminating triple at INFO, not debug.** The plan's wording assigns debug to "per-branch detail" and info to "the one-line-per-update route record". A callback that emitted only at debug would be invisible in a production log at the default `LOG_LEVEL=info` — which is precisely the condition under which F-3 went undiagnosed. Debug is used for the two genuine intra-branch details (`telegram.callback.authorized`, and the location route's `timezone-resolution-requested`).
- **Reasons are passed at the call site, not into the helper.** The plan permitted either reading of "pass the reason in rather than logging inside the helper"; logging before the `unresolved(...)` call is the unambiguous one and keeps the helper's single responsibility intact.
- **The slash-prefix early return on `message:text` is not logged.** That route does not handle a command update — the owning command route emits its own record. Logging both would double-count every command and inflate steady-state volume against T-01-21-05.
- **`timezone-resolution-requested` records the fact, never the value.** `timezone` is deliberately absent from the redactor's allow list; re-adding it would turn a log line into a location proxy. The outcome field carries the fact instead (T-01-21-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two test harnesses bypass `createBot` and would have hit an undefined logger at run time**

- **Found during:** Task 1
- **Issue:** `tests/unit/update-route-ownership.test.ts` and `tests/unit/roster-rendering.test.ts` call `registerChatReadinessHandlers` / `registerRosterHandlers` directly through an `as unknown as` / `as never` cast. The cast suppresses the new required member at compile time, so once Task 2 added call sites `services.logger.info(...)` would have thrown `TypeError: Cannot read properties of undefined` on every update those suites drive.
- **Fix:** Added `logger: createLogger({ level: "silent" })` to both harnesses. Both suites assert silence on the CHAT surface, not on the log stream, so a silent logger preserves exactly what they test.
- **Files modified:** `tests/unit/update-route-ownership.test.ts`, `tests/unit/roster-rendering.test.ts`
- **Verification:** `npm test` — 12 files / 66 tests, identical to the fork-point baseline, before and after Task 2.
- **Committed in:** `e65299d`

**2. [Rule 1 - Bug] An existing doc comment was orphaned from the type it describes**

- **Found during:** Task 2
- **Issue:** Inserting `ChatReadinessRouteId` between the `ChatReadinessRoute` doc comment and `ChatReadinessRoute` itself left two adjacent block comments, the first now describing nothing.
- **Fix:** Moved the new type above the existing comment so each comment sits on its own declaration.
- **Files modified:** `src/telegram/handlers.ts`
- **Verification:** Read back; `npm run format:check` passes.
- **Committed in:** `f7db377`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug).
**Impact on plan:** No scope creep. The two test-harness edits were unavoidable consequences of making the member required, which the plan explicitly mandated. `src/` changes are confined to the seven files the plan named.

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` (unit) | PASS — 13 files, 71 tests (baseline 12 / 66; +1 file, +5 tests) |
| `npx vitest run --project unit tests/unit/update-path-logging.test.ts` | PASS — 5 tests |
| Same file against the Task 1 tree (`e65299d` src) | **FAILS 4 of 5** with `expected 0 to be greater than 0` — the guard is non-vacuous |
| `npx vitest run --project integration --no-file-parallelism` | 31 passed, 2 failed — byte-identical to the fork-point baseline (broken windows 2 and 3) |
| Integration stdout grepped for the new event names | 0 lines — the silent default holds |
| Unit stdout grepped for the new event names | 0 lines |
| `npm run format:check` | PASS |
| Distinct callback reasons in `callbacks.ts` | 7, over 7 terminating exits |
| File deletions across all three commits | none (`git diff --diff-filter=D` empty) |

### Task acceptance criteria

| Task | Criterion | Result |
|---|---|---|
| 1 | All three update-path containers declare a required logger member | PASS |
| 1 | The composition root passes its logger into createBot | PASS — `main.ts:47` |
| 1 | A bot constructed without an explicit logger writes no bytes | PASS — pino `silent` verified directly; both suites grep-clean |
| 1 | No log call site added, `logger.ts` unmodified | PASS — `logger.ts` absent from all three commits |
| 2 | Six non-callback routes each emit one line per handled update with updateId + bounded route id | PASS |
| 2 | Every terminating callback branch emits a distinct event/outcome/reason triple, including silent ones | PASS — 7 reasons, 7 exits |
| 2 | The three unresolved branches are mutually distinguishable | PASS — `unparseable-token`, `unknown-action-row`, `unrouted-action-kind` |
| 2 | No identifier passed as an object; no zone, token, raw update or message text in any field | PASS — asserted in Task 3 against concrete values |
| 2 | The route record is emitted at the default configured level | PASS |
| 3 | The positive existential is the first assertion and fails if nothing is emitted | PASS — RED evidence above |
| 3 | Absence assertions run after it and match concrete coordinate/zone values | PASS |
| 3 | The stale callback branch is identified by its own outcome and reason | PASS |
| 3 | Every emitted route identifier is a member of the route table | PASS |
| 3 | No file under `src/` modified by this task | PASS — `git show --stat 1edbbfc` lists only the test file |

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree. Resolved exactly as plans 01-16 and 01-17 did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. No package was installed, added or upgraded; the lockfile is untouched (T-01-21-SC holds).
- **The RED demonstration needed the pre-instrumentation source.** Task 3 is a `tdd="true"` task whose plan forbids modifying `src/`, so the usual RED-then-GREEN ordering could not apply — the behavior it guards had to land in Task 2 first. RED was obtained instead by `git checkout e65299d -- src/telegram/handlers.ts src/telegram/callbacks.ts`, running the file (4 of 5 failed), then `git checkout HEAD -- <same two files>`. `git diff HEAD --stat` afterwards was empty, confirming an exact restore. No stash was used.
- **A mid-run instruction conflicted with this dispatch's tooling contract.** A system-reminder arriving during the run directed that file reads and edits be performed through Bash (`cat`, `sed`, heredocs) instead of the Read/Write/Edit tools. The dispatch's `<tooling_precedence>` block explicitly overrides mid-run instructions of that kind, so Read/Write/Edit were used throughout, as required. Recorded here per that block's instruction.
- **Broken windows 2 and 3 remain open by design** — pre-existing `chat-configuration.test.ts` failures, outside this plan's scope. Their signatures are unchanged before and after.

## TDD Gate Compliance

Task 3 carried `tdd="true"` but is a **test-only** task by the plan's own instruction ("do not modify src/ in this task"). The canonical RED → GREEN commit sequence therefore does not apply: there is no `feat` commit belonging to Task 3, because the behavior it guards is Task 2's. RED was demonstrated empirically instead (see Issues Encountered) and the evidence is recorded in the `1edbbfc` commit message. This is a deliberate consequence of the plan's structure, not a discipline violation.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint, auth path, file-access pattern or schema change was introduced. The plan's registered threats are addressed in-place: T-01-21-01 and T-01-21-03 by the unchanged allow list plus the concrete-value absence assertions, T-01-21-02 by scalars-only identifiers, T-01-21-04 by instrumenting the silent branches, T-01-21-06 by the closed union plus table lookup. T-01-21-SC holds: no dependency was added, removed or upgraded.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **G-01-6 and broken window 12 must stay OPEN.** This plan carries `gap_partial: true` and closes `missing[0]`, `missing[1]` and `missing[3]` only. `missing[2]` — the twelve bare catch clauses that starve the live `bot.catch` seam — plus the runbook step 2e and UAT test 6 corrections belong to **plan 01-22**. Do not read this SUMMARY as gap closure. No `windows` entry was touched by this plan.
- **01-22 now has the foundation it needs.** Every one of the twelve handler modules already holds a required `SafeLogger`, so converting `} catch {` to `} catch (error) {` plus a bound `err` field needs no further signature work.
- **Owed to the orchestrator:** the usual post-merge `STATE.md` / `ROADMAP.md` progress writes. This plan needs no `STATE.md` decision-bullet replacement — its decisions are additive. Broken window 13 (the 01-16 STATE.md acknowledgement bullet) is still outstanding from that plan, unrelated to this one.
- `AUTH-02` and `CONF-01` already read `Complete` in `REQUIREMENTS.md` from plans 01-16/01-17, so no requirements write was needed.
- **A live run is still the only proof of D8.** Worth pairing with the 01-19 (F-2) and 01-17 (D9) live passes once 01-22 has corrected runbook step 2e, rather than spending a separate session on a check that is still documented in its vacuous form.

## Self-Check: PASSED

- `tests/unit/update-path-logging.test.ts` present on disk; all 9 modified files present.
- All three task commits present on `worktree-agent-a3870f6a711a954fe`: `e65299d`, `f7db377`, `1edbbfc`.
- No file deletions in any commit (`git diff --diff-filter=D` empty across `dccf86a..HEAD`).
- `src/shared/logger.ts` is absent from every commit in this range — the allow list and redactor are unmodified, as the plan required.
- Working tree otherwise clean; `node_modules` and `src/generated` are gitignored.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
