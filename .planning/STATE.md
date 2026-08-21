---
gsd_state_version: 1.0
milestone: v1.0
current_phase: 01
current_phase_name: chat-readiness
status: in_progress
stopped_at: Completed 01-11-PLAN.md
last_updated: "2026-08-21T08:36:34.994Z"
last_activity: 2026-08-20
last_activity_desc: "Plan 01-04 completed: the tracer now has a non-root Docker runtime, Compose migration gate, and retained geo-tz boundary data."
state_head: 6e2fac71a999bc71bb45be4626e862406c5c13ec
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 15
  completed_plans: 12
milestone_name: milestone
total_plans_in_phase: 15
current_plan: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-19)

**Core value:** The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.
**Current focus:** Phase 01 — chat-readiness

## Current Position

Phase: 01 (chat-readiness) — IN PROGRESS
Plan: 12 of 15
Status: Ready to execute
Last activity: 2026-08-20 — Plan 01-04 completed with a non-root Docker runtime, gated migrations, and retained geo-tz boundary data.

Progress: [███████░░░] 73%

## Performance Metrics

**Velocity:**

- Total plans completed: 5
- Average duration: 17m 40s
- Total execution time: 1h 28m 21s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 5 | 1h 28m 21s | 17m 40s |

**Recent Trend:**

- Last 5 plans: 01-01, 01-15, 01-02, 01-03, 01-04
- Trend: The migrated tracer now has a reproducible non-root Docker runtime and Compose startup gate

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 9m 21s | 1 tasks | 1 files |
| Phase 01 P15 | 13min | 2 tasks | 2 files |
| Phase 01 P02 | 38 min | 1 tasks | 10 files |
| Phase 01 P03 | 8 min | 1 tasks | 9 files |
| Phase 01 P04 | 20 min | 1 tasks | 6 files |
| Phase 01 P05 | 10m 11s | 1 tasks | 7 files |
| Phase 01 P06 | 9 min | 1 tasks | 8 files |
| Phase 01 P07 | 8m | 1 tasks | 8 files |
| Phase 01 P08 | 14 min | 1 tasks | 13 files |
| Phase 01 P09 | 9 min | 2 tasks | 10 files |
| Phase 01 P10 | 5 min | 1 tasks | 8 files |
| Phase 01 P11 | 12 min | 1 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Current roadmap decisions:

- Use vertical MVP slices; reliability work is embedded in the capability that makes it observable.
- Automatic studio booking is deferred to a later milestone and is not part of the active v1 roadmap.
- Start with chat readiness, then a week-aware proposal, availability, lifecycle recovery, and reliable reminders.
- [Phase 01]: Rejected tz-lookup@6.1.25; geo-tz@8.1.8 requires a fresh audit and separate human approval before any installation.
- [Phase 01]: Approved exact Phase 1 roots including geo-tz@8.1.8; require explicit candidate selection and Docker data retention.
- [Phase 01]: tz-lookup@6.1.25 remains rejected and must not be installed or substituted.
- [Phase 01]: Use a migration-first Prisma 7 PostgreSQL tracer with actor-bound setup drafts and opaque callback actions.
- [Phase 01]: Protected callbacks acknowledge before a live role lookup; unavailable membership evidence denies access fail-closed.
- [Phase 01]: Use explicit APP_MODE values instead of inferring test or smoke behavior from NODE_ENV.
- [Phase ?]: Use separate migration and production-dependency Docker stages so migrations retain Prisma CLI while the bot image omits development dependencies.
- [Phase ?]: Keep geo-tz in node_modules and validate geo-tz/dist/find-now against a known coordinate before the image can pass.
- [Phase ?]: Inject bot and database secrets with Compose environment interpolation; no credential is committed.
- [Phase ?]: Use geo-tz behind TimezoneResolver and require explicit candidate confirmation.
- [Phase ?]: Reuse existing SetupDraft and CallbackAction schema fields for candidate selection; no Prisma migration.
- [Phase ?]: Use strict 24-hour minute-of-day values for every draft schedule and reminder time.
- [Phase ?]: Keep setup progression schema-neutral by deriving it from validated draft fields and storing only a transient reminder-entry sentinel.
- [Phase ?]: Save configuration atomically promotes a complete owner-bound draft after a fresh administrator check and expected-revision validation.
- [Phase ?]: Consumed save confirmations return Already applied. without another configuration mutation.
- [Phase ?]: Use actor-bound SettingsEditDraft records with expected-revision transactions for individual settings changes.
- [Phase ?]: Planning access always permits current Telegram administrators; policies only broaden non-admin access.
- [Phase ?]: Use one SettingsEditDraft field plus replacement payload for every editable setting; no candidate-array schema.
- [Phase ?]: Render settings only from a complete committed read; failures use generic safe copy.
- [Phase ?]: Use reply-anchored Telegram identity and one soft-active membership per chat/user; render only safe labels.
- [Phase 01]: Roster removal tokens are random v1:<uuid> values; initiator, chat, target membership, expiry, and consumption state live only in the server-side CallbackAction row.
- [Phase 01]: Roster removal is a soft deactivation retaining identity and history; duplicate or concurrent confirmations return Already applied. with no second transition.

### Pending Todos

None yet.

### Blockers/Concerns

- Confirm the production host can continuously run the single long-polling bot process before deployment planning.
- Select and document the TypeScript time-library DST policy during planning of the week-aware proposal.
- Later Docker work must retain `geo-tz` runtime data and the exact approved lockfile.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260819-o9f | Ensure bundled Node.js is always on PATH for Codex sessions | 2026-08-19 | b9a576f | [260819-o9f-ensure-bundled-node-js-is-always-on-path](./quick/260819-o9f-ensure-bundled-node-js-is-always-on-path/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Automatic booking | Provider-specific studio booking with browser automation | Deferred to a later milestone | 2026-08-19 |

## Session Continuity

Last session: 2026-08-21T08:36:34.977Z
Stopped at: Completed 01-11-PLAN.md
Resume file: None
