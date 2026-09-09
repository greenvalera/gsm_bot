# Phase 4 Telegram Verification Runbook

Use a test group with an administrator, a planning author and another roster member. Keep the bot in privacy mode. These checks require the completed Phase 4 build; their presence is not evidence that they passed.

The commands can be typed directly. This repository does not synchronize Telegram's command menu; if it is managed through BotFather, the operator must add `plan_cancel` and `plan_change` there for menu discovery.

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
