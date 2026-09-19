---
status: testing
phase: 08-localized-reminders-and-bilingual-verification
source: [08-VERIFICATION.md]
started: 2026-09-19
updated: 2026-09-19
---

# Phase 8 Native Acceptance

Implementation source: d91f5f7. Read 08-ACCEPTANCE-RUNBOOK.md and the project telegram-web-uat skill before live actions. Automated evidence is separate from native results. Present one scenario and its explicit expected condition before actions; immediately record observed behavior and user wording acceptance or requested correction. Preserve historical waiver scope, use one existing polling worker, and restore only changed test fixtures. No native result is pre-recorded.

## Current Test

number: 3
name: English reminder after Ukrainian to English switch
expected: |
  After the saved English preference, the next normal reminder (20 September 10:00 Europe/Kyiv) uses retained English text and current-card navigation, with unchanged slot, pending B, schedule and duplicate suppression.
awaiting: natural English reminder delivery

## Tests

### 1. Queued planning reminder after en→uk
expected: Current Ukrainian one-sentence reminder and start label for the actual week, no mentions/duplicate. Same/cross-month variants follow available authorized occurrences; automated coverage handles unavailable variants. Apply only the existing morning-planning/Start waiver if infeasible, explicitly recording the wording-observation gap. Record behavior and wording separately immediately.
result: skipped
reason: Existing morning/Start native waiver; Ukrainian planning wording remains unobserved. No forced morning occurrence or automation was created.

### 2. Ukrainian pending reminder and current-card navigation
expected: Saved rehearsal date, 24-hour range and timezone precede “Нагадаймо про репетицію: {all and only pending mentions} — дай знати, чи зможеш прийти.” The available private-supergroup link reads “Відповісти щодо репетиції” and reaches the current card. Check real user-ID mention links and collect wording acceptance. Unavailable basic/public variants retain only their existing narrow waivers; do not extend waivers by analogy.
result: pass
evidence: Native delivery observed 2026-09-19 16:00:15; only B user-ID link, correct slot/timezone, current-card navigation and no observed duplicate. User explicitly accepted this wording with “так” on 2026-09-19; see dated live report.

### 3. Switch uk→en before the next normal eligible reminder
expected: The next eligible reminder uses retained English text/navigation, preserving schedule, answers, authority and duplicate suppression. No clock manipulation or fabricated delivery; no general language-switch waiver applies. Record actual observed payload/navigation and result.
result: [pending]

### 4. Switch en→uk and perform the next ordinary card update
expected: Text and buttons switch together on the next normal card update, while existing answers and valid controls remain. Collect wording acceptance immediately and restore the captured language/schedule/roster/active-plan baseline afterward, cancelling only test-created plans.
result: pass
evidence: Native behavior observed on 2026-09-19: text/buttons switched together and A available/B pending were preserved. User explicitly accepted the observed wording on 2026-09-19. Final fixture restoration remains a separate session obligation after scenarios 2–3.

## Summary

total: 4
passed: 2
issues: 0
pending: 1
skipped: 1
blocked: 0

## Gaps

No product defect reported. Scenario 4 native behavior and wording accepted. Scenario 2 native behavior and wording accepted; scenario 3 still awaits a normal English reminder. Phone-notification observation remains non-blocking/unobserved. Phase 7 H4 retains its historical unclassifiable disposition and is not a new test.


## 2026-09-19 Preflight

Native execution is awaiting an authorized local runtime update: the existing bot and PostgreSQL are stopped, and the bot image differs from the verified Phase 8 image. See 08-LIVE-TEST-2026-09-19.md. All four scenarios remain pending; no fixture changes or new waivers.


## 2026-09-19 Authorized Continuation

Runtime mismatch resolved after explicit user authorization. Scenario 4 behavior passed native observation, but its result remains pending user wording acceptance. One test-created round remains collecting (A available, B pending), language Ukrainian; baseline was English with no active plan. Scenario 2 is prepared for the normal 16:00 Kyiv reminder. Restoration remains due after continuation. See the dated live report.




## Scenario 4 wording accepted — 15:46 Europe/Kyiv

The user explicitly responded: Приймаю фомулювання. Recorded scenario 4 native behavior and wording as accepted, without extending acceptance to reminder text not yet observed. Fresh visible Telegram state still shows the Ukrainian Sunday 20 September 14:00–16:00 card, A available and B pending. No new reminder is visible before the normal 16:00 occurrence. Counts: one passed, one historical scoped waiver, two pending. The temporary round and Ukrainian language remain for continuation; final cancellation and restoration to English remain outstanding session obligations. No phase completion is asserted.


## Scenario 2 accepted; scenario 3 prepared — 16:48–16:50 Europe/Kyiv

The user explicitly accepted the observed Ukrainian follow-up wording with “так”. Scenario 2 is passed in the available private-supergroup scope; existing basic/public and phone-observation dispositions are unchanged. Totals: two passed, one scoped historical waiver, one pending.

Explained scenario 3 before actions: the next normal reminder must use English without changing the schedule or answers. Fresh Chrome evidence showed the same current card (A available, B pending, Sunday 20 September 14:00–16:00) and the original Ukrainian reminder. The older language control returned the expected expired-action modal: “Ця дія вже недоступна. Відкрий /settings або /roster і спробуй ще раз.” Dismissed OK, sent /settings at 16:49, and used the fresh Мова / Language → English controls. The dashboard confirmed English and unchanged Europe/Kyiv, Wednesday 14:00, two-hour duration, 10:00–21:00 day window, 10:00/16:00 reminders and admins-only access. No answer, roster, slot or scheduling action was performed.

Scenario 3 remains pending actual delivery at the next existing occurrence, 20 September 10:00 Europe/Kyiv. The earlier one-shot check has run; no further automation was created or implied. Language is now restored to baseline English; the temporary collecting round remains intentionally active with A available and B pending. After the last reminder test, cancel only this test-created round and confirm no active plan. Final phase completion is not asserted.
