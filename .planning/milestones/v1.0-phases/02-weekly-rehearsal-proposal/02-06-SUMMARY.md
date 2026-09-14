---
phase: 02-weekly-rehearsal-proposal
plan: 06
subsystem: planning
tags: [prisma, postgres, transactions, telegram, grammy, testcontainers, observability]

requires:
  - phase: 02-01
    provides: The CONFIRMED durable round contract — nullable activeWeekStart under @@unique([chatId, activeWeekStart]), and the exactly-once CallbackAction consumption template
  - phase: 02-02
    provides: PLANNING_INACTIVITY_MS, the lastStatusPostedAt column, the route table with its authority column, the non-destructive currentRole accessor, and the Testcontainers harness
  - phase: 02-03
    provides: The day step and the read-only-refusal-before-consumption ordering
  - phase: 02-04
    provides: selectTime, the round's own schedule snapshot as the authority for every later step
  - phase: 02-05
    provides: back, confirm, the review card, listActiveMemberships, and the layered revision/exactly-once guards this plan preserves
provides:
  - PlanningService.resolveOwnership — the one ownership decision, shared by every transition (D-02)
  - PlanningService.status / reanchor — the D-14 re-post with its cooldown claimed before the send
  - PlanningService.takeover / isTakeoverEligible / mintTakeoverAction — AUTH-03
  - PlanningService.supersedeStaleRounds — read-time stale-week reaping with no scheduler
  - resolveTelegramIdentity — the one place a person's stored identity is read and mapped
  - /plan_status, with authority chat-member and a durable per-round cooldown
  - The owner attribution line on every planning card
  - A mandatory `reason` on every planning log line, with a globally unique bounded vocabulary
affects: [availability collection, reminder scheduling, booking readiness, live verification run]

actuals:
  tokens: 46090
  tasks: 3
  commits: 8

tech-stack:
  added: []
  patterns:
    - "Claim the rate limit BEFORE the side effect, not after: a durable compare-and-set on the round's own column is what makes 'at most one card per window' true under concurrency, and it survives a failed send"
    - "A shared refusal branch per decision (refuseNonAuthor), so a control cannot grow its own weaker version of a rule"
    - "Authority is a durable column read at decision time; the callback row records who a button was MINTED for, and after a takeover the two disagree deliberately"
    - "A per-viewer control is minted separately from the step's own actions, because a group card has one body everyone reads"
    - "Making an observability parameter REQUIRED is how a silent branch becomes a compile error rather than a review finding"
    - "A test double must EVALUATE where clauses when the production guard lives inside one, or the branch it guards is unreachable from the test"

key-files:
  created:
    - tests/unit/planning-ownership.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/integration/planning-takeover.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/domain/roster/roster-service.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/keyboards.ts
    - src/telegram/handlers.ts
    - tests/unit/planning-time-card.test.ts

key-decisions:
  - "DEVIATION from the plan's literal instruction: reanchor refreshes lastActivityAt only when the requester IS the author. D-15 opens /plan_status to everyone, so refreshing it for anyone would let any member hold an abandoned round open forever and make AUTH-03 takeover permanently unreachable."
  - "DEVIATION from 02-RESEARCH.md Pattern 7: the status cooldown is CLAIMED by an atomic compare-and-set before the message is sent, not written after it. Send-then-persist cannot hold the PLAN-10 concurrency promise, and claiming first also means a Telegram outage cannot be used as a flood amplifier."
  - "The cooldown refusal is silent in the chat and never silent in the logs. A 'please wait' reply is one message per request — the exact flood the cooldown exists to stop — and the card the requester asked for is already at the bottom of the chat, seconds old."
  - "The fresh administrator role is resolved at TAP time immediately before the takeover transaction rather than inside it. Holding a PostgreSQL row lock across a Telegram HTTP round trip would put the transaction timeout behind a third party's latency."
  - "The owner attribution line renders on EVERY card, not only the one a takeover produces. 'When it has changed hands' cannot be made durable without a new column and the plan forbids adding one; rendering always is strictly stronger and also makes D-02's refusal predictable before anyone taps."
  - "logPlanning's `reason` is a REQUIRED parameter and `roundId` is explicitly `string | undefined`. The plan's 'every branch carries a distinct outcome/reason triple' was unmet by roughly fifteen existing branches; making the parameter mandatory turns that from a review finding into a compile error."
  - "The status claim deliberately does NOT bump `revision`. A status request is not a step transition, and bumping would let any member invalidate the author's in-flight tap once per cooldown window."

patterns-established:
  - "Mutation-check the gate itself, not just the guards: the first collision mutation against the logging gate came back GREEN and exposed nine unexercised branches."
  - "When two plan requirements are mutually exclusive, satisfy the stronger property and say so — do not quietly drop either."

requirements-completed: [AUTH-03, PLAN-01, PLAN-10, RELI-01]

coverage:
  - id: D1
    description: "Only the current author may advance the card; a tap from anyone else is refused with a private alert naming the owner, mutates nothing, and leaves the tapped CallbackAction row unconsumed"
    requirement: PLAN-01
    verification:
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses a day button on the day step and names the owner"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses an hour button on the time step and names the owner"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses the Back control on the time step and names the owner"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses the Back control on the review step and names the owner"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses the Confirm control on the review step and names the owner"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#still lets the author move their own card"
        status: pass
    human_judgment: false
  - id: D2
    description: "Administrator status alone is not authority over an active round; only the inactivity-gated takeover path is"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#refuses a chat administrator too, while the round is still active"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#refuses an administrator while the round is still active"
        status: pass
    human_judgment: false
  - id: D3
    description: "The refusal names the owner through memberLabel, so a full numeric Telegram id never reaches the alert and an HTML-hostile name is escaped exactly once"
    verification:
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#uses the masked label when nothing readable is stored, and never the whole id"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#falls back to the masked label when the author has no stored identity at all"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#escapes an author whose stored name carries HTML-significant characters"
        status: pass
    human_judgment: false
  - id: D4
    description: "A status request posts a NEW card at the bottom of the chat, makes it the anchor, and clears the previous message's keyboard; anchorMessageId and lastStatusPostedAt move together or not at all"
    requirement: PLAN-10
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#posts a new card, re-anchors to it, and stops the old one being live"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#writes the new anchor and the cooldown stamp or neither"
        status: pass
    human_judgment: false
  - id: D5
    description: "Anyone in the chat may request status; the re-posted card renders for everyone but its buttons still refuse anyone who is not the author"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-anchors for a non-author, whose tap on that same card is then refused"
        status: pass
    human_judgment: false
  - id: D6
    description: "A bystander's status request does not postpone administrator takeover; the author's own request does"
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#does not postpone takeover when the requester is not the author"
        status: pass
    human_judgment: false
  - id: D7
    description: "Two status requests inside the cooldown produce at most one new anchor message, sequentially and concurrently, asserted on durable state"
    requirement: PLAN-10
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#refuses a second request inside the window and allows the next one after it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#resolves two concurrent requests to exactly one new anchor"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#produces at most one new card when two updates arrive together"
        status: pass
    human_judgment: false
  - id: D8
    description: "A fresh composition root reading the same database resumes the exact step and both selections, and the resumed card is live"
    requirement: RELI-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#resumes the exact step and both selections from a fresh composition root"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#resumes and re-anchors on /plan rather than starting a second round"
        status: pass
    human_judgment: false
  - id: D9
    description: "Takeover is refused before the threshold and for a non-administrator, allowed for an administrator after it, and re-checks both conditions from freshly read state"
    requirement: AUTH-03
    verification:
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#offers the control to an administrator once the round has gone quiet"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#refuses an ordinary member however long the round has been quiet"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#refuses a Take over the author invalidated between render and tap"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#refuses an administrator who was demoted between render and tap"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#refuses a takeover carrying a revision the round has moved past"
        status: pass
    human_judgment: false
  - id: D10
    description: "Takeover keeps every selection and the current step; only authorUserId, lastActivityAt, revision and updatedAt change, and the card says who owns it now"
    verification:
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#offers the control to an administrator once the round has gone quiet"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#swaps who may act, cleanly and in both directions"
        status: pass
    human_judgment: false
  - id: D11
    description: "A stale-week DRAFT is SUPERSEDED at read time and releases activeWeekStart, keeping its author and selections; a current-week DRAFT is never reaped; no scheduler exists anywhere"
    verification:
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#supersedes a stale-week draft at read time, without deleting it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#never reaps a current-week draft, however long it has been silent"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#releases the week so a superseded round no longer holds the unique slot"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-takeover.test.ts#keeps every round it has ever created"
        status: pass
      - kind: other
        ref: "grep -rn 'setInterval|setTimeout|node-cron|pg-boss' src/ — no match"
        status: pass
    human_judgment: false
  - id: D12
    description: "Every terminating planning branch emits exactly one bounded line with a distinct (outcome, reason) pair, and no line carries a date, minute, weekday, week start or timezone"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits lines, and none of them contains a forbidden value"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#passes no object under an allow-listed key"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#binds the caught value under `err` and under no other key"
        status: pass
    human_judgment: false
  - id: D13
    description: "The re-posted card, the Take over control and the owner attribution read correctly to a band member in a live Telegram group"
    verification: []
    human_judgment: true
    rationale: "Every surface this plan adds is chat copy under parse_mode HTML plus one inline control. Phase 1 findings F-1, F-2 and F-9 were all defects every test passed through and only a live run caught; the re-post's position in a busy chat, the Take over label's width, and whether the attribution line reads as helpful or as clutter are not observable from a serialized keyboard."

duration: 45min
completed: 2026-09-01
status: complete
---

# Phase 2 Plan 06: Ownership, Recovery and Takeover Summary

**Author-only control that refuses politely and names the owner, a `/plan_status` re-post whose cooldown is claimed before the message is sent, exact-state resumption across a redeploy, inactivity-gated administrator takeover that keeps every choice, and read-time stale-week reaping with no scheduler anywhere.**

## Performance

- **Duration:** ~45 min of active work (wall clock spans a ~10h API rate-limit interruption between the takeover commit and the observability gate)
- **Started:** 2026-08-31T23:53:00Z
- **Completed:** 2026-09-01T10:45:00Z
- **Tasks:** 3 (8 commits — 4 RED/GREEN gates plus two gate refinements)
- **Files modified:** 11 (4 created)

## Accomplishments

- **D-02 is one decision, not four.** `resolveOwnership` runs in `selectDay`, `selectTime`, `back` and `confirm`, always **before** the callback row is consumed, so a bystander's tap cannot spend a button the author still needs. Authority is `PlanningRound.authorUserId` — never the token, never `CallbackAction.actorUserId`, which after a takeover disagrees with it deliberately.
- **The refusal names the owner** through `memberLabel`, the one identity function in the codebase, so the masked `Telegram user ••••NNNN` form keeps a full numeric Telegram id out of chat text. `resolveTelegramIdentity` was added to the roster domain so the identity columns are read and mapped in exactly one place, and a negative grep over the whole planning surface holds that line.
- **`/plan_status` brings the buried card back** as a new message at the bottom of the chat, re-anchors to it, and clears the superseded message's keyboard — which is the mechanism that makes its still-unconsumed tokens unreachable from any on-screen surface. `/plan` on a live round now takes the same path instead of leaving the previous card live above it.
- **The flood vector is closed at the database, not at the surface.** The cooldown is an atomic compare-and-set on the round's own `lastStatusPostedAt`, claimed *before* the send. Two concurrent requests produce exactly one card; a failed send still leaves the stamp, so a Telegram outage cannot be used as an amplifier.
- **RELI-01 is proved across two composition roots.** A second `PrismaClient` and a second bot, sharing nothing but PostgreSQL, resume the exact step, the exact day and the exact hour — and a tap on the resumed card advances the same round.
- **AUTH-03 stays narrow.** Both the inactivity condition and the administrator role are re-checked from freshly read state at tap time, so a Take over button that went stale while the author came back, or while its holder was demoted, cannot seize an active round. The hand-over touches `authorUserId`, `lastActivityAt` and `revision` and nothing else.
- **Last week's ghost is reaped at read time.** `supersedeStaleRounds` runs on every path that looks for a round. A stale-week DRAFT becomes `SUPERSEDED` and releases `activeWeekStart` in one statement, and is **never deleted** — it keeps its author, both selections and its history. No scheduler, timer or queue exists anywhere in `src/`.
- **The observability gate is real.** `logPlanning`'s `reason` is now a required parameter, so a new branch cannot be added without the compiler asking which one it is. 31 terminating branches are driven for real and every `(outcome, reason)` pair is globally unique.

## Task Commits

1. **Task 1 (RED): D-02 ownership refusal suite** — `72820ef` (test)
2. **Task 1 (GREEN): refuse a non-author's tap with an alert naming the owner** — `28fd0d0` (feat)
3. **Task 2 (RED): status re-post and restart-resumption suite** — `f97eb3c` (test)
4. **Task 2 (GREEN): /plan_status, re-anchoring and restart resumption** — `9e59986` (feat)
5. **Task 3 (RED): administrator-takeover and stale-week suite** — `02541ab` (test)
6. **Task 3 (GREEN): takeover, attribution and stale-week reaping** — `16de85b` (feat)
7. **Task 3: the observability gate** — `c878db9` (test)
8. **Task 3: gate tightened to the literal (outcome, reason) rule** — `a65943c` (test)

## Verification

| Gate | Baseline (base commit) | Result |
|---|---|---|
| `npm run format:check` | clean | **clean** |
| `npm run build` (`tsc --noEmit`) | clean | **clean** |
| `npm test` / `npm run test:unit` | 203/203 | **253/253** |
| `npm run test:integration` | 60/60 | **86/86** |

`tests/integration/chat-readiness.e2e.test.ts`, `tests/integration/planning-round.test.ts` and `tests/integration/planning-confirm.test.ts` all still pass.

Acceptance greps:

| Check | Result |
|---|---|
| `grep -rnE "firstName\|lastName\|username" src/telegram/planning-handlers.ts src/domain/planning/` | no match |
| `grep -c "not-author" src/domain/planning/planning-service.ts` | 2 |
| `grep -c "not-author" src/telegram/planning-handlers.ts` | 5 |
| `grep -c "PLANNING_STATUS_COOLDOWN_MS" src/domain/planning/planning-service.ts` | 2 |
| `grep -rn "setInterval\|setTimeout\|node-cron\|pg-boss" src/` | no match |
| `grep -rnE "requireCurrentAdministrator" src/telegram/planning-handlers.ts src/domain/planning/` | no match |
| `grep -rn "deleteMany\|\.delete(" src/domain/planning/` | no match |
| `git diff 60e205d..HEAD -- package.json package-lock.json` | empty |

Both `<verify>` commands in the plan were run and passed; no verification was skipped.

## Mutation checks

Every guard was disabled, the reddened tests recorded, and the guard restored.

| Mutation | Result |
|---|---|
| `resolveOwnership` always returns `null` (no refusal) | **13 red** across `planning-ownership`, `planning-logging` and `planning-time-card` |
| Consume the callback row on the ownership-refusal path | **2 red** — precisely the two slot-tap cases that assert the row survives |
| Remove the cooldown condition from the compare-and-set | **3 red** — sequential cooldown, concurrent service-level race, concurrent update race |
| `reanchor` always refreshes `lastActivityAt` (the plan's literal instruction) | **1 red** — the AUTH-03 interaction case |
| Skip clearing the superseded card's keyboard | **2 red** — the D-14 re-post and the `/plan` resume |
| Remove the inactivity re-check from `takeover` | **2 red** — refused-while-active, and rendering-is-not-authority |
| Remove the fresh administrator re-check from `takeover` | **2 red** — non-administrator, and demoted-between-render-and-tap |
| Supersede a stale week without releasing `activeWeekStart` | **2 red** — both stale-week cases |
| `status()` returns a round with its selections blanked (simulating in-memory wizard state lost on restart) | **2 red** — the RELI-01 resumption case and the D-14 live-state case |
| Leak `timezone` onto every planning log line | **2 red** — the allow-list and the no-object assertions |
| Collapse Back's stale reason into the selection one | **GREEN at first — see Finding 1 below**, then **1 red** after the gap was closed |

**Finding 1 — the observability gate was initially vacuous for nine branches, and a mutation proved it.** Collapsing `dispatchBack`'s stale reason into `dispatchPlanningCallback`'s came back GREEN. The cause was coverage, not the assertion: the enumeration drove `step-back` but never Back's *duplicate*, *stale* or *failed* paths, nor Confirm's or Take over's. Three outcomes (`duplicate-tap`, `stale-action`, `select-failed`) are each reached by four different controls, and none of those collisions was observable. Nine branches were added, the enumeration now asserts at least three members in each of those three families, and the same mutation now fails with a message naming both colliding branches. This is exactly the failure mode the gate exists to prevent, and it was present in the gate itself.

## Deviations from Plan

### 1. [Rule 2 — Missing Critical] `reanchor` refreshes `lastActivityAt` only for the author

- **Found during:** Task 2
- **Issue:** The plan's `<action>` says to write `anchorMessageId`, `lastStatusPostedAt` **and `lastActivityAt`** in one statement. But D-15 opens `/plan_status` to everyone in the chat, and `lastActivityAt` is the sole input to `isTakeoverEligible`. Under the literal instruction any member — or the absent author's own client — could hold an abandoned round open indefinitely simply by asking for its status once a minute, and AUTH-03 would be unreachable by construction. The two requirements are in direct conflict.
- **Fix:** `reanchor` takes a `refreshActivity` flag; `repostAnchor` passes `round.authorUserId === context.actorId`. Only the owner's own request is evidence that the owner is present.
- **Verification:** `tests/integration/planning-recovery.test.ts#does not postpone takeover when the requester is not the author` asserts both directions. Mutating it back to the plan's wording reddens exactly that case.
- **Committed in:** `9e59986`

### 2. [Rule 1 — Bug] The cooldown is claimed before the send, not written after it

- **Found during:** Task 2
- **Issue:** 02-RESEARCH.md Pattern 7 and the plan's step list both order the re-post as *send, then persist both writes*. That ordering cannot satisfy the plan's own concurrency acceptance criterion ("the number of new `sendMessage` calls is at most 1"): two simultaneous requests both read a clear cooldown and both post a card before either write lands. The two requirements are mutually exclusive as written.
- **Fix:** `status()` claims the window with an atomic compare-and-set (`OR: [lastStatusPostedAt null, lt cutoff]` inside the `updateMany` WHERE) before returning `live`. `reanchor` then writes `anchorMessageId` **and** `lastStatusPostedAt` together in one `expectedRevision`-guarded statement, so the plan's atomicity truth holds in its strongest form — the anchor can never persist without the stamp, doubly. The claim deliberately does not bump `revision`, so it cannot invalidate the author's in-flight tap.
- **Bonus property the plan's ordering did not give:** the stamp is durable even when the send fails, so a Telegram outage cannot be used as a flood amplifier.
- **Verification:** three cases — sequential, service-level concurrent across two composition roots, and update-level concurrent.
- **Committed in:** `9e59986`

### 3. The cooldown refusal is silent in the chat

- **Found during:** Task 2
- **Issue:** The plan asks for "a concise group reply" **and** asserts "no new `sendMessage`" for the refused request. A reply *is* a `sendMessage`. More importantly, a "please wait" message per request is one bot message per attacker message — the flood the cooldown exists to stop.
- **Fix:** The refusal writes nothing and says nothing in the chat, and emits one bounded log line carrying the round id. This is the alternative 02-RESEARCH.md Pitfall 8 explicitly offers ("or a silent no-op"). The `no-active-round` and `unconfigured` branches still reply, because in those cases there is no card on screen to point at and silence would read as a broken bot.
- **Verification:** the cooldown case asserts `harness.calls` is empty **and** that exactly one `status-cooling-down` line was emitted with a non-empty reason and the round id.
- **Committed in:** `9e59986`

### 4. The fresh administrator role is resolved at tap time, immediately before the transaction

- **Found during:** Task 3
- **Issue:** The plan says the role is "resolved through the non-destructive `currentRole()` accessor" as step 2 of the checks the transaction performs. Taken literally that puts a Telegram HTTP round trip inside a PostgreSQL interactive transaction, holding a row lock behind a third party's latency and aborting on Prisma's transaction timeout whenever Telegram is slow or rate-limited — turning a degraded Telegram into a takeover outage.
- **Fix:** `takeover` takes a `resolveRole` thunk and awaits it itself, immediately before opening the transaction; the comparison happens inside. The service still owns the freshness rule, and the property that matters — the role is fresh **at the moment of the tap**, not at render — is fully preserved.
- **Verification:** `#refuses an administrator who was demoted between render and tap` uses a mutable role closure and passes.
- **Committed in:** `16de85b`

### 5. The owner attribution line renders on every card, not only after a takeover

- **Found during:** Task 3
- **Issue:** The plan asks for a line "stating who currently owns the round **when it has changed hands**", and separately forbids adding any Prisma column. There is no durable signal for "has changed hands" in the existing schema, so a conditional line could only be supplied at the takeover's own render — and would vanish on the next tap, quietly stopping being true for anyone scrolling back. That is the silent re-attribution the decision exists to prevent.
- **Fix:** every planning card (day, time, review, confirmed) carries `Planned by <label>`, derived from `PlanningRound.authorUserId` — the same durable column authority is read from, so the card and the refusal cannot disagree. This satisfies "states who currently owns the round" unconditionally, which strictly implies the takeover case. It also makes D-02's refusal predictable *before* anyone taps.
- **Verification:** the takeover case asserts the card names the original author before, the new author on the takeover render, **and** still names the new author a step later.
- **Committed in:** `16de85b`

### 6. [Rule 2 — Missing Critical] `reason` is a required parameter on every planning log line

- **Found during:** Task 3
- **Issue:** The plan's truth is "every terminating planning branch emits exactly one log line carrying a distinct event, outcome and reason triple". Roughly fifteen existing branches emitted no `reason` at all, and four different controls all reported the bare outcome `stale-action`. Writing only the test would have caught it once; the branches would drift back.
- **Fix:** `logPlanning`'s `reason` is required and `roundId` is explicitly `string | undefined`, so the compiler names every site. The bounded vocabulary gained one member per branch, including per-control reasons for the `duplicate-tap` / `stale-action` / `select-failed` families, and every absorbed-failure catch site now carries a reason alongside its outcome and `err`. All 31 `(outcome, reason)` pairs are globally unique — the plan's literal criterion holds with no reinterpretation and no route suffixes.
- **Committed in:** `c878db9`, `a65943c`

### 7. Three test doubles were tightened rather than worked around

- **Found during:** Tasks 1 and 3
- **Issue:** (a) `createBackPrisma` and `createWritablePrisma` in `planning-time-card.test.ts` had no `telegramUser` read, so the new ownership resolution turned a `not-author` into a swallowed `failed`. (b) The review-card and time-card control-token stubs returned a token for *any* control asked of them, so once a takeover row existed they rendered a card the wizard never produces. (c) The logging double ignored `where` clauses entirely, which made three production guards — the expected-revision guard, the stale-week predicate and the cooldown compare-and-set — unreachable from the test.
- **Fix:** the identity read was added; the control stubs now take an explicit `minted` list and answer `undefined` for everything else; the logging double evaluates equality, `{ lt }` and top-level `OR`, and throws on any operator it cannot evaluate so a future guard fails loudly rather than silently passing.
- **Committed in:** `28fd0d0`, `16de85b`, `c878db9`

---

**Total deviations:** 7 (3 missing-critical auto-fixes, 3 plan-instruction corrections, 1 test-double repair)
**Impact on plan:** No scope creep and no new dependency. Every deviation either strengthens a guarantee the plan asked for or resolves a pair of plan requirements that could not both hold; all seven are asserted by tests, and five of them are mutation-verified above.

## Issues Encountered

- The plan carried **two pairs of mutually exclusive requirements** (deviations 1–3). This is the fifth of six plans in this phase to specify a verification line that contradicts its own purpose. In each case the stronger property was implemented and the weaker instruction documented rather than silently dropped.
- Execution was interrupted by an API rate limit between commits `16de85b` and `c878db9`. Nothing was lost — every task had already been committed the moment it verified, which is the only reason the interruption cost nothing.

## Known Stubs

None. No branch is stubbed, no test is skipped, and both `<verify>` commands were run.

One **known cosmetic defect** is recorded below rather than fixed, because fixing it would violate a rule the plan states explicitly.

### Escaped display names in plain-text callback alerts

`memberLabel` HTML-escapes, which is correct for the card (sent with `parse_mode: "HTML"`) and wrong for a callback alert, whose `text` Telegram renders as plain text. An author named `Ben & Jo` is therefore named `Ben &amp; Jo` in the D-02 refusal popup.

It is left as-is deliberately: the plan requires the alert to be escaped (`"A fixture author whose display name contains HTML-significant characters is escaped in the alert text"`) and forbids planning code from assembling its own identity string, so the only alternatives are a second escaper — the exact double-encoding bug 02-05 rejected — or a second identity path. The card is the surface many people read; the alert is a transient private popup seen by one person who tapped the wrong button. Filed in `.planning/WINDOWS.md` so it is visible at ship time, and it is a natural candidate for the live-run pass.

## Threat Flags

None beyond the register the plan already carries. `/plan_status` is a new route and is the phase's only side-effecting command not gated by a role — that surface was anticipated as `T-02-07` and is mitigated by the durable cooldown, which is asserted sequentially, concurrently at the service level across two composition roots, and concurrently at the update level. `T-02-SC` had no install task: `git diff` over `package.json` and `package-lock.json` for the whole plan is empty.

Every threat in the plan's register is mitigated and asserted: T-02-01, T-02-05, T-02-07, T-02-09, T-02-10, T-02-13, T-02-14, T-02-21, T-02-22.

## Next Phase Readiness

Phase 2 is complete. A rehearsal proposal now survives burial under conversation, a mid-wizard redeploy, an author who wanders off, and a week that rolls over.

Ready for Phase 3: a `CONFIRMED` `PlanningRound` with `startsAt`, `endsAt`, `confirmedAt`, a NULL `activeWeekStart` and its `PlanningParticipant` lineup, reachable by an author who may have changed at most once per inactivity window and is always named on the card.

Open items for whoever picks up next:

- **The live run is the only outstanding verification.** D13 in the coverage block is the sole human-judgment deliverable and it is genuinely open — `/plan_status`'s re-post position in a busy chat, the `Take over this plan` label's width on a narrow client, and whether `Planned by …` reads as helpful or as clutter are not observable from a serialized keyboard. 02-VALIDATION.md § Manual-Only Verifications already reserves this.
- **The roster-deactivated-between-review-and-Confirm interleaving** remains untested, inherited unchanged from 02-05. It needs a scheduling seam the code does not have.
- **`cancel` and `refuse-past` parse but have no dispatcher branch** and are answered as `unsupported-action` with the reason `planning-action-not-yet-supported`. No step mints either, so both are unreachable from a card today.
- **The `no-active-round` and `unconfigured` replies are not rate limited.** The cooldown lives on the round, so a chat with no round answers `/plan_status` unboundedly. This is the same shape `/plan` already has for its own refusals and was out of scope here; it is worth a shared command-level cooldown if Phase 3 adds more open commands.
- **`AVAIL-06` and `LIFE-05` still assume a per-round participant set** that the author adjusts, while D-09 made the roster the lineup. 02-CONTEXT.md defers that reconciliation to the Phase 3 and Phase 4 discussions; it has still not happened.

## Self-Check: PASSED

- All four created files exist on disk: `tests/unit/planning-ownership.test.ts`, `tests/unit/planning-logging.test.ts`, `tests/integration/planning-recovery.test.ts`, `tests/integration/planning-takeover.test.ts`.
- All eight task commits are present on `worktree-agent-a0423d8afcb57b60c`: `72820ef`, `28fd0d0`, `f97eb3c`, `9e59986`, `02541ab`, `16de85b`, `c878db9`, `a65943c`.
- Every declared artifact resolves in source: `PlanningService.status` / `reanchor` / `takeover` / `supersedeStaleRounds` / `mintTakeoverAction`, `isTakeoverEligible`, `PLANNING_STATUS_COOLDOWN_MS`, `handlePlanStatusCommand`, `PLANNING_TAKEOVER_ROW`, and the `command:plan_status` route id.
- Every acceptance criterion across all three tasks was executed and passed (table above).
- `npm run format:check`, `npm run build`, `npm test` (253/253) and `npm run test:integration` (86/86) are green on the committed tree.
- No modification was made to `.planning/STATE.md` or `.planning/ROADMAP.md`.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-09-01*
