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
| Superseded/cancelled card edits render correctly in a real Telegram group | AVAIL-06, LIFE-03 | Bot API rendering is not exercised by the test doubles. (The `editMessageText` age limit that motivated this row is no longer a reason — research Open Question 3 is now RESOLVED with a citation showing no age limit applies to a bot editing its own keyboard-bearing group message, and assumption A6 is discharged. The row stays for the rendering check alone.) | In a test group: run `/plan`, reach an active round, replan it, then cancel — confirm the old card is visibly neutered and the new card is interactive |
| Post-rehearsal defaults appear in the next planning round | LIFE-05 | Depends on wall-clock passing the rehearsal `endsAt` | Book a rehearsal ending in the near past (via fixture), start a new round, confirm day/time/participants prefill |

---

## Spec-less Probe Accounting — Reconciliation

*Added during plan revision, correcting figures the first planning pass reported from memory rather
than from the files. Every number below was recounted from the committed `04-0N-PLAN.md` frontmatter.*

**Prohibitions carried into `must_haves.prohibitions` — 14 total** (the first pass reported 13, an
undercount of the written artifacts; nothing was dropped, the figure was simply wrong):

| Plan | Prohibitions | Truths |
|---|---:|---:|
| 04-01 | 4 | 13 |
| 04-02 | 2 | 8 |
| 04-03 | 4 | 11 |
| 04-04 | 2 | 8 |
| 04-05 | 2 | 6 |
| **Total** | **14** | **46** |

*(04-03 and 04-05 read 3 and 3 before this revision. The D-19 standing prohibition moved from 04-05 to
04-03 so it ships in the commit that makes the cancelled position reachable; the total is unchanged.)*

**Probe-to-truth traceability: NOT PRESERVED. Stated plainly rather than reconstructed.**

The first pass reported that 11 probe-derived edges became `must_haves.truths` and that "11 + 4 = 15,
nothing dropped." That equality cannot be verified from these artifacts, and this file will not pretend
otherwise. The 46 truths across the five plans carry **no marker distinguishing probe-derived truths
from planner-authored ones**, and the probe output was not retained, so which 11 of the 46 came from
edges cannot now be recovered without guessing. Tagging them retroactively would manufacture a
provenance record rather than preserve one.

What this does and does not mean:

- **It is not evidence of a dropped edge.** No edge is known to be missing, and the prohibition count
  moved *up* on recount, not down.
- **It is also not evidence of the opposite.** The no-drop claim rests on the planner's word, which is
  exactly the thing a reconciliation check exists to avoid relying on.
- **The compensating control is the requirement map above**, which is independently derived from
  `REQUIREMENTS.md` and `04-RESEARCH.md` § Validation Architecture rather than from the probe, and which
  covers all 8 phase requirement IDs plus D-13, D-19 and the copy sweep. A dropped edge that mattered
  would have to be invisible to that map as well.
- **Three probe rows are separately recorded as `unclassified` and unresolved**, in `04-03-PLAN.md`
  (LIFE-03) and `04-05-PLAN.md` (two rows). Those were reviewed manually and their edges named in
  prose; they are flagged in each plan's `<flagged_assumptions>` rather than silently closed.

**For the next phase:** emit probe-derived truths with a trailing `(edge)` marker at authoring time.
The cost is one token per truth and it makes this reconciliation mechanical instead of impossible.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
