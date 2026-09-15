# Feature Research: Localization and Ukrainian

**Milestone:** v1.1
**Researched:** 2026-09-15
**Confidence:** HIGH confirmed scope; MEDIUM inventory completeness.

## Confirmed Contract

An administrator selects English or Ukrainian for the group. Existing/new chats default to English. Group messages and callback feedback follow this choice regardless of individual client language. New messages/reminders use the saved selection; active cards change on their next normal update. Documentation remains English.

## Feature Landscape

| Table-stakes feature | Complexity | Scope |
|---|---|---|
| Durable group choice | MEDIUM | Admin authorization, restart and chat migration |
| Visible/reversible choice | LOW | English / Українська; success in new language |
| Setup/settings/roster translation | MEDIUM | Prompts, hints, summaries and validation |
| Planning/availability translation | HIGH | Selectors, legends, statuses, ownership and recovery |
| Booking/lifecycle translation | MEDIUM | Readiness, booking, replanning, change and cancellation |
| Both reminder streams | HIGH | Current language at delivery |
| Date/count formatting | MEDIUM | Month forms, weekdays, durations and plurals |
| Completeness/English regression | MEDIUM | Catalog parity plus outbound-path audit |

## Surface Inventory

- src/telegram/callbacks.ts and handlers.ts: shared denials and stale feedback.
- renderers.ts, setup-handlers.ts, settings-handlers.ts: prompts, summaries and errors.
- keyboards.ts: visible labels alongside stable action identifiers.
- roster-renderers.ts and roster-handlers.ts: roster copy and anonymous identity fallback.
- planning-renderers.ts and planning-handlers.ts: interactive planning through lifecycle recovery.
- reminder-renderers.ts, domain/reminders/reminder-service.ts and app/main.ts: two background rendering paths.
- domain/chat/types.ts: English weekday and access-policy display maps.

Targeted source search found no setMyCommands registration or standalone start/help handler. Translate existing embedded help/instructions; inventory external command descriptions if present. A new help flow or command-menu feature is not assumed authorized.

## Resolved Detail: First Setup

ChatConfiguration is created on setup completion. A locale field there alone cannot localize initial setup.

User selected option 1 on 2026-09-15: administrator selects language at the start of setup, persisted before schedule configuration exists. English remains the default and Ukrainian applies to the remaining setup after selection. Settings allow later changes. Preference creation must not mark the chat configured.

## Dependencies and Deferrals

Persistence/common formatting precede extraction. Workers need the translator without Telegram context. Verify separate chats, old cards and already-queued reminders. Preserve names, command tokens, timezone identifiers and action data. Review complete Ukrainian sentences using a consistent glossary.

No inherited backlog item is currently a demonstrated prerequisite. Additional languages, personal preferences, automatic detection, translator tooling, historical-message rewriting and automatic booking remain outside scope. Necessary locale migration checks do not reopen unrelated audit debt.

## Sources

- User decisions, PROJECT.md and current working-tree files above.
- [Telegram BotCommand](https://core.telegram.org/bots/api#botcommand): command identifiers use lowercase English letters, digits and underscores.
- [Unicode plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules): grammatical categories.
