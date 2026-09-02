---
phase: 02-weekly-rehearsal-proposal
plan: 07
subsystem: telegram
tags: [telegram, callbacks, rendering, authorization, vitest]

requires:
  - phase: 02-05
    provides: The review card, participant lineup projection, and confirm/back callback controls
  - phase: 02-06
    provides: Author-only planning controls, owner attribution, and the callback authority boundary
provides:
  - Singular and plural review-card lineup copy derived from one participant count
  - Route-declared non-member callback refusal copy for planning controls
  - One shared identity precedence with plain-text and escaped HTML renderings
  - Broken window 20 marked fixed with no open ledger entries
affects: [phase-02-verification, availability collection, planning callbacks, roster rendering]

actuals:
  tokens: 52987
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Count-dependent card sentences are selected together from one roster length"
    - "Callback routes carry authority-specific denial copy in their discriminated union"
    - "HTML identity labels are derived by escaping the shared plain-text label"

key-files:
  created: []
  modified:
    - src/telegram/planning-renderers.ts
    - src/telegram/callbacks.ts
    - src/telegram/planning-handlers.ts
    - src/telegram/roster-renderers.ts
    - tests/unit/planning-time-card.test.ts
    - tests/unit/callback-authority.test.ts
    - tests/unit/planning-ownership.test.ts
    - tests/unit/roster-rendering.test.ts
    - .planning/WINDOWS.md

key-decisions:
  - "The callback route union owns non-member copy only for route-resolved member-authority surfaces; current-admin routes retain the Phase 1 administrator refusal verbatim."
  - "plainMemberLabel owns the single name/username/masked fallback precedence, while memberLabel is exactly escapeHtml(plainMemberLabel(...))."
  - "Window 20 was closed through the GSD windows command without hand-editing the ledger, even though the installed command cannot record the planned reason."

patterns-established:
  - "Plain/HTML label split: keep one identity precedence and derive the HTML representation through the one Telegram escaper."
  - "Authority-specific refusal text is route data, so adding a route requires deciding which non-member copy applies."

requirements-completed: [PLAN-01, PLAN-02, PLAN-08]

coverage:
  - id: D1
    description: "The review card renders dedicated empty-roster copy, singular lineup grammar for one participant, and unchanged counted plural grammar for two or more participants."
    requirement: PLAN-08
    verification:
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#uses singular copy for a one-member lineup"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#keeps the counted plural copy for a two-member lineup"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-time-card.test.ts#keeps the dedicated empty-roster copy"
        status: pass
    human_judgment: false
  - id: D2
    description: "A non-member tapping a planning card receives presence-based planning copy, while current-admin routes retain the administrator-only refusal and their existing authority matrix."
    requirement: PLAN-01
    verification:
      - kind: unit
        ref: "tests/unit/callback-authority.test.ts#refuses the planning kind for anyone no longer in the chat"
        status: pass
      - kind: unit
        ref: "tests/unit/callback-authority.test.ts#uses distinct refusal copy for non-members and non-administrators"
        status: pass
      - kind: unit
        ref: "tests/unit/callback-authority.test.ts#refuses every non-administrator on every Phase 1 kind with the verbatim alert"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner alerts render stored identity characters as plain callback text, while HTML cards escape the same shared identity precedence exactly once and unreadable identities remain masked."
    requirement: PLAN-02
    verification:
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#renders an author's HTML-significant name as plain callback text"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#renders an ampersand-joined owner name without an HTML entity"
        status: pass
      - kind: unit
        ref: "tests/unit/planning-ownership.test.ts#uses the masked label when nothing readable is stored, and never the whole id"
        status: pass
      - kind: unit
        ref: "tests/unit/roster-rendering.test.ts#derives every HTML label by escaping the shared plain identity label"
        status: pass
    human_judgment: false
  - id: D4
    description: "Broken window 20 is fixed and the broken-windows ledger reports no open entries."
    verification:
      - kind: other
        ref: "node /home/pogorelov/.codex/gsd-core/bin/gsd-tools.cjs query windows status — entry 20 fixed; open_count 0"
        status: pass
    human_judgment: false

duration: 7h42m
completed: 2026-09-02
status: complete
---

# Phase 2 Plan 07: Planning Copy Gap Closure Summary

**Correct singular lineup grammar, authority-specific callback refusals, and owner alerts that share one identity precedence across plain-text and escaped HTML surfaces.**

## Performance

- **Duration:** 7h 42m wall clock across orchestrated RED/GREEN handoffs
- **Started:** 2026-09-02T07:13:28Z
- **Completed:** 2026-09-02T14:55:42Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Closed G-02-2 with rendered review-card coverage for empty, one-member, and two-member lineups; both count-dependent sentences now use the correct singular or plural arm.
- Closed G-02-3 by making route-resolved planning callbacks carry presence-based non-member copy while preserving the administrator-only copy and behavior for every current-admin route.
- Closed G-02-4 with `plainMemberLabel` as the single identity precedence and `memberLabel` as its exactly-once HTML-escaped form, preserving the masked fallback and HTML safety.
- Marked broken window 20 fixed through the GSD ledger tool; the ledger reports `open_count: 0`.

## Task Commits

Each TDD task was committed as an atomic RED/GREEN pair:

1. **Task 1: Give both count-dependent strings on the review card a singular arm**
   - `4a31c73` — RED: failing review-card grammar cases
   - `cf8e6ac` — GREEN: correct singular review-card grammar
2. **Task 2: Make the non-member refusal copy follow the route's declared authority**
   - `fb93729` — RED: expose planning non-member denial copy
   - `68a5851` — GREEN: distinguish planning non-member denial
3. **Task 3: Render the owner-naming alert as plain text, and close window 20**
   - `5b9425d` — RED: expose escaped owner alert copy
   - `f5bc20c` — GREEN: render owner alerts as plain text and close the ledger entry

## Files Created/Modified

- `src/telegram/planning-renderers.ts` — Selects both lineup heading and availability sentence from the participant count.
- `src/telegram/callbacks.ts` — Models callback routes as authority-discriminated data carrying the applicable non-member copy.
- `src/telegram/planning-handlers.ts` — Defines planning-specific non-member copy and renders owner alerts with the plain identity label.
- `src/telegram/roster-renderers.ts` — Exposes the shared plain identity precedence and derives the HTML-safe label through the single escaper.
- `tests/unit/planning-time-card.test.ts` — Covers empty, singular, and plural review-card rendering.
- `tests/unit/callback-authority.test.ts` — Covers route-specific denial copy and the full inherited authority matrix.
- `tests/unit/planning-ownership.test.ts` — Covers raw HTML-significant owner names and masked fallbacks in callback alerts.
- `tests/unit/roster-rendering.test.ts` — Proves every HTML label equals the escaped plain label.
- `.planning/WINDOWS.md` — Records window 20 as fixed and reduces `open_count` to zero.

## Decisions Made

- Kept one identity precedence rather than introducing parallel plain and HTML identity paths: `memberLabel` delegates to `plainMemberLabel` and escapes the complete result once.
- Put planning non-member denial copy on the route declaration rather than adding another boundary-wide special case.
- Left `renderConfirmedStep` unchanged because its participant sentence is count-neutral.

## Deviations from Plan

### Tooling deviation: fixed-window reason is empty

- **Found during:** Task 3 ledger closure.
- **Issue:** The installed fallback GSD command accepts only `windows fixed <id>`. The planned `--reason` invocation failed with `Error: Unknown flag: --reason`.
- **Resolution:** Ran the supported GSD fixed command with entry ID 20, then verified entry 20 is `fixed` and `open_count` is `0`.
- **Ledger integrity:** The reason field remains empty. The ledger was not hand-edited.
- **Impact:** The defect and open-window gate are closed, but the plan's non-empty reason acceptance detail could not be recorded by the current tool version.

No production-scope deviations were introduced.

## Verification

- Task-focused unit suites passed during each RED/GREEN cycle; the final Task 3 focused run passed 69 tests across `planning-ownership`, `roster-rendering`, and `planning-time-card`.
- Full unit suite passed: 24 files, 263 tests, no skipped or todo tests.
- `npm run typecheck` passed.
- `npm run format:check` passed.
- `git diff --check` passed.
- Every Task 3 acceptance grep gate passed: plain-label calls `2`/`1`, planning-handler HTML-label calls `0`, planning-renderer HTML-label calls `2`, escaper definition/replacement sites `1`/`1`, and planning identity-column matches `0`.
- `git diff --stat package.json package-lock.json` was empty.
- GSD windows status reported entry 20 `fixed`, `fixed_count: 19`, and `open_count: 0`.

## Issues Encountered

- Vitest used `--configLoader runner` because the bundled configuration loader writes outside the isolated worktree.
- The GSD fixed-window reason limitation is documented under Deviations from Plan; no ledger workaround or manual edit was used.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three Telegram copy gaps assigned to Plan 02-07 are covered by passing unit tests and the phase unit suite remains green.
- The broken-windows ship gate is clear with zero open entries.
- The empty reason on fixed window 20 remains a documented tooling limitation for any later audit that requires reason metadata.

---
*Phase: 02-weekly-rehearsal-proposal*
*Completed: 2026-09-02*
