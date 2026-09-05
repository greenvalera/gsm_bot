---
phase: 03
slug: availability-and-booking-decision
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-05
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase 3` from the `## Validation Architecture` section of `03-RESEARCH.md`.
> The Per-Task Verification Map is populated with concrete task IDs by `/gsd-validate-phase` once plans exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11, two named projects (`unit`, `integration`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test:unit` |
| **Full suite command** | `npm run test:unit && npm run test:integration && npm run typecheck && npm run lint` |
| **Integration mode** | `fileParallelism: false`, `maxWorkers: 1`, 60s test/hook timeouts — Testcontainers-backed and inherently serial |
| **Estimated runtime** | ~15s unit; integration dominated by Testcontainers PostgreSQL startup |

---

## Sampling Rate

- **After every task commit:** `npm run test:unit && npm run typecheck`
- **After every plan wave:** `npm run test:unit && npm run test:integration`
- **Before `/gsd-verify-work`:** full suite green plus `npm run lint`
- **Max feedback latency:** unit + typecheck must stay under ~60 seconds

---

## Per-Requirement Verification Map

Task IDs are assigned by `/gsd-validate-phase` after plans are written. Each row below is a
behavior that must have automated evidence before the phase gate.

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| AVAIL-01 | Confirm opens the availability round and mints the answer pair in one transaction | integration | `npx vitest run --project integration tests/integration/planning-confirm.test.ts` | ✅ extend | ⬜ pending |
| AVAIL-01 | The published card renders the confirmed date/time/lineup header | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ W0 | ⬜ pending |
| AVAIL-02 | A snapshot participant's answer is recorded; the other button overwrites it | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` | ❌ W0 | ⬜ pending |
| AVAIL-02 | Re-tapping the same answer is `Already applied.` and does not re-edit | integration | same file | ❌ W0 | ⬜ pending |
| AVAIL-02 | The first answer from `availability = NULL` returns `count === 1` (Pitfall 5) | integration | same file | ❌ W0 | ⬜ pending |
| AVAIL-03 | A chat member outside the snapshot is refused; a roster-removed snapshot member still answers (D-06) | integration | same file | ❌ W0 | ⬜ pending |
| AVAIL-04 | Markers, roster order stability across answers, and the count line | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ W0 | ⬜ pending |
| AVAIL-07 | Two concurrent final answers produce exactly one announcement | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` (racing client) | ❌ W0 — reuse `tests/helpers/racing-client.ts` | ⬜ pending |
| LIFE-01 | Author and a current administrator can book; anyone else is refused | integration | `npx vitest run --project integration tests/integration/planning-booking.test.ts` | ❌ W0 | ⬜ pending |
| LIFE-01 | Booking is `CONFIRMED → BOOKED` under an expected-revision guard; a duplicate apply is `Already applied.` | integration | same file | ❌ W0 | ⬜ pending |
| D-15 ripple | A `BOOKED` round claims its week, remains the previous rehearsal, and still admits `PREVIOUS_PARTICIPANTS` | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ✅ extend | ⬜ pending |
| D-03 ripple | `/plan_status` re-posts the availability card for a `CONFIRMED` round | integration | `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | ✅ extend | ⬜ pending |
| Migration | Preflight accepts the new migration and refuses drifted enum/column states | integration | `npx vitest run --project integration tests/integration/migration-preflight.test.ts` | ✅ extend | ⬜ pending |
| Observability | Every new branch emits one distinguishable bounded line | unit | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | ✅ extend `BRANCHES` | ⬜ pending |
| Copy safety | Every exported refusal constant is ≤200 characters (Pitfall 8) | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/planning-availability-card.test.ts` — covers AVAIL-04, D-08/D-09/D-10, Pitfall 8
- [ ] `tests/integration/planning-availability.test.ts` — covers AVAIL-02, AVAIL-03, AVAIL-07, Pitfall 3, Pitfall 5, Pitfall 6
- [ ] `tests/integration/planning-booking.test.ts` — covers LIFE-01, D-13, D-14, D-16
- [ ] Extend `tests/unit/planning-logging.test.ts` `BRANCHES` with every new branch (Pitfall 10)

No framework install needed — `vitest.config.ts` and the Testcontainers harness already exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real Telegram rendering of the availability card (marker glyphs, entity escaping, keyboard layout on mobile) | AVAIL-04 | Telegram's client-side Markdown/entity rendering is not reproducible in Vitest; only the emitted string is asserted automatically | Run the bot against the test group, publish a card, and confirm each participant row and the count line render as intended on both mobile and desktop clients |
| Flood-limit behavior under many rapid answers | AVAIL-02, Pitfall 11 | Telegram group flood limits are server-side and rate-dependent; integration tests mock the Bot API | During a live run, have several participants tap answers in quick succession and confirm the card converges and no 429 escapes the handler |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for the per-commit sample
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
