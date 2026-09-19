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

number: 2
name: Ukrainian pending reminder and current-card navigation
expected: |
  The next normal reminder at 16:00 Europe/Kyiv mentions only pending participant B, uses Ukrainian saved date/time/timezone, and links to the current card. Collect wording acceptance after actual delivery.
awaiting: natural reminder delivery

## Tests

### 1. Queued planning reminder after en→uk
expected: Current Ukrainian one-sentence reminder and start label for the actual week, no mentions/duplicate. Same/cross-month variants follow available authorized occurrences; automated coverage handles unavailable variants. Apply only the existing morning-planning/Start waiver if infeasible, explicitly recording the wording-observation gap. Record behavior and wording separately immediately.
result: skipped
reason: Existing morning/Start native waiver; Ukrainian planning wording remains unobserved. No forced morning occurrence or automation was created.

### 2. Ukrainian pending reminder and current-card navigation
expected: Saved rehearsal date, 24-hour range and timezone precede “Нагадаймо про репетицію: {all and only pending mentions} — дай знати, чи зможеш прийти.” The available private-supergroup link reads “Відповісти щодо репетиції” and reaches the current card. Check real user-ID mention links and collect wording acceptance. Unavailable basic/public variants retain only their existing narrow waivers; do not extend waivers by analogy.
result: [pending]

### 3. Switch uk→en before the next normal eligible reminder
expected: The next eligible reminder uses retained English text/navigation, preserving schedule, answers, authority and duplicate suppression. No clock manipulation or fabricated delivery; no general language-switch waiver applies. Record actual observed payload/navigation and result.
result: [pending]

### 4. Switch en→uk and perform the next ordinary card update
expected: Text and buttons switch together on the next normal card update, while existing answers and valid controls remain. Collect wording acceptance immediately and restore the captured language/schedule/roster/active-plan baseline afterward, cancelling only test-created plans.
result: pass
evidence: Native behavior observed on 2026-09-19: text/buttons switched together and A available/B pending were preserved. User explicitly accepted the observed wording on 2026-09-19. Final fixture restoration remains a separate session obligation after scenarios 2–3.

## Summary

total: 4
passed: 1
issues: 0
pending: 2
skipped: 1
blocked: 0

## Gaps

No product defect reported. Scenario 4 native behavior and wording accepted. Scenarios 2–3 still await natural reminder delivery. Phone-notification observation remains non-blocking/unobserved. Phase 7 H4 retains its historical unclassifiable disposition and is not a new test.


## 2026-09-19 Preflight

Native execution is awaiting an authorized local runtime update: the existing bot and PostgreSQL are stopped, and the bot image differs from the verified Phase 8 image. See 08-LIVE-TEST-2026-09-19.md. All four scenarios remain pending; no fixture changes or new waivers.


## 2026-09-19 Authorized Continuation

Runtime mismatch resolved after explicit user authorization. Scenario 4 behavior passed native observation, but its result remains pending user wording acceptance. One test-created round remains collecting (A available, B pending), language Ukrainian; baseline was English with no active plan. Scenario 2 is prepared for the normal 16:00 Kyiv reminder. Restoration remains due after continuation. See the dated live report.




## Scenario 4 wording accepted — 15:46 Europe/Kyiv

The user explicitly responded: Приймаю фомулювання. Recorded scenario 4 native behavior and wording as accepted, without extending acceptance to reminder text not yet observed. Fresh visible Telegram state still shows the Ukrainian Sunday 20 September 14:00–16:00 card, A available and B pending. No new reminder is visible before the normal 16:00 occurrence. Counts: one passed, one historical scoped waiver, two pending. The temporary round and Ukrainian language remain for continuation; final cancellation and restoration to English remain outstanding session obligations. No phase completion is asserted.
