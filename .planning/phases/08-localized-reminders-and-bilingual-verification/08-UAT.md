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

number: 1
name: Queued planning reminder after en→uk (feasibility and existing waiver first)
expected: |
  If a currently authorized occurrence is feasible, a queued reminder renders “Час запланувати репетицію на {real week range}.” with “Почати планування” below, without mentions or duplicate delivery. Collect wording acceptance immediately.
  Preserve the existing morning-planning/Start waiver; if no authorized feasible occurrence exists, record its exact waiver and wording-observation gap rather than fabricate delivery or count it passed.
awaiting: user response

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
pending: 4
skipped: 0
blocked: 0

## Gaps

None reported. Native acceptance has not been executed. Phone-notification observation remains non-blocking/unobserved. Phase 7 H4 retains its historical unclassifiable disposition and is not a new test.


## 2026-09-19 Preflight

Native execution is awaiting an authorized local runtime update: the existing bot and PostgreSQL are stopped, and the bot image differs from the verified Phase 8 image. See 08-LIVE-TEST-2026-09-19.md. All four scenarios remain pending; no fixture changes or new waivers.

