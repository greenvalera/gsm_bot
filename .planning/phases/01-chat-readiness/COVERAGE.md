# API Coverage — Telegram Bot API and grammY

> Full coverage by default. This matrix enumerates the Phase 1 external capability surface; every subtraction is an explicit, reasoned opt-out.

| capability | decision | reason |
|---|---|---|
| grammY command routing for `/setup`, `/settings`, `/roster`, and `/roster_add` | INTEGRATE | |
| Telegram long polling through `@grammyjs/runner` | INTEGRATE | |
| chat-key runner sequentialization | INTEGRATE | |
| `getChatMember` current-role lookup | INTEGRATE | |
| ordinary group `location` message ingestion | INTEGRATE | |
| replied-message `from` identity for `/roster_add` | INTEGRATE | |
| `sendMessage` and grammY reply helpers | INTEGRATE | |
| message editing for authoritative post-mutation state | INTEGRATE | |
| inline keyboards and 1–64 byte `callback_data` | INTEGRATE | |
| immediate `answerCallbackQuery` acknowledgement | INTEGRATE | |
| private callback alerts through `show_alert` | INTEGRATE | |
| Telegram Markdown formatting for one-heading message hierarchy | INTEGRATE | |
| grammY error boundary (`bot.catch`) | INTEGRATE | |
| webhook delivery | OPT-OUT | The project uses one continuously running long-poll worker; webhook deployment is outside the selected operational shape. |
| private-chat location-request reply keyboard | OPT-OUT | Telegram limits this control to private chats and D-09 requires an ordinary location attachment in the group. |
| persistent grammY sessions/conversations as workflow authority | OPT-OUT | D-02, D-03, and D-14 require PostgreSQL actor-bound drafts, expiry, revocation, and atomic promotion. |
| native Telegram Polls | OPT-OUT | The milestone requires an administrator roster, participant snapshots, per-user status, and versioned callbacks that native polls cannot enforce. |
| Telegram Web Apps or a separate web UI | OPT-OUT | The project and UI contract require all Phase 1 interactions to remain Telegram-native. |
| automatic enumeration of all chat members | OPT-OUT | Telegram does not expose a reliable historical participant list; administrators maintain the persistent roster. |
| chat-member update subscription as authorization authority | OPT-OUT | AUTH-02 requires a fresh `getChatMember` result at each protected action; pushed updates may improve observability later but cannot replace that check. |
| direct messages for Phase 1 setup and roster management | OPT-OUT | The phase is a group-chat readiness flow, and bots cannot initiate a private chat with users who have not started one. |
| unrelated Telegram commerce, media, forum, and business APIs | OPT-OUT | Payments, Games, Passport, Stars, file/media, forum, and business surfaces do not participate in chat configuration, roster management, or planning-access policy. |

## Coverage Boundary

The matrix covers every Telegram/grammY capability needed or plausibly adjacent to Phase 1. Later phases must extend this durable subtraction record when they add availability buttons, reminder delivery, lifecycle messages, or another Telegram surface.
