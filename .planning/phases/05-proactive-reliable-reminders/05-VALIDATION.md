---
phase: 05
slug: proactive-reliable-reminders
status: validated
nyquist_compliant: true
wave_0_complete: true
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
| Estimated latency | Targeted units measured 1.015 seconds wall time (11 tests); full measured evidence below. |

## Sampling Rate

- After each implementation task: its focused non-watch unit or integration command and type check.
- After each persistence/queue wave: affected real-PostgreSQL integration suites.
- Before phase verification: full unit/integration suites, formatting, types, migration preflight and container build.
- Do not substitute mocked persistence for atomic-claim or restart guarantees. Do not claim a measured latency until execution records one.

## Per-Task Verification Map

Exact 20-task map. Plans 01–09 summaries record the original task evidence and RED/GREEN commits. All named test files now exist. The helper applies committed migrations, checks migration status and provisions the reviewed queue before normal database fixtures; intentional missing-schema/upgrade fixtures explicitly exercise the opposite states.

| Task ID | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|
| 05-01-01 | 1 | RELI-02, RELI-03 | T-05-01-01 | Review the exact pg-boss pin | `npm view pg-boss@12.27.0 version engines repository scripts --json` | Review evidence exists | Approved (05-01-SUMMARY) |
| 05-01-02 | 1 | RELI-02, RELI-03 | T-05-01-01 | Review durable occurrence identity and migration proposal | `node .codex/gsd-core/bin/gsd-tools.cjs query verify.plan-structure .planning/phases/05-proactive-reliable-reminders/05-02-PLAN.md` | Review evidence exists | Approved (05-01-SUMMARY) |
| 05-02-01 | 2 | RELI-02, RELI-03 | T-05-02-01 | Install the reviewed pin and prepare migration-owned queue provisioning | `node --check prisma/provision-reminders.mjs` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-02-02 | 2 | RELI-02, RELI-03 | T-05-02-01 | Deploy and prove the ledger migration before the tracer | `npm run db:generate && npm run test:integration -- tests/integration/reminder-queue.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-03-01 | 3 | RELI-02, RELI-03, REM-01 | T-05-03-01 | Tracer: dispatch one real occurrence from queue through PostgreSQL to Telegram | `npm run test:integration -- tests/integration/reminder-tracer.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-03-02 | 3 | RELI-02, RELI-03, REM-01 | T-05-03-01 | Coordinate worker sends with Telegram updates | `npm run test:integration -- tests/integration/reminder-coordination.test.ts tests/integration/reminder-tracer.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-04-01 | 4 | REM-01, REM-02, REM-03, RELI-03 | T-05-04-01 | Enumerate civil occurrences and weekly eligibility | `npm test -- tests/unit/reminder-policy.test.ts tests/unit/reminder-occurrences.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-04-02 | 4 | REM-01, REM-02, REM-03, RELI-03 | T-05-04-01 | Reconcile recurring weekly work from durable boundaries | `npm run test:integration -- tests/integration/reminder-weekly.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-05-01 | 5 | REM-01, REM-02, RELI-02 | T-05-05-01 | Render planning reminder and persist opaque public action | `npm test -- tests/unit/reminder-renderers.test.ts && npm run test:integration -- tests/integration/reminder-actions.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-05-02 | 5 | REM-01, REM-02, RELI-02 | T-05-05-01 | Route reminder clicks through the current-policy planning gate | `npm run test:integration -- tests/integration/reminder-start.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-06-01 | 6 | REM-01, REM-03, REM-05, RELI-02, RELI-03 | T-05-06-01 | Commit activation and schedule generation with setup/settings | `npm run test:integration -- tests/integration/reminder-settings.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-06-02 | 6 | REM-01, REM-03, REM-05, RELI-02, RELI-03 | T-05-06-01 | Persist quiet cancellation and invalidate obsolete lifecycle work | `npm run test:integration -- tests/integration/reminder-lifecycle.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-07-01 | 7 | REM-03, REM-04, REM-05 | T-05-07-01 | Acknowledge availability publication and usable reanchors | `npm run test:integration -- tests/integration/reminder-publication.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-07-02 | 7 | REM-03, REM-04, REM-05 | T-05-07-01 | Deliver exact pending snapshot and current-card navigation | `npm test -- tests/unit/reminder-renderers.test.ts && npm run test:integration -- tests/integration/reminder-followups.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-08-01 | 8 | RELI-02, RELI-03, REM-03, REM-05 | T-05-08-01 | Coalesce bounded recovery and preserve send spacing | `npm run test:integration -- tests/integration/reminder-recovery.test.ts && npm test -- tests/unit/reminder-occurrences.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-08-02 | 8 | RELI-02, RELI-03, REM-03, REM-05 | T-05-08-01 | Classify delivery failures and prove competing-claim idempotency | `npm run test:integration -- tests/integration/reminder-idempotency.test.ts tests/integration/reminder-delivery.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-09-01 | 9 | REM-05, RELI-02, RELI-03 | T-05-09-01 | Migrate reminder identities with the existing chat transaction | `npm run test:integration -- tests/integration/reminder-migration.test.ts tests/integration/chat-migration.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-09-02 | 9 | REM-05, RELI-02, RELI-03 | T-05-09-01 | Finish startup, bounded recovery and teardown behavior | `npm run test:integration -- tests/integration/reminder-runtime.test.ts` | Yes | Passed focused task verification (owning SUMMARY) |
| 05-10-01 | 10 | REM-01, REM-02, REM-03, REM-04, REM-05, RELI-02, RELI-03 | T-05-10-01 | Run migration-first full regression and record measured validation | `npm test && npm run test:integration && npm run typecheck && npm run format:check && docker compose build` | Yes | Automated pass; native UAT pending |
| 05-10-02 | 10 | REM-01, REM-02, REM-03, REM-04, REM-05, RELI-02, RELI-03 | T-05-10-01 | Verify scoped Telegram Web behavior and restore fixtures | `npm run test:integration -- tests/integration/reminder-start.test.ts tests/integration/reminder-followups.test.ts tests/integration/reminder-recovery.test.ts` | Yes | Automated pass; native UAT pending |


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
- [x] Every implementation task has an automated verify command or explicit prior fixture dependency.
- [x] No three consecutive implementation tasks lack automated verification.
- [x] Missing files are assigned to a creating task; no watch-mode commands.
- [ ] Full checks and scoped UAT are recorded during execution.
- [x] Runtime/latency evidence is recorded without unsupported performance claims.

**Approval:** Required automated checks passed with the final affected-scope rerun documented below. Independent review and security review have cleared the final source. Native Telegram acceptance remains a separate pending gate; this document does not accept the phase.

## Measured execution — 2026-09-13 Europe/Kyiv

Host checks use bundled Node **24.19.0**, not the older system runtime. `npm` below means `node C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js` with the bundled Node directory first on PATH. Durations are measured command wall time, including CLI startup; Vitest internal duration is recorded separately where useful.

| Command | Exit | Wall seconds | Observed result |
|---|---:|---:|---|
| `npm test` | 0 | 1.317 | 381 tests, 29 files passed |
| `npm run test:integration` | 0 | 354.842 | 448 tests, 37 files passed; Vitest 354.42 seconds |
| `npm run typecheck` | 0 | 0.843 | TypeScript passed |
| `npm run format:check` (initial) | 1 | 13.790 | 640 warnings: installed agent runtime and existing checkout line endings; no blanket source formatting |
| `npm test -- tests/unit/reminder-policy.test.ts tests/unit/reminder-occurrences.test.ts` | 0 | 1.015 | 11 tests, 2 files passed; Vitest 517 ms, test bodies 25 ms |
| `docker compose build` (initial) | 0 | 49.943 | Bot and migration images built; no service restart/deployment |
| `npm run format:check` (after scoped tooling repair) | 0 | 2.234 | All matched files use Prettier style |
| `npm run test:integration -- tests/integration/reminder-runtime.test.ts` (source `216845c`, HEAD `f9d6412`) | 0 | 9.963 | 13 runtime tests passed |
| `npm test` (HEAD `f9d6412`) | 0 | 1.301 | 381 tests, 29 files passed |
| `npm run typecheck` (HEAD `f9d6412`) | 0 | 0.793 | Passed |
| `npm run format:check` (HEAD `f9d6412`) | 0 | 2.120 | Passed |

The full integration run began at 04:33:22 local time against the then-current Phase 09 implementation (`bb2e3f8` source, documentation HEAD `242274e`). Review fixes were being developed while this serial run was active; it is baseline regression evidence, not a claim that every file was tested at one final immutable HEAD. Final affected runtime checks are recorded separately. Review discovered a further queued-update shutdown gap after `216845c`; the final `8f2ffda` affected-scope rerun below covers its correction.

The 37-file regression includes prior planning, availability, booking, lifecycle, callback, chat migration and migration-preflight suites, plus every reminder integration suite. `tests/helpers/postgres.ts` starts disposable PostgreSQL 18.4 containers, runs committed `prisma migrate deploy`, checks `prisma migrate status`, then runs `prisma/provision-reminders.mjs` before normal fixtures. Missing-schema and prefix-upgrade fixtures deliberately select their explicit alternate setup. Tests use fake Telegram transport; they do not send live messages.

Formatting investigation after normalizing the two changed package files identified 638 remaining warnings: zero Phase 5 changed files, 53 previously tracked files and 585 untracked runtime files. Commit `01776d5` adds `.codex` and `.agents` to the same exclusion list as `.claude`. Only clean tracked CRLF text was normalized locally; this produced no Git content changes. User-dirty files and concurrently edited runtime files were excluded. The real full format command then passed.

The image build reported five existing high npm audit findings. A successful build does not waive these; the security review owns reachability and disposition. No package upgrades were introduced during validation. Live Compose bot and database stayed running, with their existing volume/history intact. No second poller or system-clock changes were made.

Native Telegram mention/navigation, callback experience, scheduling/restart observation and restoration remain **pending** under task 05-10-02. No live acceptance report is manufactured by these automated checks.

### Final affected-scope verification

These checks ran after source commit `8f2ffda49f1fa31084fe8a12713481b88442258b` (the queued-update shutdown correction). Only subsequent documentation changes were allowed during this batch. The final unit suite at that source is also recorded in 05-09-SUMMARY.md (381 passing tests).

| Command | Exit | Wall seconds | Result |
|---|---:|---:|---|
| `npm run test:integration -- tests/integration/reminder-runtime.test.ts tests/integration/reminder-coordination.test.ts tests/integration/chat-migration.test.ts` | 0 | 15.614 | 25 tests across 3 files passed: runtime 14, coordination 5, chat migration 6 |
| `npm run typecheck` | 0 | 0.864 | Passed |
| `npm run format:check` | 0 | 2.224 | Passed |
| `docker compose build` | 0 | 14.967 | Bot and migration images built |

Runtime regressions now exercise repeated actual process-signal handling, active middleware drain, and cancellation of updates waiting behind a paused reminder coordinator key. This final batch covers the files affected after the full 448-test regression; no claim is made that the final full suite contained 451 tests or that the full suite was rerun. The intermediate `f9d6412` image build also passed in 46.641 seconds before the final correction.

No automated verification was skipped. Task 05-10-01 is complete; task 05-10-02 remains a human verification checkpoint. The orchestrator's independent coverage audit found no automated gaps, so `nyquist_compliant` is true. This describes automated coverage and does not mark native acceptance complete.

### Independent coverage audit

The orchestrator crosschecked all 20 task IDs, the seven requirement texts and actual test descriptions, including the required boundaries above. Result: **0 automated coverage gaps**; no gap-filling auditor was required. Independent code review cleared all five findings at source `8f2ffda`; security review recorded 31 closed mitigations and zero blocking findings (`74aab07`).

| Requirement | Automated evidence |
|---|---|
| REM-01 | reminder-weekly, reminder-settings and reminder-start integration suites |
| REM-02 | reminder-weekly integration and reminder-policy unit suites |
| REM-03 | reminder-followups and reminder-publication integration suites |
| REM-04 | reminder-renderers unit and reminder-followups integration suites |
| REM-05 | reminder-lifecycle, reminder-settings and reminder-migration integration suites |
| RELI-02 | reminder-idempotency, reminder-delivery and reminder-start integration suites |
| RELI-03 | reminder-recovery, reminder-queue and reminder-runtime integration suites |

Audit trail: 2026-09-13 — exact task map verified, required tests present, full regression plus final affected-scope checks passed, zero automated gaps. The three manual-only rows and task 05-10-02 remain pending. Automated coverage compliance and product acceptance are tracked separately.
