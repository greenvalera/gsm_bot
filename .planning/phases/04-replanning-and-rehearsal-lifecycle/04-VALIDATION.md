---
phase: 4
slug: replanning-and-rehearsal-lifecycle
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded by `/gsd-plan-phase` from `04-RESEARCH.md` § Validation Architecture.
> The Per-Task Verification Map is completed by `/gsd-validate-phase` once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 — two named projects (`unit`, `integration`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --project unit tests/unit/<file>.test.ts` |
| **Full suite command** | `npm run lint && npm run build && npm run test:unit && npm run test:integration` |
| **Typecheck** | `npm run build` (= `tsc --noEmit`) |
| **Format gate** | `npm run lint` (= `prettier --check . --ignore-unknown`) |
| **Integration constraints** | `fileParallelism: false`, `maxWorkers: 1`, `testTimeout: 60_000`, `hookTimeout: 60_000` — requires Docker (Testcontainers) |
| **Estimated runtime** | ~30 s per-task quick run; integration suite dominated by container startup |

---

## Sampling Rate

- **After every task commit:** `npm run build && npx vitest run --project unit <the touched test file>` — under 30 s
- **After every plan wave:** `npm run lint && npm run build && npm run test:unit`
- **Migration-touching waves additionally:** `npm run test:integration -- migration-preflight` before any application code depends on the new enum label
- **Before `/gsd-verify-work`:** `npm run lint && npm run build && npm run test:unit && npm run test:integration` all green
- **Max feedback latency:** 30 seconds (unit path)

---

## Per-Task Verification Map

*Task IDs are assigned by the planner. `/gsd-validate-phase` fills this table by joining the requirement rows below onto the generated PLAN.md tasks.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | AVAIL-05 | — | One `UNAVAILABLE` among pending answers yields `blocked` | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | AVAIL-05 | — | Blocked card names who blocked it and keeps both answer buttons live | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | AVAIL-05 | — | Flipping the blocking answer back reopens the round and retracts the blocked announcement | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | AVAIL-06 | — | Replan supersedes the old round, creates a DRAFT for the same week, re-snapshots the live roster, links successor | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AVAIL-06 | — | Replan with an emptied active roster is refused (D-07 / Phase 2 D-10) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AVAIL-08 | — | A tap on a superseded round's answer token gets the distinct replanned alert, never `PLANNING_STALE_TEXT` | unit + integration | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AVAIL-08 | — | The superseded round's tokens are still live at supersede time (dispatcher, not boundary, refuses) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIFE-02 | — | A BOOKED round makes `weekIsClaimed` true and `targetWeekStart` roll | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | LIFE-03 | — | Cancel confirm/apply pair: eligibility re-decided at apply, `status: CANCELLED`, `cancelledAt`/`cancelledByUserId` written, refused tap leaves the token spendable | integration | `npx vitest run --project integration tests/integration/planning-cancel.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIFE-03 | — | Cancelling a BOOKED round posts a new message and neuters BOTH durable message ids | integration | `npx vitest run --project integration tests/integration/planning-cancel.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIFE-04 | — | Change runs the same transaction as replan (one machine, D-12) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | LIFE-05 | — | `previousRehearsal` excludes a rehearsal in progress, includes one whose `endsAt` has passed, excludes CANCELLED | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | LIFE-06 | — | Cancelling frees the week; `targetWeekStart` rolls past a week with no selectable day left | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | AUTH-01 (D-19) | — | A participant of a CANCELLED or SUPERSEDED round retains `PREVIOUS_PARTICIPANTS` standing; a non-participant gains none | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | D-13 | — | Migration preflight accepts the new enum label order and rejects a mid-list insertion | integration | `npx vitest run --project integration tests/integration/migration-preflight.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | Copy | — | Cancellation copy never offers an undo; superseded copy never mentions `/plan` | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/planning-replan.test.ts` — stubs for AVAIL-06, AVAIL-08, LIFE-04
- [ ] `tests/integration/planning-cancel.test.ts` — stubs for LIFE-03, LIFE-06
- [ ] `tests/unit/planning-replan-card.test.ts` (or extend `tests/unit/planning-availability-card.test.ts`) — blocked-card copy, blocker naming, cancellation render
- [ ] `prisma/migrations/<new>/migration.sql` generated and its column order transcribed into `prisma/migrate-deploy.mjs` **before** any code references `PlanningRoundStatus.CANCELLED`
- [ ] `npm run db:generate` + committed `src/generated/prisma/` regeneration, inside the schema-edit task

*No framework install is needed — Vitest, Testcontainers, and the Postgres helper are all present.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Superseded/cancelled card edits render correctly in a real Telegram group | AVAIL-06, LIFE-03 | `editMessageText` age limit could not be verified from Telegram docs (research A6); Bot API rendering is not exercised by the test doubles | In a test group: run `/plan`, reach an active round, replan it, then cancel — confirm the old card is visibly neutered and the new card is interactive |
| Post-rehearsal defaults appear in the next planning round | LIFE-05 | Depends on wall-clock passing the rehearsal `endsAt` | Book a rehearsal ending in the near past (via fixture), start a new round, confirm day/time/participants prefill |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
