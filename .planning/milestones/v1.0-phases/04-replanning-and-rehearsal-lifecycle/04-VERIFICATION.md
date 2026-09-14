---
phase: 04-replanning-and-rehearsal-lifecycle
verified: 2026-09-09T10:30:00Z
status: passed
score: 50/50 must-haves verified
behavior_unverified: 0
overrides_applied: 0
prohibitions_flagged: 14
decision_coverage:
  honored: 19
  total: 19
  not_honored: []
human_verification:
  - test: "H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap."
    expected: "The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster."
    why_human: "Native Telegram rendering, label truncation, shared keyboard visibility, real getChatMember behavior and tone are not proved by Bot API doubles. Harvests Plan 04-01's deferred human-check."
  - test: "H2 — Toggle answers through blocked, collecting and unanimous states; request /plan_status inside and after the shared notification cooldown from different members."
    expected: "Only one notifying announcement is emitted per 30-minute window; its fact changes or retracts as appropriate. Status recovery keeps availability and announcement pointers/surfaces separate. Both answer buttons survive Cancel Keep and Change Keep after a retraction inside cooldown."
    why_human: "Actual notification prominence and native message correction under chat traffic require a real client. Automated tests prove payload order and durable cooldown, not delivered notifications."
  - test: "H3 — Use saved still-live controls from superseded and cancelled attempts, including day/time/back/confirm and answer/booking controls, and compare an expired control."
    expected: "Unexpired superseded controls explain replanning and direct to /plan_status; cancelled controls explain cancellation. Neither changes the successor. Expired tokens receive the generic expired/stale refusal and already-consumed tokens retain duplicate semantics."
    why_human: "Automated boundary tests prove isolation and exact text; a human must confirm that native alerts are understandable and direct users to useful recovery."
  - test: "H4 — Cancel draft, collecting, ready and booked rehearsals using both /plan_cancel and inline controls; decline once, then apply. Test a non-author and an administrator demoted after opening confirmation."
    expected: "Named confirmation is reachable; decline preserves usable controls. Eligible apply closes both durable messages without undo copy and frees the week. Only a BOOKED cancellation emits a new result notice. Demoted/ineligible actors receive a private refusal and cannot spend the confirmation."
    why_human: "Real authorization propagation, visibility of both historical messages and booked-cancellation notification are external-service behaviors. Harvests Plan 04-03's deferred human-check."
  - test: "H5 — Change a rehearsal using inline Change and /plan_change below busy chat traffic; repeat after deleting the control message. Exercise both Keep and Apply, including a booked round."
    expected: "The command posts a fresh bottom-of-chat confirmation; a failed inline edit recovers it or gives clear /plan_status advice. Exactly one lifecycle control surface remains, callback spinner clears before delivery, Keep restores controls, and Apply produces a fresh unbooked same-week attempt with cleared answers and current roster/settings."
    why_human: "Native reachability, deletion behavior, spinner responsiveness and comparable command/inline presentation require live Telegram. Harvests Plan 04-04's deferred human-check and UI-02/03/04 closure checks."
  - test: "H6 — Check lifecycle/defaults in the chat timezone before, at and after a rehearsal's end; cancel the only rehearsal under Previous participants policy; inspect /plan_status and Sunday/Monday planning."
    expected: "Only finished CONFIRMED/BOOKED rehearsals provide previous day/time hints; cancelled/superseded history does not. Invited members retain standing, new lineups use the active roster, and cancellation releases its week. Today remains selectable even if all hours passed. Any older booked card recovered by status must be clearly dated and understandable."
    why_human: "Boundary reads and access are automated; actual hints, timezone-changed presentation and the retained older-status behavior need product acceptance. This does not claim exhausted-Sunday hour-level rollover or closure of historical WR-04."
  - test: "H7 — Review P01–P14 in the Prohibitions table and record an explicit acceptance or finding for EACH statement."
    expected: "All 14 individual judgment-tier prohibitions receive human dispositions. A finding remains open; plan frontmatter status: resolved and the verifier's provisional code assessment are not human approval."
    why_human: "ADR-550 D4: judgment-tier prohibitions require human resolution. unverified-prohibition — human review recommended. The 14 provisional assessments are NON-AUTHORITATIVE."
prohibitions:
  - id: P01
    statement: "The blocked card and the replan trail must not use blaming or shaming framing toward the participant who answered Cannot attend — the card states who cannot make the slot as a fact, never as fault, and never quantifies how often a member blocks rounds."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P02
    statement: "A Cannot attend tap must not be irreversible for the person who made it — until a new slot is committed, that participant can flip their own answer back and the round must return to the state it was in."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P03
    statement: "A replan must not silently shrink the band — the successor's lineup comes from the administrator-curated active roster, and a replan attempted with an emptied roster is refused rather than creating a round nobody was asked to."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P04
    statement: "A replan must not erase the record of what the band already tried — the superseded attempt survives as its own row and as readable text in the chat, never as a rewound card that overwrites its own history."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P05
    statement: "A break-through group message must not be sent again on every answer flip — one participant toggling between the two live buttons must not be able to notify the whole band repeatedly inside a single conversation."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P06
    statement: "A refusal must not send the person to an action that will also fail — superseded-round copy must never instruct the tapper to start planning again, because the replanned round already holds the week and that command would refuse them a second time with no explanation."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P07
    statement: "Cancellation copy must never offer or imply an undo — the confirmation asks a question and the applied result states a fact, and neither may suggest the rehearsal can be brought back."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P08
    statement: "Cancelling a rehearsal the band arranged their week around must not be silent — a booked cancellation reaches the group as a new message, never only as an in-place edit that notifies nobody."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P09
    statement: "A cancelled round must not go on asserting anywhere that the rehearsal is booked or that everyone can make it — the cancelled state gets its own explicit render rather than falling through to another state's sentence, and EVERY durable message the round holds is corrected, not only the one that happened to carry the controls."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P10
    statement: "Cancelling a rehearsal must not revoke planning access from people who were already asked to it — standing comes from having been invited by an administrator-curated roster, and a slot the band later called off does not un-invite anyone. The widening ships in the same commit as the cancellation, never a wave later."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P11
    statement: "A change must not quietly claim a week that another round already holds — the successor takes the superseded round's own target week, and any collision surfaces as a refusal the tapper can act on rather than a database error."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P12
    statement: "Change and replan must not become two implementations of the same sentence — a behaviour that holds for one and not the other is a defect, not a variation."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P13
    statement: "A cancelled slot must never be presented as a rehearsal that happened — it must supply no usual-day marker, no last-time marker, and no participant default, because the band did not rehearse."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
  - id: P14
    statement: "Releasing a week must not hand the band a week it cannot use — a week whose every day has already passed is rolled past rather than offered as a card whose seven buttons all refuse."
    verification: judgment
    status: unverified
    flagged: true
    reason: human_acceptance_pending
---

# Phase 4: Replanning and Rehearsal Lifecycle Verification Report

**Phase Goal:** The group can safely resolve conflicts and manage a rehearsal through change, cancellation, and completion.
**Status:** human_needed
**Verified:** 2026-09-09T10:30:00Z
**Re-verification:** Yes — Plan 04-06 gap closure, focused source/call-site audit, full regression suites and fresh Chrome observations. Performed inline; no independent verifier claim.
**Score:** 50/50 declared plan truths behaviorally or structurally verified; 0 present-but-behavior-unverified state invariants. All four roadmap success criteria are mapped below. **14 judgment prohibitions remain flagged; live Telegram acceptance is pending.**

## Goal Achievement

### Two-account live UAT addendum — 2026-09-10/11

Fresh authorized Chrome Web K execution and supplemental test results are recorded in [04-LIVE-TEST-2026-09-10.md](04-LIVE-TEST-2026-09-10.md), with grouped dispositions in [04-UAT.md](04-UAT.md). A/B live observations now cover block/reverse/replan, cancellation across lifecycle states, ordinary-member refusal at request/apply, current-administrator authority on another author's draft, Keep recovery, current-duration snapshots, booked Change and dated status recovery. Narrow Web rendering was inspected at390px and restored. Fresh supplemental checks passed362 unit and125 targeted integration tests; these do not convert unavailable native scenarios to passes.

The earlier code-verification score and `human_needed` status are retained. No new code fix or new defect is asserted. The remaining prerequisites and individual P01–P14 judgments are not accepted by the agent on the user's behalf. Historical evidence below remains dated and distinct from this run.

### Live UAT addendum — 2026-09-09

The initial Chrome run reproduced G-04-1. Plan 04-06 now closes that defect: fresh 13:22–13:27 Chrome sequences confirm neutral displaced copies after ready reversal, booked change, booked cancellation and status/resume relocation. All 362 unit and 307 integration tests pass, as do type checking and touched-file formatting. The original test findings remain documented as history in [04-UAT.md](04-UAT.md) and [live evidence](04-LIVE-TEST-2026-09-09.md). H2/H4/H5 return to pending for their remaining subcases; H1/H6/H7 remain pending and H3 remains blocked. Phase 4 must not advance until acceptance is complete.

The implementation provides the required durable transitions and connected Telegram handlers. Verification inspected source, schema, actual test assertions and saved final test output rather than relying on SUMMARY completion claims. No new implementation blocker was found. A passing automated score is not live-service acceptance: the seven human items above include six grouped Telegram checks and individual human disposition of all 14 prohibitions.

### Plan 04-06 gap re-verification

| Truth | Result | Evidence |
| --- | --- | --- |
| 06.1 Relocated announcements cannot retain current readiness/blocking/booking claims | VERIFIED for successful delivery | New renderer and all relocation/failed-tracking callers; successful-message history regressions; Chrome old announcement 398407 after reversal |
| 06.2 Command Cancel/Change Keep/Apply directs old copies to current details | VERIFIED | Parameterized booked change/cancel regressions; Chrome 398409 and 398420 become neutral; tracked terminal messages remain specific |
| 06.3 Status/resume uses the same retirement rule | VERIFIED | Recovery tests for draft, availability, announcement and failed reanchor; Chrome 398406 and 398417 retire on status/resume |
| 06.4 Live availability controls and cooldown/authorization remain intact | VERIFIED | 95 focused tests, 39 availability tests and final 307 integration tests; live status-relocated answer buttons work; no service/authorization changes |

The 46 prior truths remain backed by the unchanged domain/schema implementation and the fresh full regression suite. Four additional gap truths bring the automated/structural score to 50/50. All eight Phase 4 requirement IDs remain accounted for in the requirement table below; 04-06 adds evidence for AVAIL-05, AVAIL-06, LIFE-03 and LIFE-04. No requirement is marked accepted merely because its plan summary exists.

Final run evidence: `.planning/04-06-unit.log` (362/362), `.planning/04-06-integration-final.log` (307/307, 21 files, 228.51 seconds), and `04-06-SUMMARY.md`. Prior test counts and line references below describe the earlier audit snapshot. G-04-1 is resolved, but remote edit failures remain best effort and pre-fix untracked copies are not retroactively corrected.

### Contract and scope interpretation

- CONTEXT D-01/D-02 explicitly define closure as a reversible blocked derivation while the current round remains CONFIRMED and its answer buttons remain live. A blocked answer is not an irreversible terminal status.
- CONTEXT D-07 settles AVAIL-06: the next attempt snapshots the **active administrator-managed roster**, not a literal copy of the former participants. It preserves the lineup when roster management has not changed it. New answers are null; normal Confirm may refresh the snapshot again.
- Group keyboards cannot differ by viewer. Eligible roles see the same shared Replan/lifecycle buttons as everyone else; authorization is refreshed on use. “One keyboard” in lifecycle wording means one **lifecycle** control-bearing message; answer controls remain on the availability anchor.
- Plan 04-04 resolves change as same-target-week only. `applyChange` and `replanRound` call the same private `supersedeAndCreate`; the plan's shorthand “applyChange -> replanRound” describes that shared machine, not a required wrapper-to-wrapper call.
- Plan 04-05 explicitly preserves today's whole-day selectability. Its exhausted-Sunday-night example does not follow from that rule and is **not verified as hour-level rollover**.
- Role lookup occurs immediately before each transaction; the transaction checks the persisted author and freshly resolved role. It does not hold database locks across a Telegram lookup.
- Telegram sends/edits follow committed state and remain best effort. Source and tests establish attempted correction, compensation and isolation, not guaranteed remote delivery during outages.
- Phase 04 has no MVP mode; no user-story format gate applies. No earlier 04-VERIFICATION.md or accepted overrides existed.

### Roadmap success criteria

All four roadmap criteria remain in scope; they are umbrella contracts decomposed into 46 original truths plus four gap-closure truths rather than four duplicate score entries.

| # | Roadmap contract | Status | Evidence and mapping |
|---|---|---|---|
| SC1 | A Cannot attend response closes the availability round and directs its author to a new date/time. | VERIFIED under D-01/D-02 | 01.1–01.4, 01.7 and 02.1–02.3: immediate blocked outcome, reversible answers, Replan control and announcement; PostgreSQL/Telegram-harness tests. |
| SC2 | Replanning starts fresh, clears responses, preserves participants unless explicitly changed; stale/superseded controls explain and cannot alter the active round. | VERIFIED under D-07 | 01.4–01.13 and 02.5–02.8: active-roster snapshot, old/successor identity isolation, terminal alert and expiry/replay coverage including draft controls. |
| SC3 | Author/admin can change to a fresh round, or cancel active/booked and free its week. | VERIFIED | 03.1–03.11 and 04.1–04.8: fresh eligibility, atomic replacement/cancellation, both commands/inline controls, pointer recovery and week release. |
| SC4 | Booked counts as scheduled and supplies future defaults after its scheduled end. | VERIFIED under D-16/D-17 and roster-as-lineup contract | 05.1–05.6: BOOKED claims the week; previousRehearsal uses strict endsAt < now and excludes cancelled/superseded. Future lineup still follows the active roster, not stale history. |

### Observable Truths

Evidence shorthand: “service” means `src/domain/planning/planning-service.ts`; “handlers” means `src/telegram/planning-handlers.ts`; renderer/keyboard references are under `src/telegram/`. Test basenames are under `tests/unit/` or `tests/integration/` as identified in the artifact/test tables.

#### Plan 04-01

| # | Truth | Status | Evidence |
|---|---|---|---|
| 01.1 | A participant who taps Cannot attend closes the round immediately: the availability card says the slot does not work and names who blocked it, while other participants are still pending. | VERIFIED | `availabilityOutcome` (service:757) checks unavailable before pending; `renderAvailabilityCard` uses the domain outcome. Unit first-unavailable spot-check passes; `planning-availability.test.ts` exercises the real answer path. |
| 01.2 | Both answer buttons stay live on a blocked card, so the person who blocked it can tap Can attend and the round reopens exactly as it was. | VERIFIED | `answerAvailability` leaves CONFIRMED answers mutable; anchor controls remain live. `planning-availability.test.ts` block/reopen and `planning-lifecycle-review.test.ts` Keep-after-cooldown cases prove the transitions. |
| 01.3 | The planning author or a current chat administrator sees a replan control on the blocked card; anyone else who taps a control they are not eligible for gets a private alert naming the two eligible roles and no member identity. | VERIFIED | `withReplanControl` supplies shared group controls; `replanRound` checks fresh author/admin eligibility before consume. `planning-replan.test.ts` member refusal and admin attribution tests; private role-only alert in dispatcher. Visibility is shared, not personalized. |
| 01.4 | Tapping replan supersedes the old round and creates a new DRAFT round at the day step for the same target week, in one transaction. | VERIFIED | `replanRound` -> transaction -> `supersedeAndCreate` (service:1328/1390); PostgreSQL replan test asserts SUPERSEDED old row and DRAFT/DAY successor in the same week. |
| 01.5 | The new round's lineup is the chat's currently active roster and its author is whoever replanned. | VERIFIED | `supersedeAndCreate` reads `listActiveMemberships`, writes participant rows on the new id and actor authorUserId. Replan test changes roster/settings and asserts exact successor members and bigint actor. |
| 01.6 | The superseded round's card is edited to a terminal, keyboard-less line recording the attempt that failed, and the new round posts its day selector as a fresh message. | VERIFIED | `deliverSuccessor` (handlers:2800) terminalizes old anchor/announcement and calls `repostAnchor`; `planning-replan-telegram.test.ts` asserts terminal edits and fresh anchored day selector. Delivery is best effort; live Telegram check H1. |
| 01.7 | availabilityOutcome returns blocked for exactly one unavailable participant among any number still pending, blocked when every participant is unavailable, collecting when none is unavailable and at least one is pending, all-available only when every participant is available, and collecting for an empty lineup. | VERIFIED | Pure outcome function has explicit empty, unavailable, pending and all-available branches. `planning-availability-card.test.ts` tests all listed cases; first-unavailable named check independently passes. |
| 01.8 | The blocked card renders the blocker through memberLabel, so a display name is escaped exactly once and a member with no safe name falls back to the masked Telegram-user form; any label quoted in a callback alert is bounded in UTF-16 code units rather than sliced. | VERIFIED | Blocker renderer uses sorted labels through `memberLabel`; handlers use `boundedLabel`. Unit tests assert one escaping pass, masked fallback, no mentions, and astral/UTF-16 bounds. |
| 01.9 | A replan releases the superseded round's activeWeekStart and claims it for the successor inside one transaction, and a unique-constraint collision with a concurrently created draft returns a week-taken refusal instead of surfacing a database error. | VERIFIED | Shared transaction clears old activeWeekStart before successor create; `isUniqueViolation` maps collisions to week-taken. Replan collision test asserts rollback of old row and token. |
| 01.10 | The superseded round and its successor coexist as two rows for the same chat and target week, and exactly one of them holds a non-null activeWeekStart. | VERIFIED | PostgreSQL replan test asserts two historical rows for chat/week and exactly one non-null activeWeekStart. |
| 01.11 | A replan attempted while the chat's active roster is empty is refused and creates no successor round; a one-member roster produces a successor with exactly one participant row. | VERIFIED | Roster locks/read occur before token consume; empty-roster test refuses without mutation then accepts one active member with exactly one new participant. |
| 01.12 | Participants that compare equal under the label collator keep a stable rendered order, tie-broken by the Telegram id, on both the superseded card and the successor's card. | VERIFIED | `sortRosterMembers` is the single label/id ordering used by participant renders. Named collator-equal unit check passes; successor cards use this path. Terminal attempt line has no participant list to reorder. |
| 01.13 | Chat and user identifiers cross the replan transaction as bigint, and the successor's authorUserId equals the replanning actor's Telegram id exactly. | VERIFIED | Prisma bigint fields and typed parameters retain ids; replan test uses identities beyond safe integer precision and compares actor and participant ids exactly. |

#### Plan 04-02

| # | Truth | Status | Evidence |
|---|---|---|---|
| 02.1 | When a slot is blocked, the band hears about it once in the chat's break-through message slot — the same slot that says everyone is available when the round is unanimous. | VERIFIED | `claimAnnouncement` (service:2649) admits blocked through the existing claim; integration posts-once/edits/reopens test asserts one announcement slot. |
| 02.2 | The blocked message and the ready-to-book message never coexist: the announcement slot carries whichever fact the round currently warrants, and reopening the round retracts the blocked message the same way a flipped answer already retracts a ready-to-book one. | VERIFIED | `announcementBody` (handlers:1192) selects blocked/ready/none for ordinary render and status; collecting clears pointer and returns previous id for correction. Integration observes post/edit/retract sequence and unchanged anchor. |
| 02.3 | A participant toggling their own answer cannot notify the band more than once inside the existing announcement cooldown window. | VERIFIED | `claimReadyAnnouncementWindow` enforces the same 30-minute claim across both outcomes; availability integration rapidly reopens/reblocks and asserts no second send. |
| 02.4 | Requesting planning status after a slot is blocked re-posts the blocked announcement, not the availability card, and never points the announcement column at an availability card. | VERIFIED | `handlePlanStatusCommand` calls `announcementBody`; blocked recovery integration checks announcementMessageId moves while anchor stays separate. A denied notification claim intentionally falls back to a quiet availability card. |
| 02.5 | A tap on a superseded round's button gets a private alert saying the slot was replanned and pointing at the status command, and never the generic no-longer-available advice that would send the tapper to a command that will itself refuse. | VERIFIED | Answer/booking dispatchers and corrected day/time/back/confirm dispatchers use `PLANNING_REPLANNED_TEXT`. Boundary integration and lifecycle review replay saved tokens, assert exact /plan_status advice and unchanged successor. |
| 02.6 | A tap on a cancelled round's button gets its own distinct private alert, separate from both the replanned alert and the generic one. | VERIFIED | Terminal ladders return already-cancelled separately; cancel and review Telegram tests assert exact private cancelled alert with no mutation. |
| 02.7 | A superseded round's answer token is refused by the dispatcher with the replanned alert while it is still unexpired, and only reaches the callback boundary's generic refusal after its own expiry has passed. | VERIFIED | `supersedeAndCreate` leaves old answer expiry unchanged; callback boundary checks expiry first. Replan Telegram tests compare live-specific and expired-generic refusal with unchanged successor. |
| 02.8 | The replanned alert is a distinct named constant that is not equal to the generic stale copy, is at most 200 UTF-16 code units, and names no command that would refuse the tapper. | VERIFIED | `PLANNING_REPLANNED_TEXT` (handlers:122) is distinct and names /plan_status; logging/copy unit tests assert <=200 UTF-16 units and distinct strings. |

#### Plan 04-03

| # | Truth | Status | Evidence |
|---|---|---|---|
| 03.1 | The planning author or a current chat administrator can cancel a rehearsal that is still collecting answers, one that is confirmed, or one that has been marked as booked. | VERIFIED | `openLifecycleGate` (service:2999), separate CANCELLABLE statuses and `applyCancel` (3490) cover DRAFT/CONFIRMED/BOOKED. Parameterized PostgreSQL cancellation and composed-handler tests assert eligible transitions. |
| 03.2 | Cancelling takes a named confirmation step, and the confirmation's copy never offers or implies a way to undo the cancellation. | VERIFIED | `renderCancellationConfirmation` names slot and confirm/keep controls; unit copy and cancellation Telegram tests assert named pair, decline and settled result with no undo. |
| 03.3 | Eligibility for the cancellation is decided inside the apply transaction from the round's author column plus a role resolved at tap time, so an administrator demoted between the render and the tap cannot cancel. | VERIFIED | Each request/apply resolves role afresh immediately before the transaction; the gate checks persisted author or that role inside the transaction. Cancellation demotion test denies apply without consume. Remote lookup is deliberately outside locks. |
| 03.4 | A tap that is refused leaves the confirmation control still spendable — every refusal the gate produces is a read and precedes the consume. | VERIFIED | Gate refusals precede mutation; failed guarded update releases the consume. Cancellation tests check demotion/member/stale refusal token remains usable and eligible retry succeeds. |
| 03.5 | Cancelling a booked rehearsal reaches the group as a new message, because the band arranged their week around it; cancelling from any other position sends no new message and corrects the round's messages in place. | VERIFIED | `finishCancel` uses returned previousStatus: only BOOKED causes a new result notice; all other statuses edit. Cancellation Telegram tests count sends and both edits. Command entry itself posts a fresh confirmation, separately from result notification. |
| 03.6 | After a cancellation, every durable message id the round holds carries the cancelled render and none still shows a live answer or lifecycle button — whether the round held one message id or two, and whatever position it was cancelled from. | VERIFIED | `finishCancel` iterates a Set of both durable ids and independently edits explicit cancelled text without controls. Tests cover one/two ids, draft/confirmed/booked, and first-edit failure without suppressing second attempt. |
| 03.7 | Being asked confers standing: anyone snapshotted into any round keeps previous-participant standing whatever that round later became, and this ships in the same commit that makes the cancelled position reachable — so no commit ever exists in which cancelling a chat's only rehearsal revokes planning access for every non-administrator. | VERIFIED | `wasPreviousParticipant` (service:1760) counts historical snapshots without status filtering. `planning-round.test.ts` cancels the only round then admits its participant; production commit cfef367 introduced cancellation and this widening together. |
| 03.8 | Cancel is reachable both as a command and as an inline control, because a rehearsal booked days earlier has messages that chat traffic has long buried. | VERIFIED | `handlers.ts` declares and registers plan_cancel (244/684); handler calls requestCancel; inline target dispatch (4686+) reaches the same flow. Cancellation/review Telegram tests execute both entry points. |
| 03.9 | The lifecycle controls ride the round's current control-bearing message — the announcement when one exists, the availability card when it does not — so there is exactly one keyboard to reason about at any moment. | VERIFIED | `controlBearingMessageId` (handlers:1124) chooses announcement then anchor; lifecycle insertion/movement uses it. Review tests cover both slots and Keep restoration. This is one lifecycle keyboard; answer controls remain on the separate anchor. |
| 03.10 | A cancelled round no longer claims its week: the week-claiming status set does not contain the cancelled position, so no write is needed to release anything. | VERIFIED | `WEEK_CLAIMING_STATUSES` excludes CANCELLED; apply also clears nullable activeWeekStart for draft cancellation. Tests verify no week claim and a subsequent planning start. No separate release operation is needed. |
| 03.11 | A cancelled round cannot acquire a fresh anchor or re-post a keyboard, because the cancelled position is outside the recoverable status set. | VERIFIED | `RECOVERABLE_ROUND_STATUSES` excludes CANCELLED and SUPERSEDED; reanchor guards repeat admissible status. Cancellation tests reject recovery; lifecycle tracking regression rejects terminal status. |

#### Plan 04-04

| # | Truth | Status | Evidence |
|---|---|---|---|
| 04.1 | The planning author or a current chat administrator can change a rehearsal's date or time, and doing so starts a fresh availability round with every response cleared. | VERIFIED | `applyChange` (service:3442) opens fresh eligibility gate then shared replacement transaction. Change/replan parity test checks new DRAFT, live roster and all availability null. |
| 04.2 | Change runs the same transaction as replan: supersede the old round, re-snapshot the live roster, neuter the old messages, post a fresh day selector — one machine, not two code paths that can drift. | VERIFIED | Exactly two callers reach `supersedeAndCreate`: replanRound/applyChange; both surface paths call `deliverSuccessor`. PostgreSQL parity and Telegram equivalent-sequence tests prove shared effects. |
| 04.3 | Change takes a named confirmation step, and its eligibility is re-decided inside the apply transaction rather than carried on the wire. | VERIFIED | `requestChange` expires former pair and mints named apply/keep; apply resolves role again. Replan change tests prove demotion refusal, spendable token and successful eligible retry. |
| 04.4 | Change is reachable both as a command and as an inline control on the round's one live keyboard. | VERIFIED | `handlers.ts` declares/registers plan_change (253/710); target dispatcher invokes change routes. Change Telegram tests and review command/inline cases verify both. |
| 04.5 | A change never moves the rehearsal to a different target week: the successor's target week is copied verbatim from the round being changed, so no path can claim a week without the claim check that only the planning-start path performs. | VERIFIED | `supersedeAndCreate` copies oldRound.targetWeekStart literally and contains no target-week calculation; parity test asserts equality for draft/confirmed/booked change. |
| 04.6 | A band that needs a different week has a fully specified two-step path — cancel the rehearsal, which releases its week, then start planning again, which rolls to the right week. | VERIFIED | Change confirmation copy states same week and cancel + /plan alternative. Cancellation tests prove release and target-week tests prove normal week choice; cross-week change is deliberately not a direct capability. |
| 04.7 | A change whose successor collides with a week another round already holds returns a week-taken refusal rather than surfacing a database error to the tapper. | VERIFIED | `applyChange` catches unique violations as week-taken; collision test proves old row, apply token and successor creation roll back together. |
| 04.8 | The successor's schedule window — timezone, duration, and daily start and end minutes — is re-read from the chat's live configuration as integer minute-of-day values, with no rounding or coercion introduced. | VERIFIED | Shared body reads ChatConfiguration fields directly; change parity test alters timezone, duration, daily integer boundaries and active membership before applying and compares successor fields. |

#### Plan 04-05

| # | Truth | Status | Evidence |
|---|---|---|---|
| 05.1 | A rehearsal that is happening right now is no longer offered as the previous rehearsal: only a rehearsal whose scheduled end has passed supplies the day, time and participant defaults for the next round. | VERIFIED | `previousRehearsal` (service:1745) filters endsAt < now and orders startsAt/id descending; boundary integration asserts null before/at end and inclusion just after, plus ordering with differing durations. |
| 05.2 | A rehearsal the chat marked as booked counts as scheduled when the bot chooses a target week, so planning rolls to the following week rather than proposing a second rehearsal for the same one. | VERIFIED | `weekIsClaimed` includes BOOKED; targetWeekStart checks every candidate. Named BOOKED unit spot-check and planning-round booked-week/cap tests pass. |
| 05.3 | A cancelled slot is never read as a rehearsal that happened: it supplies no day marker, no time marker and no participant defaults. | VERIFIED | Previous query filters CONFIRMED/BOOKED only; boundary integration explicitly rejects CANCELLED/SUPERSEDED. Day/time projection calls use that query; roster-as-lineup remains the locked active-roster contract. |
| 05.4 | A cancelled rehearsal's week is offered again for planning, and if that week has no still-selectable day left, planning rolls to the next week rather than offering a card whose every button refuses. | VERIFIED | `weekHasSelectableDay` is called for every target candidate and shares isPastDay. Unit tests cover past-week false, today true and booked roll; cancellation integration verifies week release. Today remains selectable even after every generated hour passes. |
| 05.5 | The previous-participant standing plan 04-03 widened is still widened after these read edits — nothing here re-narrows an authorization input. | VERIFIED | `wasPreviousParticipant` remains status-independent; integration historical-standing cases include cancelled/superseded and the only-round cancellation/access sequence. |
| 05.6 | The past-day rule has exactly one implementation, shared by the day card's classification and the target-week roll, and the module that owns it is not imported back by the module that owns the status sets. | VERIFIED | `isPastDay` has one implementation in target-week.ts and planning-service re-exports/imports it; day classification uses it. Unit day and target-week tests pass; target-week never imports planning-service. |


### Required Artifacts

Each production artifact was checked for existence, substantive implementation and actual use. Dynamic render paths were additionally traced to database reads. Generated files are consumed by Prisma/domain imports, not judged by line count alone.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `prisma/migrations/20260908215724_cancellation/migration.sql` | Cancellation schema migration | VERIFIED | One appended CANCELLED enum value, three nullable columns, no DEFAULT or data UPDATE. Real migration-preflight suite included in final integration run. |
| `prisma/schema.prisma` | Durable lifecycle status/details | VERIFIED | CANCELLED last; cancelledAt, cancelledByUserId, supersededByRoundId; distinct nullable active-week uniqueness. |
| `prisma/migrate-deploy.mjs` | Catalog/ledger preflight | VERIFIED | Cancellation migration expected, ordered five-label set and exact physical-column tuples at lines 453–511. |
| `src/generated/prisma/` | Client matching schema | VERIFIED | enum and PlanningRound model expose new fields; actual application imports generated client. Final typecheck passes. |
| `src/domain/planning/planning-service.ts` | Replan/cancel/change/defaults | VERIFIED | Transactional gates, CAS, advisory locking, shared successor body, fresh roster/configuration, historical reads. |
| `src/domain/planning/target-week.ts` | Shared civil day/week predicates | VERIFIED | BOOKED claims week; bounded search applies shared day predicate; no service import cycle. |
| `src/shared/callback-schema.ts` | Typed action targets | VERIFIED | Replan and cancel/change request/keep/apply targets parsed from opaque persisted tokens. |
| `src/telegram/keyboards.ts` | Reachable controls | VERIFIED | Defined action labels/rows; token resolver drops unavailable actions; serialized keyboard tests cover layout. |
| `src/telegram/planning-renderers.ts` | Blocked/terminal/confirmation copy | VERIFIED | Reads real projections; escaped sorted labels, explicit cancellation and supersession, named same-week confirmation. |
| `src/telegram/planning-handlers.ts` | Delivery/dispatch/recovery | VERIFIED | Shared announcement selector and successor effects; lifecycle commands/dispatchers; explicit Keep surface; guarded recovery. |
| `src/telegram/handlers.ts` | Public command registration | VERIFIED | Closed route union/table plus actual bot.command registrations for both lifecycle commands, current-member boundary. |
| `tests/integration/planning-replan.test.ts` | Real database replacement coverage | VERIFIED | Atomic successor, fresh roster/config, bigint, race/collision/refusal and change parity assertions. |
| `tests/integration/planning-cancel.test.ts` | Real database cancellation coverage | VERIFIED | Allowed statuses, demotion, consume/release, history and concurrency. |
| `tests/integration/planning-round.test.ts` | Defaults/standing integration | VERIFIED | Strict scheduled-end boundaries, booked week claims, historical standing and only-round cancellation. |
| `tests/unit/target-week.test.ts` | Civil-week behavior | VERIFIED | BOOKED and bounded target search, today-selectable and past-week predicates; named BOOKED check independently run. |
| Additional Telegram integration/regression suites | Surface and failure evidence | VERIFIED | replan-telegram, cancel-telegram, change-telegram and lifecycle-review all included by Vitest integration glob; assertions inspected. |

The artifact helper passed all 19 file entries in Plans 02–05. Plan 01 helper failed with EISDIR on its directory-valued artifact; manual inspection above covers the migration/client directories and all remaining entries. The key-link helper returned 0/0 for every plan because links are strings rather than object records. Those outputs are **not** counted as verification; the manual 23-link audit follows.

### Key Link Verification

| Link | From → To | Status | Evidence |
|---|---|---|---|
| K01 | availabilityOutcome → outcome sentence | WIRED | availabilityStepProjection sets outcome; renderer indexes it rather than deciding the round outcome again. |
| K02 | Replan transaction → activeWeekStart unique constraint | WIRED | Same transaction clears old nullable claim then creates successor; collision rollback test. |
| K03 | replanRound → supersedeAndCreate | WIRED | Caller validates/consumes; shared body contains no token/role gate. |
| K04 | supersededByRoundId → replacement explanation | WIRED | Old row retains successor id in one query; terminal status drives distinct /plan_status advice. |
| K05 | listActiveMemberships → new participant rows | WIRED | createMany maps membership and bigint user ids onto successor id. |
| K06 | Schema → generated client → application typecheck | WIRED | New enum/fields exist in generated model and actual service writes. |
| K07 | claimAnnouncement → claimReadyAnnouncementWindow | WIRED | Both blocked and unanimous use same CONFIRMED-guarded cooldown CAS. |
| K08 | announcementBody → renderStep and status | WIRED | Both use one selector; recovery integration asserts separated pointers. |
| K09 | Unexpired terminal token → dispatcher | WIRED | Supersession preserves expiry; callback boundary dispatches before expiry, refuses generically after. |
| K10 | Terminal refusal unions → four answer/booking dispatchers | WIRED | Explicit branches and exhaustive fallback; corrected draft dispatchers additionally covered by review regression. |
| K11 | openLifecycleGate → applyCancel | WIRED | Eligibility/status reads before consume; lost transition releases action. |
| K12 | Gate previousStatus → cancellation notice choice | WIRED | Result returns pre-write status; handler posts result only for BOOKED. |
| K13 | controlBearingMessageId → lifecycle control placement | WIRED | Both command confirmations and Keep paths select announcement or anchor through shared rule. |
| K14 | CANCELLED exclusion → released week | WIRED | Week-claiming status filter excludes it; draft nullable claim also cleared. |
| K15 | CANCELLED exclusion → reanchor refusal | WIRED | Recoverable guard and lifecycle tracking reject terminal statuses. |
| K16 | Reachable cancellation → standing widening in same commit | WIRED | cfef367 contains both applyCancel and status-independent participant query; later read changes retain it. |
| K17 | applyChange → shared replan transaction body | WIRED | Two callers of supersedeAndCreate; PostgreSQL field parity and Telegram message parity tests. |
| K18 | openLifecycleGate → cancel and change | WIRED | Shared gate, action discriminator and separately named allowed-status sets. |
| K19 | Old targetWeekStart → successor | WIRED | Direct field copy; no cross-week calculation on change. |
| K20 | isPastDay location → acyclic day/week use | WIRED | Implemented in target-week, imported/re-exported by service; target-week never imports service. |
| K21 | Week-claiming set → previousRehearsal exclusion | WIRED | Query spreads CONFIRMED/BOOKED set, excluding cancellation/supersession. |
| K22 | Historical participant count → planning access | WIRED | PlanningAccessService consumes service standing; only-round cancellation integration proves retained access. |
| K23 | targetWeekStart predicate → production start | WIRED | Predicate is inside bounded target function; startOrResume calls it with real chat-local date and database claims. |

### Data-Flow Trace (Level 4)

| Artifact / value | Source | Flow | Status |
|---|---|---|---|
| Availability markers/blocker names | PlanningParticipant plus membership/TelegramUser rows | availabilityProjection → availabilityStepProjection → sorted memberLabel → card/announcement | FLOWING |
| Successor lineup/settings | Active ChatMembership rows and ChatConfiguration | locked roster read → shared successor transaction → new draft projection | FLOWING |
| Cancelled/superseded history | Persisted status, schedule, actor/successor detail | transition result → terminal renderer → old message edits | FLOWING |
| Announcement body/slot | Real answer outcome and readyAnnouncedAt/message ids | claimAnnouncement/announcementBody → normal delivery or status recovery | FLOWING |
| Prior day/time hints | Previous CONFIRMED/BOOKED row with endsAt < now | previousRehearsal → dayStepProjection/timeStepProjection → day/time card | FLOWING |
| Lifecycle confirmation anchor | Persisted announcement/anchor pointers | controlBearingMessageId → send/edit → reanchorLifecycleConfirmation CAS | FLOWING |
| Access after cancellation | Historical participant rows in chat | wasPreviousParticipant → planning access policy → command boundary | FLOWING |

No user-visible value ends at a placeholder, static mock or hardcoded empty result. Null projections/actions represent explicit absence/refusal or terminal states, not fabricated data.

### Behavioral Spot-Checks and Final Run Evidence

The verifier ran three named pure tests independently. Full suites were **not rerun**: the final same-tree execution logs were read, and the relevant test implementations and Vitest inclusion patterns were inspected. No server or external bot was started for this verification.

| Behavior | Command / evidence | Result | Status |
|---|---|---|---|
| Immediate unavailable beats pending | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/planning-availability-card.test.ts -t 'blocks on the first unavailable answer even while others are pending'` | 1 passed, 520 ms | PASS |
| Stable collator-equal participant order | Same unit file, `-t 'gives two collator-equal labels two stable lines'` | 1 passed, 523 ms | PASS |
| BOOKED claims a week | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/target-week.test.ts -t 'BOOKED'` | 1 passed, 262 ms | PASS |
| Final full unit run | `.planning/review-unit.log`, executed by final correction run | 360/360, 25 files, 862 ms | PASS |
| Final PostgreSQL integration run | `.planning/review-integration.log`, executed by final correction run | 304/304, 21 files, 247.94 s | PASS |
| Type safety and changed-file format | Root's final `tsc --noEmit` and scoped Prettier evidence | Passed; 35 changed files checked | PASS, corroborating evidence |
| Whole-tree formatting | Existing repository baseline | 655 unrelated files fail; no whole-tree-green claim | Known limitation |

Named filters report nonselected cases as “skipped”; those are filter exclusions, not disabled tests. The final unfiltered suites report all tests passing with no skipped tests. Final production corrections are 8823a3b and 1b6d38a, copy correction e9a0577, and existing-test adaptation ae3c85d; e379b1f records review corrections. Tests added by `planning-lifecycle-review.test.ts` include 14 parameterized cases covering Keep restoration, all draft terminal targets, command/inline recovery, six success acknowledgement branches, send failure, pointer CAS and orphan cleanup.

### Probe Execution

No runnable probe script is declared in the Phase 04 plans. “Probe” references in validation concern spec-less judgment accounting, not an executable `probe-*.sh` contract. There is no MISSING_PROBE finding. Migration behavior is covered by the real PostgreSQL migration-preflight integration suite; no substitute SUMMARY PASS markers were used.

### Requirements Coverage

All eight Phase 04 IDs are claimed by at least one plan and mapped to code/tests. No orphaned Phase 04 requirement was found. Automated satisfaction below does not update the checklist or traceability table to Complete; end-of-phase acceptance remains open.

| Requirement | Source plans | Description / locked interpretation | Status | Evidence |
|---|---|---|---|---|
| AVAIL-05 | 01, 02 | First unavailable blocks immediately and invites replan; reversal remains allowed | SATISFIED in code; live acceptance pending | 01.1–01.3, 01.7; 02.1–02.3 |
| AVAIL-06 | 01, 04 | Fresh round/answers and fresh active-roster snapshot under D-07 | SATISFIED in code; live acceptance pending | 01.4–01.13; 04.1–04.2 |
| AVAIL-08 | 02 | Clear stale/superseded refusal without successor mutation | SATISFIED in code; live acceptance pending | 02.5–02.8 and corrected draft-boundary tests |
| LIFE-02 | 05 | Booked rehearsal counts as scheduled for target week | SATISFIED | 05.2 and BOOKED spot-check |
| LIFE-03 | 03 | Author/current administrator can cancel active/booked | SATISFIED in code; live acceptance pending | 03.1–03.11 |
| LIFE-04 | 04 | Author/current administrator changes date/time into fresh same-week round | SATISFIED in code; live acceptance pending | 04.1–04.8 |
| LIFE-05 | 05 | Finished rehearsal supplies future defaults, with active-roster lineup contract preserved | SATISFIED in code; live acceptance pending | 05.1/05.3 and endsAt boundary integration |
| LIFE-06 | 03, 05 | Cancellation frees week for appropriate new planning | SATISFIED within day-level rule | 03.10 and 05.4; no exhausted-hour rollover claim |

### Decision Coverage

The verifier executed `query check.decision-coverage-verify`: **19/19 honored**, no unhonored entries. Handler message: “All trackable CONTEXT.md decisions are honored by shipped artifacts.” This advisory check was corroborated with code; it is not behavioral evidence by itself.

### Test Quality Audit

| Test files | Linked requirements | Active / skipped | Circular | Strongest assertions | Verdict |
|---|---|---|---|---|---|
| planning-availability-card, planning-keyboards, planning-logging, target-week, planning-day-card, update-route-ownership | AVAIL-05/08, LIFE-02/03/04/06 | Active; no disabled requirement tests | None found | Exact labels, ordering, outcome, bounds and route ownership | Adequate unit proof |
| planning-replan | AVAIL-06, LIFE-04 | Active; no skips | None found | Persisted row equality, token rollback, exact ids/members, collision and race outcomes | Behavioral |
| planning-availability, planning-recovery, planning-replan-telegram | AVAIL-05/08 | Active; no skips | None found | Callback/API sequences, pointer identity and cooldown transitions | Behavioral |
| planning-cancel, planning-cancel-telegram, planning-change-telegram | LIFE-03/04/06 | Active; no skips | None found | Fresh role denial, spendable token, status transitions, both-message correction | Behavioral |
| planning-round, planning-booking, planning-confirm | LIFE-02/05/06, AVAIL-06 | Active; no skips | None found | Database boundary/standing and composed planning/booking flows | Behavioral |
| planning-lifecycle-review | AVAIL-05/08, LIFE-03/04 | 14 active; no skips | None found | Full reversal/Keep path, unchanged successor, exact terminal text, deferred-delivery acknowledgement and pointer guard | Behavioral |
| migration-preflight, planning-participant-integrity | Schema and snapshot integrity | Active; no skips | None found | Real PostgreSQL catalog, enum order, constraints and rejected drift | Behavioral |

**Disabled requirement tests:** 0. **Circular fixture-writing patterns:** 0. **Insufficient requirement assertions found:** 0. Matches for `.pending` were legend object properties, not skipped tests. Some read tests seed statuses directly to isolate boundaries; production confirmation/booking/cancellation paths establish the same preconditions in separate composed tests. This is not fixture-only reliance. No comparison/parity requirement depends on fixtures generated by the implementation itself; replan/change parity compares equivalent business paths and also asserts concrete expected fields.

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|---|---|---|---|
| planning-service.ts:1180/1573/2752/3620 | “placeholder” in explanatory comments | Info | Describes unavailable controls or route-resolved actor storage; no empty implementation. |
| planning-logging.test.ts:820 | raw-target-placeholder fixture | Info | Explicit invalid/log-redaction test input, not production output. |
| All changed production/test/migration files | TBD/FIXME/XXX | None | No unreferenced blocking debt markers found. |

Inversion/disconfirmation checks focused on three plausible failures despite green suites: reversal racing supersession, a refused or stale confirmation consuming the control, and a Keep/recovery redraw removing answer buttons. Actual locks/CAS/compensation and multi-step regression assertions address each. Native delivery cannot be inferred from mocked API success, so human checks remain. The inherited older-booked status selection is explicitly retained below rather than silently treated as completed work.

### Prohibitions

**unverified-prohibition — human review recommended.** All 14 statements are judgment-tier. Every row is **UNCERTAIN (WARNING: human acceptance required)** regardless of its plan-time `status: resolved`. Provisional source-based assessments are NON-AUTHORITATIVE and do not turn these rows green.

| ID | Plan | Statement | Provisional evidence | Status |
|---|---|---|---|---|
| P01 | 04-01 | The blocked card and the replan trail must not use blaming or shaming framing toward the participant who answered Cannot attend — the card states who cannot make the slot as a fact, never as fault, and never quantifies how often a member blocks rounds. | Copy names unavailable members factually; no failure-frequency metric exists. | UNCERTAIN — WARNING / human decision |
| P02 | 04-01 | A Cannot attend tap must not be irreversible for the person who made it — until a new slot is committed, that participant can flip their own answer back and the round must return to the state it was in. | Live answer mutation and reversal tests; successor supersession closes the prior attempt. | UNCERTAIN — WARNING / human decision |
| P03 | 04-01 | A replan must not silently shrink the band — the successor's lineup comes from the administrator-curated active roster, and a replan attempted with an emptied roster is refused rather than creating a round nobody was asked to. | Active-roster re-snapshot plus empty-roster refusal and one-member regression. | UNCERTAIN — WARNING / human decision |
| P04 | 04-01 | A replan must not erase the record of what the band already tried — the superseded attempt survives as its own row and as readable text in the chat, never as a rewound card that overwrites its own history. | Old row/link persist and deliverSuccessor renders terminal history; Telegram edits best effort. | UNCERTAIN — WARNING / human decision |
| P05 | 04-02 | A break-through group message must not be sent again on every answer flip — one participant toggling between the two live buttons must not be able to notify the whole band repeatedly inside a single conversation. | Single 30-minute claim and rapid reblock integration. | UNCERTAIN — WARNING / human decision |
| P06 | 04-02 | A refusal must not send the person to an action that will also fail — superseded-round copy must never instruct the tapper to start planning again, because the replanned round already holds the week and that command would refuse them a second time with no explanation. | Distinct /plan_status terminal advice including corrected draft controls. | UNCERTAIN — WARNING / human decision |
| P07 | 04-03 | Cancellation copy must never offer or imply an undo — the confirmation asks a question and the applied result states a fact, and neither may suggest the rehearsal can be brought back. | Named cancellation question and settled no-undo render. | UNCERTAIN — WARNING / human decision |
| P08 | 04-03 | Cancelling a rehearsal the band arranged their week around must not be silent — a booked cancellation reaches the group as a new message, never only as an in-place edit that notifies nobody. | BOOKED previousStatus triggers fresh cancellation notice; transport failure logged. | UNCERTAIN — WARNING / human decision |
| P09 | 04-03 | A cancelled round must not go on asserting anywhere that the rehearsal is booked or that everyone can make it — the cancelled state gets its own explicit render rather than falling through to another state's sentence, and EVERY durable message the round holds is corrected, not only the one that happened to carry the controls. | Both durable ids corrected independently; failure of one edit does not suppress the other. | UNCERTAIN — WARNING / human decision |
| P10 | 04-03 | Cancelling a rehearsal must not revoke planning access from people who were already asked to it — standing comes from having been invited by an administrator-curated roster, and a slot the band later called off does not un-invite anyone. The widening ships in the same commit as the cancellation, never a wave later. | Historical status-independent participant count ships with reachable cancellation. | UNCERTAIN — WARNING / human decision |
| P11 | 04-04 | A change must not quietly claim a week that another round already holds — the successor takes the superseded round's own target week, and any collision surfaces as a refusal the tapper can act on rather than a database error. | Same-week field copy plus unique collision rollback/refusal. | UNCERTAIN — WARNING / human decision |
| P12 | 04-04 | Change and replan must not become two implementations of the same sentence — a behaviour that holds for one and not the other is a defect, not a variation. | One supersedeAndCreate body and shared deliverSuccessor path, parity tests. | UNCERTAIN — WARNING / human decision |
| P13 | 04-05 | A cancelled slot must never be presented as a rehearsal that happened — it must supply no usual-day marker, no last-time marker, and no participant default, because the band did not rehearse. | Previous query excludes CANCELLED; day/time hints use query, lineup uses active roster. | UNCERTAIN — WARNING / human decision |
| P14 | 04-05 | Releasing a week must not hand the band a week it cannot use — a week whose every day has already passed is rolled past rather than offered as a card whose seven buttons all refuse. | Shared whole-day selectability tested; today remains offered after its hours pass. | UNCERTAIN — WARNING / human decision |

### Human Verification Required

Seven items are carried in frontmatter for the end-of-phase UAT handoff. H7 requires **14 separate dispositions**, not a blanket inferred acceptance. Plan 01/03/04 deferred human-check blocks are merged into H1/H4/H5. The runbook is `04-UAT-RUNBOOK.md`; its scenarios are instructions, not recorded passes.

#### H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap.

**Expected:** The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster.

**Why human:** Native Telegram rendering, label truncation, shared keyboard visibility, real getChatMember behavior and tone are not proved by Bot API doubles. Harvests Plan 04-01's deferred human-check.

#### H2 — Toggle answers through blocked, collecting and unanimous states; request /plan_status inside and after the shared notification cooldown from different members.

**Expected:** Only one notifying announcement is emitted per 30-minute window; its fact changes or retracts as appropriate. Status recovery keeps availability and announcement pointers/surfaces separate. Both answer buttons survive Cancel Keep and Change Keep after a retraction inside cooldown.

**Why human:** Actual notification prominence and native message correction under chat traffic require a real client. Automated tests prove payload order and durable cooldown, not delivered notifications.

#### H3 — Use saved still-live controls from superseded and cancelled attempts, including day/time/back/confirm and answer/booking controls, and compare an expired control.

**Expected:** Unexpired superseded controls explain replanning and direct to /plan_status; cancelled controls explain cancellation. Neither changes the successor. Expired tokens receive the generic expired/stale refusal and already-consumed tokens retain duplicate semantics.

**Why human:** Automated boundary tests prove isolation and exact text; a human must confirm that native alerts are understandable and direct users to useful recovery.

#### H4 — Cancel draft, collecting, ready and booked rehearsals using both /plan_cancel and inline controls; decline once, then apply. Test a non-author and an administrator demoted after opening confirmation.

**Expected:** Named confirmation is reachable; decline preserves usable controls. Eligible apply closes both durable messages without undo copy and frees the week. Only a BOOKED cancellation emits a new result notice. Demoted/ineligible actors receive a private refusal and cannot spend the confirmation.

**Why human:** Real authorization propagation, visibility of both historical messages and booked-cancellation notification are external-service behaviors. Harvests Plan 04-03's deferred human-check.

#### H5 — Change a rehearsal using inline Change and /plan_change below busy chat traffic; repeat after deleting the control message. Exercise both Keep and Apply, including a booked round.

**Expected:** The command posts a fresh bottom-of-chat confirmation; a failed inline edit recovers it or gives clear /plan_status advice. Exactly one lifecycle control surface remains, callback spinner clears before delivery, Keep restores controls, and Apply produces a fresh unbooked same-week attempt with cleared answers and current roster/settings.

**Why human:** Native reachability, deletion behavior, spinner responsiveness and comparable command/inline presentation require live Telegram. Harvests Plan 04-04's deferred human-check and UI-02/03/04 closure checks.

#### H6 — Check lifecycle/defaults in the chat timezone before, at and after a rehearsal's end; cancel the only rehearsal under Previous participants policy; inspect /plan_status and Sunday/Monday planning.

**Expected:** Only finished CONFIRMED/BOOKED rehearsals provide previous day/time hints; cancelled/superseded history does not. Invited members retain standing, new lineups use the active roster, and cancellation releases its week. Today remains selectable even if all hours passed. Any older booked card recovered by status must be clearly dated and understandable.

**Why human:** Boundary reads and access are automated; actual hints, timezone-changed presentation and the retained older-status behavior need product acceptance. This does not claim exhausted-Sunday hour-level rollover or closure of historical WR-04.

#### H7 — Review P01–P14 in the Prohibitions table and record an explicit acceptance or finding for EACH statement.

**Expected:** All 14 individual judgment-tier prohibitions receive human dispositions. A finding remains open; plan frontmatter status: resolved and the verifier's provisional code assessment are not human approval.

**Why human:** ADR-550 D4: judgment-tier prohibitions require human resolution. unverified-prohibition — human review recommended. The 14 provisional assessments are NON-AUTHORITATIVE.

### Limits and Prior Deferred Work

- **WR-04 from Phase 03 is not closed:** `status()` still selects the latest recoverable DRAFT/CONFIRMED/BOOKED row without an endsAt cutoff (service:4170). After cancellation it can recover an older booked rehearsal. Phase 04 research Pitfall 9/A7 explicitly accepts that selection pending product judgment; Plan 05 changes only the previous-defaults read. The dated presentation is included in H6. This is retained scope/UX uncertainty, not a claim of implemented completed-state filtering.
- **Today is day-selectable:** `isPastDay` compares civil dates only. No available-hour test is used by targetWeekStart; exhausted Sunday hours do not force next week. H6 explicitly prevents accepting that contradictory example as a pass.
- **Remote correction is best effort:** a failed edit can leave stale text on Telegram, and a process failure between send and durable pointer recording is not globally exactly-once delivery. Existing compensation and callback identity checks protect durable state; no outbox/retry delivery guarantee is added.
- **One polling process is a declared prerequisite:** chat-key sequentialization and per-round advisory locks support current operation. Request-capability mint uniqueness is not claimed across multiple pollers; no new coincidental-reliance advisory is needed because this precondition is explicitly declared in CONTEXT and SECURITY.
- **No automatic completion status:** completion for this contract is the scheduled-end eligibility read. CONFIRMED and BOOKED both seed previous hints under D-17, while active roster remains lineup authority.
- **Discovery:** commands are registered and callable, but Telegram's BotFather command menu is operator-managed. Live UAT should type the commands or configure that menu.
- Phase 5 explicitly owns reminders and obsolete-reminder suppression (REM-01–05), duplicate update delivery/restart reminder guarantees (RELI-02/03). These are later-phase scope, not missing Phase 04 artifacts. No failed Phase 04 truth was hidden by deferral.
- Security report covers all 36 declared threats at level 1, with zero open; UI report closes four code findings but retains real-client review; code review closes CR-01/CR-02. These audits support, rather than replace, the independent code and test inspection here.

### Verification Decision

**human_needed**, not passed. No observed missing/stub artifact, broken required link, failed tested invariant or unreferenced blocking debt marker remains. The automated implementation contract is verified, but six live Telegram checks and human acceptance of all 14 judgment prohibitions are outstanding. Requirement completion, phase completion and advancing past acceptance remain the orchestrator's responsibility.

---

_Verifier: gsd-verifier. No source/tracking files edited; no commit created._


## Final scoped acceptance — 2026-09-12

All 8 UAT groups are accepted. P01–P14 were individually accepted; third-account and phone notification variants have explicit scoped waivers. H3/H5 and then H6 were expressly accepted on automated evidence combined with prior live observations. Historical human_needed entries above describe original verification requirements, not unresolved acceptance. See 04-UAT.md and 04-AUTOMATED-UAT-2026-09-12.md. The separate operational migration-restart issue is tracked in .planning/debug/migration-restart.md.
