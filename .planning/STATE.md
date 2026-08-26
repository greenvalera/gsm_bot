---
gsd_state_version: 1.0
milestone: v1.0
current_phase: 01
current_phase_name: Chat Readiness
status: executing
stopped_at: Gap-closure plans 01-23..01-27 planned and verified; ready for gaps-only execution
last_updated: "2026-08-26T17:35:27.182Z"
last_activity: 2026-08-26
last_activity_desc: Phase 01 gap-closure plans 01-23..01-27 verified and ready to execute
state_head: c248f70e19cbcf726099b5c37ed4f6304e3afd63
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 27
  completed_plans: 22
milestone_name: milestone
total_plans_in_phase: 27
current_plan: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-19)

**Core value:** The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.
**Current focus:** Phase 01 — Chat Readiness

## Current Position

Phase: 01 (Chat Readiness) — READY TO EXECUTE
Plan: 23 of 27
Status: Ready to execute
Last activity: 2026-08-26 — Gap-closure plans 01-23..01-27 verified and ready to execute

Progress: [████████░░] 81%

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
| Phase 01 P12 | 10 min | 1 tasks | 6 files |
| Phase 01 P13 | 18 min | 1 tasks | 11 files |

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
| 260826-e62 | CR-01: AuthorizationService no longer destroys drafts when the membership lookup fails; failure now logged at error level. Fail-closed denial preserved. | 2026-08-26 | b1d0cc7, 3055f36 | [260826-e62-fix-cr-01-authorization-service-swallows](./quick/260826-e62-fix-cr-01-authorization-service-swallows/) |
| 260826-o1i | Record live verification run 2 results across phase 01 artifacts (runbook, UAT, 8 summaries, WINDOWS.md). Phase stays pending: AC-5 still fails on two new findings. | 2026-08-26 | ff50540, 2728a26, 26b5b68 | [260826-o1i-record-live-verification-run-2-results-a](./quick/260826-o1i-record-live-verification-run-2-results-a/) |

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Automatic booking | Provider-specific studio booking with browser automation | Deferred to a later milestone | 2026-08-19 |

## Session Continuity

Last session: 2026-08-26
Stopped at: LIVE VERIFICATION RUN 2 executed 2026-08-26 against the preserved run-1 Postgres volume. Verdict NOT approved. All nine run-1 findings (F-1..F-9) confirmed closed live; all seven human_judgment deliverables (01-16 D9, 01-17 D9, 01-18 D11, 01-19 D10, 01-20 D9, 01-21 D8, 01-22 D8) satisfied; AC-1/AC-2/AC-3/AC-4 pass, with AC-3 and AC-4 residuals from run 1 now closed. AC-5 STILL FAILS on two NEW findings recorded as open windows 14 and 15: F-10 (settings-handlers.ts:303 — expired settings-edit draft swallowed in silence, no expiry copy) and F-11 (setup-handlers.ts:443 — /setup claims the chat is unconfigured even when it is configured). Both are contract violations in AC-5's own domain; both were structurally undiscoverable from a clean database. Phase 01 stays PENDING; 01-14-SUMMARY.md stays halted. Earlier this session: quick task 260826-e62 fixed CR-01 (AuthorizationService no longer destroys drafts on a transient membership-lookup failure).
Resume file: .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md

Next up (owner decision, not yet started):

1. Fix F-10 and F-11 via separate GSD sessions, then a third live run.
2. Broken windows 2 and 3 disposition — still open, still blocking /gsd-ship.
3. Coverage gap: tests/unit/update-path-logging.test.ts:357 scans src/telegram only, which is why CR-01 survived in src/domain.
4. Runbook language — the file is Ukrainian, CLAUDE.md requires English documentation.
5. /gsd-secure-phase 01 — security_enforcement is on with no SECURITY.md.

### Open decisions carried forward

- Broken windows 2 and 3 (inherited stale integration-test expectations) are NOT in the wave and will block /gsd-ship while windows_enforce is on. They need a disposition — fix or waive.
- N-6: in-place card replacement on text-input steps (setup and settings) deferred by owner decision 2026-08-24; needs SetupDraft.cardMessageId plus a migration.
- All five gates that formerly certified the defects they were written to catch are now corrected; the last (runbook 2e / UAT test 6) was fixed by plan 01-22.
