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

The planner must replace this requirement seed with exact plan/task IDs and final filenames before plan checking. All new suites below are execution deliverables, not existing passing tests.

| Task ID | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Assign in plans | REM-01, REM-02 | Stale eligibility | Draft and quiet-week suppression, current week only | Unit | `npm test -- tests/unit/reminder-policy.test.ts` | No | Pending |
| Assign in plans | REM-03 | Timing bypass | DST and generation boundaries, grace and spacing | Unit | `npm test -- tests/unit/reminder-occurrences.test.ts` | No | Pending |
| Assign in plans | REM-04 | Recipient disclosure | Current pending snapshot only, escaped mentions | Unit | `npm test -- tests/unit/reminder-renderers.test.ts` | No | Pending |
| Assign in plans | REM-05 | Stale job | Block, book, cancel, supersede and start suppress delivery | Integration | `npm run test:integration -- tests/integration/reminder-lifecycle.test.ts` | No | Pending |
| Assign in plans | RELI-02 | Duplicate effects | Competing claims and update replay remain idempotent | Integration | `npm run test:integration -- tests/integration/reminder-idempotency.test.ts` | No | Pending |
| Assign in plans | RELI-03 | Unknown send replay | Inclusive two-hour recovery, terminal uncertainty | Integration | `npm run test:integration -- tests/integration/reminder-recovery.test.ts` | No | Pending |
| Assign in plans | REM-05, RELI-03 | Old schedule/chat | Atomic settings generation and migration invalidation | Integration | `npm run test:integration -- tests/integration/reminder-settings.test.ts tests/integration/chat-migration.test.ts` | Mixed | Pending |
| Assign in plans | RELI-02, RELI-03 | Schema mismatch | Fresh and upgraded database, repeat deploy, queue readiness | Integration | `npm run test:integration -- tests/integration/migration-preflight.test.ts tests/integration/reminder-queue.test.ts` | Mixed | Pending |

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

- [ ] Exact task IDs and final test paths replace the seed map.
- [ ] Every implementation task has an automated verify command or explicit prior fixture dependency.
- [ ] No three consecutive implementation tasks lack automated verification.
- [ ] Missing files are assigned to a creating task; no watch-mode commands.
- [ ] Full checks and scoped UAT are recorded during execution.
- [ ] Runtime/latency evidence is recorded without unsupported performance claims.

**Approval:** Pending execution and validation. This draft records the test contract; it does not certify passing implementation.
