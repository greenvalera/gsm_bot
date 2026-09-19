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

number: 4
name: Ukrainian card update wording acceptance
expected: |
  Native card and buttons changed together after English to Ukrainian, preserving A available, B pending and Sunday 20 September 14:00–16:00. Await explicit acceptance of the observed Ukrainian wording.
awaiting: user wording response

## Tests

### 1. Queued planning reminder after en→uk
expected: Current Ukrainian one-sentence reminder and start label for the actual week, no mentions/duplicate. Same/cross-month variants follow available authorized occurrences; automated coverage handles unavailable variants. Apply only the existing morning-planning/Start waiver if infeasible, explicitly recording the wording-observation gap. Record behavior and wording separately immediately.
result: [pending]

### 2. Ukrainian pending reminder and current-card navigation
expected: Saved rehearsal date, 24-hour range and timezone precede “Нагадаймо про репетицію: {all and only pending mentions} — дай знати, чи зможеш прийти.” The available private-supergroup link reads “Відповісти щодо репетиції” and reaches the current card. Check real user-ID mention links and collect wording acceptance. Unavailable basic/public variants retain only their existing narrow waivers; do not extend waivers by analogy.
result: [pending]

### 3. Switch uk→en before the next normal eligible reminder
expected: The next eligible reminder uses retained English text/navigation, preserving schedule, answers, authority and duplicate suppression. No clock manipulation or fabricated delivery; no general language-switch waiver applies. Record actual observed payload/navigation and result.
result: [pending]

### 4. Switch en→uk and perform the next ordinary card update
expected: Text and buttons switch together on the next normal card update, while existing answers and valid controls remain. Collect wording acceptance immediately and restore the captured language/schedule/roster/active-plan baseline afterward, cancelling only test-created plans.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 3
skipped: 1
blocked: 0

## Gaps

No product defect reported. Scenario 4 behavior observed; wording acceptance pending. Scenarios 2–3 still await natural reminder delivery. Phone-notification observation remains non-blocking/unobserved. Phase 7 H4 retains its historical unclassifiable disposition and is not a new test.


## 2026-09-19 Preflight

Native execution is awaiting an authorized local runtime update: the existing bot and PostgreSQL are stopped, and the bot image differs from the verified Phase 8 image. See 08-LIVE-TEST-2026-09-19.md. All four scenarios remain pending; no fixture changes or new waivers.


## 2026-09-19 Authorized Continuation

Runtime mismatch resolved after explicit user authorization. Scenario 4 behavior passed native observation, but its result remains pending user wording acceptance. One test-created round remains collecting (A available, B pending), language Ukrainian; baseline was English with no active plan. Scenario 2 is prepared for the normal 16:00 Kyiv reminder. Restoration remains due after continuation. See the dated live report.


