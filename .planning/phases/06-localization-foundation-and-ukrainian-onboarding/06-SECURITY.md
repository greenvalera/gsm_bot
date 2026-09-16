---
phase: 06
slug: localization-foundation-and-ukrainian-onboarding
status: verified
threats_open: 0
asvs_level: 1
block_on: high
created: 2026-09-16
---

# Phase 6 Security Verification

Independent gsd-security-auditor inspection verified all 28 plan-authored mitigations: 14 high and 14 medium. This is ASVS level 1 verification of the declared register, not a comprehensive new threat assessment. Implementation inspected through 418a942; generated client committed in b2b5701. No live messages or production database mutations occurred during audit. Historical waivers are unchanged.

## Trust Boundaries

| Boundary | Verified control |
| --- | --- |
| Telegram update to controller | Current role, actor/chat binding, expiry, strict target decoding and exactly-once acknowledgement |
| Controller to PostgreSQL | Independent preference writes, token consumption, identity locks and atomic migration |
| Catalog and dynamic data to Telegram | Typed phrases, escaping, stable identifiers and bounded controls |

## Evidence

- **A — Authority:** src/telegram/callbacks.ts current-role lookup, chat/actor/expiry checks and strict onboarding routes; src/domain/chat/language-service.ts stored-action validation and atomic claim; src/telegram/handlers.ts command authorization. tests/unit/language-selection.test.ts and tests/integration/localized-onboarding.e2e.test.ts verify denied writes and acknowledgement counts.
- **B — State integrity:** language-service.ts validates en/uk, writes only preference state, checks migration tombstones and couples selection to token claim. prisma/migrations/20260916180000_chat_language_preferences/migration.sql constrains locale and bigint identity. migration-service.ts coordinates source/destination locks and transactional transfer. chat-language-identity.test.ts and localized-onboarding.e2e.test.ts assert state invariants.
- **C — Safe output:** roster-renderers.ts escapes dynamic names, masks fallback identity and retains bounded pages; setup-handlers.ts, settings-handlers.ts and renderers.ts escape dynamic values. shared/logger.ts and callbacks.ts avoid raw update/token logging. roster-rendering.test.ts covers hostile Unicode and representative UTF-16 output budgets.
- **D — Callback resilience:** shared/callback-schema.ts bounds opaque wire tokens and restricts language targets. callbacks.ts guards acknowledgement and supplies a fallback. language-service.ts rejects invalid targets. Callback tests cover malformed, unsupported, stale and denied actions; roster rendering/controller tests check byte and alert budgets.

## Threat Register

| Threat ID | Category | Severity | Disposition | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| T-06-01-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-01-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-01-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-01-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-02-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-02-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-02-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-02-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-03-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-03-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-03-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-03-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-04-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-04-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-04-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-04-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-05-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-05-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-05-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-05-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-06-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-06-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-06-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-06-04 | Denial of service | medium | mitigate | CLOSED | D |
| T-06-07-01 | Spoofing/Elevation | high | mitigate | CLOSED | A |
| T-06-07-02 | Tampering | high | mitigate | CLOSED | B |
| T-06-07-03 | Information disclosure | medium | mitigate | CLOSED | C |
| T-06-07-04 | Denial of service | medium | mitigate | CLOSED | D |

## Accepted Risks

No new accepted risks. All registered threats have implemented mitigations. Existing historical scope decisions remain unchanged.

## Audit Trail

| Date | Total | Closed | Open | Auditor |
| --- | --- | --- | --- | --- |
| 2026-09-16 | 28 | 28 | 0 | gsd-security-auditor |

## Sign-off

- [x] All threats have a disposition and evidence.
- [x] No blocking or non-blocking open registered threats.
- [x] threats_open is zero.
- [x] Verified at ASVS level 1.

No unregistered threat flags were identified in the seven execution summaries. Tests were inspected rather than rerun for this audit. Native-client acceptance is separate.
