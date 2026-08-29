---
phase: 01-chat-readiness
plan: 29
subsystem: testing
tags: [vitest, testcontainers, postgres, provenance, broken-windows]

requires:
  - phase: 01-25
    provides: Label-addressed dashboard regression and fail-soft invalid-policy assertions with test-only closing commits
  - phase: 01-28
    provides: Window 17 closure, leaving window 16 as the sole open ledger entry
provides:
  - Dated Testcontainers evidence and git-established provenance for both planning-access assertions
  - Reconciled deferred finding that preserves the original text and ratifies the fail-soft contract
  - Broken window 16 fixed with a substantive reason and no open ledger entries remaining
affects: [01-30, phase-verification, gsd-ship, planning-access]

actuals:
  tokens: 2929
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Broken-window closure requires dated execution evidence, commit provenance, and an explicit contract verdict"
    - "Audit reconciliation preserves the original finding verbatim and appends a resolution instead of overwriting history"

key-files:
  created:
    - .planning/phases/01-chat-readiness/01-29-SUMMARY.md
  modified:
    - .planning/phases/01-chat-readiness/deferred-items.md
    - .planning/WINDOWS.md

key-decisions:
  - "Unsupported settings-edit planning-access values intentionally fail soft as undefined; the test contract changed, not the production service"
  - "Window 16 duplicates windows 2 and 3 and may close against the same two test-only commits plus a fresh green run"
  - "Plan 01-28 added unrelated time-zone coverage to chat-readiness.e2e.test.ts, not chat-configuration.test.ts; git history remains the provenance source"

patterns-established:
  - "Evidence-first disposition: observed run -> commit-level cause -> contract verdict -> ledger closure"
  - "Markdown and JSON ledger reasons are verified byte-identically before commit"

requirements-completed:
  - AUTH-01

coverage:
  - id: D1
    description: Both formerly failing planning-access assertions pass in a dated Testcontainers PostgreSQL run and their closing changes are attributed to commits 40b77dc and cfa3ddc
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#renders committed settings in fixed order and changes planning access only after review"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#rejects stale, expired, duplicate, and invalid planning-access saves without revision changes"
        status: pass
      - kind: integration
        ref: "npx vitest run --project integration tests/integration/chat-configuration.test.ts — 1 file, 12 tests passed"
        status: pass
    human_judgment: false
  - id: D2
    description: The reconciled deferred record retains the original finding and states that the invalid-policy test was rewritten to pin an intended fail-soft, user-visible, durably non-mutating contract
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "Task 1 audit command: original finding substring retained and all provenance/contract fragments present"
        status: pass
    human_judgment: false
  - id: D3
    description: Window 16 is fixed with identical Markdown and JSON evidence while all other windows retain their prior values and the ledger has no open entry
    requirement: AUTH-01
    verification:
      - kind: other
        ref: "node /home/pogorelov/projects/bots/gsmbot/.claude/gsd-core/bin/gsd-tools.cjs windows status — 0 open, 16 fixed, 1 waived, 17 total"
        status: pass
      - kind: other
        ref: "Task 2 ledger comparison: reason equality and every non-16 JSON entry unchanged from HEAD"
        status: pass
    human_judgment: false

duration: 7h 55m elapsed across usage-limit interruption
completed: 2026-08-29
status: complete
---

# Phase 01 Plan 29: Planning-Access Evidence Disposition Summary

**A 12/12 Testcontainers run, two test-only closing commits, and an explicit fail-soft contract verdict now support a fully reconciled deferred record and zero-open-window ledger.**

## Performance

- **Duration:** 7h 55m elapsed across usage-limit interruption
- **Started:** 2026-08-28T21:57:40Z
- **Completed:** 2026-08-29T05:53:32Z
- **Tasks:** 2
- **Files modified:** 2 evidence files plus this summary

## Accomplishments

- Captured the named integration file green against Testcontainers PostgreSQL at 1 file / 12 tests and recorded both target assertion titles.
- Established from git history that `40b77dc` closed the positional dashboard-label failure and `cfa3ddc` rewrote the invalid-policy assertion to pin the intended fail-soft contract without changing production.
- Preserved the original deferred finding verbatim, appended the contract and provenance resolution, and closed duplicate window 16 with a byte-identical Markdown/JSON reason.
- Reconciled the broken-window ledger to 0 open, 16 fixed, 1 waived, and 17 total while retaining every unrelated window and timestamp.

## Task Commits

Each task was committed atomically:

1. **Task 1: Prove the two assertions green, establish provenance, and name the winning contract** — `2117c85` (docs)
2. **Task 2: Close broken window 16 against the reconciled record** — `03a19f2` (docs)

**Plan metadata:** this summary commit

## Files Created/Modified

- `.planning/phases/01-chat-readiness/deferred-items.md` — Retains the superseded original finding and adds dated Testcontainers evidence, exact commit subjects, the test-versus-service distinction, and the three-part fail-soft rationale.
- `.planning/WINDOWS.md` — Marks window 16 fixed with a substantive reason in both representations and reconciles the frontmatter counts.
- `.planning/phases/01-chat-readiness/01-29-SUMMARY.md` — Records execution, verification, decisions, deviations, and handoff status.

## Decisions Made

- **The settings-edit invalid-policy contract remains fail-soft.** `selectValue` returns `SettingsReview | undefined`, the callback handler maps `undefined` to a private stale alert, and the integration test proves both the committed row and actor-bound draft remain usable and unchanged after rejection.
- **Window 16 is a duplicate, not a third defect.** Its two assertions are the same findings already closed as windows 2 and 3 by `40b77dc` and `cfa3ddc`.
- **Current file contents are not provenance.** Git history identifies the closing commits; Plan 01-28's unrelated time-zone coverage landed in `chat-readiness.e2e.test.ts`, not the planning-access integration file.
- **D-12 remains unchanged.** Planning-access policy broadens access beyond current administrators and never replaces administrator access.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Restored ignored test runtime artifacts in the isolated worktree**

- **Found during:** Task 1 final Testcontainers evidence run
- **Issue:** The first run could not import the gitignored generated Prisma client; after generation, the test helper still could not spawn `./node_modules/.bin/prisma` because the nested worktree had only package-resolution caches and no local `.bin` path.
- **Fix:** Ran the committed `db:generate` script with a non-secret placeholder URL used only for Prisma config validation, then linked the ignored worktree `.bin` path to the already-installed project dependency tree.
- **Files modified:** None tracked (`src/generated/` and `node_modules/` are ignored).
- **Verification:** The exact required command subsequently passed twice at 1 file / 12 tests against Testcontainers PostgreSQL.
- **Committed in:** N/A — environment-only repair

**2. [Rule 1 - Bug] Corrected the plan's inaccurate Plan 01-28 file attribution**

- **Found during:** Task 1 provenance inspection
- **Issue:** The plan said Plan 01-28 later added unrelated time-zone coverage to `chat-configuration.test.ts`, but commit stats and path history show it changed `chat-readiness.e2e.test.ts` and `timezone-prompt-copy.test.ts` instead.
- **Fix:** Recorded the actual files and retained the intended conclusion that current contents are not the provenance source.
- **Files modified:** `.planning/phases/01-chat-readiness/deferred-items.md`
- **Verification:** `git show --stat bcc8811 f5a659a 7031a2f a385afb f6ce0a6 72661ff` and `git log -- tests/integration/chat-configuration.test.ts`.
- **Committed in:** `2117c85`

---

**Total deviations:** 2 auto-fixed (1 blocking environment repair, 1 factual plan correction).
**Impact on plan:** Both fixes were required for truthful, runnable evidence. No production source, test source, dependency, schema, or planned contract changed.

## Issues Encountered

None beyond the isolated-worktree test bootstrap documented above. The final required run and every acceptance gate passed.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run --project integration tests/integration/chat-configuration.test.ts` | PASS — 1 file, 12 tests passed against Testcontainers PostgreSQL |
| Named dashboard-label assertion | PASS — captured by verbose reporter |
| Named invalid-policy assertion | PASS — captured by verbose reporter |
| Deferred record provenance/contract audit | PASS — exact subjects, test-versus-service sentence, three supporting facts, duplicate-window note |
| Original finding retention | PASS — original section present verbatim; Task 1 diff added 70 lines and deleted 0 |
| `gsd-tools windows status` | PASS — open 0, fixed 16, waived 1, total 17 |
| Window 16 table/JSON reason equality | PASS — byte-identical |
| Unrelated window/timestamp comparison | PASS — every non-16 JSON entry unchanged; window 10 remains waived |
| Plan scope | PASS — only the two declared evidence files changed before this summary; no `src/` or `tests/` file changed |
| `STATE.md` / `ROADMAP.md` | PASS — unchanged from executor base |

## Threat Mitigations

- **T-01-29-01 (Repudiation):** closure is traceable to a dated run, two exact commits, and the test-versus-service distinction in both the record and ledger reason.
- **T-01-29-02 (Elevation of privilege):** unsupported values remain non-mutating and cannot become a saved planning policy; D-12 administrator semantics are unchanged.
- **T-01-29-03 (Tampering):** the original finding remains verbatim under a superseded marker, and the resolution is additive.
- **T-01-29-04 (Information disclosure):** evidence records only commands, counts, titles, and commit identifiers; no database contents, chat identity, or credential was captured.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 01-30's bounded live Telegram re-check of the two time-zone prompts and replied-location path.
- The ledger now has no open broken window, but Phase 1 still requires Plan 01-30's explicit human confirmation before advancement.
- The orchestrator remains responsible for post-wave `STATE.md` and `ROADMAP.md` synchronization.

## Self-Check: PASSED

- [x] Both task commits exist and each contains exactly its declared file.
- [x] The named integration test file ran against Testcontainers and passed 12/12.
- [x] All task acceptance criteria and plan-level success criteria passed.
- [x] No production or test source file changed.
- [x] `STATE.md` and `ROADMAP.md` remain untouched.
- [x] Summary coverage classifies every shipped deliverable with passing evidence.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-29*
