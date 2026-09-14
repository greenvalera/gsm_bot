---
phase: 03-availability-and-booking-decision
plan: 04
subsystem: api
tags: [prisma, postgres, grammy, telegram, vitest, testcontainers]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-01's tracer: the answer transaction skeleton, the never-consumed
      shared answer tokens, availabilityOutcome / availabilityStepProjection,
      and the AnswerResult union this plan widens with an announcement
      directive"
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-02's availability card: renderAvailabilityCard, its outcome
      sentences, AnswerResult.answered.owner, and the BRANCHES logging gate this
      plan extends with six distinguishable announcement reasons"
  - phase: 03-availability-and-booking-decision
    provides:
      "Plan 03-03's recovery path: loadAvailabilityActions, availabilityProjection,
      withoutEmptyKeyboard, RECOVERABLE_ROUND_STATUSES and renderStep's
      status-before-step branch, all of which this plan's ready-to-book re-post
      builds on"
  - phase: 02-weekly-rehearsal-proposal
    provides:
      "The lastStatusPostedAt cooldown compare-and-set this plan's unanimity
      claim copies in shape, repostAnchor's post-reanchor-clear ordering, and
      the PLANNING_OUTCOMES / PLANNING_REASONS bounded vocabulary"
provides:
  - "READY_ANNOUNCE_COOLDOWN_MS — its own thirty-minute constant; PLANNING_STATUS_COOLDOWN_MS is neither reused nor changed"
  - "PlanningService.claimAnnouncement — the AVAIL-07 compare-and-set on readyAnnouncedAt, inside the answer transaction, yielding an AnnouncementDirective"
  - "AnnouncementDirective (post | edit | retract | none) on AnswerResult.answered"
  - "PlanningService.recordAnnouncement — writes announcementMessageId and nothing else (D-17)"
  - "PlanningService.reanchorAnnouncement — reanchor's statement, guarded on CONFIRMED and the expected revision, moving only the announcement column"
  - "renderReadyAnnouncement / renderRetractedAnnouncement, both reusing the card's lineup order, mask and escaper"
  - "editRoundMessage — the ONE in-place edit path, now addressing either of the round's two live messages; editAnchor is its delegate"
  - "RepostSlot — repostAnchor can re-post into the anchor or the announcement, from one pre-built projection"
  - "PLANNING_CATCH_SITES.announcement and .announcementRecord, outcomes ready-to-book-announced and announce-failed, and six new bounded reasons"
affects:
  - 03-05-manual-booking
  - phase-04-lifecycle
  - phase-05-reminders

actuals:
  # chars/4 over the realized diff against the plan's base commit (86,351 chars).
  # NOT a harness token count.
  tokens: 21588
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "A cooldown-style claim that is never released by nulling: readyAnnouncedAt is simultaneously the claim and the record of the last announcement, and the passage of the window IS the release"
    - "One projection per request, threaded rather than re-read: the slot decision, the log reason and the rendered message all come from the same value, so a concurrent write cannot make them disagree"
    - "An extracted edit path that REPORTS rather than acts: editRoundMessage returns edited/unchanged/failed and the caller decides whether an unchanged render deserves a log line and an alert"
    - "Two durable message ids per round, and neither column is ever written with the other's id (D-17)"

key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - tests/unit/planning-availability-card.test.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-recovery.test.ts

key-decisions:
  - "The racing integration case interposes the WINNING claim as its raw guarded statement rather than a second full dispatch. Under READ COMMITTED a concurrent answer's participant row is invisible to the loser's re-read, so two transactions cannot both observe unanimity through the participant path — the reachable race is on the round row alone, which is exactly the row the compare-and-set guards"
  - "editRoundMessage returns a result instead of owning the unchanged-render log line and alert. The announcement is a SECOND message the same tap merely corrects; answering 'Already applied.' for it would deny an answer that was in fact applied"
  - "The retract and cooldown-edit branches log under the ready-to-book-announced OUTCOME with their own reasons, following the shipped status-reposted precedent where one outcome names the message and the reason names what happened to it. The plan's artifact list sanctions exactly two new outcomes and no more"
  - "A rejected announcement edit lands at PLANNING_CATCH_SITES.announcement, but flood control keeps PLANNING_CATCH_SITES.deliveryFlood whatever the caller asks for — a throttled chat and a refused card call for opposite operator reactions"
  - "reanchorAnnouncement guards on CONFIRMED alone rather than RECOVERABLE_ROUND_STATUSES: only a collecting round can be ready-to-book, a booked one re-posts its summary through the anchor slot, and a draft has no announcement"
  - "recordAnnouncement carries no revision guard. The message is already in the chat; refusing the pointer over a moved revision would leave a live announcement nothing could ever retract or close"

patterns-established:
  - "A branch whose only log line comes AFTER a fingerprinted edit needs a fresh message id per driven run, or the process-memory LAST_RENDER map makes its second run silent and drops it out of the BRANCHES enumeration"
  - "A counting spy over a service read (`vi.spyOn(PlanningService.prototype, ...)`) asserts an UPPER bound on reads per request, which is how a 'one read, threaded' invariant is held structurally rather than by review"

requirements-completed:
  - AVAIL-07

coverage:
  - id: D1
    description:
      "The last pending participant answering can-attend posts ONE new message
      saying everyone can make it, updates the card to its all-clear state, sets
      readyAnnouncedAt and announcementMessageId, and leaves anchorMessageId
      byte-identical (AVAIL-07, D-12, D-17)"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#posts one new message when the last pending participant can attend"
        status: pass
    human_judgment: false
  - id: D2
    description:
      "AVAIL-07 adjacency — a concurrent transaction that wins the
      readyAnnouncedAt compare-and-set leaves the loser silent: zero messages
      sent, its own participant's answer still recorded, the card still
      re-rendered, and one announcement pointer in the database (T-03-23,
      Pitfall 3)"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#posts exactly one announcement when a concurrent claim commits first"
        status: pass
    human_judgment: false
  - id: D3
    description:
      "AVAIL-07 empty — a one-participant round announces on that participant's
      can-attend answer; a round whose last pending participant answers
      cannot-attend sends nothing and leaves readyAnnouncedAt null"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#announces the moment a one-participant round's only member can attend"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#announces nothing when the last pending participant cannot attend"
        status: pass
    human_judgment: false
  - id: D4
    description:
      "AVAIL-07 ordering — the announcement and the card list the same
      projection's participants in the same order, including two labels the
      roster collator compares equal, in both input orders"
    requirement: AVAIL-07
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#lists two collator-equal participants in the card's own order"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#repeats the confirmed day and start time and closes on booking"
        status: pass
    human_judgment: false
  - id: D5
    description:
      "The claim is durable BEFORE the send: a Telegram failure leaves
      readyAnnouncedAt set and announcementMessageId null, posts no compensating
      message, keeps the participant's answer, and logs exactly one failure line
      (T-03-25, D-03)"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#keeps the claim when the announcement send fails"
        status: pass
    human_judgment: false
  - id: D6
    description:
      "A lost unanimity edits the announcement to say the slot no longer works,
      with no reply_markup, while the availability card keeps both answer
      controls and the claim is not released (T-03-27, Pitfall 7, D-04)"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#retracts the announcement when a participant changes their mind"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#absorbs a retraction edit Telegram rejects without touching the answer"
        status: pass
    human_judgment: false
  - id: D7
    description:
      "D-18 — unanimity re-achieved inside READY_ANNOUNCE_COOLDOWN_MS edits the
      existing announcement back and sends nothing; after the window a fresh
      message is posted, announcementMessageId moves, and the superseded copy
      receives exactly one keyboard-clearing edit so the chat never holds two
      live announcements"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#edits the announcement back inside the cooldown and notifies nobody"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#posts a fresh announcement after the cooldown and clears the old copy"
        status: pass
    human_judgment: false
  - id: D8
    description:
      "A round that never announced and loses unanimity edits nothing and sends
      nothing; a repeat that leaves the outcome unchanged issues no further
      announcement edit"
    requirement: AVAIL-07
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#edits and sends nothing for a round that never announced"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#edits the announcement once for a repeat that leaves the outcome unchanged"
        status: pass
    human_judgment: false
  - id: D9
    description:
      "/plan_status for an announced, still-unanimous round re-posts the
      announcement, moves announcementMessageId, leaves anchorMessageId
      unchanged, clears the previous copy and does not touch the card
      (Open Question 2, D-17)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-posts the announcement and moves only its own message id"
        status: pass
    human_judgment: false
  - id: D10
    description:
      "The same round re-posts the availability card once unanimity is lost —
      the anchor moves and the announcement pointer stays put — and the status
      cooldown still applies to the ready-to-book shape"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-posts the availability card once unanimity has been lost"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#rate-limits a second request for a ready-to-book round"
        status: pass
    human_judgment: false
  - id: D11
    description:
      "One /plan_status invocation reads the availability projection at most
      once, for each of the collecting, ready-to-book and booked shapes, and
      zero times for a draft round"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#reads the availability projection at most once per request"
        status: pass
    human_judgment: false
  - id: D12
    description:
      "Each of the six new announcement branches emits exactly one line whose
      (outcome, reason) pair is unique across the whole enumeration (T-03-30)"
    requirement: AVAIL-07
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for an availability answer that completes unanimity"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for an answer that loses a round its unanimity"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for unanimity re-achieved inside the announce cooldown"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a status request that re-posts a ready-to-book announcement"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
    human_judgment: false

# Metrics
duration: 34 min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 04: The Ready-to-Book Announcement Summary

**Unanimity is claimed by one atomic compare-and-set on `readyAnnouncedAt` inside the answer transaction and announced in a fresh chat message exactly once per claim — rate-limited rather than one-shot, so a slot that becomes workable again still breaks through, and retracted in place the moment somebody changes their mind.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-09-06T09:35:00Z (approx.)
- **Completed:** 2026-09-06T10:09:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- **AVAIL-07 is true, and it is true exactly once per achieved unanimity.** The claim is a `WHERE`-clause compare-and-set in the shipped `lastStatusPostedAt` shape, made inside the answer transaction from the participant rows that transaction read. `count === 1` is the whole licence to announce. An application-level test of a previously-read value announces twice; this cannot.
- **The concurrency proof is a real race against real PostgreSQL, not `sequentialize`.** `withPlanningRoundInterference` commits the winning claim immediately before the loser's guarded round update, and the loser posts nothing while still recording its own participant's answer and still re-rendering the card from its own committed snapshot.
- **The owner's D-18 override is implemented as written.** `READY_ANNOUNCE_COOLDOWN_MS` is its own thirty-minute constant; `PLANNING_STATUS_COOLDOWN_MS` is untouched at one minute. `readyAnnouncedAt` is **never nulled** — the passage of the window is the release. Inside it, a re-achieved unanimity edits the message on screen and notifies nobody; outside it, a fresh message is posted and the superseded copy's keyboard is cleared in the same act, so the chat never holds two announcements each claiming the slot works.
- **A stale announcement can no longer justify a booking (T-03-27).** A flip to cannot-attend edits the message to say the slot no longer works and leaves it with no `reply_markup` at all — while the availability card keeps both answer controls, because answers stay changeable until booking closes the round and the two keyboards address different durable rows (Pitfall 7's deliberate exception).
- **The round now has two durable message ids and neither column is ever written with the other's (D-17).** `recordAnnouncement` and `reanchorAnnouncement` write `announcementMessageId` alone; every assertion that the anchor is byte-identical after an announcement or a re-post is a real database read.
- **`/plan_status` re-posts the message the round's live state makes actionable, from ONE projection read.** The slot, the bounded log reason and the rendered message all come from a single `availabilityProjection` call — held by a counting spy that asserts an upper bound of one per invocation, and zero for a draft round. Two independent reads would leave a window in which a concurrent answer commits between them and `announcementMessageId` gets re-pointed at a posted availability card.
- **One edit path, not two.** `editAnchor`'s body became `editRoundMessage`, which now addresses either of the round's two live messages; `editAnchor` is its delegate plus the two things that belong to the anchor specifically. The "is this edit a no-op" fingerprint, the not-modified absorption and the flood classification exist in exactly one place.
- **Six new announcement branches, six distinguishable log lines.** The `BRANCHES` gate — globally unique `(outcome, reason)` pairs, exactly one matching line per branch, every branch driven for real — passes with all six enumerated.

## Task Commits

Each task was committed atomically, RED then GREEN:

1. **Task 1: the rate-limited unanimity claim and the announcement** — `fcdd751` (test), `ae283e0` (feat)
2. **Task 2: retraction and the rate-limited re-announcement** — `fbb5850` (test), `9b60e81` (feat)
3. **Task 3: `/plan_status` re-posts the announcement** — `594bfb8` (test), `f5b8a75` (feat)

## Files Created/Modified

- `src/domain/planning/planning-service.ts` — `READY_ANNOUNCE_COOLDOWN_MS`; `AnnouncementDirective` and `RecordAnnouncementResult`; the `announcement` field on `AnswerResult.answered`; the outcome derivation and `claimAnnouncement` call inside `answerAvailability`; `claimAnnouncement`, `recordAnnouncement`, `reanchorAnnouncement`
- `src/telegram/planning-renderers.ts` — `renderReadyAnnouncement`, `renderRetractedAnnouncement`; `lineupLines` widened to any `RosterIdentity` so the announcement, the review card and the availability card share one line renderer
- `src/telegram/planning-handlers.ts` — `editRoundMessage` (extracted) and `editAnchor` as its delegate; `dispatchAnnouncement` with the post/edit/retract branches; `RepostSlot` and `repostAnchor`'s options bag; `renderStep`'s optional projection and ready-state branch; `handlePlanStatusCommand`'s single projection read; two new catch sites, two outcomes and six reasons
- `tests/unit/planning-availability-card.test.ts` — the announcement's civil day/time pair, its closing line, its empty control row, and the collator-equal ordering fixture shared with the card
- `tests/unit/planning-logging.test.ts` — the null announcement columns the claim's `OR` arms need; `ANSWER_UNAVAILABLE`; `failAnnouncementWrites`; `replyThrows` on `driveCallback`; five new `BRANCHES` entries and the existing answer branch narrowed to stay collecting
- `tests/integration/planning-availability.test.ts` — the `onCall` seam, sent-message-id capture and `allOf`; six AVAIL-07 cases and six D-18/T-03-27 cases
- `tests/integration/planning-recovery.test.ts` — the ready-to-book re-post, the retracted-round card re-post, the ready-to-book cooldown, and the projection-read counting spy

## Decisions Made

- **D-17 and D-18 were implemented exactly as recorded.** No reinterpretation was needed; both are owner-accepted and both are now pinned by tests (`anchorMessageId` byte-identical after an announcement and after a re-post; `readyAnnouncedAt` never observed null after the first claim on any path).
- **`editRoundMessage` reports rather than acts.** See deviation 1.
- **The racing case interposes the winning claim as a raw guarded statement.** See deviation 2.
- **The retract and cooldown-edit branches share the `ready-to-book-announced` outcome.** See deviation 3.
- **`reanchorAnnouncement` guards on `CONFIRMED` alone**, not `RECOVERABLE_ROUND_STATUSES`: only a collecting round can be ready-to-book. A booked round re-posts its control-free summary through the anchor slot, and a draft has no announcement at all. Widening it would let a terminal round acquire an announcement pointer.
- **`recordAnnouncement` carries no revision guard.** The message is already live in the chat by the time it runs. Refusing the pointer because a concurrent answer moved the revision would leave an announcement that nothing could later retract or close — the exact orphan T-03-27 exists to prevent. The status guard stands.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness] The extracted edit path would have alerted "Already applied." for an answer that WAS applied**

- **Found during:** Task 2 (`editRoundMessage` extraction)
- **Issue:** The plan says to extract `editAnchor`'s body "carrying … the fingerprint short-circuit … unchanged". That short-circuit does two things beyond comparing: it logs `anchor-unchanged` / `rendered-card-already-matches` and answers the callback with `Already applied.`. Both are correct for the ANCHOR — it is the message the tap addressed. Neither is correct for the announcement: the announcement is a second message the same tap merely corrects, and the case the plan itself names ("a second answer that leaves the outcome unchanged triggers no further edit") is reached when a *different* participant's answer leaves the outcome where it was. Their answer was genuinely applied; telling them it was not is a false refusal.
- **Fix:** `editRoundMessage` returns `"edited" | "unchanged" | "failed"` and does not log or alert on `unchanged`. `editAnchor` keeps both behaviours by acting on that result. The fingerprint comparison, the not-modified absorption and the flood classification still exist in exactly one place, which is the requirement the extraction was for.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `tests/integration/planning-availability.test.ts#edits the announcement once for a repeat that leaves the outcome unchanged`
- **Committed in:** `9b60e81`

**2. [Rule 1 - Bug in the specified test] The plan's racing shape is unreachable under READ COMMITTED**

- **Found during:** Task 1 (writing the `withPlanningRoundInterference` case)
- **Issue:** The plan specifies a racing case "whose interference commits the OTHER participant's can-attend answer immediately before the guarded round update". `withPlanningRoundInterference` fires immediately before the transaction's first `planningRound.updateMany`, which is the claim — and the claim is only reached when the transaction's participant re-read already saw unanimity. Under PostgreSQL's default READ COMMITTED that re-read cannot see a concurrent answer's uncommitted row, so the interference as literally specified would fire only in a state where the other participant had *already* committed, making it a no-op. Written literally, the case would have passed while exercising nothing.
- **Fix:** The interference commits, on a second client, exactly what a concurrent final-answer transaction commits at that moment: the winning `readyAnnouncedAt` compare-and-set (asserted to affect one row, so the loser really did lose one) plus the winner's announcement pointer. The loser is driven through the real dispatcher end to end. The assertions the plan asked for all stand — exactly one announcement, both participants' answers recorded, the card still re-rendered — and the reasoning is recorded in the test's own comment so nobody "restores" the unreachable shape.
- **Files modified:** `tests/integration/planning-availability.test.ts`
- **Verification:** `#posts exactly one announcement when a concurrent claim commits first` — the `expect(interferedCount).toBe(1)` assertion is what makes the race real rather than assumed
- **Committed in:** `fcdd751` / `ae283e0`

**3. [Rule 3 - Blocking] The plan names two new outcomes but four decisions needing log lines**

- **Found during:** Task 2 (adding the retract and cooldown-edit branches)
- **Issue:** The plan's artifact list sanctions exactly two new outcomes (`ready-to-book-announced`, `announce-failed`) and six reasons, two of which — `unanimity-lost-announcement-retracted` and `unanimity-inside-announce-cooldown` — have no outcome of their own. `logPlanning` requires both, and the `BRANCHES` gate requires the pair to be globally unique.
- **Fix:** Both reasons pair with `ready-to-book-announced`, following the shipped `status-reposted` precedent exactly: one outcome names the message under discussion, the reason names what happened to it. The outcome's doc comment now says so. No vocabulary beyond the plan's list was added.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes` passes with all six announcement branches enumerated
- **Committed in:** `9b60e81`

**4. [Rule 3 - Blocking] A second `PLANNING_CATCH_SITES` entry was needed for the lost pointer**

- **Found during:** Task 1
- **Issue:** The plan names one catch site (`announcement`) but also requires `announcement-not-recorded` as a reason for a `recordAnnouncement` that affects no row. `recordAnnouncement` returns the service's house union including a `failed` member carrying an error, and the shipped precedent (`repostAnchor` → `PLANNING_CATCH_SITES.anchor`) routes both the stale and failed cases through one catch site, synthesising an `Error` for the stale one. Logging the stale case through `logPlanning` would have discarded the error on the failed one.
- **Fix:** Added `PLANNING_CATCH_SITES.announcementRecord = { outcome: "announce-failed", reason: "announcement-not-recorded" }`, reusing the outcome the plan already introduces and the reason it already names, and handled both kinds exactly as `repostAnchor` does. No new outcome and no new reason beyond the plan's list.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `tests/unit/planning-logging.test.ts#emits exactly one bounded line for an announcement whose message id cannot be recorded`
- **Committed in:** `ae283e0`

**5. [Rule 1 - Bug in an existing test] The enumerated "availability answer that records" branch would have reached unanimity**

- **Found during:** Task 1
- **Issue:** That branch's double had a single participant, so recording its answer also completed unanimity and emitted the announcement line. Two decisions the gate exists to keep apart would have been driven by one branch, and the new announcement branch would have been indistinguishable from a side effect of the old one.
- **Fix:** Gave it a second, still-pending participant so it stays a collecting answer, and added a separate one-participant branch for the announcement.
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Verification:** both branches now emit exactly one line each for their own outcome
- **Committed in:** `fcdd751`

**6. [Rule 1 - Bug in a new test] A fixed announcement message id made the correcting branches silent on re-run**

- **Found during:** Task 2 (the `BRANCHES` gate failing with `expected undefined to be defined`)
- **Issue:** `LAST_RENDER` is process memory shared by every branch in the logging file, and the gate re-runs each branch several times. The retract and cooldown-edit branches log only AFTER a fingerprinted edit, so their second run was an unchanged render — silent by design — and they dropped out of the enumeration they exist to be covered by. The per-branch test passed; the cross-branch tests failed.
- **Fix:** `freshAnnouncementMessageId()` gives each invocation its own id, the same convention the file already uses for anchors ("Its OWN anchor, so the process-memory render fingerprint another branch left behind cannot short-circuit the edit").
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Verification:** `npx vitest run --project unit tests/unit/planning-logging.test.ts` — 57 passed
- **Committed in:** `fbb5850`

**7. [Rule 3 - Blocking] `lineupLines` was typed to `RosterMember` and could not take the projection's cells**

- **Found during:** Task 1
- **Issue:** The plan requires the announcement to list participants "exactly as the card does — reuse both". `lineupLines` (the review card's `• label` renderer) was typed `readonly RosterMember[]`, which the projection's `AvailabilityParticipantCell` is not.
- **Fix:** Widened it to `<T extends RosterIdentity>`, which `RosterMember` already satisfies, so the review card is unchanged and the announcement shares the one line renderer rather than growing a second copy. The now-unused `RosterMember` import was dropped.
- **Files modified:** `src/telegram/planning-renderers.ts`
- **Verification:** `npm run typecheck`; `tests/unit/planning-review-card.test.ts` and the whole unit suite still pass
- **Committed in:** `ae283e0`

---

**Total deviations:** 7 auto-fixed (3 bugs, 1 missing correctness, 3 blocking)
**Impact on plan:** No scope creep. Every deviation was required for the plan's own acceptance criteria to be satisfiable, and none weakened an assertion the plan asked for. Deviations 2 and 6 fix tests; 1, 3, 4 and 7 fix mechanisms the plan's narrative left underspecified; 5 fixes a pre-existing test that the new behaviour would have made ambiguous.

## TDD Gate Compliance

All three tasks followed RED then GREEN. Each task's test commit precedes its implementation commit and leaves a tree that does not typecheck (the tests import symbols the implementation has not yet introduced), which is the RED state. No REFACTOR commit was needed — the one structural change, the `editAnchor` → `editRoundMessage` extraction, is Task 2's own subject and is covered by the same commit's tests.

## Threat Flags

None. This plan introduces no network endpoint, no new auth path, no file access and no schema change — `readyAnnouncedAt` and `announcementMessageId` were both added by the 03-01 migration. Every trust boundary it touches is already in the plan's `<threat_model>`:

| Threat | Mitigation, and where it is asserted |
|---|---|
| T-03-23 | The compare-and-set; `#posts exactly one announcement when a concurrent claim commits first` |
| T-03-24 | `READY_ANNOUNCE_COOLDOWN_MS`; `#edits the announcement back inside the cooldown and notifies nobody` |
| T-03-25 | Claim before send; `#keeps the claim when the announcement send fails` |
| T-03-26 | `sortRosterMembers` + `memberLabel` only; `#posts one new message …` asserts no `tg://user` |
| T-03-27 | Retraction plus the superseded clear; `#retracts the announcement …` and `#posts a fresh announcement after the cooldown and clears the old copy` |
| T-03-28 | D-17; `anchorMessageId` asserted byte-identical after the announcement and after the re-post |
| T-03-29 | Only allow-listed fields; the logging suite's forbidden-value and allow-listed-key cases |
| T-03-30 | Six distinct bounded reasons, all enumerated in `BRANCHES` |
| T-03-SC | No package was installed by this plan |

## Known Stubs

None. Every symbol this plan declares is reached by a passing test. `PLANNING_BOOKING_ROWS` resolves to no button because no caller mints a booking token yet — that is the declared, tested behaviour of `planningControlRows` (a control whose token is `undefined` is dropped), not a stub: plan 03-05 mints the token and the same call starts producing a button without any signature changing. No `<verify>` block went unrun.

## Issues Encountered

- **A fresh worktree has no `node_modules`.** `npm ci` was run inside the worktree before any test could execute. No dependency file was edited.

## Next Phase Readiness

- **03-05 (manual booking) can proceed.** `renderReadyAnnouncement(projection, tokenFor)` already resolves `PLANNING_BOOKING_ROWS` through `controlTokens`, so minting a `book-request` token is the only change needed to put the control on the announcement — the renderer's signature does not move. `announcementMessageId` is the durable handle 03-05's closing edit needs, and the `/plan_status` announcement slot already keeps it pointed at the only live copy.
- **`readyAnnouncedAt` is authoritative for "has this round been announced", never for "is it still unanimous".** 03-05's apply transaction must re-derive unanimity from the participant rows it reads (Open Question 1 half (a)); a round can be announced and blocked at the same time, and the retraction path deliberately does not null the claim.
- **Phase 4's LIFE-02 and LIFE-05 must read the amended D-12 shape** (two columns, `anchorMessageId` on the card) recorded in `03-CONTEXT.md` and as D-17 here — not D-12's original single-moving-anchor text.
- **No blockers.** `npm run typecheck`, `npm run lint`, `npm run test:unit` (311 passed) and `npm run test:integration` (191 passed) are all green on this worktree.

## Self-Check: PASSED

Files (all `modified`, none `created`):

- `src/domain/planning/planning-service.ts` — FOUND
- `src/telegram/planning-renderers.ts` — FOUND
- `src/telegram/planning-handlers.ts` — FOUND
- `tests/unit/planning-availability-card.test.ts` — FOUND
- `tests/unit/planning-logging.test.ts` — FOUND
- `tests/integration/planning-availability.test.ts` — FOUND
- `tests/integration/planning-recovery.test.ts` — FOUND

Commits: `fcdd751` FOUND, `ae283e0` FOUND, `fbb5850` FOUND, `9b60e81` FOUND, `594bfb8` FOUND, `f5b8a75` FOUND.

Acceptance criteria, re-run after the final task commit:

| Task | Criterion | Command | Result |
|---|---|---|---|
| 1 | constant + cutoff | `grep -c READY_ANNOUNCE_COOLDOWN_MS …planning-service.ts` | 3 (≥2) PASS |
| 1 | two distinct constants | `grep -n '…COOLDOWN_MS = '` | `60 * 1000` / `30 * 60 * 1000` PASS |
| 1 | claim arms + write | `grep -c readyAnnouncedAt …planning-service.ts` | 6 (≥3) PASS |
| 1 | recorder | `grep -c recordAnnouncement` service / handlers | 1 / 1 (≥1 each) PASS |
| 1 | ready renderer | `grep -c renderReadyAnnouncement` renderers / handlers | 1 / 4 (=1, ≥1) PASS |
| 1 | shared identity renderers | `grep -c 'sortRosterMembers\|memberLabel' …planning-renderers.ts` | 12 (≥2) PASS |
| 1 | announcement catch site | `grep -c PLANNING_CATCH_SITES.announcement …handlers.ts` | 3 (≥1) PASS |
| 1 | announced vocabulary | `grep -c 'ready-to-book-announced\|unanimity-claimed-and-announced' …handlers.ts` | 5 (≥4) PASS |
| 1 | superseded clears | `grep -c clearSupersededCard …handlers.ts` | 5 (≥5) PASS |
| 2 | one edit path | `grep -c editRoundMessage …handlers.ts` | 4 (≥4) PASS |
| 2 | retraction renderer | `grep -c renderRetractedAnnouncement` renderers / handlers | 1 / 2 (=1, ≥1) PASS |
| 2 | retraction vocabulary | `grep -c 'unanimity-lost…\|unanimity-inside…'` handlers / logging test | 4 / 2 (≥4, ≥2) PASS |
| 3 | announcement re-anchor | `grep -c reanchorAnnouncement` service / handlers | 1 / 1 (≥1 each) PASS |
| 3 | writes one column | `awk '/async reanchorAnnouncement\(/,/^  \}$/' \| grep -c announcementMessageId` | 1 PASS |
| 3 | revision guard + increment | same range, `grep -c revision` | 2 (≥2) PASS |
| 3 | re-post reason | `grep -c announcement-reposted` handlers / logging test | 2 / 1 (≥2, ≥1) PASS |
| 3 | ONE projection read | `awk '/^export async function handlePlanStatusCommand\(/,/^\}$/' \| grep -v '^\s*[/*]' \| grep -c availabilityProjection` | 1 (≤1) PASS |

Plan-level `<verification>`:

| Command | Result |
|---|---|
| `npx vitest run --project integration tests/integration/planning-availability.test.ts` | PASS (21 tests, including the racing case) |
| `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | PASS (32 tests) |
| `npx vitest run --project unit tests/unit/planning-availability-card.test.ts tests/unit/planning-logging.test.ts` | PASS |
| `npm run test:unit` | PASS (25 files, 311 tests) |
| `npm run test:integration` | PASS (14 files, 191 tests) |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-06*
