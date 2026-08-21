# API Coverage — Telegram Bot API and grammY

> Full coverage by default. This matrix enumerates the Phase 1 external capability surface; every subtraction is an explicit, reasoned opt-out.

| capability | decision | handler / test reference (INTEGRATE) or reason (OPT-OUT) |
|---|---|---|
| grammY command routing for `/setup`, `/settings`, `/roster`, and `/roster_add` | INTEGRATE | `src/telegram/handlers.ts` (`CHAT_READINESS_ROUTES`, `registerChatReadinessHandlers`); `tests/integration/chat-readiness.e2e.test.ts` — *registers every Phase 1 route once*. |
| Telegram long polling through `@grammyjs/runner` | INTEGRATE | `src/app/main.ts` (`run(bot)`); exercised operationally, not in tests (one continuous worker). |
| chat-key runner sequentialization | INTEGRATE | `src/app/create-bot.ts` installs `sequentialize` ahead of every handler; `tests/integration/chat-readiness.e2e.test.ts` — *serializes concurrent updates for the same chat*. |
| `getChatMember` current-role lookup | INTEGRATE | `src/domain/auth/authorization-service.ts`, gateway in `src/app/main.ts`; `tests/unit/authorization.test.ts` and the route-inventory e2e test. |
| ordinary group `location` message ingestion | INTEGRATE | `src/telegram/handlers.ts` (`message:location` router) → `handleSetupLocation` / `handleSettingsLocation`; `tests/integration/chat-readiness.e2e.test.ts` full-workflow test. |
| replied-message `from` identity for `/roster_add` | INTEGRATE | `src/telegram/roster-handlers.ts` (`repliedIdentity`); `tests/integration/roster-repository.test.ts` and the full-workflow e2e test. |
| `sendMessage` and grammY reply helpers | INTEGRATE | every surface handler; asserted against the documented method set in `tests/integration/chat-readiness.e2e.test.ts`. |
| message editing for authoritative post-mutation state | INTEGRATE | `src/telegram/settings-handlers.ts` and `src/telegram/roster-handlers.ts`; asserted after each settings save and roster removal in the full-workflow e2e test. |
| inline keyboards and 1–64 byte `callback_data` | INTEGRATE | `src/telegram/keyboards.ts` with `createCallbackToken`; `tests/integration/chat-readiness.e2e.test.ts` — *issues only short opaque versioned tokens*. |
| immediate `answerCallbackQuery` acknowledgement | INTEGRATE | `src/telegram/callbacks.ts` (`registerCallbackBoundary`); `tests/integration/chat-readiness.e2e.test.ts` — *acknowledges every callback before …*. |
| private callback alerts through `show_alert` | INTEGRATE | `src/telegram/callbacks.ts` and each feature dispatcher; `tests/integration/chat-readiness.e2e.test.ts` — *rejects malformed, missing, expired, …*. |
| Telegram Markdown formatting for one-heading message hierarchy | INTEGRATE | `src/telegram/renderers.ts` and `src/telegram/roster-renderers.ts` (`parse_mode: HTML`); `tests/unit/roster-rendering.test.ts` and `tests/unit/schedule-settings.test.ts`. |
| grammY error boundary (`bot.catch`) | INTEGRATE | `src/app/main.ts`; operational logging path, not asserted in tests. |
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
