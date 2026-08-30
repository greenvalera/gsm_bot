---
phase: 02
slug: weekly-rehearsal-proposal
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-30
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 2` from `02-RESEARCH.md` § Validation Architecture.
> Task IDs are bound once plans exist; `/gsd-validate-phase` promotes this draft to `validated`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11, two projects (`unit`, `integration`) — already installed, no framework install needed |
| **Config file** | `vitest.config.ts` — `unit` = `tests/unit/**/*.test.ts`; `integration` = `tests/integration/**/*.test.ts` with `fileParallelism: false`, `maxWorkers: 1`, 60 s timeouts |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run format:check && npm run build && npm run test:unit && npx vitest run --project integration` |
| **Estimated runtime** | ~15 s unit; integration adds Testcontainers PostgreSQL startup (~60–90 s cold) |
| **Container gates** | Testcontainers 12.1.0 against committed Prisma migrations (`startPostgresTestContainer()` + `applyCommittedMigrations()` in `tests/helpers/postgres.ts`) |

**Deterministic seams already available (Phase 1):** `createClock(initial)` (injectable `now`), `createMembershipGateway(roleFor)`, `createTimezoneResolver(tz)`, `transactionFailurePrisma()` — all in `tests/fakes/chat-readiness.ts`.

> **Known fixture gap:** `createMembershipGateway`'s `roleFor` return type is `"administrator" | "member"`. Phase 2 needs `creator`, `restricted`, `left`, `kicked`, and `unknown` to exercise `canStartPlanning` and the fail-closed path. Widening it to `CurrentTelegramRole` is a Wave 0 item.

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run format:check && npm run build && npm run test:unit && npx vitest run --project integration`
- **Before `/gsd-verify-work`:** Full suite must be green, then a live Telegram run (Phase 1 precedent: the live run is the only arbiter of button width and copy)
- **Max feedback latency:** 15 seconds (unit); 120 seconds (full suite incl. containers)

---

## Per-Task Verification Map

Task IDs are `TBD` until `/gsd-plan-phase` writes the PLAN.md files; each row below is the
requirement-level contract every task touching that requirement must satisfy.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | CONF-04 | — | Slots are hourly and never exceed the daily boundary; defaults yield 10:00…19:00 | unit | `npx vitest run --project unit tests/unit/slot-generation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CONF-04 (DST) | — | Skipped hour → `nonexistent`; ambiguous hour → earlier instant; 30-minute zone; 10:00–19:00 unaffected on a transition day | unit | `npx vitest run --project unit tests/unit/zoned-clock.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-03 | — | Current week when unclaimed; next week when a confirmed rehearsal exists in it | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-04, PLAN-05 | — | All 7 days rendered; default and previous markers; default wins on a tie; past days marked | unit | `npx vitest run --project unit tests/unit/planning-day-card.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-06, PLAN-07 | — | Valid slot selection; default/previous markers; past hours on today disabled | unit | `npx vitest run --project unit tests/unit/planning-time-card.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-01 | T-02-auth | `/plan` allowed/denied across every `CurrentTelegramRole` × every `PlanningAccessPolicy`; unknown role fails closed | unit | `npx vitest run --project unit tests/unit/planning-start-authorization.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-01 (regression) | T-02-auth | Non-admin tapping each Phase 1 kind still receives `CALLBACK_DENIAL`; non-admin author tapping `PLANNING` is dispatched; no draft is destroyed on denial | unit | `npx vitest run --project unit tests/unit/callback-authority.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-08, PLAN-09 (D-02) | T-02-authz | A non-author tap is refused with the owner-naming alert and mutates nothing | unit | `npx vitest run --project unit tests/unit/planning-ownership.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-08 (F-9 guard) | — | Serialized keyboard row shape for the day and time cards | unit | `npx vitest run --project unit tests/unit/planning-keyboards.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Observability | T-02-leak | Every planning branch emits a distinct `event`/`outcome`/`reason`; no date, minute, or timezone value survives redaction | unit | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-02 | T-02-race | Second concurrent start for the same chat+week is refused; a confirmed round releases the week | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-03 | T-02-takeover | Takeover refused before the threshold; allowed after, by an admin only; selections preserved; `expectedRevision` guarded | integration | `npx vitest run --project integration tests/integration/planning-takeover.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-10, RELI-01 | — | Status re-posts and re-anchors; a fresh composition root resumes the exact step and selections; cooldown refuses a rapid repeat | integration | `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLAN-08, PLAN-09 (D-04, D-10, D-11) | — | Confirm snapshots the active roster; empty roster refused; duplicate confirm returns `Already applied.` | integration | `npx vitest run --project integration tests/integration/planning-confirm.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/zoned-clock.test.ts` — DST resolution, all three kinds, ≥3 zones incl. a 30-minute shift
- [ ] `tests/unit/target-week.test.ts` — REQ-PLAN-03
- [ ] `tests/unit/slot-generation.test.ts` — REQ-CONF-04
- [ ] `tests/unit/planning-day-card.test.ts` — REQ-PLAN-04, REQ-PLAN-05
- [ ] `tests/unit/planning-time-card.test.ts` — REQ-PLAN-06, REQ-PLAN-07
- [ ] `tests/unit/planning-keyboards.test.ts` — serialized row shape (F-9 guard)
- [ ] `tests/unit/planning-start-authorization.test.ts` — REQ-PLAN-01
- [ ] `tests/unit/callback-authority.test.ts` — the Pattern 5 callback-boundary regression matrix
- [ ] `tests/unit/planning-ownership.test.ts` — D-02
- [ ] `tests/unit/planning-logging.test.ts` — redaction + non-silent branches
- [ ] `tests/integration/planning-round.test.ts` — REQ-PLAN-02
- [ ] `tests/integration/planning-takeover.test.ts` — REQ-AUTH-03
- [ ] `tests/integration/planning-recovery.test.ts` — REQ-PLAN-10, REQ-RELI-01
- [ ] `tests/integration/planning-confirm.test.ts` — D-04/D-10/D-11
- [ ] Widen `createMembershipGateway` in `tests/fakes/chat-readiness.ts` to the full `CurrentTelegramRole` union
- [ ] Add a `createChatConfiguration(overrides)` fixture — 13 Phase 2 tests need a configured chat
- [ ] Framework install: **none** — Vitest 4.1.11 and Testcontainers 12.1.0 are already present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Inline keyboard button width, wrapping, and copy on real Telegram clients | PLAN-04, PLAN-06 | Telegram renders button labels differently per client and locale; no automated harness reproduces real rendering. Phase 1 precedent: the live run was the only arbiter of button width and copy. | Run the bot against the live test chat, issue `/plan`, screenshot the day card and the time card on mobile and desktop, confirm no label truncates and the default/previous markers are visually distinguishable. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
