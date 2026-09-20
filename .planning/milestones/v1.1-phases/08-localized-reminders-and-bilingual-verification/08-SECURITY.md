---
phase: 08
slug: localized-reminders-and-bilingual-verification
status: verified
threats_open: 0
threats_total: 21
threats_closed: 21
asvs_level: 1
created: 2026-09-19
verified_source: d91f5f7
---

# Phase 8 — Security

Independent gsd-security-auditor inspection closed all 16 planned mitigations. Five existing low dependency-risk acceptances are recorded below, completing the 21-row register. No new risk acceptance is introduced. Blocking threshold: high.

## Trust Boundaries

- Persisted chat/round and user labels to Telegram output: locale is presentation; identities and claims retain authority.
- Catalog/source/build to evidence: automated checks measure outbound paths and the shipped image; native acceptance is separate.
- Old-chat migration updates: destination identity supplies presentation only; old actions never forward.

## Threat Register

| Threat ID | Category | Severity | Disposition | Evidence | Status |
|---|---|---|---|---|---|
| T-08-01-01 | Tampering | high | mitigate | A | closed |
| T-08-01-02 | Elevation of privilege | high | mitigate | B | closed |
| T-08-01-03 | Repudiation | medium | mitigate | C | closed |
| T-08-01-SC | Tampering | low | accept | D | closed |
| T-08-02-01 | Tampering | high | mitigate | A | closed |
| T-08-02-02 | Elevation of privilege | high | mitigate | B | closed |
| T-08-02-03 | Repudiation | medium | mitigate | C | closed |
| T-08-02-SC | Tampering | low | accept | D | closed |
| T-08-03-01 | Tampering | high | mitigate | A | closed |
| T-08-03-02 | Elevation of privilege | high | mitigate | B | closed |
| T-08-03-03 | Repudiation | medium | mitigate | C | closed |
| T-08-03-SC | Tampering | low | accept | D | closed |
| T-08-04-01 | Tampering | high | mitigate | A | closed |
| T-08-04-02 | Elevation of privilege | high | mitigate | B | closed |
| T-08-04-03 | Repudiation | medium | mitigate | C | closed |
| T-08-04-SC | Tampering | low | accept | D | closed |
| T-08-04-04 | Elevation of privilege | high | mitigate | E | closed |
| T-08-05-01 | Tampering | high | mitigate | A | closed |
| T-08-05-02 | Elevation of privilege | high | mitigate | B | closed |
| T-08-05-03 | Repudiation | medium | mitigate | C | closed |
| T-08-05-SC | Tampering | low | accept | D | closed |

## Evidence

**A — Rendering and identity safety.** `src/telegram/reminder-renderers.ts` filters pending participants, validates anchor IDs and public/private navigation paths, escapes dynamic values, shortens on Unicode code-point boundaries while retaining all mentions, and rejects impossible capacity. `src/domain/reminders/reminder-service.ts` reloads round participant snapshots and validates chat ownership. `tests/unit/reminder-renderers.test.ts` verifies hostile HTML/Unicode, 60 mentions, capacity, navigation variants and malformed paths; persisted recovery is covered in `tests/integration/localized-reminders.test.ts`.

**B — Locale does not acquire authority or reset delivery.** `src/app/main.ts` resolves planning locale at the send boundary and wires both real transport factories. Follow-up locale is resolved after metadata; the service locks/reloads claims, permits only eligible pending/rejected work, conditionally reserves it and preserves unknown outcomes. Language-service writes are scoped to preferences; callbacks retain current role/actor/token/expiry checks. Localized reminder integration tests cover duplicate/unknown ownership, language switches, callback authority and actual captured transport payloads.

**C — Evidence provenance.** `08-AUTOMATED-EVIDENCE.md` preserves original failures, scoped corrections, final source d91f5f7, overlapping test counts, registration limitations and rebuilt image identity. Latest affected checks passed 29 unit/73 integration tests; independent re-review passed 17 focused checks. Dockerfile runs smoke after pruning and USER gsmbot, and CI repeats it in the final image. Runtime smoke checks both catalogs and Ukrainian Intl. Runbook explicitly leaves native acceptance unexecuted and preserves narrow historical waivers.

**D — Dependency acceptance.** Diff `7c42e66^..d91f5f7` contains no package.json or lockfile change. Existing CI npm ci is retained. No new package or version is introduced.

**E — Migration refusal.** Migration handler resolves destination language but acknowledges and returns before forwarding any old callback/command. Chat-migration integration verifies uk/en/uk plus default English, exactly one acknowledgement, silent old commands and unchanged persisted snapshots.

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---|---|---|---|---|
| DEP-1 | T-08-01-SC | No dependency additions/version changes; retain existing approved lockfile and CI installation. | Existing disposition in approved 08-01-PLAN.md | 2026-09-19 |
| DEP-2 | T-08-02-SC | No dependency additions/version changes; retain existing approved lockfile and CI installation. | Existing disposition in approved 08-02-PLAN.md | 2026-09-19 |
| DEP-3 | T-08-03-SC | No dependency additions/version changes; retain existing approved lockfile and CI installation. | Existing disposition in approved 08-03-PLAN.md | 2026-09-19 |
| DEP-4 | T-08-04-SC | No dependency additions/version changes; retain existing approved lockfile and CI installation. | Existing disposition in approved 08-04-PLAN.md | 2026-09-19 |
| DEP-5 | T-08-05-SC | No dependency additions/version changes; retain existing approved lockfile and CI installation. | Existing disposition in approved 08-05-PLAN.md | 2026-09-19 |

These copy plan-time acceptances; the auditor's five administrative log-pending entries are closed by this record. No user decision was newly inferred.

## Security Audit Trail

| Date | Total | Mitigations verified | Accepted | Blocking open | Run by |
|---|---|---|---|---|---|
| 2026-09-19 | 21 | 16 | 5 | 0 | Independent gsd-security-auditor; orchestrator recorded planned acceptances |

No unregistered flags identified. This ASVS L1 audit verifies the authored register, not an exhaustive new threat hunt. No broad tests rerun. Native acceptance remains pending.

## Sign-off

All 21 threats have documented dispositions and closure evidence. Status verified; threats_open 0.

