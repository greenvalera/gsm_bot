---
phase: 02
slug: weekly-rehearsal-proposal
status: blocked
threats_open: 1
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-09-03
updated: 2026-09-03
---

# Phase 02 — Security

> ASVS Level 1 verification of the threat register declared across plans 02-01 through 02-11. Duplicate threat IDs are consolidated at their strictest declared severity.

## Trust Boundaries

| Boundary | Description | Data crossing |
|----------|-------------|---------------|
| Telegram → callback boundary | Untrusted commands, callback tokens, actor/chat identity, and display names enter the bot | Authorization claims, identifiers, user-controlled text |
| Callback boundary → planning domain | Parsed opaque actions request durable workflow transitions | Round/action IDs and requested transitions |
| Planning domain → PostgreSQL | Transactions persist rounds, callback capabilities, roster snapshots, and cooldowns | Scheduling state and membership identity |
| Mutable chat settings → round snapshot | Current configuration seeds a durable in-flight proposal | Timezone, duration, daily window, access policy |
| Migration runner → inherited database | Forward migrations alter existing production data structures | Existing rounds, participants, enum values, constraints |
| Planning domain → Telegram/logs | Cards, alerts, and bounded structured events leave the trust boundary | Member labels, planning state, operational metadata |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Verified mitigation / evidence | Status |
|-----------|----------|-----------|----------|-------------|--------------------------------|--------|
| T-02-01 | Elevation of privilege | Planning ownership | high | mitigate | Durable author check in `planning-service.ts`; full control matrix in `planning-ownership.test.ts` | closed |
| T-02-02 | Tampering | Callback chat/expiry binding | high | mitigate | Boundary validates actor, chat, and expiry; mismatch cases in `callback-authority.test.ts` | closed |
| T-02-03 | Repudiation | Callback consumption | high | mitigate | Transactional token CAS plus revision guards; confirm concurrency coverage | closed |
| T-02-04 | Tampering | Active-week uniqueness | high | mitigate | PostgreSQL compound uniqueness and raw duplicate-insert test | closed |
| T-02-05 | Elevation of privilege | Takeover | high | mitigate | Fresh role check plus transactional inactivity/ownership recheck | closed |
| T-02-06 | Tampering | Telegram HTML cards | high | mitigate | Bounded render input and escaped member labels with hostile-name tests | closed |
| T-02-07 | Denial of service | Status flood | medium | mitigate | Atomic status cooldown claims with concurrency coverage | closed |
| T-02-08 | Denial of service | Callback row growth | low | accept, superseded | Seven-day post-expiry retention sweep and expiry index now mitigate the former accepted risk | closed |
| T-02-09 | Information disclosure | Structured logs | medium | mitigate | Scalar allow-list redactor and schedule/identity leakage tests | closed |
| T-02-10 | Elevation of privilege | Telegram membership lookup | high | mitigate | Lookup failure maps to `unknown` and fails closed | closed |
| T-02-11 | Tampering | Mid-round settings edits | high | mitigate | Round-local settings snapshot drives selection and confirm revalidation | closed |
| T-02-12 | Elevation of privilege | Shared callback boundary | critical | mitigate | Fresh role resolution precedes token parse/read; Phase 1 admin routes remain current-admin; unit/integration matrix passes | closed |
| T-02-13 | Tampering | Anchor re-post | medium | mitigate | Anchor and cooldown update atomically; superseded keyboard cleared | closed |
| T-02-14 | Tampering | Planning authorization | high | mitigate | Route-resolved denial preserves token/drafts; destructive denial remains admin-only | closed |
| T-02-15 | Repudiation | Requirement traceability | medium | mitigate | PLAN-09 is retained with replacement rationale in requirements | closed |
| T-02-16 | Tampering | Roadmap integrity | medium | mitigate | Phase 1 traceability and all checked Phase 2 plans remain present | closed |
| T-02-17 | Tampering | Day selection | high | mitigate | Tap-time round snapshot, week, ownership, and past-date checks before consumption | closed |
| T-02-18 | Tampering | Time selection | high | mitigate | Eligible slots regenerated from round snapshot before mutation | closed |
| T-02-19 | Tampering | DST skipped time | high | mitigate | Nonexistent civil time has no instant and is rejected; DST fixtures cover it | closed |
| T-02-20 | Denial of service | Empty lineup | medium | mitigate | Confirm locks/reads roster and refuses empty participant set before consumption | closed |
| T-02-21 | Repudiation | Takeover attribution | medium | mitigate | Durable current owner is rendered and covered by takeover tests | closed |
| T-02-22 | Denial of service | Stale round cleanup | high | mitigate | Stale drafts are superseded without deleting history | closed |
| T-02-23 | Information disclosure | Plain identity labels | high | mitigate | Shared precedence masks raw Telegram IDs; alert tests cover fallback | closed |
| T-02-24 | Tampering | HTML identity labels | high | mitigate | HTML label is derived through the shared escaper; hostile-name cases pass | closed |
| T-02-25 | Information disclosure | Non-member refusal | low | mitigate | Presence-only static refusal contains no round or member detail | closed |
| T-02-26 | Elevation of privilege | Route authority union | high | mitigate | Discriminated authority type preserves current-admin and member-author routes | closed |
| T-02-27 | Tampering | Roadmap gap edit | high | mitigate | Scoped cleanup preserved all 37 checked Phase 2 plan entries | closed |
| T-02-28 | Repudiation | Owner decision | medium | mitigate | Blocking-human choice and exact `drop-mode` response recorded in 02-08 summary | closed |
| T-02-29 | Tampering | Participant membership FK | high | mitigate | Restrictive foreign key plus missing-parent/delete-rejection integration tests | closed |
| T-02-30 | Denial of service | Inherited-database migration | high | mitigate | No executable preflight currently counts legacy `ABANDONED` rounds and dangling participant memberships before `prisma migrate deploy` | **open** |
| T-02-31 | Elevation of privilege | Callback action vocabulary | medium | mitigate | Zod union accepts only the five minted planning actions | closed |
| T-02-32 | Repudiation | Logging vocabulary | low | mitigate | Dead action branch removed; unknown action still reaches bounded stale trace | closed |
| T-02-33 | Denial of service | Lost revision race | high | mitigate | Shared transactional token-release CAS covers day/time/back/confirm/takeover guards | closed |
| T-02-34 | Tampering | Successful token consumption | high | mitigate | Successful transitions retain consumed tokens; takeover success is covered | closed |
| T-02-35 | Repudiation | Callback ledger | medium | mitigate | Integration assertions inspect durable token and round state together | closed |
| T-02-36 | Denial of service | Race-test determinism | medium | mitigate | Named interception point and invariant-based concurrency tests pass repeatedly | closed |
| T-02-37 | Tampering | Confirm lineup race | high | mitigate | `FOR SHARE` lock precedes lineup read; separate connection observes lock | closed |
| T-02-38 | Denial of service | Membership lock scope | medium | mitigate | Lock is transaction-scoped around database-only confirm work | closed |
| T-02-39 | Denial of service | Callback retention | high | mitigate | Chat-scoped expiry sweep removes actions more than seven days past expiry | closed |
| T-02-40 | Denial of service | Live capability deletion | high | mitigate | Retention boundary preserves live/recent tokens across action kinds and chats | closed |
| T-02-41 | Denial of service | Housekeeping failure | medium | mitigate | Best-effort deletion failure cannot refuse `/plan` or `/plan_status` | closed |
| T-02-42 | Repudiation | Planning history deletion | high | mitigate | Planning cleanup deletes callback actions only; no round/participant deletion path | closed |
| T-02-SC | Tampering | Dependency supply chain | high | mitigate | Phase 02 introduced no dependency or lockfile delta | closed |

## Blocking Threat Detail

### T-02-30 — inherited-database migration preflight

The migration replaces the PostgreSQL enum before adding indexes and the participant foreign key. The plan required two zero-count preflights—legacy `ABANDONED` rounds and dangling participant memberships—but the merged tree has no executable script, CI guard, or deploy wrapper that runs those checks before applying migrations to an inherited database. `package.json` still invokes bare `prisma migrate deploy`, while CI proves only a fresh-database replay.

Required closure: add an executable deployment preflight that runs both queries, exits non-zero when either count is non-zero, and is invoked before migration deployment against inherited databases. Add automated coverage for both clean and blocked cases.

## Accepted Risks Log

No currently accepted risks. T-02-08 was formerly accepted at low severity and is now superseded by the implemented retention sweep.

## Unregistered Flags

None.

## Verification Runs

- `npm run typecheck` — passed.
- Focused security unit suites — 8 files, 159 tests passed.
- Focused PostgreSQL integration suites — 4 files, 35 tests passed.
- Token-release concurrency suite — passed three consecutive merged-tree runs.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Blocking Open | Run By |
|------------|---------------|--------|---------------|--------|
| 2026-09-03 | 43 | 42 | 1 | Codex / `gsd-security-auditor` |

## Sign-Off

- [x] All threats have a disposition
- [x] Accepted-risk history is documented
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** blocked on T-02-30 as of 2026-09-03.
