---
phase: 03-availability-and-booking-decision
verified: 2026-09-07T17:43:31Z
status: passed
score: 84/84 must-haves verified
behavior_unverified: 0
overrides_applied: 0
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
re_verification:
  previous_status: gaps_found
  previous_score: 52/52
  gaps_closed:

    - "G-01 (BLOCKER) — /plan_status can no longer re-notify the band inside the 30-minute announcement window"
    - "G-02 — the standing book-request capability is ensure-then-minted and the action lookup is totally ordered"
    - "G-03 — a failed announcement pointer write releases the claim and strips the orphan's markup"
    - "G-04 — mintTakeoverAction refuses any round that is not a DRAFT"
    - "G-05 — AVAIL-01 and AVAIL-07 are complete in both the REQUIREMENTS.md checklist and the traceability table"
  gaps_remaining: []
  regressions: []
deferred:

  - truth: "/plan_status stops describing a booked rehearsal as the live round once that rehearsal has happened"
    addressed_in: "Phase 4"
    evidence: "Phase 4 goal: 'The group can safely resolve conflicts and manage a rehearsal through change, cancellation, and completion.' Phase 4 SC4: 'A manually booked rehearsal counts as scheduled for future target-week selection and, after its scheduled end, supplies the prior day, time, and participants used as future planning defaults.' The post-end lifecycle of a booked round is Phase 4's subject. Recorded as review finding WR-04; it defeats no Phase 3 success criterion."
coincidental_reliance_items:

  - truth: "The number of live `book-request` capability rows for a round is answerable and bounded at one"
    reason: undeclared-precondition
    harden: "The at-most-one invariant is a load-then-mint pair inside a READ COMMITTED transaction, not a database constraint. Two transactions interleaving between the `findMany` and the `create` would both mint. `sequentialize` by `chat.id` (src/app/create-bot.ts:62) closes it, and that is enforced by code — but it is a SINGLE-PROCESS guarantee, and nothing in the phase's artifacts declares one-replica deployment as a precondition of this truth. Promote it: either a partial unique index on (chatId, targetId) where consumedAt IS NULL, or an explicit recorded precondition that the bot runs exactly one polling process (CLAUDE.md states this for long polling; the invariant does not cite it)."

  - truth: "A round never has two live announcements, including through the fault window"
    reason: undeclared-precondition
    harden: "Same shape, same mitigation: the send/record/clear triangle is compensated in-process, and the residual send-then-crash window is healed only by the cooldown. Both depend on one process owning a chat's updates."
human_verification:

  - test: "Resolve the 32 judgment-tier prohibitions declared across the nine plans (all carry status: resolved, all verification: judgment). My per-item verdicts are recorded in the Prohibitions section below and are NON-AUTHORITATIVE: a judgment-tier prohibition is closed by a human, not by a verifier."
    expected: "Each prohibition is confirmed still-honored, or one is reopened as a finding. The eight security-category ones are the ones that matter: booking eligibility, the announcement claim, the takeover mint guard, the capability-on-a-read-path rule, the release-only-on-pointer-failure rule, the code-point-boundary truncation, and the cross-member alert reachability."
    why_human: "ADR-550 D4 — judgment-tier prohibitions are never silently passed by an automated verifier. unverified-prohibition — human review recommended."

  - test: "Run /gsd-secure-phase 3 to produce .planning/phases/03-availability-and-booking-decision/03-SECURITY.md."
    expected: "A STRIDE mitigation verification for Phase 3, matching the 01-SECURITY.md and 02-SECURITY.md artifacts that both prior phases produced before reaching status: passed."
    why_human: "workflow.security_enforcement is true and security_block_on is high. Phases 1 and 2 each have a SECURITY.md; Phase 3 has none, and the phase's plans carry STRIDE threat registers (T-03-18, T-03-25, T-03-27, T-03-45, T-03-47, T-03-48, T-03-52, T-03-53) whose mitigation has never been formally verified. The code review's narrative security pass is not that artifact."

  - test: "In a real Telegram group: /plan → pick a day and time → Confirm. Confirm the availability card replaces the draft card in place. Have two roster members tap Can attend / Cannot attend. Have a non-roster member tap a control."
    expected: "One card, edited in place, with one glyph-led line per participant, 'Answered N of M' above the list, and a legend showing only the markers in use. The outsider gets a private alert and the card does not change. The outsider's tap produces no group message."
    why_human: "SC1, SC2, SC3 are Telegram-visible rendering and real-time behavior against the live Bot API. The integration suite drives a harness, not Telegram. Phases 1 and 2 both required a live pass before reaching passed."

  - test: "Drive the same round to unanimity, then send /plan_status repeatedly from two different members over the following ten minutes. Then tap Mark as booked and confirm."
    expected: "Exactly ONE notifying 'Ready to book' message reaches the chat. Every later /plan_status re-posts the quiet availability card with the two answer controls and no Mark-as-booked button. The booking confirm pair is named, and after confirming, both messages are re-rendered with no controls."
    why_human: "SC4 plus the G-01 closure. The notification/no-notification distinction is a property of what the Telegram client actually alerts on, which the harness cannot observe."

  - test: "Complete a round where an administrator took the round over from its original author, then book it. Scroll back to the availability card."
    expected: "The terminal card still carries 'Planned by <name>.'"
    why_human: "Review finding WR-02 predicts it does NOT — closeBookedRound builds its projection with no owner. Confirm the user-visible impact before deciding whether to fix now or file it."
---

# Phase 3: Availability and Booking Decision — Verification Report (re-verification of the closed state)

**Phase Goal:** The selected band members can confirm a proposed rehearsal and the group can mark a unanimous result as manually booked.
**Verified:** 2026-09-07T17:43:31Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plans 03-06 … 03-09
**Mode:** standard (no `Mode: mvp` on the Phase 3 ROADMAP entry)

## Headline

**The phase goal is achieved.** All four ROADMAP success criteria are observably true in the codebase, and every one of the five gaps the previous round found is closed — I re-derived each closure from source rather than from the summaries, and each is now gated by a behavioral test that would go red if the fix were reverted.

The score moved from 52/52-with-gaps to **84/84 with no gaps**: the 48 original plan truths plus the four ROADMAP criteria still hold (regression-checked), and the 32 truths the four gap plans added all hold too.

The status is `human_needed` rather than `passed`, for three reasons that are all about verification *coverage*, not about missing capability:

1. Thirty-two judgment-tier prohibitions across the nine plans have never been human-resolved. My verdicts on them are recorded below and are explicitly non-authoritative.
2. There is no `03-SECURITY.md`, while `workflow.security_enforcement` is `true` and both prior phases produced one before they reached `passed`.
3. Phase 3 is the phase whose whole output is Telegram-visible group behavior — a notifying message, a private alert, an edited card — and none of it has been observed against real Telegram. Phases 1 and 2 each required a live pass.

The six open review warnings are real and worth fixing. **None of them defeats a success criterion**, and I checked each against the criteria individually rather than assuming so; the ranking is in the Gaps Summary.

## Goal Achievement

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | Author can publish a custom availability card after confirming date, time, participant snapshot | VERIFIED | `confirm()` mints the answer actions inside the same `$transaction` that promotes the round and snapshots participants (`planning-service.ts`, `mintAvailabilityActions` at `:2287`, after the `empty-roster` refusal and the `status: CONFIRMED` write). `dispatchConfirm` edits the existing anchor — never `ctx.reply`. Integration: `planning-availability.test.ts:369` "edits the round's existing anchor and leaves two unconsumed answer tokens" |
| 2 | Included participants can select Can/Cannot attend; outsiders cannot submit | VERIFIED | `answerAvailability` refuses `participant === null` with `not-a-participant` (`planning-service.ts:2644`) BEFORE any write; the surface answers with `show_alert: true` and `PLANNING_NOT_A_PARTICIPANT` and performs no edit (`planning-handlers.ts:2311-2324`). The per-participant compare-and-set is the only gate on the answer itself |
| 3 | Card shows each participant pending/available/unavailable and overall completion | VERIFIED | `renderAvailabilityCard` (`planning-renderers.ts:536-576`) emits `Answered N of M` above a used-markers-only legend and one `PARTICIPANT_MARKER_GLYPHS[marker] + memberLabel` line per participant in `sortRosterMembers` order. Unit-pinned in `planning-availability-card.test.ts` |
| 4 | Unanimity produces a ready-to-book announcement; author or administrator can mark booked | VERIFIED | `claimAnnouncement` → `dispatchAnnouncement` posts a NEW message; `openBookingGate` (`:3007-3078`) re-derives eligibility from `round.authorUserId` plus a tap-time `currentRole`, re-derives unanimity from rows read on the apply transaction, then `applyBooking` writes `status: BOOKED` (`:2967`) under a `consumedAt` + status/revision compare-and-set. `closeBookedRound` re-renders both messages control-free |

**No success criterion is defeated by any open warning.** I tested each warning against each criterion rather than assuming: WR-01/WR-03 are log-content defects on paths whose user-visible behavior is correct; WR-02 drops an attribution line but leaves the participant markers and the completion count (SC3's actual subject) intact; WR-04 concerns `/plan_status` for a round whose rehearsal has already happened, which is outside every Phase 3 criterion; WR-05 is test coverage on the migration preflight; WR-06 is method visibility.

### Gap Closure — re-derived from source

| Gap | Claim | Holds? | Evidence I derived myself |
|-----|-------|--------|---------------------------|
| **G-01 (was BLOCKER)** | `/plan_status` can no longer re-notify the band | **YES** | `claimReadyAnnouncementWindow` (`planning-service.ts:2348-2363`) is one `updateMany` compare-and-set on `readyAnnouncedAt` with the `OR: [{null}, {lte: cutoff}]` form; it has exactly two callers (`claimAnnouncement:2417`, `claimAnnouncementRepost:2457`) and `READY_ANNOUNCE_COOLDOWN_MS` is read only inside it. `handlePlanStatusCommand` claims BEFORE announcing (`planning-handlers.ts:1790-1792`), short-circuited behind the ready-to-book predicate, and the boolean drives **both** `slot` and `card` (`:1817-1826`). `renderStep`'s explicit-`card` branch (`:983-1006`) is checked before its own predicate, so a refused claim cannot render the ready-to-book body. Gated by four integration cases including `planning-recovery.test.ts:1995` "holds the window against sustained /plan_status spam" — ten requests, alternating members, ninety seconds apart, asserting exactly one message containing "Ready to book" across the whole run |
| **G-02** | One live `book-request` per round | **YES** | `ensureBookingRequestAction` (`:1287-1311`) loads under `orderBy: [{createdAt: asc}, {token: asc}]`, takes `.at(-1)`, and mints only on miss. `mintBookingRequestAction` has exactly one caller — that ensure. Both former mint sites now route through it (`:2690` answer-post, `:2880` keep). `loadAvailabilityActions` (`:1414-1422`) carries the same total order, so `controlTokens`' last-row-wins collapse is deterministic. Gated by `planning-booking.test.ts:620` "leaves exactly one live standing row across five request/keep cycles" (asserts the SAME token each cycle and `liveBookingRequestsFor === 1`) and `:657` "performs no CallbackAction insert … on a keep" (counts ALL rows, live or not) |
| **G-03** | Orphaned announcement compensated | **YES** | `releaseAnnouncementClaim` (`:2549-2568`) carries all four guards — `id`, `status: CONFIRMED`, `readyAnnouncedAt: claimedAt`, and the `announcementMessageId: null` discriminator that keeps the `/plan_status` re-announce out of the release (D-33) — and restores `previousAnnouncedAt`, never null. `dispatchAnnouncement`'s failed-record branch (`planning-handlers.ts:2158-2205`) releases, then `clearSupersededCard`s the orphan, then logs, and posts nothing. Gated by six fault-injection cases at `planning-availability.test.ts:1715-1930`, including "leaves the round unbooked when the orphan's control is pressed" and "heals the send-then-crash residue once the window elapses" |
| **G-04** | `/plan_status` writes no wasted capability | **YES** | `mintTakeoverAction`'s FIRST refusal is `if (round.status !== PlanningRoundStatus.DRAFT) return undefined;` (`:3569`), ahead of the author, role and inactivity checks. Gated by five cases at `planning-recovery.test.ts:1401-1558`, including "repeated status requests for a confirmed round write nothing at all" and the narrowing check "still offers takeover on an abandoned DRAFT round, and mints exactly one row" |
| **G-05** | Requirement ledger in step | **YES** | `.planning/REQUIREMENTS.md` — AVAIL-01/02/03/04/07 and LIFE-01 are `[x]` in the checklist (`:40-59`) and `Complete` in the traceability table (`:119-132`). AVAIL-05/06 are untouched and still Phase 4, so the 03-09 scope prohibition holds |

| Review finding | Claim | Holds? | Evidence |
|----------------|-------|--------|----------|
| WR-04 (alert budget) | Bounded in UTF-16 code units | **YES** | `boundedLabel` (`planning-handlers.ts:219-233`) compares `String#length` — which *is* the code-unit count — against the budget, then walks code points summing `point.length`, reserving one unit for the ellipsis. No `String.slice`. Gated by `planning-availability-card.test.ts:718` "holds an all-astral-plane member label to the cap Telegram counts", which also asserts `isWellFormed()` |
| WR-05 (honest `unchanged`) | Not-modified reports `unchanged` | **YES** | `editRoundMessage`'s not-modified catch populates the fingerprint and returns `"unchanged"` (`:1195-1200`). `grep -cF "new Error(" src/telegram/planning-handlers.ts` → **0** |
| WR-06 (one confirm/keep pair) | Previous pair expired before the mint | **YES** | `requestBooking` runs one `updateMany` setting `expiresAt: now` on the live `book-apply`/`book-keep` rows, after the gate and before `mintBookingConfirmationActions` (`:2794-2818`). Expired, never deleted. Gated by `planning-booking.test.ts:979-1001` (ten opens → `liveConfirmationsFor === 1`, `allConfirmationsFor === 10`) |
| WR-07 (set equality) | Preflight matches catalogs as sets | **YES (by derivation)** | `hasExactDefinitions` (`migrate-deploy.mjs:840-856`) splices each match out of a working copy, so one actual entry cannot satisfy two expected ones. I traced the differential myself: `expected=[[a,d],[a,d]]`, `actual=[{a,d},{z,other}]` → cardinality agrees, first match splices, second finds nothing → `false`. The old form returned `true`. **No red-capable test — window 21, open** |
| IN-01 (flat enum derivation) | Last-applied-wins lookup | **YES (by derivation)** | `PLANNING_ROUND_STATUS_LABELS` is a declaration-ordered array and `planningRoundStatusLabels` takes the last applied pair (`migrate-deploy.mjs:447-459`). No nested condition, no unreachable arm. Declaration order is safe because `migrationHistoryState` independently rejects an out-of-order history. **Same window-21 coverage caveat** |

### Observable Truths — Plan Must-Haves

**48 original truths (03-01 … 03-05): regression-checked, all still VERIFIED.** Spot-checks re-run against this HEAD after the gap plans rewrote large parts of `planning-service.ts` and `planning-handlers.ts`: `confirm`'s single-transaction publish; the `not-a-participant` refusal ahead of every write; `renderAvailabilityCard`'s count-line-then-legend-then-lines shape; `WEEK_CLAIMING_STATUSES` still spread into all three filters; `mintStepActions` still returning `[]` for a non-draft; `bookedAt` still never read as authority (one write at `:2968`, three comments, **zero reads** in hand-written source); still exactly one `callback:PLANNING` route. The full detail from the previous round stands and is not restated.

**32 new truths from the gap plans — all VERIFIED.**

#### 03-06 (8 truths) — the announcement window becomes a property of the notification

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No sequence of `/plan_status` can produce more than one notifying message per window | ✓ VERIFIED | `planning-recovery.test.ts:1995` — ten alternating-member requests over fifteen minutes, one "Ready to book" message total |
| 2 | `readyAnnouncedAt` is the single durable authority; every posting path wins a committed CAS first | ✓ VERIFIED | One statement, two callers, `READY_ANNOUNCE_COOLDOWN_MS` referenced nowhere else |
| 3 | An in-window `/plan_status` still answers the requester with the card, and the chat gets no ready-to-book copy | ✓ VERIFIED | `planning-recovery.test.ts:1917` — asserts `anchorMessageId` moved and `announcementMessageId` did not |
| 4 | The BODY a refused claim produces is the availability card, byte for byte | ✓ VERIFIED | Same test asserts `text === cards.availability` AND `text !== cards.announcement`, and that the keyboard is the two answer labels with no `PLANNING_BOOK_LABEL`. This is the assertion a slot-only fix would fail |
| 5 | A status-path win advances the window for the answer path | ✓ VERIFIED | `planning-recovery.test.ts:2088` — status claims, then unanimity lost and re-achieved 60 s later: `sendMessage` count 0, one in-place edit |
| 6 | The claim is never attempted for a round that is not ready to book | ✓ VERIFIED | `announce = readyToBook && await claim(...)` — the `&&` short-circuit is the guard (`planning-handlers.ts:1790`) |
| 7 | The quiet fall-through and a lost-unanimity re-post are distinguishable in the logs | ✓ VERIFIED | Three disjoint reasons (`announcement-reposted`, `announcement-repost-inside-announce-cooldown`, `repostReasonFor(...)`); `:1917` asserts the counts of all three |
| 8 | (backstop) Both paths claim through the same statement, same column, same constant | ✓ VERIFIED | Not presence: `:2088` is a cross-path behavioral test that goes red if the two paths keep separate windows |

#### 03-07 (7 truths) — standing capabilities, bounded and ordered

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Live `book-request` count bounded at one across any request/keep loop | ✓ VERIFIED | `planning-booking.test.ts:620` (5 cycles, same token, count 1 each time, row still unconsumed) |
| 2 | A post-cooldown re-announcement carries the existing capability and mints nothing | ✓ VERIFIED | `planning-availability.test.ts:1057` — asserts the re-announced message's book token equals the FIRST announcement's, and `liveBookingRequestsFor === 1` |
| 3 | Two renders of an unchanged round produce byte-identical keyboards | ✓ VERIFIED | `orderBy: [{createdAt: asc}, {token: asc}]` on both lookups; `planning-availability.test.ts:1234` "renders the NEWEST row for a duplicated control, twice identically" |
| 4 | `mintTakeoverAction` refuses any non-draft round | ✓ VERIFIED | `:3569`; `planning-recovery.test.ts:1401`, `:1432`, `:1460` |
| 5 | The takeover eligible set only narrowed | ✓ VERIFIED | `planning-recovery.test.ts:1488`, `:1528` |
| 6 | Exactly one live confirm/keep pair | ✓ VERIFIED | `planning-booking.test.ts:979-1001` |
| 7 | (backstop) Each standing capability created in one place | ✓ VERIFIED (coincidental-reliance) | Behaviorally evidenced by the live-count assertions above; see `coincidental_reliance_items` — the invariant is a load-then-mint pair, not a constraint, and leans on single-process `sequentialize` |

#### 03-08 (9 truths) — compensating the announcement claim

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every in-process detectable pointer-write fault leaves the round able to announce again | ✓ VERIFIED | `planning-availability.test.ts:1715` (failed), `:1750` (stale), `:1775` (announces again, one pressable copy) |
| 2 | Claim released only when there is no addressable fallback; kept when there is (D-33) | ✓ VERIFIED | Four service-level cases `:1352`–`:1456` pin every guard, plus `:1825` at the surface |
| 3 | The orphan is stripped of its markup before return | ✓ VERIFIED | `clearSupersededCard` in the failed-record branch; `:1801` asserts pressing the orphan's control leaves the round unbooked |
| 4 | Never two live announcements, including through the fault window | ✓ VERIFIED (coincidental-reliance) | `:1775`; residual send-then-crash window is covered by truth 5 and by `coincidental_reliance_items` |
| 5 | The send-then-crash residue heals via the cooldown | ✓ VERIFIED | `:1890` "heals the send-then-crash residue once the window elapses" |
| 6 | The retract-or-edit decision reads inside the answer transaction | ✓ VERIFIED | `claimAnnouncement` re-reads `current` (`:2409-2411`); `:1573`, `:1599` |
| 7 | A no-op edit reports `unchanged` with or without the cache | ✓ VERIFIED | `editRoundMessage:1195-1200`; `:1987` |
| 8 | The already-applied alert and the log line no longer depend on cache state | ✓ VERIFIED | Same |
| 9 | (backstop) No synthesised exception describes a non-exception outcome | ✓ VERIFIED | `grep -cF "new Error(" src/telegram/planning-handlers.ts` = 0 **and** a wired gate: `planning-logging.test.ts:1838` "binds no `err` at all for a failure that never threw", swept over every branch |

#### 03-09 (8 truths) — alert budget, preflight, ledger

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every callback alert is inside 200 UTF-16 code units, including an all-astral name | ✓ VERIFIED | `planning-availability-card.test.ts:685` (sweep over exported constants), `:718` (astral case) |
| 2 | Truncation lands on a code-point boundary | ✓ VERIFIED | `for (const point of label)` walk; `:739` asserts `isWellFormed()` |
| 3 | A rejected acknowledgement cannot escape to the global handler | ✓ VERIFIED | `planning-ownership.test.ts:472` "absorbs a rejected acknowledgement instead of escaping to the global handler" |
| 4 | The unit sweep measures with Telegram's own metric | ✓ VERIFIED | `String#length` against `CALLBACK_ALERT_LIMIT = 200` |
| 5 | The preflight refuses a duplicated expected object plus an unexpected one | ✓ VERIFIED (by derivation) | Splice-consuming match traced by hand; **no red-capable test — window 21** |
| 6 | The enum label list is derived by a flat lookup | ✓ VERIFIED (by derivation) | `migrate-deploy.mjs:447-459`; same window-21 caveat |
| 7 | REQUIREMENTS.md records the delivery state of every claimed requirement | ✓ VERIFIED | `:40-59`, `:119-132` |
| 8 | (backstop) No refusal bounded against a budget in a different unit | ✓ VERIFIED | The unit sweep is the property, and it can observe a violation — the astral case measured 335 units before the fix and 199 after |

**Score:** 84/84 truths verified (0 present-but-behavior-unverified). Every behavior-dependent truth — each claim, each release, each compare-and-set, each cancellation and ordering invariant — is backed by a named test in the suites the orchestrator ran green on this HEAD (unit 341/341, integration 245/245), not by symbol presence. The two derivation-only truths (03-09 #5, #6) are pure predicates over plain arrays, not state transitions, and I traced their differential by hand.

### Prohibitions — 32 declared, all judgment-tier, NONE human-resolved

Every one of the 32 prohibitions across the nine plans carries `status: resolved` and `verification: judgment`. There are **zero** test-tier prohibitions, so the fail-closed test-tier rule does not fire here.

Per ADR-550 D4, a judgment-tier prohibition is never silently passed by an automated verifier. **My verdicts below are a non-authoritative LLM-judge reading of the code, recorded so a human has something concrete to resolve against — they are not a pass.**

| Plan | Category | My non-authoritative verdict | What I actually checked |
|------|----------|------------------------------|-------------------------|
| 03-01 | values | Honored | The card is edited, never re-posted, on an ordinary state change; no `ctx.reply` on the answer path |
| 03-02 | values, privacy | Honored | No outstanding-names line in any renderer; the outsider refusal is `answerCallbackQuery({show_alert: true})` with a constant that names nobody and no group message |
| 03-03 | security, values | Honored | `wasPreviousParticipant` reads the shared `WEEK_CLAIMING_STATUSES` (widened, never narrowed); `bookedAt` has zero reads in hand-written source |
| 03-04 | values ×3 | Honored | One announcement per unanimity via the CAS, not a check-then-act; the availability card keeps both controls when the announcement lands; a failed send neither rolls back the answer nor posts anything |
| 03-05 | security ×2, values ×2 | Honored | `openBookingGate` reads `round.authorUserId` plus a tap-time `currentRole` thunk and accepts no wire-borne claim; only the non-destructive `currentRole` accessor is reachable (`requireAdministrator` appears nowhere in `src/`); unanimity re-derived inside the apply transaction; no undo/cancel/unbook target in `planningTargetSchema` |
| 03-06 | security ×1, values ×2, scope ×2 | Honored | The CAS is the gate; `PLANNING_STATUS_COOLDOWN_MS` unchanged and not reused; `readyAnnouncedAt` never nulled on this path; a refused request posts no message of any shape; the Mark-as-booked control is untouched |
| 03-07 | security ×2, values ×3 | Honored | No mint on any read path; `book-request` never consumed; both answer tokens still standing and unconsumed; the takeover guard only narrows; the confirm/keep pair is expired, not deleted |
| 03-08 | security ×1, values ×4 | Honored | The send-failure branch returns without releasing; the release restores `previousAnnouncedAt` rather than null; nothing compensating is posted; `LAST_RENDER` decides no message, alert or log line; the orphan strip books/retracts/re-opens nothing |
| 03-09 | security ×2, values ×2, scope ×1 | Honored | Code-point walk, not `String.slice`; the owner is bounded, never emptied; the budget is per-alert so one member's name cannot break another's refusal; the preflight was strengthened, not relaxed; REQUIREMENTS.md changed only AVAIL-01 and AVAIL-07 |

**unverified-prohibition — human review recommended (32 items).**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/domain/planning/planning-service.ts` | Shared claim, ensure-then-mint, release compensation, takeover guard | ✓ VERIFIED | 3619 lines; all four closures present, substantive and wired |
| `src/telegram/planning-handlers.ts` | Claim-before-announce, card decision, failed-record compensation, UTF-16 budget | ✓ VERIFIED | 3266 lines; `new Error(` count 0 |
| `src/telegram/planning-renderers.ts` | Availability card, announcement, retraction, booking confirmation | ✓ VERIFIED | 713 lines; all five renderers are total functions of a projection |
| `prisma/migrate-deploy.mjs` | Set-equality catalog match, flat enum derivation | ✓ VERIFIED | 1081 lines; both rewrites present. No exports — window 21 |
| `.planning/REQUIREMENTS.md` | AVAIL-01 and AVAIL-07 complete | ✓ VERIFIED | Both lists updated; no other row touched |
| `tests/integration/planning-availability.test.ts` | Publish, answer, snapshot, announcement, fault injection | ✓ VERIFIED | 2100 lines (was 1148) |
| `tests/integration/planning-booking.test.ts` | LIFE-01 matrix, capability counts | ✓ VERIFIED | 1207 lines (was 884) |
| `tests/integration/planning-recovery.test.ts` | D-03 recovery, G-01 window, G-04 mint guard | ✓ VERIFIED | 2212 lines (was 1676) |
| `tests/integration/migration-preflight.test.ts` | Catalog and enum guards | ✓ VERIFIED | 1634 lines; the 4 new cases are boundary guards that pass on both trees (window 21) |
| `tests/unit/planning-ownership.test.ts` | Bounded refusal, guarded ack | ✓ VERIFIED | 582 lines |
| `tests/unit/planning-logging.test.ts` | Bounded-reason gate, `err`-means-threw gate | ✓ VERIFIED | 1972 lines |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `READY_ANNOUNCE_COOLDOWN_MS` | both notifying paths | `claimReadyAnnouncementWindow` shared by `claimAnnouncement` + `claimAnnouncementRepost` | WIRED | 4 references, all inside or naming the one statement. **This is the G-01 link that did not exist before** |
| ready-to-book predicate | claim → slot AND card | `handlePlanStatusCommand:1790-1826` → `repostAnchor` → `renderStep` | WIRED | The boolean drives both; `renderStep`'s explicit-`card` branch precedes its own predicate |
| `ensureBookingRequestAction` | announcement keyboard | `:2690` / `:2880` → `loadAvailabilityActions` → `controlTokens` → `renderReadyAnnouncement` | WIRED | `mintBookingRequestAction` has exactly one caller |
| deterministic `orderBy` | stable keyboard | both lookups → last-row-wins collapse → render fingerprint | WIRED | Same order in both places |
| failed `recordAnnouncement` | claim release + orphan strip | `dispatchAnnouncement:2158-2205` → `releaseAnnouncementClaim` → `clearSupersededCard` | WIRED | Guard-based, not convention-based: the `announcementMessageId: null` discriminator excludes the `/plan_status` slot |
| `mintTakeoverAction` draft guard | `/plan_status` takeover spread | `:3569` → `handlePlanStatusCommand:1753` | WIRED | `undefined` collapses the spread |
| `boundedLabel` | ownership alert | `plainMemberLabel` → `NOT_AUTHOR_PREFIX` budget → `answerCallbackQuery` | WIRED | Budget computed from the same hoisted strings the message is built from |
| `openBookingGate` | all three booking transitions | `requestBooking` / `keepBooking` / `applyBooking` | WIRED | One gate, one re-derivation, no three-way drift |
| `PlanningRoundStatus.BOOKED` | two control-free edits | `closeBookedRound` | WIRED — **but see WR-02**: the anchor edit's projection carries no `owner`, so the terminal card drops `Planned by` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderAvailabilityCard` | `participants` | `planningParticipant.findMany` with membership+user include | Yes | FLOWING |
| `renderAvailabilityCard` | `answeredCount` / `totalCount` | Derived from those rows in `availabilityStepProjection` | Yes | FLOWING |
| `renderAvailabilityCard` | `outcome` | `availabilityOutcome` over those rows | Yes | FLOWING |
| `renderAvailabilityCard` | `owner` | `resolveTelegramIdentity` on the confirm, answer and `/plan_status` paths | Yes on three of four paths | ⚠️ HOLLOW on the fourth — `closeBookedRound` passes no owner, so the terminal render's owner line is absent (WR-02) |
| `renderReadyAnnouncement` | lineup | The same projection instance as the card | Yes | FLOWING |
| keyboards | tokens | `CallbackAction` rows, loaded under a total order | Yes | FLOWING — **deterministic now** (was non-deterministic under G-02) |

### Behavioral Spot-Checks

Full-suite results were supplied by the orchestrator and are not re-run here (unit 341/341 across 25 files; integration 245/245 across 15 files; `tsc --noEmit` exit 0). The checks below are the cheap static differentials I ran myself.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| The announcement window has one enforcement statement | `grep -rn "claimReadyAnnouncementWindow" src/ --include=*.ts \| wc -l` | 4 (declaration + 2 callers + doc reference) | ✓ PASS — was "1 declaration, 1 use" and FAILING |
| The booking capability has one mint site | `grep -rn "mintBookingRequestAction(" src/ --include=*.ts \| wc -l` | 2 (definition + the single ensure caller) | ✓ PASS |
| No synthesised exceptions on the planning surface | `grep -cF "new Error(" src/telegram/planning-handlers.ts` | 0 | ✓ PASS |
| `bookedAt` is never authority | `grep -rn "bookedAt" src/ --include=*.ts \| grep -v "^src/generated/"` | 1 write, 3 comments, 0 reads | ✓ PASS |
| One callback route for planning | `grep -n 'id: "callback' src/telegram/handlers.ts` | one `callback:PLANNING` | ✓ PASS |
| `hasExactDefinitions` refuses the WR-07 shape | Hand-traced differential over `expected=[[a,d],[a,d]]`, `actual=[{a,d},{z,other}]` | old `true`, new `false` | ✓ PASS (derivation — no runnable gate, window 21) |
| Live Telegram behavior of the announcement, alerts and card edits | — | Cannot be exercised without a bot token and a group | ? SKIP → human verification |

### Probe Execution

No `scripts/*/tests/probe-*.sh` exist and no plan or summary declares a probe. Step 7c: SKIPPED (no probes declared or discoverable).

### Requirements Coverage

Plan-declared IDs across all nine plans: 03-01 {AVAIL-01, AVAIL-02, AVAIL-04}, 03-02 {AVAIL-02, AVAIL-03, AVAIL-04}, 03-03 {LIFE-01, AVAIL-01}, 03-04 {AVAIL-07, AVAIL-02}, 03-05 {LIFE-01}, 03-06 {AVAIL-07, LIFE-01}, 03-07 {AVAIL-01, AVAIL-04, AVAIL-07, LIFE-01}, 03-08 {AVAIL-02, AVAIL-07, LIFE-01}, 03-09 {AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-07}. Union = exactly the six the ROADMAP maps to Phase 3. **No orphaned requirements** — `grep "Phase 3" .planning/REQUIREMENTS.md` returns exactly those six rows.

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| AVAIL-01 | 03-01, 03-03, 03-07, 03-09 | SATISFIED | Auto-publish inside the confirm transaction; `planning-availability.test.ts:369`. Ledger now `[x]` / `Complete` |
| AVAIL-02 | 03-01, 03-02, 03-04, 03-08, 03-09 | SATISFIED | Per-participant compare-and-set; both tokens standing and unconsumed for the round's life |
| AVAIL-03 | 03-02, 03-09 | SATISFIED | `not-a-participant` refusal before any write, private alert, no card edit, no group message |
| AVAIL-04 | 03-01, 03-02, 03-07 | SATISFIED | Marker line per participant, count line, stable order, deterministic keyboard |
| AVAIL-07 | 03-04, 03-06, 03-07, 03-08, 03-09 | SATISFIED | One announcement per window across **every** door — the G-01 closure is what makes this requirement true rather than nearly true |
| LIFE-01 | 03-03, 03-05, 03-06, 03-07, 03-08 | SATISFIED | Author-or-fresh-administrator booking, apply-time re-derivation, `CONFIRMED → BOOKED` under a guarded pair, round closed control-free |

### Decision Coverage

`check.decision-coverage-verify` reports **16/16 trackable CONTEXT.md decisions honored, 0 not honored.** The gap plans introduced further decisions (D-21a, D-22, D-23, D-26, D-27, D-28, D-33) that live in plan frontmatter rather than CONTEXT.md; I verified each by name against source while checking the closures above. Non-blocking gate; recorded for drift tracking.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `tests/integration/planning-availability.test.ts` | AVAIL-01/02/03/04/07 | ~40 | 0 | No | Behavioral (real PostgreSQL, fault injection, racing client) | SUFFICIENT |
| `tests/integration/planning-booking.test.ts` | LIFE-01 | ~35 | 0 | No | Behavioral (row counts at the database, not at the surface) | SUFFICIENT |
| `tests/integration/planning-recovery.test.ts` | AVAIL-07, PLAN-10 | ~50 | 0 | No | Behavioral (multi-member, clock-advancing, whole-run message counts) | SUFFICIENT |
| `tests/integration/migration-preflight.test.ts` | AVAIL-01 (schema) | ~34 | 0 | No | Behavioral against a real catalog | SUFFICIENT — **except** the WR-07/IN-01 properties, which pass on both trees |
| `tests/unit/planning-availability-card.test.ts` | AVAIL-03/04, LIFE-01 | ~30 | 0 | No | Value + structural sweep + UTF-16 metric | SUFFICIENT |
| `tests/unit/planning-ownership.test.ts` | AVAIL-03 | ~12 | 0 | No | Behavioral (rejected-ack absorption) | SUFFICIENT |
| `tests/unit/planning-logging.test.ts` | all | ~40 | 0 | No | Structural branch enumeration + `err` provenance gate | SUFFICIENT |

**Disabled tests on requirements:** 0 — a repo-wide grep for `it.skip` / `describe.skip` / `xit` / `it.todo` / `.only(` across `tests/` returns nothing.
**Circular patterns detected:** 0 — no fixture-generating script imports a system under test. Expected values are literal copy constants, renderer output compared against the renderer's sibling (a legitimate differential: `text === cards.availability` AND `text !== cards.announcement`), and database row counts.
**Insufficient assertions:** 0.
**Tests that enshrine a known defect:** 1 — `planning-availability.test.ts:1873` asserts `failures[0]?.err` is `undefined` for a fixture that carries a real `Error` (WR-01). It is pinning current behavior, which is a defect. Fixing WR-01 requires correcting this assertion; flagged so nobody mistakes it for a protected property.
**Properties with no red-capable gate:** 2 (WR-07, IN-01) — filed as window 21, `open`, honestly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/domain/planning/planning-service.ts` | 1116, 1321, 2480, 2789 | `placeholder` / `PLACEHOLDER` | ℹ️ Info | Prose in docstrings describing the deliberate NOT-NULL actor fill on the booking pair, and a comment saying there is *no* third placeholder control. Not stub markers |

**Debt-marker gate: clean.** Zero `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` across the eight hand-written source files this phase modified. No empty implementations, no console-log-only handlers, no hardcoded empty data reaching a render, no `as any`, no `@ts-ignore`, no empty catch blocks other than the one WR-03 names.

### Human Verification Required

See the `human_verification` frontmatter block for the five items in full. In summary:

1. **Resolve the 32 judgment-tier prohibitions** — my verdicts are recorded above and are non-authoritative.
2. **Produce `03-SECURITY.md`** — `security_enforcement: true`, both prior phases have one, this phase does not.
3. **Live Telegram pass for SC1–SC3** — card publication, per-participant markers, outsider refusal.
4. **Live Telegram pass for SC4 and the G-01 closure** — one notification per window under repeated `/plan_status`, then booking.
5. **Confirm the WR-02 attribution loss** on the terminal card after a takeover.

### Gaps Summary

**There are no gaps.** All five previously-found gaps are closed, each re-derived from source and each now gated by a test that would go red on reversion. The four ROADMAP success criteria are true. Requirement traceability is intact and complete: six declared, six mapped, six satisfied, zero orphaned.

What remains open are the six code-review warnings, ranked by what they actually cost:

1. **WR-02 — the booked round's terminal card drops `Planned by …`** (`planning-handlers.ts:2871`). The highest-value fix: it is user-visible, it lands on the one message that stays in chat history forever, and after an administrator takeover it silently erases the whole of D-13's promise at the moment the record becomes permanent. Every other render of that card carries the owner; `closeBookedRound` is the single exception, and the root cause is upstream — `BookingApplyResult["booked"]` carries no `owner` for the surface to pass. No test covers it. **It defeats no success criterion** (SC3's subject is the participant markers and the completion count, both intact), which is why it is a warning and not a gap.
2. **WR-03 — a thrown announcement claim is logged as a cooldown refusal** (`planning-service.ts:2455-2461`). A database outage is recorded as `announcement-repost-inside-announce-cooldown`, whose own doc comment asserts the opposite of what happened. An operator counting refused re-announcements counts outages as rate-limiting working. Failing closed is right; failing closed *silently* is the defect.
3. **WR-01 — `dispatchAnnouncement` discards a real Prisma exception** (`planning-handlers.ts:2200`). The one path where the failure has already put a live, unaddressable message in the chat is the one path with no cause in the logs. Two sibling call sites already split `failed` from `stale` correctly. Fixing it means correcting the two assertions that currently pin the defect.
4. **WR-04 — `status()` admits `BOOKED` with no recency bound** (`planning-service.ts:3333`). **Deferred to Phase 4** (see the `deferred` frontmatter block): the post-end lifecycle of a booked rehearsal is Phase 4's explicit subject. Recorded rather than dismissed, because the current behavior also makes `PLANNING_NO_ACTIVE_ROUND` dead copy for any chat that has ever booked, and nothing pins that as intentional.
5. **WR-05 — the WR-07/IN-01 preflight rewrite has no test that can go red.** Window 21, open. The rewrite is correct — I traced the differential myself — but the property is protected by a comment. The review's suggested fix (extract the pure helpers to `prisma/schema-catalog.mjs`, or guard the entrypoint) would close it.
6. **WR-06 — inverted visibility on the booking capability** (`planning-service.ts:1238` public mint vs `:1287` private ensure). The one method that can break G-02 is the reachable one. Maintainability, but it is precisely the shape a future plan reintroduces the gap through.

**Two bookkeeping observations, not gaps.** `ROADMAP.md` still shows 03-08 and 03-09 as `[ ]` and "7/9 plans executed", and `STATE.md` shows 46/50 completed plans. Both are stale; the 03-09 commit message states explicitly that STATE.md and ROADMAP.md were left untouched because the orchestrator owns them. Flagged so the orchestrator closes them at phase completion rather than at ship time.

---

_Verified: 2026-09-07T17:43:31Z_
_Verifier: Claude (gsd-verifier)_
