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
| **Full suite command** | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration` |
| **Estimated runtime** | To be measured after Wave 0 |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run format:check && npm run lint && npm run typecheck && npm test`
- **Before `$gsd-verify-work`:** Run `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration`; the full suite must be green
- **Max feedback latency:** To be measured after Wave 0 and kept below the duration of one implementation task

---

## Per-Task Verification Map

Task IDs, plan numbers, and waves reflect the revised 15-plan recovery dependency chain. Status remains pending until execution completes each artifact/test gate and records green evidence.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-15-01 / 01-15-02 | 01-15 | 2 | CONF-01 | T-01-SC / T-01-36 / T-01-37 | Historical tz-lookup rejection is preserved; geo-tz and every remaining direct root are independently audited/approved before any install artifact exists | artifact gate + human | `test`/`rg`/`awk` gates in `01-15-PLAN.md` | ✅ audit / ❌ geo-tz section | ⬜ pending |
| 01-04-01 | 01-04 | 5 | CONF-01 | T-01-35 | The production image retains geo-tz boundary data and resolves a known coordinate through `geo-tz/dist/find-now` | container smoke | `docker build -t gsmbot:phase-01 .` plus the Plan 01-04 in-image data/lookup gate | ❌ W0 | ⬜ pending |
| 01-05-01 / 01-09-01 | 01-05 / 01-09 | 6 / 10 | CONF-01 | T-01-11 / T-01-40 | Single and ambiguous results get one actor/chat-bound action per valid IANA candidate; invalid/empty/throwing lookups and stale/duplicate/cross-actor actions are non-mutating | unit + integration | `npm run test:unit -- setup`, `npm run test:unit -- settings`, and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| 01-07-01 | 01-07 | 8 | CONF-01 | T-01-32 | Setup promotes a confirmed IANA timezone atomically | unit + integration | `npm run test:unit -- setup` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| 01-06-01 | 01-06 | 7 | CONF-02 | T-01-10 | Invalid weekday and `HH:MM` inputs never persist | unit | `npm run test:unit -- schedule-settings` | ❌ W0 | ⬜ pending |
| 01-06-01 | 01-06 | 7 | CONF-03 | T-01-10 | Cross-field schedule invariants reject inconsistent boundaries, duration, and start time | unit + integration | `npm run test:unit -- schedule-settings` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| 01-06-01 / 01-09-01 | 01-06 / 01-09 | 7 / 10 | CONF-05 | T-01-10 / T-01-14 | Reminder defaults and edits commit atomically | unit + integration | `npm run test:unit -- schedule-settings`, `npm run test:unit -- settings`, and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| 01-10-01 | 01-10 | 11 | ROST-01 | T-01-18 | Only an identifiable replied-to Telegram user can be added or reactivated | unit + integration | `npm run test:unit -- roster-add` and `npm run test:integration -- roster-repository` | ❌ W0 | ⬜ pending |
| 01-11-01 | 01-11 | 12 | ROST-02 | T-01-19 | Removal is initiator-bound, confirmed, and idempotent | unit + integration | `npm run test:unit -- roster-remove` and `npm run test:integration -- roster-repository` | ❌ W0 | ⬜ pending |
| 01-12-01 | 01-12 | 13 | ROST-03 | T-01-21 | Roster rendering safely falls back to an ID-based label | unit | `npm run test:unit -- roster-rendering` | ❌ W0 | ⬜ pending |
| 01-08-01 | 01-08 | 9 | AUTH-01 | T-01-15 | Planning-start policy persists only supported values and always allows current admins | unit + integration | `npm run test:unit -- planning-access` and `npm run test:integration -- chat-configuration` | ❌ W0 | ⬜ pending |
| 01-09-02 / 01-13-01 | 01-09 / 01-13 | 10 / 14 | AUTH-02 | T-01-33 / T-01-23 | Every protected route rechecks current administrator status and denial discards actor drafts | unit + integration | `npm run test:unit -- authorization` and `npm run test:integration -- chat-readiness.e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json`, TypeScript configuration, and explicit format/format-check/lint/typecheck/test scripts — establish the greenfield runtime and verification commands.
- [ ] `vitest.config.ts` and `tests/unit/` — cover pure domain and Telegram handler behavior.
- [ ] PostgreSQL Testcontainers fixture and `tests/integration/` — cover migrations, transactional confirmation, and uniqueness.
- [ ] Fake `TelegramMembershipGateway`, fake clock, and deterministic package-neutral `TimezoneResolver` fixture — make authorization, expiry, resolved/ambiguous/failure results, thrown lookup errors, and action replay/cross-actor paths deterministic.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram group-chat location reply reaches the setup flow and produces the intended candidate confirmation card | CONF-01 | Telegram client affordance and live update shape require a real test chat | In a private test group, run setup as an administrator, attach a location, verify every returned IANA candidate has its own action, select one, save only at final review, inspect settings, and confirm logs/evidence contain no raw coordinates |
| A demoted administrator is denied immediately by Telegram-backed authorization | AUTH-02 | Final confidence requires Telegram's live `getChatMember` response | Start a protected flow as an administrator, demote that account, attempt the next protected command and callback, and verify denial plus draft removal |
| `geo-tz@8.1.8` and every remaining direct root are legitimate and maintained | CONF-01 | Package provenance, boundary-data provenance, runtime-data behavior, and maintenance are human supply-chain decisions | Execute Plan 01-15: preserve tz-lookup rejection, review every pending row, and approve geo-tz's publisher/source, signed release, 2026c data, license, lifecycle hooks, dependency tree, multi-candidate API, and Docker data path before installation |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verification or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verification
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency is measured and acceptable
- [ ] `nyquist_compliant: true` set in frontmatter after validation

**Approval:** pending
