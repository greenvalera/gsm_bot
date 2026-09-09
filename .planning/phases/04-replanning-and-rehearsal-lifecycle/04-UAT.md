---
status: testing
phase: 04-replanning-and-rehearsal-lifecycle
source: [04-VERIFICATION.md]
started: 2026-09-09T08:13:00.071Z
updated: 2026-09-09T08:13:00.071Z
---

# Phase 4 User Acceptance Testing

Automated verification is complete: 360 unit and 304 integration tests passed. All entries below await human evidence. Use `$gsd-verify-work 4` to walk through them. Preparation and detailed scenarios are in [04-UAT-RUNBOOK.md](04-UAT-RUNBOOK.md).

## Current Test

number: 1
name: H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap.
expected: |
  The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster.
awaiting: user response

## Tests

### 1. H1 — Block, reverse, and replan in a real Telegram group with at least three roster members; use long/unsafe-looking names and an ordinary member's Replan tap.
expected: The first Cannot attend blocks immediately and names unavailable members without blame; both answer buttons remain usable. Reversing restores collecting. An ineligible tap gets a private author/admin refusal. Eligible replan leaves a terminal old attempt and a fresh same-week day selector with the current roster.
result: [pending]

### 2. H2 — Toggle answers through blocked, collecting and unanimous states; request /plan_status inside and after the shared notification cooldown from different members.
expected: Only one notifying announcement is emitted per 30-minute window; its fact changes or retracts as appropriate. Status recovery keeps availability and announcement pointers/surfaces separate. Both answer buttons survive Cancel Keep and Change Keep after a retraction inside cooldown.
result: [pending]

### 3. H3 — Use saved still-live controls from superseded and cancelled attempts, including day/time/back/confirm and answer/booking controls, and compare an expired control.
expected: Unexpired superseded controls explain replanning and direct to /plan_status; cancelled controls explain cancellation. Neither changes the successor. Expired tokens receive the generic expired/stale refusal and already-consumed tokens retain duplicate semantics.
result: [pending]

### 4. H4 — Cancel draft, collecting, ready and booked rehearsals using both /plan_cancel and inline controls; decline once, then apply. Test a non-author and an administrator demoted after opening confirmation.
expected: Named confirmation is reachable; decline preserves usable controls. Eligible apply closes both durable messages without undo copy and frees the week. Only a BOOKED cancellation emits a new result notice. Demoted/ineligible actors receive a private refusal and cannot spend the confirmation.
result: [pending]

### 5. H5 — Change a rehearsal using inline Change and /plan_change below busy chat traffic; repeat after deleting the control message. Exercise both Keep and Apply, including a booked round.
expected: The command posts a fresh bottom-of-chat confirmation; a failed inline edit recovers it or gives clear /plan_status advice. Exactly one lifecycle control surface remains, callback spinner clears before delivery, Keep restores controls, and Apply produces a fresh unbooked same-week attempt with cleared answers and current roster/settings.
result: [pending]

### 6. H6 — Check lifecycle/defaults in the chat timezone before, at and after a rehearsal's end; cancel the only rehearsal under Previous participants policy; inspect /plan_status and Sunday/Monday planning.
expected: Only finished CONFIRMED/BOOKED rehearsals provide previous day/time hints; cancelled/superseded history does not. Invited members retain standing, new lineups use the active roster, and cancellation releases its week. Today remains selectable even if all hours passed. Any older booked card recovered by status must be clearly dated and understandable.
result: [pending]

### 7. H7 — Review P01–P14 in the Prohibitions table and record an explicit acceptance or finding for EACH statement.
expected: All 14 individual judgment-tier prohibitions receive human dispositions. A finding remains open; plan frontmatter status: resolved and the verifier's provisional code assessment are not human approval.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

None reported yet; pending tests are not passes.

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
