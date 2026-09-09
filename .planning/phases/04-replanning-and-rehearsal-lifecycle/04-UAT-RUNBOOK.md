# Phase 4 Telegram Verification Runbook

## Current result — 2026-09-09

The agent ran the signed-in owner's live scenarios in Chrome: draft/collecting/ready/booked cancellation, answer reversal, replan, voluntary booked change, and status recovery. See [live evidence](04-LIVE-TEST-2026-09-09.md).

The stale-announcement defect G-04-1 affecting H2, H4 and H5 was fixed by [Plan 04-06](04-06-PLAN.md) and verified in the 13:22–13:27 live rerun. Do not rerun gap execution for this resolved issue. Pre-fix contradictory messages remain as historical evidence; the fix does not repair untracked legacy copies.

The test group is configured with a one-person roster. At 13:34–13:35, a fresh draft Change → Keep → Change → Apply → Cancel sequence passed, and `/plan_status` confirmed nobody is planning. The bot remains running. The remaining work is the multi-account, stale-client, deletion-recovery and time-boundary cases, plus individual P01–P14 acceptance. Their precise steps are below; a summary of what was not observed is in the live evidence file. No phone/location step is currently needed to continue phase 4 in this prepared group.

## Start here: remaining manual work

1. Use `GSM_bot_test_group`, which is already configured. Send `/settings` and `/roster`; do not restart `/setup` in this prepared group. The three human group members are not automatically three roster members.
2. Have two consenting testers B and C send a message. As owner A, reply to each with `/roster_add`. Send `/roster` again: A, B and C must all appear.
3. A sends `/plan`, selects a future day/time and confirms. Run H1 below, with B and C operating their own accounts. Record each step separately.
4. Run H2 and record the first notification time. Its final observation must be at least 31 minutes later; other scenarios can run in between, but record which round and notification window you are testing.
5. Run H4's negative-role checks and H5's deletion/recovery check. The owner performs the temporary role change and the user deletes the disposable message. These actions have not been performed by the agent.
6. Use a second client for H3. If it removes old buttons on reconnect, report blocked; a screenshot does not preserve a working keyboard.
7. Use a separate group for H6's historical/default tests. Actual end-time and Sunday/Monday observations remain pending; do not change your computer clock.
8. Return step results using the Report back format below, plus a separate decision for every P01–P14. Phase 4 stays partial until the outstanding checks and decisions are resolved.

Use a test group with an administrator, a planning author and another roster member. Keep the bot in privacy mode. These checks require the completed Phase 4 build; their presence is not evidence that they passed.

The commands can be typed directly. This repository does not synchronize Telegram's command menu; if it is managed through BotFather, the operator must add `plan_cancel` and `plan_change` there for menu discovery.

## Preparation and startup

Run the following in PowerShell from the repository. Docker Desktop must be running. The local `.env` must contain `BOT_TOKEN` and `POSTGRES_PASSWORD`; keep their values out of screenshots, reports and commits. Use a test bot with exactly one polling process.

```powershell
Set-Location C:\dev\gsm_bot
$env:PATH = "C:\Program Files\Docker\Docker\resources\bin;" + $env:PATH
docker compose up --build -d bot
docker compose ps -a
```

Expected: PostgreSQL is healthy, `migrate` exited with code 0, and `bot` is running. Compose applies committed migrations before starting the bot. Preserve the database volume; a reset is not required for these checks.

1. Open the disposable test group in Telegram Web in Chrome. Record its name and the bot username in your private test notes.
2. Ensure the bot is already a group administrator and privacy mode is enabled. If it is not, the group owner must set this up.
3. Use three consenting test accounts: **A** (administrator and planning author), **B** (ordinary roster member), and **C** (ordinary roster member). Only the currently signed-in account can be exercised from one Chrome session.
4. For a new group only, A sends `/setup` and completes timezone and schedule settings (use a native Telegram client if location attachment is unavailable in Web). In the prepared group, skip setup. Use `/settings` to verify the displayed timezone and a time window with future slots.
5. Each account posts a short test message. As A, reply to each message with `/roster_add`; send `/roster` and verify all three appear. A must also be on the roster to answer availability.
6. Send `/plan_status`. If an existing rehearsal matters to anyone, use another test group before running cancellation or change scenarios.

**Create a collecting round:** A sends `/plan`, chooses a future day, chooses a future time, and presses **Confirm rehearsal**. All three names should initially show pending answers.

**Create a ready round:** From collecting, A, B and C each press **Can attend**. Expect readiness to book.

**Create a booked round:** From ready, A presses **Mark as booked**, then **Yes, it's booked**. This records a simulated booking for UAT; it does not reserve a venue.

**Create a draft:** A sends `/plan` and stops before **Confirm rehearsal**.

## Execution and evidence rules

Record each numbered step as pass, issue or blocked, including the time, actor, actual text and message link when available. A screenshot of a card proves its appearance, not delivery of a notification to another account. A grouped H1–H6 test passes only when all its steps have evidence. H7 requires the user's explicit individual decisions.

The agent can operate the signed-in account, inspect cards, reverse its own answer, replan as an eligible author, exercise Keep/Apply, and request status. Other people must supply their own answers and confirm notification delivery. Role changes, native stale-client controls and real time boundaries require the procedures below.

| UAT item | Additional participation or prerequisite |
| --- | --- |
| H1 | B and C answer; B tries Replan; a consenting tester supplies a long name containing literal `<`, `>` and `&` to inspect escaping. |
| H2 | Another account observes notifications; repeat after at least 31 minutes from the first announcement. |
| H3 | A second client retains an old keyboard, or run the existing integration harness; harness results do not prove native alert appearance. |
| H4 | B attempts author-only actions; the group owner demotes a temporary test administrator between request and apply. |
| H5 | All three answer to reach booked; the user deletes only a disposable test control message for the recovery case. |
| H6 | A separate test group and scheduled-end/Sunday–Monday observations; use deterministic tests for exact boundaries. |
| H7 | The user records acceptance or a finding for each P01–P14 in `04-UAT.md`. |

## Step-by-step manual sequence

### H1: block, reverse and replan

1. Create a collecting round. B presses **Cannot attend** while A and C remain pending. Expect immediate blocked copy, B named neutrally, both answer buttons and **Replan** still visible.
2. B presses **Replan**. Expect a private author/admin refusal and no new round.
3. B presses **Can attend**. Expect collecting to resume and the blocked announcement to retract.
4. B presses **Cannot attend** again. A presses **Replan**. Expect the old attempt to remain readable without controls and a fresh day selector for the same week.
5. A chooses a day/time and confirms. Verify the current three-person roster and all answers reset to pending. Repeat the display inspection with the consenting tester's long, punctuation-containing name.

### H2: notification cooldown and answer-control recovery

1. From collecting, B presses **Cannot attend**. C observes whether a new group notification arrives and records the time T0.
2. C also presses **Cannot attend**. Then B and C alternate back to **Can attend**; A answers **Can attend** to reach unanimous availability. Inside 30 minutes of T0, expect edits/retractions rather than another notifying announcement.
3. A sends `/plan_cancel`, then presses **Keep rehearsal**. A sends `/plan_change`, then presses **Keep this slot**. Verify both availability buttons remain on the availability card.
4. A and B each request `/plan_status`; repeat immediately to exercise status throttling. Existing announcement and availability surfaces must retain distinct roles.
5. After at least 31 minutes from T0, make the round blocked again and request `/plan_status`. Observe recovery and notification behavior from another account. Record delivered notifications separately from message edits.

### H3: stale controls

1. On a second client, display a test attempt's keyboard, then disconnect that client before A changes or cancels the attempt on the primary client.
2. Reconnect and, only if Telegram still exposes the old button, tap it before its token expires. For a superseded attempt, expect replanned copy directing to `/plan_status`; for a cancelled attempt, expect cancelled copy. The successor must be unchanged.
3. Repeat for old day, time, Back, Confirm, answer and booking controls as available. An expired token should use generic stale/expired copy; an already consumed token should retain duplicate semantics.
4. If Telegram refreshes away the old keyboard, mark the native scenario blocked. Saved screenshots and forwarded messages cannot replay a callback. Do not invent raw Bot API calls to simulate a user's callback. The existing `tests/integration/planning-replan-telegram.test.ts` harness covers server-side terminal/refusal behavior with controlled tokens and API doubles; it is not a live-client pass.

### H4: cancellation matrix

For each state below, create a fresh test attempt. Exercise `/plan_cancel` and, where displayed, **Cancel rehearsal**. First choose **Keep rehearsal** and verify usable controls; reopen and choose **Yes, cancel it**.

| Starting state | Expected after Apply |
| --- | --- |
| Draft | Closed draft; no booked-cancellation notification; `/plan` can claim its released week. |
| Collecting | Explicit cancelled card with no controls; any announcement corrected. |
| Ready | Both durable surfaces say cancelled; neither still says everyone can attend. |
| Booked | Both surfaces corrected and a new cancellation message reaches the group. |

Then B attempts cancellation of an A-authored round: expect refusal. For fresh-role validation, a temporary administrator who is **not the author** opens confirmation; the owner demotes that account before it presses Apply. Expect refusal without cancellation. The owner must perform and later restore this role change. Using the author would invalidate this test because author eligibility survives demotion.

### H5: voluntary change and recovery

1. Create collecting, then repeat with booked. Record the original target week and answers.
2. A presses **Change date or time**, then **Keep this slot**. Expect the original controls and state to remain usable.
3. Add a few agreed test messages after the card. Send `/plan_change`. Expect a new confirmation at the bottom of the chat and only one surface with lifecycle controls.
4. Press **Yes, choose a new slot**. Expect a terminal old attempt and a fresh same-week draft. Confirm it: current roster/settings are used, all answers are pending, and no booking carries over.
5. On another disposable attempt, the user deletes its control message. Send `/plan_change`; expect a reachable confirmation or clear `/plan_status` recovery advice. Repeat the Keep and Apply path if reachable.
6. Observe callback responsiveness. An immediate clear of the spinner is a client observation; do not infer precise network call order from a screenshot.

### H6: historical defaults and week boundaries

1. In a separate test group, configure **Previous participants**, invite B through a roster-based attempt, then cancel the group's only rehearsal. B sends `/plan`: prior invitation must preserve planning eligibility. New lineups still use the active roster.
2. Create a confirmed/booked rehearsal with a known scheduled end in the chat timezone. Inspect the next eligible planning selector before the end and after it. Only after the end may this rehearsal contribute historical day/time hints. Exact equality at the end is best checked by the existing deterministic `planning-round.test.ts` and `planning-booking.test.ts` tests: eligibility uses `endsAt < now`.
3. Repeat with cancelled and superseded attempts; they must never supply historical hints. Record which completed rehearsal actually supplies each hint.
4. On Sunday, cancel the current week's disposable attempt and start planning again. Today remains selectable even if all its hours have passed. On Monday, start planning and verify the local current week has advanced. Do not change the host clock to force this observation.
5. If status recovers an older booked card, verify its date is clear. For the timezone-change case, record the original target week, update the test chat's timezone/settings, then change the attempt: week identity stays fixed while slot generation uses the current settings.

### H7: acceptance record

Read P01–P14 in `04-UAT.md`. Return a decision for each, for example `P01 accept; P02 accept; P03 finding: ...`. Treat P14 using the explicitly retained whole-day rule above. Code review, automated tests and the agent's judgment cannot fill in the user's acceptance.

### Report back

```text
H1 step 1: pass — [time], [actual card wording]
H1 step 2: issue — B could create a successor
H2 step 5: blocked — 31-minute observation not run
P01: accept
P02: finding — [specific concern]
```

To stop the local bot after testing while keeping its data:

```powershell
docker compose stop bot
```

The sections below retain the original scenario rationale and residual cases.

## 1. Block, reopen and replan

Start and confirm a proposal with at least three participants. Have an ordinary participant choose Cannot attend while the others remain pending. Verify the card names who cannot attend without blame, keeps both answer controls and offers Replan. The shared Telegram keyboard is visible to everyone; an ordinary member's Replan tap must receive a private author-or-administrator refusal.

Have that participant choose Can attend. Verify the blocked announcement retracts and the card resumes collecting. Block again, then let the author replan. Verify the old card becomes a terminal attempt record with no controls, and a new day selector appears at the bottom of the chat. Confirm the successor and check its participant list.

## 2. Notification and recovery

While blocked, another unavailable answer must update the existing announcement rather than notify again inside the cooldown. Request `/plan_status` after the notification cooldown and verify it recovers the blocked announcement while the availability card remains independently usable. Repeat within the command cooldown and check that no extra message appears.

## 3. Old controls

Capture an old callback through the test harness before replanning. While it is unexpired, replaying an old answer or booking control must say the slot was replanned and direct the person to `/plan_status`. It must not modify the successor. A cancelled round must instead say the rehearsal was cancelled.

## 4. Cancel

Use `/plan_cancel` on a draft, a collecting round and a booked rehearsal. Each must ask a named confirmation. Decline once and verify the plan survives; confirm once and verify the week is released, controls close and a second apply changes nothing. Cancelling a booked rehearsal must post a new group message; cancelling an unbooked plan must edit its control message in place. Verify both the availability card and any announcement become explicit cancelled records without buttons. Verify a non-author is refused and a current administrator is allowed. Demote an administrator after opening confirmation and verify the apply tap is refused without consuming that confirmation.

## 5. Change

Use `/plan_change` and the inline Change control. Decline once, then accept. Verify a fresh day selector for the same target week, a fresh active-roster snapshot and no carried availability answers. A booked attempt becomes historical and the replacement is unbooked. An administrator demoted after opening confirmation must be refused at apply time.

## 5a. Confirmation recovery and responsiveness

Repeat both lifecycle commands after newer chat traffic has buried the original card, and again after an administrator deletes the control message. The command must expose a reachable confirmation or clear recovery advice. Inline success should clear the callback spinner before waiting for message delivery. After a blocked announcement has been retracted and the round becomes ready again inside the announcement cooldown, decline Cancel and Change in turn: the availability anchor must retain both answer buttons.

## 6. Lifecycle defaults

Cancel the only rehearsal in a chat configured for previous participants, then verify a snapshotted non-administrator can still start planning. Check that an in-progress rehearsal does not supply previous-rehearsal defaults until after its scheduled end, and that cancelled/superseded attempts never supply those defaults. Test Sunday and Monday under the chat's local timezone: Sunday itself remains selectable by the existing whole-day rule; on Monday the current week naturally advances.

## Residual cases to observe

- A timezone change between attempts retains the old target-week identity but uses the current schedule configuration.
- After cancellation, `/plan_status` may recover an older booked rehearsal, whose heading must make its date clear.
- Day-level selectability may still offer today when every time slot has passed, including Sunday night. The plan's exhausted-Sunday example conflicts with its explicit requirement to preserve this rule. Hour-level rollover is outside this phase; do not record that example as passing.
