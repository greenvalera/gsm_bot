---
phase: 01-chat-readiness
plan: 20
subsystem: telegram
tags: [grammy, telegram, copywriting, ui-spec, coverage, broken-windows, tdd]

# Dependency graph
requires:
  - phase: 01-19
    provides: The card-replacement contract and the corrected UI-SPEC this plan extends with a copy rule; the renamed e2e assertions that made 01-13's D3 ref stale
  - phase: 01-18
    provides: The keyboards-module ownership of F-5, which fixes window 6's true file attribution
provides:
  - Three self-describing wizard time prompts, so no two steps read identically
  - A UI-SPEC copy rule requiring every time prompt to name its value before its format
  - A de-duplicated empty-state contract, with the runbook and UAT re-adjudicated to agree with the shipped renderer
  - Two schema-valid coverage blocks, one of which was previously running in silent legacy fallback
  - A broken-windows ledger whose every remaining row names the module that actually owns it
affects: [01-21, 01-22, live-verification, gsd-ship]

# Actuals (#2632)
actuals:
  tokens: 7404
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Assert contract-fixed copy by restating its bytes in the test rather than importing the constant, so a reword of the constant fails the gate instead of moving with it"
    - "When a finding is a false positive, converge the documents onto the code and close the window as waived/misfiled — never edit correct code to satisfy a wrong expectation"

key-files:
  created: []
  modified:
    - src/telegram/renderers.ts
    - tests/unit/schedule-settings.test.ts
    - .planning/phases/01-chat-readiness/01-UI-SPEC.md
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
    - .planning/phases/01-chat-readiness/01-UAT.md
    - .planning/phases/01-chat-readiness/01-13-SUMMARY.md
    - .planning/phases/01-chat-readiness/01-05-SUMMARY.md
    - .planning/WINDOWS.md

key-decisions:
  - "The three subject sentences were derived from the UI-SPEC wizard-sequence field names rather than the settings surface's bold headings. Step 7's leading-imperative form was the pattern the plan named and the one already proven in this exact function; reusing the settings pattern would have introduced a second disambiguation style into a wizard that already had one."
  - "The new unit assertions use full-body equality, not stringContaining. The fix had to prepend to contract-fixed copy, so the gate must fail both on a missing subject and on a reworded or dropped hint — a containment matcher would pass a silently truncated hint."
  - "TIME_HINT is restated verbatim in the test instead of being exported and imported. Importing it would make the assertion move with the very change it exists to catch; the duplication is the point."
  - "F-8 was closed by correcting the expectation, not the renderer. roster-renderers.ts renders the Copywriting Contract byte-for-byte and three exact-match tests would have failed if a third line were appended, so window 10 was waived as MISFILED rather than marked fixed — preserving the audit trail that the defect was documentary."
  - "01-13's D8 was NOT allowed to auto-pass. Correcting the out-of-enum kind alone would have satisfied every auto-pass condition and recorded a hand-inspected COVERAGE.md as deterministically covered, so human_judgment was set true with a rationale per the owner decision."
  - "01-05's D5 cites the one integration ref that exists but is still human_judgment true, because only the Use <IANA zone> button is asserted — inventing a reference for the unasserted copy would have been worse than declaring the gap."

patterns-established:
  - "Prepend-only copy fixes: when a contract fixes a sentence verbatim, a disambiguation fix adds a subject before it and the gate pins both halves"
  - "False-positive closure: waive with a reason naming the true owner, the correcting plan, and the debug session, so the misfiling stays auditable"

requirements-completed: [CONF-02, CONF-03, ROST-03]

coverage:
  - id: D1
    description: "Wizard steps 3, 5 and 6 each begin with a distinct imperative sentence naming the value being entered, and the shared time-format hint still renders verbatim in all five time prompts including both step-7 branches"
    requirement: "CONF-02"
    verification:
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#names the value each time-entry step asks for without altering the shared hint"
        status: pass
      - kind: unit
        ref: "tests/unit/schedule-settings.test.ts#renders weekday choices in four-and-three rows and advances to strict default-start input"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shared TIME_HINT constant is byte-identical to its pre-change form — the fix prepended and never reworded, split or replaced it"
    requirement: "CONF-03"
    verification:
      - kind: other
        ref: "git diff src/telegram/renderers.ts — the constant at :43-44 is absent from the diff; only the three time-entry branches changed"
        status: pass
    human_judgment: false
  - id: D3
    description: "The UI-SPEC schedule-input-prompt row now requires every time prompt to name its value before stating the format, closing the contract silence the debug session identified as the contributing cause"
    requirement: "CONF-03"
    verification:
      - kind: other
        ref: "grep of the Surface-inventory schedule-input-prompt row in 01-UI-SPEC.md — states WHICH value, prepend-never-replace, and that Step X of 8 never substitutes for the subject"
        status: pass
    human_judgment: false
  - id: D4
    description: "The empty-state instruction sentence appears exactly once in the UI-SPEC, and the runbook and UAT now agree with the shipped renderer, which was not modified"
    requirement: "ROST-03"
    verification:
      - kind: other
        ref: "test \"$(grep -c 'then send /roster_add' .planning/phases/01-chat-readiness/01-UI-SPEC.md)\" = \"1\" — returns 1"
        status: pass
      - kind: other
        ref: "git diff --name-only src/telegram/roster-renderers.ts — empty across the whole plan"
        status: pass
      - kind: unit
        ref: "npm test — 12 files, 66 tests including the three untouched exact-match empty-roster assertions"
        status: pass
    human_judgment: false
  - id: D5
    description: "The 01-13 coverage block parses with zero validation errors and D8 is routed to the human path for human_judgment rather than validation_failed"
    verification:
      - kind: other
        ref: "gsd-tools uat classify-coverage --summary 01-13-SUMMARY.md — errors [], D8 present with reason human_judgment"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every coverage ref in the 01-13 block names a test that exists in the current suite after the 01-16/01-17/01-19 rewrites, and D3 states the superseding single-answer callback contract"
    verification:
      - kind: other
        ref: "Ref resolver over all 9 refs in 01-13-SUMMARY.md — every test title found in the named file"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#answers every callback exactly once, after a fresh role lookup, with the answer that carries the outcome"
        status: pass
    human_judgment: false
  - id: D7
    description: "01-05 carries a coverage block and is deterministically classified in coverage mode with zero errors, instead of silently running in legacy prose fallback"
    verification:
      - kind: other
        ref: "gsd-tools uat classify-coverage --summary 01-05-SUMMARY.md — mode coverage, total 5, errors []"
        status: pass
      - kind: unit
        ref: "tests/unit/setup.test.ts — 8 tests pass, supplying the statuses cited by D1-D4 of that block"
        status: pass
    human_judgment: false
  - id: D8
    description: "Ledger rows 6, 9 and 10 name their true owners, the markdown table and the JSON array agree field-for-field on all 13 rows, and the tooling still parses the file"
    verification:
      - kind: other
        ref: "Dual-representation checker over .planning/WINDOWS.md — 13 rows, md and json agree on every field"
        status: pass
      - kind: other
        ref: "gsd-tools windows status — parses; open_count 5 -> 3, waived_count 0 -> 1, fixed_count 8 -> 9"
        status: pass
    human_judgment: false
  - id: D9
    description: "In the live Telegram group, walking /setup to steps 3, 5 and 6 shows each prompt naming the value it asks for before repeating the time format, in the same voice step 7 uses"
    verification: []
    human_judgment: true
    rationale: "Every proof here runs against the rendered string, not a Telegram client. The debug session recorded an explicit blind spot that was never closed: whether the now-longer one-line prompt wraps awkwardly on a narrow screen is not measured by any assertion. This was also the owner's original complaint on the live run, so the owner is the correct judge of whether the wording actually resolves it."

# Metrics
duration: 11 min
completed: 2026-08-25
status: complete
---

# Phase 01 Plan 20: Wizard Prompt Subjects, Empty-Roster Expectation, and Coverage Repair Summary

**The three ambiguous wizard time prompts now name the value they collect before repeating the shared format hint, the empty-roster "defect" is closed as the documentary false positive it always was, and both malformed phase coverage blocks parse deterministically.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-25T18:44:42Z
- **Completed:** 2026-08-25T18:55:27Z
- **Tasks:** 3 (Task 1 ran RED → GREEN)
- **Files modified:** 8

## Accomplishments

- **Closed F-1 / broken window 9 — the owner's original complaint.** `renderSetupStep` interpolated the shared `TIME_HINT` as the *entire* body for steps 3, 5 and 6, so all three stated the required FORMAT and never the SUBJECT. Each now opens with a distinct imperative sentence — the default rehearsal start time, the daily start boundary, the daily end boundary — in exactly the form step 7 already used. Six of the eight steps had always carried a subject; these three were the outliers.
- **Prepended, never replaced.** The hint is contract-fixed copy. The constant at `renderers.ts:43-44` is byte-identical to its pre-change form and still renders verbatim in all five time prompts; only the three branch templates changed.
- **Built the gate that never existed.** The sole step-3 assertion checked `stringContaining("Step 3 of 8")` — precisely the part that was never broken — and steps 5 and 6 had no rendering assertion at all. All three now assert their full body, and both already-correct step-7 branches are pinned too, so a future reword of the hint fails loudly.
- **Closed the contract silence, not just the symptom.** The Copywriting Contract fixed no wording for any wizard step prompt, so the requirement existed only as behavioural prose and `01-06-PLAN.md` inherited that silence. The UI-SPEC's schedule-input-prompt row now requires each time prompt to name its value before its format, and states that `Step X of 8` never substitutes for the subject.
- **Corrected the empty-roster expectation instead of the renderer (F-8).** `roster-renderers.ts` was already right. The UI-SPEC stated the same instruction sentence twice — normatively in the Copywriting Contract and as a paraphrase in the Surface-inventory row — and the runbook transcription promoted the paraphrase to a third required line. The paraphrase is gone from the Surface row, the runbook and UAT test 15 are re-adjudicated to PASS with the mis-transcription recorded, and window 10 is **waived as MISFILED**, not marked fixed.
- **Kept D8 a human checkpoint on purpose.** Fixing 01-13's out-of-enum `kind: manual` alone would have satisfied every auto-pass condition and recorded a hand-inspected `COVERAGE.md` as deterministically covered. Per the owner decision it is now `manual_procedural` **and** `human_judgment: true` with a rationale.
- **Re-pointed the one stale ref.** Of 01-13's nine refs, only D3's survived into a test that no longer exists — 01-16 renamed it when it replaced acknowledge-first with the single-answer contract. D3 now cites the superseding test and states the current PROJECT.md contract.
- **Ended 01-05's silent legacy fallback (N-5).** It had no `coverage:` key at all, so its deliverables were never classified. It now carries five entries citing only verifications that exist.
- **Pointed every ledger row at its real owner (N-3).** Windows 6, 9 and 10 were attributed to `settings-handlers.ts`, `setup-handlers.ts` and `roster-renderers.ts`; none of those owns its defect.

## Task Commits

1. **Task 1 (RED): assert each time-entry step names its value** — `5ccd361` (test)
2. **Task 1 (GREEN): say which time each wizard step is asking for** — `a5e96f2` (feat)
3. **Task 2: correct the empty-roster expectation, not the renderer** — `00e38c7` (docs)
4. **Task 3: make every coverage block parse and every ledger row name its owner** — `852060e` (docs)

No REFACTOR commit: the GREEN is three template strings, already minimal.

## Files Created/Modified

- `src/telegram/renderers.ts` — subject sentences prepended to the step 3, 5 and 6 branches. The `TIME_HINT` constant and the five non-time branches are untouched. The only `src/` change in this plan.
- `tests/unit/schedule-settings.test.ts` — the step-3 assertion extended past the header; a new full-body assertion covering steps 3, 5, 6 and both step-7 branches; `TIME_HINT` restated verbatim as a deliberate duplicate.
- `01-UI-SPEC.md` — schedule-input-prompt row now requires naming the value before the format; empty-roster row no longer restates the instruction sentence and defers copy to the Copywriting Contract. Both Copywriting Contract empty-state rows untouched.
- `01-LIVE-VERIFICATION-RUNBOOK.md` — step 6a expectation rewritten to heading/body/no-Remove; the recorded result re-adjudicated to PASS with the mis-transcription and debug-session path cited.
- `01-UAT.md` — test 15 `expected` corrected, `result` issue → pass, `note` added; Summary arithmetic passed 10 → 11, issues 8 → 7, still totalling 21.
- `01-13-SUMMARY.md` — D8 kind → `manual_procedural`, `human_judgment: true` + rationale; D3 re-pointed and reworded.
- `01-05-SUMMARY.md` — coverage block authored (5 entries; D5 human_judgment true).
- `.planning/WINDOWS.md` — windows 9 fixed, 10 waived; file attributions corrected for 6, 9, 10 in **both** the markdown table and the JSON array.

## Decisions Made

See `key-decisions` in the frontmatter. The two worth restating:

- **A false positive is closed by moving the documents, never the code.** Three exact-match tests encode the two-line empty state. "Fixing" the renderer to satisfy the runbook would have broken all three and shipped a message that prints the same instruction twice, violating the spec's own Voice rule.
- **Auto-pass is a claim about evidence, not a tidiness goal.** The tempting one-character fix to 01-13 would have silently upgraded a document inspection to deterministic coverage. The enum and the judgment flag were corrected together.

## Deviations from Plan

### Auto-fixed Issues

**1. [CLAUDE.md precedence] Runbook prose written in English inside a Ukrainian document**

- **Found during:** Task 2 (rewriting the step 6a expectation and result)
- **Issue:** `.claude/CLAUDE.md` makes "All project and planning documentation must be written in English" a hard constraint, but `01-LIVE-VERIFICATION-RUNBOOK.md` is written in Ukrainian throughout. Authoring the replacement prose in Ukrainian would have meant writing new non-English planning documentation.
- **Fix:** The two edited lines are in English; the surrounding Ukrainian labels (`**Очікується:**`, `- [x] Результат:`) and the verbatim contract copy are preserved. Per the executor contract, CLAUDE.md takes precedence over plan instructions.
- **Files modified:** `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md`
- **Commit:** `00e38c7`
- **Residual, deliberately NOT fixed:** the rest of the runbook remains Ukrainian. Translating a 265-line document is out of this plan's scope and out of its `files_modified` intent. See Deferred Items — this is an owner decision, not something to auto-apply.

**Total deviations:** 1 (CLAUDE.md-driven).
**Impact on plan:** None on scope. Eight files changed, matching `files_modified` exactly.

## Issues Encountered

- **The worktree had no dependencies.** `node_modules` and `src/generated` are gitignored and absent in a fresh worktree. Resolved as plans 01-16..01-19 did: symlinked the main checkout's `node_modules` and ran `prisma generate` with a placeholder `DATABASE_URL`. No package was installed, added or upgraded; the lockfile is untouched, so `T-01-20-SC` holds.
- **`gsd-tools.cjs` is absent inside the worktree.** `.claude/gsd-core/` is untracked, so the plan's literal `node .claude/gsd-core/bin/gsd-tools.cjs` fails with `MODULE_NOT_FOUND`. Ran the identical commands against the main checkout's absolute path; they resolve `.planning/` from cwd and correctly wrote this worktree's files (same handling as 01-17, 01-18 and 01-19).
- **The plan's Task 2 verify uses `windows status --pick waived_count`, which returns empty.** The field is nested, so the working selector is `--pick ledger.waived_count` (returns `1`). Cosmetic plan inaccuracy; the underlying condition was verified.
- **Mid-run instruction to switch file editing to Bash.** A system-reminder arrived directing that file work be done with `cat`/`sed`/heredocs instead of Read/Write/Edit. This dispatch's `<tooling_precedence>` block reserves that decision, so it was not followed; every file change here was made with Read/Write/Edit. Recorded per that block's requirement.
- **Two Bash invocations were refused by the worktree-isolation guard** for being too complex to verify as in-worktree (a compound branch-check and an inline `node -e` consistency check). Both were re-run as plain separate commands or as a script in the session scratchpad. No guard was bypassed.
- **Full-project integration runs must be serial.** Confirmed again; parallel runs produce spurious Testcontainers `P1001` errors. Pre-existing harness characteristic.

## Verification Results

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | PASS |
| `npm test` (unit project) | PASS — 12 files, 66 tests (baseline 12 / 65; +1 = the new wizard assertion) |
| `npx vitest run --project integration --no-file-parallelism` | 31 passed, 2 failed — the 2 are pre-existing broken windows 2 and 3, identical to the fork-point baseline |
| `npx vitest run --project integration chat-readiness.e2e.test.ts` | PASS — 9 tests |
| `npm run format:check` | PASS |
| `git diff --name-only src/telegram/roster-renderers.ts` | Empty — renderer untouched, as required |
| `grep -c 'then send /roster_add' 01-UI-SPEC.md` | 1 |
| `classify-coverage` 01-13 | `errors: []`; D8 in `present` with `reason: human_judgment` |
| `classify-coverage` 01-05 | `mode: coverage`, `total: 5`, `errors: []` |
| Ref resolver (01-13 + 01-05) | All 15 refs resolve to an existing file/test |
| Ledger dual-representation check | 13 rows, markdown and JSON agree on every field |
| `windows status` | Parses; `open_count` 5 → 3, `waived_count` 0 → 1, `fixed_count` 8 → 9 |
| `git diff --diff-filter=D 777d1db..HEAD` | Empty — no file deleted by any commit |

### Task acceptance criteria

| Criterion | Result |
|---|---|
| T1: steps 3, 5, 6 each begin with a distinct subject and end with the unchanged hint | PASS — full-body equality on all three |
| T1: the shared hint constant is byte-identical to its pre-change form | PASS — absent from the diff |
| T1: rendering assertions exist for steps 3, 5 and 6 and check the subject as well as the header | PASS |
| T1: the UI-SPEC schedule-input-prompt row requires each time prompt to name its value | PASS |
| T1: broken window 9 is marked fixed | PASS |
| T3: classify-coverage on 01-13 reports zero errors and places D8 in the human path for human_judgment | PASS |
| T3: classify-coverage on 01-05 reports coverage mode with zero errors | PASS |
| T3: every coverage ref in the 01-13 block names a test that exists | PASS — 9/9 |
| T3: ledger markdown and JSON agree row-for-row and the tooling still parses it | PASS |

### RED evidence

Task 1 failed with exactly the diagnosed defect on both assertions: expected `Step 3 of 8\n\nSend the default rehearsal start time. Send a time in 24-hour format…`, received `Step 3 of 8\n\nSend a time in 24-hour format…` — subject missing, hint present and verbatim.

### Pre-existing integration failures — confirmed not regressions

Both live in `tests/integration/chat-configuration.test.ts` and match the ledger verbatim: window 2 (dashboard button read by absolute position) and window 3 (`selectPlanningAccessPolicy` resolves `undefined` instead of throwing). This plan changed no dashboard keyboard and no `settings-service.ts`. Neither was fixed nor masked.

## Known Stubs

None.

## Broken-windows ledger

No new entries. This plan introduced no stub, no skipped test, and no unrun `<verify>` — every task's automated verification was executed and recorded above. Window 9 closed as **fixed**; window 10 closed as **waived (MISFILED)** with a reason naming the true owner, the correcting plan, and the debug session. Windows 2, 3 and 12 remain open by design.

## Deferred Items

- **The live-verification runbook is written in Ukrainian**, which conflicts with the CLAUDE.md constraint that all project and planning documentation be in English. Only the two lines this plan touched were written in English. A full translation is a deliberate owner decision — the runbook is executed by hand by a Ukrainian-speaking owner — so it was **not** auto-applied and **not** filed as a broken window, which would block `/gsd-ship` for a pre-existing documentary choice. Flagged here for an explicit disposition.
- **`roster-handlers.ts:41-42` carries a third wording** of the empty-state sentence (`Reply to a band member's message…`) on the `/roster_add`-without-reply usage-error surface, which the Copywriting Contract does not document at all. Explicitly out of scope per the plan; recorded so it is not conflated with the empty-state copy on a later pass.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern, or schema change at a trust boundary. The register's four `mitigate` dispositions all hold: `T-01-20-01` — the three new sentences are static module strings naming a field, interpolating no draft value or identifier, asserted verbatim; `T-01-20-02` — window 10 was waived with a reason preserving the full audit trail; `T-01-20-03` — only the `file` field changed in the ledger, and both representations were verified consistent across all 13 rows; `T-01-20-04` — D8 was explicitly prevented from becoming auto-passable. `T-01-20-SC` holds: no dependency added, removed or upgraded.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **D9 needs the live pass.** Worth batching with the outstanding 01-16 D9, 01-17 D9, 01-18 D11 and 01-19 D10 live checks in a single Telegram session: walk `/setup` to steps 3, 5 and 6 and confirm each prompt names its value and wraps acceptably on a narrow screen.
- **No `REQUIREMENTS.md` write was made.** `requirements.ready-ids` reports `0/3 ready` for `CONF-02`, `CONF-03` and `ROST-03` — sibling plans in this phase also declare them and have not finished. The shared-ID gate will mark them when the last declaring plan lands. All three already read `Complete` in the traceability table from earlier plans.
- **Owed to the orchestrator:** the usual post-merge `STATE.md` / `ROADMAP.md` progress writes. This plan requires **no** `STATE.md` decision-bullet replacement — its decisions are additive, not superseding. The outstanding `STATE.md` edit from plan 01-16 (broken window 13) is unaffected.
- **`/gsd-ship` is closer but still blocked.** `open_count` is down to 3: windows 2 and 3 (inherited stale integration expectations, needing a fix-or-waive disposition) and window 12 (update-path observability, recorded non-blocking for the phase).
- **The UAT now reads 11 passed / 7 issues / 3 skipped of 21.** Test 15 moved to pass on evidence, not on assertion.

## Self-Check: PASSED

- All eight modified files present on disk.
- All four task commits present on `worktree-agent-acebb76ff1d8c1f0e`: `5ccd361`, `a5e96f2`, `00e38c7`, `852060e`.
- No file deletions in any commit (`git diff --diff-filter=D 777d1db..HEAD` empty).
- `src/telegram/roster-renderers.ts` unchanged across the entire plan, as the plan required.
- Working tree clean apart from this SUMMARY; `node_modules` and `src/generated` are gitignored.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-25*
