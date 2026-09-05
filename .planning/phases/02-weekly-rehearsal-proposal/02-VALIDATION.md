---
phase: 02
slug: weekly-rehearsal-proposal
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-08-30
updated: 2026-09-05
---

# Phase 02 — Validation Strategy

> Nyquist audit refreshed after execution of plans 02-01 through 02-11, including the five UAT/code-review gap plans.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 with `unit` and serial `integration` projects |
| **Config file** | `vitest.config.ts` |
| **Quick command** | `npm run test:unit -- --configLoader runner` |
| **Integration command** | `npm run test:integration` |
| **Static commands** | `npm run typecheck`; scoped `prettier --check` for phase files |
| **Database gate** | Testcontainers PostgreSQL plus committed Prisma migrations |
| **Observed merged-tree result** | 270 unit tests and 149 integration tests passed on 2026-09-05 |

The repository-wide `npm run format:check` also scans local, untracked agent-runtime files. The phase gate therefore used the same Prettier command scoped to all tracked files changed by Phase 02; it passed. No product or planning file is excluded from that scoped check.

## Requirement Coverage Map

| Requirement | Plans | Automated evidence | Status |
|-------------|-------|--------------------|--------|
| CONF-04 | 02-04 | `tests/unit/slot-generation.test.ts`, `tests/unit/zoned-clock.test.ts` | COVERED |
| AUTH-03 | 02-06, 02-10 | `tests/integration/planning-takeover.test.ts`, `tests/integration/planning-token-release.test.ts` | COVERED |
| PLAN-01 | 02-02, 02-06, 02-07, 02-09 | `tests/unit/planning-start-authorization.test.ts`, `tests/unit/callback-authority.test.ts`, `tests/unit/planning-logging.test.ts` | COVERED |
| PLAN-02 | 02-02, 02-05, 02-07, 02-09 | `tests/integration/planning-round.test.ts`, `tests/integration/planning-participant-integrity.test.ts`, `tests/integration/migration-preflight.test.ts` | COVERED |
| PLAN-03 | 02-02, 02-03 | `tests/unit/target-week.test.ts` | COVERED |
| PLAN-04 | 02-02, 02-03, 02-10 | `tests/unit/planning-day-card.test.ts`, `tests/unit/planning-keyboards.test.ts`, `tests/integration/planning-token-release.test.ts` | COVERED |
| PLAN-05 | 02-03 | `tests/unit/planning-day-card.test.ts` | COVERED |
| PLAN-06 | 02-04, 02-05, 02-10 | `tests/unit/planning-time-card.test.ts`, `tests/integration/planning-token-release.test.ts` | COVERED |
| PLAN-07 | 02-04 | `tests/unit/planning-time-card.test.ts`, `tests/unit/zoned-clock.test.ts` | COVERED |
| PLAN-08 | 02-01, 02-05, 02-07, 02-09, 02-11 | `tests/integration/planning-confirm.test.ts`, `tests/integration/planning-participant-integrity.test.ts`, `tests/unit/planning-time-card.test.ts`, `tests/unit/planning-logging.test.ts` | COVERED |
| PLAN-09 | 02-01, 02-05 | Requirement retained with its explicit out-of-scope/replacement decision; `tests/integration/planning-confirm.test.ts` proves the selected active-roster snapshot | COVERED |
| PLAN-10 | 02-06, 02-11 | `tests/integration/planning-recovery.test.ts`, `tests/integration/planning-action-retention.test.ts` | COVERED |
| RELI-01 | 02-02, 02-06, 02-10, 02-11 | `tests/integration/planning-recovery.test.ts`, `tests/integration/planning-token-release.test.ts`, `tests/integration/planning-action-retention.test.ts` | COVERED |

## Gap-Closure Coverage

| UAT / review gap | Closing plan | Automated evidence | Status |
|------------------|--------------|--------------------|--------|
| G-02-2: singular review-card copy | 02-07 | singular, plural, and empty-lineup cases in `planning-time-card.test.ts` | COVERED |
| G-02-3: correct non-member refusal | 02-07 | full callback authority matrix in `callback-authority.test.ts` | COVERED |
| G-02-4: plain-text owner identity | 02-07 | ampersand and masked-identity cases in `planning-ownership.test.ts` and `roster-rendering.test.ts` | COVERED |
| G-02-6: roadmap mode/goal mismatch | 02-08 | deterministic `awk`/`grep` documentation gates from the plan | COVERED |
| G-02-5: integrity, dead vocabulary, races, retention | 02-09, 02-10, 02-11 | migration-preflight, participant-integrity, token-release, confirm-lock, and action-retention integration suites | COVERED |
| Final review convergence: exact migration catalogs, confirm-time freshness, stale-round races, and retained failure causes | review iterations 1–7 | `migration-preflight.test.ts` (26 cases), `planning-confirm.test.ts`, `planning-recovery.test.ts`, and `planning-logging.test.ts` | COVERED |

## Sampling Continuity

Every implementation task in plans 02-01 through 02-11 contains a bounded `<automated>` command. No three consecutive implementation tasks lack automated feedback. The gap plans add deterministic PostgreSQL checks for the database and concurrency behaviors that cannot be established by unit mocks.

## Manual-Only Verification

| Behavior | Requirement | Result | Why manual |
|----------|-------------|--------|------------|
| Telegram client button width, glyph rendering, and single-anchor behavior | PLAN-04, PLAN-06 | PASSED in `02-UAT.md` test 1 | Telegram client rendering is outside the repository test harness |
| Applying the new migration to a developer's persistent volume | operational check | DEFERRED to deployment | Disposable PostgreSQL migration replay and schema diff passed; mutating a persistent developer volume remains an explicit human operation |

## Validation Audit 2026-09-02

| Metric | Count |
|--------|-------|
| Phase requirements audited | 13 |
| Automated coverage gaps found | 0 |
| UAT/review gaps rechecked | 5 |
| Gaps resolved by plans 02-07–02-11 | 5 |
| Escalated implementation gaps | 0 |

## Validation Audit 2026-09-05

| Metric | Count |
|--------|-------|
| Phase requirements audited | 13 |
| Automated coverage gaps found | 0 |
| Final review convergence areas rechecked | 4 |
| PostgreSQL migration-preflight cases | 26 |
| Escalated implementation gaps | 0 |

## Validation Sign-Off

- [x] Every implementation task has an automated verification command
- [x] Sampling continuity has no three-task gap
- [x] All referenced test files exist
- [x] Unit, integration, typecheck, and scoped formatting gates are green
- [x] Manual-only client rendering was completed in UAT
- [x] `nyquist_compliant: true` is set

**Approval:** Nyquist-compliant on 2026-09-05.
