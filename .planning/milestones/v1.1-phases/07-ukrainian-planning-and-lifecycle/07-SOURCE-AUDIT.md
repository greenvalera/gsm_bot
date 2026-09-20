# Phase 7 — Source Coverage and Probe Dispositions

Research was explicitly skipped for this run. Level 0 discovery used the established typed catalogs, presentation locale resolver, pure planning projections, stable callback rows and composed PostgreSQL transport fixtures documented in 07-PATTERNS.md. No external package or integration is added. No RESEARCH file is implied.

## Multi-source coverage audit

| Source | ID | Contract | Plans | Status |
|---|---|---|---|---|
| GOAL | Phase 7 | Complete Ukrainian interactive rehearsal workflow with correct calendar/counts and safe active-round language changes | 07-01 through 07-06 | COVERED |
| REQ | LANG-06 | Subsequent rendering and ordinary active-card refresh preserve state/controls | 07-01, 07-02, 07-03, 07-04, 07-05, 07-06 | COVERED |
| REQ | TEXT-02 | Day/time, review, availability, legends, owner and controls | 07-03; formatting in 07-02 | COVERED |
| REQ | TEXT-03 | Ready/manual booking/replan/change/cancel/recovery | 07-04, 07-06 | COVERED |
| REQ | TEXT-04 | Existing instructions, errors, denials, stale and duplicate feedback | 07-01, 07-05 | COVERED |
| REQ | LFMT-01 | Civil-date/weekday/month/24-hour authoritative rendering | 07-02, 07-04, 07-06 | COVERED |
| REQ | LFMT-02 | Count and natural-duration morphology and exact integer values | 07-02, 07-03 | COVERED |
| RESEARCH | absent | User selected skip; no research-derived scope | — | NOT APPLICABLE |
| CONTEXT | D-01 | Можу / Не можу availability buttons | 07-03 | COVERED |
| CONTEXT | D-02 | Очікуємо відповідь / Може / Не може legends | 07-03 | COVERED |
| CONTEXT | D-03 | Організатор: Ім’я with safe identity | 07-03 | COVERED |
| CONTEXT | D-04 | Стати організатором with unchanged eligibility | 07-03 | COVERED |
| CONTEXT | D-05 | Усі можуть! Час бронювати репетицію. | 07-04 | COVERED |
| CONTEXT | D-06 | Студію заброньовано request control | 07-04 | COVERED |
| CONTEXT | D-07 | Студію вже заброньовано на цей час?; Так, заброньовано / Назад; same book-keep | 07-04 | COVERED |
| CONTEXT | D-08 | Цей час підходить не всім. Обери іншу дату й час.; identify unavailable participants | 07-04 | COVERED |
| CONTEXT | D-09 | Full Ukrainian weekday/genitive month; compact selectors | 07-02 | COVERED |
| CONTEXT | D-10 | Natural hours/minutes on separate duration surfaces | 07-02 | COVERED |
| CONTEXT | D-11 | Never display a year on card dates; retain authoritative internal date | 07-02 | COVERED |
| CONTEXT | D-12 | Rehearsal summary range without repeated duration in either locale | 07-02 | COVERED |
| CONTEXT | D-13 | Denials name action-specific allowed roles | 07-05 | COVERED |
| CONTEXT | D-14 | Superseded current-state navigation to /plan_status | 07-05 | COVERED |
| CONTEXT | D-15 | Exact safe retry only for definitely uncommitted actions | 07-01, 07-05 | COVERED |
| CONTEXT | D-16 | Exact repeated-action reassurance and single acknowledgement | 07-01, 07-05 | COVERED |

All 6 requirement IDs and 16 locked decisions have concrete actions. Zero source scope items are missing. Reminder-worker integration and complete outbound/runtime-image checks are Phase 8 exclusions, not Phase 7 omissions. No deferred idea is added.

## Dependency graph and ownership

| Plan | Needs | Produces | Wave | Checkpoint |
|---|---|---|---|---|
| 07-01 | Phase 6 persisted locale and composed bot | Real localized callback tracer, duplicate/retry contracts and integration fixture | 1 | None |
| 07-02 | 07-01 proven rendering/locale path | Shared date/duration/range helpers and locale renderer parameters | 2 | None |
| 07-03 | 07-02 formatting and handler parameters | Complete planning/availability cards and controls, safe locale-aware identity | 3 | None |
| 07-04 | 07-03 card/control conventions | Complete lifecycle rendering/dispatch and recovery evidence | 4 | None |
| 07-05 | 07-01 outcome contracts, 07-03 identities, 07-04 lifecycle facts | Full semantic guidance/feedback boundary coverage | 5 | None |
| 07-06 | All prior interfaces and composed fixtures | Safe same-state refresh and cold-cache/interleaving recovery evidence | 6 | End-of-phase human-check only |

Catalogs, planning-handlers, renderers and keyboards overlap across plans, so parallel plan execution would introduce conflicting edits. Each task has at most five modified files; each plan has 2–3 tasks. Explicit locale parameter propagation is costly but reversible behind existing English defaults. No data/wire-contract decision or new one-way door is introduced.

Revision scope accounting: all six plans retain 16 tasks and six sequential waves. Plan 03 has 11 unique files with task file counts 5/3/4; Plan 04 has 10 unique files with counts 5/3/5; Plan 05 has 12 unique files with counts 5/5/4. Plan 04 now explicitly declares the existing planning-keyboards.test.ts it extends. Plans 03 and 04 create their control catalog keys in Task 1 and own focused bilingual label/action-token assertions in Task 2; Task 3 retains composed journeys. Plans 03 and 05 retain bounded presentation-only scopes with named large-module seams documented in their execution constraints.

## Raw edge-probe disposition

The source 07-EDGE-PROBE.json is preserved as raw unresolved proposal. This table records planned predicates, not claims that tests already passed. Twelve classified items are lifted verbatim in substance into PLAN must_haves.truths; one unclassified item remains a flagged assumption. Equality: 13 raw items = 12 explicit planned truths + 1 flagged assumption.

| Requirement/category | Planned observable predicate | Location | Disposition |
|---|---|---|---|
| LANG-06/idempotency | Repeated same selection/answer refreshes complete locale payload without domain transition | 07-06 truths; ordinary-update integration | Explicit criterion |
| LANG-06/concurrency | Current locale captured once at next render; in-flight sends retained; existing serialization/claims preserved | 07-06 truths; interleaving integration | Explicit criterion |
| TEXT-02/adjacency | Equal markers preserve precedence; adjacent slots remain separate | 07-03 truths; localized card tests | Explicit criterion |
| TEXT-02/empty | Empty/single roster and no slots preserve eligibility and truthful output | 07-03 truths | Explicit criterion |
| TEXT-02/ordering | Equal labels keep stable ties and participant snapshot order | 07-03 truths | Explicit criterion |
| TEXT-03/unclassified | No classified predicate was supplied by the probe engine | 07-04 must_haves.assumptions and Plan 06 handoff | FLAGGED UNRESOLVED |
| TEXT-04/adjacency | Expiry equality and stale/consumed overlaps retain result precedence | 07-05 truths; boundary matrix | Explicit criterion |
| TEXT-04/empty | Missing context/token/round/identity and unknown role fail closed on existing routes | 07-05 truths | Explicit criterion |
| TEXT-04/ordering | Role/token/route decisions keep order and one branch-owned acknowledgement | 07-05 truths | Explicit criterion |
| LFMT-01/boundary | Civil-date semantics preserved across month/year/leap-day/DST edges | 07-02 truths; format tests | Explicit criterion |
| LFMT-01/precision | Integer-minute 24-hour labels have no rounding or host-timezone shift | 07-02 truths | Explicit criterion |
| LFMT-02/boundary | All 0,1,2,5,11,14,21,22,25,101,111 grammatical cases | 07-02 truths | Explicit criterion |
| LFMT-02/precision | Exact minute decomposition across 59/60/61/90/119/120/121 | 07-02 truths | Explicit criterion |

TEXT-03/unclassified must remain visible in verifier and final execution reports. Named lifecycle scenarios supply useful evidence but do not automatically resolve an unclassified probe.

## Prohibition recall and precision

Recall considered, for each requirement, presentation-driven state changes, rewritten history, automatic external booking, coercive participant wording, falsely claimed success/retry, identity disclosure, translated identifiers, locale-based permissions, timezone drift and grammatical loss.

Routine correctness items (state/identifier preservation, ordering, formatting precision) are owned by edge criteria and normal tests. Injection/access-control/privacy canon is referred to the per-plan STRIDE models and gsd-secure-phase; no duplicate canon prohibition was minted. Explicit phase exclusions remain source constraints.

Two bespoke intent constraints are retained:
1. TEXT-02: Participant status and blocked-slot copy must not shame or blame people for being unavailable.
2. TEXT-03: Readiness/manual booking wording must not imply the bot booked the studio or conceal whether external booking was confirmed.

Both are flagged-unverified, descriptor-less items. Their projection was generated with the installed projectProhibitions serializer from probe-core.cjs, then inserted into 07-03/07-04 must_haves.prohibitions. No check_kind, check_target, fixtures or invented proof is present. End-of-phase wording judgment must record their disposition.

## Hook decisions and assumptions

- Research: run-local explicit skip; global workflow config untouched.
- AI integration: no AI system in scope.
- UI safety: Telegram message presentation; no new frontend evidence or UI-SPEC requirement.
- Schema gate: no schema-relevant file is modified; no push task.
- Package legitimacy: no install task or new dependency.
- Assumption-delta: orchestrator scan reported detected=false; preference identity remains established Phase 6 storage.
- Graph: .planning/graphs/graph.json absent; no graph assumptions.
- Security: ASVS L1, high threshold; every plan has concrete threat mitigations.
- Discovery: existing internal patterns only; historical package versions are not being researched or upgraded.

## Reachability and scope

Every phrase family is consumed by the existing command/callback route and pure renderer, every keyboard label uses existing minted action tokens, and formatting helpers reach actual cards plus existing separate-duration catalog consumers. Tests drive real createBot entry points with migrated state. No new help command, automatic booking, historical rewrite or reminder-worker delivery is introduced.

The end-to-end tracer is the smallest completed user action spanning this phase's transport, existing durable reads, semantic outcome and typed presentation layers: repeat an already completed planning action and receive correct current-locale feedback. Formatting/cards/controls expand that proven path in later plans. The tracer adds no database layer, stub or new platform contract.
