# API Coverage — Telegram Bot API

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> Phase 4 adds no new external service. It extends the Telegram Bot API integration Phase 1
> established, so this matrix re-decides the capability surface from the full-coverage baseline rather
> than inheriting Phase 1–3 opt-outs silently. "INTEGRATE" means the capability is wired and exercised
> by the shipped code; where Phase 4 is the plan that wires or extends it, the plan is named.

| capability | decision | reason |
|---|---|---|
| `getUpdates` (long polling) | INTEGRATE | The bot's only update transport; one polling process, which is also the declared precondition of the one-live-confirmation-row invariant. |
| `sendMessage` | INTEGRATE | Day selector re-post (04-01, 04-04), blocked announcement (04-02), booked-cancellation group notice (04-03). |
| `editMessageText` | INTEGRATE | Terminal superseded-attempt line (04-01, 04-04), announcement body updates (04-02), in-place cancellation edit and both-message correction (04-03). |
| `editMessageReplyMarkup` | INTEGRATE | Removing a keyboard from a terminal card; the codebase's empty-keyboard guard applies. |
| `answerCallbackQuery` | INTEGRATE | Every new dispatcher branch owns exactly one acknowledgement; the 200-code-unit alert budget is asserted by unit test (04-02, 04-03, 04-04). |
| `getChatMember` | INTEGRATE | The per-actor current-role lookup behind every eligibility decision (AUTH-02, D-04, D-14); resolved fresh at the action boundary and re-decided inside each apply transaction. |
| `sendChatAction` | OPT-OUT | No operation in this phase is slow enough for a typing indicator to be honest; every transition answers within one callback acknowledgement. |
| `deleteMessage` | OPT-OUT | Deliberately not used: D-08 and D-15 neuter a superseded or cancelled message in place so the chat keeps a readable trail of what the band tried. Deleting would erase the record the phase exists to leave. |
| `pinChatMessage` / `unpinChatMessage` | OPT-OUT | Not needed yet — the announcement slot is already the round's break-through message (D-03); pinning would add a second thing to keep truthful. |
| `setMessageReaction` | OPT-OUT | Not needed — availability is answered with inline controls bound to server-side tokens, and a reaction carries no authorization binding. |
| `getChatAdministrators` | OPT-OUT | Not needed and undesirable: AUTH-02 requires a per-actor role resolved at the action boundary, and an administrator list is exactly what refusal copy must not disclose (T-04-06, T-04-21). |
| `getChat` | OPT-OUT | Not needed — every chat fact this phase reads is persisted per-chat configuration, not live Telegram state. |
| `setMyCommands` / `getMyCommands` / `deleteMyCommands` | OPT-OUT | Not called anywhere in this codebase (research A5). `/plan_cancel` and `/plan_change` are therefore not auto-registered in Telegram's command menu; that list is out-of-repo BotFather state. Tracked as a runbook line in plans 04-03 and 04-04, not as code. |
| `sendPoll` / `stopPoll` | OPT-OUT | Explicitly out of scope in REQUIREMENTS.md: native polls cannot enforce the roster, expose per-participant status, target outstanding respondents, or support versioned replanning. |
| `forwardMessage` / `copyMessage` | OPT-OUT | Not needed — every message this phase produces is composed from the round's own projection. |
| Media methods (`sendPhoto`, `sendDocument`, `sendAudio`, `sendVideo`, `getFile`) | OPT-OUT | The whole workflow is text plus inline keyboards; no media is produced or consumed. |
| `answerInlineQuery` (inline mode) | OPT-OUT | PROJECT.md constrains all primary interaction to the group chat; inline mode would be a second surface with its own authorization model. |
| Web Apps / `answerWebAppQuery` / Login Widget | OPT-OUT | Explicitly excluded by the platform constraint that interaction must work without a separate client application. |
| Payments (`sendInvoice`, `answerPreCheckoutQuery`, …) | OPT-OUT | No money changes hands in v1; studio booking is a v2 milestone (BOOK-01 … BOOK-05). |
| Moderation (`banChatMember`, `restrictChatMember`, `promoteChatMember`) | OPT-OUT | The bot never moderates. It reads a member's role and never changes it; granting itself that power would widen its permission surface for no product value. |
| Forum topics / Business connection methods | OPT-OUT | Not needed — the bot targets an ordinary group chat; no requirement references topics or business accounts. |
| Webhooks (`setWebhook`, `deleteWebhook`, `getWebhookInfo`) | OPT-OUT | Long polling is the chosen delivery model (CLAUDE.md): serverless sleep/timeout behaviour and overlapping invocations are mismatched to a continuous update listener plus a deferred job worker. |

**Notes**

- No capability above is left undecided. Every OPT-OUT carries a reason.
- The one OPT-OUT with an out-of-repo consequence is the command-list family: until an operator adds
  `/plan_cancel` and `/plan_change` through BotFather, the two commands work when typed but do not
  appear in Telegram's command menu. Recorded in plans 04-03 and 04-04 as a runbook line.
- No new package and no new external service is introduced by this phase; `04-RESEARCH.md` records an
  empty Package Legitimacy Audit with no candidate name.
