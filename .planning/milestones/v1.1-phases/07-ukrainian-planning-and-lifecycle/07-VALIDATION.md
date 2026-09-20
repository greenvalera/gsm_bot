---
phase: 7
slug: ukrainian-planning-and-lifecycle
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-18
---

# Phase 7 — Validation Strategy

Execution-backed validation audit of all six plans and 16 tasks. All six requirements have automated behavioral coverage. Nyquist compliance describes that automated coverage, not completion of the pending human judgments below. Research was skipped by explicit user choice.

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

| Task ID | Wave | Requirements | Threat reference | Asserted behavior | Automated command | Test availability | Status |
|---|---|---|---|---|---|---|---|
| 07-01-01 | 1 | LANG-06, TEXT-04 | T-07-01-01/02/03 | Real consumed selection: one localized acknowledgement, independent chats, identical durable snapshot, current-language repaint | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "duplicate feedback tracer"` | localized-planning.e2e.test.ts; present and executed | green |
| 07-01-02 | 1 | LANG-06, TEXT-04 | T-07-01-01/02/03 | Rejected transaction unchanged; failed edit retains committed revision/token; uncertain send retains claim and silence | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "retry classification"` | localized-planning.e2e.test.ts; present and executed | green |
| 07-02-01 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | All weekdays/months, leap/year boundaries and two host TZs; composed day-card labels agree with token date | `npm run test:unit -- tests/unit/planning-format.test.ts` | planning-format.test.ts, localized-planning.e2e.test.ts; present and executed | green |
| 07-02-02 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | Both units at all 11 count boundaries; exact 0/59/60/61/90/119/120/121-minute decomposition and catalog parity | `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/i18n.test.ts` | planning-format.test.ts, i18n.test.ts; present and executed | green |
| 07-02-03 | 2 | LFMT-01, LFMT-02, LANG-06 | T-07-02-01/02/03 | Exact minute bounds/range-only summary; composed DST instants and later chat timezone change preserve authoritative round | `npm run test:unit -- tests/unit/planning-format.test.ts tests/unit/planning-availability-card.test.ts` | planning-format.test.ts, planning-availability-card.test.ts, localized-planning.e2e.test.ts; present and executed | green |
| 07-03-01 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Four bilingual cards, safe/masked identities, empty/single/multiple rosters, marker ties, adjacent slots and stable ordering | `npm run test:unit -- tests/unit/localized-planning-cards.test.ts` | localized-planning-cards.test.ts; present and executed | green |
| 07-03-02 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Exact answer/takeover labels, stable action tokens, omission, row geometry and 64-byte callback limit | `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-planning-cards.test.ts` | planning-keyboards.test.ts, localized-planning-cards.test.ts; present and executed | green |
| 07-03-03 | 3 | TEXT-02, LFMT-02, LANG-06 | T-07-03-01/02/03 | Real day/time/review/availability and takeover journeys; safe identities, snapshot preservation and one acknowledgement | `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts -t "planning workflow"` | i18n.test.ts, localized-planning.e2e.test.ts; present and executed | green |
| 07-04-01 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Exact readiness/blocked/manual-booking text; distinct cancellation, supersession, retraction and retired-copy facts | `npm run test:unit -- tests/unit/localized-lifecycle-cards.test.ts` | localized-lifecycle-cards.test.ts; present and executed | green |
| 07-04-02 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Booking request/apply/Back retain tokens; change/cancel bindings, omitted capabilities and BOOKED controls | `npm run test:unit -- tests/unit/planning-keyboards.test.ts tests/unit/localized-lifecycle-cards.test.ts` | planning-keyboards.test.ts, localized-lifecycle-cards.test.ts; present and executed | green |
| 07-04-03 | 4 | TEXT-03, LFMT-01, LANG-06 | T-07-04-01/02/03 | Bilingual authority rechecks, lost unanimity, Back, one booking/successor, resnapshot, cancellation notification and reanchor | `npm run test:integration -- tests/integration/localized-lifecycle.e2e.test.ts` | localized-lifecycle.e2e.test.ts, localized-lifecycle-cards.test.ts, i18n.test.ts; present and executed | green |
| 07-05-01 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Distinct semantic refusal outcomes and recovery destinations; literal Ukrainian superseded/cancelled/past-day/stale assertions | `npm run test:unit -- tests/unit/localized-planning-feedback.test.ts` | localized-planning-feedback.test.ts; present and executed | green |
| 07-05-02 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Fresh-role/route boundaries; bounded 200-unit plain owner alert, masked IDs and intact astral Unicode | `npm run test:unit -- tests/unit/localized-planning-feedback.test.ts tests/unit/callback-authority.test.ts tests/unit/planning-ownership.test.ts` | localized-planning-feedback.test.ts; present and executed | green |
| 07-05-03 | 5 | TEXT-04, LANG-06 | T-07-05-01/02/03 | Real token/actor/chat/expiry boundaries, exact expiry -1/0/+1, unchanged drafts/state, one acknowledgement; injected result mapping | `npm run test:integration -- tests/integration/localized-planning-feedback.e2e.test.ts` | localized-planning-feedback.e2e.test.ts, onboarding-feedback.test.ts, callback-authority.test.ts, i18n.test.ts; present and executed | green |
| 07-06-01 | 6 | LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02 | T-07-06-01/02/03 | Real settings switch both directions, duplicate repaint and status recovery; nonempty reminder schedule and planning invariance | `npm run test:integration -- tests/integration/planning-language-switch.e2e.test.ts -t "ordinary update"` | planning-language-switch.e2e.test.ts, planning-language-render.test.ts; present and executed | green |
| 07-06-02 | 6 | LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02 | T-07-06-01/02/03 | Full text/keyboard cache, cold module, not-modified/rejected edits, in-flight locale, serialized claims and lifecycle recovery | `npm run test:unit -- tests/unit/planning-language-render.test.ts` | planning-language-switch.e2e.test.ts, planning-language-render.test.ts, localized-lifecycle.e2e.test.ts; present and executed | green |

## Wave 0 / test creation

No dependency installation or separate foundation wave was needed. All listed test files now exist and have passing execution evidence in the six plan summaries; the ownership list below records the original creation obligations. No missing objective test gap was identified in this audit.

- Plan 01 created localized-planning.e2e.test.ts, including the named "duplicate feedback tracer" and "retry classification" cases.
- Plan 02 created planning-format.test.ts.
- Plan 03 Task 1 created localized-planning-cards.test.ts; Task 2 extends existing planning-keyboards.test.ts with focused bilingual label/token assertions before keyboard edits; Task 3 adds the "planning workflow" composed cases.
- Plan 04 Task 1 created localized-lifecycle-cards.test.ts; Task 2 extends existing planning-keyboards.test.ts with lifecycle label/token assertions before wiring; Task 3 creates localized-lifecycle.e2e.test.ts for composed journeys.
- Plan 05 created localized-planning-feedback.test.ts and localized-planning-feedback.e2e.test.ts.
- Plan 06 created planning-language-render.test.ts and planning-language-switch.e2e.test.ts, including "ordinary update" cases.

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

Any native Telegram UAT uses .codex/skills/telegram-web-uat/SKILL.md and the current UAT/fixture restoration instructions. Historical native waivers remain valid. This audit performed no live Telegram action; these four manual rows remain pending, not passed or waived by automated evidence.

## Sign-off

- [x] All 16 tasks have a concrete automated command.
- [x] Every new test has an owning creation task before dependent use.
- [x] No watch-mode verification.
- [x] All required automated checks have passing evidence; corrected integration rerun is disclosed below.
- [x] Wave 0 creation obligations completed.
- [ ] End-of-phase judgment dispositions recorded.
- [x] nyquist_compliant and wave_0_complete updated based on execution evidence.

Automated validation: complete. Phase acceptance: pending explicit human wording/prohibition/probe judgment and the independent verification verdict.

## Validation Audit 2026-09-18

| Metric | Count |
|---|---|
| Tasks with behavioral tests and passing evidence | 16/16 |
| Requirements with automated behavioral coverage | 6/6 |
| Missing objective automated gaps found | 0 |
| New tests needed / created by this audit | 0 / 0 |
| Escalated implementation failures | 0 |
| Pending manual judgment rows | 4 |

### Requirement coverage

| Requirement | Behavioral evidence | Result and limits |
|---|---|---|
| LANG-06 | `planning-language-switch.e2e.test.ts`, `planning-language-render.test.ts`, switched cases in `localized-lifecycle.e2e.test.ts` | green: real settings controls, both directions, complete payload, unchanged rows/tokens/schedule, next-render locale, cache/delivery failures and claim preservation |
| TEXT-02 | `localized-planning-cards.test.ts`, `planning-keyboards.test.ts`, `localized-planning.e2e.test.ts` planning workflow cases | green: card/control text, empty/count/order/adjacency edges, real navigation/takeover, safe identities; no-blame judgment pending |
| TEXT-03 | `localized-lifecycle-cards.test.ts`, `planning-keyboards.test.ts`, `localized-lifecycle.e2e.test.ts` | green: real booking/replan/change/cancel/recovery transitions and repeated/concurrent claim counts; transparency and raw unclassified probe pending |
| TEXT-04 | `localized-planning-feedback.test.ts`, `localized-planning-feedback.e2e.test.ts`, `localized-planning.e2e.test.ts` retry/duplicate cases; `onboarding-feedback.test.ts` and `localized-onboarding.e2e.test.ts` shared paths | green: localized route responses, exact expiry/role precedence, unchanged denied state/drafts, one acknowledgement and committed versus retry classification; wording judgment pending |
| LFMT-01 | `planning-format.test.ts`, `planning-availability-card.test.ts`, `localized-planning.e2e.test.ts` authoritative range/DST cases | green: literal dates/ranges, host TZ independence, leap/year edges, stored timezone/instants and no repeated duration; idiomatic date judgment pending |
| LFMT-02 | `planning-format.test.ts`, `i18n.test.ts`, `localized-planning-cards.test.ts`; Plan 02 `chat-readiness.e2e.test.ts` | green: all required count boundaries, independent hour/minute forms, exact decomposition and displayed totals; idiomatic duration judgment pending |

Task commands above are focused feedback commands. Their supporting composed cases are covered by the affected integration command, particularly 07-02-01/03 and 07-06-02; a unit-only invocation is not claimed to verify durable state.

### Execution evidence and provenance

- Plan 06 final affected unit union: **278/278**, 13 files, **0.838 seconds**. All named task unit files are included.
- Plan 06 affected integration union: **261/262**, 12 files, **104.28 seconds**. The old duplicate tracer expected no repaint after a locale change, contradicting Plan 06's intended ordinary refresh.
- After correcting only that assertion to require the Ukrainian body/keyboard and unchanged durable snapshot, `npm run test:integration -- tests/integration/localized-planning.e2e.test.ts tests/integration/planning-language-switch.e2e.test.ts tests/integration/localized-lifecycle.e2e.test.ts` passed **55/55**, **27.63 seconds**. The other nine files passed **207/207** in the preceding union, with no production edits between runs. Together these establish passing evidence for **262 distinct integration cases**, not a single all-green union run.
- Plan 02 additionally ran `npm run test:integration -- tests/integration/chat-readiness.e2e.test.ts`: **9/9**, **7.54 seconds**, protecting the shared natural-duration change. This earlier additional evidence is not counted in the 262-case final affected set.
- Plan 06 records passing `npm run build`, `npm run build:runtime` and `npm run format:check`; the later tracer-only edit was formatted with installed Prettier. Docker 29.1.3 was verified before the PostgreSQL runs. Scope and timing are recorded in `07-01-SUMMARY.md` through `07-06-SUMMARY.md`.
- The parent phase-verification run additionally reports `npm test`: **650/650 unit tests**, 41 files, **1.29 seconds**, on this audit date. This is unit-only evidence, not a PostgreSQL rerun.
- The parent also ran the remaining prior-phase PostgreSQL regression files (`localization-tracer.test.ts`, `chat-language-identity.test.ts`, `chat-migration.test.ts`, `chat-language-migration.test.ts`, `migration-preflight.test.ts`): **60/60**, five files, **187.26 seconds**. These are separate from the 262 Phase 7 affected integration cases.
- This audit inspected the assertions and reused the above executions; it did not rerun an unchanged full suite or create redundant tests.

### Coverage caveats (WARNING)

The semantic refusal matrix deliberately injects domain result variants behind real persisted tokens and the real dispatcher. It proves feedback mapping and non-mutation at that boundary; separate unmocked cases establish token/role/expiry behavior, and lifecycle/regression suites establish actual transitions. It does not independently prove every domain refusal is reachable from arbitrary state.

Composed Telegram tests intercept outbound API calls and inject current membership roles. They use migrated PostgreSQL but do not certify Telegram client layout or live delivery. Cold-cache tests reconstruct modules, not a deployed runtime image. These limits do not leave an objective Phase 7 task without a behavioral test; Phase 8 runtime/reminder acceptance and the four manual rows remain outside this automated sign-off.
