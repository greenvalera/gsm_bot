---
status: verifying
trigger: Native Phase 7 UAT renders an ungrammatical Ukrainian week heading.
created: 2026-09-18T15:14:00Z
updated: 2026-09-18T15:14:00Z
---

## Symptoms

Expected: A grammatical Ukrainian day-selection heading with full weekday and month.
Actual: `Заплануй репетицію — тиждень від Понеділок, 14 вересня`.
Reproduction: Actor A sends `/plan` in the Ukrainian primary test group.
First observed: 2026-09-18 18:12 Europe/Kyiv. No runtime error.

## Current Focus

hypothesis: The catalog puts the genitive-governing preposition `від` before a standalone nominative date label.
test: Inspect catalog composition and the existing localized card assertion.
expecting: Shared date labels are correct; only the enclosing phrase is wrong.
next_action: Retest the corrected week-start heading on the next native day card, then obtain human wording acceptance.

## Evidence

- Native Telegram day card shows the exact malformed phrase above.
- `src/shared/i18n/uk.ts` planning.dayHeading directly prefixes `тиждень від` to the supplied date.
- The formatter supplies nominative full weekdays correctly for standalone headings. Altering it globally would affect other valid cards.
- Existing localized card test checks only a heading prefix and does not detect grammatical composition.
- Native change/cancel confirmations also rendered `Змінити Субота...` and `Скасувати Субота...`. Both share the same inappropriate composition of a standalone date as a direct object. Retaining the slot returned to the same 1/2 response state.

## Resolution

root_cause: Incompatible grammatical case between catalog prefix and standalone weekday label.
fix: Use `Заплануй репетицію — початок тижня: ...`, retaining the full standalone date. Make change/cancel questions refer explicitly to the rehearsal and place the standalone slot on its own line.
verification: 66 focused unit tests passed; runtime build passed. Corrected change/cancel prompts observed natively. Corrected week-start heading awaits native day-card retest.
files_changed: src/shared/i18n/uk.ts; tests/unit/localized-planning-cards.test.ts; tests/unit/localized-lifecycle-cards.test.ts
