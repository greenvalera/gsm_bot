---
phase: 05
slug: proactive-reliable-reminders
status: verified
threats_open: 0
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
created: 2026-09-13
verified_source: 8f2ffda
---

# Phase 05 — Security

Independent `gsd-security-auditor` verification closed all 31 unique authored threats against the implemented controls and negative-case evidence. `T-05-SC` is shared by Plans 01 and 02 and counted once. This is an application mitigation verdict, not a clean dependency audit or native Telegram acceptance.

## Trust Boundaries

| Boundary | Control | Data crossing |
|---|---|---|
| Telegram and queue to application | Fresh authorization, exact durable identities, current-state reload and opaque callbacks | Untrusted update/callback/queue identifiers |
| Application to PostgreSQL | Transactional state changes, unique occurrence identities and attempt ownership | Chat/round identities, participant snapshots and scheduling state |
| Application to Telegram | Commit reservation before transport; consume uncertain delivery; escape authoritative presentation | Reminder text, pending mentions and card navigation |
| Dependency provisioning to runtime | Exact reviewed pin and construction SQL; deployment owns schema; runtime rejects mismatch | Queue schema, version and reviewed options |

## Threat Register

All dispositions are `mitigate`; all statuses are `closed`. Evidence paths are relative to the repository root.

| Threat ID | Category | Component | Severity | Disposition | Mitigation and verification evidence | Status |
|---|---|---|---|---|---|---|
| T-05-01-01 | Tampering | Durable schema | high | mitigate | Exact round/chat FK and occurrence uniqueness in reminder ledger migration; exact catalog comparison in `prisma/migrate-deploy.mjs` | closed |
| T-05-01-02 | Information disclosure | Diagnostics | high | mitigate | `src/shared/logger.ts` allowlist and secret sanitization; fixed provisioning error messages | closed |
| T-05-01-03 | Denial of service | Reconciliation | medium | mitigate | Bounded 100-row scan and unique ledger identities | closed |
| T-05-02-01 | Tampering | Queue provisioning | high | mitigate | Exact pg-boss 12.27.0 manifest/lock pin; installed construction comparison and schema/version/options checks in `prisma/provision-reminders.mjs` | closed |
| T-05-02-02 | Information disclosure | Queue diagnostics | high | mitigate | SafeLogger, identity-only queue payload and no raw provisioning errors | closed |
| T-05-02-03 | Denial of service | Queue | medium | mitigate | Short policy, bounded retry/expiry/retention and batch size one in `src/infrastructure/jobs/reminder-queue.ts` | closed |
| T-05-03-01 | Tampering | Dispatch | high | mitigate | Transactional chat lock and conditional RESERVED claim before external transport in `reminder-service.ts`; tracer tests | closed |
| T-05-03-02 | Information disclosure | Delivery diagnostics | high | mitigate | Finite reason classifications and IDs; no raw Telegram errors | closed |
| T-05-03-03 | Denial of service | Coordination | medium | mitigate | Bounded scan; sorted unique key acquisition and release in `src/shared/chat-coordinator.ts` | closed |
| T-05-04-01 | Tampering | Eligibility | high | mitigate | Activation, generation, migration and current-state checks in `reminder-policy.ts` and dispatch transaction | closed |
| T-05-04-02 | Information disclosure | Calendar policy | high | mitigate | Pure calendar/occurrence modules perform no logging; transport diagnostics use SafeLogger | closed |
| T-05-04-03 | Denial of service | Occurrence generation | medium | mitigate | Bounded civil enumeration, deduplicated minutes and skipDuplicates insertion | closed |
| T-05-05-01 | Tampering | Public Start callback | high | mitigate | Fresh current role/policy authorization; token lock, exact chat/expiry/target guards in planning service and handlers | closed |
| T-05-05-02 | Information disclosure | Planning reminder | high | mitigate | Week-only presentation and opaque persisted UUID capability; no names or authorization claims in callback | closed |
| T-05-05-03 | Denial of service | Callback replay | medium | mitigate | Consumed-action duplicate guard; token consumption commits with round creation/resume; rollover and replay tests | closed |
| T-05-06-01 | Tampering | Setup/settings | high | mitigate | Activation and generation replacement commit inside existing setup/settings transactions | closed |
| T-05-06-02 | Information disclosure | Settings diagnostics | high | mitigate | Reminder helpers add no participant payload logging; shared logger sanitizes configured secrets | closed |
| T-05-06-03 | Denial of service | Invalidation | medium | mitigate | Old-generation obsolescence, exact-round invalidation and conditional callback consumption | closed |
| T-05-07-01 | Tampering | Publication anchor | high | mitigate | Exact round/chat/message/status acknowledgment guard; dispatch reloads current acknowledged anchor | closed |
| T-05-07-02 | Information disclosure | Follow-up presentation | high | mitigate | Authoritative round snapshot, pending-only mentions, escaped labels and validated navigation | closed |
| T-05-07-03 | Denial of service | Follow-up bounds | medium | mitigate | 4096-character bound, original/actual spacing and durable blocked-occurrence suppression | closed |
| T-05-08-01 | Tampering | Recovery/ownership | high | mitigate | Exact observed abandoned identity, conditional attempt ownership, newer-delivery guard and strict rejection classifier | closed |
| T-05-08-02 | Information disclosure | Outcome logs | high | mitigate | Only IDs and finite reasons; no raw transport errors or participant text | closed |
| T-05-08-03 | Denial of service | Recovery backlog | medium | mitigate | Latest-only coalescing, inclusive two-hour deadline, bounded abandoned scan and same-occurrence retry | closed |
| T-05-09-01 | Tampering | Chat migration | high | mitigate | Transactional transfer, conservative collision precedence, maximum protective boundaries, new generation, invalidated tokens and canonical wake resolution | closed |
| T-05-09-02 | Information disclosure | Runtime/navigation | high | mitigate | Registered logger secrets, fixed migration errors and metadata fallback logging only classifications/IDs | closed |
| T-05-09-03 | Denial of service | Runtime shutdown | medium | mitigate | Admission cutoff, executing-only update tracking after key acquisition, per-row failure isolation and bounded reminder drain; `reminder-runtime.test.ts` covers queued update behind hung reminder | closed |
| T-05-10-01 | Tampering | Verification evidence | high | mitigate | Migration/provisioning-first disposable helper; negative migration/claim/replay tests; measured evidence distinguishes baseline regression from final affected checks | closed |
| T-05-10-02 | Information disclosure | Validation artifacts | high | mitigate | Commands, aggregate results and scoped fixture evidence contain no credentials or raw participant payloads | closed |
| T-05-10-03 | Denial of service | Verified bounds | medium | mitigate | Bounded reconciliation/uniqueness/coalescing plus exercised duplicate, race and shutdown negative cases | closed |
| T-05-SC | Tampering | Supply chain | high | mitigate | Explicit exact-pin approval and registry/repository evidence in `05-01-SUMMARY.md`; installed construction SQL comparison | closed |

## Dependency Maintenance Findings

`npm audit --omit=dev` reports five high package findings. They remain maintenance debt; no risk was accepted and no dependency was downgraded to force an audit pass.

- `deepmerge-ts` through Prisma config requires recursive object graphs. The inspected `prisma.config.ts` is trusted static configuration; no attacker-controlled recursive merge path was found. [Advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
- `mysql2` comes through Prisma tooling. The application uses `PrismaPg` and PostgreSQL; no application MySQL connection or compressed-protocol path was found. [Advisory](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr).
- `fast-uri` comes through Prisma dev/streams-local/Ajv. No application URI authorization or outbound-request path using it was found. [Advisory](https://github.com/advisories/GHSA-f65p-4m7j-42xc).
- Prisma is an optional peer of `@prisma/client`; pruning development dependencies alone does not prove these packages absent from an image.

The inspected application does not meet these exploit preconditions. Reassess if configuration becomes untrusted, MySQL is introduced, or Prisma development/URI processing surfaces become exposed.

## Accepted Risks Log

No accepted risks. Unknown Telegram delivery is intentionally consumed by the approved product contract; it is not an exactly-once guarantee.

## Security Audit Trail

| Date | Scope | Total | Closed | Unverified | Auditor |
|---|---|---:|---:|---:|---|
| 2026-09-13 | Plans 01–08 | 31 | 25 | 6 | gsd-security-auditor |
| 2026-09-13 | Plans 01–09 intermediate | 31 | 28 | 3 | gsd-security-auditor |
| 2026-09-13 | Final implementation through 8f2ffda and measured Plan 10 evidence | 31 | 31 | 0 | gsd-security-auditor |

No unmapped attack surface was identified. Summaries lack literal Threat Flags headings; the auditor also inspected their residual-risk and trust-boundary sections.

## Sign-Off

- [x] Every authored threat has a disposition and verified mitigation.
- [x] No accepted risks were inferred on the user's behalf.
- [x] Blocking threats_open is zero; status is verified.
- [x] Dependency findings and their inspected exploit preconditions remain explicit.

Native Telegram UAT remains pending. Executing update middleware cannot be safely cancelled: after the drain deadline, Prisma remains open until that already-running handler settles. Queued handlers are excluded from this barrier and cannot start after shutdown; reminder HTTP draining remains bounded. This operational limitation is recorded in `05-09-SUMMARY.md`.
