---
phase: 02-weekly-rehearsal-proposal
plan: 03
subsystem: planning
tags: [telegram, inline-keyboard, civil-time, timezone, projection, tdd]

# Dependency graph
requires:
  - phase: 02-weekly-rehearsal-proposal
    plan: 01
    provides: the developer-confirmed durable round contract, and assumption A1's definition of "the previous rehearsal"
  - phase: 02-weekly-rehearsal-proposal
    plan: 02
    provides: PlanningRound/PlanningParticipant, the civil-vs-instant seam, the extended callback boundary, the declared keyboard row splits
provides:
  - "PlanningService.previousRehearsal — the ONE definition of the previous rehearsal, the single place Phase 4's LIFE-05 narrows"
  - "The bounded day-marker classification (past | default | previous | none) and the DayStepProjection carrying it"
  - "renderDayStep as a pure projection-in / text-and-keyboard-out function, with the D-08 legend"
  - "The `past-day` member of selectDay's result union: refused at tap time, WITHOUT consuming the action row"
  - "tests/unit/planning-keyboards.test.ts — the F-9 serialized row-shape guard for both the day and slot keyboards"
affects: [02-04, 02-05, 02-06, 02-07, phase-4-lifecycle]

actuals:
  tokens: 13672
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "A card's markers are ONE ordered decision producing one value per item, so a tie rule cannot be violated by a later edit adding a second marker"
    - "Availability is re-derived at tap time from the round's own snapshot; a render is never authority"
    - "A refusal that changes nothing also spends nothing: the CallbackAction row survives so the same card stays usable"

key-files:
  created:
    - tests/unit/target-week.test.ts
    - tests/unit/planning-day-card.test.ts
    - tests/unit/planning-keyboards.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/keyboards.ts
    - src/telegram/handlers.ts
    - tests/integration/planning-round.test.ts

key-decisions:
  - "`wasPreviousParticipant` was NOT rebuilt on top of `previousRehearsal()`. The plan assumed the two were the same query; they are not, and unifying them would have narrowed an authorization input from 'has ever played with this band' to 'played at the single most recent rehearsal'. NEEDS HUMAN REVIEW."
  - "The plan's `<verification>` line 'tests/integration/planning-round.test.ts from 02-02 still passes' is unsatisfiable as written: that test asserts bare day labels, and this plan's whole purpose is to add leading markers to them. The test was updated to assert the marked labels and now proves the new behaviour end to end."
  - "`PLANNING_DAY_ROW_SIZES` keeps its 02-02 name rather than being renamed to the plan's `PLANNING_DAY_ROWS`; it holds sizes, not rows."
  - "The marker hints — and only the marker hints — read the live ChatConfiguration.defaultWeekday. Every durable value on the card still comes from the round's own snapshot (T-02-11)."

patterns-established:
  - "Ordered classification beats flag sets when a tie rule exists: there is nowhere to put a second marker."
  - "Assert the SERIALIZED keyboard, not the declared constant — that gates the declaration and the row-break algorithm as a pair."
  - "A grep-based acceptance criterion must be made discriminating: an unrelated month offset was hoisted off the weekday line so it cannot satisfy the guard by accident."

requirements-completed: [PLAN-03, PLAN-04, PLAN-05]

coverage:
  - id: D1
    description: "The day card offers all seven days of the target Monday–Sunday week in fixed Monday-first order, in every fixture — including a week entirely in the past."
    requirement: PLAN-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#offers exactly seven days, Monday first, in every fixture"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#keeps day positions identical whatever the configured default is"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#starts a durable week-aware round and anchors the day card for a non-admin author"
        status: pass
    human_judgment: false
  - id: D2
    description: "The target week is exactly Monday–Sunday in the chat's own timezone; mondayOf a Monday is that Monday, a Sunday maps back six days, and the adjacent Monday never leaks in."
    requirement: PLAN-03
    verification:
      - kind: unit
        ref: "tests/unit/target-week.test.ts#separates the Sunday-to-Monday boundary instead of merging it"
        status: pass
      - kind: unit
        ref: "tests/unit/target-week.test.ts#maps a Sunday back to the Monday six days earlier, never forward"
        status: pass
      - kind: unit
        ref: "tests/unit/target-week.test.ts#uses the chat's own day, not the process's, at the day boundary"
        status: pass
    human_judgment: false
  - id: D3
    description: "The configured default weekday and the previous rehearsal each carry a leading marker with a legend above the keyboard; when they coincide only the default marker is shown."
    requirement: PLAN-05
    verification:
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#shows only the default marker when the two coincide"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#names every marker in use and none that is not"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#renders the full card with no previous marker when there is no previous rehearsal"
        status: pass
    human_judgment: false
  - id: D4
    description: "A day earlier than today in the chat's timezone is rendered, marked unavailable, and refused server-side with a private alert that mutates nothing and does not consume the tap."
    requirement: PLAN-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#refuses the tap without consuming the action row or touching the round"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#answers with a private alert, edits nothing, and records one bounded line"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#refuses a past day without spending the card, and the same card still works"
        status: pass
    human_judgment: false
  - id: D5
    description: "The serialized day keyboard is a 4/3 split and the slot keyboard a 3/3/3/1 split, every callback_data an opaque v1:<uuid>, every label inside the visible width."
    verification:
      - kind: unit
        ref: "tests/unit/planning-keyboards.test.ts#splits the seven days into the declared 4/3 rows"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-keyboards.test.ts#puts nothing but an opaque token on the wire"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-keyboards.test.ts#splits the default ten-slot window into the declared 3/3/3/1 rows"
        status: pass
    human_judgment: false
  - id: D6
    description: "The three marker glyphs read clearly and distinguishably on a real Telegram client, on mobile and desktop, with no label truncating."
    verification: []
    human_judgment: true
    rationale: "Glyph legibility and button width are rendering-client properties. 02-VALIDATION.md § Manual-Only Verifications already assigns this to the phase's live Telegram run, exactly as Phase 1 finding F-9 was found."
  - id: D7
    description: "A previous rehearsal falling INSIDE the target week is marked `previous` like any other day."
    verification:
      - kind: unit
        ref: "tests/unit/planning-day-card.test.ts#marks the day equal to the previous rehearsal's chat-local date"
        status: pass
    human_judgment: true
    rationale: "The plan's own <flagged_assumptions> raises this as the most likely uncovered question and asks a human to confirm. The behaviour is implemented and tested; whether it is the DESIRED behaviour is the open question."

# Metrics
duration: 17 min
completed: 2026-08-31
status: complete
---

# Phase 2 Plan 03: Day Card Markers and Past-Day Refusal Summary

**The day card now shows all seven days of the target week in fixed Monday-first order with leading markers for the chat's usual day, its last rehearsal and the days already gone — and tapping a gone day is refused server-side with a private alert that changes nothing and, crucially, spends nothing.**

## Performance

- **Duration:** ~17 min
- **Tasks:** 2 of 2
- **Commits:** 5 (`a1a0cf0` RED, `587128f` GREEN, `e0c354e` RED, `ba5a5c9` GREEN, `8e7a56a` end-to-end proof)
- **Estimate calibration:** estimated 62,000 tokens; actual **13,672** (chars/4 over the realized diff, same scale 02-02 used). A ~4.5x overestimate, closely matching 02-02's ~3.6x — the phase's estimates are consistently high because the Phase 1 and 02-02 analogs are close enough to extend rather than invent.

## Verification

| Gate | Result |
|---|---|
| `npm run format:check` | pass |
| `npm run build` (`tsc --noEmit`, strict) | pass |
| `npm run test:unit` | **136 passed / 136** (was 106 at 02-02) |
| `npx vitest run --project integration` | **44 passed / 44** (was 43) |
| `npx vitest run --project unit tests/unit/target-week.test.ts tests/unit/planning-day-card.test.ts` | 19 passed |
| `npx vitest run --project unit tests/unit/planning-keyboards.test.ts tests/unit/planning-day-card.test.ts` | 22 passed |
| `npx prisma migrate status` against a replayed 18.4 database | Database schema is up to date (Task 1 precondition) |

**The past-day guard was mutation-checked, not merely run.** Disabling the `isPastDay` branch in `selectDay` turned the new integration case red immediately — a green guard that cannot fail is not evidence.

### Acceptance criteria, checked individually

| Criterion | Result |
|---|---|
| Task-1 vitest invocation passes | pass |
| Seven-button assertion for every fixture, incl. all-past | pass — `FIXTURES` drives every shape test, and the all-past fixture is one of its five |
| Tie fixture asserts default glyph present, previous glyph absent | pass — and absent from the whole card, not just that label |
| `grep -rnE "[+-] 1" src/domain/planning/ src/telegram/planning-renderers.ts \| grep -iE "weekday\|isoweekday"` | returns nothing (see deviation 4) |
| `renderDayStep` takes no client, no persistence `Pick`, no clock | pass — `(projection, tokenFor)`, and the test asserts `renderDayStep.length === 2` |
| `grep -c previousRehearsal src/domain/planning/planning-service.ts` ≥ 2 | 6 |
| `grep -rn CONFIRMED src/ \| grep -v planning-service.ts \| grep -v target-week.ts` | returns nothing |
| `inline_keyboard.length === 2`, `[0].length === 4`, `[1].length === 3` | pass |
| Opaque-token regex, no date shape on the wire | pass |
| Past-day test: no `editMessageText`, round byte-identical, `consumedAt` still null | pass, at both the unit and the PostgreSQL tier |
| `grep -c "show_alert: true" src/telegram/planning-handlers.ts` ≥ 1, past-day among them | 9, and the past-day branch is one |
| `npm run test:unit`, `npm run build`, `npm run format:check` exit 0 | pass |

## Accomplishments

- **`previousRehearsal()` is one named function, and provably the only one.** The `CONFIRMED`-status grep now returns nothing outside `planning-service.ts` and `target-week.ts`, so Phase 4's LIFE-05 narrowing has exactly one edit site and no call site to chase.
- **The D-08 tie rule is structural, not conditional.** `classifyDay` is a single ordered decision returning ONE `DayMarker` per day (`past` → `default` → `previous` → `none`). There is nowhere to put a second marker, so a later edit cannot reintroduce the double-marked day even carelessly.
- **Past days are visible, marked and refused — and the refusal is cheap.** `selectDay` returns `past-day` *before* consuming the `CallbackAction` row. That ordering is the load-bearing detail: a refusal that consumed the row would leave the author holding a card whose remaining valid buttons no longer worked. The new integration case taps a past day, then taps a valid one on the *same* card, and the second tap still advances the round.
- **Availability is re-derived at tap time** from `round.timezone` and `round.targetWeekStart` plus the injected `now`, never trusted from the render (T-02-17) — because a card can sit in a group chat across midnight.
- **The F-9 guard is now serialized-shape, for both keyboards.** `tests/unit/planning-keyboards.test.ts` asserts what Telegram receives, so a change in `planningRows`' break logic is caught as well as a change in the declared constant.
- **The card's shape is genuinely day-invariant.** The "identical positions whatever the default is" test compares marker-stripped labels between a Monday-default and a Sunday-default fixture; the past-day tests assert seven buttons on a Thursday, on the closing Sunday, and after the week is entirely gone.
- **Chat-local, not process-local.** Both the week arithmetic and the past classification are asserted at an instant whose UTC calendar day differs from the chat's — the failure mode that produces a card one day out for a whole timezone.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] `node_modules` and the generated Prisma client were absent in the worktree.**
- **Found during:** Task 1 setup.
- **Fix:** `npm ci` from the committed lockfile (no package added, resolved or substituted — the same guarantee CI relies on, T-01-SC), then `npm run db:generate` with `DATABASE_URL` supplied inline, exactly as `.github/workflows/ci.yml` does. `src/generated/prisma` remains gitignored and untracked; it was **not** `git add -f`-ed.

**2. [Rule 3 — Blocking] The Task 1 precondition needed a database that did not exist.**
- The precondition asks that `prisma migrate status` report no pending migrations. 02-02 removed its container and wrote no `.env`. A disposable `postgres:18.4` was started on port 55433, the committed history was replayed with `migrate deploy`, `migrate status` reported *Database schema is up to date*, and the container was removed at the end. No `.env` was written and no credential persisted.

**3. [Rule 1 — Bug] The 02-02 integration test could not pass unmodified, and the plan's `<verification>` says it must.**
- **Issue:** `tests/integration/planning-round.test.ts` asserts the day keyboard's labels are exactly `["Mon 24", … "Sun 30"]` and looks up a token by exact label equality. Adding leading markers to those labels is this plan's entire purpose, so "still passes unmodified" is unsatisfiable — the same shape of contradiction 02-02 hit with T-01-16-01.
- **Fix:** `tokenLabelled` now matches the label *behind* the marker (the tracer path is indifferent to presentation), and the label assertion names the markers the card genuinely carries at the test's Wednesday clock: `🚫 Mon 24`, `🚫 Tue 25`, `⭐ Wed 26`, then four unmarked days, plus legend assertions. Net: the test is strictly stronger — it now proves the marker behaviour end to end instead of proving its absence.
- **Files:** `tests/integration/planning-round.test.ts`. **Commit:** `8e7a56a`.

**4. [Rule 1 — Bug] A Task 1 acceptance criterion was not discriminating.**
- **Issue:** `grep -rnE "[+-] 1" … | grep -iE "weekday"` matched `dayHeadingLabel`'s pre-existing `MONTH_LABELS[date.month - 1]`, because the same line also calls `weekdayOf`. A *month* offset was satisfying a guard that exists to catch *weekday* offsets, which means the guard would also have been unable to distinguish a real violation on that line.
- **Fix:** the month index is hoisted to its own statement, with a comment saying why. The criterion now returns nothing, and it now actually discriminates.

### Deliberate departures that need a human to agree

**5. `wasPreviousParticipant` was NOT rebuilt on `previousRehearsal()`. THIS CONTRADICTS THE PLAN AND NEEDS REVIEW.**

The plan says: *"It is already consumed by the `wasPreviousParticipant` input that 02-02 wired into `canStartPlanning`; if 02-02 inlined that query, replace the inline copy with a call to this function."*

**The premise is wrong.** 02-02 did not implement `wasPreviousParticipant` as "a participant of *the previous rehearsal*". It implemented "a participant of **any** CONFIRMED round" — a `PlanningParticipant.count` across the chat's whole history. The two are different questions that merely share a status filter.

Unifying them as the plan instructs would have **narrowed an authorization input**: under the `PREVIOUS_PARTICIPANTS` policy, a band member who happened to miss the single most recent rehearsal would silently lose the ability to start planning. That is a real access regression dressed as a refactor, so I did not make it.

**What I did instead:** moved the query out of `src/telegram/handlers.ts` and behind `PlanningService.wasPreviousParticipant`, with a comment stating explicitly that it is deliberately broader than `previousRehearsal()` and why. This satisfies the criterion's *intent* — `PlanningRoundStatus.CONFIRMED` now appears nowhere outside `planning-service.ts` and `target-week.ts`, so there is one home for "which rounds count" — without changing who may start a plan.

**What a reviewer should confirm:** that `PREVIOUS_PARTICIPANTS` means "has played with this band before" and not "played at the last rehearsal". I am confident it is the former (it is what the label says and what 02-02 shipped), but it is an authorization rule and I will not silently narrow one.

**6. `src/telegram/handlers.ts` was modified although it is not in `files_modified`.**
- Only the body of `wasPreviousParticipant` and the now-unused `PlanningRoundStatus` import. Required by the criterion in deviation 5; the alternative was leaving a second copy of the status filter at a Telegram surface.

**7. `tests/integration/planning-round.test.ts` was modified although it is not in `files_modified`.**
- Required by deviation 3, plus the new end-to-end past-day case. The plan lists it under `<verification>` rather than `<files>`, which is what made the contradiction easy to miss at planning time.

**8. `PLANNING_DAY_ROWS` was not introduced; `PLANNING_DAY_ROW_SIZES` kept its 02-02 name.**
- The plan's "Bare symbol names introduced here" list names `PLANNING_DAY_ROWS`. The existing constant holds `[4, 3]` — sizes, not rows — and renaming it to `PLANNING_DAY_ROWS` would misdescribe its contents while breaking the 02-02 call site for no gain. The deliberate-split comment the plan asks for was added above it and names the asserting test.

**9. `dayButtonLabel` changed shape, and `renderStep` became asynchronous.**
- `dayButtonLabel(date: CivilDate)` is now `dayButtonLabel(day: DayStepCell)`: a label cannot carry a marker without knowing the day's classification. `renderStep` in `planning-handlers.ts` is now `async` because the DAY branch awaits `dayStepProjection`. `replaceAnchor` gained a `now` parameter for the same reason. `renderDayStep` itself stayed pure — the durable read is in the service, where it belongs.

**10. The marker hints read the live `ChatConfiguration`.**
- `dayStepProjection` reads `defaultWeekday` from the live configuration, because it is not in the round's snapshot and this plan adds no column. This is deliberately scoped: markers are cosmetic advice, they select nothing, and every durable value on the card still comes from the round's own snapshot, so T-02-11's guarantee (asserted by integration Test 2, still green) is untouched. If the phase later wants the hint frozen at start time, that is a schema change and a plan of its own.

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug), 6 documented departures.
**Impact on plan:** no scope creep. Deviations 3 and 5 are the substantive ones and both point at planning-time premises that were false; the rest are mechanical consequences of the plan's own instructions.

## Known Stubs

None introduced by this plan. `renderDayStep` skips a day whose `tokenFor` answers `undefined`, which is unreachable by construction — `mintStepActions` mints exactly one action per `weekDates` entry, the same seven the projection carries — and the "seven buttons in every fixture" tests would fail immediately if it ever became reachable.

02-02's slot-tap stub (`.planning/WINDOWS.md` entry 18) is untouched and remains 02-04's to resolve, as planned.

## Threat Flags

None beyond the register. Every `mitigate` disposition assigned to this plan's files is implemented and asserted:

- **T-02-17** (tap-time re-validation) — `selectDay` re-derives the tapped date's availability from the round's own `timezone` and `targetWeekStart` plus the injected `now`; an out-of-week date is still `stale`, a now-past date is `past-day`. Asserted at both tiers, and mutation-checked.
- **T-02-01** (non-author tap) — unchanged from 02-02, and deliberately still evaluated *before* the past-day check, so a stranger tapping a past button learns only that they are not the author.
- **T-02-06** (HTML card text) — the card interpolates only bot-authored strings: weekday labels, day numbers, marker glyphs and one ISO date. No Telegram-supplied display name reaches it, which the renderer's purity over a bounded projection makes checkable.
- **T-02-09** (log lines) — the past-day branch logs a bounded `outcome` plus the already-allow-listed `roundId`. The tapped date, weekday, week start and timezone appear in no field; the unit test asserts the serialized line does not contain the date.
- **T-02-SC** — no package was installed. `npm ci` replays the committed lockfile exactly.

## Issues Encountered

Two integration failures, both expected and both informative: the 02-02 label assertions (deviation 3), and a chat-id collision when the new test reused `-1007000000009n`, which another case already owns. Both fixed; the second is a reminder that the file's chat ids are a hand-managed namespace.

## Open Items Carried Forward

- **Deviation 5 needs a human decision** on what `PREVIOUS_PARTICIPANTS` means. Nothing is broken either way today; the question is whether the policy should later be narrowed.
- **The plan's `<flagged_assumptions>` item is still open** (coverage D7): a previous rehearsal falling *inside* the target week is currently marked `previous` like any other day. Implemented and tested; a reviewer may want it treated differently.
- **02-04 owns `selectTime`** and the slot-tap refusal, plus `resolveWallClock` and the past/nonexistent-hour rule. It should reuse `PLANNING_MARKER_UNAVAILABLE` — D-07 asks for one consistent "in the past" rule across both selectors, and the glyph is exported for exactly that.
- **02-05 still owns the `startsAt`/`endsAt` half** of 02-01's suggested invariant test, unchanged from 02-02's note.
- **Live Telegram run** must confirm the three glyphs are visually distinguishable and no label truncates (coverage D6). Note that `previousRehearsal()` returns null until a round is CONFIRMED, so the previous marker cannot be seen at all until 02-05 lands — a live run before then can only exercise two of the three glyphs.
- **Local Node is v24.18.0** while `engines` requires `>=24.19 <25`. `npm ci` warned and proceeded; unchanged from 02-02.
- **STATE.md, ROADMAP.md and REQUIREMENTS.md were deliberately not modified.** This plan ran in a parallel wave; the orchestrator owns those shared files. The requirements this plan addresses are in the frontmatter.

## User Setup Required

None. The disposable `postgres:18.4` container used for the precondition check was removed; no `.env` was written and no credential persisted.

## Next Phase Readiness

The day step is complete and its two hardest rules — "always seven, always in the same order" and "the default wins a tie" — are held by structure rather than by care. 02-04 inherits a projection type it can copy for the time card, an exported unavailable glyph, a `refuse-past` schema member already present since 02-02, and a serialized row-shape test that already covers the slot keyboard it is about to populate.

## Self-Check: PASSED

- `tests/unit/target-week.test.ts`, `tests/unit/planning-day-card.test.ts`, `tests/unit/planning-keyboards.test.ts` — present on disk and tracked.
- All six modified files present with the described changes.
- Commits `a1a0cf0`, `587128f`, `e0c354e`, `ba5a5c9`, `8e7a56a` — all present in `git log`.
- `git diff --diff-filter=D 2514400..HEAD` — **no file deletions**.
- The temporary `if (false && …)` used for the mutation check was reverted; `git status` was clean apart from this SUMMARY before it was written.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-08-31*
