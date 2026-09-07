---
phase: 03-availability-and-booking-decision
plan: 08
subsystem: telegram
tags: [prisma, postgres, telegram, compensation, fault-injection, observability, logging]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides: "The ready-to-book announcement, its post-then-record ordering and the correction paths guarded on `announcementMessageId` (03-03, 03-04)"
  - phase: 03-availability-and-booking-decision
    provides: "The shared `claimReadyAnnouncementWindow` compare-and-set, and the `/plan_status` announcement slot that also wins a claim before it posts (03-06)"
  - phase: 03-availability-and-booking-decision
    provides: "`ensureBookingRequestAction` and the total capability order, which the re-announce cases here depend on to render a stable control (03-07)"
provides:
  - "PlanningService.releaseAnnouncementClaim — the compensation for an announcement claim whose message could not be pointed at, a compare-and-set guarded on the claimed instant AND a null pointer"
  - "A retract-or-edit decision derived from a row read INSIDE the answer transaction, and that row handed back to the surface so it addresses the message the decision was made about"
  - "`editRoundMessage` reporting a Telegram not-modified as `unchanged`, demoting `LAST_RENDER` to a request-saver that can never decide an answer"
  - "`logPlanningNotRecorded` — the planning failure line for an outcome that never threw, so `err` in a planning line always means something raised"
  - "Seventeen integration cases and four unit cases covering the send-to-record fault window, both halves of the D-33 asymmetry, and the cold-cache edit result"
affects: [phase-04, phase-05-reminders, any future path that posts a message and then writes a pointer to it]

actuals:
  tokens: 18883
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Post-then-record needs a compensation, not just a log line: a write that names a message which already exists in the chat must be able to hand back whatever it claimed before the send, or the message becomes unaddressable forever"
    - "The compensation's guard is its scope: `releaseAnnouncementClaim`'s null-pointer condition is what excludes the `/plan_status` caller by construction rather than by discipline — the wrong call site cannot fire, it can only be refused"
    - "A decision made at the bottom of a transaction reads its own row; the caller's snapshot from the top of the transaction describes a world that predates everything the decision depends on"
    - "Process memory may save a request and may never decide an answer — any cache whose contents depend on other tenants' traffic must be unobservable in the result"
    - "`err` is reserved for a value that was thrown; a guarded write that matched no row carries a bounded reason instead, so an operator grepping for exceptions finds only exceptions"
    - "Fault injection at the SERVICE, not at the transport: to test a post-send write failure the message has to genuinely land, which is exactly what distinguishes it from a send failure"

key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - tests/helpers/racing-client.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/unit/planning-logging.test.ts

key-decisions:
  - "D-26: the release restores the value the claim REPLACED under a compare-and-set, and does not null the column — null for a first announcement, the previous instant for a re-announce"
  - "D-27: the release is owned by the dispatch that made the claim, not by `recordAnnouncement` — only the caller knows which instant it claimed with and what the column held before"
  - "D-28: a Telegram not-modified response is `unchanged`, and `LAST_RENDER` is demoted from an arbiter to a request-saver"
  - "D-29: `recordAnnouncement` drops its unused clock parameter; `releaseAnnouncementClaim` is now the clocked write this path reserved it for"
  - "D-33: the release is ANSWER-PATH ONLY — the `/plan_status` re-announce deliberately does not release, and the null-pointer guard is the discriminator that enforces it rather than a convention that asks for it"
  - "`claimAnnouncement` hands the transaction-read row BACK with its directive, beyond the plan's 'only the two decisions move' — a surface holding the caller's older snapshot would refuse to carry out the correction the service had just decided was needed"
  - "The announcement-record branch logs a bounded reason for BOTH `failed` and `stale`, so unlike the two anchor sites it does not preserve a thrown cause — plan-conformant but an asymmetry, recorded below as an open item rather than glossed"

patterns-established:
  - "Compensate a post-send pointer write by handing back what was claimed before the send, guarded so the compensation cannot fire where the message was actually delivered"
  - "Fault-inject the service method, not the transport, when the state under test requires the side effect to have happened"
  - "Assert the boundary of a compensation as hard as the compensation itself — the case that goes red when a guard is later dropped is the one that keeps the guard"
  - "Reserve `err` for thrown values; give every non-exception failure a bounded reason from the closed reason vocabulary"

requirements-completed: [AVAIL-02, AVAIL-07, LIFE-01]

coverage:
  - id: D1
    description: "`releaseAnnouncementClaim` restores the value the claim replaced under a compare-and-set, and writes nothing for a moved claim, an addressable round, or a round that is no longer confirmed (D-26, T-03-53)"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#restores the value the claim replaced and answers released"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#restores a previous timestamp rather than nulling the column"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#writes nothing when the claim has already moved on"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#writes nothing for a round that still points at an announcement"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#writes nothing for a round that is no longer confirmed"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#answers a failure rather than throwing"
        status: pass
    human_judgment: false
  - id: D2
    description: "The answer path's failed and stale pointer writes both hand the claim back, strip the orphan's markup, log one bounded line and post nothing (gap G-03, T-03-51)"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#hands the claim back and strips the orphan when the pointer write fails"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#hands the claim back when the pointer write answers stale"
        status: pass
    human_judgment: false
  - id: D3
    description: "After the fault the round announces again on the next unanimity and exactly ONE message in the chat carries the booking control — 03-04 truth 10, now true in the fault case too"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#announces again on the next unanimity, leaving one pressable copy"
        status: pass
    human_judgment: false
  - id: D4
    description: "The orphan is not actionable: pressing what was on it leaves the round CONFIRMED with a null `bookedAt`, and no message on screen offers the control (T-03-52)"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#leaves the round unbooked when the orphan's control is pressed"
        status: pass
    human_judgment: false
  - id: D5
    description: "The D-33 asymmetry, answer path: a post-cooldown re-announce whose pointer write fails keeps its claim and its previous pointer, has only the new copy stripped, and a re-achieved unanimity a minute later EDITS the previous copy and sends nothing (T-03-63)"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#keeps the claim when the round still points at an addressable copy (D-33)"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#BRANCHES → a re-announcement whose message id cannot be recorded (reason `announcement-not-recorded`, distinct from the released half)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The D-33 asymmetry, status path: a `/plan_status` re-announcement whose `reanchorAnnouncement` answers stale has its new copy stripped, still points at the previous announcement, and releases nothing"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#keeps the claim when a re-announcement's pointer cannot be recorded (D-33)"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/telegram/planning-handlers.ts | grep -c 'releaseAnnouncementClaim' == 1 — the answer path's failed-record branch and nowhere else"
        status: pass
    human_judgment: false
  - id: D7
    description: "The residual send-then-crash window heals rather than persisting: a round left with a claim and a null pointer posts and records a fresh announcement once `READY_ANNOUNCE_COOLDOWN_MS` elapses, and a retraction attempted before then is a silent no-op (T-03-64, accepted)"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#heals the send-then-crash residue once the window elapses"
        status: pass
    human_judgment: false
  - id: D8
    description: "The retract-or-edit decision is derived from a row read inside the answer transaction, so an answer landing in another dispatch's send-to-record window sees the pointer that actually exists (T-03-55)"
    requirement: "AVAIL-02"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#edits the announcement a refused claim can now see"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#retracts the announcement a lost unanimity can now see"
        status: pass
    human_judgment: false
  - id: D9
    description: "A Telegram not-modified response reports `unchanged`, so the already-applied alert, the anchor-unchanged line and the announcement branch's silence are identical with a warm and a cold render cache (review finding WR-05, D-28, T-03-56)"
    requirement: "AVAIL-02"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#still gives the tapper the already-applied alert"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#still leaves the announcement's edit branch silent"
        status: pass
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/telegram/planning-handlers.ts | grep -c 'return \"edited\";' == 1 — only the successful-edit path reports an edit"
        status: pass
    human_judgment: false
  - id: D10
    description: "No branch on the planning surface fabricates an exception to reach a log binding: the three former synthetic sites carry a bounded reason and no `err` (finding IN-03, T-03-57)"
    requirement: "AVAIL-02"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#binds no `err` at all for a failure that never threw (four converted branches)"
        status: pass
      - kind: other
        ref: "grep -cF 'new Error(' src/telegram/planning-handlers.ts == 0 (was 3)"
        status: pass
    human_judgment: false

# Metrics
duration: 30 min
completed: 2026-09-07
status: complete
---

# Phase 3 Plan 8: Compensating the Unaddressable Announcement Summary

**Gap G-03 and review finding WR-05 closed: a ready-to-book message whose pointer could not be written now hands its claim back and loses its buttons before the handler returns, the `/plan_status` re-announce is excluded from that compensation by a guard rather than by convention, the retract-or-edit decision is read inside the answer transaction instead of remembered from before it, and a Telegram not-modified response is reported as `unchanged` so neither a tapper's acknowledgement nor an operator's log line depends on a 128-entry process cache shared by every chat.**

## Performance

- **Duration:** 30 min of implementation (`c6bf873` at 14:54:35 +0300 through `b52010a` at 15:24:21 +0300)
- **Completed:** 2026-09-07
- **Tasks:** 3
- **Files modified:** 6

The executing agent was interrupted by a session rate limit immediately after the
last GREEN commit, at the point where it would have written this SUMMARY. All six
implementation commits were preserved and merged; this document was written in a
continuation session from the merged tree. No implementation work was redone, and
no source or test file was touched while writing it.

## Accomplishments

- **The announcement claim has a compensation (G-03).** `releaseAnnouncementClaim` is one guarded `updateMany` restoring `readyAnnouncedAt` to the value the claim replaced. Its `where` clause carries four conditions and each is load-bearing: the id; `status: CONFIRMED`; `readyAnnouncedAt` equal to the instant the caller claimed with, which is the compare-and-set that stops us releasing somebody else's claim (T-03-53); and `announcementMessageId: null`, which is D-33's discriminator. No `revision` bump, for the same reason the claim does not bump it — an announcement is not a step transition.
- **The answer path cleans up after itself.** `dispatchAnnouncement`'s failed-record branch now does three things in order and posts nothing: releases the claim with `now` and the round's own pre-claim `readyAnnouncedAt`; calls the existing `clearSupersededCard` on the message that just landed, so the orphan keeps its text and loses its buttons; and logs one line whose reason names which half of D-33 this was. `failed` and `stale` are treated identically because they are identically unaddressable.
- **The boundary is enforced by construction, not by discipline.** `repostAnchor`'s announcement slot is reached only for a round whose `announcementMessageId` is already non-null, so the release's guard refuses every call from it. The plan could have relied on nobody adding the symmetric call; instead the guard makes the symmetric call a no-op, and a comment at that branch names D-33 and T-03-63 so the next reader sees the asymmetry was decided rather than missed. Both sides are asserted — the answer path's kept-claim case in `planning-availability`, the status path's in `planning-recovery`.
- **The correction decision stopped reading a stale world.** `claimAnnouncement` now takes the round's row with a `findUnique` inside the transaction and derives both the unanimity-lost retraction and the refused-claim edit from it. The caller's snapshot is taken at the top of `answerAvailability`, before the participant write — so an answer landing in another dispatch's send-to-record window used to see a round with no announcement and skip a correction the chat could plainly see was needed.
- **A not-modified response is honest about what happened (WR-05).** `editRoundMessage`'s not-modified catch returns `unchanged` rather than `edited`, and still populates the fingerprint so the next attempt can skip the round trip. `LAST_RENDER`'s doc comment now says what is true of it: capped at 128, shared by every chat, evicted first-in-first-out, and therefore allowed to save a request and never to decide an answer. The two call sites branch in opposite directions on that value, so the old shape made both non-deterministic in the same breath.
- **`err` means something threw (IN-03).** `logPlanningNotRecorded` emits the same event and level with a bounded reason and no `err` key at all. All three fabricated `new Error(...)` constructions are gone; `grep -cF "new Error(" src/telegram/planning-handlers.ts` is 0, down from 3.
- **Twenty-one new cases, seventeen of them against real PostgreSQL.** Integration went 226 → 243, unit 334 → 338. The faults are injected at the *service* rather than at Telegram, because the state under test requires the message to have genuinely landed — which is precisely what distinguishes G-03 from the send failure sitting beside it (T-03-25).

## Task Commits

Each task carried `tdd="true"` and produced a RED and a GREEN commit.

1. **Task 1 RED: failing gates for the claim release and the transaction-local read** — `c6bf873` (test)
2. **Task 1 GREEN: `releaseAnnouncementClaim`, the read moved inside the transaction, the clock parameter dropped** — `ef983f9` (feat)
3. **Task 2 RED: fault-injection gates for the orphaned announcement** — `db81037` (test)
4. **Task 2 GREEN: the answer path compensates a pointer write it could not make** — `91b14f1` (feat)
5. **Task 3 RED: gates for an honest `unchanged` and for `err` meaning a throw** — `ae453e0` (test)
6. **Task 3 GREEN: the not-modified result, and the bounded-reason logger** — `b52010a` (feat)
7. **This SUMMARY** — the seventh commit.

No REFACTOR commit was needed for any of the three.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 | `c6bf873` | `ef983f9` | — | Pass |
| 2 | `db81037` | `91b14f1` | — | Pass |
| 3 | `ae453e0` | `b52010a` | — | Pass |

Every RED commit recorded its observed failures, and each was the failure the fix
addresses rather than an import or syntax error:

- Task 1: 8 failures — 6 for the missing `releaseAnnouncementClaim`, and 2 for a retract-or-edit decision still being made from the caller's pre-claim snapshot.
- Task 2: 5 integration failures and 3 unit failures.
- Task 3: 3 unit failures and 2 integration failures.

**One case in the Task 2 RED commit passes both before and after the fix, by
design.** The `/plan_status` D-33 case in `planning-recovery.test.ts` asserts the
boundary of the compensation rather than the defect: `repostAnchor` already
stripped the un-anchored copy and already released nothing, so the case is green
against the pre-fix tree. It is a preserved-behaviour guard, and the executor
recorded it as such in the RED commit message rather than letting it be counted as
a gate that went red. It earns its place by going red the moment somebody adds the
symmetric release call — which is exactly the regression D-33 exists to prevent.

## Files Created/Modified

- `src/domain/planning/planning-service.ts` — added the `ReleaseAnnouncementClaimResult` union and the public `releaseAnnouncementClaim`, documented as a compensation with its three boundaries stated in full (never reached from a failed send; the null-pointer condition is the discriminator and names `/plan_status` as the caller it excludes; the restore value is what the claim replaced rather than null). `claimAnnouncement` gained a transaction-local `findUnique`, derives both its branches from that row, and now returns `{ directive, round }`. `recordAnnouncement` lost its unused `_now` parameter and the paragraph justifying it. `answerAvailability` returns the transaction-read row and passes it to `ensureBookingRequestAction`.
- `src/telegram/planning-handlers.ts` — `dispatchAnnouncement`'s failed-record branch gained the release, the orphan strip and the bounded-reason log; `repostAnchor`'s failed-re-anchor branch gained a twelve-line comment recording why it deliberately releases nothing; `logPlanningNotRecorded` added; `editRoundMessage`'s not-modified catch returns `unchanged`; `LAST_RENDER` and `editRoundMessage` doc comments rewritten; `PLANNING_REASONS` gained `announcement-claim-released` and `initial-anchor-not-recorded`; the `/plan` and `repostAnchor` anchor branches split failed-vs-stale between the two loggers.
- `tests/helpers/racing-client.ts` — **pre-existing helper (created in phase 02), extended here, not created.** It wraps a `PrismaClient` in nested proxies that interpose exactly one committed write at a chosen seam, so a race can be produced deterministically instead of hopefully. This plan added a third export, `withParticipantAnswerInterference`, which fires immediately before the transaction's first `planningParticipant.updateMany`. That seam is the only correct one for D8: interposing at the round update instead is too late, because the answer transaction's first guarded round write *is* the announcement claim, so a write placed there cannot be observed by a decision the claim precedes — and the unanimity-lost branch never reaches a round write at all. The helper's doc comment records that reasoning in place.
- `tests/integration/planning-availability.test.ts` — three new describe blocks: the six `releaseAnnouncementClaim` statement cases (D-26), the two transaction-local-read cases (D8), and the six-case G-03 block with its `pressableAnnouncements` chat-wide helper and its `announceWithFault` fixture. Plus the two-case WR-05 cold-cache block, whose double returns a real `{ ok: false }` not-modified body so the handler narrows a genuine `GrammyError` rather than a stand-in.
- `tests/integration/planning-recovery.test.ts` — the harness gained `lastSentMessageId()`, because a case in which the pointer write is the thing that *failed* has no column from which to learn the message id. One new case: the status-path D-33 guard.
- `tests/unit/planning-logging.test.ts` — three new `BRANCHES` entries (the initial anchor, the stale re-anchor, and the re-announcement that keeps its claim), which the per-branch distinctness loop turns into three cases; one new explicit gate asserting the four converted branches carry a bounded reason and no `err`; a `staleAnchorWrites` double option; and a fix to `matchesRound` so a `Date` in a `where` clause is compared by instant.

## Decisions Made

- **D-26 (restore, do not null).** D-18's "`readyAnnouncedAt` is never nulled, the passage of the window is the release" governs the ordinary lifecycle and stands. This is narrower: a claim that provably produced no addressable announcement is handed back to the value it replaced — null for a first announcement, the previous instant for a re-announce. Clearing unconditionally would hand a round that *had* announced a fresh window it never earned, which is why the second release case asserts the previous-timestamp path specifically rather than only the null one.
- **D-27 (the dispatch owns the release, not the write method).** `recordAnnouncement` answers `stale` as well as `failed`, and only the caller knows which instant it claimed with and what the column held before. Putting the release inside the write method would have needed the pre-claim value threaded in anyway and would have hidden a second durable write inside a method named for the first.
- **D-28 (a not-modified is `unchanged`).** The cache is demoted to a request-saver. A miss now takes the longer road to the *same* result. Before this, `editAnchor` silently withheld an acknowledgement on a cold cache and `dispatchAnnouncement` emitted a spurious line on a warm one — a single non-deterministic value producing two opposite user-visible symptoms.
- **D-29 (drop the unused clock).** The parameter's stated justification was reserving the shape for a future timestamp column. `releaseAnnouncementClaim` now demonstrates the clocked write on this very path, so the reservation has nothing left to reserve. Re-adding one is a signature edit.
- **D-33 (the release is answer-path only, and the guard is the enforcement).** Recorded in the plan, and implemented so that the guard does the work: the `/plan_status` slot is reached only with a non-null pointer, so a symmetric call would be refused rather than harmful. That matters more than the comment, because a comment can be deleted and a `where` clause cannot be deleted without a test going red.
- **`claimAnnouncement` returns its row, not just its directive** (execution-time, beyond the plan). See deviation 1.
- **The announcement-record branch does not preserve a thrown cause.** The plan specified a single bounded-reason line for that branch, and that is what was built. It is the one place where this plan's three converted sites diverge from each other, and it is recorded as an open item below rather than presented as fully symmetric with the anchor sites.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] The transaction-local read had to be handed back to the surface, not just consumed**

- **Found during:** Task 1 (GREEN)
- **Issue:** The plan says of `claimAnnouncement`: "The parameter stays as the source of the id and the caller's snapshot; only the two decisions move." Moving only the decisions is insufficient. `answerAvailability` returns `round` to the Telegram surface, and the surface's own `announcementMessageId` narrowing decides *which message* to address. With the decision made from the fresh row and the round returned from the stale one, the service would emit `edit` or `retract` for an announcement the surface then could not see, and the correction would be dropped one layer below where it was decided. The D8 cases fail in exactly that shape.
- **Fix:** `claimAnnouncement` returns `{ directive, round }` where `round` is the row read inside the transaction, and `answerAvailability` returns that row rather than its own snapshot. The row is read *before* the claim, so its `readyAnnouncedAt` is still the pre-claim value the release needs — which is what makes the handler's `round.readyAnnouncedAt` argument correct in Task 2.
- **Files modified:** `src/domain/planning/planning-service.ts`
- **Verification:** Both D8 cases pass; the public `AnswerResult` shape is unchanged, so no handler edit was required.
- **Committed in:** `ef983f9`

**2. [Rule 3 - Blocking] The unit Prisma double could not evaluate a `Date` in a `where` clause**

- **Found during:** Task 2
- **Issue:** `matchesRound` treated any non-null object in a `where` clause as a Prisma operator bag. A `Date` is an object with no enumerable keys, so it was rejected as unevaluable — and `releaseAnnouncementClaim`'s compare-and-set is guarded on `readyAnnouncedAt` equalling a `Date`. The new `BRANCHES` entries could not be driven at all.
- **Fix:** A scalar `Date` branch placed *before* the operator branch, comparing by `getTime()` rather than by reference. Comparing by identity would have reported a release for a caller that happened to reuse the same `Date` object and refused an equal one — the double would have been testing object identity rather than the guard.
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Verification:** All 338 unit cases pass; no pre-existing branch changed its behaviour.
- **Committed in:** `db81037` (double), `91b14f1` (its use)

**3. [Rule 3 - Blocking] The double had no way to make an anchor write fail without throwing**

- **Found during:** Task 3 (RED)
- **Issue:** IN-03's whole subject is failures that *answer* rather than raise. The double could make an anchor write throw (`failAnchorWrites`) but not make it match zero rows, so the `stale` half — the half that used to fabricate an `Error` — was unreachable from the unit suite.
- **Fix:** Added `staleAnchorWrites`, which returns `{ count: 0 }` for any write carrying `anchorMessageId`. That is what lets the re-anchor branch be asserted to carry the site's lost-revision-race reason and no `err`.
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Committed in:** `ae453e0`

**4. [Rule 1 - Plan/reality mismatch] `recordAnnouncement` had one call site, not two**

- **Found during:** Task 1 (GREEN)
- **Issue:** The plan's Task 1 says "Update both call sites in the handler module." Only one exists — `dispatchAnnouncement`. The status path uses `reanchorAnnouncement`, which is a different method and keeps its own signature.
- **Fix:** Updated the one call site. No behavioural consequence; noted so the count in the plan is not mistaken for a missed edit.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Committed in:** `ef983f9`

### Open Item Carried Forward

**The announcement-record branch discards a thrown cause, and the tests now lock that in.**

This is not a defect against the plan — the plan's Task 2 says to log that branch
"through the bounded-reason logger Task 3 introduces — no synthesised exception",
and that is exactly what was built. But the plan's Task 3 also says, of the three
converted sites, to keep "the thrown-error path on `logPlanningFailure` in each".
Two of the three do: the `/plan` initial anchor and `repostAnchor`'s re-anchor
each branch on `kind === "failed"` and pass the real error to `logPlanningFailure`,
falling through to `logPlanningNotRecorded` only for `stale`. The announcement
site does not — it routes both `failed` and `stale` to `logPlanningNotRecorded`,
so when `recordAnnouncement` catches a genuine Prisma exception into
`{ kind: "failed", error }`, that error is now dropped rather than logged.

The consequence is narrow but real: an operator investigating a released
announcement claim caused by a database fault sees the reason
`announcement-claim-released` and no cause at all, where before this plan they saw
the actual exception. The two integration cases and the unit gate all assert
`err` is `undefined` on that line, so the loss is now pinned by tests and cannot be
corrected without editing them.

Two things are nevertheless true and are why this is carried rather than fixed
here. The plan's stated success criterion — "no synthesised exception in a failure
line" — is met, and the backstop truth "`err` in a planning failure line always
means something actually threw" is met in the direction it was written: there is
no line whose `err` is fake. Nothing asserts the converse, that every throw
reaches an `err`. Fixing this is the same three-line failed/stale split the other
two sites already carry, plus an adjustment to the `converted` filter in the
`binds no err at all` gate. It belongs in a follow-up, not in an untested edit to
a merged tree.

---

**Total deviations:** 4 auto-fixed (1 missing functionality, 2 blocking, 1 plan/reality mismatch), 1 open item carried forward
**Impact on plan:** None on scope or design. Deviation 1 is the plan's own intent followed one layer further than it was written. Deviations 2 and 3 are test-double capability gaps that had to be closed before the new guards could be exercised at all. Every prohibition holds: nothing is released on a send failure (the residual-window case asserts the claim survives one), the release restores rather than nulls (asserted by its own case), nothing compensating is posted on any failure path (`sendMessage` counts asserted at 1 and 0 respectively), the render cache decides no message, alert or log line, and booking's meaning is unchanged — the orphan strip removes markup and books, retracts and re-opens nothing.

## Issues Encountered

The executing agent was terminated by a session rate limit after committing
`b52010a`, immediately before writing this SUMMARY. No work was lost: all six
commits were preserved and merged, and the gate results below were re-run against
the merged tree before this document was written. No checkpoint was reached, no
authentication gate was hit, and no `<verify>` command went unrun.

Task 2's `<precondition>` — a reachable Docker daemon for the Testcontainers
PostgreSQL — was satisfied throughout.

## Verification Results

Run against the merged tree:

| Check | Result |
|---|---|
| `npm run build` (`tsc --noEmit`) | exits 0 |
| `npm run test` (unit) | 25 files, 338/338 pass (334 before this plan, +4) |
| `npm run test:integration` | 15 files, 243/243 pass (226 before this plan, +17) |

Acceptance greps, all satisfied:

| Criterion | Required | Actual |
|---|---|---|
| `releaseAnnouncementClaim` in `planning-service.ts`, non-comment | at least 1 | 1 |
| `async recordAnnouncement` in `planning-service.ts`, non-comment | exactly 1, no third parameter | 1, two parameters |
| `releaseAnnouncementClaim` in `planning-handlers.ts`, non-comment | exactly 1 | 1 |
| `clearSupersededCard` in `planning-handlers.ts`, non-comment | at least 6 | 6 |
| `return "edited";` in `planning-handlers.ts`, non-comment | exactly 1 | 1 |
| `return "unchanged";` in `planning-handlers.ts`, non-comment | at least 2 | 2 |
| `new Error(` in `planning-handlers.ts` | 0 (was 3) | 0 |
| `logPlanningNotRecorded` in `planning-handlers.ts`, non-comment | at least 4 | 4 |

The plan-level verification item "every correction path guarded on
`announcementMessageId` is now reachable for every announcement that was ever
sent" is asserted rather than argued: D3 shows the round re-announcing and being
pointed at the new copy after the fault, D4 shows the orphan refusing its own
control, and D7 shows the one path no in-process compensation can reach healing
when the window elapses.

## Gap and Finding Closure Verdicts

**Gap G-03 — closed, with one accepted residue that has its own test.**

Every in-process-detectable fault named in the gap is covered by an integration
case that goes red without the fix: `recordAnnouncement` answering `failed`
(`hands the claim back and strips the orphan`) and answering `stale` (`hands the
claim back when the pointer write answers stale`), each asserting all four
required properties — the column back at its pre-claim value, the pointer still
null, exactly one markup-free edit aimed at the message that landed, and one
`sendMessage` in total. The consequence the gap is actually about — that the round
can announce again and that only one message ends up pressable — is asserted
separately and chat-wide by `announces again on the next unanimity, leaving one
pressable copy`, which reads the rendered keyboards of every message in the chat
rather than trusting a single column. `leaves the round unbooked when the orphan's
control is pressed` closes the elevation half (T-03-52) at the durable level: the
round is still `CONFIRMED` with a null `bookedAt`.

The residue the plan explicitly accepts rather than mitigates — the process dying
between the send and the pointer write (T-03-64) — is not closed by compensation
and is not claimed to be. It is covered by `heals the send-then-crash residue once
the window elapses`, which reproduces the state through a real send failure,
asserts the claim is *kept* (T-03-25 intact), asserts a retraction attempted in the
meantime is a silent no-op, then advances past `READY_ANNOUNCE_COOLDOWN_MS` and
asserts a fresh announcement is both posted and recorded. That is the stated
acceptance, met.

The boundary is asserted from both sides, which is what makes the closure durable
rather than momentary: `keeps the claim when the round still points at an
addressable copy (D-33)` on the answer path, and `keeps the claim when a
re-announcement's pointer cannot be recorded (D-33)` on the status path. The first
of those two goes red if the release is ever made unconditional. The second, as
noted above, passes against the pre-fix tree — it guards rather than gates.

**Review finding WR-05 — closed, at integration level, for both call sites.**

Both directions are proven where they matter. `still gives the tapper the
already-applied alert` drives a real tap with the fingerprint cache cold, asserts
the edit request genuinely went out (`editMessageText` count 1, so the answer came
from Telegram and not from memory), and then asserts the alert text, the
`show_alert` flag, the single `anchor-unchanged` line with reason
`rendered-card-already-matches`, and that nothing was reported as a failure. `still
leaves the announcement's edit branch silent` covers the opposite-direction call
site inside the cooldown window and asserts the absence of the
`unanimity-inside-announce-cooldown` line. The doubles return a real `{ ok: false,
error_code: 400, description: "Bad Request: message is not modified" }` body, so
the production `isNotModified` narrowing is exercised on a genuine `GrammyError`
rather than on a stand-in — which is the difference between testing the fix and
testing the mock.

One leg of the plan's behaviour list is covered less directly than the others and
should not be read as more than it is. "A genuine content change still reports
`edited` from both a warm and a cold cache" is asserted for the *warm* case
explicitly — the first WR-05 case makes a second, different answer after the
absorption warmed the cache and asserts no further `anchor-unchanged` line — but
the cold-cache genuine-change leg has no dedicated assertion. It is covered only
implicitly, by the fact that every other case in the suite performs its first
render against a cold cache and expects an edit. That is real coverage, but it is
incidental rather than named, and a future change that broke only that leg would be
caught by the suite at large rather than by a case that says so.

**IN-02 and IN-03 — closed.** The unused clock parameter is gone and the signature
grep confirms it. `new Error(` is absent from the handler module, and the unit gate
asserts all four converted branches carry a bounded reason and no `err`. See the
open item above for the one asymmetry among the three converted sites.

## Known Stubs

None. No `TODO`, `FIXME`, `.skip(` or `.todo(` appears in any of the six files this
plan touched, and no `<verify>` went unrun.

Nothing was appended to `.planning/WINDOWS.md` from this session, because this
session was documentation-only and the ledger is not this agent's to write. One
candidate entry exists and is described in full under **Open Item Carried Forward**
above: the announcement-record branch dropping a thrown cause. It is a `deviation`
in the ledger's vocabulary rather than a stub — the behaviour is complete and
tested, but its diagnosability is narrower than the two sibling sites. The
orchestrator should decide whether to record it.

## Threat Flags

None. The plan's register is addressed as written: T-03-51 and T-03-52 by the
release and the orphan strip with D2, D3 and D4 behind them; T-03-53 by the
compare-and-set with its own refusal case; T-03-54 by the release being unreachable
from a send failure, asserted by the residual-window case keeping its claim;
T-03-55 by the transaction-local read with D8; T-03-56 by the honest `unchanged`
with D9; T-03-57 by the bounded-reason logger with D10; T-03-63 by the null-pointer
guard asserted from both sides with D5 and D6; and T-03-64 accepted with its
healing path tested by D7. T-03-SC holds — no package was installed, and neither
`package.json` nor the lockfile was touched.

No new network endpoint, auth path, file access pattern or schema change was
introduced. `prisma/schema.prisma` was not modified and no column was added, so
the schema gate remains NOT APPLICABLE.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Gap G-03 is closed and review findings WR-05, IN-02 and IN-03 with it. WR-04, WR-07 and IN-01 are closed by `03-09-PLAN.md`, which is the last plan in this phase's gap-closure set.
- `releaseAnnouncementClaim` is the seam for any future path that posts a message and then writes a pointer to it. Its null-pointer guard is not incidental: a caller whose round still has an addressable message will be refused, which is the intended answer and not a bug to be worked around by relaxing the guard. The two D-33 cases go red if it is.
- The follow-up worth scheduling is the failed/stale split at the announcement-record log site, described under **Open Item Carried Forward**. It is three lines of handler code and one filter adjustment in the unit gate.
- `tests/helpers/racing-client.ts` now offers three interference seams. `withParticipantAnswerInterference` is the one to reach for whenever a decision made at the *bottom* of the answer transaction needs to see a write that landed after the snapshot at the top.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were deliberately left untouched — the orchestrator owns them.

## Self-Check: PASSED

- All six modified files exist on disk.
- All six implementation commits (`c6bf873`, `ef983f9`, `db81037`, `91b14f1`, `ae453e0`, `b52010a`) are present in `git log`.
- `git diff --diff-filter=D --name-only 174e72c b52010a` is empty — no file was deleted.
- Every acceptance grep in all three tasks was re-run against the merged tree and passes (table above).
- The three gate commands were run against the merged tree before this document was written; their results are recorded above and were not re-run while writing it.
- One correction to the brief this SUMMARY was written from: `tests/helpers/racing-client.ts` is **not** a new file. It was created in phase 02 (`abe3e22`) and extended in `83f8dc5`; this plan added one export to it. It is therefore listed under `key-files.modified`.

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-07*
