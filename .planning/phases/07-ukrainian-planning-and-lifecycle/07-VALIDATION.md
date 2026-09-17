---
phase: 7
slug: ukrainian-planning-and-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-18
---

# Phase 7 — Validation Strategy

Planning-only contract grounded in 07-PATTERNS.md and existing tests. Research was skipped by explicit user choice. No test execution or passing result is claimed here.

## Test infrastructure

| Property | Value |
|---|---|
| Framework | Existing Vitest 4.1.11, unit and integration projects |
| Configuration | vitest.config.ts and existing package.json scripts |
| Fast feedback | `npm run build`; task-specific `npm run test:unit -- tests/unit/<named-test>.test.ts` |
| Database | Existing tests/helpers/postgres.ts starts migrated PostgreSQL via Testcontainers |
| Transport | createBot.handleUpdate with intercepted Telegram calls; real durable service/token rows |
| Prerequisite | `docker info` succeeds before real-database checks |
| Timing | Unit feedback targeted below 60 seconds; actual measurement required. Cold PostgreSQL startup can exceed 60 seconds and must not be represented as a fast unit check. Existing fixture allows 120 seconds for startup. |

Existing Node/npm dependencies are reused; no package install or schema change is planned. On Windows, use the environment's bundled Node/git path when absent from PATH; test commands themselves remain runtime-neutral.

## Sampling

- Run the named red test before behavior changes and its green check after each task.
- The leading tracer must pass end-to-end before any expansion task.
- Run `npm run build` after each plan because catalog parameters and Locale signatures cross modules.
- Run only affected suites after each task; before phase verification run the affected suite union below once. Repeat only after new edits/failures.
- Record actual timing and output. A Docker/environment failure is a blocked check, never passing or silently skipped evidence.

## Per-task verification map

| Task ID | Wave | Requirements | Threat reference | Secure behavior | Automated command | Test availability | Status |
|---|---|---|---|---|---|---|---|
| 07-01-01 | 1 | LANG-06, TEXT-04 | T-07-01-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "duplicate feedback tracer"` | localized-planning.e2e.test.ts; create/extend first in this task | pending |
| 07-01-02 | 1 | LANG-06, TEXT-04 | T-07-01-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "retry classification"` | localized-planning.e2e.test.ts; create/extend first in this task | pending |
| 07-02-01 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/planning-format.test.ts` | planning-format.test.ts, localized-planning.e2e.test.ts; create/extend first in this task | pending |
| 07-02-02 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/i18n.test.ts` | planning-format.test.ts, i18n.test.ts; create/extend first in this task | pending |
| 07-02-03 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/planning-availability-card.test.ts` | planning-format.test.ts, planning-availability-card.test.ts, localized-planning.e2e.test.ts; create/extend first in this task | pending |
| 07-03-01 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/localized-planning-cards.test.ts` | localized-planning-cards.test.ts; create/extend first in this task | pending |
| 07-03-02 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Exact Ukrainian answer/takeover labels, stable action tokens, omission, geometry and callback byte limit | `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-planning-cards.test.ts` | planning-keyboards.test.ts exists; extend first here; localized-planning-cards.test.ts created in Task 1 | pending |
| 07-03-03 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "planning workflow"` | i18n.test.ts, localized-planning.e2e.test.ts; create/extend first in this task | pending |
| 07-04-01 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/localized-lifecycle-cards.test.ts` | localized-lifecycle-cards.test.ts; create/extend first in this task | pending |
| 07-04-02 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Exact booking labels and Back-to-book-keep binding; unchanged change/cancel bindings and BOOKED control removal | `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-lifecycle-cards.test.ts` | planning-keyboards.test.ts exists; extend first here; localized-lifecycle-cards.test.ts created in Task 1 | pending |
| 07-04-03 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/localized-lifecycle.e2e.test.ts` | localized-lifecycle.e2e.test.ts, localized-lifecycle-cards.test.ts, i18n.test.ts; create/extend first in this task | pending |
| 07-05-01 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/localized-planning-feedback.test.ts` | localized-planning-feedback.test.ts; create/extend first in this task | pending |
| 07-05-02 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/localized-planning-feedback.test.ts tests/unit/callback-authority.test.ts tests/unit/planning-ownership.test.ts` | localized-planning-feedback.test.ts; create/extend first in this task | pending |
| 07-05-03 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/localized-planning-feedback.e2e.test.ts` | localized-planning-feedback.e2e.test.ts, onboarding-feedback.test.ts, callback-authority.test.ts, i18n.test.ts; create/extend first in this task | pending |
| 07-06-01 | 6 | LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02 | T-07-06-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:integration -- tests/integration/planning-language-switch.e2e.test.ts -t "ordinary update"` | planning-language-switch.e2e.test.ts, planning-language-render.test.ts; create/extend first in this task | pending |
| 07-06-02 | 6 | LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02 | T-07-06-01/02/03 | Preserve fresh authority, safe labels, and committed-state semantics | `npm run test:unit -- tests/unit/planning-language-render.test.ts` | planning-language-switch.e2e.test.ts, planning-language-render.test.ts, localized-lifecycle.e2e.test.ts; create/extend first in this task | pending |

## Wave 0 / test creation

No dependency installation or separate foundation wave is needed. Existing infrastructure covers the phase. Each owning task creates its listed test before production changes; tasks depending on a new test depend on the prior owning plan. This is not a claim that those tests exist today.

- Plan 01 creates localized-planning.e2e.test.ts, including the named "duplicate feedback tracer" and "retry classification" cases.
- Plan 02 creates planning-format.test.ts.
- Plan 03 Task 1 creates localized-planning-cards.test.ts; Task 2 extends existing planning-keyboards.test.ts with focused bilingual label/token assertions before keyboard edits; Task 3 adds the "planning workflow" composed cases.
- Plan 04 Task 1 creates localized-lifecycle-cards.test.ts; Task 2 extends existing planning-keyboards.test.ts with lifecycle label/token assertions before wiring; Task 3 creates localized-lifecycle.e2e.test.ts for composed journeys.
- Plan 05 creates localized-planning-feedback.test.ts and localized-planning-feedback.e2e.test.ts.
- Plan 06 creates planning-language-render.test.ts and planning-language-switch.e2e.test.ts, including "ordinary update" cases.

## Affected final verification

`npm run build`

`npm run build:runtime`

`npm run test:unit -- tests/unit/i18n.test.ts tests/unit/planning-format.test.ts tests/unit/localized-planning-cards.test.ts tests/unit/localized-lifecycle-cards.test.ts tests/unit/localized-planning-feedback.test.ts tests/unit/planning-language-render.test.ts tests/unit/planning-day-card.test.ts tests/unit/planning-time-card.test.ts tests/unit/planning-availability-card.test.ts tests/unit/planning-keyboards.test.ts tests/unit/planning-ownership.test.ts tests/unit/callback-authority.test.ts tests/unit/onboarding-feedback.test.ts`

`npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts tests/integration/localized-planning-feedback.e2e.test.ts tests/integration/planning-language-switch.e2e.test.ts tests/integration/localized-onboarding.e2e.test.ts tests/integration/planning-availability.test.ts tests/integration/planning-booking.test.ts tests/integration/planning-recovery.test.ts tests/integration/planning-replan-telegram.test.ts tests/integration/planning-cancel-telegram.test.ts tests/integration/planning-change-telegram.test.ts tests/integration/planning-lifecycle-review.test.ts`

`npm run format:check` — record unrelated baseline formatting failures separately; preserve other work and format only phase-owned changes when correcting.

Do not claim full reminder/runtime-image acceptance from these checks: actual reminder delivery, complete outbound inventory, image catalog/Intl verification and milestone-wide bilingual acceptance belong to Phase 8.

## End-of-phase judgment and native checks

| Behavior | Requirement | Reason for judgment | Procedure |
|---|---|---|---|
| Selected Ukrainian copy, grammatical full dates, natural duration | TEXT-02/03/04, LFMT-01/02 | Exact strings can be checked automatically; idiomatic phrasing needs review | Review rendered Ukrainian planning, blocked, booking, cancellation and recovery outputs with both 1 and multiple participants |
| No blame in participant status/blocked messages | TEXT-02 | Descriptor-less spec-less prohibition remains flagged-unverified | Judge wording against neutral status facts; preserve pending review in the verification report until resolved |
| Readiness versus confirmed external booking | TEXT-03 | Transparency prohibition requires judgment beyond string matching | Confirm ready announcement does not claim an external booking, and confirm/Back wording truthfully describes manual reporting |
| Raw TEXT-03/unclassified probe | TEXT-03 | Probe engine supplied no classified predicate | Keep unresolved; review manually against named lifecycle scenarios without inventing a predicate or silently dismissing it |

Any native Telegram UAT uses .codex/skills/telegram-web-uat/SKILL.md and the current UAT/fixture restoration instructions. Historical native waivers remain valid. No live Telegram action is required during planning.

## Sign-off

- [x] All 16 tasks have a concrete automated command.
- [x] Every new test has an owning creation task before dependent use.
- [x] No watch-mode verification.
- [ ] All executed checks green with actual evidence.
- [ ] Wave 0 creation obligations completed.
- [ ] End-of-phase judgment dispositions recorded.
- [ ] nyquist_compliant and wave_0_complete updated based on execution evidence.

Approval: pending execution and verification.
