---
phase: 01-chat-readiness
plan: 15
subsystem: dependency governance
tags: [npm, supply-chain, geo-tz, timezone, prisma]
requires:
  - phase: 01-01
    provides: "Historical tz-lookup rejection and direct-root provenance dossier"
provides:
  - "Approved exact versions for all 15 non-historical Phase 1 direct dependency roots"
  - "Independent geo-tz provenance, ambiguity, and Docker data-retention requirements"
affects: [01-02, timezone-resolver, Dockerfile, dependency-installation]
actuals:
  tokens: 12817
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Explicit dated human approval for every direct package before installation"
    - "Timezone resolution retains all geo-tz candidates for administrator selection"
key-files:
  created:
    - .planning/phases/01-chat-readiness/01-15-SUMMARY.md
  modified:
    - .planning/phases/01-chat-readiness/DEPENDENCY-AUDIT.md
key-decisions:
  - "Approve geo-tz@8.1.8; retain its runtime data directory and require explicit candidate confirmation."
  - "Keep tz-lookup@6.1.25 historically rejected and out of every install set."
patterns-established:
  - "Approved dependencies are installed only at their audited exact versions in the next execution plan."
requirements-completed: [CONF-01]
coverage:
  - id: D1
    description: "A fully approved, no-install Phase 1 direct-dependency set with the historical rejected resolver preserved."
    requirement: CONF-01
    verification:
      - kind: other
        ref: "awk direct-root approval audit plus filesystem no-install checks"
        status: pass
    human_judgment: false
duration: 13min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 15: Dependency Approval Recovery Summary

**All 15 non-historical direct package roots are explicitly approved at audited versions, with geo-tz safeguarded for ambiguous results and retained runtime data.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-20T08:46:37Z
- **Completed:** 2026-08-20T08:59:16Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Preserved the complete historical rejection of `tz-lookup@6.1.25` and its 01-01 halt evidence.
- Recorded a dated approval for every permitted non-historical direct root, including `geo-tz@8.1.8`.
- Captured `geo-tz` constraints for the following implementation: use `geo-tz/dist/find-now`, present all candidates to an authorized administrator, and retain `node_modules/geo-tz/data` in runtime images.
- Verified no `package.json`, `package-lock.json`, or `node_modules` was created during this no-install recovery plan.

## Task Commits

1. **Task 1: Append the independent geo-tz dossier while preserving the rejected resolver history** — `d0677c1` (docs)
2. **Task 2: Approve geo-tz and every other still-pending direct root or halt again** — `0b5d4d8` (docs)

Plan metadata is recorded in the final documentation commit.

## Files Created/Modified

- `.planning/phases/01-chat-readiness/DEPENDENCY-AUDIT.md` — Exact package evidence and dated decisions.
- `.planning/phases/01-chat-readiness/01-15-SUMMARY.md` — Resumable approval handoff for Plan 01-02.

## Decisions Made

- The approved future resolver is `geo-tz@8.1.8`; its package data must be included in Docker runtime images and its one-or-many result must not be reduced to the first candidate.
- `tz-lookup@6.1.25` remains explicitly rejected for its unavailable/abandoned source and stale 2019 boundary data.
- Plan 01-02 may install only the exact approved non-historical roots. It must not substitute or install `tz-lookup`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Verification bug] Removed Markdown table delimiters from Vitest's semver union text.**

- **Found during:** Task 2
- **Issue:** The planned `awk -F'|'` verification interpreted Vitest's `vite@^6.0.0 || ^7.0.0 || ^8.0.0` semver union as extra table columns and incorrectly reported the approved row as non-approved.
- **Fix:** Recorded the equivalent range as `vite@^6.0.0, ^7.0.0, or ^8.0.0`, preserving its meaning without breaking the table parser.
- **Files modified:** `.planning/phases/01-chat-readiness/DEPENDENCY-AUDIT.md`
- **Verification:** The exact planned approval and no-install command passed after the correction.
- **Committed in:** `0b5d4d8`

### State Recovery

**2. [Rule 3 - Blocking issue] Repaired stale blocked state after the state-advance parser rejected the historical halt format.**

- **Found during:** Plan close-out
- **Issue:** `state.advance-plan` could not parse the historical `01-01 — HALTED` position and left Phase 01 marked blocked after the approved recovery summary existed.
- **Fix:** Updated the planning state to mark Plan 01-02 ready, retain the `tz-lookup` restriction, and reconcile plan metrics with the two recorded summaries.
- **Files modified:** `.planning/STATE.md`

**Total deviations:** 2 auto-fixed (Rule 1, Rule 3)

## Issues Encountered

The sandbox prevented Git from creating its index lock for the task commit. The commit was made after narrowly scoped permission was granted; no repository data was overwritten or removed.

## User Setup Required

None — this plan only records a human decision and does not install or configure software.

## Next Phase Readiness

Plan 01-02 is unblocked to create the exact approved dependency manifest and lockfile. It must preserve the `geo-tz` Docker data-path requirement and retain explicit administrator selection for multiple IANA candidates.

## Self-Check: PASSED

- `d0677c1` and `0b5d4d8` exist in Git history.
- The dependency dossier contains approved `geo-tz@8.1.8`, rejected `tz-lookup@6.1.25`, and no pending non-historical direct-root row.
- No package manifest, lockfile, or installed tree exists.

---

*Phase: 01-chat-readiness*
*Completed: 2026-08-20*
