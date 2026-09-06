---
phase: 03-availability-and-booking-decision
verified: 2026-09-06T20:40:19Z
status: gaps_found
score: 52/52 must-haves verified
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 20
  total: 20
  not_honored: []
gaps:
  - truth: "The 30-minute ready-to-book announcement cooldown rate-limits every path that posts a fresh ready-to-book notification to the group"
    status: failed
    reason: "READY_ANNOUNCE_COOLDOWN_MS is consulted only by claimAnnouncement on the answer path. handlePlanStatusCommand reaches the same notifying ctx.reply through the announcement re-post slot, gated only by PLANNING_STATUS_COOLDOWN_MS (60 s). /plan_status is open to every chat member (Phase 2 D-15), so any member can re-notify the whole band with the ready-to-book announcement once per minute, indefinitely, for as long as the round stays unanimous. The constant's own docstring states this is exactly the guarantee it exists to provide. This is a PLAN-level gap, not an executor deviation: 03-04 Task 3 explicitly specifies 'the /plan_status cooldown still applies to every one of these shapes.'"
    artifacts:
      - path: "src/telegram/planning-handlers.ts"
        issue: "handlePlanStatusCommand (:1500-1541) chooses slot: \"announcement\" from a check-then-act read (status + readyAnnouncedAt != null + projection.outcome) with no announcement-cooldown claim; repostAnchor then ctx.reply()s a fresh notifying message"
      - path: "src/domain/planning/planning-service.ts"
        issue: "READY_ANNOUNCE_COOLDOWN_MS (:115) is referenced only at :2261 inside claimAnnouncement; no status-path claim exists"
      - path: "tests/integration/planning-recovery.test.ts"
        issue: ":1500 and :1572 assert the re-post happens and that the 60 s status cooldown applies; nothing asserts the 30-minute announcement window"
    missing:
      - "A service-level compare-and-set (e.g. claimAnnouncementRepost) on readyAnnouncedAt over READY_ANNOUNCE_COOLDOWN_MS, consulted before the announcement slot is chosen"
      - "Fall through to slot: \"anchor\" (the quiet availability-card re-post) inside the window, or edit announcementMessageId in place"
      - "An integration case asserting a second /plan_status inside the 30-minute window posts no new announcement"
  - truth: "The book-request control is a standing capability whose live-row count for a round is answerable"
    status: partial
    reason: "The plan declares book-request a standing capability that is looked up rather than re-minted (planning-service.ts:1198-1216), and loadAvailabilityActions implements exactly that for the two answer tokens. Two paths mint a fresh row anyway, and none consumes or expires the previous one, so live rows grow without bound across request/keep cycles and post-cooldown re-announcements."
    artifacts:
      - path: "src/domain/planning/planning-service.ts"
        issue: "keepBooking returns `actions: [await this.mintBookingRequestAction(...)]` on every keep; answerAvailability mints on every \"post\" directive; loadAvailabilityActions (:1329) has no orderBy, so controlTokens' last-row-wins collapse picks non-deterministically between N live rows"
    missing:
      - "An ensure-then-mint lookup (load a live book-request row before minting) used by both keepBooking and the announcement post branch"
      - "A deterministic orderBy on loadAvailabilityActions so two renders of an unchanged round produce the same keyboard (this also restores the LAST_RENDER no-op fingerprint)"
  - truth: "Every live ready-to-book announcement can be retracted and closed"
    status: partial
    reason: "recordAnnouncement is a post-send write with no compensation. If it fails, the message is live in the chat with a Mark-as-booked control while announcementMessageId stays null — and every correction path (claimAnnouncement's retract branch, retractStaleAnnouncement, closeBookedRound, dispatchAnnouncement's edit/retract branch) is guarded on announcementMessageId !== null. The orphan then permanently asserts 'Time to book the rehearsal' after unanimity is lost and after the round is booked, and a post-cooldown re-announcement does not clear it (supersededMessageId is null), producing two live announcements — the exact state 03-04 truth 10 forbids. No test covers this fault window."
    artifacts:
      - path: "src/telegram/planning-handlers.ts"
        issue: "dispatchAnnouncement (:1858-1871) logs the failed record and returns without stripping the orphan's markup or releasing the claim"
      - path: "src/domain/planning/planning-service.ts"
        issue: "claimAnnouncement (:2253-2260) reads round.announcementMessageId from the pre-write snapshot rather than re-reading, so an answer landing in the send-to-record window also skips the retraction"
    missing:
      - "Release the readyAnnouncedAt claim when the pointer cannot be recorded, so the next answer re-announces into an addressable message"
      - "Strip the orphan's markup via the existing clearSupersededCard before returning, so it at least stops being actionable"
      - "A fault-injection integration case for a failed recordAnnouncement"
  - truth: "/plan_status mints no capability row a non-draft round can never use"
    status: partial
    reason: "D-03 widened status() from DRAFT to RECOVERABLE_ROUND_STATUSES, but mintTakeoverAction gained no status guard. isTakeoverEligible is `now - lastActivityAt >= 30 min`, true for essentially every confirmed or booked round, so every /plan_status from a non-author administrator INSERTs a takeover CallbackAction row for a non-draft round — up to one per minute per chat. The rows are unusable today (takeover() refuses status !== DRAFT and no row constant carries a takeover control), which is why this is a warning rather than a blocker, but it is an unbounded write on the phase's most open command and one row-constant edit away from a live 'take over a booked rehearsal' button."
    artifacts:
      - path: "src/domain/planning/planning-service.ts"
        issue: "mintTakeoverAction (:3234-3241) guards on author, administrator role and inactivity — never on round.status"
    missing:
      - "`if (round.status !== PlanningRoundStatus.DRAFT) return undefined;` at the top of mintTakeoverAction"
      - "A recovery test covering the non-draft case (grep for takeover in planning-recovery.test.ts returns only draft-era assertions)"
  - truth: "REQUIREMENTS.md records the delivery state of every requirement this phase claimed"
    status: partial
    reason: "AVAIL-02, AVAIL-03, AVAIL-04 and LIFE-01 were marked complete by the 03-02 and 03-05 tracking commits. AVAIL-01 and AVAIL-07 are implemented and behaviorally tested but remain `[ ]` in the checklist and `Pending` in the traceability table — plans 03-01/03-03 (AVAIL-01) and 03-04 (AVAIL-07) shipped no tracking update. Bookkeeping drift, not a capability gap."
    artifacts:
      - path: ".planning/REQUIREMENTS.md"
        issue: "AVAIL-01 and AVAIL-07 unchecked and Pending despite verified implementation"
    missing:
      - "Mark AVAIL-01 and AVAIL-07 complete in both the checklist and the traceability table"
deferred: []
---

# Phase 3: Availability and Booking Decision — Verification Report

**Phase Goal:** The selected band members can confirm a proposed rehearsal and the group can mark a unanimous result as manually booked.
**Verified:** 2026-09-06T20:40:19Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Mode:** standard (no `Mode: mvp` on the Phase 3 ROADMAP entry, so MVP User Flow Coverage does not apply)

## Headline

Every one of the phase's 52 declared must-haves holds in the codebase, and all four ROADMAP success criteria are observably achieved end to end against real PostgreSQL. The gaps below are **not** unfinished tasks — they are defects the must-haves were not written to catch, one of them blocker-severity. A `52/52` score with `gaps_found` is the honest shape of this phase: the plans were executed faithfully, and the plans had a hole.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Author can publish a custom availability card after confirming date, time, participant snapshot | VERIFIED | `confirm()` (`planning-service.ts:2189-2214`) mints answer actions in the same transaction that promotes the round and snapshots participants; `dispatchConfirm` (`planning-handlers.ts:1682-1704`) edits the existing anchor to `renderAvailabilityCard`. Integration: `planning-availability.test.ts:320` "edits the round's existing anchor and leaves two unconsumed answer tokens" — PASSES |
| 2 | Included participants can select Can/Cannot attend; outsiders cannot submit | VERIFIED | `answerAvailability` (`:2335-2440`) refuses `participant === null` with `not-a-participant` before any write, then gates the answer on a per-participant compare-and-set. Integration: `:372`, `:415`, `:461`, `:526` (outsider refused privately, no card edit), `:569` (roster-removed participant still answers) — all PASS |
| 3 | Card shows each participant pending/available/unavailable and overall completion | VERIFIED | `renderAvailabilityCard` (`planning-renderers.ts:536-571`) emits one glyph-led line per participant in `sortRosterMembers` order plus `Answered N of M` above the list and a used-markers-only legend. Unit: `planning-availability-card.test.ts:183-345` (11 cases incl. stable order, collator ties, single-participant, empty totality) — all PASS |
| 4 | Unanimity produces a ready-to-book announcement; author or administrator can mark booked | VERIFIED | `claimAnnouncement` (`:2247-2274`) + `dispatchAnnouncement` (`planning-handlers.ts:1773-1904`) post a new message; `openBookingGate` + `applyBooking` (`:2615-2691`) move `CONFIRMED -> BOOKED`. Integration: `planning-availability.test.ts:637`, `planning-booking.test.ts:560` (author books), `:583` (administrator books), `:423` (participant who is neither is refused) — all PASS |

### Observable Truths — Plan Must-Haves

All 48 plan-frontmatter truths were checked against source and against a test I executed myself. Grouped by plan; every row VERIFIED.

#### 03-01 (6 truths) — migration, auto-publish, first answer

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Migration `20260905120000_availability_and_booking` applies cleanly; `db:migrate:deploy` accepts the schema | VERIFIED | Migration present with `CREATE TYPE ParticipantAvailability`, `ALTER TYPE PlanningRoundStatus ADD VALUE 'BOOKED'`, four `planning_rounds` columns and two `planning_participants` columns. `migrate-deploy.mjs:762-772` expects `["DRAFT","CONFIRMED","SUPERSEDED","BOOKED"]` in catalog order. `migration-preflight.test.ts` — PASSES (ran) |
| 2 | Confirm commits the proposal AND opens the availability round in one transaction, no second gesture | VERIFIED | `mintAvailabilityActions` is called inside `confirm`'s `$transaction` on the re-read `confirmed` round (`:2189-2202`); no publish action, command or route exists |
| 3 | The card replaces the anchor in place; the round keeps exactly one `anchorMessageId` | VERIFIED | `dispatchConfirm` calls `editAnchor` (never `ctx.reply`); `reanchorAnnouncement` writes only `announcementMessageId`. Test `:320` asserts the edit targets the draft's `anchorMessageId` |
| 4 | A participant tap is recorded durably and re-renders the card with their marker and updated count | VERIFIED | `updateMany` compare-and-set then same-transaction re-read; `dispatchAvailabilityAnswer` → `editAnchor`. Test `:372` — PASSES |
| 5 | A failed publish edit leaves the round open; no compensating message, nothing rolled back | VERIFIED | `editAnchor` → `editRoundMessage` absorbs the throw into `logPlanningFailure` and returns `"failed"`; `dispatchConfirm` returns after it with no reply and no service call |
| 6 | Answer tokens outlive the 30-minute wizard lifetime | VERIFIED | `availabilityExpiresAt` = `endsAt + AVAILABILITY_ACTION_SLACK_MS` (24 h), not `PLANNING_ACTION_LIFETIME_MS`. Test `:436` "still accepts a tap more than thirty minutes after Confirm" — PASSES |

#### 03-02 (9 truths) — card breadth, changeability, snapshot authority

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Roster-ordered marked lines with a legend advertising only markers in use | VERIFIED | `availabilityLegendFor` filters `AVAILABILITY_LEGEND_ORDER` by the used set. Unit `:288`, `:298`, `:308`, `:335` — PASS |
| 2 | Completion is one count line above the list; no outstanding-names line | VERIFIED | `Answered N of M` is the only count line; no renderer emits a non-responder list. Unit `:183` — PASS |
| 3 | AVAIL-04 adjacency — collator-equal labels render as two stable lines broken by Telegram id | VERIFIED | Unit `:234` — PASS |
| 4 | AVAIL-04 empty — one-participant round renders one line and one-of-one; zero-participant unreachable | VERIFIED | Unit `:252`, `:263`; `confirm` returns `empty-roster` before promotion — PASS |
| 5 | AVAIL-04 ordering — line order fixed at every render, never reshuffles as answers arrive | VERIFIED | `sortRosterMembers` applied inside the renderer. Unit `:199`, `:215` — PASS |
| 6 | The other control overwrites; re-tapping the same one is an idempotent no-op with a private alert | VERIFIED | `OR: [{availability: null}, {availability: {not: answer}}]` → `applied.count !== 1` → `duplicate` → `ALREADY_APPLIED`. Integration `:462`, `:495` — PASS |
| 7 | Cannot-attend records and keeps the round open; the fully-answered blocked card states the fact and offers no replan | VERIFIED | `availabilityOutcome` returns `blocked` only when nobody is pending; `AVAILABILITY_OUTCOME_SENTENCES.blocked` states the fact. Unit `:365`, `:389`; integration `:600` — PASS. **See the specification-conflict resolution below** |
| 8 | Non-snapshot member refused privately with no card edit; roster-removed participant still answers and still counts | VERIFIED | `dispatchAvailabilityAnswer` `not-a-participant` branch answers with `show_alert` and performs no edit; snapshot is the only membership read. Integration `:526`, `:569` — PASS |
| 9 | Every exported refusal constant ≤ 200 characters including interpolated labels | VERIFIED | Unit `:651`, `:677`, `:687` sweep the module's exports against `CALLBACK_ALERT_LIMIT` — PASS |

#### 03-03 (9 truths) — BOOKED through the week/auth filters, D-03 recovery

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `WEEK_CLAIMING_STATUSES` lists CONFIRMED and BOOKED; `weekIsClaimed` otherwise unchanged | VERIFIED | `target-week.ts:42-45`; `target-week.test.ts` — PASSES |
| 2 | SITE :949 — a booked round claims its week; `startOrResume` offers a different one | VERIFIED | `startOrResume` reads `WEEK_CLAIMING_STATUSES`. `planning-booking.test.ts:852` — PASSES |
| 3 | SITE :786 — a booked round is still the chat's previous rehearsal | VERIFIED | `previousRehearsal` (`:1408-1420`) filters on the shared constant. Same test — PASSES |
| 4 | SITE :809 — a booked-round-only participant is still admitted by PREVIOUS_PARTICIPANTS | VERIFIED | `wasPreviousParticipant` (`:1440-1451`) reads the shared constant, deliberately broader than `previousRehearsal` |
| 5 | SITE :1774 — `/plan_status` for a CONFIRMED round re-posts the availability card with live answer controls | VERIFIED | `status()` admits `RECOVERABLE_ROUND_STATUSES`; `renderStep` branches on status before step. `planning-recovery.test.ts:1182` — PASSES |
| 6 | SITE :1887 — `reanchor` admits CONFIRMED and BOOKED under a status+revision CAS; SUPERSEDED still refused | VERIFIED | `reanchor` (`:3150-3162`). `planning-recovery.test.ts:1362`, `:1386`, `:1426` — PASS |
| 7 | `/plan_status` for a BOOKED round re-posts a control-free summary | VERIFIED | `status()` routes non-CONFIRMED to `mintStepActions`, which returns `[]` for any non-draft; `planningControlRows` then drops every control. `planning-recovery.test.ts:1246`, `planning-booking.test.ts:831` — PASS |
| 8 | A status re-post reuses existing answer actions and mints none; live answer tokens stay at two | VERIFIED | `loadAvailabilityActions` is a `findMany`, never a create. `planning-recovery.test.ts:1212` — PASSES |
| 9 | A non-draft round never mints wizard confirm/back tokens | VERIFIED | `mintStepActions` (`:1130`) returns `[]` when `status !== DRAFT`, checked before `stepTargets` |

#### 03-04 (12 truths) — the ready-to-book announcement

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Last pending can-attend posts a NEW message; the card also updates to all-clear | VERIFIED | `dispatchAnnouncement` `post` branch `ctx.reply`s; the card edit is separate. Integration `:637` — PASSES |
| 2 | AVAIL-07 adjacency — two concurrent final answers produce EXACTLY ONE announcement, proven by a racing client | VERIFIED | `claimAnnouncement`'s `updateMany` CAS on `readyAnnouncedAt`. `:772` "posts exactly one announcement when a concurrent claim commits first" uses `withPlanningRoundInterference` — PASSES |
| 3 | AVAIL-07 empty — one-participant round announces on its only answer; a final cannot-attend announces nothing and leaves `readyAnnouncedAt` null | VERIFIED | Integration `:696`, `:721` — PASS |
| 4 | AVAIL-07 ordering — announcement and card share `sortRosterMembers`; the announcement sends only after its claim commits | VERIFIED | `renderReadyAnnouncement` uses `lineupLines`; the directive is returned by the committed transaction and acted on afterwards. Unit `:479`; integration `:772` — PASS |
| 5 | Unanimity derived once by `availabilityOutcome` from rows read inside the answer transaction, never from the card | VERIFIED | `answerAvailability:2494-2497` is the only derivation on the answer path; renderers consume `projection.outcome` |
| 6 | The claim is durable BEFORE the send; a Telegram failure leaves the round claimed and un-announced, posts nothing compensating | VERIFIED | `claimAnnouncement` commits inside the answer transaction; the `ctx.reply` catch logs and returns. Integration `:840` — PASSES |
| 7 | `READY_ANNOUNCE_COOLDOWN_MS` is its own constant; `PLANNING_STATUS_COOLDOWN_MS` neither reused nor changed | VERIFIED | `:96` = 60 s, `:115` = 30 min, distinct declarations. **But see G-01: the 30-minute constant is not consulted on the `/plan_status` path** |
| 8 | Lost unanimity edits the announcement to a control-free retraction; the card keeps its answer controls | VERIFIED | `renderRetractedAnnouncement` returns no `keyboard` key; the card is untouched on that branch. Integration `:925` — PASSES |
| 9 | Re-achieved unanimity inside the cooldown edits and notifies nobody; after the cooldown posts a fresh message | VERIFIED | `claimAnnouncement` returns `edit` when the CAS is refused and a message exists. Integration `:970`, `:1008` — PASS |
| 10 | A round never has two live announcements; a post-cooldown re-announce clears the superseded copy in the same act | VERIFIED (normal path) | `dispatchAnnouncement` calls `clearSupersededCard` with the same arguments the `/plan_status` slot uses. Integration `:1008`, `planning-recovery.test.ts:1500` — PASS. **G-03 identifies a fault window where this invariant does not hold** |
| 11 | A ready-to-book round has two live messages; neither column is written with the other's id | VERIFIED | `recordAnnouncement` and `reanchorAnnouncement` write only `announcementMessageId`; `reanchor`/`setAnchor` only `anchorMessageId`. Integration `:637` asserts `anchorMessageId` is byte-identical after the announcement |
| 12 | `/plan_status` for a ready-to-book round re-posts the announcement, re-points only `announcementMessageId`, from ONE projection read | VERIFIED | `handlePlanStatusCommand:1501-1541` reads the projection once and threads it into `repostAnchor`. `planning-recovery.test.ts:1500`, `:1536`, `:1600` — PASS. **This is the path G-01 flags** |

#### 03-05 (12 truths) — manual booking

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The announcement carries Mark-as-booked; the tap replaces it with a named confirm/keep pair | VERIFIED | `PLANNING_BOOKING_ROWS` / `PLANNING_BOOKING_CONFIRM_ROWS`; `requestBooking` mints the pair and books nothing. Integration `planning-booking.test.ts:369` — PASSES |
| 2 | Author can book; a current administrator can book; anyone else refused privately, no group message, no card edit | VERIFIED | `openBookingGate` `not-eligible`; `dispatchBookApply`/`dispatchBookRequest` `not-eligible` branches perform no edit. Integration `:560`, `:583`, `:423` — PASS |
| 3 | Administrator eligibility resolved fresh at tap time via a thunk and re-resolved on apply | VERIFIED | `bookingRole` returns `() => deps.authorization.currentRole(...)`, awaited at the top of all three transitions. Integration `:603` "refuses an administrator demoted between the request and the confirm" — PASSES |
| 4 | Confirm/keep are NOT bound to the requester; eligibility decided on apply | VERIFIED | `planningCallbackRoute` is `actorBinding: "route-resolved"`; the gate reads `round.authorUserId`, never `action.actorUserId`. Integration `:493` — PASSES |
| 5 | Booking re-derives unanimity inside the apply transaction; the rendered announcement is never authority | VERIFIED | `openBookingGate` runs on `applyBooking`'s own `tx` and calls `availabilityOutcome` over rows it just read. Integration `:636` — PASSES. **Deviation 2 confirmed: the re-derivation moved into the shared gate, which still executes inside applyBooking's transaction** |
| 6 | `CONFIRMED -> BOOKED` in one guarded pair; lost revision race releases the token and refuses as stale | VERIFIED | `consumedAt IS NULL` CAS then `updateMany` on `status`+`revision`, `releaseAction` on `count !== 1`. Integration `:706` — PASSES |
| 7 | A replayed confirm affects zero rows, gets the already-applied alert, produces no second transition | VERIFIED | `openBookingGate` refuses `action.consumedAt !== null` as `duplicate`. Integration `:658` — PASSES |
| 8 | Every booking refusal is read-only and precedes the consume | VERIFIED | `openBookingGate` writes nothing; all three callers consume only after `gate.kind === "eligible"`. Integration `:423`, `:468` |
| 9 | `bookedAt`/`bookedByUserId` recorded; no call site reads either to decide bookedness | VERIFIED | Repo-wide grep: `bookedAt` appears in non-generated source at exactly one write (`:2655`) and three comments. Zero reads |
| 10 | Booking closes the round: both messages re-rendered control-free; a late answer tap gets the already-booked alert | VERIFIED | `closeBookedRound` passes `noControls = () => undefined` to both renderers; `answerAvailability` has an `already-booked` branch before the CONFIRMED check. Integration `:764`, `:797` — PASS |
| 11 | Phase 3 ships no undo: no cancel/change/unbook/re-open control, command or callback target anywhere | VERIFIED | `planningTargetSchema` has no such action. Unit `:611`, `:622` sweep the surface's copy constants structurally — PASS |
| 12 | Booking rides the existing planning callback kind and route; no second boundary, no new route id | VERIFIED | One `callback:PLANNING` route in `handlers.ts:268`; `book-request`/`book-apply`/`book-keep` are members of the existing `planningTargetSchema` union (`callback-schema.ts:127`) |

**Score:** 52/52 truths verified (0 present, behavior-unverified). Every behavior-dependent truth — each state transition, each cancellation/ordering invariant — is backed by a test I executed, not by symbol presence.

### Specification Conflict — Resolved (carried forward for the record)

**Conflict.** 03-02 Task 1's acceptance criterion reads *"the blocked-outcome render contains no control row."* D-04 keeps answers freely changeable until the round closes and D-05 leaves a blocked round OPEN — booking, not a "no", is what closes it. A blocked render without a control row would strand a participant who tapped "Cannot attend" by mistake.

**What the code does.** `renderAvailabilityCard` (`planning-renderers.ts:571-574`) always builds its keyboard from `planningControlRows(PLANNING_AVAILABILITY_ROWS, tokenFor)`. There is no `outcome === "blocked"` branch anywhere in the renderer. A blocked round therefore keeps **both** answer controls, because its tokens are still live and unconsumed. The unit suite pins this explicitly (`planning-availability-card.test.ts:389-412`): the blocked render's labels are exactly `[Can attend, Cannot attend]`, no third control, no replan copy.

**Verdict: the implementation satisfies D-04/D-05 and deviates from the literal 03-02 criterion — and that is the correct resolution.** The criterion, as written, would have shipped an unrecoverable state. The property actually guaranteed and asserted is the one worth having: *the renderer adds no control of its own*, and a projection whose tokens were never minted draws no row at all (`:417`, `:433` cover the control-free forms). The executor recorded the deviation in 03-02-SUMMARY.md rather than silently absorbing it. No override is needed; the criterion was wrong, and 03-02 Task 1's criterion text should be treated as superseded by D-04/D-05 for any future re-verification.

### Execution-Recovery Checks (waves 3 and 5, executor killed mid-plan)

| Check | Finding |
|-------|---------|
| 03-03 completeness | All nine truths verified against source. All three widened filters (`previousRehearsal`, `wasPreviousParticipant`, `startOrResume`) read the shared constant rather than restating it. `planning-round.test.ts` + `planning-recovery.test.ts` — 79 tests PASS (ran) |
| 03-05 completeness | All twelve truths verified. `planning-booking.test.ts` 22 cases PASS (ran). No half-finished task found |
| 03-05 deviation 1 — replaced wave-4 assertion | **Genuinely stronger.** The old assertion (`fcdd751:661`) was `expect(announcement?.payload.reply_markup).toBeUndefined()` — a statement that the booking control did not exist *yet*, necessarily obsolete once 03-05 shipped it. The replacement asserts the announcement carries exactly one control labelled `PLANNING_BOOK_LABEL` **and** that the token behind it resolves to a `CallbackAction` row with `consumedAt: null`. It verifies existence, uniqueness and durable backing where the original verified only absence |
| 03-05 deviation 2 — `availabilityOutcome` not inside `applyBooking` | **Intent holds.** `applyBooking` opens `this.prisma.$transaction` and passes that `tx` to `openBookingGate`, which calls `availabilityOutcome` over rows read on the same `tx`. The re-derivation is inside the apply transaction; only the lexical location moved. Extracting it also removed the three-way drift risk across `requestBooking`/`keepBooking`/`applyBooking` |
| 03-05 deviation 3 — week-claiming cases relocated | **Coverage exists.** `planning-booking.test.ts:852` "still claims its target week and is the chat's previous rehearsal" covers both. A reasonable home: the cases are about a *booked* round |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/migrations/20260905120000_availability_and_booking/migration.sql` | Enum + columns for availability and booking | VERIFIED | Substantive; `migrate-deploy.mjs` preflight updated to match catalog order |
| `src/domain/planning/target-week.ts` | `WEEK_CLAIMING_STATUSES` extended with BOOKED | VERIFIED | 112 lines; imported by `planning-service.ts` at three filter sites |
| `src/telegram/planning-renderers.ts` | Availability card, announcement, retraction, booking confirmation | VERIFIED | 713 lines; five renderers, all total functions of a projection, all consumed by `planning-handlers.ts` |
| `tests/unit/planning-availability-card.test.ts` | Card breadth, outcome, no-undo sweep | VERIFIED | 703 lines, 27 cases — PASS |
| `tests/integration/planning-availability.test.ts` | Publish, answer, snapshot, announcement | VERIFIED | 1148 lines, 17 cases against real PostgreSQL — PASS |
| `tests/integration/planning-booking.test.ts` | LIFE-01 matrix end to end | VERIFIED | 884 lines, 22 cases — PASS |
| `tests/integration/planning-round.test.ts` | Week claiming / authorization filters | VERIFIED | 1098 lines — PASS |
| `tests/integration/planning-recovery.test.ts` | D-03 recovery, ready-to-book re-post | VERIFIED | 1676 lines — PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `PlanningService.confirm` | availability card keyboard tokens | `mintAvailabilityActions` → `CallbackAction` rows → `renderAvailabilityCard` | WIRED | Minted inside the confirm transaction; `controlTokens` resolves them at render |
| callback boundary | anchor edit | route-resolved → `dispatchAvailabilityAnswer` → `answerAvailability` → `editAnchor` | WIRED | Single `callback:PLANNING` route; `actorBinding: "route-resolved"` so one keyboard serves N participants |
| `schema.prisma` enum order | migration ADD VALUE order | `migrate-deploy.mjs hasExactValues` | WIRED | `BOOKED` appended last in all three places |
| `availabilityOutcome` | card outcome sentence | `AVAILABILITY_OUTCOME_SENTENCES[projection.outcome]` | WIRED | One derivation, zero call-site repetition |
| `sortRosterMembers` + bigint tie-break | stable line order | renderer applies it on every render | WIRED | Unit-pinned |
| `WEEK_CLAIMING_STATUSES` | three INNER filters | `previousRehearsal` / `wasPreviousParticipant` / `startOrResume` | WIRED | All three spread the shared constant |
| `RECOVERABLE_ROUND_STATUSES` | `status()` read → `reanchor` CAS | both widened together | WIRED | The D-03 path is reachable only because both widened |
| `answerAvailability` re-read | announce/edit/retract branch | `availabilityOutcome` → `readyAnnouncedAt` CAS → `AnswerResult.announcement` | WIRED | Directive decided in the transaction, carried out by the handler |
| one projection per answer | card AND announcement | built once, passed to both renderers | WIRED | The two messages cannot disagree |
| `recordAnnouncement` | `renderStep` ready branch → `repostAnchor` announcement slot | `announcementMessageId` | WIRED | **Fault window — see G-03** |
| `AuthorizationService.currentRole` thunk | `requestBooking` → `applyBooking` re-check | resolved twice, authority only at apply | WIRED | Non-destructive lookup; the draft-deleting helper is not imported |
| `consumedAt` CAS | status+revision guard → `releaseAction` | `applyBooking` | WIRED | Release only on the lost race |
| `PlanningRoundStatus.BOOKED` | two control-free edits + already-booked branch | `closeBookedRound` | WIRED | Both messages closed in one act |
| announcement claim | book-request mint → announcement keyboard → confirm/keep → apply | full booking chain | WIRED | **But the mint is repeated — see G-02** |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `renderAvailabilityCard` | `projection.participants` | `planningParticipant.findMany` with membership+user include, via `availabilityProjection` / the answer transaction re-read | Yes | FLOWING |
| `renderAvailabilityCard` | `answeredCount` / `totalCount` | Derived from the same rows in `availabilityStepProjection` | Yes | FLOWING |
| `renderAvailabilityCard` | `outcome` | `availabilityOutcome` over those rows | Yes | FLOWING |
| `renderAvailabilityCard` | `booked` | `round.status === BOOKED` from the DB row | Yes | FLOWING |
| `renderReadyAnnouncement` | lineup | The same projection instance as the card | Yes | FLOWING |
| `renderBookingConfirmation` | `booked` | Re-read round from `applyBooking`'s own transaction | Yes | FLOWING |
| keyboards | tokens | `CallbackAction` rows, loaded not re-derived on the status path | Yes | FLOWING (non-deterministic selection among duplicates — G-02) |

No hardcoded literals, static fallbacks or mocks in any render path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit suites | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/target-week.test.ts tests/unit/planning-logging.test.ts` | 4 files, 119 tests passed | PASS |
| Availability + booking against real PostgreSQL | `npx vitest run --project integration tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts` | 2 files, 39 tests passed (10.0 s) | PASS |
| Recovery, week claiming, migration preflight | `npx vitest run --project integration tests/integration/planning-recovery.test.ts tests/integration/planning-round.test.ts tests/integration/migration-preflight.test.ts` | 3 files, 79 tests passed (93.5 s) | PASS |
| `bookedAt` never read as authority | `grep -rn "bookedAt" src/ --include=*.ts` (excluding generated) | 1 write, 3 comments, 0 reads | PASS |
| `READY_ANNOUNCE_COOLDOWN_MS` enforcement sites | `grep -rn "READY_ANNOUNCE_COOLDOWN_MS" src/` | 1 declaration, 1 use (`claimAnnouncement` only) | **FAIL — G-01** |
| Single callback route | `grep -n "id: \"callback" src/telegram/handlers.ts` | one `callback:PLANNING` | PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist in this repository and neither the plans nor the summaries declare a probe. Step 7c: SKIPPED (no probes declared or discoverable).

### Requirements Coverage

Plan-declared IDs across all five plans: 03-01 {AVAIL-01, AVAIL-02, AVAIL-04}, 03-02 {AVAIL-02, AVAIL-03, AVAIL-04}, 03-03 {LIFE-01, AVAIL-01}, 03-04 {AVAIL-07, AVAIL-02}, 03-05 {LIFE-01}. Union = the exact six the ROADMAP maps to Phase 3. **No orphaned requirements** — REQUIREMENTS.md maps no additional ID to Phase 3.

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| AVAIL-01 | 03-01, 03-03 | Author can publish a card for the confirmed date, time and snapshot | SATISFIED | Auto-publish in the confirm transaction; `planning-availability.test.ts:320`. **Still `[ ]`/Pending in REQUIREMENTS.md — G-05** |
| AVAIL-02 | 03-01, 03-02, 03-04 | An included participant can answer Can/Cannot attend | SATISFIED | `answerAvailability`; `:372`, `:415`, `:462`, `:495` |
| AVAIL-03 | 03-02 | Responses from users outside the snapshot are rejected | SATISFIED | `not-a-participant` refusal before any write; `:526` |
| AVAIL-04 | 03-01, 03-02 | Card shows every participant's state and overall completion | SATISFIED | `renderAvailabilityCard`; 11 unit cases |
| AVAIL-07 | 03-04 | Unanimity announces that the rehearsal is ready to book | SATISFIED | `claimAnnouncement` + `dispatchAnnouncement`; `:637`, `:696`, `:721`, `:772`. **Still `[ ]`/Pending in REQUIREMENTS.md — G-05** |
| LIFE-01 | 03-03, 03-05 | Author or administrator can mark a ready rehearsal booked | SATISFIED | `requestBooking`/`applyBooking`; `planning-booking.test.ts:560`, `:583`, `:603` |

### Decision Coverage

All 20 CONTEXT/plan decisions (D-01 … D-20) appear in shipped source or tests. Counts: D-01 6 files, D-02 10, D-03 11, D-04 11, D-05 8, D-06 6, D-07 8, D-08 6, D-09 6, D-10 6, D-11 5, D-12 6, D-13 9, D-14 9, D-15 10, D-16 6, D-17 4, D-18 4, D-19 6, D-20 3. **20/20 honored, 0 not honored.** Non-blocking gate; recorded for drift tracking.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `tests/unit/planning-availability-card.test.ts` | AVAIL-04, LIFE-01 | 27 | 0 | No | Value + structural sweep | SUFFICIENT |
| `tests/unit/planning-keyboards.test.ts` | LIFE-01 | 8 | 0 | No | Value (serialized markup) | SUFFICIENT |
| `tests/unit/target-week.test.ts` | LIFE-01 | — | 0 | No | Value | SUFFICIENT |
| `tests/unit/planning-logging.test.ts` | all | — | 0 | No | Structural branch enumeration | SUFFICIENT |
| `tests/integration/planning-availability.test.ts` | AVAIL-01/02/03/04/07 | 17 | 0 | No | Behavioral (real PostgreSQL, racing client) | SUFFICIENT |
| `tests/integration/planning-booking.test.ts` | LIFE-01 | 22 | 0 | No | Behavioral (real PostgreSQL) | SUFFICIENT |
| `tests/integration/planning-recovery.test.ts` | AVAIL-01, PLAN-10 | 40 | 0 | No | Behavioral | SUFFICIENT |
| `tests/integration/planning-round.test.ts` | LIFE-01, PLAN-02/03 | — | 0 | No | Behavioral | SUFFICIENT |
| `tests/integration/migration-preflight.test.ts` | AVAIL-01 (schema) | — | 0 | No | Behavioral (real catalog) | SUFFICIENT |

**Disabled tests on requirements:** 0 — a repo-wide grep for `it.skip`/`describe.skip`/`xit`/`it.todo`/`.only` returns nothing.
**Circular patterns detected:** 0 — no fixture-generating script imports a system under test. Expected values are literal copy constants and structurally derived orderings, not captured output.
**Insufficient assertions:** 0 — every requirement-linked case reaches value or behavioral level. The concurrency cases use a real racing client (`withPlanningRoundInterference`) rather than asserting over `sequentialize`.
**Coverage gaps:** the fault windows named in G-03 (failed `recordAnnouncement`) and G-04 (non-draft `mintTakeoverAction`) have no case at all.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/domain/planning/planning-service.ts` | 1248 | `PLACEHOLDER` | Info | Prose in a docstring ("the round's author as a PLACEHOLDER actor"), describing a deliberate NOT-NULL fill. Not a stub marker |

**Debt-marker gate:** clean. Zero `TBD`, `FIXME` or `XXX` in any of the 20 files this phase modified. No empty implementations, no console-log-only handlers, no hardcoded empty data reaching a render.

### Gaps Summary

The phase goal is achieved. All four ROADMAP success criteria are observably true in the codebase and demonstrated by 237 passing tests I executed against real PostgreSQL. All 52 declared must-haves hold. The five gaps below are defects the must-haves were not shaped to catch — the plans specified them into existence or simply did not consider them.

**G-01 (BLOCKER) — the 30-minute announcement cooldown is bypassed by `/plan_status`.**
`READY_ANNOUNCE_COOLDOWN_MS` exists, per its own docstring, to stop "a group NOTIFICATION that fires from an ordinary participant's mis-tap" notifying "the whole band repeatedly inside a single conversation." It is consulted at exactly one site: `claimAnnouncement`, on the answer path. `handlePlanStatusCommand` reaches the same `ctx.reply` — same "Ready to book … Time to book the rehearsal" copy, same live Mark-as-booked control, same group notification — through the announcement re-post slot, gated only by the 60-second `PLANNING_STATUS_COOLDOWN_MS`. Phase 2 D-15 opens `/plan_status` to every member of the chat. Any band member can therefore re-notify the whole group once a minute, indefinitely, for as long as the round stays unanimous, and each re-post leaves another buttonless "Ready to book" body in the chat.

This is a **plan-level** gap, and I want that recorded precisely: 03-04 Task 3's acceptance criteria say "The `/plan_status` cooldown still applies to every one of these shapes," and 03-04 truth 12 requires the announcement re-post. The executor built exactly what was specified. No declared must-have fails. What fails is the guarantee the codebase claims for itself, and it fails against the project's own core value — coordinating a rehearsal *without* spamming the band. That gap between "every must-have holds" and "the stated guarantee does not" is why this phase is `gaps_found` at 52/52.

**G-02 (WARNING) — standing `book-request` capabilities are re-minted, so their live count is unanswerable.** `keepBooking` mints on every keep and `answerAvailability` mints on every post directive, none consumed or expired. `loadAvailabilityActions` reads them all without `orderBy`, and `controlTokens`' last-row-wins collapse then picks non-deterministically — so two renders of an unchanged round can produce different keyboards, defeating the `LAST_RENDER` no-op fingerprint. Not an authorization escalation (`openBookingGate` re-checks everything), but it destroys the property the standing-capability design was defending.

**G-03 (WARNING) — a failed `recordAnnouncement` orphans a live announcement forever.** Every correction path is guarded on `announcementMessageId !== null`, so one lost pointer write leaves a group message permanently asserting the slot is ready with a live booking control, uncorrectable after unanimity is lost and after the round is booked — and a later post-cooldown re-announce will not clear it, producing the two live announcements 03-04 truth 10 forbids. The narrower same-shaped window between the answer commit and the record is closed by `sequentialize` for a single process, which is weaker than the statement-level guarantee the surrounding comments claim.

**G-04 (WARNING) — `mintTakeoverAction` gained no status guard when D-03 widened `/plan_status`.** Every status request from a non-author administrator on a confirmed or booked round now inserts an unusable `PLANNING` capability row, unbounded, on the phase's most open command. One row-constant edit from becoming a live "take over a booked rehearsal" button.

**G-05 (WARNING) — requirement tracking is out of step.** AVAIL-01 and AVAIL-07 are implemented and behaviorally tested but remain unchecked and `Pending` in REQUIREMENTS.md; their sibling four were updated. Bookkeeping only.

None of the five is addressed by a later milestone phase — Phase 4 is replanning and lifecycle, Phase 5 is reminders — so nothing here is deferrable.

---

_Verified: 2026-09-06T20:40:19Z_
_Verifier: Claude (gsd-verifier)_
