---
phase: 01
slug: chat-readiness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-19
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 |
| **Config file** | `vitest.config.ts` — Wave 0 creates it |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run lint && npm run typecheck && npm test && npm run test:integration` |
| **Estimated runtime** | To be measured after Wave 0 |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run lint && npm run typecheck && npm test`
- **Before `$gsd-verify-work`:** Run `npm run lint && npm run typecheck && npm test && npm run test:integration`; the full suite must be green
- **Max feedback latency:** To be measured after Wave 0 and kept below the duration of one implementation task

---

## Per-Task Verification Map

Task IDs, plan numbers, and waves are assigned by the planner. The requirement-level commands below are the binding inputs for that mapping.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CONF-01 | — | Setup promotes a confirmed IANA timezone atomically | unit + integration | `npm run test:unit -- setup` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CONF-02 | — | Invalid weekday and `HH:MM` inputs never persist | unit | `npm run test:unit -- schedule-settings` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CONF-03 | — | Cross-field schedule invariants reject inconsistent boundaries, duration, and start time | unit + integration | `npm run test:unit -- schedule-settings` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CONF-05 | — | Reminder-time edits commit atomically | unit + integration | `npm run test:unit -- reminder-times` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROST-01 | — | Only an identifiable replied-to Telegram user can be added or reactivated | unit + integration | `npm run test:unit -- roster-add` and `npm run test:integration -- roster-repository` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROST-02 | — | Removal is actor-bound, confirmed, and idempotent | unit + integration | `npm run test:unit -- roster-remove` and `npm run test:integration -- roster-repository` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ROST-03 | — | Roster rendering safely falls back to an ID-based label | unit | `npm run test:unit -- roster-rendering` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-01 | — | Planning-start policy persists only supported values | unit + integration | `npm run test:unit -- planning-access` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-02 | T-01-AUTH | Every protected command and callback rechecks current administrator status and denial discards the actor's draft | unit + integration | `npm run test:unit -- authorization` and `npm run test:integration -- draft-repository` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json`, TypeScript configuration, and explicit lint/typecheck/test scripts — establish the greenfield runtime and verification commands.
- [ ] `vitest.config.ts` and `tests/unit/` — cover pure domain and Telegram handler behavior.
- [ ] PostgreSQL Testcontainers fixture and `tests/integration/` — cover migrations, transactional confirmation, and uniqueness.
- [ ] Fake `TelegramMembershipGateway`, fake clock, and deterministic `TimezoneResolver` fixture — make authorization, expiry, and resolver failure paths deterministic.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram group-chat location reply reaches the setup flow and produces the intended confirmation card | CONF-01 | Telegram client affordance and live update shape require a real test chat | In a private test group, run setup as an administrator, attach a location in the group, verify the candidate timezone is shown, confirm it, and inspect settings |
| A demoted administrator is denied immediately by Telegram-backed authorization | AUTH-02 | Final confidence requires Telegram's live `getChatMember` response | Start a protected flow as an administrator, demote that account, attempt the next protected command and callback, and verify denial plus draft removal |
| Coordinate-to-IANA-timezone resolver dependency is legitimate and maintained | CONF-01 | Package provenance and maintenance are a human supply-chain decision | Review the proposed package's publisher, repository, release cadence, license, and dependency tree before approving installation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency is measured and acceptable
- [ ] `nyquist_compliant: true` set in frontmatter after validation

**Approval:** pending
