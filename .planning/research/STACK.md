# Technology Stack

**Project:** GSMBot  
**Researched:** 2026-08-19  
**Overall confidence:** MEDIUM — package versions were verified from the npm registry and critical platform behaviour against official documentation; deployment-provider choice remains a product/operations decision.

## Recommendation

Build a single long-lived **Node.js 24 LTS / TypeScript** service using **grammY**, **PostgreSQL**, **Prisma**, and **pg-boss**. It is the smallest production-grade architecture that preserves rehearsal state, processes due reminders after restarts, and avoids introducing Redis only to schedule a few recurring tasks. Package everything in Docker; develop against Docker Compose and deploy the identical image to an always-on worker platform (recommendation: Fly.io with exactly one bot process for long polling).

Use PostgreSQL as the sole source of truth. It owns chats, the administrator-managed roster, configuration, planning rounds, availability answers, sent-message identifiers, and an outbox/audit record. The Telegram card is a projection of that state, never the state itself.

## Recommended Stack

### Core Framework

| Technology | Verified version | Purpose | Why |
|---|---:|---|---|
| Node.js LTS | 24.19.0 | Runtime | Current LTS line; use `node:24.19-bookworm-slim` (or a patched 24.x image) and declare `>=24.19 <25` in `engines`. It gives both Codex and Claude Code a mainstream TypeScript toolchain. |
| TypeScript | 7.0.2 | Application language | Strict types make Telegram update handling and workflow state transitions safer and are especially practical for agent-assisted implementation. Enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. |
| grammY | 1.45.1 | Telegram Bot API framework | TypeScript-first, composable middleware, inline keyboards, session adapters, and official runner support. Use it for transport only; keep durable business state in PostgreSQL. |
| `@grammyjs/runner` | 2.0.3 | Long-poll update runner | Supports bounded concurrent handling. Sequentialize by `chat.id` (and by a planning-round key when appropriate) so two button presses cannot race. It still runs as exactly one polling process. |
| Zod | 4.4.3 | Configuration and payload validation | Validate environment variables at boot and decode every callback payload before it reaches the domain layer. |
| Pino | 10.3.1 | Structured logs | Emit JSON logs with chat/round/job IDs and Telegram update IDs; redact bot tokens and personal data. |

### Database and Durable Scheduling

| Technology | Verified version | Purpose | Why |
|---|---:|---|---|
| PostgreSQL | 18.4 | Primary database | Relational transactions and unique constraints directly protect the one-active-round-per-chat/week rule and the availability state machine. The current supported release has maintenance through November 2030. Store timestamps as `timestamptz`, chat/user identifiers as `bigint`, and each chat's IANA timezone separately. |
| Prisma ORM + Client | 7.9.1 | Typed data access and schema migrations | Prisma provides a readable schema, generated TypeScript client, transactions, compound unique constraints, and a committed migration history. Use `@prisma/adapter-pg` 7.9.1 with `pg` 8.23.0 for the PostgreSQL driver. |
| pg-boss | 12.27.0 | Durable deferred jobs and retries | PostgreSQL-backed queue/scheduler avoids Redis while giving deferred jobs, cron schedules, retries, dead-letter queues, and multi-instance-safe job claiming. It requires Node >=22.12 and PostgreSQL >=13, so the recommended runtime/database satisfy it. |

### Infrastructure and Deployment

| Technology | Version | Purpose | Why |
|---|---:|---|---|
| Docker (multi-stage Dockerfile) | Current stable Docker Engine | Reproducible build/runtime | The same image can run locally, in CI, and in production from either agent runtime. Do not make local host tooling a prerequisite. |
| Docker Compose | Compose Specification | Local dependencies | Start PostgreSQL 18.4 and the bot with explicit health checks and a named development volume. Keep production secrets out of Compose files. |
| Fly.io Machine process | Current platform | Initial production host | A low-operations always-on worker host that deploys Docker images and supports explicit process groups. Run one `bot` Machine only while using long polling; use managed PostgreSQL outside the bot VM. The image remains portable to Render, Railway, ECS, or a VPS. |
| GitHub Actions | Current hosted runner | CI | Run formatting, type checks, unit tests, a temporary-PostgreSQL migration test, and container build on each pull request. |

### Testing

| Library | Verified version | Purpose | When to use |
|---|---:|---|---|
| Vitest | 4.1.11 | Unit and integration test runner | Test domain services and handlers quickly with mocked Telegram API calls and deterministic clocks. |
| Testcontainers | 12.1.0 | Disposable PostgreSQL integration database | Run Prisma migrations and repository/queue integration tests against real PostgreSQL in CI and local Docker-capable environments. |

## Telegram Design Constraints That Shape the Stack

- **Keep an application roster.** Telegram does not provide a historical participant list. `getChatMember` is only guaranteed for other users when the bot is a chat administrator. Persist the administrator-curated band roster and each prior round's selected participants; refresh authorization at the action boundary.
- **Use custom inline cards, as specified.** `callback_data` is limited to **1–64 bytes**. Send compact, versioned opaque data such as `v1:a:<round-id>:yes`; never serialize names, dates, or authorization claims into it. Look up and authorize the action from PostgreSQL.
- **Acknowledge every callback immediately.** Call `answerCallbackQuery` before or alongside the durable action so Telegram stops showing the client progress indicator. Handle stale/double-click callbacks as idempotent no-ops with a short notification.
- **Privacy mode can stay enabled.** Commands, callbacks from the bot's message, and replies to its messages are sufficient for this workflow. Do not disable privacy mode or require the bot to observe all chat conversation. A bot administrator receives all group messages, but that additional access is not needed.
- **Treat updates as untrusted and unordered.** Persist `chat_id`, `message_id`, and round version; authorize callback user IDs against the selected participant set; use a transaction plus constraints for every transition. Telegram IDs are safe in JavaScript numbers today but use database `bigint` and TypeScript `bigint` at the repository boundary to avoid accidental precision regressions.

## Scheduling Design

Do not create one in-memory cron task per chat. Configure pg-boss with one periodic `reconcile-due-reminders` job (for example, every five minutes) and calculate due work from each chat's timezone/settings in PostgreSQL. The reconciler creates a unique outbox/job row for every planned send, then pg-boss delivers it with retry/backoff. This design survives restarts and setting edits.

Use three job classes:

1. **Reconcile planning reminders:** Monday 10:00 and daily 10:00 until a round starts.
2. **Reconcile availability reminders:** evaluate configured daily times (default 10:00/16:00) and enqueue only non-responder mentions.
3. **Refresh card / announce outcome:** triggered after a transaction changes a round, rather than doing network I/O inside the transaction.

Every outgoing Telegram action needs an idempotency key such as `(round_id, delivery_kind, intended_at)`. A unique constraint and an outbox status (`pending`, `sending`, `sent`, `failed`) prevent duplicate reminders when the worker retries or deploys overlap. The job handler must remain idempotent even though pg-boss uses robust job claiming: a worker may fail after Telegram accepts a message but before the local completion acknowledgement.

## Migration Strategy

1. Treat `prisma/schema.prisma` and generated migration directories as reviewed source code. Create each local migration with `prisma migrate dev --name <meaningful_name>`; never use `prisma db push` against shared or production data.
2. In CI, start an empty PostgreSQL 18.4 instance, run `prisma migrate deploy`, then execute integration tests. This proves a fresh deploy and catches migration ordering errors.
3. In production, run `prisma migrate deploy` exactly once as a release/pre-deploy job before the bot starts. Do not let every application replica migrate on boot. Back up the database first and alert on a failed migration.
4. Use expand/migrate/contract changes for live data: add nullable columns/tables and dual-read/write first; backfill with an idempotent job; switch reads; remove legacy data only in a later release. Never combine a destructive schema change with the first code that depends on it.
5. Let pg-boss initialise/upgrade only its own dedicated `pgboss` schema; keep application tables in `public` (or an `app` schema). Include a version-upgrade integration test and do not edit pg-boss tables manually.
6. Model the core invariants in PostgreSQL: at minimum a compound uniqueness constraint for `(chat_id, target_week)` and unique availability answer `(round_id, participant_id)`. Catch unique-conflict errors and re-read state rather than trusting an ORM upsert to be race-free.

## Operational Shape

```text
Telegram updates --long polling--> grammY + per-chat sequentialization
                                      |
                                      v
                         domain services / Prisma transactions
                                      |
                         PostgreSQL 18.4 (app state + outbox)
                                      |
                                      v
                           pg-boss delayed/retryable jobs
                                      |
                                      v
                            Telegram send/edit API calls
```

For the first release, run grammY and the pg-boss worker in **one long-lived `bot` process**. It is both simpler and safer with long polling; configure the host to keep exactly one replica. Add a small authenticated or private health endpoint only for liveness/readiness if the host requires one. A future webhook deployment can split stateless update receivers from workers and scale the receiver tier, but that is not warranted for one band's traffic.

## Alternatives Considered

| Category | Recommended | Alternative | Why not now |
|---|---|---|---|
| Bot framework | grammY | Telegraf | Telegraf remains usable, but grammY has a particularly strong TypeScript API and official runner/plugin documentation. Starting with it avoids a framework migration. |
| Background jobs | pg-boss on PostgreSQL | BullMQ 6.1.2 + Redis | BullMQ is excellent when Redis already exists or high-throughput queues need it. This bot has a tiny workload; Redis adds a second durable service, backup path, credentials, and monitoring burden without product value. |
| Background jobs | pg-boss | `node-cron`, `node-schedule`, `setTimeout` | Process memory schedules disappear on restarts, do not coordinate replicas, and cannot provide retry/audit semantics. They will produce missed or duplicate rehearsal reminders. |
| Persistence | PostgreSQL + Prisma | SQLite / JSON files / in-memory session | They are poor fits for multi-user state, production backups, deployment durability, and transactional uniqueness. SQLite may be suitable only for a disposable local prototype. |
| Workflow state | PostgreSQL round records | grammY conversations/session as source of truth | Conversations replay execution and session state is not the durable, auditable state machine this group workflow needs. Use conversations only for short admin input wizards if later ergonomics justify it. |
| Delivery model | One long-poll worker | Serverless-only polling | Serverless sleep/timeout behaviour and overlapping invocations are mismatched to a continuous update listener and delayed job worker. |
| Telegram UI | Custom inline availability card | Native Telegram Poll | Native polls cannot enforce the roster, expose the required participant status, or target outstanding respondents. |

## Installation

```bash
# Runtime
npm install grammy@1.45.1 @grammyjs/runner@2.0.3 \
  @prisma/client@7.9.1 @prisma/adapter-pg@7.9.1 pg@8.23.0 \
  pg-boss@12.27.0 pino@10.3.1 zod@4.4.3

# Development and verification
npm install -D prisma@7.9.1 typescript@7.0.2 tsx@4.23.12 \
  vitest@4.1.11 testcontainers@12.1.0 @types/node@26.2.0 \
  eslint@10.8.1
```

Pin the generated lockfile in git. Update dependencies in small, tested PRs; run migrations/integration tests after every Prisma, pg-boss, PostgreSQL, or Telegram framework upgrade.

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Telegram constraints | HIGH | Verified against the current official Bot API, Bot Features, and FAQ. |
| Node/PostgreSQL/package versions | HIGH | Node/PostgreSQL versions verified against official release pages; npm package versions verified from the registry on 2026-08-19. |
| Prisma migration approach | HIGH | Official Prisma documentation confirms Migrate, compound uniqueness, transaction, and deployment workflows. |
| pg-boss recommendation | MEDIUM | Current primary pg-boss documentation verifies PostgreSQL-backed durable queues, schedules, retries, and Node/PostgreSQL requirements. The final operational fit should be confirmed in a first implementation spike. |
| Fly.io hosting choice | MEDIUM | Official docs confirm Docker/process-group support; the provider is intentionally replaceable and should be selected against budget/region preferences. |

## Sources

- [Telegram Bot API](https://core.telegram.org/bots/api) — callback limitations, acknowledgement requirement, chat-member APIs. Confidence: HIGH.
- [Telegram Bot Features](https://core.telegram.org/bots/features) and [Bot FAQ](https://core.telegram.org/bots/faq) — privacy mode and test-bot guidance. Confidence: HIGH.
- [grammY runner](https://grammy.dev/plugins/runner), [sessions](https://grammy.dev/plugins/session.html), and [conversations](https://grammy.dev/plugins/conversations). Confidence: HIGH.
- [Prisma ORM documentation](https://www.prisma.io/docs/orm/v6), [transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions), [database features](https://www.prisma.io/docs/orm/reference/database-features), and [production migration workflow](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/patching-and-hotfixing). Confidence: HIGH.
- [pg-boss repository/documentation](https://github.com/timgit/pg-boss) and [queue API](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md). Confidence: MEDIUM.
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers). Confidence: MEDIUM.
- [Node.js releases](https://nodejs.org/en/download/current), [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/), and [PostgreSQL 18.4 documentation](https://www.postgresql.org/docs/18/index.html). Confidence: HIGH.
- [Fly.io process groups](https://fly.io/docs/launch/processes/) and [deployment](https://fly.io/docs/launch/deploy/). Confidence: MEDIUM.
- npm registry `npm view` verification on 2026-08-19 for all listed npm package versions. Confidence: MEDIUM (registry metadata was directly queried; the research confidence seam classifies npm as LOW absent an additional provider assertion).
