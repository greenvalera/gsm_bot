---
phase: 03-availability-and-booking-decision
plan: 06
subsystem: api
tags: [telegram, grammy, prisma, postgres, rate-limiting, compare-and-set]

# Dependency graph
requires:
  - phase: 03-availability-and-booking-decision
    provides: "The ready-to-book announcement, its READY_ANNOUNCE_COOLDOWN_MS window and the answer-path claim on readyAnnouncedAt (03-03), and the /plan_status announcement re-post shape (03-04)"
  - phase: 03-availability-and-booking-decision
    provides: "The Mark-as-booked control loaded onto a re-posted announcement (03-05)"
provides:
  - "PlanningService.claimAnnouncementRepost — the public claim the /plan_status path must win before it may re-announce"
  - "A private claimReadyAnnouncementWindow shared by claimAnnouncement and claimAnnouncementRepost, so READY_ANNOUNCE_COOLDOWN_MS is expressed in exactly one statement"
  - "renderStep and repostAnchor take an optional card, the seam through which a caller that consulted a durable claim decides the message body rather than the renderer re-deriving it"
  - "PLANNING_REASONS member announcement-repost-inside-announce-cooldown for the quiet in-window fall-through"
  - "Four integration cases proving one ready-to-book notification per window against real PostgreSQL"
affects: [reminders, phase-05-reminders, any future path that can notify the band]

actuals:
  tokens: 9785
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One durable compare-and-set per notifiable act, shared by every path that can produce that act — a second path-specific gate beside the first is the shape that produced this gap"
    - "A caller that has consulted a claim the renderer cannot see passes its decision INTO the renderer; gating only the pointer write leaves the message body to a superseded predicate"

key-files:
  created: []
  modified:
    - src/domain/planning/planning-service.ts
    - src/telegram/planning-handlers.ts
    - tests/unit/planning-logging.test.ts
    - tests/integration/planning-recovery.test.ts

key-decisions:
  - "D-21: an in-window /plan_status for a ready-to-book round falls through to the availability card in the anchor slot — it does not go silent and it does not edit the announcement"
  - "D-21a: the claim result chooses the CARD, not only the slot; renderStep gains an optional card parameter and keeps its predicate as the fallback"
  - "D-22: the announcement claim is short-circuited behind the ready-to-book predicate, so an ordinary status re-post cannot consume the window a later unanimity needs"
  - "Assumption-delta pluralization resolved as `promote`: readyAnnouncedAt is the single authority for whether the band may be notified, and the answer path is demoted to one caller of it"

patterns-established:
  - "Shared claim statement: a window that more than one path can spend lives in one private helper, and each path is a caller — never a copy"
  - "Claim-then-render: the claim result is threaded to the renderer so the log line, the pointer write and the message body cannot describe different things"

requirements-completed: [AVAIL-07, LIFE-01]

coverage:
  - id: D1
    description: "No sequence of /plan_status requests can make the group receive more than one notifying ready-to-book message per READY_ANNOUNCE_COOLDOWN_MS window"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#holds the window against sustained /plan_status spam"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-posts the card, not the announcement, inside the announce window"
        status: pass
    human_judgment: false
  - id: D2
    description: "An in-window /plan_status still answers the requester: the availability card is re-posted into the anchor slot, and the chat receives no ready-to-book copy and no Mark-as-booked control"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-posts the card, not the announcement, inside the announce window"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#re-posts the availability card, not the announcement, inside the window"
        status: pass
    human_judgment: false
  - id: D3
    description: "The refused claim's message BODY is the availability card byte for byte, pinned against renderAvailabilityCard and shown unequal to renderReadyAnnouncement for the same projection (D-21a)"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#re-posts the card, not the announcement, inside the announce window"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#re-posts the availability card, not the announcement, inside the window"
        status: pass
    human_judgment: false
  - id: D4
    description: "readyAnnouncedAt is the single durable authority: a won claim advances it to the request's instant, a refused claim leaves it byte-identical, and no path clears it"
    requirement: "AVAIL-07"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#posts the announcement again once the window has elapsed"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#lets the announcement come back once the window has genuinely elapsed"
        status: pass
      - kind: other
        ref: "grep -rn 'readyAnnouncedAt: null' src/ — the only hit is the OR arm of the claim's WHERE clause, never a write"
        status: pass
    human_judgment: false
  - id: D5
    description: "A /plan_status that wins the claim advances the window for the answer path too: a unanimity lost and re-achieved a minute later edits in place and notifies nobody"
    requirement: "AVAIL-07"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#advances the window for the answer path when the status path claims it"
        status: pass
    human_judgment: false
  - id: D6
    description: "The claim is never attempted for a round that is not ready to book, so an ordinary status re-post cannot consume the window (D-22)"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#makes no claim at all for a round that is not ready to book"
        status: pass
    human_judgment: false
  - id: D7
    description: "The quiet in-window fall-through and a genuine lost-unanimity card re-post are distinguishable in the logs, and the BRANCHES gate refuses a shared outcome/reason pair (F-4)"
    verification:
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#gives no two branches the same (outcome, reason) pair, even across routes"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-logging.test.ts#emits exactly one bounded line for a status request for a ready-to-book round inside the announce window"
        status: pass
    human_judgment: false
  - id: D8
    description: "The window is expressed once: READY_ANNOUNCE_COOLDOWN_MS appears on exactly two non-comment lines in the service — its declaration and the single shared claim statement — and both callers reach it through that statement"
    verification:
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/domain/planning/planning-service.ts | grep -c 'READY_ANNOUNCE_COOLDOWN_MS' == 2"
        status: pass
    human_judgment: false
  - id: D9
    description: "LIFE-01 is intact: the Mark-as-booked control is not removed and the announcement is still reachable — past the window it comes back with the booking control, the superseded copy cleared and the anchor untouched"
    requirement: "LIFE-01"
    verification:
      - kind: integration
        ref: "tests/integration/planning-recovery.test.ts#lets the announcement come back once the window has genuinely elapsed"
        status: pass
      - kind: integration
        ref: "tests/integration/planning-booking.test.ts (18 cases, unchanged and passing)"
        status: pass
    human_judgment: false

duration: 4h 28m
completed: 2026-09-07
status: complete
---

# Phase 3 Plan 6: The Ready-to-Book Announcement Claim Summary

**Gap G-01 closed: `/plan_status` can no longer re-notify the band, because every path that posts a notifying ready-to-book message now wins the same committed compare-and-set on `readyAnnouncedAt` — and the claim result chooses the message body, not just which pointer moves.**

## Performance

- **Duration:** 4h 28m wall clock (includes an unattended provider rate-limit outage between the RED and GREEN commits of Task 1; active working time was substantially shorter)
- **Started:** 2026-09-07T06:41:05Z
- **Completed:** 2026-09-07T11:08:49Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `READY_ANNOUNCE_COOLDOWN_MS` now rate-limits the NOTIFICATION rather than the one path that happened to produce the first one. The `updateMany` compare-and-set moved into a private `claimReadyAnnouncementWindow`, and both `claimAnnouncement` (the answer path) and the new public `claimAnnouncementRepost` (the `/plan_status` path) are callers of it. The constant appears on exactly two non-comment lines in the service.
- The check-then-act that was the defect is gone. `handlePlanStatusCommand` still computes the ready-to-book predicate from its single `availabilityProjection` read, but being ready to book is no longer permission to say so: the right to post is won from the claim, short-circuited behind the predicate so a merely-collecting round never spends the window (D-22).
- The claim result reaches the renderer (D-21a). `renderStep` and `repostAnchor` gained an optional `card`, so a refused claim produces the availability card in the anchor slot — the body, not only the pointer. Absent the parameter, `renderStep`'s existing predicate decides exactly as before, so `/plan`'s resumed-round caller and every other call site are byte-identical.
- One new bounded reason, `announcement-repost-inside-announce-cooldown`, keeps a refused re-announcement countable apart from a genuine lost-unanimity re-post. The `BRANCHES` gate — every outcome has a branch, no two share an outcome/reason pair, the pair set equals the branch count — passes with it added.
- Four new integration cases against real PostgreSQL, including the accepted invariant test: ten `/plan_status` requests at ninety-second intervals from two different members produce exactly one message in the whole run carrying the ready-to-book copy.

## Task Commits

1. **Task 1 RED: failing gate for the claimed notification** — `0af76d0` (test)
2. **Task 1 GREEN: the announcement claim becomes the gate for every notifying path** — `7ffbfcd` (feat)
3. **Task 2: the guarantee proven against real PostgreSQL** — `9b289f1` (test)

_Task 1 carried `tdd="true"`, so it produced a RED and a GREEN commit. No REFACTOR commit was needed._

## Files Created/Modified

- `src/domain/planning/planning-service.ts` — extracted `claimReadyAnnouncementWindow` (the one claim statement); `claimAnnouncement` now calls it and keeps only its own reading of a refused claim; added public `claimAnnouncementRepost`, which answers `false` on a throw and never clears the column.
- `src/telegram/planning-handlers.ts` — `renderStep` takes an optional `card` and honours it above its predicate; `repostAnchor`'s options object gained a matching `card` forwarded to the render; `handlePlanStatusCommand` claims before announcing and feeds the boolean to the slot, the card and the reason; new `PLANNING_REASONS` member; `repostReasonFor`'s doc comment records that it is no longer the only source of a re-post reason.
- `tests/unit/planning-logging.test.ts` — new `BRANCHES` entry for the in-window fall-through, the existing announcement branch re-seeded with a window that has elapsed, and a new describe block pinning the message body against the renderers and asserting the column's movement.
- `tests/integration/planning-recovery.test.ts` — `reachAnnouncement` accepts an optional clock; the existing re-post case scoped to the first re-post after a cleared window; four new G-01 cases.

## Decisions Made

- **D-21 (fall-through, not silence and not an in-place edit).** An in-window `/plan_status` for a ready-to-book round re-posts the availability card into the anchor slot. Editing the announcement in place would re-point nothing and leave the requester's actual complaint — the card is buried — unanswered; a silent refusal would make the phase's most open command look broken for the state the band spends most time in. The anchor slot is already rate-limited at sixty seconds and carries the live answer controls rather than the booking control, so it is useful and notifies nobody.
- **D-21a (the claim chooses the card).** `renderStep`'s non-draft branch picks the announcement from its own predicate with no reference to `slot`, so gating the slot alone would still have posted the ready-to-book copy with a live booking control — and would additionally have re-pointed `anchorMessageId` at it. The claim result is therefore threaded into the render through a new optional parameter with a defaulting branch.
- **D-22 (short-circuit behind the predicate).** Claiming unconditionally would let an ordinary status re-post of a collecting round consume the window, so a unanimity ten minutes later would find the claim refused and edit a message the band never received as a notification.
- **Assumption-delta `promote`.** The committed claim on `readyAnnouncedAt` is promoted to the single authority for "may the band be notified now". The alternative — a second, path-specific gate beside the first — is precisely what produced G-01.
- **Parameter type of the shared helper.** The plan suggested `Prisma.TransactionClient` on the strength of `PrismaClient` being structurally assignable to it. It is not, in this codebase: the service holds a narrowed `PlanningPersistence`, which `tsc` rejected against `TransactionClient`. The helper is typed `Pick<PlanningPersistence, "planningRound">` — the one delegate the statement touches — which is what lets a single signature serve the transactional caller and the non-transactional one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shared claim helper's parameter type would not compile**

- **Found during:** Task 1 (GREEN)
- **Issue:** The plan specified `tx: Prisma.TransactionClient`, reasoning that `PrismaClient` is structurally assignable to it. `PlanningService` holds a `PlanningPersistence` (a `Pick<PrismaClient, ...>`), which is not assignable to `TransactionClient` — `tsc` reported six missing members (`$executeRaw`, `$queryRaw`, …).
- **Fix:** Typed the parameter `Pick<PlanningPersistence, "planningRound">`, the single delegate the statement touches. Both callers satisfy it; the plan's intent — one signature, one statement, two callers — is preserved exactly.
- **Files modified:** `src/domain/planning/planning-service.ts`
- **Verification:** `npm run typecheck` exits 0.
- **Committed in:** `7ffbfcd`

**2. [Rule 1 - Bug] The existing `announcement-reposted` unit branch would have stopped reaching its branch**

- **Found during:** Task 1 (RED)
- **Issue:** The plan asked to "keep every existing entry unchanged", but that entry seeds `readyAnnouncedAt: NOW` and drives the handler at `NOW` — which is inside the window. After the fix it correctly falls through to the new in-window reason, so the branch it was written to cover became unreachable and the entry would have collided with the new one under the no-shared-pair gate.
- **Fix:** Re-seeded that entry with `ANNOUNCED_BEFORE_WINDOW` (derived from `READY_ANNOUNCE_COOLDOWN_MS`, not a restated literal), which is the same treatment the plan itself prescribes for the corresponding integration case. All of its assertions are unchanged.
- **Files modified:** `tests/unit/planning-logging.test.ts`
- **Verification:** All 70 cases in the file pass, including the three distinctness gates.
- **Committed in:** `0af76d0` / `7ffbfcd`

**3. [Rule 3 - Blocking] Integration suite could not start: `./node_modules/.bin/prisma` absent in the worktree**

- **Issue:** `tests/helpers/postgres.ts` spawns the Prisma CLI at the literal relative path `./node_modules/.bin/prisma`. Git worktrees do not carry `node_modules` (it is gitignored), and while Node's upward module resolution found the parent checkout's packages, the literal path did not resolve — every integration test errored with `spawn ./node_modules/.bin/prisma ENOENT`.
- **Fix:** Symlinked the worktree's `node_modules/.bin` to the parent checkout's. **No package was installed**, nothing was added to `package.json` or the lockfile, and the change lives entirely inside a gitignored directory — it is worktree environment provisioning, not a dependency change.
- **Verification:** `npm run test:integration` — 15 files, 213 tests, all passing.
- **Committed in:** nothing to commit (gitignored).

**4. [Rule 1 - Bug] One new integration assertion was written wrong**

- **Found during:** Task 2
- **Issue:** The in-window case asserted the new reason appeared once, but `harness.lines()` spans the harness's whole lifetime rather than the post-`reset()` window, and BOTH status requests in that case are inside the window — so the correct count is two.
- **Fix:** Asserted two, with a comment explaining the scope of `lines()`, and added a third assertion that `availability-card-reposted` appears zero times so the fall-through cannot be confused with a lost-unanimity re-post.
- **Files modified:** `tests/integration/planning-recovery.test.ts`
- **Verification:** 36/36 cases in the file pass.
- **Committed in:** `9b289f1`

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** None on scope or design. Two were mechanical corrections to the plan's own instructions that could not have compiled or passed as written, one was a worktree environment gap, and one was my own test error caught by running it. Every prohibition holds: neither cooldown constant's value moved, `PLANNING_STATUS_COOLDOWN_MS` was not reused as the announcement gate, `readyAnnouncedAt` is never cleared, no please-wait reply was added, and the Mark-as-booked control is untouched.

## Issues Encountered

- **Provider rate limit mid-task.** Execution was interrupted between the RED and GREEN commits of Task 1 and resumed from a verified continuation table. No work was redone and no commit was orphaned; the wall-clock duration above is inflated by the outage.
- **The fail-without-the-fix check could not be run at integration level.** The plan's Task 2 `<done>` asks for a test that fails without Task 1. This was demonstrated at unit level: commit `0af76d0` was recorded RED with five failures, including the exact body assertion (`expected '<b>Ready to book …' to be '<b>Rehearsal confirmed …'`) that the integration case now makes against real PostgreSQL. The equivalent temporary-revert-and-run at integration level was attempted via a targeted `git checkout <sha> -- src/...` and denied by the sandbox; I did not work around the denial, and no weaker substitute was written.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run --project unit tests/unit/planning-logging.test.ts` | 70/70 pass |
| `npm run test:unit` | 25 files, 334 tests pass |
| `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | 36/36 pass (including the four new G-01 cases) |
| `npx vitest run --project integration tests/integration/planning-availability.test.ts` | 21/21 pass — the shared claim statement did not disturb the answer path |
| `npx vitest run --project integration tests/integration/planning-booking.test.ts` | 18/18 pass — the booking round trip is unchanged |
| `npm run test:integration` | 15 files, 213 tests pass |
| `npm run typecheck` | exits 0 |
| `npm run lint` | exits 0 |

Task 1 acceptance greps, all satisfied: `claimAnnouncementRepost` present in the service (1) and consulted by the handler (1); `READY_ANNOUNCE_COOLDOWN_MS` on exactly 2 non-comment lines in the service; `options.card` forwarded (1); `renderReadyAnnouncement` still on exactly 5 non-comment lines — the announcement renderer gained no second call site, only a new condition for reaching the existing one; both cooldown constant declarations byte-identical. Task 2: `READY_ANNOUNCE_COOLDOWN_MS` appears 4 times in the integration file (import plus three cases).

## Known Stubs

None. No `TODO`, `FIXME`, `.skip(` or `.todo(` appears in any file this plan touched, and no `<verify>` went unrun.

## Threat Flags

None. The plan's register (T-03-40 through T-03-44, T-03-SC) is fully addressed: T-03-40 and T-03-41 are the gap and are mitigated by the shared compare-and-set; T-03-42 by the new bounded reason; T-03-43 by the D-22 short-circuit; T-03-44 was an accepted risk and is unchanged; T-03-SC holds — no package was installed. No new network endpoint, auth path, file access pattern or schema change was introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Gap G-01, the phase's only BLOCKER, is closed and proven against real PostgreSQL.
- The shared claim is the seam a Phase 5 reminder must use if it ever posts the ready-to-book copy. The invariant test in `planning-recovery.test.ts` goes red the moment a third door notifies without a claim, which is exactly what it was accepted for.
- Gaps G-02, G-03 and G-04 remain open and are closed by plans 03-07 through 03-09.
- No blockers introduced. STATE.md and ROADMAP.md were deliberately left untouched — the orchestrator owns them.

## Self-Check: PASSED

- All four modified files exist on disk.
- All three commits (`0af76d0`, `7ffbfcd`, `9b289f1`) are present in `git log --all`.
- Every task's `<acceptance_criteria>` was re-run and passes; the plan-level `<verification>` commands were all run and are logged above.

---
*Phase: 03-availability-and-booking-decision*
*Completed: 2026-09-07*
