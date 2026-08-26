---
quick_id: 260826-o1i
phase: 01-chat-readiness
plan: 01
subsystem: planning-artifacts
tags: [live-verification, uat, broken-windows, documentation-only]

# Dependency graph
requires:
  - phase: 01-16..01-22
    provides: The gap-closure wave whose fixes live run 2 exercised
  - phase: quick/260826-e62
    provides: The CR-01 authorization fix included in the build run 2 tested
provides:
  - A dated run-2 record on every runbook step, alongside the preserved run-1 baseline
  - The run-2 acceptance verdicts, stated identically in the runbook and in 01-14-SUMMARY.md
  - F-10 and F-11 as open broken windows 14 and 15, with file:line roots and quoted contract clauses
  - Seven human-judgment deliverables satisfied with cited live evidence
affects: [gsd-verify-work, gsd-ship, phase-01-closure]

# Actuals (#2632)
actuals:
  tokens: 28900
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Record a second run ALONGSIDE the first rather than over it: the delta between two runs is the evidence, and deleting half of it destroys the evidence"
    - "State a partial precisely inside the pass rather than blurring it into the pass — the residual is named at the same altitude as the verdict"

key-files:
  created:
    - .planning/quick/260826-o1i-record-live-verification-run-2-results-a/260826-o1i-SUMMARY.md
  modified:
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
    - .planning/phases/01-chat-readiness/01-UAT.md
    - .planning/WINDOWS.md
    - .planning/phases/01-chat-readiness/01-14-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-16-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-17-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-18-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-19-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-20-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-21-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-22-SUMMARY.md

key-decisions:
  - "Roster identity in the new run-2 records uses the same `<ім'я> — @<username>` placeholder convention the run-1 records already use, rather than the real handle quoted in the scratchpad evidence sheet. The evidential content of runbook step 4d is the CONTRACT copy and its file:line — that is quoted verbatim — not the interpolated member name. Applying T-01-o1i-02 (roster identity only in permitted display forms) avoids newly committing a real person's handle to git for zero evidential gain."
  - "The two run-2 acceptance tables — runbook and 01-14-SUMMARY.md — were written to agree clause by clause, not merely verdict by verdict, and 01-14 says so in prose: if the two ever disagree, that disagreement is itself the defect. Two documents contradicting each other about a fact is precisely the failure class F-11 is."
  - "The gate's literal `grep -c '(2026-08-24)' == 18` forced the new header and the run-1 table column header to name the date WITHOUT parentheses. The gate counts a marker, not a date, and inflating that count with new prose would have made it stop measuring run-1 record survival."

requirements-completed: [CONF-01, CONF-02, CONF-03, ROST-01, ROST-02, ROST-03, AUTH-01, AUTH-02]

# Metrics
duration: ~35 min
completed: 2026-08-26
status: complete
---

# Quick Task 260826-o1i: Record Live Verification Run 2 Results

**Live run 2 (2026-08-26) is now written into all eleven phase-01 planning artifacts: nine run-1 findings confirmed closed live, AC-1/AC-2/AC-3/AC-4 recorded as passes with their run-1 residuals named, AC-5 recorded FAIL on two NEW findings — F-10 and F-11 — and the phase left pending in every document that characterises it.**

Before this task the evidence existed only in an untracked scratchpad file. Eleven tracked documents described a state run 2 had superseded, and the phase could not be verified against anything.

## What Changed

### Task 1 — the runbook (`ff50540`)

- **22 steps** carry a dated `Результат прогону №2 (2026-08-26)` line. All **18** run-1 result records survive byte-for-byte — the diff removes exactly four lines, none of them a run-1 record.
- **Three new sub-steps**, each in its correct parent step: `3c` (Edit daily end), `4f` (restart with a populated roster), `5e` (ordinary message from a demoted actor).
- **Step 2e's PENDING placeholder replaced** by a checked pass, with the struck-through 2026-08-24 vacuous-pass line left immediately below it. That contrast is what makes the new pass legible.
- **A run-2 acceptance table** added below the run-1 table, whose `Статус` column header now names run 1 and its date.
- **A findings section** for F-10 and F-11 with call chains, file:line roots and the violated `01-UI-SPEC.md` clauses quoted with line numbers.
- **A run-2 verdict section** carrying `Вердикт прогону №2: НЕ approved.`, the preserved-volume methodology note, and the `update-path-logging.test.ts:357` scan-root observation.

Ukrainian throughout, with every bot string quoted verbatim in English. No coordinates and no resolved IANA zone were copied out of the log files — the runbook's own step-2e rule binds this task.

### Task 2 — the UAT and the ledger (`2728a26`)

Eight tests re-adjudicated to pass (3, 6, 8, 12, 13, 14, 17, 18), each citing its run-2 runbook step. Every run-1 `reported:` line is preserved as the historical record of what run 1 saw. Test 19 untouched. Test 16 stays skipped.

Summary recomputed and now agrees with the per-test lines, parts summing to the total:

| | total | passed | issues | pending | skipped | blocked |
|---|---|---|---|---|---|---|
| before | 21 | 11 | 6 | 1 | 3 | 0 |
| after | 21 | 19 | 1 | 0 | 1 | 0 |

A run-2 verdict paragraph sits directly under the Summary block, because a UAT reading 19/21 green must not be mistakable for a passed phase.

F-10 and F-11 appended through `gsd-tools windows append` — never hand-edited — so the markdown table, the JSON block and the frontmatter counts stayed in sync. `open_count` moved 2 → 4; open windows are now **2, 3, 14, 15**.

### Task 3 — the eight summaries (`26b5b68`)

Seven human-judgment deliverables (01-16 D9, 01-17 D9, 01-18 D11, 01-19 D10, 01-20 D9, 01-21 D8, 01-22 D8) each gained `manual_procedural` verification entries with `status: pass` whose `ref` names the runbook and the specific run-2 step. All seven still read `human_judgment: true` — they were satisfied by a human watching a live client, which is what the flag means. Every `rationale` was **extended**, never replaced.

`01-14-SUMMARY.md` stays negative: frontmatter still `status: halted`, D5 still `verification: []` and still unsatisfied, with a run-2 paragraph in its rationale, a run-2 acceptance table matching the runbook, and F-10/F-11 named as windows 14 and 15.

## The Alert Composition, Recorded Exactly

Wherever 01-16 D9's four contract texts are stated, the composition is **three of four confirmed by live tap; the fourth has no live route by design** — never "two of four", never "all four":

| # | Text | Source | Status |
|---|---|---|---|
| 1 | `This setup action is no longer available. Send /setup to start again.` | `setup-handlers.ts:38-39` | live tap, step 6c tap 1 |
| 2 | `This action is no longer available. Open /settings or /roster and try again.` | `settings-handlers.ts:47-48`, `roster-handlers.ts:46-47` | live tap, step 6c tap 2 at 15:01 |
| 3 | `Only current chat administrators can do that.` | `callbacks.ts:31` | live tap, step 5c after demotion |
| 4 | `Already applied.` | `setup-handlers.ts:47` and peers | **no live route by design** — 01-19 replaces the card with its buttons; stands on the automated replay (01-16 D4) |

Texts 1 and 2 are **different strings**, and that difference is recorded everywhere the composition appears: it proves the callback boundary reaches the correct per-surface branch instead of emitting one generic fallback. Text 4 appears nowhere as unverified, nowhere as a residual, nowhere as a gap.

## Partials Named, Not Blurred

Three residuals are stated inside their passes rather than smoothed into them — recording a partial as a clean pass is the exact F-4 failure class this phase spent two plans closing:

- **UAT test 8** — the "only the offending field is re-asked while the rest of the draft survives" clause **remains unverified**. Boundary edits are single-field on both surfaces, so no multi-field settings draft exists to lose.
- **01-18 D11 / runbook 3c** — an edit completed specifically **through** `Edit daily end` was never observed end to end. Step 3c is an existence result; the completion half is proven on the sibling fields.
- **01-22 D8 / runbook 2e part 2** — no real Telegram delivery failure was induced, so no error-level delivery line was observed. What run 2 does prove is stronger: the silent branches are now individually distinguishable on stdout, and **F-10 was found BY one of those lines**.

Runbook step 6b stays N/A with its residual gap — live Previous/Next wiring and per-page Remove actions — explicitly still open.

## Deviations from Plan

None. The three tasks executed as written and the adjudication rules were recorded, not re-derived.

Two mechanical adjustments were needed to satisfy the plan's own gates, neither changing any recorded fact:

1. The new header and the run-1 acceptance table column header name 2026-08-24 **without parentheses**, because `grep -c '(2026-08-24)' == 18` counts the run-1 record marker. New prose carrying the parenthesised form would have inflated the count past 18 and stopped the gate measuring what it exists to measure.
2. The header's cross-reference reads «Знахідки прогону №2» rather than repeating the full section title, because `grep -c 'Знахідки прогону №2 (2026-08-26)' == 1` requires the exact string to appear once — as a heading.

## Observations (not fixed here)

- The **run-1** verdict paragraph in the runbook still ends with a pointer to a section titled «Знахідки живого прогону», which does not exist in this file. The header's copy of that dangling reference was repaired per the plan; this second one sits inside preserved run-1 prose that binding rule 7 protects, so it was left alone rather than silently edited. Worth a one-line fix in a later pass.
- `.claude/gsd-core/` is untracked in this repository, so it does not exist inside the executor worktree. The `gsd-tools` CLI was invoked by absolute path from the main checkout, operating on the worktree's `.planning/` via cwd. The ledger writes landed in the worktree correctly.

## Verification

| Gate | Result |
|---|---|
| Runbook: run-1 records = 18, run-2 lines ≥ 22, verdict = 1, findings section = 1, F-10/F-11 present, tap-2 timestamp present | ✅ `run1=18 run2=22 verdict=1 findings=1 f10=6 f11=8 tap2=1` |
| UAT: declared parts sum to total AND match the counted per-test lines | ✅ `{"total":21,"passed":19,"issues":1,"pending":0,"skipped":1,"blocked":0}` |
| Windows 14 and 15 open, with file:line roots, no backticks, `open_count == 4` | ✅ `14:src/telegram/settings-handlers.ts:303`, `15:src/telegram/setup-handlers.ts:443` |
| Eight summaries parse with zero errors; seven satisfied and still human-judgment; 01-14 halted with D5 unsatisfied | ✅ `all eight summaries adjudicated` |
| **Nothing under `src/` or `tests/` changed** | ✅ `git diff --name-only -- src tests` empty at every task boundary and at HEAD |
| Run-2 acceptance verdicts agree across the runbook and 01-14-SUMMARY.md | ✅ read side by side; all five match in outcome and in named residuals |
| Closing sections read as unfinished | ✅ neither the runbook verdict nor 01-14's status section reads as though the phase is finishable |

## Task Commits

| Task | Commit | Files |
|---|---|---|
| 1 — runbook | `ff50540` | `01-LIVE-VERIFICATION-RUNBOOK.md` |
| 2 — UAT + ledger | `2728a26` | `01-UAT.md`, `WINDOWS.md` |
| 3 — eight summaries | `26b5b68` | `01-14`, `01-16`…`01-22` SUMMARY files |

## Next

Phase 01 stays **pending**. The blocking live checkpoint of `01-14-PLAN.md` Task 2 is still unsatisfied. A third live run is required, against a build that repairs F-10 (`src/telegram/settings-handlers.ts:303`) and F-11 (`src/telegram/setup-handlers.ts:443`) — both fixes belong to a separate GSD session, by the owner's explicit decision.

## Self-Check: PASSED

- `.planning/quick/260826-o1i-record-live-verification-run-2-results-a/260826-o1i-SUMMARY.md` — created
- All eleven modified files present and modified in the three commits above
- Commits `ff50540`, `2728a26`, `26b5b68` — all confirmed present in `git log`
- `git status --porcelain` clean at HEAD apart from this summary
