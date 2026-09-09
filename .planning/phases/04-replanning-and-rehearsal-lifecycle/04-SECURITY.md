---
phase: 04
slug: replanning-and-rehearsal-lifecycle
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-09-09
---

# Phase 4 — Security

Scope: the 36 distinct threats authored in the five Phase 4 plans. T-04-SC is repeated in each plan and counted once. Verification uses the implemented controls and the named tests, at ASVS level 1. This is a mitigation audit, not a claim that no other defect exists. Live Telegram acceptance remains pending.

## Trust Boundaries

| Boundary | Data and control |
|---|---|
| Telegram to command/callback handlers | Untrusted user, chat and opaque callback token; current membership and role checked |
| Handlers to planning transactions | Round identity and fresh author/admin eligibility; no authority in keyboard payload |
| Application to PostgreSQL | Token CAS, round status/revision, roster snapshots, unique week ownership and guarded migration catalog |
| Database state to Telegram messages | Escaped/masked labels, bounded alerts, terminal card projection and notification cooldown |
| Civil-date calculation to history/default selection | Injected chat-local date, bounded week search and strict scheduled-end boundary |

## Threat Register

Paths in evidence are repository-relative basenames: service is src/domain/planning/planning-service.ts; handlers/renderers are src/telegram; test names are under tests/unit or tests/integration.

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidence | Status |
|---|---|---|---|---|---|---|
| T-04-01 | Elevation of Privilege | `replanRound()` eligibility | high | mitigate | planning-service.ts replanRound: tap-time role, author/admin check before writes; planning-replan.test.ts eligible administrator and refused member cases. | closed |
| T-04-02 | Elevation of Privilege | The non-destructive role accessor | high | mitigate | planning-handlers.ts roleResolver and replan dispatch use currentRole; handlers.ts command boundaries require current membership; planning ownership/authorization unit regressions. | closed |
| T-04-03 | Tampering | Concurrent replan / concurrent `/plan` | high | mitigate | replanRound consumes with updateMany count=1, advisory round lock, supersedeAndCreate status/revision CAS and week-taken rollback; planning-replan.test.ts race and collision cases. | closed |
| T-04-04 | Tampering | Migration against an inherited or drifted database | high | mitigate | migrate-deploy.mjs exact enum/catalog/physical-column comparison; migration-preflight.test.ts fresh, stopped-one-short and mid-list enum rejection cases. | closed |
| T-04-05 | Information Disclosure | Blocked card naming the blocker | medium | mitigate | planning-renderers.ts blocker lists use memberLabel and its masked fallback/single HTML escaper; planning-availability-card.test.ts. | closed |
| T-04-06 | Information Disclosure | Ineligible-actor refusal copy | medium | mitigate | PLANNING_LIFECYCLE_NOT_ELIGIBLE and replan refusal name eligible roles only; planning-logging.test.ts and lifecycle Telegram refusal tests. | closed |
| T-04-07 | Denial of Service | Over-long callback alert leaving a tap unacknowledged | low | mitigate | planning-handlers.ts boundedLabel counts UTF-16 units and iterates code points; planning-logging.test.ts alert bounds. | closed |
| T-04-08 | Repudiation | Who replanned a round | low | accept | Accepted: successor authorUserId and supersededByRoundId retain attribution; no separate audit-event table. | closed |
| T-04-09 | Tampering | Single-process `sequentialize` precondition | medium | accept | Accepted deployment precondition: exactly one polling process with chat-key sequentialize; request-token mint uniqueness is not a multi-process guarantee. | closed |
| T-04-SC | Tampering | npm/pip/cargo installs | low | accept | Accepted with corrected premise: no new dependency or version was introduced. Existing dependencies were restored from the committed lockfile; this is not zero install activity. | closed |
| T-04-10 | Denial of Service | Group-notification flooding via the blocked announcement | high | mitigate | claimReadyAnnouncementWindow puts the shared 30-minute readyAnnouncedAt window in its update WHERE; planning-availability.test.ts blocked/reblock cooldown cases. | closed |
| T-04-11 | Elevation of Privilege | A superseded or cancelled round winning the right to notify the group | high | mitigate | claimReadyAnnouncementWindow retains status CONFIRMED in WHERE; terminal claims cannot update; planning-availability.test.ts terminal-status cases. | closed |
| T-04-12 | Spoofing | A stale token mutating the active round | high | mitigate | Persisted target round identity is loaded and terminal statuses refused before mutation; planning-logging.test.ts old answer and booking cases and planning-replan.test.ts retained tokens. | closed |
| T-04-13 | Information Disclosure | Blocked announcement naming the blocker in permanent group history | medium | mitigate | renderBlockedAnnouncement suppresses username and replaces ASCII @ in names before memberLabel; planning-availability-card.test.ts mention/escaping assertions. | closed |
| T-04-14 | Denial of Service | Over-long or unbounded refusal alert leaving a tap unacknowledged | low | mitigate | PLANNING_REPLANNED_TEXT and PLANNING_ALREADY_CANCELLED have distinct copy and <=200 UTF-16 unit tests in planning-logging.test.ts. | closed |
| T-04-15 | Repudiation | A new refusal reusing another branch's log vocabulary | low | mitigate | Distinct route/outcome/reason entries for terminal refusals and lifecycle actions; planning-logging.test.ts branch vocabulary checks. | closed |
| T-04-16 | Elevation of Privilege | Cancellation by a demoted administrator | high | mitigate | requestCancel and applyCancel resolve the role independently at each invocation; openLifecycleGate checks current role/author before any write; planning-cancel.test.ts demotion/refused-token cases. | closed |
| T-04-17 | Elevation of Privilege | An eligibility claim captured at render time | high | mitigate | Callback wire data is an opaque token; callback-schema.ts includes action/round target only; eligibility is decided from the database and roleResolver, never from rendered flags. | closed |
| T-04-18 | Denial of Service | Unbounded live-capability inflation from a request/keep loop | high | mitigate | requestCancel expires previous unconsumed apply/keep targets after openLifecycleGate eligibility, within one transaction; planning-cancel.test.ts repeated pair and decline coverage. | closed |
| T-04-19 | Tampering | Concurrent cancel and book on the same round | high | mitigate | applyCancel uses token CAS then status/revision CAS; lost race releases token in the transaction; planning-cancel.test.ts answer race/stale/replay plus planning-booking.test.ts terminal guards. | closed |
| T-04-20 | Repudiation | Who cancelled a booked rehearsal | medium | mitigate | applyCancel writes status, cancelledAt, cancelledByUserId, released week and revision together; schema and migration keep details nullable; planning-cancel.test.ts asserts stored attribution. | closed |
| T-04-21 | Information Disclosure | The not-eligible refusal naming who holds power | medium | mitigate | Cancellation refusal contains roles only; planning-logging.test.ts and planning-cancel-telegram.test.ts unauthorized actor coverage. | closed |
| T-04-22 | Spoofing | A cancelled round re-acquiring a keyboard | medium | mitigate | CANCELLED is excluded from RECOVERABLE_ROUND_STATUSES; planning-cancel.test.ts recovery exclusion and Telegram terminal-card tests. | closed |
| T-04-23 | Tampering | Single-process `sequentialize` precondition | medium | accept | Accepted deployment precondition: cancellation confirmation pairs run under single-process chat serialization; round advisory lock also serializes lifecycle operations. | closed |
| T-04-24 | Tampering | A change claiming a week the claim check never saw | high | mitigate | supersedeAndCreate copies oldRound.targetWeekStart verbatim, accepting no alternate week argument; planning-replan.test.ts and planning-change-telegram.test.ts same-week cases. | closed |
| T-04-25 | Elevation of Privilege | Change by a demoted administrator | high | mitigate | requestChange/applyChange resolve role independently; shared gate author/admin decision precedes writes; planning-replan.test.ts and planning-change-telegram.test.ts demotion cases. | closed |
| T-04-26 | Denial of Service | Unbounded live-capability inflation from a change request/keep loop | high | mitigate | requestChange expires previous apply/keep pair after the shared gate; planning-replan.test.ts replacement/decline loop. | closed |
| T-04-27 | Tampering | Concurrent change and planning start racing for one week | high | mitigate | Successor active-week uniqueness is preserved; transaction catches P2002 as week-taken and rolls back consumption/supersession; planning-replan.test.ts change collision case. | closed |
| T-04-28 | Tampering | Two divergent supersede-and-create implementations | medium | mitigate | Exactly two callers of supersedeAndCreate: replanRound and applyChange. planning-replan.test.ts compares durable fields and spies on one shared result mutation; Telegram effects share deliverSuccessor. | closed |
| T-04-29 | Information Disclosure | The not-eligible refusal naming who holds power | medium | mitigate | Change reuses the role-only lifecycle refusal; planning-logging.test.ts and planning-change-telegram.test.ts unauthorized actor coverage. | closed |
| T-04-30 | Tampering | Single-process `sequentialize` precondition | medium | accept | Accepted deployment precondition: change confirmation pairs use the same single polling process and chat serialization. | closed |
| T-04-31 | Elevation of Privilege | Previous-participant standing widened to any snapshotted round | medium | accept | Accepted D-19: wasPreviousParticipant checks any persisted round snapshot. Replanned DRAFT snapshots also confer standing; roster removal does not revoke historical standing. | closed |
| T-04-32 | Elevation of Privilege | Denial of standing to people who have it | medium | mitigate | wasPreviousParticipant has no status filter; planning-round.test.ts cancelled/superseded positive cases and never-snapshotted negative case. | closed |
| T-04-33 | Tampering | A cancelled slot seeding future defaults | high | mitigate | previousRehearsal restricts status to CONFIRMED/BOOKED; planning-round.test.ts explicitly checks cancelled and superseded exclusions after scheduled end. | closed |
| T-04-34 | Denial of Service | An unbounded or cyclic week search | medium | mitigate | target-week.ts has one isPastDay implementation, no service import, MAX_WEEK_LOOKAHEAD=52, and unchanged two-argument targetWeekStart; target-week/day-card unit tests. | closed |
| T-04-35 | Repudiation | A rehearsal in progress reported as the previous one | low | mitigate | previousRehearsal uses endsAt < now without fallback, preserving startsAt descending order; planning-round.test.ts future end, exact end, just-past end and mixed-duration cases. | closed |

## Accepted Risks Log

These dispositions were already recorded in the authorized plans; this audit does not introduce new risk acceptance.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| AR-01 | T-04-08 | Successor attribution and predecessor link are sufficient for the band-chat audit trail. | Authorized Phase 4 plan | 2026-09-08 |
| AR-02 | T-04-09, T-04-23, T-04-30 | Exactly one polling process; chat-key serialization remains a deployment precondition for request-token mint uniqueness. Round advisory locks protect transition ordering but do not certify multi-process deployment. | Authorized plans / inherited Phase 3 precondition | 2026-09-08 |
| AR-03 | T-04-31 | Any persisted selected-participant snapshot confers previous-participant standing, including replanned drafts. Roster removal does not revoke this historical standing. This corrects the plan premise that snapshots existed only at confirm. | D-19 and authorized execution | 2026-09-09 |
| AR-04 | T-04-SC | No package/version was added. Exact-lockfile dependency restoration occurred, so the plan wording of zero installation activity is not literal. package.json and package-lock.json have no phase diff. The restoration reported five existing high audit advisories; no dependency upgrade or audit fix was performed. | Authorized existing-lockfile restoration; plan disposition retained | 2026-09-09 |

## Operational and Delivery Limits

- Keep one long-polling bot process. A future multi-process deployment must revisit request-token uniqueness, not merely add another worker.
- Telegram delivery follows the durable transaction. Failed edits are logged and do not undo cancellation or supersession; no outbox was introduced. In particular, a failed retraction after announcement pointer clearing can leave an old message without a durable retry address.
- Day selectability is date-only. Today remains selectable even after every generated hour has passed; hour-level rollover is outside the authorized phase.
- Real rendering, command discovery and notification presentation require the Phase 4 UAT runbook. Review findings and their corrections are tracked in 04-REVIEW.md and 04-UI-REVIEW.md.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open at/above high | Run By |
|---|---|---|---|---|
| 2026-09-09 | 36 | 36 | 0 | Codex, plan-time register and actual implementation/test inspection at L1 |

## Sign-Off

Review follow-up `8823a3b` extends terminal refusal classification to saved draft day/time/back/confirm actions. The existing action validation and consumed-token replay checks still precede the new same-chat terminal classification. `planning-lifecycle-review.test.ts` exercises saved controls after Change/Cancel and verifies the successor remains unchanged. This closes the D-09 recovery-copy gap without weakening token or round binding.

The confirmation recovery follow-up adds `reanchorLifecycleConfirmation` with expected status, revision, and both existing message pointers in the compare-and-set. It moves only the prior lifecycle slot, preserving the separate availability anchor when the announcement moves. It does not widen status-repost eligibility or introduce a new schema/dependency. The original author/admin confirmation gate remains the entry boundary; stale tracking results must strip the new orphan keyboard and give recovery advice.

- [x] All 36 threats have a disposition.
- [x] Existing accepted risks and corrected premises are recorded.
- [x] All high threats have implemented mitigations; threats_open: 0.
- [x] status: verified; live UAT remains separate.

**Approval:** automated mitigation verification, 2026-09-09.
