---
phase: 03-availability-and-booking-decision
plan: 01
subsystem: database
tags:
  [prisma, postgres, migration, grammy, telegram, zod, vitest, testcontainers]

# Dependency graph
requires:
  - phase: 02-weekly-rehearsal-proposal
    provides:
      "The confirm transaction, the confirm-time PlanningParticipant snapshot,
      the single in-place anchor card, the callback boundary's route-resolved
      planning route, and the migration-deploy preflight this plan extends"
provides:
  - "The 20260905120000_availability_and_booking migration: ParticipantAvailability, PlanningRoundStatus.BOOKED, and the six new nullable columns"
  - "The AVAILABILITY_MIGRATION gate in prisma/migrate-deploy.mjs, covering both the pre- and post-migration catalog"
  - "The answer and booking members of planningTargetSchema"
  - "Shared, never-consumed availability answer tokens with a round-derived expiry (AVAILABILITY_ACTION_SLACK_MS, availabilityExpiresAt, mintAvailabilityActions)"
  - "availabilityOutcome / availabilityStepProjection — the one derivation of what an availability round says"
  - "PlanningService.answerAvailability — the per-participant compare-and-set"
  - "renderAvailabilityCard, replacing renderConfirmedStep (D-02)"
  - "dispatchAvailabilityAnswer and the answer catch site / outcome / reason vocabulary"
  - "PLANNING_AVAILABILITY_ROWS, PLANNING_BOOKING_ROWS, the three participant markers and the three new labels"
affects:
  - 03-02-availability-card-breadth
  - 03-03-recovery-and-status
  - 03-04-ready-to-book-announcement
  - 03-05-manual-booking
  - phase-04-lifecycle
  - phase-05-reminders

actuals:
  tokens: 21457
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Shared, never-consumed callback capability: one keyboard serves N participants; the exactly-once property lives on the domain row, not the token"
    - "Round-derived callback expiry for a capability that outlives the wizard's 30-minute action lifetime"
    - "Per-participant compare-and-set with an explicit `OR: [{col: null}, {col: {not: value}}]` predicate for a nullable column"
    - "Migration-name-gated catalog tuples in the deploy preflight, ordered by physical column position"

key-files:
  created:
    - prisma/migrations/20260905120000_availability_and_booking/migration.sql
    - tests/integration/planning-availability.test.ts
  modified:
    - prisma/schema.prisma
    - prisma/migrate-deploy.mjs
    - src/shared/callback-schema.ts
    - src/domain/planning/planning-service.ts
    - src/telegram/keyboards.ts
    - src/telegram/planning-renderers.ts
    - src/telegram/planning-handlers.ts
    - tests/integration/migration-preflight.test.ts
    - tests/integration/planning-confirm.test.ts
    - tests/integration/planning-participant-integrity.test.ts

key-decisions:
  - "The answer capability rows are minted inside the confirm transaction, never consumed and never released — D-04 keeps both buttons live for the whole round, so the atomic gate moves from the callback row to the participant row"
  - "Answer tokens expire from PlanningRound.endsAt plus 24 hours, not from PLANNING_ACTION_LIFETIME_MS — the callback boundary refuses an expired row before the dispatcher runs, so the wizard lifetime would have killed the buttons half an hour after publication"
  - "answerAvailability carries no round-level expectedRevision guard: N participants legitimately act in parallel, and a round-level guard would discard one of two simultaneous answers as stale"
  - "answerAvailability does not refresh lastActivityAt — it measures the AUTHOR's silence for takeover eligibility"
  - "The answered branch re-reads BOTH shared tokens rather than reusing the tapped one, so the re-rendered keyboard is the keyboard the rest of the band still sees"
  - "An undispatched booking target is refused with its own bounded reason rather than falling through into the day/time selection tail"
  - "The preflight test keeps a separate INTEGRITY_MIGRATION constant: retargeting the six integrity-specific cases at the newest migration would have left them passing while proving nothing"

patterns-established:
  - "Availability projection mirrors ReviewStepProjection: cells carry the four RosterIdentity fields verbatim so sortRosterMembers and memberLabel are reused rather than re-derived"
  - "One marker value per participant (ParticipantMarker), never a set of flags — the same shape as DayMarker and SlotMarker"
  - "availabilityOutcome is the single derivation of collecting / all-available / blocked, never repeated at a call site"

requirements-completed: [AVAIL-01, AVAIL-02, AVAIL-04]

coverage:
  - id: D1
    description:
      "The 20260905120000_availability_and_booking migration applies to an
      inherited Phase 2 database and npm run db:migrate:deploy accepts both the
      pre- and post-migration schema states (D-15)"
    verification:
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#applies the availability migration to a database stopped one migration short"
        status: pass
      - kind: integration
        ref: "tests/integration/migration-preflight.test.ts#accepts a fully migrated database with nothing left to apply"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-participant-integrity.test.ts#offers exactly the four reachable planning round statuses, in order"
        status: pass
    human_judgment: false
  - id: D2
    description:
      "Pressing Confirm commits the proposal AND opens the availability round in
      the same transaction, publishing the card onto the round's existing anchor
      with two live answer controls and no second author gesture (AVAIL-01,
      D-01/D-02)"
    requirement: AVAIL-01
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#edits the round's existing anchor and leaves two unconsumed answer tokens"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-confirm.test.ts#promotes the round, snapshots the lineup and releases the week in one go"
        status: pass
    human_judgment: false
  - id: D3
    description:
      "A snapshot participant tapping Can attend has their answer recorded
      durably on their own row and no other, the shared token survives the
      answer, and the same token answers again for a second participant
      (AVAIL-02)"
    requirement: AVAIL-02
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#records exactly one row, keeps the token live and re-renders the card"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#answers the SAME token for a second participant"
        status: pass
    human_judgment: false
  - id: D4
    description:
      "The card names every snapshot participant with their marker and shows an
      answered-of-total count that moves as answers arrive (AVAIL-04, D-08/D-09)"
    requirement: AVAIL-04
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#records exactly one row, keeps the token live and re-renders the card"
        status: pass
    human_judgment: false
  - id: D5
    description:
      "The answer callback tokens outlive the 30-minute wizard action lifetime: a
      tap more than 30 minutes after Confirm is dispatched, not refused as
      expired"
    verification:
      - kind: integration
        ref: "tests/integration/planning-availability.test.ts#still accepts a tap more than thirty minutes after Confirm"
        status: pass
    human_judgment: false
  - id: D6
    description:
      "The availability card's wording, glyphs and layout read correctly in a
      real Telegram group — marker legibility, line ordering and the count line
      at band-roster size"
    verification: []
    human_judgment: true
    rationale:
      "Copy, glyph rendering and visual scannability in the Telegram client
      cannot be asserted from the serialized payload; the phase's UAT covers it
      at end-of-phase per the configured human_verify_mode."

# Metrics
duration: 27min
completed: 2026-09-06
status: complete
---

# Phase 3 Plan 01: Availability Tracer Summary

**Confirm now auto-publishes a live availability card onto the round's existing anchor, backed by the `20260905120000_availability_and_booking` migration, shared never-consumed answer tokens, and a per-participant compare-and-set that records one answer without touching anyone else's row.**

## Performance

- **Duration:** ~27 min
- **Started:** 2026-09-06T00:27:00Z
- **Completed:** 2026-09-06T00:54:00Z
- **Tasks:** 2
- **Files modified:** 10 (plus the committed generated Prisma client)

## Accomplishments

- Landed the one Phase 3 migration — a new `ParticipantAvailability` enum, `BOOKED` appended last on `PlanningRoundStatus`, and six nullable columns — with the deploy preflight extended to accept both the pre- and post-migration catalog.
- Folded publication into the confirm transaction (D-01): the same commit that promotes the proposal mints the two shared answer capabilities, so a published card never has buttons whose rows do not exist.
- Turned `renderConfirmedStep` into a transition (D-02): the confirmed summary is now the availability card's heading, on the round's original `anchorMessageId`, so the round still has exactly one live control surface.
- Recorded one participant's answer durably through a single atomic compare-and-set on the participant row, leaving both shared tokens unconsumed and every other participant's row untouched.
- Proved the whole path end to end against real PostgreSQL, including a tap dispatched more than thirty minutes after Confirm — the case the wizard's action lifetime would silently have killed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Availability and booking migration with its deploy preflight** — `f32d550` (feat)
2. **Task 2 (RED): the failing availability tracer suite** — `4757266` (test)
3. **Task 2 (GREEN): Confirm publishes, one participant answers** — `0eb9011` (feat)

_Task 2 was `tdd="true"`, so it carries a `test` commit followed by a `feat` commit. No refactor commit was needed._

## Files Created/Modified

- `prisma/schema.prisma` — the `ParticipantAvailability` enum, `BOOKED` appended last, and the six new nullable columns
- `prisma/migrations/20260905120000_availability_and_booking/migration.sql` — purely additive: one `CREATE TYPE`, one `ADD VALUE`, six `ADD COLUMN`s, no lock and no guard block
- `prisma/migrate-deploy.mjs` — `AVAILABILITY_MIGRATION`, the `roundColumns` / `participantColumns` locals, and both gated enum catalogs
- `src/shared/callback-schema.ts` — the `answer` and booking members of `planningTargetSchema`
- `src/domain/planning/planning-service.ts` — `AVAILABILITY_ACTION_SLACK_MS`, `availabilityExpiresAt`, `mintAvailabilityActions`, `availabilityActions`, `availabilityOutcome`, `availabilityStepProjection`, `answerAvailability`, and `ConfirmResult.answerActions`
- `src/telegram/keyboards.ts` — the three participant markers, the two answer labels, `PLANNING_BOOK_LABEL`, `PLANNING_AVAILABILITY_ROWS`, `PLANNING_BOOKING_ROWS`, and the widened `PlanningControlAction`
- `src/telegram/planning-renderers.ts` — `renderAvailabilityCard`; `renderConfirmedStep` deleted
- `src/telegram/planning-handlers.ts` — `dispatchAvailabilityAnswer`, the answer branch of `controlTokens`, the rewritten confirmed branch, `PLANNING_CATCH_SITES.answer`, and the new bounded outcomes/reasons
- `tests/integration/planning-availability.test.ts` — the tracer suite
- `tests/integration/migration-preflight.test.ts` — split `INTEGRITY_MIGRATION` from `TARGET_MIGRATION`, plus two new real-PostgreSQL cases
- `tests/integration/planning-confirm.test.ts`, `tests/integration/planning-participant-integrity.test.ts` — assertions retuned to D-02 and D-15

## Decisions Made

- **The answer token is a standing capability, never consumed.** Consuming it would kill the shared button for the rest of the band at the first tap and make D-04's change-your-mind impossible. The exactly-once property moved to the participant row's compare-and-set.
- **Answer expiry is derived from the round, not from a wizard constant.** `PLANNING_ACTION_LIFETIME_MS` is thirty minutes and the callback boundary refuses an expired row *before* the dispatcher runs, so reusing it would have made the phase unable even to improve the refusal copy.
- **No round-level `expectedRevision` on an answer.** Parallel answers are the normal shape of an availability round; a round-level guard would refuse a correct answer as stale.
- **`lastActivityAt` is not refreshed by an answer.** It measures the author's silence for takeover eligibility, and a bystander's tap is not evidence the author is present.
- **The preflight suite keeps two migration constants.** Six cases exercise the *integrity* migration's specific behaviour (the `ABANDONED` label it removes, the composite foreign key, the lock it holds, the index it creates); pointing them at the newest, purely additive migration would have left them green while proving nothing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The re-rendered card would have lost one of its two buttons**

- **Found during:** Task 2 (handler wiring)
- **Issue:** The plan's `answered` branch re-renders the anchor from the tapped action alone. `planningControlRows` drops a control whose token is `undefined`, so the first answer would have deleted the opposite button from every band member's card — silently breaking D-04's change-your-mind for the rest of the round.
- **Fix:** Added a private `PlanningService.availabilityActions` lookup that re-reads BOTH live answer rows by exact match on the deterministic target JSON inside the same transaction, and returned them on `AnswerResult.answered` as `actions`. The handler renders `controlTokens(result.actions)`.
- **Files modified:** `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts`
- **Verification:** `tests/integration/planning-availability.test.ts` answers the SAME token for a second participant after the first answer re-rendered the card.
- **Committed in:** `0eb9011`

**2. [Rule 2 - Missing Critical] An undispatched booking target would have been applied as an hour choice**

- **Found during:** Task 2 (dispatcher fan-out)
- **Issue:** The plan adds the `book-request` / `book-apply` / `book-keep` members to `planningTargetSchema` now but dispatches them in a later plan. The dispatcher's tail computes `isDay = action === "day"` and otherwise calls `selectTime`, so any booking target reaching it would have been routed into the time-selection transaction.
- **Fix:** Added an explicit early return refusing any target that is neither `day` nor `time`, with its own bounded reason `unminted-planning-target`.
- **Files modified:** `src/telegram/planning-handlers.ts`
- **Verification:** `npm run typecheck` narrows the tail to `day | time`; `npm run test:unit` and the full integration suite pass.
- **Committed in:** `0eb9011`

**3. [Rule 3 - Blocking] The plan's column-tuple order did not match physical column order**

- **Found during:** Task 1 (deploy preflight)
- **Issue:** The plan lists the four new `planning_rounds` tuples as `ready_announced_at, announcement_message_id, booked_at, booked_by_user_id`, but `hasExactColumns` compares index by index against `attnum` order, and Prisma emits the `ADD COLUMN` statements alphabetically — so the physical order is `announcement_message_id, booked_at, booked_by_user_id, ready_announced_at` (and `answered_at, availability` on `planning_participants`). The planned order would have failed the preflight against a correctly migrated database.
- **Fix:** Ordered both appended tuple lists by physical column position, verified directly against a disposable PostgreSQL 18.4 instance, and said so in a comment above the locals.
- **Files modified:** `prisma/migrate-deploy.mjs`
- **Verification:** All 28 cases of `tests/integration/migration-preflight.test.ts` pass, including the new fully-migrated case.
- **Committed in:** `f32d550`

**4. [Rule 3 - Blocking] Three inherited assertions contradicted D-02 and D-15**

- **Found during:** Task 2 (full integration run)
- **Issue:** `planning-confirm.test.ts` asserted the confirmed anchor contains the word "availability" and carries zero buttons — both true of the deleted `renderConfirmedStep` and both false under D-02. `planning-participant-integrity.test.ts` asserted `PlanningRoundStatus` has exactly three labels, which D-15 changes. `migration-preflight.test.ts` would have retargeted six integrity-specific cases at the new migration.
- **Fix:** Retuned the confirm assertion to the published card's count line and its two declared controls, extended the enum assertion to four labels *in order* (the property the preflight actually depends on), and split `INTEGRITY_MIGRATION` out of `TARGET_MIGRATION` so the integrity cases keep exercising the integrity migration.
- **Files modified:** `tests/integration/planning-confirm.test.ts`, `teststs/integration/planning-participant-integrity.test.ts`, `tests/integration/migration-preflight.test.ts`
- **Verification:** `npm run test:unit && npm run test:integration && npm run typecheck && npm run lint` all pass.
- **Committed in:** `f32d550` (preflight split) and `0eb9011` (the two assertions)

**5. [Rule 3 - Blocking] The worktree had no installed dependencies**

- **Found during:** Task 1 (running the preflight suite)
- **Issue:** `tests/helpers/postgres.ts` spawns `./node_modules/.bin/prisma`, which resolved to nothing in the worktree — Node's upward module resolution found the parent repo's packages for imports, but the literal relative path did not exist. Every migration-preflight case failed with `spawn ./node_modules/.bin/prisma ENOENT`.
- **Fix:** Ran `npm ci` inside the worktree. No dependency was added, removed or changed; `package.json` and `package-lock.json` are untouched.
- **Files modified:** none (node_modules is gitignored)
- **Verification:** The preflight suite runs and passes.
- **Committed in:** n/a — no tracked file changed.

---

**Total deviations:** 5 auto-fixed (1 bug, 1 missing critical, 3 blocking)
**Impact on plan:** All five were necessary for correctness or to run the plan's own verification. No scope creep: nothing outside the plan's declared symbol ownership was added, and the booking symbols this plan declares for later waves are exactly the ones the plan's ownership table assigns to it.

## Issues Encountered

- **The tracer feedback gate.** Task 2 is `type="tracer"`, which normally stops for human verification before any expansion task. There is no expansion task in this plan, the project's `human_verify_mode` is `end-of-phase`, and the plan is `autonomous: true` — so the gate was resolved by re-running the tracer's `<verify>` end to end after the commit rather than by halting. It passed.
- **A disposable PostgreSQL 18.4 container** was used to generate the migration via `prisma migrate dev` and to read back the physical column order; it was removed afterwards.

## Known Stubs

None. Every symbol this plan declares is either rendered by this plan or is a row/label constant that a later plan of this phase renders — `PLANNING_BOOK_LABEL`, `PLANNING_BOOKING_ROWS`, the three booking members of `PlanningControlAction` and the booking member of `planningTargetSchema`. Their ownership is assigned to this plan by the phase's symbol-ownership table (03-01-PLAN.md, "Symbol declaration ownership") precisely because plan 03-04 renders `PLANNING_BOOKING_ROWS` without opening `keyboards.ts`; declaring them later would fail that plan's typecheck. `planningControlRows` drops a control whose token was never minted, so none of them draws a button today.

## Threat Flags

None. Every trust boundary this plan touches is one the plan's threat register already names, and no new network endpoint, auth path, file access pattern or trust-boundary schema change was introduced beyond the declared migration.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for the rest of Phase 3. Specifically available to the later waves:

- `availabilityStepProjection`, `availabilityOutcome`, `AvailabilityStepProjection` and `ParticipantMarker` for 03-02's card breadth.
- `PLANNING_BOOKING_ROWS` and `PLANNING_BOOK_LABEL` for 03-04's `renderReadyAnnouncement`, and the booking members of `planningTargetSchema` / `PlanningControlAction` for 03-05.
- `PlanningRound.readyAnnouncedAt`, `announcementMessageId`, `bookedAt` and `bookedByUserId` are migrated and visible to the compiler.

Open seams a later plan of this phase must close, all of them already assigned:

- `WEEK_CLAIMING_STATUSES` does not yet include `BOOKED`, and the four hard-coded `status: CONFIRMED` / `status: DRAFT` filters named in 03-RESEARCH.md Pattern 7 are untouched — 03-03/03-05 own them.
- `stepTargets` still branches on step before status, so a `CONFIRMED` round would fall into its REVIEW branch; nothing reaches it today because only `startOrResume` and `status` mint step actions and both filter to `DRAFT`.
- The AVAIL-07 one-shot announcement claim on `readyAnnouncedAt` is unwritten — 03-04 owns it.
- `isFloodControl` (429 classification at the delivery catch site) is 03-02's.

---

_Phase: 03-availability-and-booking-decision_
_Completed: 2026-09-06_
