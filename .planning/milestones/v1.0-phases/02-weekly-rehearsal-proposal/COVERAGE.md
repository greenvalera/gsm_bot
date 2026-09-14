# API Coverage — Telegram Bot API and grammY (Phase 2)

> Full coverage by default. This matrix enumerates the **Phase 2 planning surface** — what the weekly-rehearsal wizard adds on top of Phase 1. Every subtraction is an explicit, reasoned opt-out.
>
> Phase 1's matrix (`.planning/phases/01-chat-readiness/COVERAGE.md`) stays in force and is not restated. Its closing boundary required exactly this extension once a phase "added availability buttons, reminder delivery, lifecycle messages, or another Telegram surface." Rows below record capabilities that are new in Phase 2, or inherited ones whose *usage* changed.

| capability | decision | handler / test reference (INTEGRATE) or reason (OPT-OUT) |
|---|---|---|
| `/plan` command route | INTEGRATE | `handlers.ts:579` (`command:plan`, authority `planning-access-policy`); `tests/integration/planning-round.test.ts` — *starts a durable week-aware round and anchors the day card*. |
| `/plan_status` command route | INTEGRATE | `handlers.ts:629` (authority `chat-member`, per D-15); `tests/integration/planning-recovery.test.ts` — *routes /plan_status to the status surface, never to /plan*. |
| `callback_query:data` under route-resolved authority | INTEGRATE | `callbacks.ts:253` with the `callback:PLANNING` route (`handlers.ts:268`); `tests/unit/callback-authority.test.ts` — *dispatches the planning kind for a member and for a restricted member*. |
| `editMessageText` anchor discipline — one live card, edited in place | INTEGRATE | `planning-handlers.ts:571`; `tests/integration/planning-round.test.ts` — *replaces the same anchor card in place when the author taps a day*. |
| `editMessageText` with `reply_markup` omitted, to drop buttons | INTEGRATE | `planning-handlers.ts:575-578` and `:654-657` — omitted, never `undefined` (`exactOptionalPropertyTypes`). The keyboard-less REVIEW and CONFIRMED cards depend on it. |
| Stopping a superseded card by editing away its keyboard | INTEGRATE | `planning-handlers.ts:650`; `tests/integration/planning-recovery.test.ts` — *posts a new card, re-anchors to it, and stops the old one being live*. |
| `"message is not modified"` GrammyError absorption | INTEGRATE | `planning-handlers.ts:508-513` (`isNotModified`), plus a process-memory render fingerprint at `:515` that skips an identical re-render before it becomes a rejected request. |
| `answerCallbackQuery` refusals with `show_alert: true` | INTEGRATE | Answered from the owning branch, never at the dispatcher top (Phase 1 finding F-3); `planning-handlers.ts:401` (`refuseNonAuthor`); `tests/unit/planning-logging.test.ts`. |
| Inline keyboard row shapes — 4/3 days, 3/3/3/1 slots | INTEGRATE | `keyboards.ts:257`, `:269`, `:278`, `:296`; `tests/unit/planning-keyboards.test.ts` — *keeps every label inside the visible width, marker glyph included* (the F-9 guard). |
| Opaque versioned `callback_data` within the 1–64 byte limit | INTEGRATE | Planning rows carry only a minted token; `tests/unit/planning-keyboards.test.ts` — *puts nothing but an opaque token on the wire*. Round id and authority resolve from PostgreSQL. |
| Emoji marker glyphs in button labels (⭐ 🔁 🚫 ✅) | INTEGRATE | `keyboards.ts:155-169`, one glyph map for both selectors; `tests/unit/planning-day-card.test.ts` and `planning-time-card.test.ts`. Client rendering is unobservable here — UAT 1. |
| Per-viewer `Take over this plan` control | INTEGRATE | `keyboards.ts:217` and `:228`, minted per viewer; `tests/integration/planning-takeover.test.ts` — *offers the control to an administrator once the round has gone quiet*. |
| `parse_mode: "HTML"` on every planning card | INTEGRATE | `planning-handlers.ts:578` and `:657`; one `escapeHtml` in the Telegram layer. Callback alert text is plain, not HTML — WINDOWS.md #20, open, carried as UAT 4. |
| `ctx.reply` for command refusals and the re-posted card | INTEGRATE | `handlers.ts:584/603/634/643`; `tests/integration/planning-recovery.test.ts` — *rate-limits the no-round reply, which no round can hold a cooldown for*. |
| Telegram delivery failure recorded, not swallowed | INTEGRATE | Bounded `reason` on every planning log line, caught value bound under `err`; `tests/unit/planning-logging.test.ts` — *records a Telegram delivery failure rather than swallowing it*. |
| chat-key runner sequentialization across planning taps | INTEGRATE | `create-bot.ts`. Not the correctness mechanism — PostgreSQL constraints are; `tests/integration/planning-confirm.test.ts` — *resolves two concurrent Confirms to exactly one promotion*. |
| `getChatMember` role refresh at the planning action boundary | INTEGRATE | `main.ts:35` gateway, consulted at each protected action; `tests/integration/planning-takeover.test.ts` — *refuses an administrator who was demoted between render and tap*. |
| `message:text` / `message:location` on the planning surface | OPT-OUT | Every step is button-driven (`handlers.ts:235-237`). A free-text step would open deferred item N-6 — ordinary group text arriving at a wizard — which this phase avoids. |
| `deleteMessage` for superseded cards | OPT-OUT | D-14 keeps a superseded card in the chat as history, stopped rather than erased. Deleting it would destroy the audit trail the group reads back. |
| `pinChatMessage` / `unpinChatMessage` for the live card | OPT-OUT | The anchor is located durably by `anchorMessageId` and re-posted by `/plan_status`. Pinning needs rights the phase does not require and fights the band's own pin. |
| `getChat` / `getChatMember` as the display-name source | OPT-OUT | `resolveTelegramIdentity` (`roster-service.ts:103`) reads the stored roster identity, so naming is stable and costs no API call per render. Authorization still refreshes. |
| `answerCallbackQuery` `url` and `cache_time` | OPT-OUT | The phase has no deep links or games. A non-zero `cache_time` would serve a stale refusal after the round moved on, contradicting the re-derive-at-tap-time rule. |
| `sendMessage` notification, thread, preview and reply options | OPT-OUT | The card is the notification the group waits for, carries no links, and targets the chat itself. Forum topics are outside the milestone's chat model. |
| `web_app`, `login_url`, `switch_inline_query*`, `pay`, `copy_text` | OPT-OUT | Every planning button is a `callback_data` button by the UI contract; all interaction stays Telegram-native and in-group. |
| Native Telegram Polls for day and slot selection | OPT-OUT | A poll cannot enforce the roster, apply the D-07/D-08 marker rules, refuse a past day without spending the card, or carry the revision guard behind exactly-once confirm. |
| `sendChatAction` during a step transition | OPT-OUT | Each transition is one in-place edit completing in a single round trip; a typing indicator would flicker with no information gained. |
| Telegram-side scheduled or delayed delivery | OPT-OUT | Deferred work is owned by pg-boss on PostgreSQL (reminders land in Phase 5). Bots cannot schedule Telegram-side, and it would not meet the retry and audit needs. |
| Direct messages to participants | OPT-OUT | Phase 2 ends at group coordination; per-member DMs belong to Phase 3 availability collection, and bots cannot open a private chat with a user who has not started one. |
| Telegram commerce, media, forum, Passport, Stars, business APIs | OPT-OUT | Restated from Phase 1 — none participate in rehearsal-round planning. |

## Notes on the load-bearing rows

**Route-resolved authority is the one structural change to the callback boundary.** Phase 1 kinds keep administrator authority unchanged; the planning kind defers *only* the actor comparison to the round's own ownership decision (D-02). Chat binding and token expiry stay at the boundary for every route. `tests/unit/callback-authority.test.ts` pins all four halves: *keeps chat binding at the boundary for every route, including planning*, *keeps the expiry check at the boundary for every route, including planning*, *defers only the actor comparison, and only for a route-resolved binding*, and *leaves an in-progress setup draft intact when a member taps a planning button*.

**The anchor discipline is what "exactly one live card" means.** DAY → TIME → REVIEW → CONFIRMED are four renders onto one `message_id`. A step tap must never post a second message. Where a new card is unavoidable (`/plan_status` re-anchor), the old one is stopped by an edit that drops its keyboard, and the race is resolved durably: `tests/integration/planning-recovery.test.ts` — *leaves ONE live card when the re-anchor loses its revision race*, *writes the new anchor and the cooldown stamp or neither*.

**Refusals are answered late, on purpose.** Telegram honours only the first answer per `callback_query.id`. Acknowledging at the top of the dispatcher is what made every alert unreachable in Phase 1 (finding F-3), so each branch answers its own alert. `refuseNonAuthor` additionally performs *no* `editMessageText`: the anchor belongs to the author and nothing durable changed, so re-rendering would spend the author's card on a stranger's mistake.

**One escaper, two escaping contexts.** `escapeHtml` is exported once from `roster-renderers.ts` and applied to card bodies sent with `parse_mode: "HTML"`. `answerCallbackQuery` text is plain, so the same escaper must *not* be applied there — applying it is precisely WINDOWS.md defect #20 (an owner named "Ben & Jo" shows as "Ben &amp;amp; Jo" in a private alert). Left open deliberately; both candidate fixes were rejected in 02-05.

## Coverage Boundary

This matrix covers every Telegram/grammY capability the Phase 2 planning wizard uses or plausibly reaches for. **Phase 3 (availability collection) must extend it again** when it adds per-participant response buttons, non-responder follow-ups, or any direct-message surface. The three opt-outs most likely to flip to INTEGRATE there are *direct messages to participants*, *`sendChatAction`*, and *scheduled delivery* — the last as a pg-boss-driven `sendMessage`, not a Telegram-side schedule.

**Not covered by any test in this repository:** what a Telegram *client* draws — emoji glyph availability, button label truncation at real device widths, and the visual result of an in-place edit. Phase 1 found F-9 (label truncation) only on a live run. That is why `02-UAT.md` item 1 exists and cannot be discharged by adding tests here.
