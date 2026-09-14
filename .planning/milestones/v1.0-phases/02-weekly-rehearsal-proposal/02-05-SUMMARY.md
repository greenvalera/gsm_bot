---
phase: 02-weekly-rehearsal-proposal
plan: 05
subsystem: planning
tags: [prisma, postgres, transactions, telegram, grammy, testcontainers, dst]

requires:
  - phase: 02-01
    provides: The CONFIRMED durable round contract — nullable activeWeekStart under @@unique([chatId, activeWeekStart]), the PlanningParticipant snapshot shape, and the exactly-once CallbackAction consumption template
  - phase: 02-02
    provides: The planning target schema (back/confirm members already present), the anchor-card edit discipline, and the Testcontainers integration harness
  - phase: 02-03
    provides: The day step, DayMarker/classifyDay ordering, the glyph vocabulary and the legend-above-the-keyboard position
  - phase: 02-04
    provides: selectTime, resolveWallClock, slotAvailability, the keyboard-less REVIEW card this plan replaces, and the DST policy
provides:
  - PlanningService.back — one step backwards with the earlier choice still applied (D-03)
  - PlanningService.confirm — the atomic promotion, week release and participant snapshot (D-04/D-09/D-10/D-11)
  - renderReviewStep and renderConfirmedStep — the terminal cards of the phase
  - listActiveMemberships — the single active-roster read, usable inside a transaction
  - escapeHtml exported from roster-renderers — one escaper in the Telegram layer
  - The "chosen" field on the day- and time-step projections, and PLANNING_MARKER_CHOSEN
  - PLANNING_BACK_ROW / PLANNING_REVIEW_ROWS and planningControlRows
affects: [availability collection, reminder scheduling, booking readiness, administrator takeover, status re-post]

actuals:
  tokens: 25749
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "One transaction per irreversible fact: status and activeWeekStart move in the SAME guarded updateMany, so the pair that encodes 'active' twice can never be observed disagreeing"
    - "Read-only refusals before the callback row is consumed, so an actionable refusal leaves the card the author is told to act on still usable"
    - "A free function over a client (listActiveMemberships) rather than a service method, so a transaction and a plain read share one predicate"
    - "Chosen-ness is a separate projection field from the bounded marker, so 'the one you picked' and 'the usual one' can be true of the same cell"
    - "A failure result carries its caught value, so the surface can bind it under `err` — the only key the redactor renders structurally"

key-files:
  created:
    - tests/integration/planning-confirm.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/domain/roster/roster-service.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/keyboards.ts
    - src/telegram/roster-renderers.ts
    - tests/unit/planning-time-card.test.ts
    - tests/unit/planning-day-card.test.ts
    - tests/unit/planning-keyboards.test.ts
    - tests/integration/planning-round.test.ts

key-decisions:
  - "DEVIATION from 02-RESEARCH.md Pattern 9: the empty-roster check and every other read-only refusal run BEFORE the callback row is consumed, not after. Pattern 9's order spends the review card's only Confirm token on a refusal whose message asks the author to go and add band members — so the tap after they do would answer 'Already applied.' and the card would be permanently dead. The consumption remains the single atomic gate in front of every write."
  - "confirm's expectedRevision parameter accepts null, meaning 'the round's own revision inside this transaction' — the guard selectDay and selectTime already use. The dispatcher passes null; nothing outside the transaction has observed a revision more recently than the transaction will."
  - "The 'stale revision' case is asserted two ways: an explicit mismatched expectedRevision at the service boundary, and a REAL end-to-end path (Back on the review card, then the Confirm token still on the author's screen). The plan's 'bump the revision between mint and confirm' is not reachable through the dispatcher, because nothing carries a mint-time revision — see Deviations."
  - "ConfirmResult's failed member carries the caught value rather than collapsing to a bare kind, so the confirm branch logs the real cause under `err` instead of a synthesized placeholder."
  - "confirm returns 'not-author' as a sixth kind the plan's union omitted. selectDay and selectTime both refuse a non-author, and T-02-01 says this plan must not weaken the refusal that already exists."
  - "escapeHtml is exported but NOT imported into planning-renderers. Every foreign string on the review card arrives through memberLabel, which already escapes; running the escaper again would render '&amp;amp;' to the band. The escaping fixture asserts the rendered string escapes exactly once."
  - "PLANNING_MARKER_CHOSEN leads the label, ahead of the marker glyph, so a day that is both the author's choice and the chat's usual day keeps both facts and its star."

patterns-established:
  - "Mutation-check every guard: disable it, name the tests that turn red, restore. A mutation that comes back GREEN is a coverage gap to close, not a pass — one did, and closing it added an end-to-end D-03 case."
  - "PREVIOUS_STEP maps DAY to undefined, so 'there is no step below the first' is a value the compiler checks rather than a convention a later edit can forget."

requirements-completed: [PLAN-02, PLAN-06, PLAN-08, PLAN-09]

coverage:
  - id: D1
    description: "Confirm atomically promotes the DRAFT round to CONFIRMED, writes startsAt/endsAt, nulls activeWeekStart and creates one PlanningParticipant row per active roster member — all in one transaction"
    requirement: PLAN-08
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#promotes the round, snapshots the lineup and releases the week in one go"
        status: pass
    human_judgment: false
  - id: D2
    description: "Nulling activeWeekStart on promotion releases the week's unique slot, so the chat can plan the next week while the confirmed round persists"
    requirement: PLAN-02
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#releases the week so the chat can start planning the next one (PLAN-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "endsAt equals startsAt plus durationMinutes of exact elapsed time (DST policy rule 4)"
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#promotes the round, snapshots the lineup and releases the week in one go"
        status: pass
    human_judgment: false
  - id: D4
    description: "Confirming with an empty active roster is refused with a message naming /roster_add, promotes nothing, and leaves the same card usable once members are added (D-10)"
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#refuses, promotes nothing, and names the way to fix it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#leaves the SAME card usable once members are added"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#confirms normally for a roster of exactly one (D-10)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A replayed Confirm answers 'Already applied.' with no duplicate participant rows, no second revision increment and an unchanged confirmedAt; two concurrent Confirms resolve to exactly one promotion (PLAN-09)"
    requirement: PLAN-09
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#changes nothing the second time: no duplicate rows, no second revision"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#resolves two concurrent Confirms to exactly one promotion"
        status: pass
    human_judgment: false
  - id: D6
    description: "The final selection is re-validated inside the transaction against the round's OWN snapshot, so a mid-round /settings edit can neither invalidate a valid confirm nor legitimise one the round never admitted (T-02-11)"
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#confirms against the round's snapshot even after /settings moved the window"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#refuses a selection the round's own snapshot never admitted"
        status: pass
    human_judgment: false
  - id: D7
    description: "Back on every step after the first returns to the previous selector with the earlier choice still applied and still marked as chosen; Back from the day step does not exist (D-03)"
    requirement: PLAN-06
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#returns from the time step to the day step with the day still chosen"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#returns from the review step to the time step with the hour still chosen"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#lands on the day step after two Backs, never on an error"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#refuses a Back that would move the round below the first step"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#returns to each selector with the earlier choice still applied, on the real card"
        status: pass
    human_judgment: false
  - id: D8
    description: "The review card shows the chosen day, time, duration and the active roster as the lineup through memberLabel, escaped exactly once, with Confirm and Back one control per row and no dead control (D-04/D-09/D-11)"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#lists the active roster as the lineup, ordered and safely labelled"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#escapes a member's display name in the rendered card, exactly once"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#carries Confirm and Back in declared rows, one control per row"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#says the availability round is next and ships no dead control"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#carries the same anchor from a slot tap to the review step"
        status: pass
    human_judgment: false
  - id: D9
    description: "A member deactivated on the roster is neither shown on the review card nor snapshotted at confirm time"
    verification:
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#never snapshots a member who was removed from the roster"
        status: pass
    human_judgment: false
  - id: D10
    description: "The wizard reads correctly to a band member in a live Telegram group — card copy, glyph legibility and the confirmation wording"
    verification: []
    human_judgment: true
    rationale: "Every card in this plan is chat copy under parse_mode HTML. Phase 1 findings F-1, F-2 and F-9 were all defects that every test passed through and only a live run caught; glyph rendering and label width in a real Telegram client are not observable from a serialized keyboard."

duration: 22min
completed: 2026-08-31
status: complete
---

# Phase 2 Plan 05: Closing the Wizard Summary

**Back on every step after the first, a review card that lists the exact lineup Confirm will snapshot, and a Confirm that promotes the round, releases the week and writes the participant snapshot in one PostgreSQL transaction.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-31T20:28:00Z
- **Completed:** 2026-08-31T20:50:00Z
- **Tasks:** 2 (4 TDD gates)
- **Files modified:** 10 (1 created)

## Accomplishments

- `PlanningService.confirm` is one `$transaction` that promotes the round, writes `startsAt`/`endsAt`, sets `activeWeekStart` to NULL and creates one `PlanningParticipant` row per active roster member. `status` and `activeWeekStart` move in the same guarded `updateMany`, so the binding invariant from 02-01 holds structurally rather than by discipline.
- `PlanningService.back` walks `REVIEW → TIME → DAY` and never clears `selectedDate` or `selectedStartMinute`. The destination card marks the surviving choice with its own glyph, so the author can see their earlier choice is still applied — D-03's actual promise, not just its column-level shadow.
- The review card lists the current active roster as the lineup (D-09) through `memberLabel` and `sortRosterMembers`, ships `Confirm rehearsal` and `Back` one control per row, and says the availability round is next. Broken window 19 is closed: an author who picks a time now lands on a card they can act on.
- `listActiveMemberships` is one free function over a client, so `/roster`, the review card and the confirm transaction all read the same predicate. There is no second definition of "active member" for the lineup to drift from.
- 14 integration cases against real PostgreSQL 18.4, every assertion made against the database: a promotion that released the week but forgot the lineup, or snapshotted the lineup but kept the week, would be invisible to a service-level double.

## Task Commits

1. **Task 1 (RED): Back and the review card** — `2933852` (test)
2. **Task 1 (GREEN): Back on every step after the first, and a review card** — `9f00ae7` (feat)
3. **Task 2 (RED): the confirm suite against real PostgreSQL** — `cdcfa8c` (test)
4. **Task 2 (GREEN): Confirm as one atomic transaction** — `1d73f34` (feat)
5. **Coverage fix from a mutation check: D-03 end to end** — `e738a7a` (test)

## Verification

| Gate | Baseline | Result |
|---|---|---|
| `npm run format:check` | clean | clean |
| `npm run build` (`tsc --noEmit`) | clean | clean |
| `npm run test:unit` | 185/185 | **203/203** |
| `npx vitest run --project integration` | 46/46 | **60/60** |

`tests/integration/planning-round.test.ts` and `tests/integration/chat-readiness.e2e.test.ts` both pass.

Acceptance greps:

| Check | Result |
|---|---|
| `grep -n "export function escapeHtml" src/telegram/roster-renderers.ts` | matches (line 24) |
| exactly one escaper in `src/telegram/` | 1 file |
| `grep -c "memberLabel" src/telegram/planning-renderers.ts` | 4 |
| `grep -rnE "firstName\|lastName\|username" src/telegram/planning-renderers.ts` | no match |
| `grep -rniE "coming soon\|placeholder\|not yet\|disabled" src/telegram/planning-renderers.ts` | no match |
| `grep -c "activeWeekStart: null" src/domain/planning/planning-service.ts` | 1 |

## Mutation checks

Every guard in the Confirm transaction was disabled, the failing tests recorded, and the guard restored.

| Mutation | Result |
|---|---|
| Remove `activeWeekStart: null` from the promotion | **5 red** — the happy path, the week release, the empty-roster recovery, the replay and the concurrency case |
| Remove `planningParticipant.createMany` | **6 red** — the happy path, single member, deactivated member, empty-roster recovery, replay, concurrency |
| Remove `if (consumed.count !== 1) return duplicate` | **1 red** — concurrency only (see finding below) |
| Make `back` clear `selectedDate` / `selectedStartMinute` | **3 red unit, 0 red integration** (see finding below) |

**Finding 1 — the exactly-once gate is not what prevents the double write.** Removing `consumed.count !== 1` left the sequential replay case GREEN, because the earlier `action.consumedAt !== null` read already catches a replay, and left the concurrent case failing only on its *wording*: the loser reported `stale` instead of `duplicate`, because the `expectedRevision`-guarded promotion refused it anyway. Exactly one promotion still happened and no duplicate participant rows were created. So the two guards are layered — the revision guard is what makes a double promotion impossible, and the atomic compare-and-set is what makes the loser's answer honest ("Already applied." rather than "send /plan to start again"). Both are kept; neither is redundant, but only one of them is protecting the data.

**Finding 2 — D-03 had no end-to-end coverage, and a mutation proved it.** Making `back` clear the earlier choice reddened three unit tests and left the entire integration suite green. D-03 is a promise about the card a mis-tapping band member is looking at, so the gap was closed rather than noted: commit `e738a7a` adds a case that walks `REVIEW → TIME → DAY` through the real dispatcher, asserts the chosen glyph sits on the right button at each stop and that the day card offers no way further back, then walks forward over the same choices and confirms.

## Deviations from Plan

### 1. [Rule 2 — Missing Critical] The empty-roster refusal happens before the callback row is consumed

- **Found during:** Task 2
- **Issue:** 02-RESEARCH.md Pattern 9 and the plan's `<action>` both order the transaction as *consume, then check the roster*. The review card mints exactly one Confirm token. Under that order, a chat with an empty roster taps Confirm, is told "add band members with /roster_add", does so — and the next tap answers `Already applied.` and does nothing, forever. The card is dead and the only recovery is `/plan` from the top. An actionable message the author cannot then act on is not actionable.
- **Fix:** Every read-only refusal (round state, author, empty roster, snapshot re-validation, wall-clock resolution) runs before the `updateMany ... consumedAt: null`. This mirrors the `past-day` and `past-slot` refusals that 02-03 and 02-04 both established for exactly this reason. The consumption is still the single atomic gate in front of every write, so idempotency and concurrency are unaffected — both are asserted, and the mutation check above shows which guard carries which property.
- **Files modified:** `src/domain/planning/planning-service.ts`
- **Verification:** `tests/integration/planning-confirm.test.ts#leaves the SAME card usable once members are added`
- **Committed in:** `1d73f34`

### 2. [Rule 2 — Missing Critical] `confirm` returns a sixth kind, `not-author`

- **Found during:** Task 2
- **Issue:** The plan specifies the closed union `"confirmed" | "empty-roster" | "duplicate" | "stale" | "failed"`. `selectDay` and `selectTime` both resolve authorship from `PlanningRound.authorUserId` and return `not-author`; T-02-01 states this plan must not weaken the refusal that already exists. Folding a non-author's tap into `stale` would tell them to start their own plan rather than that the round belongs to someone else.
- **Fix:** `not-author` added to `ConfirmResult` with its own dispatcher branch and the existing `NOT_AUTHOR` copy.
- **Files modified:** `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts`
- **Committed in:** `1d73f34`

### 3. [Rule 2 — Missing Critical] `failed` carries its caught value

- **Found during:** Task 2
- **Issue:** The plan requires that on a persistence failure "the caught value is logged bound under `err`". A `catch { return { kind: "failed" } }` in the service discards the cause, and the service has no logger; the surface would have had to synthesize a placeholder `Error`, leaving an operator with a generic apology and nothing behind it (finding F-4).
- **Fix:** `ConfirmResult`'s `failed` member carries `error: unknown`; the dispatcher binds it under `err` via `logPlanningFailure` with a new `confirm` catch site.
- **Verification:** `tests/integration/planning-confirm.test.ts#returns the failure result rather than throwing at the surface`
- **Committed in:** `1d73f34`

### 4. Two 02-04 integration assertions pinned the defect this plan closes

- **Found during:** Task 1
- **Issue:** The plan's `<verification>` says `tests/integration/planning-round.test.ts` must still pass. Two of its assertions could not hold: one asserts the time card's keyboard is exactly the ten slot rows (this plan adds the D-03 Back row), and one asserts `keyboardRows(reviewed).flat()).toEqual([])` — the review card having no buttons at all, which IS broken window 19. This is the third of four plans in this phase to carry a verification line its own purpose contradicts.
- **Fix:** Both tightened rather than relaxed. The time card now asserts the Back control is on its **own trailing row** (not merely present), because sharing a row is what truncated a label in Phase 1 (F-9). The review card now asserts no slot label survives the step **and** that the two controls appear one per row.
- **Files modified:** `tests/integration/planning-round.test.ts`
- **Committed in:** `9f00ae7`

### 5. `escapeHtml` is exported but not imported into `planning-renderers.ts`

- **Found during:** Task 1
- **Issue:** The plan says to export `escapeHtml` and "use it for every interpolated string that did not originate in this codebase". On the review and confirmation cards the only foreign strings are member display names, and they arrive through `memberLabel`, which already escapes. Running the escaper over them again would render `&amp;amp;` and `&amp;lt;b&amp;gt;` to the band — a real bug, and precisely the double-encoding failure a second escaper causes.
- **Fix:** `escapeHtml` is exported (the plan's stated purpose — one escaper, one place to get wrong — and the acceptance grep both hold), and `planning-renderers.ts` escapes nothing itself. The escaping test asserts the **rendered card** contains the escaped form once and neither `&amp;amp;` nor `&amp;lt;`, so a future second escaper in this module turns it red.
- **Committed in:** `9f00ae7`

### 6. `expectedRevision` accepts `null`, and the "bump between mint and confirm" case is asserted differently

- **Found during:** Task 2
- **Issue:** The plan's behaviour list says to test a stale revision by "bumping the round's `revision` between mint and confirm". That scenario is not reachable through the dispatcher: nothing carries a mint-time revision — the `CallbackAction` row has no revision column, the target schema for `confirm` is `.strict()` with only `roundId`, and the wire token carries nothing. Any handler-side read would happen *after* the bump and would simply observe the new value.
- **Fix:** `expectedRevision: number | null` where `null` means "the round's own revision inside this transaction" — the guard `selectDay` and `selectTime` already use, and what the dispatcher passes. The guard itself is asserted two ways: an explicit mismatched revision at the service boundary, and a **real** end-to-end stale path — the author taps Back on the review card (bumping the revision and moving the round to `TIME`), then taps the Confirm button still on their screen. The token is unconsumed and unexpired; only the round says no.
- **Committed in:** `1d73f34`

---

**Total deviations:** 6 (3 missing-critical auto-fixes, 3 plan-instruction corrections)
**Impact on plan:** No scope creep. Every deviation either strengthens a guarantee the plan asked for or corrects an instruction that could not hold as written; all six are asserted by tests.

## Issues Encountered

- `createWritablePrisma` in `tests/unit/planning-time-card.test.ts` needed a `chatMembership.findMany` stub once the REVIEW card started reading the active roster. Added to the double rather than to production code.
- The `renderTimeStep.length === 2` assertion from 02-04 constrains the renderer's arity. The Back control token is therefore an **optional** third parameter with a default, which keeps `Function.length` at 2 and keeps that guard meaningful.

## Flagged: the roster-change-during-review edge (PLAN-08)

02-01 and 02-04 both flagged this and the plan asks for an explicit answer rather than silence. **The question:** what happens when a roster member is deactivated between the review card being rendered and the Confirm tap?

**What this plan does:** the transaction is the truth. The lineup is read once, inside the confirm transaction, through the same predicate the review card used, and that read is what is snapshotted. A membership change committing between the render and the tap therefore *is* reflected in the snapshot, and the author's review card can differ from what was committed.

**What this plan does about the divergence being silent:** it isn't silent any more. `confirm` returns the members it actually snapshotted, and the terminal confirmation card is rendered from **that** list rather than from a fresh roster read. The author sees the committed lineup on the card that replaces the one they read, so a difference is visible rather than absorbed. This is a mitigation, not a re-confirm gate: a `re-render-and-reconfirm` loop was not built, because nothing in Phase 2 establishes what should happen if the roster keeps changing.

**What remains uncovered:** there is no test for the interleaving itself (a deactivation committing *between* the render and the transaction), because provoking it deterministically needs a scheduling seam the code does not have. `#never snapshots a member who was removed from the roster` covers the steady state — a member removed before the wizard runs is neither shown nor snapshotted — and the concurrency case covers two confirms racing each other, but not a confirm racing a roster edit. A reviewer deciding whether Phase 3 needs a re-confirm gate should start there.

## Known Stubs

None. Broken window 19 (`.planning/WINDOWS.md`) is closed by this plan: the REVIEW step now carries live Confirm and Back controls, and `open_count` is 0.

No new ledger entries were recorded — no stub, skipped test or unrun `<verify>` was left behind. Both `<verify>` commands in the plan were run and passed.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or trust-boundary schema change was introduced. Every threat in the plan's register (T-02-03, T-02-04, T-02-06, T-02-09, T-02-11, T-02-20, T-02-01) is mitigated and asserted; `T-02-SC` had no install task.

## Next Phase Readiness

Phase 3 has the exact record it needs. A `CONFIRMED` `PlanningRound` carries `startsAt`, `endsAt`, `confirmedAt` and a NULL `activeWeekStart`, and its `PlanningParticipant` rows are the lineup — one per active roster member at confirm time, each carrying both `telegramUserId` and `membershipId`. `previousRehearsal()` returns non-null for the first time once such a round's `startsAt` is behind the clock, and `wasPreviousParticipant` now has rows to read for the `PREVIOUS_PARTICIPANTS` planning-access policy.

Still open in this phase and NOT delivered here: administrator takeover of an abandoned round (D-12/D-13, AUTH-03), the status re-post (D-14/D-15, PLAN-10), and the `cancel` planning target, which parses but has no dispatcher branch and is refused as `unsupported-action`.

Concerns for whoever picks up next:

- **A `cancel` tap answers "This planning action is no longer available."** No `cancel` action is minted by any step, so it is unreachable from a button today — but the target member exists in the schema and the copy is wrong for it if a later step mints one.
- **`AVAIL-06` and `LIFE-05` still assume a per-round participant set** that the author adjusts. D-09 made the roster the lineup. 02-CONTEXT.md defers that reconciliation to the Phase 3 and Phase 4 discussions; it has not happened yet.
- **The live-run gap.** D10 in the coverage block is the only human-judgment deliverable and it is genuinely open: every card in this plan is chat copy, and Phase 1 findings F-1, F-2 and F-9 were all defects that every test passed through and only a live Telegram run caught.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-08-31*
