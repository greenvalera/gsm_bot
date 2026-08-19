# Architecture Patterns: Telegram Rehearsal Coordinator

**Domain:** Stateful Telegram group workflow for weekly rehearsal planning  
**Researched:** 2026-08-19  
**Overall confidence:** MEDIUM — the platform and persistence claims are verified against current primary documentation; the proposed domain model and delivery pattern are an engineering recommendation derived from those constraints.

## Recommended Architecture

Build a small, modular monolith: one TypeScript service codebase, PostgreSQL as the sole system of record, and two independently scalable process roles from the same image: `web` for the Telegram webhook and `worker` for inbound-event processing, scheduled work, and outbound messages. This is the simplest architecture that survives webhook retries and process restarts. Do not introduce Redis, a separate queue broker, or microservices in the first milestone.

```text
Telegram
   | HTTPS webhook (secret header verified)
   v
Webhook adapter ──transaction──> PostgreSQL
                                  - inbound_update (dedupe)
                                  - workflow data
                                  - jobs / transactional outbox
   | 2xx after durable acceptance
   v
Worker <── claims due work with row leases ── PostgreSQL
   |                                      |
   +--> Telegram gateway (send/edit/answer callback)
   |
   +--> [future] BookingProvider port --> isolated Playwright worker --> studio website
```

Telegram retries a webhook request that does not receive a 2xx response, and its `getUpdates` documentation separately warns clients to advance the offset to avoid duplicate updates. Treat every incoming update as at-least-once, irrespective of delivery mode. A webhook is preferable in production because it gives one observable HTTPS ingress, but never run long polling while a webhook is configured. [Telegram Bot API — updates and webhooks](https://core.telegram.org/bots/api) — **MEDIUM confidence** (provider classification; verified primary source).

### Component Boundaries

| Component | Responsibility | Must not own | Communicates with |
|---|---|---|---|
| Telegram webhook adapter | Verify `X-Telegram-Bot-Api-Secret-Token`, parse only allowed update types, durably accept each update, return 2xx | Workflow transitions, timers, browser work | `InboundUpdateRepository`, callback acknowledgement gateway |
| Command and callback adapter | Convert Telegram commands/callbacks into typed application commands; identify actor/chat/message | Authorization policy or persistence decisions | `AuthorizationService`, `PlanningService` |
| Authorization and roster service | Resolve planner policy, Telegram admin checks, and persistent band roster | Poll state or Telegram rendering | `ChatRepository`, `RosterRepository`, Telegram member gateway |
| Planning service | Own the rehearsal planning state machine, target-week selection, candidate choices, availability rounds, cancellation and reschedule rules | HTTP, Telegram payload format, job polling | Repositories, `Outbox`, domain clock |
| Availability service | Record an eligible participant's answer and determine all-yes / any-no / pending | Direct message editing | `PlanningService`, `Outbox` |
| Card renderer | Render the custom availability card from committed snapshots and a revision number | Business decisions | Telegram gateway through outbox |
| Scheduler | Materialize and claim due semantic jobs in a chat's time zone | In-memory timers as truth | `JobRepository`, `PlanningService` |
| Outbox dispatcher | Send or edit Telegram messages after a committed transition; track delivery attempts | Reconstruct workflow state | Telegram gateway |
| PostgreSQL repositories | Transactions, row locking, constraints, immutable history | Telegram-specific logic | All application services |
| `BookingProvider` (future) | Receive a durable booking request and report a normalized result | Weekly coordination state or webhook execution | Future booking worker only |

The bot should require that it is an administrator in chats using administrator-only authorization. Telegram guarantees `getChatMember` for other users only when the bot is a chat administrator. Privacy-enabled bots receive commands and replies, while an administrator bot receives all non-bot messages; this workflow should nevertheless rely on explicit commands and inline callbacks, not on incidental chat-message visibility. [Telegram Bot API — `getChatMember`](https://core.telegram.org/bots/api), [Telegram Bots FAQ — privacy mode](https://core.telegram.org/bots/faq) — **MEDIUM confidence**.

## State Machine and Invariants

### Aggregate boundary

`PlanningRun` is the concurrency and state-machine aggregate. Its natural key is `(chat_id, target_week_start_local)`, where `target_week_start_local` is the Monday date in the chat's configured IANA time zone. The active run, its selected candidates, all availability rounds, and the last rendered card revision change in one short PostgreSQL transaction. No Telegram request or browser automation runs inside that transaction.

Enforce the central rule in the database with a partial unique index for active states:

```sql
CREATE UNIQUE INDEX one_active_planning_run_per_chat_week
  ON planning_runs (chat_id, target_week_start_local)
  WHERE state IN ('CHOOSING_DATE', 'CHOOSING_TIME',
                  'CHOOSING_PARTICIPANTS', 'AWAITING_AVAILABILITY',
                  'READY_TO_BOOK');
```

Use foreign keys for references and unique constraints for business identities; PostgreSQL documents that compound unique constraints enforce uniqueness across the listed column set and that foreign keys preserve referential integrity. [PostgreSQL — constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — **MEDIUM confidence**.

### States and transitions

```text
no active run
  └─ startPlanning ─> CHOOSING_DATE
       └─ chooseDate ─> CHOOSING_TIME
            └─ chooseTime ─> CHOOSING_PARTICIPANTS
                 └─ publishAvailability(round n) ─> AWAITING_AVAILABILITY
                      ├─ all YES ─> READY_TO_BOOK
                      ├─ any NO ─> CHOOSING_DATE (invalidate round n; n + 1)
                      ├─ authorized cancel ─> CANCELLED
                      └─ authorized change date/time ─> CHOOSING_DATE (invalidate round n; n + 1)

READY_TO_BOOK ── cancel/change ─> CHOOSING_DATE
READY_TO_BOOK ── record manual booking ─> SCHEDULED
SCHEDULED ── authorized cancel/change ─> CHOOSING_DATE
```

`CANCELLED` and `SCHEDULED` are terminal for that run; retain them for history and for choosing the next target week. `READY_TO_BOOK` stays active because a later cancel/change must reopen a new availability round rather than create a competing run. When a negative answer occurs, atomically close the current `AvailabilityRound`, invalidate its callback revision, clear its responses by treating the round as immutable history, and return only the planning author to date selection. Never delete prior answers.

Every mutating command locks the `planning_runs` row (`SELECT ... FOR UPDATE`) and requires the caller's expected `state_revision`. PostgreSQL documents that row locks persist to transaction end and that transaction-level advisory locks release at transaction end; use the row lock as the normal aggregate guard, with a transaction-level advisory lock only for a cross-row creation race if needed. Keep transactions short and retry recognized serialization/deadlock failures. [PostgreSQL — explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — **MEDIUM confidence**.

### Target-week decision

At `startPlanning`, calculate the current local date and Monday in the chat time zone. If no rehearsal has occurred or is scheduled in that local calendar week, create/select the current-week run; otherwise target the following Monday. Persist the resulting target week and the time-zone snapshot on the run. Do not recompute this decision from UTC later, and do not let a later settings change redefine an existing run.

## Persistence Model

Use PostgreSQL with database migrations and `timestamptz` for instants. Keep civil schedule inputs separately: `local_date`, `local_time`, IANA `time_zone`, and `duration_minutes`; derive and store `starts_at_utc` for an agreed rehearsal. This preserves the intended Monday–Sunday week and lets historical runs remain interpretable after a chat changes time zone.

| Table / record | Essential data and constraints |
|---|---|
| `chats` | Telegram `chat_id` (unique), title, IANA `time_zone`, planner policy, default day/time, time bounds, duration, active flag, settings revision |
| `telegram_users` | Telegram `user_id` (unique), last known display name/username; keep Telegram identity separate from membership |
| `roster_memberships` | `chat_id`, `user_id`, active flag, display order; unique `(chat_id, user_id)`; roster is the source for eligible participants |
| `planning_runs` | Chat, target local Monday, state, author, settings/time-zone snapshot, `state_revision`, current round number, timestamps; partial unique active key as above |
| `rehearsals` | Immutable selected date/time/time-zone snapshot, UTC instant, duration, lifecycle (`PROPOSED`, `SCHEDULED`, `CANCELLED`, `OCCURRED`) and link to run |
| `availability_rounds` | Run, round number, selected slot snapshot, card message/chat IDs, card revision, status; unique `(planning_run_id, round_number)` |
| `round_participants` | Availability-round snapshot of the roster and display identity; unique `(round_id, user_id)`; do not use live roster for old rounds |
| `availability_responses` | Round participant, answer, answered timestamp; unique `(round_id, user_id)`; no updates after round closure |
| `inbound_updates` | Telegram `update_id` (unique), raw payload/audit metadata, accepted/processed timestamps and processing status |
| `jobs` / `outbox_messages` | Semantic idempotency key (unique), kind, payload, due time, status, lease owner/until, attempt count, delivered/failed timestamps |
| `reminder_deliveries` | Unique `(chat_id, planning_run_id, kind, local_date, configured_local_time)` to make each intended local reminder occur once |
| `booking_requests` (future) | Run/rehearsal, provider, immutable request payload, idempotency key (unique), status, audit/result reference |

Snapshots are intentional: a roster edit, changed default, or changed time zone affects the next action or next run, not who was allowed to answer in a published round. It also makes the visible custom card reproducible after a restart.

## Data Flow and Reliability

### Incoming updates and callbacks

1. Telegram posts an update to the sole HTTPS webhook. Verify the configured secret header before parsing; allow only `message` commands and `callback_query` initially.
2. In one short transaction, insert `inbound_updates(update_id, ...)` and a uniquely keyed `process-update:<update_id>` job. On unique conflict, return 2xx without reapplying the command. This is the durable restart boundary.
3. For a callback, make a best-effort empty `answerCallbackQuery` immediately so the client progress indicator clears; Telegram says clients show it until the method is called. The worker later publishes an authoritative card edit or a stale/unauthorized notice. [Telegram Bot API — callback queries](https://core.telegram.org/bots/api) — **MEDIUM confidence**.
4. A worker claims the job, reloads the aggregate with its row lock, authorizes the actor, validates state/version, commits the transition plus outbox entries, then marks the inbound event processed.
5. The outbox dispatcher sends the Telegram edit/message after commit. It records the resulting Telegram message ID and delivery result where available.

Inline keyboard `callback_data` is limited to 1–64 bytes. Use `cb:<opaque-token>` (or a compact signed token), not JSON or date/time/participant data. The token resolves to a stored action, run/round ID, expected `state_revision`, expiry, and allowed action; always compare the callback's chat/message/actor with the committed round. A callback from an old card or from the pre-replan round is rejected as stale and the current card is re-rendered. [Telegram Bot API — inline keyboards](https://core.telegram.org/bots/api) — **MEDIUM confidence**.

### Concurrency, retry, and idempotency rules

| Failure or race | Required behavior |
|---|---|
| Duplicate webhook/update | Unique `update_id` accepts the first copy only; later copies return 2xx. A raw event remains auditable. |
| Two users press availability buttons together | One transaction locks the run/round. The second reloads the resulting state; it either records a different participant answer or becomes stale if the first answer closed/replanned the round. |
| Planning start race | Database partial unique index is final authority. On conflict, load and show the existing run instead of creating another. |
| Retried worker after crash | The inbound event, job lease, state revision, and unique response/outbox keys make re-execution a no-op or a safe retry. Leases expire after a bounded interval so another worker resumes. |
| Callback replay / old message | Opaque token plus current round/card revision and actor eligibility reject it; answer callback with a short stale message and refresh the card. |
| Crash after domain commit, before Telegram send | The committed outbox is still pending and will be dispatched after restart. |
| Crash after Telegram accepted a send, before local acknowledgement | The system can guarantee one *intended* reminder with a unique semantic delivery key, but not mathematical exactly-once external delivery without a Telegram idempotency key. Mark ambiguity, use a reconciliation/observability path, and do not advertise exactly-once sends. |
| Telegram API rate/transient error | Retain job, increase attempts with bounded exponential backoff and jitter, and alert on a terminal failure. Do not recreate the planning state. |

Render availability cards from a persisted snapshot after each committed transition. Do not use the Telegram message as state; message edits can fail, messages can be deleted, and a worker can restart. Telegram supports editing bot messages, but the database remains authoritative. [Telegram Bot API — `editMessageText`](https://core.telegram.org/bots/api) — **MEDIUM confidence**.

### Scheduled jobs and time zones

The scheduler is a database-backed due-job loop running every minute, not per-chat `setTimeout`/in-memory cron. It claims due rows with a lease and dispatches idempotently. Generate jobs with immutable semantic keys:

| Job | When materialized | Guard before sending |
|---|---|---|
| `planning-start-reminder` | Each local day at 10:00, beginning Monday | Skip if a run for target week is active/terminally scheduled; unique local delivery key avoids duplicate firing |
| `availability-followup` | Each configured local reminder time while a round awaits answers | Recompute pending participants under the round lock; skip if none, stale, cancelled, or re-planned |
| `availability-card-render` | On every successful transition affecting status | Render only if expected card revision is still current |
| `ready-to-book-announcement` | On the all-yes transition | Unique `(run, round, kind)` outbox key |

Validate IANA zone names at settings write time. Evaluate recurring reminder times in the current chat zone, while keeping the scheduled local date/time in the idempotency key and storing the resolved UTC due instant. Define the DST policy now: for a nonexistent local time, run at the next valid instant; for a repeated local time, select the earlier offset and send once for that local date/time. Persist the policy and test it. Recompute future jobs after a time-zone/settings change; never mutate a history snapshot.

## Deployment and Operations

- Deploy a public HTTPS `web` process and one or more private `worker` processes from the same versioned image; both are stateless. Use managed PostgreSQL with encrypted backups, point-in-time recovery if available, migration-on-release, and connection pooling.
- Configure exactly one webhook URL and secret token. Monitor Telegram webhook health (`pending_update_count`, last error), inbound-update age, job lag, expired leases, outbox failures, and reminders skipped/sent.
- Make startup restart-safe: workers resume pending events and expired leases; the scheduler re-derives only missing future jobs from durable state. Do not drop pending Telegram updates during normal deploys.
- Keep the bot token and database credentials in a secret manager/environment injection, redact incoming raw payloads as needed, and restrict database access to application roles.
- Start with one web and one worker replica, then scale workers horizontally only after the row-lock/lease tests pass. Horizontal web replicas are safe because `update_id` deduplication is database-enforced.

## Future Playwright Booking Boundary

Automatic booking remains out of scope for this milestone. Preserve a clean seam now: `PlanningService` emits `BookingRequested` only after an explicit future action, and a `BookingProvider` interface returns `BOOKED`, `UNAVAILABLE`, `AUTH_REQUIRED`, `UNKNOWN_OUTCOME`, or `FAILED`. The coordinator must not import Playwright.

The later Playwright implementation runs in a separately deployed, single-concurrency worker with its own network permissions, secret-managed encrypted storage state, screenshot/trace retention policy, and booking audit trail. Playwright's documentation warns that authenticated storage state can contain cookies and headers capable of impersonating an account and must not be committed. [Playwright — authentication](https://playwright.dev/docs/auth) — **MEDIUM confidence**.

For a booking attempt, create one immutable `booking_request` with a unique idempotency key before browser activity. Before any retry, inspect the studio account/site for an existing matching booking. If a crash happens after the final submit and the result cannot be verified, stop in `UNKNOWN_OUTCOME` for human review rather than risk a duplicate booking. This preserves simple coordination now and isolates the much less reliable website integration later.

## Suggested Build Order

1. **Foundation and ingress:** migrations, chat/roster/settings repositories, webhook secret verification, `inbound_updates`, job leasing, outbox, structured logs, and a restart/duplicate-update test harness.
2. **Roster and authorization:** administrator-managed roster, planner policy, Telegram member verification, and settings including time zone validation.
3. **Planning aggregate:** target-week selection; date, time, and participant stages; partial unique active-run index; state-revision callback token tests.
4. **Availability workflow:** immutable participant snapshots, custom card renderer, responses, any-no replan, all-yes announcement, cancel/change paths.
5. **Reminder scheduler and operations:** local-time materialization, deduplicated reminder deliveries, DST tests, metrics, alerts, deployment runbook, and failure recovery tests.
6. **Future milestone only:** `BookingProvider` contract, isolated booking job/audit model, then a studio-specific Playwright adapter with human review of unknown outcomes.

## Anti-Patterns to Avoid

### Treating Telegram messages as the database

**What:** Infer state from the currently visible card or a message's buttons.  
**Why bad:** Edits, deletion, retries, and restarts make the chat transcript an unreliable source of truth.  
**Instead:** Commit authoritative state and an outbox transaction first; render messages as projections.

### In-memory state, timers, or mutexes

**What:** Hold the active poll, callback version, or reminder timetable only in process memory.  
**Why bad:** It fails on deploy/restart and cannot coordinate multiple replicas.  
**Instead:** Use PostgreSQL constraints, row locks, persisted jobs, and leases.

### Stateful or oversized callback payloads

**What:** Encode dates, participants, or permissions as JSON in `callback_data`.  
**Why bad:** Telegram limits this field to 64 bytes and old buttons can be replayed.  
**Instead:** Use an opaque, persisted, revision-bound token and authorize every click server-side.

### External calls inside a database transaction

**What:** Send Telegram messages or run Playwright while holding the planning-row lock.  
**Why bad:** Long locks increase contention and an external timeout creates ambiguous commit/send outcomes.  
**Instead:** Transactionally enqueue an outbox/booking request, then execute after commit.

### Global server-time cron

**What:** Schedule `10:00` using the container's time zone.  
**Why bad:** It breaks per-chat timing, week selection, and DST behavior.  
**Instead:** Persist IANA zones and local schedule intent, resolve due instants per chat, and deduplicate by local occurrence.

### Retrying an ambiguous studio-booking submit

**What:** Automatically repeat browser submission after a timeout/crash.  
**Why bad:** The first request may have created a real booking.  
**Instead:** Reconcile against the provider and escalate an unverifiable outcome for human decision.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---|---|---|---|
| Webhook handling | One web replica, dedupe table | Multiple stateless web replicas | Partition/retain inbound ledger; load-test Telegram concurrency |
| Workflow writes | Row lock per active run | Same aggregate lock pattern, indexed by chat/week | Partition workflow history by time/chat; keep transactions narrow |
| Reminders | Minute worker scanning indexed due jobs | Multiple workers with `SKIP LOCKED` leases | Dedicated scheduler/outbox partitions and rate-limit-aware dispatch |
| Telegram output | Sequential low-volume sends | Per-chat ordering plus global backoff | Durable rate-limit layer and observability, still projection-only |
| Booking | Not present | Isolated single-worker adapter | Separate provider service/account pools with explicit rate/risk controls |

## Sources

- [Telegram Bot API — updates, webhooks, callbacks, inline keyboards, message edits, membership](https://core.telegram.org/bots/api) — MEDIUM confidence (classification seam; current primary source verified).
- [Telegram Bots FAQ — update modes and privacy behavior](https://core.telegram.org/bots/faq) — MEDIUM confidence (classification seam; current primary source verified).
- [PostgreSQL — constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — MEDIUM confidence (classification seam; current primary source verified).
- [PostgreSQL — explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — MEDIUM confidence (classification seam; current primary sources verified).
- [Playwright — authentication and storage state](https://playwright.dev/docs/auth) — MEDIUM confidence (classification seam; current primary source verified).
