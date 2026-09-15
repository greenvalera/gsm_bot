# Domain Pitfalls

**Domain:** Stateful Telegram group bot for weekly band-rehearsal scheduling  
**Researched:** 2026-08-19  
**Overall confidence:** MEDIUM — Telegram platform constraints were checked against current official documentation; job-recovery guidance is architecture-level guidance and must be validated against the selected runtime.

## Critical Pitfalls

### Pitfall 1: Treating planning as an in-memory conversation instead of a durable, versioned state machine

**Confidence:** MEDIUM  
**What goes wrong:** Two commands, callbacks, or workers create/replan the same week at once. A late callback then writes an answer into a newer availability round, or a cancellation and a reminder race to revive a cancelled plan.

**Root cause:** State is inferred from the latest Telegram message or held in process memory; the “one active planning process per chat/week” rule is implemented by a read-then-insert check, not by database constraints and transactions. PostgreSQL documents that its default Read Committed isolation can observe changing snapshots under concurrent work; writes needing a consistent view need locks or serializable transactions. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

**Consequences:** Incorrect rehearsal date, stale responses counted as current, duplicate availability cards, or a plan considered bookable after a negative vote.

**Warning signs:** More than one active row for the same chat and ISO week; callback errors that reproduce only under simultaneous taps; `UNIQUE` violations or transaction retries not handled.

**Prevention:** Model planning as explicit states (`draft`, `collecting_availability`, `ready_to_book`, `cancelled`, `superseded`) with a monotonically increasing `round_version`. Enforce one live planning record with a database uniqueness rule keyed by `chat_id` and target ISO-week, mutate state in short transactions, and lock/retry on conflicts. Store immutable participant snapshots and answers keyed to the availability-round ID—not to “the current poll.”

**Detection:** Invariant queries and alerts for more than one live plan per chat/week, answers whose round differs from the active round, and state transitions outside the allowed transition graph.

**Roadmap phase:** Foundation: data model and state machine, before any interaction UI.

### Pitfall 2: Assuming Telegram updates and reminder sends happen exactly once

**Confidence:** MEDIUM  
**What goes wrong:** A webhook request is retried after a timeout or a worker restarts after sending but before persisting completion; the same callback is processed twice, daily reminders duplicate, or planned reminders disappear after a deploy.

**Root cause:** Side effects are performed before a durable idempotency record, update IDs are not deduplicated, and scheduled jobs exist only in a process-local timer. Telegram retries unsuccessful webhook deliveries and recommends advancing the `getUpdates` offset to prevent duplicates; long polling and webhooks are mutually exclusive. [Telegram Bot API: updates and webhooks](https://core.telegram.org/bots/api)

**Consequences:** Members get spammed, transitions execute twice, and trust in the schedule is lost.

**Warning signs:** The same `update_id` appears multiple times, repeated reminder text within minutes, a backlog in `getWebhookInfo.pending_update_count`, or reminders stop after a restart.

**Prevention:** Persist processed `update_id` before business effects and make it unique. Use a durable outbox/job table with a stable idempotency key such as `(plan_id, round_version, reminder_kind, local_due_date)`. Claim jobs transactionally, record `sent_at` only after a successful API call, and retry failed sends with bounded exponential backoff. Reconcile overdue pending jobs on startup; never blindly replay every missed occurrence.

**Detection:** Dashboard/alert on duplicate-update rejects, unsent due jobs, retry count, scheduler lag, webhook pending count, and `last_error_message` from `getWebhookInfo`.

**Roadmap phase:** Foundation: update ingestion and durable scheduler; reliability testing before enabling automatic reminders.

### Pitfall 3: Using server time or a fixed UTC offset for a per-chat weekly schedule

**Confidence:** MEDIUM  
**What goes wrong:** Monday 10:00 arrives on Sunday evening or an hour late; generated slots or target weeks are wrong around DST; the “current versus next week” rule flips at the wrong instant.

**Root cause:** Storing only UTC offsets or relying on host/container time zone rather than an IANA zone and local-calendar calculation. DST and zone rules are controlled by governments and can change with little notice. [IANA time-zone database](https://www.iana.org/time-zones/tz-link)

**Consequences:** Incorrect dates, wrong reminder day/time, and a costly migration when chats need different locales.

**Warning signs:** Configuration values such as `UTC+2`; tests that never run across a DST boundary; use of “add 24 hours” for a daily local reminder.

**Prevention:** Require a per-chat IANA zone (for example, `Europe/Kyiv`), store date/time selections as local civil values plus zone and compute instants with a DST-aware library. Use ISO calendar weeks (Monday–Sunday), explicitly define the policy for nonexistent and repeated local times, retain the original local selection for display, and keep time-zone data updated with system/runtime updates.

**Detection:** Automated tests at ISO-week boundaries and both DST transitions; a scheduled health check comparing next due instant with its stored local rule; logs containing both UTC instant and local zone.

**Roadmap phase:** Foundation: time model and calendar calculations.

### Pitfall 4: Trusting callback payloads, cached roles, or message ownership for authorization

**Confidence:** MEDIUM  
**What goes wrong:** Any group member changes date/time, a removed roster member votes, a former administrator cancels a rehearsal, or a replayed button mutates a later round.

**Root cause:** Treating `callback_data` as authority, authorizing only when rendering a button, or checking only a client-visible role. OWASP recommends server-side authorization for every request and default-deny behavior. [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

**Consequences:** Schedule tampering, privacy exposure through participant status, and irreconcilable disputes over who changed a plan.

**Warning signs:** Callback handlers accept a participant ID or state transition directly from the payload; authorization is implemented in UI routing; no audit record identifies actor and before/after state.

**Prevention:** On every callback, load server-side state by an opaque ID and verify callback chat ID, message/plan binding, actor Telegram ID, membership status, authorization policy, plan state, and round version in the same transaction. Re-check administrator status for privileged actions and fail closed if Telegram cannot verify it. Record auditable actor, action, and versions; do not put participant lists or permissions in callbacks.

**Detection:** Authorization-denial metrics, tests that tamper with every callback field, audit review of privileged transitions, and alerts for callbacks from actors outside the participant snapshot.

**Roadmap phase:** Foundation: authorization service and callback protocol; security review before release.

### Pitfall 5: Designing around a complete, always-visible Telegram member list

**Confidence:** MEDIUM  
**What goes wrong:** The bot cannot populate or validate the roster, does not receive expected text responses, or continues to chase people who left the group.

**Root cause:** Ignoring privacy mode and bot rights. Privacy mode is enabled by default, limiting group updates to relevant commands/replies/service messages; bot administrators receive all messages. `getChatMember` for other users is only guaranteed when the bot is a chat administrator, and `chat_member` updates require both admin status and explicitly including that update type. [Telegram Bot Features: Privacy Mode](https://core.telegram.org/bots/features) and [Telegram Bot API: getChatMember](https://core.telegram.org/bots/api)

**Consequences:** “Inaccessible” roster entries, false non-response reminders, broken free-text flows, and deployment-specific behaviour that is difficult to reproduce.

**Warning signs:** The product assumes it can enumerate every group member; roster entries have no Telegram user ID; testing is done only with the bot promoted to admin; `allowed_updates` omits `chat_member`.

**Prevention:** Make the administrator-managed roster the product source of truth and enrol a member only from an observed update or an explicit in-chat interaction that provides a Telegram user ID. Use inline callbacks and bot commands, which work under privacy mode; do not require all-message access. At setup, show a capability check (bot installed, can send messages, and—if membership validation is desired—administrator). Track `my_chat_member` and `chat_member` updates where available; on verification failure, mark a roster member unavailable for this round and ask an admin to resolve rather than silently excluding them.

**Detection:** Setup diagnostic command, periodic verification before sending a reminder, metrics for “member inaccessible,” and integration tests for privacy-enabled/non-admin and admin configurations.

**Roadmap phase:** Onboarding and roster management, with deployment acceptance tests.

## Moderate Pitfalls

### Pitfall 6: Overloading inline callback data and failing to expire stale controls

**Confidence:** MEDIUM  
**What goes wrong:** Buttons fail because payloads exceed Telegram limits, a button on an old card changes a new plan, or a callback references a deleted/inaccessible message.

**Root cause:** Encoding dates, participant IDs, permissions, and state in callback text; leaving keyboards active after replanning. Telegram limits `callback_data` to 1–64 bytes and a callback can refer to a `MaybeInaccessibleMessage`; clients display a spinner until `answerCallbackQuery` is called. [Telegram Bot API: inline keyboards and callbacks](https://core.telegram.org/bots/api)

**Consequences:** Broken taps, stale votes, confusing UI, and accidental schedule changes.

**Warning signs:** Callback strings resemble JSON; callback handlers do not compare a round/version; users report a spinning button; new cards are posted without disabling old ones.

**Prevention:** Encode only a compact opaque action token (or action + server ID); use the database for all context. Add expiry/version checks, return a friendly “This card is no longer active” answer, and edit prior availability cards to remove keyboards when superseded/cancelled. Always acknowledge callbacks promptly, then perform slower work.

**Detection:** Contract tests asserting byte length, telemetry for expired/unknown callbacks, and UI tests for negative response/replan followed by a tap on the old card.

**Roadmap phase:** Interaction UI and callback protocol.

### Pitfall 7: Ignoring Telegram throughput limits and API failures during catch-up

**Confidence:** MEDIUM  
**What goes wrong:** The first worker after downtime sends every follow-up at once and Telegram returns 429s; per-chat message ordering becomes confusing.

**Root cause:** One global cron loop sends independently without per-chat pacing or handling `retry_after`. Telegram advises no more than about one message/second in one chat and no more than 20 messages/minute in a group; exceeding limits yields 429 errors. [Telegram Bots FAQ](https://core.telegram.org/bots/faq)

**Consequences:** Missed reminders, retry storms, and message floods that make the bot unwelcome.

**Warning signs:** 429 responses, identical reminder batches, jobs perpetually retrying, or messages from a newer round appearing before an older result.

**Prevention:** Serialize outbound sends per chat, apply a group-safe token bucket, honor API retry timing, coalesce obsolete reminders, and cap retries. On recovery, send only still-relevant reminders and spread them over a bounded window.

**Detection:** Monitor API response codes, queue depth, age of oldest job, per-chat send rate, and reminder coalescing counts.

**Roadmap phase:** Scheduler/reliability hardening.

### Pitfall 8: Deleting or mutating historical answers instead of snapshotting each availability round

**Confidence:** MEDIUM  
**What goes wrong:** A “Cannot attend” clears data in place and a late callback or report makes it impossible to tell which date/time the stored answer applied to.

**Root cause:** A single mutable answer row per member/plan and no immutable record of selected date/time, participant set, or round lifecycle.

**Consequences:** Stale votes, misleading completion status, weak debugging/auditability, and painful additions such as a change-history view.

**Warning signs:** `DELETE FROM answers` during replanning; a response has no foreign key to a specific round; UI derives prior participants from current roster rather than previous rehearsal snapshot.

**Prevention:** Close/supersede the old round, retain its answers and card message ID, create a new round with its own immutable candidate and participant snapshot, and count only the active round for readiness. Make prior participation selection an intentional query over confirmed historical records.

**Detection:** Referential-integrity checks, a test that taps an old card after replanning, and an operator view showing the complete round timeline.

**Roadmap phase:** Data model and replanning workflow.

### Pitfall 9: Leaking bot credentials, personal data, or sensitive schedule details

**Confidence:** MEDIUM  
**What goes wrong:** A bot token is committed, printed in request URLs or logs, copied into a test environment, or availability/Telegram IDs are retained and exposed more broadly than needed.

**Root cause:** Hard-coded configuration, unrestricted logs/backups, and no retention or access policy. OWASP advises least-privilege secret access, rotation, and never logging primary secrets; it also lists tokens and sensitive personal data among fields that should be removed, masked, hashed, or encrypted in logs. [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) and [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

**Consequences:** Full bot takeover, group-message spam, accidental disclosure of attendance history, and incident-response cost.

**Warning signs:** `BOT_TOKEN` in source or sample config, raw webhook bodies in logs, production data copied to local test fixtures, no documented rotation/revocation procedure.

**Prevention:** Store the token and webhook secret in a secret manager or protected deployment configuration, validate Telegram’s webhook secret header, redact tokens/IDs/message text in logs, restrict database and backup access, and define retention/deletion rules for roster and historical availability. Prepare and test a token-rotation runbook.

**Detection:** Pre-commit/CI secret scanning, log-redaction tests, least-privilege access review, audit alerts for token/config changes, and a rotation drill.

**Roadmap phase:** Deployment/security baseline, before production webhook registration.

## Minor Pitfalls

### Pitfall 10: Making Telegram message rendering the only source of truth

**Confidence:** MEDIUM  
**What goes wrong:** A message is manually deleted, cannot be edited, or formatting/mentions fail, leaving the chat display different from stored planning state.

**Root cause:** Business logic infers status from message text or assumes every `editMessageText` succeeds. Telegram callback messages may be inaccessible, and user/account/permission changes can prevent intended presentation actions. [Telegram Bot API: CallbackQuery](https://core.telegram.org/bots/api)

**Consequences:** Confusing cards, duplicate announcement posts, and support effort, but not necessarily corrupt scheduling if state is durable.

**Warning signs:** Message ID is not stored; any edit failure aborts the state transaction; text display names/usernames are used as primary identity.

**Prevention:** Store outbound message IDs as optional presentation references, commit domain state independently, treat edits as retryable projection updates, and fall back to a fresh status message when an old one is unavailable. Use immutable Telegram numeric user/chat IDs for identity and display names only for rendering.

**Detection:** Track edit/delete failures, reconcile active plans whose latest card is missing, and run manual tests after deleting a bot message.

**Roadmap phase:** Interaction polish and operational observability.

### Pitfall 11: No explicit operational ownership for bot removal, outage, and configuration changes

**Confidence:** MEDIUM  
**What goes wrong:** The bot is removed, loses permissions, or a chat changes configuration mid-round; reminders fail silently and the planning author has no recovery path.

**Root cause:** No `my_chat_member` handling, no configuration versioning, and no admin-facing diagnostics.

**Consequences:** Silent loss of service and ambiguous schedules until a human notices.

**Warning signs:** No alert when sendMessage starts failing for a chat; settings changes overwrite values without actor/time; a bot reinstall produces duplicate schedule data.

**Prevention:** Record bot membership status and configuration revision, stop/reconcile jobs when the bot leaves, notify administrators on recoverable configuration problems, and expose a safe `/status` diagnostic. Preserve state on temporary failure but require an explicit admin action to resume a cancelled or inaccessible workflow.

**Detection:** Synthetic health check in a test chat, alerts for consecutive per-chat delivery failures, and audit log for roster/settings changes.

**Roadmap phase:** Operations hardening and release readiness.

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Data model | Duplicate live plans and stale answers | Unique live-plan invariant, round-versioned snapshots, transactional state transitions |
| Bot onboarding | Privacy mode and insufficient admin rights | Capability check; persistent roster; explicitly request membership updates only when needed |
| Callback UI | Tampered, oversized, or stale callback data | Opaque ≤64-byte tokens; server-side authorization and expiry/version checks |
| Calendar/settings | Wrong week or reminder during DST | Per-chat IANA zone, ISO-week calculations, DST-boundary tests |
| Reminders | Duplicate sends, missed recovery, 429s | Durable idempotent jobs, transactional claiming, reconciliation, per-chat rate limiter |
| Deployment | Forged webhooks and token leakage | Telegram secret-header validation, secret storage/rotation, log redaction |
| Release verification | Unseen operational failures | Test privacy/admin matrix, duplicate delivery, concurrent callbacks, restart recovery, DST, deletion, and rate limiting |

## Sources

- [Telegram Bot API](https://core.telegram.org/bots/api) — official platform specification; MEDIUM confidence through verified web retrieval.
- [Telegram Bot Features: Privacy Mode](https://core.telegram.org/bots/features) — official group message-visibility behavior; MEDIUM confidence through verified web retrieval.
- [Telegram Bots FAQ: limits](https://core.telegram.org/bots/faq) — official delivery-rate guidance; MEDIUM confidence through verified web retrieval.
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and [application-level consistency](https://www.postgresql.org/docs/17/applevel-consistency.html) — official concurrency guidance; MEDIUM confidence through verified web retrieval.
- [IANA time-zone database](https://www.iana.org/time-zones/tz-link) — authoritative DST and zone-rule source; MEDIUM confidence through verified web retrieval.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), and [Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — security best practices; MEDIUM confidence through verified web retrieval.
