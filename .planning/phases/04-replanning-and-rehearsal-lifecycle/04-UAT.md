---
status: partial
phase: 04-replanning-and-rehearsal-lifecycle
source: [04-VERIFICATION.md]
started: 2026-09-09T08:13:00.071Z
updated: 2026-09-10T21:49:00Z
---

# Phase 4 User Acceptance Testing

Plan 04-06 final verification passed 362 unit tests and 307 integration tests, plus type checking and touched-file formatting. Prior live evidence is retained below. Chrome testing reproduced one major defect affecting three grouped cases; Plan 04-06 fixed it and the fresh 13:22–13:27 rerun verified closure. Other grouped cases have partial or missing evidence. Use `$gsd-verify-work 4` to continue. Preparation and detailed scenarios are in [04-UAT-RUNBOOK.md](04-UAT-RUNBOOK.md).

## Live Session — 2026-09-10/11 (two accounts)

Fresh Chrome Web K execution used owner A and ordinary member B in `GSM_bot_test_group`, normal Telegram, the existing local Compose bot and preserved database volume. B was added to the bot roster; only A/B answered test rounds. Detailed steps, observed copy, role refusals, round IDs, timestamps and screenshots are in [the new live report](04-LIVE-TEST-2026-09-10.md). Previous observations are historical, not substituted for fresh evidence.

The two-person block/reverse/replan sequence, cancellation states and negative roles, collecting/booked Change, command recovery beneath traffic, Keep regression, current duration snapshot and participant-policy access passed their observed subcases. Fresh supplemental tests passed: 362 unit and 125 targeted integration tests. They are not native-client acceptance. Full grouped acceptance remains partial: third-person/name variants, retained stale keyboards, demotion/deletion, exact real-time boundaries and human judgments have explicit residuals in the live report. No new product defect has been established.

The real 31-minute cooldown observation passed: a new blocked announcement at 00:38:08 followed T0 by 31 minutes 10.884 seconds, and B received it. Repeated status recovery retained separate surfaces without another announcement. B also retained planning standing when all history was CANCELLED/SUPERSEDED. Narrow 390px, light/dark and native 20px text samples were inspected; original display settings restored. Final state: no active/booked plans, original bot schedule and Admins only restored, roster A/B, one bot running, healthy retained PostgreSQL. Full groups below stay pending/blocked because their residual criteria are not waived.

## Live Session — 2026-09-09 (historical)

- Chrome extension connection succeeded and the existing authenticated Telegram Web tab was accessible.
- The user identified `GSM_bot_test_group`. The selected group has three human members and GSM_Bot; the bot is shown as administrator.
- After the user populated `.env`, presence checks confirmed `BOT_TOKEN` and `POSTGRES_PASSWORD`. Git ignores `.env`.
- `docker compose up --build -d bot` succeeded. PostgreSQL is healthy, the migration service exited 0, and one bot container is running. Its structured startup log reports `Telegram long-poll runner started`.
- At 12:43 local time, `/plan_status` received a live bot response explaining that this chat is not set up and directing to `/setup`. Container build, migration, runner startup and a live command response complete the cold-start smoke check for this fresh database.
- At 12:44 local time, `/setup` rendered **Start setup** and opened the location step. After the user requested continued browser execution, a scoped local configuration fixture bypassed the unsupported Web location attachment prerequisite. No location was sent. `/settings` verified the fixture; this is not a setup pass.
- The runbook now contains exact preparation commands, actor roles, button labels, step-level expected outcomes, manual prerequisites and an evidence reporting format for H1–H7.
- Live lifecycle evidence and a reproduced defect are recorded in [04-LIVE-TEST-2026-09-09.md](04-LIVE-TEST-2026-09-09.md). H1–H7 are not globally accepted. The bot remains running; its database volume is preserved.
- Continuation at 13:34–13:35: fresh draft Change/Keep restored the day selector; Change/Apply retained terminal history and opened a same-week successor; inline cancellation closed it and `/plan_status` confirmed nobody is planning. Docker inspection showed one running bot, healthy PostgreSQL and migration exit 0. No additional defect was observed. H4/H5 have this added draft-path evidence; their remaining multi-account and recovery cases stay pending.

## Current Test

number: 1
name: H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap.
expected: |
  The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster.
awaiting: scope-limited three-person/name variants, retained-keyboard and deletion/demotion prerequisites, exact time-boundary observations, and explicit P01–P14 human decisions; see 04-LIVE-TEST-2026-09-10.md

## Tests

### 1. H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap.
expected: The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster.
result: [pending]
evidence: "Fresh A/B block while pending, collecting reversal, private ordinary-member Replan refusal, author Replan, preserved predecessor and same-week successor with 0/2 answers passed. Three-member and long/unsafe-name variants remain blocked by the authorized two-account scope; tone judgment remains human. See 04-LIVE-TEST-2026-09-10.md."

### 2. H2 — Toggle answers through blocked, collecting and unanimous states; request /plan_status inside and after the shared notification cooldown from different members.
expected: Only one notifying announcement is emitted per 30-minute window; its fact changes or retracts as appropriate. Status recovery keeps availability and announcement pointers/surfaces separate. Both answer buttons survive Cancel Keep and Change Keep after a retraction inside cooldown.
result: [pending]
resolution: "G-04-1 fixed in 04-06 and verified live at 13:22–13:27; other subcases remain pending."
fresh_evidence: "A/B announcement edits/retraction, within-window status throttling, separate durable pointers and exact retraction-to-ready Cancel/Change Keep regression passed. After31min10.884sec a new announcement arrived on B; immediate repeat status produced no extra card. Complete observable message procedure passed; actual notification prominence remains human. See 04-LIVE-TEST-2026-09-10.md."
source: live Chrome extension observation (original finding retained below)
reported: "After /plan_cancel and Keep, the old ready announcement still says everyone can attend while the current card and announcement are blocked. The stale ready message also survives Replan."
severity: major

### 3. H3 — Use saved still-live controls from superseded and cancelled attempts, including day/time/back/confirm and answer/booking controls, and compare an expired control.
expected: Unexpired superseded controls explain replanning and direct to /plan_status; cancelled controls explain cancellation. Neither changes the successor. Expired tokens receive the generic expired/stale refusal and already-consumed tokens retain duplicate semantics.
result: blocked
blocked_by: third-party
reason: "The current Telegram Web client removes retired keyboards. A retained second-client keyboard or a separate native test setup is required; no raw callback or DOM injection was used."
fresh_evidence: "Both accounts saw retired copies with keyboards removed again on 2026-09-11. Native replay remains blocked. Fresh action-retention/lifecycle integration tests passed separately."

### 4. H4 — Cancel draft, collecting, ready and booked rehearsals using both /plan_cancel and inline controls; decline once, then apply. Test a non-author and an administrator demoted after opening confirmation.
expected: Named confirmation is reachable; decline preserves usable controls. Eligible apply closes both durable messages without undo copy and frees the week. Only a BOOKED cancellation emits a new result notice. Demoted/ineligible actors receive a private refusal and cannot spend the confirmation.
result: [pending]
resolution: "G-04-1 fixed in 04-06 and verified live at 13:22–13:27; other subcases remain pending."
source: live Chrome extension observation (original finding retained below)
reported: "Draft, collecting, ready and booked cancellation transitions worked; booked cancellation posted a new notice. After command relocation, an older announcement still says This rehearsal is booked after cancellation. Negative-role checks remain untested."
severity: major
gap_id: G-04-1

fresh_evidence: "Fresh draft/collecting/ready/booked Keep and cancellation passed. B inline/command requests and booked Apply were refused without spending A's confirmation. A also cancelled B's draft as non-author administrator. Both ready/booked surfaces corrected; B received the new booked cancellation message. Demotion-between-request-and-apply is prohibited by session scope, and notification prominence is not claimed."

### 5. H5 — Change a rehearsal using inline Change and /plan_change below busy chat traffic; repeat after deleting the control message. Exercise both Keep and Apply, including a booked round.
expected: The command posts a fresh bottom-of-chat confirmation; a failed inline edit recovers it or gives clear /plan_status advice. Exactly one lifecycle control surface remains, callback spinner clears before delivery, Keep restores controls, and Apply produces a fresh unbooked same-week attempt with cleared answers and current roster/settings.
result: [pending]
resolution: "G-04-1 fixed in 04-06 and verified live at 13:22–13:27; other subcases remain pending."
source: live Chrome extension observation (original finding retained below)
reported: "Inline Keep and command Apply on a booked round worked; a fresh same-week unbooked successor had cleared answers. The displaced prior booked announcement remains booked after the old attempt was superseded. Deletion and multi-member variants remain untested."
severity: major
gap_id: G-04-1

fresh_evidence: "Fresh collecting/booked Change, inline/command Keeps, command recovery below test traffic, ordinary-member request/apply refusals and non-author administrator Apply passed. Successors retained their own week, reset 2 answers, were unbooked, and used the changed duration. Deleted-message recovery remains blocked by the no-deletion constraint."

### 6. H6 — Check lifecycle/defaults in the chat timezone before, at and after a rehearsal's end; cancel the only rehearsal under Previous participants policy; inspect /plan_status and Sunday/Monday planning.
expected: Only finished CONFIRMED/BOOKED rehearsals provide previous day/time hints; cancelled/superseded history does not. Invited members retain standing, new lineups use the active roster, and cancellation releases its week. Today remains selectable even if all hours passed. Any older booked card recovered by status must be clearly dated and understandable.
result: [pending]
fresh_evidence: "Week reclamation, current settings snapshot, dated older CONFIRMED recovery, past-day refusal and today's selectable future hours passed. B retained Previous participants access with only CANCELLED/SUPERSEDED history. Exact end boundaries, historical ended BOOKED and Sunday/Monday remain unavailable in this real-time fixture. Preserved history prevents one-ever-rehearsal isolation. Web K has no location attachment for timezone editing."

### 7. H7 — Review P01–P14 in the Prohibitions table and record an explicit acceptance or finding for EACH statement.
expected: All 14 individual judgment-tier prohibitions receive human dispositions. A finding remains open; plan frontmatter status: resolved and the verifier's provisional code assessment are not human approval.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 1

## Gaps

- gap_id: G-04-1
  truth: "Displaced announcements must not retain contradictory current readiness or booking claims after answer changes, replanning, change or cancellation."
  status: resolved
  reason: "Observed in Chrome: DOM message 398384 remains Ready to book after /plan_cancel → Keep → Cannot attend, while DOM messages 398383 and 398386 show blocked; it remains ready after Replan. Booked change and cancellation reproduce the same stale-fact pattern. IDs here are Web DOM identifiers, not Bot API IDs."
  severity: major
  test: 2
  affected_tests: [2, 4, 5]
  fix_plan: 04-06-PLAN.md
  resolution: "Neutral retired-message rendering, passing message-history regressions, and fresh Chrome evidence in the post-fix rerun section of 04-LIVE-TEST-2026-09-09.md."
  root_cause: "deliverLifecycleConfirmation moves the sole control-message pointer through reanchorLifecycleConfirmation, then renders the previous outcome text without buttons. Subsequent transitions only address the retained anchor and announcement pointers, so the displaced message can never be corrected. repostAnchor/clearSupersededCard have the same text-copy risk."
  artifacts:
    - path: src/telegram/planning-handlers.ts
      issue: "deliverLifecycleConfirmation preserves current outcome copy on an untracked previous message; clearSupersededCard similarly copies active text."
    - path: src/domain/planning/planning-service.ts
      issue: "reanchorLifecycleConfirmation replaces the pointer, with no historical message registry."
  missing:
    - "Render displaced non-live surfaces as neutral moved/historical notices with /plan_status recovery rather than current readiness/booking claims."
    - "Preserve the real availability anchor and its answer buttons when moving only lifecycle controls."
    - "Add regression coverage for later answer reversal, supersede and cancel after command/status relocation."
  debug_session: .planning/phases/04-replanning-and-rehearsal-lifecycle/04-LIVE-TEST-2026-09-09.md

## Individual Prohibition Acceptance (Test 7)

Record an explicit acceptance or finding for each item. Automated code assessment does not populate this table. The scoped day-level rule and retained older-booked status behavior are explained in the verification report.

| ID | Statement | Human disposition |
|---|---|---|
| P01 | The blocked card and the replan trail must not use blaming or shaming framing toward the participant who answered Cannot attend — the card states who cannot make the slot as a fact, never as fault, and never quantifies how often a member blocks rounds. | pending |
| P02 | A Cannot attend tap must not be irreversible for the person who made it — until a new slot is committed, that participant can flip their own answer back and the round must return to the state it was in. | pending |
| P03 | A replan must not silently shrink the band — the successor's lineup comes from the administrator-curated active roster, and a replan attempted with an emptied roster is refused rather than creating a round nobody was asked to. | pending |
| P04 | A replan must not erase the record of what the band already tried — the superseded attempt survives as its own row and as readable text in the chat, never as a rewound card that overwrites its own history. | pending |
| P05 | A break-through group message must not be sent again on every answer flip — one participant toggling between the two live buttons must not be able to notify the whole band repeatedly inside a single conversation. | pending |
| P06 | A refusal must not send the person to an action that will also fail — superseded-round copy must never instruct the tapper to start planning again, because the replanned round already holds the week and that command would refuse them a second time with no explanation. | pending |
| P07 | Cancellation copy must never offer or imply an undo — the confirmation asks a question and the applied result states a fact, and neither may suggest the rehearsal can be brought back. | pending |
| P08 | Cancelling a rehearsal the band arranged their week around must not be silent — a booked cancellation reaches the group as a new message, never only as an in-place edit that notifies nobody. | pending |
| P09 | A cancelled round must not go on asserting anywhere that the rehearsal is booked or that everyone can make it — the cancelled state gets its own explicit render rather than falling through to another state's sentence, and EVERY durable message the round holds is corrected, not only the one that happened to carry the controls. | pending |
| P10 | Cancelling a rehearsal must not revoke planning access from people who were already asked to it — standing comes from having been invited by an administrator-curated roster, and a slot the band later called off does not un-invite anyone. The widening ships in the same commit as the cancellation, never a wave later. | pending |
| P11 | A change must not quietly claim a week that another round already holds — the successor takes the superseded round's own target week, and any collision surfaces as a refusal the tapper can act on rather than a database error. | pending |
| P12 | Change and replan must not become two implementations of the same sentence — a behaviour that holds for one and not the other is a defect, not a variation. | pending |
| P13 | A cancelled slot must never be presented as a rehearsal that happened — it must supply no usual-day marker, no last-time marker, and no participant default, because the band did not rehearse. | pending |
| P14 | Releasing a week must not hand the band a week it cannot use — a week whose every day has already passed is rolled past rather than offered as a card whose seven buttons all refuse. | pending |
