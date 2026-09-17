# Requirements: GSMBot v1.1 Localization and Ukrainian

**Defined:** 2026-09-15
**Status:** All 17 requirements confirmed by the user on 2026-09-15.
**Core Value:** The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.

## v1.1 Requirements

### Group Language

- [x] **LANG-01**: An administrator can select English or Ukrainian at the beginning of first /setup; selecting Ukrainian localizes the remaining setup before schedule configuration exists.
- [x] **LANG-02**: An administrator can view and change the group language in settings, with successful-change confirmation in the newly selected language; non-administrators cannot change it.
- [x] **LANG-03**: Existing and new chats use English until an administrator explicitly selects another supported language.
- [x] **LANG-04**: Each group uses its own selected language for messages and callback feedback regardless of individual Telegram client languages, without affecting other groups.
- [x] **LANG-05**: The selected language survives process restart, repeated setup and group-to-supergroup migration, including when selected before configuration is complete.
- [x] **LANG-06**: After a language change, subsequent messages use the new language and active cards adopt it on their next normal update, preserving planning state, answers, ownership and valid controls.

### Complete Interactive Translation

- [x] **TEXT-01**: Users can complete setup, settings and roster interactions in Ukrainian, including prompts, summaries, labels and buttons.
- [ ] **TEXT-02**: Users can complete day/time selection and availability collection in Ukrainian, including legends, participant statuses and ownership information.
- [ ] **TEXT-03**: Users can complete readiness-to-book, manual booking, replanning, date/time changes, cancellation and lifecycle recovery in Ukrainian.
- [ ] **TEXT-04**: Users receive existing help/instructions, validation failures, access denials, stale/duplicate-action feedback and recoverable error messages in the selected group language.

### Reminder Translation

- [ ] **LREM-01**: The group receives planning-start reminders and their controls in its current language, including work scheduled before a language change.
- [ ] **LREM-02**: Pending participants receive follow-up reminders and navigation text in the group's current language, retaining mentions, timing and duplicate-suppression behavior across language changes.

### Localized Formatting

- [ ] **LFMT-01**: Users see dates with language-appropriate weekday/month forms and 24-hour times while the existing authoritative chat/round timezone and civil-date meaning remain unchanged.
- [ ] **LFMT-02**: Users see grammatically correct count and duration forms in English and Ukrainian, including Ukrainian cases represented by 0, 1, 2, 5, 11, 14, 21, 22, 25, 101 and 111.

### Localization Infrastructure and Verification

- [x] **L10N-01**: Maintainers can edit shared English/Ukrainian catalogs with common message-key and parameter contracts used by both interactive and background rendering.
- [ ] **L10N-02**: Automated verification detects missing catalog entries, incompatible parameters and untranslated bot-owned interface surfaces using catalog checks plus a maintained outbound-surface inventory.
- [ ] **L10N-03**: Bilingual regression checks demonstrate the complete Ukrainian workflow and retained English behavior, including safe dynamic-name rendering, Telegram output budgets and catalog/Intl availability in the target runtime image.

## Acceptance Boundaries

- Initial language-selection prompt defaults to English and uses recognizable English / Українська choices. Explicit selection persists independently of setup completion and does not make an unconfigured chat ready.
- A committed change affects subsequent render operations. An already-in-flight send is not recalled. Reminder language is resolved during delivery rendering rather than frozen at job generation.
- Language-only changes do not alter reminder schedule generation, due times, rehearsal date/time, participant answers or callback authorization.
- Existing names, command tokens, stable action identifiers and IANA timezone identifiers are not translated. Translate surrounding explanation; retain escaping and mention/link destinations.
- Full translation includes existing help and bot-owned interface text. A new help workflow, command menu or external-profile redesign is not implicitly added.
- English behavior remains supported. Missing-key fallback is not accepted as proof of complete Ukrainian coverage.
- Project and planning prose remains English; Ukrainian UI examples are allowed as verification examples.

## Future Requirements

No additional future work is committed by this milestone. Further languages and translation-management tooling can be scoped separately if requested.

## Out of Scope

| Feature | Reason |
|---|---|
| Per-member language and automatic detection | One administrator-selected group language is confirmed |
| Additional languages | Only English and Ukrainian selected |
| Proactive rewriting of historical messages/cards | Active cards update on their next normal operation |
| Translator portal or runtime catalog editing | Not required for the requested infrastructure |
| Automatic booking | Separate future feature |
| Unrelated old backlog/audit cleanup | Requires explicit selection or demonstrated localization dependency |
| Reopening historical native-testing waivers | Existing scoped decisions remain valid |

## Traceability

Each requirement maps to one primary acceptance phase in the roadmap approved on 2026-09-15. Numbering continues at Phase 6.

| Requirement | Phase | Status |
|---|---|---|
| LANG-01 | Phase 6 | Complete |
| LANG-02 | Phase 6 | Complete |
| LANG-03 | Phase 6 | Complete |
| LANG-04 | Phase 6 | Complete |
| LANG-05 | Phase 6 | Complete |
| LANG-06 | Phase 7 | Complete |
| TEXT-01 | Phase 6 | Complete |
| TEXT-02 | Phase 7 | Pending |
| TEXT-03 | Phase 7 | Pending |
| TEXT-04 | Phase 7 | Pending |
| LREM-01 | Phase 8 | Pending |
| LREM-02 | Phase 8 | Pending |
| LFMT-01 | Phase 7 | Pending |
| LFMT-02 | Phase 7 | Pending |
| L10N-01 | Phase 6 | Complete |
| L10N-02 | Phase 8 | Pending |
| L10N-03 | Phase 8 | Pending |

**Coverage:** 17 requirements; 17 mapped; 0 unmapped. Phase 6: 7; Phase 7: 6; Phase 8: 4.

---
*Last updated: 2026-09-18 after Phase 7 automated verification. All six Phase 7 requirements are implemented; wording-dependent acceptance remains pending in 07-UAT.md.*
