# Phase 8: Localized Reminders and Bilingual Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in 08-CONTEXT.md.

**Date:** 2026-09-18
**Phase:** 8-Localized Reminders and Bilingual Verification
**Areas discussed:** Planning-start reminder; pending-participant reminder; navigation to availability card; final bilingual verification.

The user selected all four areas. Questions were presented in Ukrainian, one at a time. English descriptions below preserve their meaning; Ukrainian copy alternatives are retained verbatim.

## Planning-start reminder

### Which Ukrainian planning-start reminder text should be used?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Час запланувати репетицію на 21–27 вересня. | Yes |
| 2 | Коли репетируємо 21–27 вересня? Обери дату й час. |  |
| 3 | Заплануй репетицію на 21–27 вересня. |  |

**User's choice:** Час запланувати репетицію на 21–27 вересня. (Dates are dynamic.)

### What should the reminder button say?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Запланувати репетицію |  |
| 2 | Почати планування | Yes |
| 3 | Обрати дату й час |  |

**User's choice:** Почати планування

### How should week ranges display months?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Repeat month only across month boundaries | Yes |
| 2 | Always include month beside both dates |  |

**User's choice:** Use 21–27 вересня within one month and 28 вересня – 4 жовтня across months. Do not add a year, preserving the prior decision.

### How should the reminder text be laid out?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | One sentence | Yes |
| 2 | Call to action and dates on separate lines |  |

**User's choice:** One sentence: Час запланувати репетицію на 21–27 вересня. Button below.

### Continue this area or move on?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Move to pending-participant reminders | Yes |
| 2 | Discuss planning-start reminder further |  |

**User's choice:** Move to pending-participant reminders.

## Pending-participant reminder

### What should the reminder say around pending-participant mentions?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Ще чекаємо на відповідь від: … |  |
| 2 | Чи зможеш прийти? … |  |
| 3 | Нагадаймо про репетицію: … — дай знати, чи зможеш прийти. | Yes |

**User's choice:** Нагадаймо про репетицію: … — дай знати, чи зможеш прийти.

### Where should the rehearsal date and time appear?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Separate date/time line before the reminder | Yes |
| 2 | Date/time within the reminder sentence |  |

**User's choice:** A separate line before the reminder: Репетиція — понеділок, 21 вересня, 19:00–21:00. Preserve timezone indication and card navigation.

### How should participant mentions be arranged?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Inline, comma-separated | Yes |
| 2 | Each mention on a separate line |  |

**User's choice:** Inline, comma-separated. Preserve every pending mention and existing ordering.

### Where should the rehearsal timezone appear?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | In parentheses after the time range | Yes |
| 2 | On a separate timezone line |  |

**User's choice:** In parentheses after the time range, e.g. Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv). Use the saved rehearsal timezone and do not translate its identifier.

### Continue this area or move on?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Move to card navigation | Yes |
| 2 | Discuss pending-participant reminders further |  |

**User's choice:** Move to navigation to the availability card.

## Navigation to availability card

### What should the direct availability-card link say?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Відкрити картку відповідей |  |
| 2 | Відповісти щодо репетиції | Yes |
| 3 | Перейти до планування |  |

**User's choice:** Відповісти щодо репетиції

### What instruction should appear when a basic-group reminder replies to the availability card?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Щоб відповісти щодо репетиції, відкрий картку, на яку відповідає це повідомлення. | Yes |
| 2 | Натисни на цитовану картку й обери «Можу» або «Не можу». |  |

**User's choice:** Щоб відповісти щодо репетиції, відкрий картку, на яку відповідає це повідомлення.

### How should the existing card-recovery hint be worded?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Не знаходиш картку? Скористайся /plan_status. | Yes |
| 2 | Щоб знову показати картку, скористайся /plan_status. |  |

**User's choice:** Не знаходиш картку? Скористайся /plan_status.

### Where should the recovery hint appear in a basic group?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Separate line after the instruction | Yes |
| 2 | Same paragraph as the instruction |  |

**User's choice:** On its own line after the reply-navigation instruction. Supergroups retain the direct link Відповісти щодо репетиції.

### Continue this area or move on?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Move to final bilingual verification | Yes |
| 2 | Discuss card navigation further |  |

**User's choice:** Move to final bilingual verification.

## Final bilingual verification

### How should new Ukrainian copy be reviewed after implementation?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | In Telegram during reminder testing | Yes |
| 2 | Review all new copy as a list first, then in Telegram |  |

**User's choice:** In Telegram during reminder acceptance testing. Preserve previously accepted copy and existing native-testing waivers.

### How should manual bilingual verification be scoped?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | New reminders and both language-switch directions, with impact-based prior-scenario retesting | Yes |
| 2 | Additionally repeat the entire available workflow in both languages |  |

**User's choice:** Focus on new reminders and language switching in both directions. Repeat previously accepted scenarios where changes may affect behavior. Full automated coverage remains required; existing native waivers remain valid.

### How should manual acceptance scenarios be presented?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | One scenario at a time with its expected result beforehand | Yes |
| 2 | Small groups of related scenarios with expected results and a shared summary |  |

**User's choice:** One at a time, with the expected result explained before each check.

### When should Ukrainian wording be accepted?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Alongside behavior during each scenario | Yes |
| 2 | Separate wording review at the end |  |

**User's choice:** Immediately alongside each reminder's behavior; the user can accept the result or request a copy change after each scenario.

### Finish this area or discuss further?

| Option | Description | Selected |
| --- | --- | --- |
| 1 | Finish this area | Yes |
| 2 | Discuss final verification further |  |

**User's choice:** Finish this area.

## Completion

After all four areas were completed, the user chose option 1, Create the final 08-CONTEXT.md for planning, over discussing additional gray areas.

## Agent Discretion

No additional product choices were explicitly delegated. Implementation and verification design remain planning responsibilities within approved requirements and decisions.

## Deferred Ideas

None. Existing scope exclusions and native waivers remain unchanged.
