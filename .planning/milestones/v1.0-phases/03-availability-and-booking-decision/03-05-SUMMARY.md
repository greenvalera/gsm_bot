---
phase: 03-availability-and-booking-decision
plan: 05
subsystem: planning
tags: [telegram, grammy, prisma, postgres, callback-actions, booking, authorization]

# Dependency graph
requires:
  - phase: 03-01
    provides: "availabilityOutcome, availabilityStepProjection's booked flag, PLANNING_BOOK_LABEL / PLANNING_BOOKING_ROWS, the book-* callback target union, answerAvailability's already-booked branch"
  - phase: 03-02
    provides: "renderAvailabilityCard and its marked lineup, the 200-character refusal sweep"
  - phase: 03-03
    provides: "loadAvailabilityActions, WEEK_CLAIMING_STATUSES and previousRehearsal widened to admit BOOKED, the booked-round /plan_status re-post"
  - phase: 03-04
    provides: "the readyAnnouncedAt claim, AnnouncementDirective, renderReadyAnnouncement, renderRetractedAnnouncement, editRoundMessage, withoutEmptyKeyboard, announcementMessageId (D-17)"
provides:
  - "mintBookingRequestAction and mintBookingConfirmationActions, and loadAvailabilityActions widened to keep a round's live book-request row"
  - "requestBooking / keepBooking / applyBooking on PlanningService, all three over one shared read-only openBookingGate"
  - "renderBookingConfirmation — the named confirmation and the record a booked round becomes, from one renderer"
  - "dispatchBookRequest / dispatchBookKeep / dispatchBookApply and their fan-out branches"
  - "the CONFIRMED -> BOOKED transition under a consume-then-guard pair with token release on a lost race"
  - "closeBookedRound: the two control-free closing edits (D-16)"
  - "tests/integration/planning-booking.test.ts — the LIFE-01 / D-13 / D-14 / D-16 / D-19 matrix against real PostgreSQL"
affects: [phase-04-lifecycle, LIFE-02, LIFE-03, LIFE-04, LIFE-05]

actuals:
  tokens: 113000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "One shared read-only gate opened by every transition of a family, so the family cannot drift on its authorization rule"
    - "A refusal that carries the rows its transaction read, so a corrective render never needs a second read"
    - "One renderer driven by a lifecycle flag for a message whose copy changes state, so a single message id has a single source of copy"

key-files:
  created:
    - tests/integration/planning-booking.test.ts
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-availability.test.ts
    - tests/integration/planning-recovery.test.ts

key-decisions:
  - "All three booking transitions take the role as a thunk resolved at tap time, matching dispatchTakeover, and all three route through the shared openBookingGate"
  - "The unanimity-lost refusal carries the round and participants, so the announcement's retraction renders from the transaction that made the decision"
  - "renderBookingConfirmation is one renderer for both the confirm/keep offer and the booked record, driven by the projection's status-derived booked flag"
  - "One distinct log reason per booking control per branch, so a dead Mark-as-booked, a dead confirm and a dead keep are tellable apart in the logs"
  - "The unminted-planning-target reason was retired: every planning callback target is now dispatched"

patterns-established:
  - "Shared gate over duplicated guards: openBookingGate is opened by requestBooking, keepBooking and applyBooking, so the eligibility and unanimity rules exist once"
  - "Read-only refusals before the consume: every booking refusal is decided by a read, so a refused tap leaves the control spendable (T-03-38)"
  - "Consume-then-guard with release on the lost race: the consumedAt compare-and-set and the status+revision guard commit together, and a lost guard releases the consume"
  - "Control-free cards via an undefined-answering token lookup plus withoutEmptyKeyboard — never a disabled-button concept, never an empty markup"

requirements-completed: [LIFE-01]

coverage:
  - id: D1
    description: "The ready-to-book announcement carries a Mark-as-booked control, and tapping it opens a named confirm/keep pair rather than booking immediately (D-12, D-14)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#offers the named confirm/keep pair and books nothing (D-14)"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-keyboards.test.ts#puts the commit first and the way out under it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#posts one new message when the last pending participant can attend"
        status: pass
    human_judgment: false
  - id: D2
    description: "The author or a current chat administrator can book; anyone else is refused with a private alert naming only the roles that can, with no group message and no card edit (LIFE-01, D-13)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#accepts a current administrator who is not the author (D-13)"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses a snapshot participant who is neither, privately and without an edit"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#names who can book without listing a single administrator"
        status: pass
    human_judgment: false
  - id: D3
    description: "Administrator eligibility is resolved fresh at tap time through the non-destructive current-role lookup and re-resolved on apply: an administrator demoted between the request and the confirm is refused (D-13, AUTH-02, T-03-32)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses an administrator demoted between the request and the confirm"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses an actor whose role lookup cannot be resolved"
        status: pass
      - kind: other
        ref: "grep -rn requireCurrentAdministrator src/domain/planning/ src/telegram/planning-*.ts (0 matches)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The confirm/keep pair is actor-unbound: a second eligible person can complete a confirmation the author opened (D-19)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#lets a second eligible person complete a confirmation the author opened"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#lets a current administrator book, and records the administrator"
        status: pass
    human_judgment: false
  - id: D5
    description: "Booking re-derives unanimity from the participant rows inside the apply transaction and refuses with a private alert when it no longer holds; the rendered announcement is never the authority"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses a confirm whose slot died after the confirmation was opened"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses a request once unanimity has been lost"
        status: pass
    human_judgment: false
  - id: D6
    description: "CONFIRMED -> BOOKED in one guarded pair: the token is consumed with a consumedAt IS NULL compare-and-set, the round moves under status plus revision, and a lost revision race releases the token and refuses as stale (RELI-02, T-03-33)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#moves confirmed to booked and records who did it"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#releases the confirm token when the guarded round update loses its race"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#answers a replayed confirm as applied and does not move the round twice"
        status: pass
    human_judgment: false
  - id: D7
    description: "Booking closes the round: both messages are re-rendered with no controls at all, and a late answer tap gets the already-booked alert and changes nothing (D-16)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#leaves nothing to press on either of the round's two messages"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#refuses a late answer tap, changes nothing, and edits nothing"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#SITE :1774 — re-posts a booked round as a control-free summary (D-16)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Phase 3 ships no undo: no cancel, change, unbook or re-open control, command or callback target exists on the booked round's surface (D-14, D-16)"
    requirement: LIFE-01
    verification:
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#offers no undo, cancel, unbook or re-open in any planning copy constant"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-availability-card.test.ts#offers none of it on the booked round's two closing messages either"
        status: pass
    human_judgment: false
  - id: D9
    description: "A booked round still claims its target week and is the chat's previous rehearsal, exercising plan 03-03's widened status filters against a round the product actually booked (D-15)"
    requirement: LIFE-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts#still claims its target week and is the chat's previous rehearsal"
        status: pass
    human_judgment: false
  - id: D10
    description: "Every booking dispatch branch leaves a distinguishable trace: nine new BRANCHES entries across the request, keep and apply controls, each driven for real"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
    human_judgment: false
  - id: D11
    description: "The booking copy reads well to a band member in the chat — the confirmation says plainly what recording it means, and the closing messages read as a record rather than as a dead card"
    verification: []
    human_judgment: true
    rationale: "Copy tone and comprehensibility in a live group chat is not assertable by test. The structural properties (no undo vocabulary, the 200-character cap, no member label or numeric id in a refusal) ARE asserted; whether the wording lands for the band is a human read."

duration: 33min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 05: The Manual Booking Decision Summary

**The planning author or a fresh-resolved chat administrator can record a ready rehearsal as booked behind a named confirm/keep pair, under a consume-then-guard transition that re-derives eligibility and unanimity inside the apply transaction and closes both of the round's messages with nothing left to press.**

## Performance

- **Duration:** 33 min (this session; the plan was previously interrupted mid-Task-1 by a provider rate limit)
- **Started:** 2026-09-06T19:37:00Z
- **Completed:** 2026-09-06T20:10:04Z
- **Tasks:** 3
- **Files modified:** 7 (1 created, 6 modified)

## Continuation context — what this session inherited

A previous executor was killed mid-Task-1 by a provider rate limit. Its work was already committed on the base (`b9af104`) and this session resumed from it rather than restarting:

- `a7afa5c` — the plan's **RED tests**: `tests/integration/planning-booking.test.ts` (534 lines) plus additions to `planning-availability-card.test.ts`, `planning-keyboards.test.ts` and `planning-logging.test.ts`. Treated as the specification throughout; **not one committed assertion was weakened, deleted or rewritten to make the source pass.**
- `18d39d2` — a partial GREEN: `mintBookingRequestAction`, `mintBookingConfirmationActions`, the widened `loadAvailabilityActions`, the mint call inside the announcement claim, the `availabilityParticipants` flattener, `requestBooking`, `keepBooking`, `openBookingGate`, and the keyboard labels/rows.

The inherited base failed `npm run build` with exactly two errors, both in the committed RED tests (`renderBookingConfirmation` and `PLANNING_BOOKING_NOT_ELIGIBLE` missing) — the normal TDD RED condition. The continuation brief listed `PLANNING_BOOKING_CONFIRM_ROWS` as not done; it was in fact already present and correct in `src/telegram/keyboards.ts`, so `keyboards.ts` needed no edit at all in this session.

### The two reconciliations, and what was chosen

**1. Role thunk vs. resolved role — the thunk was chosen, for all three.**
The plan's prose said the handler resolves the role and passes an already-resolved `CurrentTelegramRole`; the inherited `requestBooking` / `keepBooking` took a `() => Promise<CurrentTelegramRole>` thunk. The **committed RED test decided it**: `tests/integration/planning-booking.test.ts` calls `planning.requestBooking(chatId, ADMIN_ID, bookToken, NOW, async () => "unknown")`. The thunk also matches `dispatchTakeover`'s shipped precedent and keeps the Telegram round trip outside the row lock, with the service owning the freshness rule rather than the surface. `applyBooking` was written to the same shape, and a single `bookingRole(deps, context)` helper on the surface builds the thunk for all three dispatches — so none of them can quietly acquire a staler role than its siblings.

**2. `requestBooking`'s inlined gate — routed through `openBookingGate`.**
The inherited `requestBooking` carried its own copy of the token re-read, status check, eligibility check and unanimity re-derivation. It now opens with the shared gate, as `keepBooking` and `applyBooking` do. The gate's `consumedAt !== null → duplicate` check is a genuine no-op on the request path (the request row is a standing capability and is never consumed), which is exactly why routing through it is safe. All three transitions now answer the question that matters most — *who may book, and does the slot still work* — from one place.

## Accomplishments

- `renderBookingConfirmation`: one renderer for the named confirmation and for the record a booked round becomes, driven by the projection's status-derived `booked` flag (D-15/D-16/D-20).
- `applyBooking`: the one irreversible transition Phase 3 ships — gate, then a `consumedAt IS NULL` compare-and-set, then a `status` + `revision` guarded update, with `releaseAction` on the lost race and no release on success.
- Three dispatchers (`dispatchBookRequest`, `dispatchBookKeep`, `dispatchBookApply`) with one `logPlanning` and one `answerCallbackQuery` per branch, and one distinct reason per control per branch.
- `closeBookedRound`: two closing edits from ONE projection, both control-free via `withoutEmptyKeyboard` — no disabled-button concept, no empty markup.
- `tests/integration/planning-booking.test.ts` grew from 7 to 14 to 18 cases, all against real PostgreSQL.
- **LIFE-01 is true**, and the last of the four `03-VALIDATION.md` Wave 0 gaps is closed.

## Task Commits

1. **Task 1: The Mark-as-booked control and its named confirmation pair** — `a0801cf` (feat). RED was already committed on the base as `a7afa5c`.
2. **Task 2: The CONFIRMED to BOOKED transition under an expected-revision guard** — `f84139a` (test, RED) → `8432217` (feat, GREEN)
3. **Task 3: Booking closes the round — control-free cards and the late tap** — `6dc1c73` (test, RED) → `113aba0` (feat, GREEN)

No `refactor` commit was needed: the reconciliations landed inside Task 1's GREEN, and nothing required cleanup afterwards.

## Files Created/Modified

- `tests/integration/planning-booking.test.ts` — **created on the base, extended here.** The LIFE-01 / D-13 / D-14 / D-16 / D-19 matrix, 18 cases, every one driven through the real dispatcher against real PostgreSQL.
- `src/domain/planning/planning-service.ts` — `applyBooking`; `requestBooking` routed through `openBookingGate`; the `unanimity-lost` refusal widened to carry its round and participants.
- `src/telegram/planning-handlers.ts` — `PLANNING_BOOKING_NOT_ELIGIBLE`, `PLANNING_UNANIMITY_LOST`, `PLANNING_CATCH_SITES.booking`, five outcomes and eighteen reasons, the booking members of `controlTokens`, `bookingRole`, `retractStaleAnnouncement`, `closeBookedRound`, the three dispatchers and their fan-out branches.
- `src/telegram/planning-renderers.ts` — `renderBookingConfirmation`; the availability card's closing sentence now chosen by the BOOKED position.
- `tests/unit/planning-logging.test.ts` — three `BRANCHES` entries for the apply path (six for request/keep arrived with the RED commit).
- `tests/integration/planning-recovery.test.ts` — its booked case now books through the product path instead of seeding the position.
- `tests/integration/planning-availability.test.ts` — its announcement case now asserts the live Mark-as-booked control (see Deviation 1).

## Decisions Made

- **The role thunk, for all three transitions** (reconciliation 1 above). Reversible: unwrapping it is a signature change at three call sites.
- **`openBookingGate` is opened by all three transitions** (reconciliation 2 above). This makes the eligibility rule and the unanimity re-derivation single-sourced.
- **The `unanimity-lost` refusal carries the round and participants.** The other four refusals stay bare. Without this the surface would have to issue a SECOND participant read to render the retraction, and a concurrent answer committing between the refusal and the render would leave the corrected message describing a lineup the refusal never saw.
- **One renderer for both states of the announcement's second life.** The message that offers the pair is the message the closing edit rewrites; two renderers for one message id would be two places for its copy to drift.
- **One distinct log reason per control per branch** — `booking-target-no-longer-actionable` vs `booking-keep-target-no-longer-actionable` vs `booking-apply-target-no-longer-actionable`, and likewise for the eligibility, unanimity, already-booked and duplicate branches. The committed RED test's own comment demanded it: "an operator holding nothing but the logs has to be able to tell a dead Mark-as-booked from a dead confirm from a dead keep."
- **`unminted-planning-target` was retired.** With all three booking targets dispatched, the planning target union is exhaustively handled and the placeholder refusal became unreachable dead vocabulary in a bounded enumeration.
- **The `offered`, `kept` and `booked` branches answer the callback explicitly.** The boundary's `answered` guard makes a redundant second answer a no-op, so this is safe and matches the plan's instruction that each branch answers.

## Deviations from Plan

### 1. [Rule 1 — Bug] A wave-4 assertion contradicted this plan's shipped behavior

- **Found during:** Task 3 (full integration run)
- **Issue:** `tests/integration/planning-availability.test.ts:664` asserted `announcement?.payload.reply_markup` is `undefined`, with the comment *"No booking control is minted by this plan"*. That was true of plan 03-04's build. Plan 03-05 mints the control inside the announcement claim, and this plan's own committed RED test asserts the opposite (`expect(labelsOf(announcement)).toEqual([PLANNING_BOOK_LABEL])`). The two tests could not both pass.
- **Fix:** Replaced the stale assertion with a **stronger** one — the announcement carries exactly `[PLANNING_BOOK_LABEL]`, and the token behind it resolves to a real, unconsumed `CallbackAction` row. This is a self-scoped wave-4 assertion superseded by wave 5, not a weakened test: the case now proves the button is live rather than proving it is absent.
- **Files modified:** `tests/integration/planning-availability.test.ts`
- **Verification:** `npx vitest run --project integration` — 209/209.
- **Committed in:** `113aba0`

### 2. [Documented] Task 2's `availabilityOutcome` grep criterion is not satisfied literally

- **Criterion:** `awk '/async applyBooking\(/,/^  \}$/' src/domain/planning/planning-service.ts | grep -c 'availabilityOutcome'` is 1. **Actual: 0.**
- **Why:** the criterion was written assuming three inlined copies of the unanimity re-derivation. Reconciliation 2 — which this session was explicitly asked to make — moved it into `openBookingGate`, which `applyBooking` opens with **inside its own `$transaction`**. Inlining a duplicate purely to satisfy the grep would re-create exactly the drift the shared gate exists to prevent.
- **The criterion's intent is met, and is checkable:**
  - `awk '/private async openBookingGate\(/,/^  \}$/' … | grep -c 'availabilityOutcome'` → **1**
  - `awk '/async applyBooking\(/,/^  \}$/' … | grep -c 'this.openBookingGate'` → **1**
  - `grep -c 'this.openBookingGate' …` → **3** (all three transitions)
- **Stronger evidence than the grep:** `tests/integration/planning-booking.test.ts#refuses a confirm whose slot died after the confirmation was opened` drives a participant flipping to cannot-attend *after* the confirmation is opened and asserts against real PostgreSQL that the confirm refuses, the round stays `CONFIRMED`, and the token stays unconsumed.
- **All other Task 2 criteria pass literally** (`releaseAction` 1, `bookedByUserId` 1, `consumedAt` 2, `dispatchBookApply` 2, `PLANNING_CATCH_SITES.booking` 3).

### 3. [Documented] Task 3's week-claiming and previous-rehearsal cases live in the booking test file

- **Plan asked:** extend `tests/integration/planning-round.test.ts`'s week-claiming and previous-rehearsal cases to run against a round booked through `applyBooking`.
- **Done instead:** added `#still claims its target week and is the chat's previous rehearsal` to `tests/integration/planning-booking.test.ts`, which asserts both facts against a round booked through the full product path (`/plan` → confirm → answers → announcement → request → confirm).
- **Why:** `planning-round.test.ts` has its own harness with no path to ready-to-book, and its booked cases seed the position directly by design. The booking file already owns `reachReadyToBook` and `openConfirmation`. The plan's stated intent — *"so plan 03-03's three widened sites are exercised against a round the product actually produced"* — is met; only the file differs.
- **The recovery half was done as written:** `planning-recovery.test.ts`'s booked case now calls a new `bookThroughTheProduct` helper instead of `prisma.planningRound.update({ status: "BOOKED" })`.

---

**Total deviations:** 1 auto-fixed (Rule 1 — a stale cross-plan assertion), 2 documented divergences from acceptance-criterion letter where the criterion's intent is met and separately verified.
**Impact on plan:** No scope creep and no weakened coverage. Deviation 1 strengthened an existing test. Deviations 2 and 3 are consequences of the two reconciliations this session was asked to make, and both are covered by real-PostgreSQL assertions rather than by greps.

## Issues Encountered

- The worktree had no `node_modules`; `npm ci` was run inside it. `package.json` and `package-lock.json` were untouched.
- One full-integration run reported 2 failing files; two subsequent runs reported 1 (the `planning-availability` case above), and the final run is 15/15 files, 209/209 tests. The extra failure did not reproduce and appears to have been Testcontainers timing.

## Known Stubs

None. No stub, placeholder, skipped test or unrun `<verify>` was introduced by this plan.

## Threat Flags

None. Every file touched is inside this plan's declared `<threat_model>` surface, and no new network endpoint, auth path, file access pattern or schema change was introduced — `applyBooking` writes only columns the phase's existing migration already added.

## Verification

| Gate | Result |
|---|---|
| `npm run build` (`tsc --noEmit`) | **0** |
| `npx vitest run --project unit` | **330/330** (25 files) |
| `npx vitest run --project integration` | **209/209** (15 files) |
| `npm run lint` (`prettier --check`) | clean |
| `npx vitest run --project integration tests/integration/planning-booking.test.ts` | **18/18** |
| `tests/unit/planning-logging.test.ts` — no indistinguishable branch | pass |
| `grep -rn requireCurrentAdministrator src/domain/planning/ src/telegram/planning-*.ts` | **0** |

### Phase-level closure (all five plans)

- All six phase requirement IDs appear across the plan set: AVAIL-01 (03-01, 03-03), AVAIL-02 (03-01, 03-02, 03-04), AVAIL-03 (03-02), AVAIL-04 (03-01, 03-02), AVAIL-07 (03-04), LIFE-01 (03-03, 03-05). **LIFE-01 marked complete in `REQUIREMENTS.md` by this plan** — the shared-ID gate confirmed 03-03's summary already exists.
- All four `03-VALIDATION.md` Wave 0 gaps are now closed: `tests/unit/planning-availability-card.test.ts` (03-02), `tests/integration/planning-availability.test.ts` (03-01), `tests/integration/planning-booking.test.ts` (**03-05, this plan**), the `BRANCHES` extension (03-02 through 03-05).

## User Setup Required

None — no external service configuration required. No package was installed by this phase, matching `03-RESEARCH.md`'s Package Legitimacy Audit ("Packages installed by this phase: none").

## Next Phase Readiness

- **Phase 3 is complete.** `PlanningRoundStatus.BOOKED` is now written by the product, not only by test seeds, and `bookedAt` / `bookedByUserId` are durable for Phase 4.
- **Phase 4 inherits a clean seam.** LIFE-02 and LIFE-05 read `PlanningRound.status` directly (D-15); no call site anywhere branches on `bookedAt` or `bookedByUserId` being non-null to decide whether a round is booked. `WEEK_CLAIMING_STATUSES` and `previousRehearsal` already admit `BOOKED` and are now exercised against a product-booked round.
- **The no-undo posture is structural, not editorial.** A unit sweep over every exported planning copy constant and both closing cards fails on `undo|unbook|un-book|cancel|re-?open`. Phase 4's LIFE-03/LIFE-04 will need to relax that sweep deliberately when it ships a real reversal path — which is the intended signal, not an obstacle.
- **One open flagged assumption carries forward, still unresolved:** the LIFE-01 edge probe returned `unclassified`, so "ready" remains defined as *confirmed with every participant available, re-derived inside the apply transaction*. A round that has never been unanimous is not bookable in Phase 3 and there is no manual override. No `verification: backstop` was added for it, as the plan required.

## Self-Check: PASSED

- All five task commits present on the branch: `a0801cf`, `f84139a`, `8432217`, `6dc1c73`, `113aba0`.
- All declared key files present on disk, including the created `tests/integration/planning-booking.test.ts`.
- No file deletions in any commit (`git diff --diff-filter=D --name-only b9af104..HEAD` is empty).
- Every Task 1 and Task 3 acceptance criterion verified by command; every Task 2 criterion except the `availabilityOutcome` grep, documented above as Deviation 2 with its intent separately verified.

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-06*
