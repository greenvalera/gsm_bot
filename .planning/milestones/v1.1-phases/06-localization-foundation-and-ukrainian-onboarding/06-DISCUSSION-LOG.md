# Phase 6: Localization Foundation and Ukrainian Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents. Decisions are captured in 06-CONTEXT.md.

**Date:** 2026-09-16
**Phase:** 6 - Localization Foundation and Ukrainian Onboarding
**Areas discussed:** Language selection during setup; changing language in settings; Ukrainian wording and tone; switching during unfinished edits.

The user selected all four areas, explicitly advanced after each area, and requested final context creation. Questions were presented in Ukrainian; the English descriptions below preserve their meaning.

## Language selection during setup

### How should first setup begin?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Separate language screen; selection saves and advances (recommended) | Yes |
| 2 | Language selection followed by Continue |  |
| 3 | English preselected with Continue and Change language |  |

**User choice:** A separate screen with English / Українська buttons. Selecting one immediately persists the language and opens timezone setup.

### What happens when an administrator interrupts setup and invokes /setup again?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Continue using the saved language (recommended) | Yes |
| 2 | Ask for language again, then resume |  |
| 3 | Show current language with Continue / Change language |  |

**User choice:** Use the saved language without asking again; resume the current step if the draft remains valid.

### How can an administrator correct an accidental language selection before setup completes?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Language button on every setup step (recommended) |  |
| 2 | Use /settings even before setup completion |  |
| 3 | Language-change button only on the first step after selection; /settings thereafter | Yes |

**User choice:** Offer a language-change button only on the timezone step immediately after language selection. Later changes are available through /settings, including before setup completion.

### How should the final setup review display the language?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Language row with explanation that it is already saved (recommended) |  |
| 2 | Language row without explanation | Yes |
| 3 | Omit language from setup review |  |

**User choice:** Include a simple Language: Українська row (localized appropriately), without additional explanation. Existing requirement that language persists independently of setup completion remains binding.

## Changing language in settings

### When should a language change from /settings apply?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Apply immediately and return to settings (recommended) | Yes |
| 2 | Require a separate Save / Cancel confirmation |  |
| 3 | Apply immediately and remain on the language selection screen |  |

**User choice:** Immediately after selection; return to settings with confirmation in the newly selected language.

### What should /settings show before initial setup is complete?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Current language, change control, and Continue setup (recommended) | Yes |
| 2 | Language selection only with a /setup instruction |  |
| 3 | Full settings list with unconfigured markers; only language editable |  |

**User choice:** Show the current language, a language-change control, and Continue setup. Other settings become available after setup completes.

### How should the language setting be labeled?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Always Мова / Language (recommended) | Yes |
| 2 | Localize the label as Мова or Language |  |
| 3 | Include the current language in the button label |  |

**User choice:** Always use the bilingual label Мова / Language. Choices remain English / Українська.

**Correction:** The user initially selected option 2, then explicitly corrected the answer to option 1. The bilingual label is the final decision.

### What happens when the administrator selects the current language?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Return to settings with an already-selected message (recommended) |  |
| 2 | Remain on selection screen with a private already-selected alert |  |
| 3 | Return to settings without an additional message | Yes |

**User choice:** Return to settings without any additional message and without changing the language again.

## Ukrainian wording and tone

### What tone should Ukrainian instructions use?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Neutral and friendly formal/plural address (recommended) |  |
| 2 | Informal singular address | Yes |
| 3 | Impersonal wording |  |

**User choice:** Informal singular address (ти), with imperatives such as Обери and Надішли.

### What should the band roster be called?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Склад гурту (recommended) | Yes |
| 2 | Учасники гурту |  |
| 3 | Список учасників |  |

**User choice:** Use Склад гурту as the heading and Додати учасника for the add-member button.

### How should the planning-access setting be phrased?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Хто може почати планування? (recommended) |  |
| 2 | Хто може запропонувати репетицію? | Yes |
| 3 | Доступ до планування |  |

**User choice:** Use Хто може запропонувати репетицію? with the offered choices Лише адміністратори, Учасники попереднього планування, Усі в чаті. Preserve existing authorization semantics.

### How should invalid-input messages read?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Brief explanation plus corrective action (recommended) |  |
| 2 | Corrective action only |  |
| 3 | Conversational introduction plus corrective action | Yes |

**User choice:** Use a conversational introduction with a corrective example, such as Ой, не вдалося розібрати час. Спробуй так: 19:30.

## Switching during unfinished edits

### Should a language transition be explained when answering an older prompt?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Continue in the new language without explanation (recommended) | Yes |
| 2 | Add a one-time language-change notice |  |
| 3 | Add the language to the next step heading |  |

**User choice:** Accept the input under normal rules and show the next step in the current group language without explaining the transition.

### What happens when an administrator selects a language from a still-valid screen opened before another administrator changed the language?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Apply the selected language (recommended) | Yes |
| 2 | Ask the administrator to choose again after explaining the intervening change |  |
| 3 | Refresh the screen and require another tap |  |

**User choice:** Apply the selected language if the token remains valid and the actor is currently authorized. The last explicit valid selection determines group language.

### What happens to an existing confirmation for another action after a language change?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Execute normally and show the result in the new language (recommended) | Yes |
| 2 | Redisplay confirmation in the new language before execution |  |
| 3 | Require opening the action again |  |

**User choice:** Execute under the usual validity and authorization rules and render the result in the new language. A language-only change does not invalidate the confirmation.

### What should Continue setup do after a language change during unfinished setup?

| Option | Description | Selected |
|--------|-------------|----------|
| 1 | Resume the current step; restart expired drafts using saved language (recommended) | Yes |
| 2 | Show entered values before proceeding |  |
| 3 | Offer Continue / Start again |  |

**User choice:** Show the current step in the new language and preserve entered values. If the draft expired, start setup again using the saved language.

## Agent Discretion

No additional product choices were explicitly delegated. Implementation details remain for research and planning within the approved requirements and decisions.

## Deferred Ideas

None. Existing milestone exclusions and Phase 7/8 boundaries remain in force.
