# Walking Skeleton — GSMBot

**Phase:** 1
**Generated:** 2026-08-19

## Capability Proven End-to-End

A current Telegram chat administrator can send `/setup`, create or resume a durable setup draft in PostgreSQL, and receive the authoritative setup prompt in the group.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime and language | Node.js 24 LTS with strict TypeScript | Matches the project stack and keeps Telegram update, database, and workflow contracts explicit. |
| Telegram framework | grammY with `@grammyjs/runner` long polling | Provides TypeScript-first command/callback adapters and chat-key sequentialization while PostgreSQL remains the correctness boundary. |
| Data layer | PostgreSQL 18 with Prisma 7, `@prisma/adapter-pg`, and committed migrations | Durable drafts, transactions, revisions, and uniqueness are required across process restarts. |
| Authorization | Live Telegram `getChatMember` revalidation at every protected command/callback boundary | Stored roles and earlier successful checks cannot authorize a later protected action. |
| Workflow state | Active configuration separated from actor-bound, expiring PostgreSQL drafts and opaque callback actions | Supports D-02, D-03, D-10, and D-14 without treating grammY memory sessions as authoritative. |
| Timezone resolution | Human-approved offline coordinate-to-IANA adapter behind `TimezoneResolver`, followed by explicit administrator confirmation | Keeps coordinates local and makes the confirmed IANA identifier authoritative per D-09. |
| Development deployment | Multi-stage Docker image plus Docker Compose for the bot and PostgreSQL | Gives Codex and Claude Code the same reproducible full-stack command while keeping the image portable. |
| Production shape | One long-polling bot process; Docker image remains provider-portable | Avoids overlapping pollers and does not lock the application to a single host. |
| Directory layout | `src/app`, `src/telegram`, `src/domain/{auth,chat,roster}`, `src/infrastructure/{db,time}`, `src/shared`, and `tests/{unit,integration}` | Mirrors the researched responsibility map and keeps Telegram projection, domain policy, and persistence separate. |

## Stack Touched in Phase 1

- [ ] Project scaffold (Plans 01-01–01-03): audited package scripts, pinned Prettier formatting checks, strict TypeScript, Vitest, and repeatable checks
- [ ] Routing (Plans 01-02 and 01-13): real `/setup` grammY tracer plus one final versioned command/callback dispatch boundary
- [ ] Database (Plans 01-02, 01-07, 01-08, and 01-10): committed Prisma migrations plus real setup/settings/roster writes and restart reads
- [ ] Telegram UI (Plans 01-05–01-13): group command/callback interaction wired to durable setup, settings, and roster services
- [ ] Deployment (Plans 01-04 and 01-14): `docker compose up --build bot` plus CI/image verification against a healthy migrated PostgreSQL service

## Out of Scope (Deferred to Later Slices)

- Creating or taking over a weekly rehearsal proposal (Phase 2)
- Date, time-slot, and participant selection for a target calendar week (Phase 2)
- Availability responses and ready-to-book decisions (Phase 3)
- Replanning, booking-state changes, cancellation, and completion (Phase 4)
- Durable scheduled reminders and pg-boss worker behavior (Phase 5)
- Automatic studio booking (later milestone)

## Subsequent Slice Plan

Each later phase adds one vertical slice without changing the skeleton's durable-state, authorization-boundary, or Telegram-native interaction decisions:

- Phase 2: an authorized planner creates and recovers one week-aware proposal.
- Phase 3: selected participants answer availability and reach a ready-to-book result.
- Phase 4: the group safely replans and manages the rehearsal lifecycle.
- Phase 5: durable state-aware reminders prompt only the currently relevant people.
