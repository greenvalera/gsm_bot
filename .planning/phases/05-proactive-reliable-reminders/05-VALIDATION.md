---
phase: 05
slug: proactive-reliable-reminders
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-13
---

# Phase 05 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 and Testcontainers 12.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- tests/unit/reminder-policy.test.ts tests/unit/reminder-occurrences.test.ts` |
| Full unit suite | `npm test` |
| Full integration suite | `npm run test:integration` |
| Static checks | `npm run typecheck` and `npm run format:check` |
| Runtime | Project-supported Node >=24.19 <25, or existing Docker toolchain |
| Estimated latency | Targeted units: target <30 seconds, unmeasured. Integration/container checks: minutes, measure during execution. |

## Sampling Rate

- After each implementation task: its focused non-watch unit or integration command and type check.
- After each persistence/queue wave: affected real-PostgreSQL integration suites.
- Before phase verification: full unit/integration suites, formatting, types, migration preflight and container build.
- Do not substitute mocked persistence for atomic-claim or restart guarantees. Do not claim a measured latency until execution records one.

## Per-Task Verification Map

Exact plan/task map. New tests remain execution deliverables, not passing evidence. Dependency and schema review precede installation; real-database commands deploy reviewed migrations and queue provisioning through the helper. All integration latency remains unmeasured.

| Task ID | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|
| 05-01-01 | 1 | RELI-02, RELI-03 | T-05-01-01 | Review the exact pg-boss pin | `npm view pg-boss@12.27.0 version engines repository scripts --json` | Audit exists; review pending | Pending |
| 05-01-02 | 1 | RELI-02, RELI-03 | T-05-01-01 | Review durable occurrence identity and migration proposal | `node .codex/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/05-proactive-reliable-reminders/05-02-PLAN.md` | Audit exists; review pending | Pending |
| 05-02-01 | 2 | RELI-02, RELI-03 | T-05-02-01 | Install the reviewed pin and prepare migration-owned queue provisioning | `node --check prisma/provision-reminders.mjs` | New suites pending | Pending |
| 05-02-02 | 2 | RELI-02, RELI-03 | T-05-02-01 | Deploy and prove the ledger migration before the tracer | `npm run db:generate && npm run test:integration -- tests/integration/reminder-queue.test.ts` | New suites pending | Pending |
| 05-03-01 | 3 | RELI-02, RELI-03, REM-01 | T-05-03-01 | Tracer: dispatch one real occurrence from queue through PostgreSQL to Telegram | `npm run test:integration -- tests/integration/reminder-tracer.test.ts` | New suites pending | Pending |
| 05-03-02 | 3 | RELI-02, RELI-03, REM-01 | T-05-03-01 | Coordinate worker sends with Telegram updates | `npm run test:integration -- tests/integration/reminder-coordination.test.ts tests/integration/reminder-tracer.test.ts` | New suites pending | Pending |
| 05-04-01 | 4 | REM-01, REM-02, REM-03, RELI-03 | T-05-04-01 | Enumerate civil occurrences and weekly eligibility | `npm test -- tests/unit/reminder-policy.test.ts tests/unit/reminder-occurrences.test.ts` | New suites pending | Pending |
| 05-04-02 | 4 | REM-01, REM-02, REM-03, RELI-03 | T-05-04-01 | Reconcile recurring weekly work from durable boundaries | `npm run test:integration -- tests/integration/reminder-weekly.test.ts` | New suites pending | Pending |
| 05-05-01 | 5 | REM-01, REM-02, RELI-02 | T-05-05-01 | Render planning reminder and persist opaque public action | `npm test -- tests/unit/reminder-renderers.test.ts && npm run test:integration -- tests/integration/reminder-actions.test.ts` | New suites pending | Pending |
| 05-05-02 | 5 | REM-01, REM-02, RELI-02 | T-05-05-01 | Route reminder clicks through the current-policy planning gate | `npm run test:integration -- tests/integration/reminder-start.test.ts` | New suites pending | Pending |
| 05-06-01 | 6 | REM-01, REM-03, REM-05, RELI-02, RELI-03 | T-05-06-01 | Commit activation and schedule generation with setup/settings | `npm run test:integration -- tests/integration/reminder-settings.test.ts` | New suites pending | Pending |
| 05-06-02 | 6 | REM-01, REM-03, REM-05, RELI-02, RELI-03 | T-05-06-01 | Persist quiet cancellation and invalidate obsolete lifecycle work | `npm run test:integration -- tests/integration/reminder-lifecycle.test.ts` | New suites pending | Pending |
| 05-07-01 | 7 | REM-03, REM-04, REM-05 | T-05-07-01 | Acknowledge availability publication and usable reanchors | `npm run test:integration -- tests/integration/reminder-publication.test.ts` | New suites pending | Pending |
| 05-07-02 | 7 | REM-03, REM-04, REM-05 | T-05-07-01 | Deliver exact pending snapshot and current-card navigation | `npm test -- tests/unit/reminder-renderers.test.ts && npm run test:integration -- tests/integration/reminder-followups.test.ts` | New suites pending | Pending |
| 05-08-01 | 8 | RELI-02, RELI-03, REM-03, REM-05 | T-05-08-01 | Coalesce bounded recovery and preserve send spacing | `npm run test:integration -- tests/integration/reminder-recovery.test.ts && npm test -- tests/unit/reminder-occurrences.test.ts` | New suites pending | Pending |
| 05-08-02 | 8 | RELI-02, RELI-03, REM-03, REM-05 | T-05-08-01 | Classify delivery failures and prove competing-claim idempotency | `npm run test:integration -- tests/integration/reminder-idempotency.test.ts tests/integration/reminder-delivery.test.ts` | New suites pending | Pending |
| 05-09-01 | 9 | REM-05, RELI-02, RELI-03 | T-05-09-01 | Migrate reminder identities with the existing chat transaction | `npm run test:integration -- tests/integration/reminder-migration.test.ts tests/integration/chat-migration.test.ts` | New suites pending | Pending |
| 05-09-02 | 9 | REM-05, RELI-02, RELI-03 | T-05-09-01 | Finish startup, bounded recovery and teardown behavior | `npm run test:integration -- tests/integration/reminder-runtime.test.ts` | New suites pending | Pending |
| 05-10-01 | 10 | REM-01, REM-02, REM-03, REM-04, REM-05, RELI-02, RELI-03 | T-05-10-01 | Run migration-first full regression and record measured validation | `npm test && npm run test:integration && npm run typecheck && npm run format:check && docker compose build` | Infrastructure exists; evidence pending | Pending |
| 05-10-02 | 10 | REM-01, REM-02, REM-03, REM-04, REM-05, RELI-02, RELI-03 | T-05-10-01 | Verify scoped Telegram Web behavior and restore fixtures | `npm run test:integration -- tests/integration/reminder-start.test.ts tests/integration/reminder-followups.test.ts tests/integration/reminder-recovery.test.ts` | Infrastructure exists; evidence pending | Pending |


## Wave 0 Requirements

- Create reminder fixtures with injected clock and fake Telegram transport in the first owning implementation task; later tasks depend on that plan.
- Add each targeted suite before its command becomes a prerequisite. Existing Vitest/PostgreSQL helpers need no new testing framework.
- Queue dependency review and migration provisioning precede tests requiring pg-boss.
- Keep all existing planning, lifecycle, callback and migration regressions.

## Required Boundary Evidence

- 09:59 first publication skips a 10:00 occurrence permanently, including after recovery.
- Exactly 30 minutes passes spacing/grace; less than 30 does not. Exactly two hours lateness permits catch-up; greater does not.
- Recovery at 15:50 sends the eligible 14:00 occurrence once and suppresses 16:00; another restart does not repeat either.
- Adding 14:00 at 15:00 creates only future work. Timezone changes preserve reminder wall times and the fixed rehearsal instant.
- Pending recipients come from the current round snapshot, not the live roster; blocked, all-available and started rounds are silent.
- Crashes before reservation, after reservation, after external acceptance and before outcome persistence have distinct tested dispositions.
- Unknown delivery retains spacing and cannot retry. Proven non-delivery may retry only within the original occurrence deadline.
- Reanchor, group migration, settings save and cancellation contend with delivery through shared coordination and durable guards.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real mention and navigation | REM-04 | Client rendering and notification behavior | In a dedicated test group, observe pending-only mentions and current-card navigation for public/private supergroups and basic-group reply fallback. |
| Start planning button | REM-01, REM-02 | Real Telegram callback experience | Authorized click opens existing planning flow; unauthorized and stale clicks receive one clear acknowledgement. |
| End-to-end scheduled reminder | REM-01–REM-05, RELI-03 | Deployed queue and Telegram boundary | Use controlled fixture times, restart once, observe one relevant reminder and obsolete-work suppression; restore fixture afterward. |

Use `.codex/skills/telegram-web-uat/SKILL.md` for live acceptance testing. Keep prior-phase UAT evidence intact and use one polling process. No live actions occur during planning.

## Validation Sign-Off

- [x] Exact task IDs, waves and final test paths replace the seed map (planning only).
- [ ] Every implementation task has an automated verify command or explicit prior fixture dependency.
- [ ] No three consecutive implementation tasks lack automated verification.
- [ ] Missing files are assigned to a creating task; no watch-mode commands.
- [ ] Full checks and scoped UAT are recorded during execution.
- [ ] Runtime/latency evidence is recorded without unsupported performance claims.

**Approval:** Pending execution and validation. This draft records the test contract; it does not certify passing implementation.
