---
phase: 02-weekly-rehearsal-proposal
plan: 04
subsystem: planning
tags: [dst, intl, timezone, telegram, grammy, prisma, vitest]

requires:
  - phase: 02-01
    provides: The CONFIRMED durable round contract — PlanningRound's timezone/window snapshot columns and the exactly-once CallbackAction consumption template
  - phase: 02-02
    provides: The vertical slice — generateSlots, renderTimeStep, PLANNING_SLOT_ROW_SIZES, the anchor-card edit discipline, and the slot-tap stub this plan closes
  - phase: 02-03
    provides: The day step — DayMarker/classifyDay ordering, the glyph vocabulary, the legend-above-the-keyboard position, and the "past-day" refusal shape mirrored here
provides:
  - resolveWallClock — total three-way unique/ambiguous/skipped wall-clock resolution with no time library
  - slotAvailability — the available/past/nonexistent split, decided on instants
  - PlanningService.selectTime and its past-slot / nonexistent-slot refusals
  - buildTimeStepProjection, SlotMarker and the time card's marker classification
  - renderReviewStep — the keyboard-less review card the REVIEW step lands on
affects: [02-05 confirm step, availability collection, reminder scheduling, any later civil-to-instant conversion]

actuals:
  tokens: 20958
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "The single Intl seam: all DST reasoning lives in src/infrastructure/time/zoned-clock.ts; everything above it is civil arithmetic"
    - "Unrepresentable-not-discouraged: the skipped variant carries no instant, so the prohibited silent shift cannot be written"
    - "One ordered classification per selector, so D-08's tie rule is structural rather than conventional"
    - "One shared glyph map across both selectors, so D-07's single unavailability rule cannot drift into two"
    - "Same glyph on the card, distinct bounded reason in the logs and distinct copy in the alert"

key-files:
  created:
    - tests/unit/zoned-clock.test.ts
    - tests/unit/slot-generation.test.ts
    - tests/unit/planning-time-card.test.ts
  modified:
    - src/infrastructure/time/zoned-clock.ts
    - src/domain/planning/slot-generator.ts
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/keyboards.ts
    - tests/integration/planning-round.test.ts

key-decisions:
  - "WallClockResolution's skipped variant carries NO instantMs, deviating from the 02-RESEARCH.md snippet. The research shape exposed `naive - before`, which for Kyiv 2027-03-28 03:00 is the instant the zone reads as 04:00 — precisely the silent shift this plan prohibits. Removing the field makes the prohibited relocation unrepresentable instead of merely discouraged."
  - "The REVIEW step renders with no keyboard, so the time buttons cannot outlive the step that owned them (D-01). Confirm and Back are minted by 02-05."
  - "past-slot and nonexistent-slot share the 🚫 glyph (D-07) but keep distinct log reasons (hour-behind-chat-clock / hour-removed-by-clock-change) and distinct private-alert copy: telling an author that a future hour 'has already passed' would be false and they would tap it again."
  - "The integration assertion of ten BARE slot labels was updated to the glyph-marked labels the fixture clock produces. It contradicted this plan's own PLAN-07/D-07 requirement and could not be left unmodified."

patterns-established:
  - "Mutation-checking a guard: disable it, name the tests that turn red, restore. Recorded below for the containment rule and both refusals."
  - "Time-card tests are written to read like day-card tests, so a divergence between the two selectors shows up as a divergence between two test files."

requirements-completed: [CONF-04, PLAN-06, PLAN-07]

coverage:
  - id: D1
    description: "A wall clock resolves totally in any IANA zone: unique, ambiguous (earlier occurrence returned), or skipped — verified against real Europe/Kyiv, America/New_York and Australia/Lord_Howe transitions including a 30-minute shift"
    verification:
      - kind: unit
        ref: "tests/unit/zoned-clock.test.ts#classifies every verified case exactly as the recorded matrix says"
        status: pass
      - kind: unit
        ref: "tests/unit/zoned-clock.test.ts#returns the EARLIER occurrence of a repeated wall clock"
        status: pass
      - kind: unit
        ref: "tests/unit/zoned-clock.test.ts#reads a HALF-hour offset where the zone has one"
        status: pass
    human_judgment: false
  - id: D2
    description: "The default 10:00-19:00 rehearsal window is untouched by a DST transition — all ten slots resolve uniquely on a spring-forward day"
    verification:
      - kind: unit
        ref: "tests/unit/zoned-clock.test.ts#leaves the default rehearsal window untouched on a transition day"
        status: pass
    human_judgment: false
  - id: D3
    description: "Slots are generated at exact 60-minute steps and only where the whole rehearsal fits at BOTH ends of the configured window; a window too short yields an empty list, and a non-hour window start is never snapped to the hour"
    requirement: "CONF-04"
    verification:
      - kind: unit
        ref: "tests/unit/slot-generation.test.ts#yields exactly ten slots, 10:00 through 19:00, for the defaults"
        status: pass
      - kind: unit
        ref: "tests/unit/slot-generation.test.ts#offers 10:00 because starting exactly at the floor is inside the window"
        status: pass
      - kind: unit
        ref: "tests/unit/slot-generation.test.ts#yields an EMPTY list when no whole rehearsal fits, never a truncated one"
        status: pass
      - kind: unit
        ref: "tests/unit/slot-generation.test.ts#steps by exactly sixty minutes and never snaps to the hour"
        status: pass
      - kind: unit
        ref: "tests/unit/slot-generation.test.ts#satisfies BOTH halves of the containment rule across a spread of windows"
        status: pass
    human_judgment: false
  - id: D4
    description: "The author can select a valid generated slot: selectedStartMinute is persisted, the step advances to REVIEW, and the one anchor card is edited in place with no second message"
    requirement: "PLAN-06"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#persists the minute, advances to review, and edits the one anchor card"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#issues exactly one editMessageText and no second message (D-01)"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#carries the same anchor from a slot tap to the review step"
        status: pass
    human_judgment: false
  - id: D5
    description: "The configured default start and the previous rehearsal's chat-local start carry their markers, and when they coincide only the default marker is shown"
    requirement: "PLAN-07"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#marks the slot matching the chat's configured default start"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#marks the slot matching the previous rehearsal's chat-local start"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#shows only the default marker when the two coincide"
        status: pass
    human_judgment: false
  - id: D6
    description: "Hours already past on the chosen day are rendered, marked and refused — visible, never hidden — with the action row left spendable"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#marks the four hours behind a 13:30 chat clock and still shows ten"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-round.test.ts#refuses an hour already behind the chat's clock, leaving the card usable"
        status: pass
    human_judgment: false
  - id: D7
    description: "An hour that does not exist because of a spring-forward transition is refused with the same visible marker as a past hour, and is never relocated to a neighbouring instant"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#refuses it rather than relocating it to a neighbouring hour"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#still renders the slot, and marks it with the unavailable glyph"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#tells the two refusals apart in the logs and in what it says"
        status: pass
    human_judgment: false
  - id: D8
    description: "A tapped minute the round's own window snapshot does not admit is refused rather than applied (T-02-18: rendering is not authority)"
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#refuses a minute the round's own window does not admit"
        status: pass
    human_judgment: false
  - id: D9
    description: "The time card reads well in a live Telegram group: no HH:MM label truncates in the 3/3/3/1 layout and the 🚫 glyph reads as unavailable rather than as decoration"
    verification: []
    human_judgment: true
    rationale: "Telegram sizes inline-keyboard buttons by rendered row width on the client, which no unit or Testcontainers test observes. The plan defers this to the live run; the 24-visible-character rule is asserted, but whether the glyph reads as a refusal to a band member is a judgment call."

duration: 20 min
completed: 2026-08-31
status: complete
---

# Phase 02 Plan 04: Total DST Policy and the Time Step Summary

**A zero-dependency `Intl` wall-clock resolver that classifies every hour as unique, ambiguous or skipped, wired into a time card that offers exactly the hours the chat's window admits and refuses — visibly, never silently — the ones that have passed or do not exist.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-08-31T14:12:00Z
- **Completed:** 2026-08-31T14:32:11Z
- **Tasks:** 2
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- **The `STATE.md` DST concern is closed.** The policy is recorded verbatim in `02-04-PLAN.md`'s `<dst_policy>` block and is now ENFORCED by `tests/unit/zoned-clock.test.ts`, which reproduces 02-RESEARCH.md's empirically verified matrix on this runtime. All six research rows plus a fixed-offset control pass. No time library was added — `git diff package.json package-lock.json` is empty for the whole plan.
- **`resolveWallClock` is total.** Probes the zone offset a day either side of the naive instant and keeps only self-consistent candidates: one survivor is `unique`, two are a fall-back repeated hour whose EARLIER occurrence is returned (DST policy rule 3), zero is a spring-forward gap. Correct on the 30-minute Australia/Lord_Howe shift, which is the case that separates a correct resolver from a plausible one.
- **`slotAvailability` splits `past` from `nonexistent` and decides past-ness on INSTANTS**, not civil minutes — which is what keeps the answer right on a transition day, where a repeated hour has two instants and one can already be behind the chat while the other is not.
- **The slot-tap stub is closed.** Broken-windows entry 18 (`Tapping an hourly-slot button on the time card is refused with the stale alert; selectTime is 02-04 work`) is marked `fixed`, and two new Testcontainers tests carry the tracer from `/plan` through a day and an hour to `REVIEW` on real PostgreSQL.
- **Both markers and both refusals ship together**, with the ordering that makes an unavailable hour beat both hints and the default beat the previous rehearsal (D-08).

## Task Commits

1. **Task 1: Total DST resolution and the hourly slot list** — `09b4ecc` (test, RED) → `2479d6d` (feat, GREEN)
2. **Task 2: The time card — markers, refusals, and the advance to review** — `231eaac` (test, RED) → `70a68b8` (feat, GREEN)

No REFACTOR commit was needed on either task; neither implementation had duplication to remove once green.

## Files Created/Modified

- `src/infrastructure/time/zoned-clock.ts` — `WallClockResolution` and `resolveWallClock`; `formatterFor` exported so the per-zone memo can be pinned by identity
- `src/domain/planning/slot-generator.ts` — `slotAvailability` and `SlotAvailability`
- `src/domain/planning/planning-service.ts` — `SlotMarker`, `TimeStepCell`, `TimeStepProjection`, `classifySlot`, `buildTimeStepProjection`, `timeStepProjection`, `rehearsalStartMinute`, `SelectTimeResult`, `selectTime`
- `src/telegram/planning-renderers.ts` — `PLANNING_TIME_LEGEND`, `slotButtonLabel`, `renderTimeStep` rewritten to take a projection, `renderReviewStep`; the glyph map widened to cover both selectors
- `src/telegram/planning-handlers.ts` — `time` routing, the `past-slot` / `nonexistent-slot` branches with distinct bounded reasons, `renderStep` split three ways, `markupOf`
- `src/telegram/keyboards.ts` — the F-9 comment extended to cover marker-prefixed slot labels
- `tests/unit/zoned-clock.test.ts` — the DST matrix (created)
- `tests/unit/slot-generation.test.ts` — REQ-CONF-04 boundary and precision, plus `slotAvailability` (created)
- `tests/unit/planning-time-card.test.ts` — REQ-PLAN-06 / REQ-PLAN-07 (created)
- `tests/integration/planning-round.test.ts` — two new end-to-end tests; one stale assertion updated (see Deviations)

## Decisions Made

**1. `skipped` carries no instant.** 02-RESEARCH.md's Pattern 1 snippet returns `{ kind: "skipped", instantMs: naive - before }`. For Europe/Kyiv 2027-03-28 03:00 that value is 01:00 UTC, which the zone reads back as **04:00** — exactly the "shows one time, means another" outcome the plan's prohibition forbids. The plan's own `<action>` text annotates a payload only for `ambiguous`, so omitting it is consistent with the plan; it makes the forbidden relocation unrepresentable rather than merely discouraged. `tests/unit/zoned-clock.test.ts` asserts `Object.keys(resolution)` is exactly `["kind"]`.

**2. The REVIEW card has no keyboard.** Leaving the time buttons live on an anchor whose round has already advanced would let a second tap fight the first, against D-01's one-card discipline. Telegram's `editMessageText` drops the markup when `reply_markup` is omitted, so `markupOf` spreads the key in only when a step has one.

**3. One glyph, two reasons.** D-07 asks for one consistent unavailability rule across both selectors, so a past hour and a clock-change hour share `🚫`. But they keep separate log reasons (`hour-behind-chat-clock`, `hour-removed-by-clock-change`) and separate alert copy, because telling an author that a *future* hour "has already passed" is false and they would simply tap it again.

**4. `previousRehearsal()` still returns null.** Nothing reaches `CONFIRMED` until 02-05, so the previous-time marker is currently unreachable in production. It is fully covered at the pure-projection level, exactly as 02-03 left the day card's equivalent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] `renderReviewStep` added so the advance has something to render**

- **Found during:** Task 2
- **Issue:** The plan requires `selectTime` to "edit the anchor message in place", but `renderStep` had no `REVIEW` branch — it would have rendered a time card reading "Choose a start time." onto a round that had already chosen one, leaving the spent time buttons live.
- **Fix:** Added `renderReviewStep(selectedDate, startMinute, durationMinutes)` returning text and no keyboard, and split `renderStep` three ways.
- **Files modified:** `src/telegram/planning-renderers.ts`, `src/telegram/planning-handlers.ts`
- **Verification:** `tests/integration/planning-round.test.ts#carries the same anchor from a slot tap to the review step` asserts the edited card's keyboard is empty and `startsAt`/`endsAt` are still null.
- **Committed in:** `70a68b8`

**2. [Rule 3 — Blocking] `exactOptionalPropertyTypes` rejected a `reply_markup: undefined`**

- **Found during:** Task 2
- **Issue:** With no keyboard on the review card, passing `reply_markup: card.keyboard` failed `tsc` at both call sites under the project's `exactOptionalPropertyTypes: true`.
- **Fix:** Added `markupOf(card)`, which spreads `{ reply_markup }` only when a keyboard exists.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `npm run build` exits 0.
- **Committed in:** `70a68b8`

**3. [Rule 3 — Blocking] TypeScript narrowing lost inside a closure**

- **Found during:** Task 2
- **Issue:** `target.data.startMinute` did not typecheck inside the `generateSlots(round).some(...)` callback — property narrowing on a discriminated union does not survive into a nested function expression.
- **Fix:** Bound `const startMinute = target.data.startMinute` once after the discriminant check and used it throughout.
- **Files modified:** `src/domain/planning/planning-service.ts`
- **Verification:** `npm run build` exits 0.
- **Committed in:** `70a68b8`

### Verification line that could not be satisfied as written

**Task 2 acceptance criterion: `npx vitest run --project integration` exits 0 — 02-02's tracer path still works end to end.**

This criterion was satisfiable only by MODIFYING one existing assertion, and I am flagging it rather than passing it quietly.

`tests/integration/planning-round.test.ts:325` asserted the ten slot labels as **bare** strings (`"10:00" … "19:00"`). This plan's own PLAN-07 truth requires the default-start slot to carry `⭐`, and its D-07 truth requires hours already past on the chosen day to carry `🚫`. The integration fixture's clock is `2026-08-26T09:00:00Z` — 12:00 in Kyiv — and the chosen day is that same Wednesday, so 10:00, 11:00 and 12:00 are behind the chat. The assertion therefore contradicted the plan it was being run against; it could not pass unmodified while the plan was correctly implemented.

**What I did:** updated the expectation to `["🚫 10:00", "🚫 11:00", "🚫 12:00", "13:00", …]` and added a comment recording why. The failure was the predicted one and nothing else in the suite moved — the run went from 44 passed to 1 failed / 43 passed, and only that single assertion. Note the marking is itself evidence the ordering rule works: the configured default start IS 10:00, and it shows no star, because an unavailable hour beats both hints.

I did NOT weaken the assertion (it is still an exact `toEqual` over all ten labels) and I did NOT skip it.

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 blocking) + 1 flagged unsatisfiable verification line.
**Impact on plan:** All three auto-fixes were required to make the plan's own mandated behaviour compile and render. No scope creep — no dependency added, no schema change, no new Prisma model, column or enum member.

## Mutation Checks

The verification guidance asks for guards to be mutation-checked rather than assumed. Three were, each disabled, run, and restored:

| Guard disabled | Result | Tests that turned red |
|---|---|---|
| `slotAvailability`'s past comparison (`return "available"` always) | **RED, 9 tests** | the four `slot-generation.test.ts` availability cases, `lets an unavailable hour beat both hints`, `marks the four hours behind a 13:30 chat clock`, and all three refusal tests |
| `slotAvailability`'s `skipped → "nonexistent"` mapping | **RED, 5 tests** | `calls a wall clock that does not exist nonexistent, not past`, `still renders the slot, and marks it with the unavailable glyph`, and the three refusal tests |
| `validateSchedule`'s containment FLOOR half (the F-5/F-6 repair) | **GREEN — see below** | none |

**The containment-floor result is worth reporting honestly.** Disabling the floor half of `validateSchedule` alone did **not** turn `slot-generation.test.ts` red, because `generateSlots` starts its loop AT `dailyStartMinute` and therefore never proposes a minute below the floor for the delegated rule to reject. The two guards are genuinely redundant. I verified the pair rather than assuming:

- floor disabled + loop start left alone → **green** (loop start covers it)
- floor restored + loop start moved to `0` → **RED, 2 tests** (`steps by exactly sixty minutes and never snaps to the hour`, `satisfies BOTH halves of the containment rule`) — the delegated floor catches the out-of-window starts, so the label assertions still pass, but the precision assertions do not
- **both** disabled → **RED, 7 tests**, including the direct `not.toContain(540)` proving 09:00 reappears

So each guard is pinned by at least one test, and 09:00 can only reappear if both are broken. No second copy of the containment comparison was written: `grep -rnE "dailyEndMinute|dailyStartMinute" src/domain/planning/slot-generator.ts | grep -cE "[<>]=?"` returns `0`, unchanged from before this plan.

## Verification Results

| Check | Result |
|---|---|
| `npm run format:check` | pass |
| `npm run build` (`tsc --noEmit`) | pass |
| `npm run test:unit` | **185 passed** (baseline 138 + 47 new) |
| `npx vitest run --project integration` | **46 passed** (baseline 44 + 2 new) |
| `git diff package.json package-lock.json` | empty |
| `grep -c "nonexistent" src/telegram/planning-handlers.ts` | 3 |
| containment-rule duplication grep | 0 |

**Deferred to the live Telegram run** (plan's own `<verification>`): screenshot the time card and confirm no `HH:MM` label truncates in the 3/3/3/1 layout and that `🚫` reads as unavailable rather than as decoration. Recorded as coverage deliverable D9 with `human_judgment: true`.

## Known Stubs

**The REVIEW step has no Confirm or Back button.** `selectTime` now advances a round to `REVIEW` and edits the anchor to a summary card ("Start 15:00, 120 minutes."), but the actions that let an author confirm or go back are minted by the confirm step, which is 02-05's work. An author who picks a time therefore lands on a card they cannot act on.

This is not an unwired stub in this plan's own deliverable — it is the seam between waves 4 and 5, and it only became reachable *because* this plan closed the slot-tap stub. It is recorded in `.planning/WINDOWS.md` as entry 19 (kind `stub`, phase 02) so it stays visible at ship time. `startsAt` / `endsAt` are deliberately left null here; per DST policy rule 4 they are written inside the Confirm transaction with `endsAt = startsAt + durationMinutes * 60_000`.

Broken-windows entry 18 (02-02's slot-tap stub) is now `fixed`; `open_count` moved from 1 to 0 and back to 1 with the new entry.

## Issues Encountered

- **No standalone development PostgreSQL is reachable in the worktree**, so Task 1's precondition could not be checked with `npx prisma migrate status` (it fails `P1001` against `localhost:5432`). I did not treat this as an unmet precondition: the precondition's substance is that 02-02's `planning_rounds` migration is committed and the schema has no drift, and both were established more strongly — the migration is committed at `5cfb8ff`, and the Testcontainers integration suite, which applies every migration to a fresh PostgreSQL 18 container, ran green (44/44) on the base commit before any work began.

## Flagged Assumptions Still Open

Both edges the plan flagged remain open and are unchanged by this work — recording them so they are not lost:

- **Empty slot list copy.** A chat whose window admits zero slots (duration longer than the window) gets `"No rehearsal fits inside this chat's daily window. Adjust it with /settings."`, inherited from 02-02. The generator's empty-list behaviour is now tested; the *copy* is still unspecified in CONTEXT, RESEARCH and the plan.
- **A previous rehearsal outside the current window.** If the band last played at 21:00 and the window has since been narrowed to close at 19:00, no slot matches and no previous marker is shown. That is the current design; whether it is the intent is unconfirmed.

## User Setup Required

None — no external service configuration required, and no dependency was added.

## Next Phase Readiness

Ready for **02-05 (confirm)**. What it inherits:

- `resolveWallClock` is the one place to compute `startsAt` from the round's civil pair plus its `timezone` snapshot. `endsAt = startsAt + durationMinutes * 60_000` — exact elapsed time (DST policy rule 4); a rehearsal spanning a fall-back transition is two real hours, not three wall-clock hours. Note that a `skipped` resolution has **no** instant, so the Confirm transaction must handle that variant rather than assume `instantMs` exists (the type will force it to).
- `stepTargets` returns `[]` for `PlanningStep.REVIEW`, so `mintStepActions` currently mints nothing on the advance. 02-05 adds the `confirm` / `back` targets to that switch and the buttons appear with no other change.
- `renderReviewStep` is where the confirm keyboard attaches; `renderStep`'s third branch already routes there, and `markupOf` already handles a step gaining a keyboard.
- The `PLANNING_OUTCOMES` and `PLANNING_REASONS` allow-lists are the place to add the confirm step's bounded classifications.

**Concern to carry forward:** the REVIEW dead end described under Known Stubs is user-visible from now until 02-05 lands. If a live run happens before then, an author will be able to pick a time and get stuck.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-08-31*
