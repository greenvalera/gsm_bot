---
phase: 7
slug: ukrainian-planning-and-lifecycle
status: verified
threats_open: 0
threats_total: 18
threats_closed: 18
asvs_level: 1
block_on: high
created: 2026-09-18
---

# Phase 7 — Security

Independent mitigation-presence audit of the authored threat registers in all six plans. All 18 entries retain their individual IDs, including repeated categories. This is ASVS Level 1 evidence, not an exhaustive vulnerability assessment.

## Trust Boundaries

| Boundary | Data crossing |
|---|---|
| Telegram update to planning authority | Untrusted actor, chat and opaque action token; locale is presentation only |
| Stored identities to Telegram output | Member names, masked fallback identifiers, HTML cards and plain alerts |
| Committed state to external delivery | Round revisions, consumed actions, render fingerprints and durable announcement claims |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|---|---|---|---|---|---|---|
| T-07-01-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-01-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-01-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |
| T-07-02-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-02-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-02-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |
| T-07-03-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-03-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-03-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |
| T-07-04-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-04-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-04-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |
| T-07-05-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-05-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-05-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |
| T-07-06-01 | Elevation of privilege | Planning callback/command authority | high | mitigate | A | closed |
| T-07-06-02 | Information disclosure / Tampering | Dynamic member labels | medium | mitigate | B | closed |
| T-07-06-03 | Tampering / Repudiation | No-op rendering and recovery | high | mitigate | C | closed |

## Mitigation Evidence

### A — Authority preserved

Fresh role lookup and chat/expiry/actor binding remain in `src/telegram/callbacks.ts:324`, `:438`, `:449`. Domain checks retain day/time ownership (`src/domain/planning/planning-service.ts:2145`, `:2260`), participant membership (`:3012`), lifecycle eligibility (`:3153`, `:3998`) and administrator takeover (`:4181`). Duplicate refresh rechecks chat and current owner/participant in `src/telegram/planning-handlers.ts:1726`.

Regression evidence: `tests/integration/localized-planning-feedback.e2e.test.ts:639` and `tests/integration/planning-language-switch.e2e.test.ts:479` assert unchanged state/capabilities after denial.

### B — Identity rendering protected

`src/telegram/roster-renderers.ts:45`, `:59`, `:73` provide masked plain labels and one HTML escape. Planning/lifecycle lists use the HTML helper in `src/telegram/planning-renderers.ts:153`, `:414`, `:644`, `:666`, `:829`. Plain alerts budget the whole localized phrase within 200 UTF-16 units and truncate on code-point boundaries in `src/telegram/planning-handlers.ts:279`, `:302`, `:344`.

Regression evidence: `tests/unit/localized-planning-cards.test.ts:104`, `tests/unit/localized-lifecycle-cards.test.ts:57`, `tests/unit/localized-planning-feedback.test.ts:46`.

### C — Replay and delivery semantics preserved

Atomic token/revision checks remain in `src/domain/planning/planning-service.ts:2159`, `:2169`, answer compare-and-set at `:3027`, and durable notification claims at `:2713`. Complete text-and-keyboard fingerprints cache only success/not-modified in `src/telegram/planning-handlers.ts:1568`, `:1583`, `:1602`. Duplicate refresh reuses controls without minting or claiming delivery (`:1741`, `:1752`, `:1767`). Uncertain announcement failures retain the claim and silence (`:2931`).

Regression evidence: `tests/integration/localized-planning.e2e.test.ts:445`, `:490`, and `tests/unit/planning-language-render.test.ts:89`, `:112`, `:135` distinguish safe failures, committed failures, uncertain sends, keyboard-only updates, and retry after rejected edits.

## Accepted Risks Log

No accepted risks. No new unregistered threat flags were identified. Human wording, no-blame and booking-transparency judgments remain pending acceptance items.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|---|---|---|---|---|
| 2026-09-18 | 18 | 18 | 0 | Independent gsd-security-auditor; orchestrator recorded verdict |

Source/test assertions were inspected. No additional tests were run by this auditor; execution results retain their provenance in the six summaries.

## Sign-Off

- [x] All threats have a disposition.
- [x] No accepted risks require documentation.
- [x] `threats_open: 0` confirmed.
- [x] `status: verified` set.

Approval: verified 2026-09-18 within the declared ASVS Level 1 scope.

