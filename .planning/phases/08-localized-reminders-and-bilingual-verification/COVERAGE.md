# API Coverage — Phase 8 Telegram Bot API

This matrix records the application surface used by localized reminders and bilingual verification. It distinguishes Phase 8 presentation changes from retained integration and records existing scope exclusions. It does not claim to implement every Telegram Bot API method or create new product opt-outs. Paths below are relative to the repository root.

| capability | decision | reason |
|---|---|---|
| Planning reminder delivery: sendMessage and inline keyboard | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E1. |
| Pending reminder delivery: sendMessage HTML options | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E2. |
| Chat metadata: getChat | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E3. |
| Pending participant mentions and output safety | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E4. |
| Basic-group reply navigation | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E5. |
| Public and private supergroup card links | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E6. |
| Callback acknowledgement and current authorization | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E7. |
| Existing message updates and bilingual outbound inventory | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E8. |
| Migration service messages and stale callback feedback | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E9. |
| Delivery rejection and uncertain outcome handling | INTEGRATE | Existing integration retained; Phase 8 presentation and verification coverage documented below. See E10. |
| Native Telegram polls | OPT-OUT | Existing PROJECT.md exclusion: custom cards are required for participant control and targeted reminders. See E11. |
| Automatic studio booking integration | OPT-OUT | Existing PROJECT.md and REQUIREMENTS.md exclusion: automatic studio booking is deferred. See E12. |

## Implementation evidence

### E1 — Planning reminder delivery: sendMessage and inline keyboard

Retained delivery with Phase 8 locale resolution at the send boundary; text and start label use one current locale, opaque callback_data and reply_markup.inline_keyboard remain intact. Evidence: src/app/main.ts createPlanningReminderTransport; src/telegram/reminder-renderers.ts renderPlanningReminder; tests/unit/reminder-transports.test.ts.

### E2 — Pending reminder delivery: sendMessage HTML options

Retained transport forwards parse_mode HTML, link_preview_options.is_disabled true and optional reply_parameters; Phase 8 localizes the actual payload. Evidence: src/app/main.ts createFollowupReminderTransport; tests/unit/reminder-transports.test.ts; tests/integration/localized-reminders.test.ts.

### E3 — Chat metadata: getChat

Retained live type, id and optional username lookup selects group navigation before current locale resolution. Evidence: src/app/main.ts followups.getChat; src/domain/reminders/reminder-service.ts delivery path.

### E4 — Pending participant mentions and output safety

Retained tg://user?id links mention all and only pending participants in roster order; escaped labels truncate by Unicode code point, preserving links within a conservative 4096 encoded-character budget or returning unsendable. Planning reminders have no mentions. Evidence: src/telegram/reminder-renderers.ts; tests/unit/reminder-renderers.test.ts.

### E5 — Basic-group reply navigation

Retained reply_parameters.message_id anchors the card and allow_sending_without_reply is false. Phase 8 translates the instruction and places the /plan_status recovery hint on its own Ukrainian line (D-10–12). Evidence: src/telegram/reminder-renderers.ts.

### E6 — Public and private supergroup card links

Retained https://t.me/username/message and https://t.me/c/id/message routing with validated destinations; Phase 8 translates the link label without adding the basic-group recovery hint. Evidence: src/telegram/reminder-renderers.ts; tests/unit/reminder-renderers.test.ts.

### E7 — Callback acknowledgement and current authorization

Retained callback controls, current membership checks and exactly-once outcome acknowledgement; localization changes presentation rather than granting authority. Evidence: src/app/main.ts getChatMember gateway; src/telegram/planning-handlers.ts; .planning/PROJECT.md acknowledgement decision; tests/fixtures/outbound-surfaces.ts.

### E8 — Existing message updates and bilingual outbound inventory

Retained editMessageText and existing reply/callback surfaces are included in the Phase 8 localization inventory; cards adopt language on their next normal update, without rewriting history. Evidence: src/telegram/planning-handlers.ts; tests/fixtures/outbound-surfaces.ts; tests/unit/outbound-surfaces.test.ts; tests/unit/planning-language-render.test.ts.

### E9 — Migration service messages and stale callback feedback

Retained migrate_to_chat_id/migrate_from_chat_id handling and old-chat isolation; Phase 8 resolves the destination chat locale for answerCallbackQuery migration feedback and retains /plan_status. Evidence: src/telegram/migration-handler.ts; tests/unit/chat-migration.test.ts; tests/integration/chat-migration.test.ts (persisted destination-language switches and unchanged domain snapshots).

### E10 — Delivery rejection and uncertain outcome handling

Retained structured sendMessage GrammyError classification and retry_after handling distinguish explicit rejection from unknown delivery; UNKNOWN is durable and is not retried as a new send. Localization preserves claims, scheduling and recovery eligibility. Evidence: src/domain/reminders/reminder-service.ts classifyReminderDelivery and durable dispositions; tests/integration/reminder-delivery.test.ts; tests/integration/reminder-recovery.test.ts.

### E11 — Native Telegram polls

Existing .planning/PROJECT.md Out of Scope and custom-card decision exclude native polls because participant control, individual statuses and targeted reminders require the custom inline availability card.

### E12 — Automatic studio booking integration

Existing .planning/PROJECT.md Out of Scope and .planning/REQUIREMENTS.md Out of Scope defer automatic booking to a separate feature; retained manual booking status does not perform a studio transaction.

## Presentation and verification boundaries

[08-CONTEXT.md](08-CONTEXT.md) D-01–12 remain authoritative: Ukrainian planning week ranges, one-sentence planning reminder and start button; saved rehearsal date, 24-hour range and authoritative timezone; pending mentions and group-specific navigation. Locale is resolved for delivery, including eligible recovery, without changing due times, permissions, occurrence identity, in-flight sends or historical messages. English behavior remains retained, not silently rewritten.

[08-AUTOMATED-EVIDENCE.md](08-AUTOMATED-EVIDENCE.md) and [08-VERIFICATION.md](08-VERIFICATION.md) contain prior automated evidence; this document adds no new runtime-test claim. Catalog/parameter, outbound inventory and compiled-image Intl checks are application verification, not additional Telegram API methods.

Native acceptance remains **0/4 passed, 4 pending** in [08-UAT.md](08-UAT.md); Phase 8 remains human_needed. D-13–16 require native wording acceptance alongside behavior, one scenario at a time. Preserve the exact historical Phase 5 waiver scope, non-blocking phone-notification observation and Phase 7 unclassifiable probe disposition; none is converted into a behavioral pass. This documentation repair performs no Telegram actions, deployment, container changes or fixture mutation. Remaining API families are not newly promised or newly rejected by this phase-local record.
