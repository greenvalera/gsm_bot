---
gsd_state_version: 1.0
milestone: v1.0
current_phase: 04
current_phase_name: Replanning and Rehearsal Lifecycle
status: planned
stopped_at: Phase 4 planned — 5 plans ready to execute
last_updated: "2026-09-08T21:18:51.781Z"
last_activity: 2026-09-09
last_activity_desc: Phase 04 planning complete
state_head: 4d0a5d63a00618f5c9d26b046367a95ea7df4a52
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 55
  completed_plans: 50
milestone_name: milestone
total_plans_in_phase: 5
current_plan: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-08)

**Core value:** The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.
**Current focus:** Phase 04 — Replanning and Rehearsal Lifecycle

## Current Position

Phase: 04 (Replanning and Rehearsal Lifecycle) — READY TO EXECUTE
Plan: Not started
Status: planned
Last activity: 2026-09-09 — Phase 04 planning complete

Progress: [░░░░░░░░░░░░░░░░░░░░] 50/55 plans — Phases 1-3 complete, Phase 4 planned (5 plans) and ready to execute

## Performance Metrics

**Velocity:**

- Total plans completed: 50
- Average duration: 17m 40s
- Total execution time: 1h 28m 21s

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 30 | - | - |
| 2 | 11 | - | - |
| 3 | 9 | - | - |

**Recent Trend:**

- Last 5 plans: 01-26, 01-27, 01-28, 01-29, 01-30
- Trend: Phase 1 gap closure finished with green automation, scoped live approval, zero open windows, validated coverage, and zero open security threats

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
| Phase 01 P12 | 10 min | 1 tasks | 6 files |
| Phase 01 P13 | 18 min | 1 tasks | 11 files |
| Phase 01 P27 | 31h 27m | 3 tasks | 5 files |

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
- [Phase 01]: A callback is acknowledged exactly once per callback_query.id, deferred to the branch that owns the outcome, with a boundary-level fallback when no branch chose a text; the fresh current-role lookup still precedes every token parse and durable read, and unavailable membership evidence still denies fail-closed.
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
- [Phase 01]: Roster ordering uses an Intl.Collator on the safe display label with the Telegram bigint as an internal-only tie-breaker; equal labels keep one stable rendered order.
- [Phase 01]: Roster page and retry callback actions are idempotent reads: actor/chat/expiry-bound rows that are never consumed, and a stale page index clamps into the current range.
- [Phase 01]: A roster read failure renders read-specific copy with a bound Retry action; the documented generic save copy stays on save paths only.
- [Phase 01]: Every Phase 1 command, update, and callback registers once through registerChatReadinessHandlers and crosses one acknowledge-authorize-parse-load-dispatch callback boundary.
- [Phase 01]: The callback boundary revalidates the current administrator before parsing the token, so a demoted actor is denied even for a malformed or unresolvable token.
- [Phase 01]: Chat-key sequentialize is installed by createBot ahead of handler registration; middleware registered after non-terminating handlers never runs.
- [Phase 01]: An unbound catch clause is unloggable, not merely unlogged — the redactor renders an error only under the err key, so binding the caught value is a precondition for observability.
- [Phase 01]: Handler failures are classified in the emitted fields: expected-input rejections at debug with the field being collected, infrastructure and Telegram delivery failures at error; both carry the bound error.
- [Phase 01]: A structural or manual gate asserts its positive existential before any absence claim; an absence assertion over an unread or empty set is vacuously true.
- [Phase 01]: A privacy-mode location prompt must explicitly tell the administrator to reply to the bot prompt; a generic "Send a location in this group" instruction is not discoverable enough for approval.
- [Phase 03]: A round owns TWO live messages — the availability card on `anchorMessageId` and the ready-to-book announcement on `announcementMessageId` — each with its own re-post slot (D-17).
- [Phase 03]: Unanimity is claimed with one compare-and-set on `readyAnnouncedAt` whose cooldown window lives in the WHERE clause, and the claim is durable BEFORE the send, so neither a concurrent answer nor a Telegram outage can produce a second notification.
- [Phase 03]: Booking eligibility and unanimity are re-decided inside the apply transaction; a rendered control is never authority, and no eligibility claim travels on the wire.
- [Phase 03]: Callback alert budgets are measured in UTF-16 code units — the unit Telegram counts — with truncation on code-point boundaries.

### Pending Todos

None yet.

### Blockers/Concerns

- ⚠️ [Phase 03] The one-live-`book-request`-row invariant is a load-then-mint pair closed by chat-key `sequentialize`, which is a SINGLE-PROCESS guarantee. Deploying more than one polling process breaks it. Promotion path: a partial unique index on `(chatId, targetId) WHERE consumedAt IS NULL`. Recorded in `03-SECURITY.md` → Declared Preconditions.
- Confirm the production host can continuously run the single long-polling bot process before deployment planning.
- Select and document the TypeScript time-library DST policy during planning of the week-aware proposal.
- Later Docker work must retain `geo-tz` runtime data and the exact approved lockfile.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260819-o9f | Ensure bundled Node.js is always on PATH for Codex sessions | 2026-08-19 | b9a576f | [260819-o9f-ensure-bundled-node-js-is-always-on-path](./quick/260819-o9f-ensure-bundled-node-js-is-always-on-path/) |
| 260826-e62 | CR-01: AuthorizationService no longer destroys drafts when the membership lookup fails; failure now logged at error level. Fail-closed denial preserved. | 2026-08-26 | b1d0cc7, 3055f36 | [260826-e62-fix-cr-01-authorization-service-swallows](./quick/260826-e62-fix-cr-01-authorization-service-swallows/) |
| 260826-o1i | Record live verification run 2 results across phase 01 artifacts (runbook, UAT, 8 summaries, WINDOWS.md). Phase stays pending: AC-5 still fails on two new findings. | 2026-08-26 | ff50540, 2728a26, 26b5b68 | [260826-o1i-record-live-verification-run-2-results-a](./quick/260826-o1i-record-live-verification-run-2-results-a/) |
| 260830-dd9 | Update only the Phase 1 Goal in .planning/ROADMAP.md to: As a chat admin, I want to configure a durable, access-controlled chat, so that the band can plan rehearsals. Preserve Mode: mvp and all existing plans and summaries. Do not run plan-phase. | 2026-08-30 | f028512 | [260830-dd9-update-only-the-phase-1-goal-in-planning](./quick/260830-dd9-update-only-the-phase-1-goal-in-planning/) |
| 260903-e9e | Close Phase 02 security threat T-02-30 with an executable inherited-database migration preflight and automated coverage | 2026-09-03 | 6a725a3 | [260903-e9e-close-phase-02-security-threat-t-02-30-w](./quick/260903-e9e-close-phase-02-security-threat-t-02-30-w/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Automatic booking | Provider-specific studio booking with browser automation | Deferred to a later milestone | 2026-08-19 |

## Session Continuity

Last session: 2026-09-08T12:19:18.928Z
Stopped at: Phase 4 planned — 5 plans ready to execute
Resume file: .planning/phases/04-replanning-and-rehearsal-lifecycle/04-CONTEXT.md

Next up:

1. Discuss Phase 4 (Replanning and Rehearsal Lifecycle) to gather context.
2. Plan and execute Phase 4; AVAIL-05 and AVAIL-06 (replanning after a "Cannot attend") land there.
3. Carry the Phase 3 declared precondition forward: the one-live-`book-request`-row invariant holds only under a single polling process.

### Open decisions carried forward

- N-6: in-place card replacement on text-input steps (setup and settings) deferred by owner decision 2026-08-24; needs SetupDraft.cardMessageId plus a migration.
- All five gates that formerly certified the defects they were written to catch are now corrected; the last (runbook 2e / UAT test 6) was fixed by plan 01-22.
