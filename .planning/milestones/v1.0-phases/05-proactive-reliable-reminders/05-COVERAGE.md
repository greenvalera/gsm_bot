# Phase 05 Source Coverage and Implementation Assumptions

Planning audit only; COVERED means assigned, not executed or verified.

## External API decisions

This matrix makes the existing Phase 5 scope machine-readable for the verify-pre gate. It records integration decisions, not native acceptance results. The source traceability matrix below remains unchanged.

| Capability | Decision | Reason |
|---|---|---|
| Telegram group text messages and inline keyboards | INTEGRATE | Planning reminders and pending-participant follow-ups in plans 03, 05 and 07. |
| Telegram callback acknowledgement and current member authorization | INTEGRATE | Start uses the existing current-policy authorization boundary in plan 05. |
| Telegram text mentions and message navigation | INTEGRATE | Plan 07 renders pending identities and current-card links or basic-group replies. |
| Telegram message editing and migration updates | INTEGRATE | Plans 07 and 09 preserve current publication anchors and migrated chat identity. |
| Telegram long polling | INTEGRATE | Existing single-poller transport with durable update handling in plans 02, 03 and 09. |
| Telegram private-message reminders | OPT-OUT | Explicitly excluded by the milestone scope; reminders belong in the group. |
| Telegram native polls | OPT-OUT | Project decisions require custom roster-aware inline cards. |
| Telegram webhooks | OPT-OUT | The deployment retains one long-poll worker. |
| Telegram payments, commerce, media, games, stories and business APIs | OPT-OUT | These capabilities do not support the scoped rehearsal reminder workflow. |
| Telegram account and group administration mutations | OPT-OUT | Reminder delivery reads current authorization; it does not administer user accounts or group roles. |
| External rehearsal booking services | OPT-OUT | Booking automation is explicitly outside the milestone. |

| Source | ID | Capability | Plan | Status |
|---|---|---|---|---|
| GOAL | Phase 5 | Only currently useful reminders across duplicate updates/restarts | 03–10 | COVERED |
| REQ | REM-01 | Current-week daily start reminder and quiet cancellation exception | 04–06 | COVERED |
| REQ | REM-02 | Active process suppression and permitted Start | 04–05 | COVERED |
| REQ | REM-03 | Current schedule, viable pending slot, grace/spacing/start cutoff | 04,06–08 | COVERED |
| REQ | REM-04 | Real pending snapshot mentions | 07 | COVERED |
| REQ | REM-05 | Lifecycle, schedule and migrated identity invalidation | 06–09 | COVERED |
| REQ | RELI-02 | Durable occurrence/update idempotency and terminal uncertainty | 02–03,05,08–09 | COVERED |
| REQ | RELI-03 | Recovery, generation boundaries and startup/shutdown | 02–04,06,08–10 | COVERED |
| CONTEXT | D-01 | 10:00 current-week reminders; active draft suppresses | 04 | COVERED |
| CONTEXT | D-02 | Next-week reminders wait for next Monday | 04 | COVERED |
| CONTEXT | D-03 | Durable cancellation quiet week; manual planning available | 06 | COVERED |
| CONTEXT | D-04 | Target week and authorized Start without mentions | 05 | COVERED |
| CONTEXT | D-05 | Next future 10:00 after initial setup | 04,06 | COVERED |
| CONTEXT | D-06 | Date/time, pending mentions and current-card navigation | 07 | COVERED |
| CONTEXT | D-07 | Blocked pause, scheduled resume, exact successor snapshot | 06–07 | COVERED |
| CONTEXT | D-08 | Start/lifecycle cutoff | 06–07 | COVERED |
| CONTEXT | D-09 | Skip due occurrences inside publication grace | 07–08 | COVERED |
| CONTEXT | D-10 | At least 30 minutes between actual attempts | 07–08 | COVERED |
| CONTEXT | D-11 | Inclusive two-hour latest relevant coalesced recovery | 08 | COVERED |
| CONTEXT | D-12 | Unknown occurrence never retries | 03,08 | COVERED |
| CONTEXT | D-13 | Immediate catch-up even near next scheduled occurrence | 08 | COVERED |
| CONTEXT | D-14 | Technical logs only for outage/recovery | 03,08–09 | COVERED |
| CONTEXT | D-15 | Saved schedules immediately supersede old work | 06 | COVERED |
| CONTEXT | D-16 | New settings generate future work only | 06 | COVERED |
| CONTEXT | D-17 | New timezone preserves reminder wall time, fixed rehearsal | 06 | COVERED |
| CONTEXT | D-18 | Settings preserve grace and spacing | 06 | COVERED |
| RESEARCH | Persistence | Ledger, unique identity, claim/spacing locks and attempt outcomes | 01–03,08 | COVERED |
| RESEARCH | Provisioning | Exact-pin audit, migration-first queue/schema, fresh/upgrade/repeat deploy | 01–02,10 | COVERED |
| RESEARCH | Integration | Shared chat coordination, current authorization, setup/settings/cancel transactions | 03,05–06 | COVERED |
| RESEARCH | Calendar | DST, activation, current week and timezone quiet-week handling | 04,06 | COVERED |
| RESEARCH | Publication | Acknowledged initial/current anchors, legacy and migration recovery | 07,09 | COVERED |
| RESEARCH | Presentation | Pending identity, escaping, bounded text, supported group navigation | 07,10 | COVERED |
| RESEARCH | Delivery | Recovery, known rejection/unknown, crashes, coalescing and spacing | 08 | COVERED |
| RESEARCH | Runtime | Single poller, bounded repair, no runtime DDL, resource cleanup | 02–03,09–10 | COVERED |
| RESEARCH | Validation | Real DB races/restart, regressions, native UAT and fixture restore | 02–10 | COVERED |

No deferred ideas exist in context. Booking automation, private reminders and removed per-round participant adjustment remain excluded by milestone scope. The requirement ledger now contains the D-03 cancellation and D-07/D-08 followup exceptions; original research quotes are historical.

## Explicit implementation assumptions

These are planner resolutions of research responsibilities, not claims of user-selected policy:

- A-DST: Skip a nonexistent reminder wall time; choose the earlier overlap instant once. Plan 04 tests the existing resolver outputs.
- A-NAV: Public/private supergroups use documented message links; basic groups use native reply navigation to the acknowledged current card. Plan 10 must observe client behavior; an unavailable fixture is not a pass.
- A-WEEK: Timezone edits retain the original cancellation no-earlier-than resume instant and suppress the cancelled civil week in the new zone. A crossing may defer an extra occurrence; Plan 06 tests this conservative boundary.
- A-PUB: Legacy rounds without acknowledged publication remain silent until status recovery. Ordinary same-round reanchor preserves first grace; migration needs a fresh acknowledged usable card and recovery grace. Plan 07 tests both.
- A-ACTIVATION: Setup at exactly 10:00 schedules the next future 10:00. Existing configurations activate once at deployment, without pre-feature backlog.
- A-COALESCE: Select the latest eligible missed occurrence per immutable reminder stream. Current-state guards are checked under coordination immediately before send reservation.
- A-CAPACITY: Preserve every pending mention by shortening labels; a message exceeding Telegram capacity even with minimal labels is recorded unsendable rather than omitting participants or splitting one occurrence. This boundary is tested and logged.

## Spec-less edge probe disposition

No SPEC supplied edges. The deterministic original-wording probe supplied ten rows. Five classified rows are resolved with explicit truths; five unclassified rows stay flagged/unresolved, even though source decisions supply normal implementation criteria.

| Requirement | Category | Disposition | Evidence assignment |
|---|---|---|---|
| REM-01 | unclassified | FLAGGED ASSUMPTION — unresolved classifier coverage | Current-week/setup/quiet-week decisions implemented in 04/06; no claim of exhaustive edge classification |
| REM-02 | unclassified | FLAGGED ASSUMPTION — unresolved classifier coverage | Draft suppression tests in 04; further edge classification remains unverified |
| REM-03 | unclassified | FLAGGED ASSUMPTION — unresolved classifier coverage | Grace/spacing/start/DST tests in 04/07; no invented classifier result |
| REM-04 | adjacency | resolved, explicit | Plan07 truth: A/C pending around answered B mention only A/C |
| REM-04 | empty | resolved, explicit | Plan07 truth: zero pending produces no message |
| REM-04 | ordering | resolved, explicit | Plan07 truth: snapshot order survives query/response order differences |
| REM-05 | unclassified | FLAGGED ASSUMPTION — unresolved classifier coverage | Lifecycle/migration tests in 06/09; classifier coverage remains unresolved |
| RELI-02 | idempotency | resolved, explicit | Plan08 truth: replay preserves record/transition counts |
| RELI-02 | concurrency | resolved, explicit | Plan08 truth: distinct occurrences contend on one round spacing reservation |
| RELI-03 | unclassified | FLAGGED ASSUMPTION — unresolved classifier coverage | Recovery/crash tests in 08/09; not an exhaustive edge certification |

Accounting: 10 surfaced = 5 explicit truths + 5 flagged assumptions. These flags must remain visible to phase verification; they do not justify claiming implementation failure or requesting new product preferences during planning.

## Prohibition recall and precision

Recall considered unwanted public shaming, private-message escalation, tagging answered members, duplicate spam, stale authority, hidden delivery guarantees, credential exposure and unrelated automatic booking across the seven requirements. Precision drops ordinary duplicate/ordering/empty-state correctness (owned by the edge tests); private reminders/booking and pending-only mentions are already explicit product scope and decisions, not newly discovered omissions. Credential/authorization/injection concerns are canon — covered by the plan threat models and gsd-secure-phase, not minted here. No novel bespoke prohibition survives without inventing an unasked product policy. Thus surfaced prohibition items = 0, authored prohibition items = 0; no descriptor or phantom check is manufactured.

## Dependency and reachability audit

Plan01 gates exact dependency/storage choices. Plan02 is the mandatory deploy/provisioning prerequisite. Plan03 leads application behavior with the real queue→database→Telegram tracer. Plans04–09 expand that same path; shared ReminderService/handler files make those waves sequential. Plan10 verifies and collects native evidence. Every queue entry reaches the runtime reconciler, every callback reaches current-policy authorization, every occurrence scopes a real chat/week or immutable round, and settings/publication/migration state is written by existing reachable actions.

Calibration: factor 1, sample_count 0, confidence low (queried 2026-09-13). Estimates include reading large existing planning handlers/services and real-DB verification. New tests are pending execution.
