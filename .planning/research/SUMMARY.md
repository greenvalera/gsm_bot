# Project Research Summary

**Project:** GSMBot  
**Domain:** Stateful Telegram group workflow for weekly band-rehearsal coordination  
**Researched:** 2026-08-19  
**Confidence:** MEDIUM

## Executive Summary

GSMBot is a small-group, weekly scheduling workflow—not a generic calendar or polling product. The first release should guide a band from a single proposed date and time through a roster-scoped availability round to a clear “ready to book” outcome. Experts build this kind of bot as a durable, explicit state machine: PostgreSQL owns the workflow, roster snapshots, answers, and delivery records; Telegram cards are editable projections of committed state rather than the source of truth.

Build a modular TypeScript service on Node.js 24 LTS with grammY, PostgreSQL, Prisma, and pg-boss. For the initial single-band deployment, run exactly one always-on long-polling bot process with the scheduler in the same image; do not configure a webhook simultaneously. Retain durable inbound-update, outbox, and idempotency boundaries so the product can later move to a webhook receiver plus worker without changing the domain model. Use Docker, Compose, real-PostgreSQL integration tests, and a portable always-on host; Fly.io is a suitable initial host but not an architectural dependency.

The dominant risks are concurrency, duplicate delivery, time-zone mistakes, and Telegram authorization limits. Mitigate them before adding interaction polish: enforce one active run per chat and local ISO week in the database, use round-versioned immutable participant snapshots and opaque callback tokens, materialize reminders durably using IANA time zones, and treat every Telegram update/send as at-least-once. Keep the bot privacy-mode compatible, use the administrator-managed roster as the product authority, and never attempt automatic studio booking in this milestone.

## Key Findings

### Recommended Stack

Use a modular monolith with PostgreSQL as the only durable system of record. The research is decisive against Redis, in-memory session state, per-chat `setTimeout` jobs, native polls, and microservices for this scope. Prisma migrations, transactional constraints, pg-boss jobs, and an outbox provide the minimum reliable foundation for a long-lived group workflow.

**Core technologies:**

- **Node.js 24.19 LTS + TypeScript 7.0**: runtime and language — strict compiler settings reduce state-transition and Telegram-payload errors.
- **grammY 1.45 + `@grammyjs/runner` 2.0**: Telegram transport — use commands and inline callbacks only; sequence handling by chat/round.
- **PostgreSQL 18.4 + Prisma 7.9**: authoritative state and migrations — constraints and short transactions enforce workflow invariants.
- **pg-boss 12.27**: durable reminders/outbox retries — avoids adding Redis for a low-volume scheduler.
- **Zod 4.4 + Pino 10.3**: input/configuration validation and redacted structured logs.
- **Docker/Compose, Vitest, Testcontainers, GitHub Actions**: reproducible local/CI environment and real-PostgreSQL migration/reliability tests.

### Expected Features

The MVP is a complete coordination loop, not merely an availability poll. Persist chat settings and an administrator-maintained roster; compute the correct Monday–Sunday target week in the chat’s IANA time zone; then offer guided date, time, and participant selection before publishing a custom availability card. The previous rehearsal supplies convenient defaults but never substitutes for fresh availability.

**Must have (table stakes):**

- Persistent roster, per-chat policy/settings, and a verified time zone.
- One authoritative weekly workflow with Monday/daily start nudges until planning begins.
- Guided full-week date selection, valid hourly slots, and participant selection from the roster.
- Custom participant-only availability card with live yes/no/pending state and pending-only follow-ups.
- Negative-response replanning with a new round; all-yes ready-to-book announcement; authorized cancellation/change and `/status` recovery.

**Should have (differentiators):**

- Previous-rehearsal day/time/participant defaults and explicit planning ownership.
- Visible stale-action feedback, a safe authorized handoff if the planner becomes unavailable, and readable history/audit context.
- Reminder quietness: only pending participants are mentioned and obsolete reminders are suppressed.

**Defer (v2+):**

- Automatic studio booking and any Playwright integration.
- Calendar/free-busy sync, external account linking, direct-message reminders as a guarantee, multi-option optimization, and native Telegram polls.

### Architecture Approach

The primary aggregate is `PlanningRun`, keyed by `(chat_id, target_week_start_local)`. Its state progression is `CHOOSING_DATE → CHOOSING_TIME → CHOOSING_PARTICIPANTS → AWAITING_AVAILABILITY → READY_TO_BOOK → SCHEDULED`, with cancellation and supersession retained as history. Every state mutation uses short database transactions, row locking, a state revision, immutable availability-round/participant snapshots, and uniquely keyed outbox work. A single long-poll process is the initial deployment profile; the architecture must nevertheless retain a durable update ledger and worker-like boundaries so its delivery semantics stay safe and a later webhook deployment is straightforward.

**Major components:**

1. **Telegram adapter and callback protocol** — receives commands/callbacks, acknowledges callbacks promptly, validates compact opaque tokens, and maps updates into typed commands.
2. **Authorization, roster, and settings services** — enforce per-chat planner policy and current admin checks; own roster, IANA zone, defaults, and configuration revisions.
3. **Planning and availability services** — own target-week selection, aggregate transitions, round snapshots, response validation, replanning, cancellation, and readiness.
4. **PostgreSQL repositories and migrations** — enforce unique active runs, unique responses, foreign keys, locks, history, inbound-update deduplication, and audit records.
5. **Scheduler and outbox dispatcher** — reconcile local-time reminders, claim durable jobs, pace Telegram sends, retry safely, and render cards after commit.

### Critical Pitfalls

1. **In-memory or message-derived workflow state** — prevent it with a database-enforced active-run invariant, explicit states, row locks, round versions, and immutable snapshots.
2. **Assuming exactly-once Telegram delivery** — deduplicate update IDs; use uniquely keyed outbox/reminder records, leases, retry/backoff, and restart reconciliation. Never promise mathematical exactly-once external sends.
3. **UTC/server-time scheduling** — require IANA zones, local ISO-week calculations, explicit DST behavior, and DST/week-boundary tests.
4. **Trusting callbacks or cached permissions** — keep callback data opaque and under 64 bytes; authorize actor, chat, message, state, and version server-side on every action.
5. **Assuming Telegram can supply a complete roster** — use an administrator-managed roster, privacy-mode-safe commands/callbacks, capability checks, and explicit handling when a member cannot be verified.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Durable Foundation and Operational Contract

**Rationale:** Every visible feature depends on correct time, identity, migration, and delivery boundaries. Starting with a poll UI would bake in the failure modes the research identifies as critical.

**Delivers:** Node/TypeScript service, Docker/Compose, Prisma schema/migrations, PostgreSQL connection, typed configuration, structured redacted logging, bot command shell, long-poll lifecycle, health checks, inbound update deduplication, outbox/job primitives, and real-PostgreSQL tests.

**Addresses:** Durable workflow, reliable start/follow-up scheduling prerequisites, recoverable status.

**Avoids:** In-memory state/timers, duplicate updates, leaked secrets, accidental webhook-plus-polling operation, and untested migrations.

### Phase 2: Chat Onboarding, Settings, Roster, and Authorization

**Rationale:** The planner policy, participant set, and local calendar rules must exist before a valid planning run can be created.

**Delivers:** Admin capability checks; roster management; start policy; IANA time-zone validation; default day/time, slot boundaries/duration, and reminder-time configuration; settings/audit revisions.

**Addresses:** Persistent roster, per-chat defaults, permission-aware starts, calendar correctness.

**Avoids:** Reliance on Telegram member enumeration, stale administrator roles, invalid time configurations, and server-time/DST errors.

### Phase 3: Week-Aware Planning State Machine

**Rationale:** This phase establishes the central aggregate and all decision inputs before users are asked for availability.

**Delivers:** Current-versus-next target-week computation, one-active-run database constraint, guided Monday–Sunday date selection, valid hourly time choices, prior-rehearsal highlights/defaults, roster-based participant selection, state-revision/opaque callback actions, and `/status` recovery.

**Addresses:** One weekly workflow, complete week/date UX, time-slot selection, participant selection, previous-rehearsal continuity.

**Avoids:** Duplicate live plans, target-week ambiguity, oversized/stale callbacks, and mutation of existing live state.

### Phase 4: Availability, Replanning, and Outcome Workflow

**Rationale:** Once a valid immutable proposal exists, implement the user-facing coordination value as a full closed loop.

**Delivers:** Custom availability card, participant-only one-tap responses, live response rendering, immutable round snapshots, any-no invalidation and planner-only replan, all-yes ready-to-book announcement, record-manual-booking, authorized change/cancel, and terminal history.

**Addresses:** Custom availability, visible completion, negative-response replanning, ready-to-book outcome, cancellation/change.

**Avoids:** Counting old answers, unauthorized votes, stale-card mutations, and incorrectly claiming a studio is booked.

### Phase 5: Durable Reminders, Reliability, and Production Readiness

**Rationale:** Automatic reminders should be enabled only after their domain guards, time rules, and recovery behavior are testable against complete workflow states.

**Delivers:** pg-boss reconciliation, local-time reminder materialization, pending-only follow-ups, idempotency keys, leases/retries/backoff, per-chat rate limiting, card/outbox recovery, CI, deployment configuration, monitoring, token rotation and incident runbooks.

**Addresses:** Monday/daily planning nudges, configurable follow-ups, response-aware reminders, operations diagnostics.

**Avoids:** Reminder spam, missed sends after deploy, 429 retry storms, DST duplicate/missed reminders, secret leakage, and silent bot-removal failures.

### Phase 6: Future Booking Integration (Separate Milestone)

**Rationale:** Website booking introduces credentials, ambiguous external side effects, and a provider-specific reliability problem; it must not delay validation of coordination.

**Delivers:** Only after the coordination MVP is validated: `BookingProvider` contract, durable booking request/audit model, isolated single-concurrency Playwright adapter, and human review for unknown outcomes.

**Avoids:** Coupling Playwright to the planning aggregate, insecure browser storage, and duplicate bookings after ambiguous submission.

### Phase Ordering Rationale

- Phase 1 makes subsequent features restart-safe; Phases 2–4 build the workflow in dependency order from eligibility to proposal to responses.
- Phase 5 is deliberately after the end-to-end availability loop so each due job can re-check real terminal, superseded, and pending states before sending.
- The roadmap resolves the research disagreement on delivery mode: use exactly one long-polling bot process initially, while preserving the update ledger/outbox needed for a later webhook receiver. Do not implement both modes in the MVP.
- Booking is a later milestone because it changes the risk profile from coordination to irreversible vendor interaction.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 1:** Confirm grammY/pg-boss integration and operational behavior in a thin implementation spike; specifically verify long-poll runner shutdown/restart and durable job recovery.
- **Phase 2:** Decide the roster enrolment and Telegram administrator/capability UX through a real test-group matrix, including privacy mode and member-inaccessible cases.
- **Phase 5:** Research the chosen host’s production health/secret/backup offerings and test time-zone/DST/rate-limit behavior against the selected libraries.
- **Phase 6:** Requires separate provider-specific research, legal/terms review, secure browser-state design, and unknown-outcome handling.

Phases with standard patterns (skip research-phase):

- **Phase 3:** PostgreSQL aggregate constraint/row-lock/state-revision patterns and guided inline selection are well documented; focus planning on acceptance criteria and tests.
- **Phase 4:** The custom-card/immutable-round approach is specified clearly enough to plan directly once Phase 3 contracts exist.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core versions and Telegram/Prisma constraints were verified from primary documentation or registries; pg-boss operational fit and host choice remain MEDIUM. |
| Features | HIGH | MVP/table-stakes are grounded directly in active project requirements; differentiator policy details are MEDIUM. |
| Architecture | MEDIUM | Durable aggregate/outbox design is strongly supported, but source files disagree on initial ingress deployment. This summary explicitly chooses long polling for the MVP. |
| Pitfalls | MEDIUM | Telegram, PostgreSQL, IANA, and OWASP sources support the risks; production behavior still needs integration tests on the selected host. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Ingress and hosting decision:** Long polling is the MVP recommendation; confirm the production host can keep one bot process continuously alive. If webhook hosting is selected instead, plan a dedicated authenticated receiver/worker split and do not run polling.
- **Time library and DST policy:** Select a maintained TypeScript time library and codify handling for nonexistent and repeated local times before Phase 3 implementation.
- **Roster lifecycle policy:** Define how people are enrolled, how departure/unverifiable membership affects a live round, and who may take over an abandoned replanning task.
- **Ready-to-book versus scheduled:** Clarify the precise authorized action and UI that records a manual booking, since automatic booking is out of scope but current-week targeting depends on scheduled/occurred status.
- **Retention/privacy policy:** Specify retention/deletion rules for roster and historical availability records, backup access controls, and operator/audit access.
- **Delivery uncertainty:** Define user-visible behavior and operator alerts when Telegram accepts a message but local acknowledgement is lost; no design can provide strict exactly-once external sends.

## Sources

### Primary (HIGH confidence)

- [Telegram Bot API](https://core.telegram.org/bots/api) — callbacks, inline keyboards, update modes, message edits, administrator/member APIs, and webhook behavior.
- [Telegram Bot FAQ and Features](https://core.telegram.org/bots/faq) — privacy mode and delivery limits.
- [PostgreSQL documentation](https://www.postgresql.org/docs/current/) — constraints, row locking, transactions, and isolation.
- [Prisma documentation](https://www.prisma.io/docs/orm/) — migrations, transactions, and production deployment workflow.
- [IANA time-zone database](https://www.iana.org/time-zones/tz-link) — time-zone and DST authority.
- [OWASP cheat sheets](https://cheatsheetseries.owasp.org/) — authorization, secret management, and logging controls.

### Secondary (MEDIUM confidence)

- [grammY documentation](https://grammy.dev/) — runner, session, and bot-framework behavior.
- [pg-boss documentation](https://github.com/timgit/pg-boss) — PostgreSQL-backed delayed jobs, retries, and job claiming.
- [Fly.io process groups](https://fly.io/docs/launch/processes/) — portable initial always-on deployment option.
- [Playwright authentication guidance](https://playwright.dev/docs/auth) — future booking boundary and storage-state risks.

---
*Research completed: 2026-08-19*  
*Ready for roadmap: yes*
