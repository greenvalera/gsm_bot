---
phase: 03-availability-and-booking-decision
plan: 02
subsystem: ui
tags: [grammy, telegram, vitest, testcontainers, prisma, postgres]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-01's tracer: the availability migration, the shared never-consumed
      answer tokens, availabilityOutcome / availabilityStepProjection,
      answerAvailability with its per-participant compare-and-set, the
      dispatchAvailabilityAnswer branches, and the answer catch site"
  - phase: 02-weekly-rehearsal-proposal
    provides:
      "The day/time legend pattern, the roster collator and memberLabel, the
      PLANNING_REASONS / PLANNING_OUTCOMES bounded vocabulary, and the BRANCHES
      logging gate this plan extends"
provides:
  - "PLANNING_AVAILABILITY_LEGEND, its fixed order constant and the used-markers filter — the card's D-08 legend"
  - "The one closing outcome sentence per AvailabilityOutcome, chosen from the projection and never re-derived (D-05)"
  - "tests/unit/planning-availability-card.test.ts — the card's whole surface, including the AVAIL-04 adjacency / empty / ordering probe edges"
  - "A 200-character bound on every exported planning refusal, including the one that interpolates an untrusted member label"
  - "isFloodControl and the deliveryFlood catch site — a 429 is classified and absorbed, never retried in the chat-sequentialized handler"
  - "AnswerResult.answered.owner — the card keeps its author attribution on every re-render"
  - "Seven new BRANCHES entries: the six availability answer branches plus the flood delivery branch"
affects:
  - 03-03-recovery-and-status
  - 03-04-ready-to-book-announcement
  - 03-05-manual-booking
  - phase-04-lifecycle
  - phase-05-reminders

actuals:
  tokens: 65363
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Italic legend line: the key is typographically distinct from the list it explains, so a line LEADING with a participant glyph is always a participant"
    - "Total copy map over a derived union (AvailabilityOutcome -> sentence), never a conditional chain at the render site"
    - "Runtime code-point bound on any alert that interpolates an untrusted label, computed from the same literals the message is built from"
    - "Error classification (not retry) at a delivery catch site inside a chat-sequentialized handler"

key-files:
  created:
    - tests/unit/planning-availability-card.test.ts
  modified:
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - src/domain/planning/planning-service.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-availability.test.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "The legend is rendered italic. It names the SAME glyphs the participant lines lead with, so without a typographic difference neither a reader nor an assertion could tell the key from the list — and the inherited `startsWith(marker)` participant count would have silently gained a phantom member"
  - "A blocked round KEEPS both answer controls. The plan's acceptance criterion reads 'the blocked-outcome render contains no control row', but D-04/D-05 make a blocked round still OPEN and its answers still changeable; dropping the buttons would make the state unrecoverable. The renderer adds no control of its own — that is the property actually asserted — and a projection with no minted tokens draws no row"
  - "planningNotAuthorText bounds its interpolated label at runtime rather than trusting the copy to be short. Telegram's names are 64+64 characters and its usernames 32, so the longest legitimate member produced a 224-character alert the Bot API would have rejected outright"
  - "Flood control is CLASSIFIED, not retried. A sleep inside a handler the chat-key sequentialize is holding would block every other update for that chat, on the one surface a whole band answers at once; the next answer re-renders the card anyway"
  - "The answer result carries the round's owner. The card is rebuilt from scratch on every tap, so an attribution line that survived publication but not the first answer would silently un-attribute the round"

patterns-established:
  - "Probe-edge naming: the adjacency / empty / ordering truths each have their own named unit case, so a shrinking suite is visible as a missing test rather than as a passing one"
  - "Refusal-length gate: an assertion that ITERATES the module namespace rather than a hand-kept list, so a refusal nobody thought to enumerate is still held to the cap"
  - "A participant double that EVALUATES the nullable-safe compare-and-set, so the duplicate branch is reached by production logic rather than by the test"

requirements-completed: [AVAIL-02, AVAIL-03, AVAIL-04]

coverage:
  - id: D1
    description:
      "The card renders one roster-ordered line per participant with a leading
      pending / can-attend / cannot-attend marker and a legend above the list
      that advertises only the markers actually in use (AVAIL-04, D-08)"
    requirement: AVAIL-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#renders one marked line per participant and exactly one count line"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#advertises only the markers the card actually uses"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#keeps the legend out of the participant list"
        status: pass
    human_judgment: false
  - id: D2
    description:
      "Overall completion is a single count line above the list; no separate
      outstanding-names line is rendered (AVAIL-04, D-09)"
    requirement: AVAIL-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#renders one marked line per participant and exactly one count line"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#renders one line and a one-of-one count for a single participant"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#lets a participant removed from the roster mid-round still answer and still count"
        status: pass
    human_judgment: false
  - id: D3
    description:
      "AVAIL-04 adjacency — two participants whose labels compare equal under the
      roster collator render as two distinct lines in a stable id-broken order,
      never merged and never swapped between renders"
    requirement: AVAIL-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#gives two collator-equal labels two stable lines, broken by Telegram id"
        status: pass
    human_judgment: false
  - id: D4
    description:
      "AVAIL-04 empty — a one-participant round renders one line and a one-of-one
      count; a zero-participant round is unreachable but the renderer stays total"
    requirement: AVAIL-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#renders one line and a one-of-one count for a single participant"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#stays total on the empty lineup Confirm already refuses"
        status: pass
    human_judgment: false
  - id: D5
    description:
      "AVAIL-04 ordering — the participant line order is fixed by the roster
      collator at every render and does not reshuffle as answers arrive"
    requirement: AVAIL-04
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#keeps the line order fixed however the answers arrived"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#moves only the markers as answers arrive, never the lines"
        status: pass
    human_judgment: false
  - id: D6
    description:
      "Tapping the other control overwrites a participant's previous answer;
      re-tapping the same one is an idempotent no-op with a private alert, no
      second durable transition and no anchor edit (D-04)"
    requirement: AVAIL-02
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#overwrites a participant's previous answer and moves answeredAt forward"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#treats re-tapping the same control as an idempotent no-op"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a re-tap of the answer a participant already gave"
        status: pass
    human_judgment: false
  - id: D7
    description:
      "A cannot-attend answer records and leaves the round open; once everyone has
      answered and at least one said no, the card states plainly that the slot
      does not work and offers no replan control (D-05)"
    requirement: AVAIL-02
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#records the refusal, leaves the round collecting and still names the author"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#closes the card with one sentence chosen from that outcome"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#offers no replan control and no copy implying one"
        status: pass
    human_judgment: false
  - id: D8
    description:
      "A current chat member outside the confirm-time snapshot is refused with a
      private alert naming only the reason, with no card edit and no token spent;
      a roster-removed snapshot member still answers and still counts
      (AVAIL-03, D-06/D-07)"
    requirement: AVAIL-03
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#refuses a current chat member who is not in the snapshot, privately and without an edit"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#lets a participant removed from the roster mid-round still answer and still count"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for an availability tap from outside the confirm-time snapshot"
        status: pass
    human_judgment: false
  - id: D9
    description:
      "Every exported refusal on the planning surface fits the Bot API's
      200-character answerCallbackQuery cap, including one with a maximal
      interpolated member label"
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds each exported refusal constant to the 200-character cap"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#holds the one refusal that interpolates a member label to the same cap"
        status: pass
    human_judgment: false
  - id: D10
    description:
      "Every new dispatch branch emits exactly one log line whose outcome-and-reason
      pair is unique across the whole enumeration, including the flood-control
      delivery failure a 429 now selects"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a card edit refused by Telegram flood control"
        status: pass
    human_judgment: false
  - id: D11
    description:
      "The availability card's wording, glyph legibility, legend/list separation
      and line scannability read correctly in a real Telegram group at
      band-roster size"
    verification: []
    human_judgment: true
    rationale:
      "Copy tone, emoji rendering and the visual weight of an italic legend
      against a marked list cannot be asserted from the serialized payload; the
      phase's UAT covers it at end-of-phase per the configured
      human_verify_mode."

# Metrics
duration: 18min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 02: Availability Card Breadth Summary

**The availability card is now complete — an italic legend over a stable roster-ordered marked list, one count line, one derived outcome sentence that never hints at a replan — and every answer branch is refusable, changeable and distinguishable in the logs.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-09-06T00:58:00Z
- **Completed:** 2026-09-06T01:16:00Z
- **Tasks:** 2
- **Files modified:** 6 (1 created)

## Accomplishments

- Finished the card D-08 and D-09 describe: a legend that advertises only the markers actually in use, one completion count line, and one roster-ordered line per participant whose position never moves as answers arrive.
- Made the legend italic so the structural invariant every reader and every assertion leans on — a line leading with a participant glyph IS a participant — survives a key that names the same three glyphs.
- Gave the card one closing sentence per derived outcome, chosen from `availabilityOutcome`'s result and never re-derived, with a blocked wording that states the fact and offers nothing Phase 3 cannot honour.
- Found and closed a real Bot API defect: `planningNotAuthorText` produced a 224-character alert for the longest legitimate Telegram identity, which Telegram rejects with a 400 — leaving the callback unacknowledged and the tapper's client spinning.
- Classified Telegram flood control as its own absorbed outcome rather than a generic delivery rejection, and deliberately did not retry: the handler runs inside the chat-key `sequentialize`, so a backoff there would stall every other update for that chat.
- Restored the card's author attribution, which had been silently dropped at the first answer.
- Extended the observability gate by seven branches, each driven through the real service against a double that evaluates the production compare-and-set.

## Task Commits

Each task was committed atomically; both were `tdd="true"`, so each carries a `test` commit followed by a `feat` commit.

1. **Task 1 (RED): the failing availability card suite** — `a247988` (test)
2. **Task 1 (GREEN): legend, outcome sentence and the bounded alert** — `30c4a91` (feat)
3. **Task 2 (RED): every answer branch and its bounded log line** — `b45a48c` (test)
4. **Task 2 (GREEN): flood classification and the author attribution** — `1b2c2d4` (feat)

_No refactor commit was needed on either task._

## Files Created/Modified

- `tests/unit/planning-availability-card.test.ts` — the new suite: 20 cases over the card's shape, the legend, the derived outcome, the two no-control renders, and the refusal-length gate
- `src/telegram/planning-renderers.ts` — `PLANNING_AVAILABILITY_LEGEND`, `AVAILABILITY_LEGEND_ORDER`, `availabilityLegendFor`, `AVAILABILITY_OUTCOME_SENTENCES`, and the completed `renderAvailabilityCard` body
- `src/telegram/planning-handlers.ts` — `CALLBACK_ALERT_LIMIT`, `boundedLabel`, the hoisted refusal halves, `isFloodControl`, the `deliveryFlood` catch site and its reason, and the owner passed into the answered re-render
- `src/domain/planning/planning-service.ts` — `AnswerResult.answered.owner`, resolved inside the answer transaction
- `tests/unit/planning-logging.test.ts` — the participant double, the callback `findMany`, a rejecting edit, and seven new `BRANCHES` entries
- `tests/integration/planning-availability.test.ts` — five new real-PostgreSQL cases: the overwrite, the idempotent re-tap, the snapshot refusal, the roster-removed participant, and the cannot-attend that keeps the round open
- `.planning/REQUIREMENTS.md` — AVAIL-02, AVAIL-03 and AVAIL-04 marked complete

## Decisions Made

- **The legend is italic.** The day and time legends sit under an instruction line and share no vocabulary with the card's body. This one names the very glyphs the participant lines lead with, so a plain legend would be indistinguishable from a member called "no answer yet" — both to a reader scanning the card and to the inherited assertion that counts pending participants by their leading glyph. `<i>…</i>` keeps the key visually subordinate to the list and keeps the invariant structural.
- **A blocked round keeps both answer controls.** The plan's acceptance criterion says the blocked render "contains no control row", but D-04 keeps answers changeable until the round closes and D-05 explicitly leaves a blocked round OPEN — dropping the buttons would make a band that mis-tapped unable to recover, and booking (not a "no") is what closes the round. What the renderer actually guarantees, and what the suite asserts, is that it adds no control of its own: the declared availability rows are the only ones it can draw, and a projection whose tokens were never minted renders no row at all. Both forms are pinned.
- **The alert cap is enforced at runtime, in code points.** A fixed-copy audit would have passed; the failure only appears when a real member's 160-character label is interpolated. Slicing by UTF-16 unit would have traded a rejected alert for an unsendable one, so `boundedLabel` clamps by code point and the budget is computed from the same literals the message is built from.
- **Flood control is classified, never retried.** `isFloodControl` narrows on `error_code` rather than on the description, because Telegram appends a varying retry interval. The card self-heals on the next answer, so absorbing is strictly better than holding the chat's update queue behind a sleep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The ownership refusal could exceed Telegram's alert cap**

- **Found during:** Task 1 (the refusal-length assertion the plan itself asks for)
- **Issue:** `planningNotAuthorText` interpolates `plainMemberLabel`, which is built from a Telegram first name (up to 64 characters), last name (64) and username (32). The longest legitimate identity produced a **224-character** alert. `answerCallbackQuery` text is capped at 200 by the Bot API, so Telegram would reject the call with a 400 — leaving the callback unacknowledged, the client spinning, and the bystander with no explanation of why the button did nothing.
- **Fix:** Added `CALLBACK_ALERT_LIMIT` and a code-point-safe `boundedLabel`, hoisted the refusal's two literal halves so the budget is computed from the same strings the message is built from, and clamped the label with an ellipsis. The refusal still names the owner.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `tests/unit/planning-availability-card.test.ts` iterates every exported string on the planning namespace and separately drives the maximal-label case.
- **Committed in:** `30c4a91`

**2. [Rule 1 - Bug] The card dropped its author attribution at the first answer**

- **Found during:** Task 2 (the D-05 integration case)
- **Issue:** The confirm branch renders the card with `result.owner`, but the answered branch called `availabilityStepProjection(round, participants)` with no owner. `planningOwnerLine` is therefore omitted from every render after publication — so "Planned by Ada." appeared on the published card and vanished on the very next tap. That is precisely the silent re-attribution D-13 states the line on every card to prevent, and it would have been permanent for the whole round.
- **Fix:** `AnswerResult.answered` now carries `owner`, resolved by `resolveTelegramIdentity` from `round.authorUserId` inside the same transaction the answer committed in — the same durable column the ownership refusal reads, so the card and the refusal cannot disagree. The handler passes it through.
- **Files modified:** `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts`
- **Verification:** `tests/integration/planning-availability.test.ts#records the refusal, leaves the round collecting and still names the author` asserts "Planned by" on a post-answer render; it failed before the fix.
- **Committed in:** `1b2c2d4`

**3. [Rule 3 - Blocking] The worktree had no installed dependencies**

- **Issue:** `node_modules` was empty in a fresh worktree, so `vitest`, `tsc` and the integration helpers' `./node_modules/.bin/prisma` were all unavailable.
- **Fix:** Ran `npm ci`. No dependency was added, removed or changed; `package.json` and `package-lock.json` are untouched.
- **Files modified:** none (`node_modules` is gitignored)
- **Verification:** All four suites run.
- **Committed in:** n/a — no tracked file changed.

**4. [Rule 3 - Blocking] The plan's refusal-constant assertion could not be written as a type predicate**

- **Found during:** Task 1 (typecheck)
- **Issue:** `Object.entries` over an ES module namespace yields the exports' LITERAL types, so `(entry): entry is [string, string]` is not assignable to its parameter and TS2677 failed the build.
- **Fix:** Widened the namespace to `Record<string, unknown>` before iterating and collected matches explicitly. The assertion still enumerates the module rather than a hand-kept list, which is the property that makes it catch a refusal nobody thought to list.
- **Files modified:** `tests/unit/planning-availability-card.test.ts`
- **Verification:** `npm run typecheck` passes.
- **Committed in:** `30c4a91`

**5. [Rule 3 - Blocking] The flood branch needed its own anchor to be reachable**

- **Found during:** Task 2 (extending `BRANCHES`)
- **Issue:** `LAST_RENDER` is process-memory keyed by `chatId:anchorMessageId`, and the gate re-runs every branch in four separate cases. A flood branch sharing the successful branch's anchor would have hit the remembered fingerprint, skipped the edit entirely, and never produced the delivery failure it exists to prove.
- **Fix:** Gave the flood branch its own `anchorMessageId`, with the reason stated at the fixture.
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Verification:** The branch emits exactly one `telegram-delivery-failed` line across all four gate cases.
- **Committed in:** `b45a48c`

---

**Total deviations:** 5 auto-fixed (1 bug, 1 missing critical, 3 blocking)
**Impact on plan:** Two were latent user-visible defects the plan's own assertions surfaced; three were needed to run the plan's verification at all. No scope creep — nothing outside the plan's declared file and symbol ownership was touched, and the only new exported symbol is `PLANNING_AVAILABILITY_LEGEND`, exactly as the plan allows.

## Issues Encountered

- **The plan's blocked-render acceptance criterion contradicts D-04/D-05.** Resolved in favour of the CONTEXT decisions and the plan's own `must_haves` truth ("offers no replan control"), with both readings pinned by assertions. See Decisions Made.
- **An empty grammY `InlineKeyboard` serializes as `[[]]`, not `[]`.** The "no control row" assertions are therefore made over the flattened buttons rather than the row array; a row-count assertion would have been off by one for the wrong reason.

## Known Stubs

None. Every symbol this plan renders is rendered by this plan. The booking symbols 03-01 declared (`PLANNING_BOOKING_ROWS`, `PLANNING_BOOK_LABEL`, the booking members of `PlanningControlAction` and `planningTargetSchema`) remain undrawn and are still owned by 03-04/03-05; `projection.booked` is likewise still consumed only by the caller that decides which tokens to supply, which is the mechanism this plan's action specifies and which 03-05 will exercise.

## Threat Flags

None. Every trust boundary this plan touches is named in the plan's own register, and no new network endpoint, auth path, file access pattern or trust-boundary schema change was introduced. Two register entries were strengthened rather than merely satisfied: T-03-10 (the refusal alert now cannot exceed the transport's own limit, so it can never fail to be delivered) and T-03-13 (the 429 is classified at the delivery catch site with its own bounded reason).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for wave 3. Available to the later plans of this phase:

- The completed `renderAvailabilityCard`, `PLANNING_AVAILABILITY_LEGEND` and the outcome sentence map — 03-03's status re-post renders this same card (D-03 recovery), and 03-04's announcement reads the same `all-available` outcome.
- `isFloodControl` and the `deliveryFlood` catch site, for any later surface that edits under load.
- `AnswerResult.answered.owner`, so a later re-render never has to re-resolve the author.

Open seams a later plan of this phase still owns, unchanged by this plan:

- `WEEK_CLAIMING_STATUSES` does not yet include `BOOKED`, and the hard-coded `status: CONFIRMED` / `status: DRAFT` filters are untouched — 03-03/03-05.
- `stepTargets` still branches on step before status — 03-03.
- The AVAIL-07 one-shot announcement claim on `readyAnnouncedAt` is unwritten — 03-04.
- Nothing yet sets `PlanningRoundStatus.BOOKED`, so `projection.booked` is reachable only from a hand-built projection — 03-05.

## Self-Check: PASSED

All four commits (`a247988`, `30c4a91`, `b45a48c`, `1b2c2d4`) are present in
`git log`, and the one file this summary claims to have created exists on disk:
`tests/unit/planning-availability-card.test.ts`. At the final commit
`npm run test:unit` (297 passed), `npm run test:integration` (160 passed),
`npm run typecheck` and `npm run lint` were all green.

---

_Phase: 03-availability-and-booking-decision_
_Completed: 2026-09-06_
