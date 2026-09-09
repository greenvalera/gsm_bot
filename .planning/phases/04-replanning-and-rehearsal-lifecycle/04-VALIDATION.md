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

Task IDs below use phase-plan-task order. Each row is joined to its implemented test; final review regressions are audited separately below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-02 | 04-01 | 1 | AVAIL-05 | T-04-05 | One `UNAVAILABLE` among pending answers yields `blocked` | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | yes | green (planned task evidence) |
| 04-01-02 | 04-01 | 1 | AVAIL-05 | T-04-05 | Blocked card names who blocked it and keeps both answer buttons live | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | yes | green (planned task evidence) |
| 04-02-01 | 04-02 | 2 | AVAIL-05 | T-04-10 | Flipping the blocking answer back reopens the round and retracts the blocked announcement | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` | yes | green (planned task evidence) |
| 04-01-02 | 04-01 | 1 | AVAIL-06 | T-04-01, T-04-03 | Replan supersedes the old round, creates a DRAFT for the same week, re-snapshots the live roster, links successor | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | yes | green (planned task evidence) |
| 04-01-02 | 04-01 | 1 | AVAIL-06 | T-04-03 | Replan with an emptied active roster is refused (D-07 / Phase 2 D-10) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | yes | green (planned task evidence) |
| 04-02-02 | 04-02 | 2 | AVAIL-08 | T-04-12, T-04-14, T-04-15 | A tap on a superseded round's answer token gets the distinct replanned alert, never `PLANNING_STALE_TEXT` | unit + integration | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | yes | green (planned task evidence) |
| 04-01-02 | 04-01 | 1 | AVAIL-08 | T-04-12 | The superseded round's tokens are still live at supersede time (dispatcher, not boundary, refuses) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | yes | green (planned task evidence) |
| 04-05-02 | 04-05 | 5 | LIFE-02 | T-04-34 | A BOOKED round makes `weekIsClaimed` true and `targetWeekStart` roll | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | yes | green (planned task evidence) |
| 04-03-01 | 04-03 | 3 | LIFE-03 | T-04-16, T-04-18, T-04-19 | Cancel confirm/apply pair: eligibility re-decided at apply, `status: CANCELLED`, `cancelledAt`/`cancelledByUserId` written, refused tap leaves the token spendable | integration | `npx vitest run --project integration tests/integration/planning-cancel.test.ts` | yes | green (planned task evidence) |
| 04-03-03 | 04-03 | 3 | LIFE-03 | T-04-20, T-04-22 | Cancelling a BOOKED round posts a new message and neuters BOTH durable message ids | integration | `npx vitest run --project integration tests/integration/planning-cancel-telegram.test.ts` | yes | green (planned task evidence) |
| 04-04-01 | 04-04 | 4 | LIFE-04 | T-04-24, T-04-28 | Change runs the same transaction as replan (one machine, D-12) | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | yes | green (planned task evidence) |
| 04-05-01 | 04-05 | 5 | LIFE-05 | T-04-33, T-04-35 | `previousRehearsal` excludes a rehearsal in progress, includes one whose `endsAt` has passed, excludes CANCELLED | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | yes | green (planned task evidence) |
| 04-05-02 | 04-05 | 5 | LIFE-06 | T-04-34 | Cancelling frees the week; `targetWeekStart` rolls past a week with no selectable day left | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | yes | green (planned task evidence) |
| 04-03-01 | 04-03 | 3 | AUTH-01 (D-19) | T-04-31, T-04-32 | A participant of a CANCELLED or SUPERSEDED round retains `PREVIOUS_PARTICIPANTS` standing; a non-participant gains none | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | yes | green (planned task evidence) |
| 04-01-01 | 04-01 | 1 | D-13 | T-04-04 | Migration preflight accepts the new enum label order and rejects a mid-list insertion | integration | `npx vitest run --project integration tests/integration/migration-preflight.test.ts` | yes | green (planned task evidence) |
| 04-03-02 | 04-03 | 3 | Copy | T-04-06, T-04-21 | Cancellation copy never offers an undo; superseded copy never mentions `/plan` | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | yes | green (planned task evidence) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/integration/planning-replan.test.ts` — stubs for AVAIL-06, AVAIL-08, LIFE-04
- [x] `tests/integration/planning-cancel.test.ts` — stubs for LIFE-03, LIFE-06
- [x] Extended `tests/unit/planning-availability-card.test.ts` — blocked-card copy, blocker naming, cancellation render
- [x] `prisma/migrations/20260908215724_cancellation/migration.sql` generated and its column order transcribed into `prisma/migrate-deploy.mjs` **before** any code references `PlanningRoundStatus.CANCELLED`
- [x] `npm run db:generate` + committed `src/generated/prisma/` regeneration, inside the schema-edit task

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
- **Four probe rows are separately recorded as `unclassified` and unresolved**, in `04-03-PLAN.md`
  (LIFE-03) and `04-05-PLAN.md` (LIFE-02, LIFE-05, LIFE-06). Those were reviewed manually and their
  edges named in prose; they are flagged in each plan's `<flagged_assumptions>` rather than silently
  closed.

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

## Validation Audit 2026-09-09 — Planned Tasks

All 16 planned behavior rows map to implemented, passing tests. Plan 04-05 records 360 unit tests and 290 integration tests passing; build and touched-file formatting also pass. The root regression gate independently ran the complete unit suite with a 600-second timeout and passed. Final review identified two callback/rendering gaps and three transport/interaction warnings; their correction tests are pending in 04-REVIEW-FIXES.md. Nyquist sign-off remains pending until those corrections are checked.

The exhausted-Sunday example cannot occur with the locked rule that today remains selectable. Tests prove the current Sunday remains selectable, an entirely past week has no selectable day, and booked/confirmed weeks roll while cancelled weeks are released. No hour-level rollover is claimed.

Repository-wide formatting remains a known baseline failure across unrelated tooling/planning files; it is not recorded as a passing full-tree gate. Integration feedback includes real PostgreSQL startup and exceeds 30 seconds; the fast unit sampling path is under 30 seconds.
