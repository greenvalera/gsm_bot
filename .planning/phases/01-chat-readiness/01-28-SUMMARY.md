---
phase: 01-chat-readiness
plan: 28
subsystem: ui
tags: [telegram, privacy-mode, copywriting, vitest, testcontainers]

requires:
  - phase: 01-27
    provides: F-12 live evidence and open broken window 17 identifying the undiscoverable reply gesture
provides:
  - One Copywriting Contract sentence shared byte-for-byte by setup Step 1 and the settings time-zone edit prompt
  - Focused unit drift guards and composed-bot coverage for both real Telegram surfaces
  - Forward-looking live-run instructions aligned to shipped copy and window 17 fixed with live confirmation still pending
affects: [01-29, 01-30, live-verification, phase-verification]

actuals:
  tokens: 4546
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Contract-fixed prompt copy is declared once in the UI spec, exported once by the renderer module, and interpolated by every owning surface"
    - "Literal assertions plus a cross-renderer drift guard prevent a shared constant from silently changing the product contract"

key-files:
  created:
    - tests/unit/timezone-prompt-copy.test.ts
    - .planning/phases/01-chat-readiness/01-28-SUMMARY.md
  modified:
    - .planning/phases/01-chat-readiness/01-UI-SPEC.md
    - src/telegram/renderers.ts
    - tests/integration/chat-readiness.e2e.test.ts
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md
    - .planning/WINDOWS.md

key-decisions:
  - "The setup and settings time-zone prompts quote one exported sentence that explicitly names the Telegram privacy-mode reply gesture."
  - "Window 17 closes on landed contract, renderer, test, and runbook changes while its reason explicitly keeps live confirmation pending Plan 01-30."
  - "No handler, update filter, reply keyboard, WebView, private-chat flow, dependency, or schema changed for this copy fix."

patterns-established:
  - "Copy authority note: non-contract UI-spec sections name the Copywriting Contract row but never restate its sentence."
  - "Cross-surface prompt tests assert both raw contract bytes and shared-constant composition."

requirements-completed:
  - CONF-01

coverage:
  - id: D1
    description: Setup Step 1 and the settings time-zone edit prompt state one byte-identical privacy-mode reply gesture from the Copywriting Contract
    requirement: CONF-01
    verification:
      - kind: unit
        ref: tests/unit/timezone-prompt-copy.test.ts#time-zone location prompt copy
        status: pass
      - kind: integration
        ref: tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster
        status: pass
    human_judgment: true
    rationale: "Automated tests prove the exact shipped bytes and both composed-bot routes; the motivating discoverability claim in a real Telegram client remains a bounded human check in Plan 01-30."
  - id: D2
    description: The live-verification runbook quotes the shipped Step 1 sentence and explains the reply gesture without rewriting historical observations
    requirement: CONF-01
    verification:
      - kind: other
        ref: "awk Step 1 region grep plus git diff historical-line inspection"
        status: pass
    human_judgment: false
  - id: D3
    description: Broken window 17 is fixed with identical Markdown/JSON provenance while window 16 and every unrelated ledger entry remain unchanged
    requirement: CONF-01
    verification:
      - kind: other
        ref: node /home/pogorelov/projects/bots/gsmbot/.claude/gsd-core/bin/gsd-tools.cjs windows status
        status: pass
      - kind: other
        ref: JSON/table reason equality and pre-task ledger comparison command
        status: pass
    human_judgment: false
  - id: D4
    description: The fix remains group-native and does not widen Telegram privacy access or introduce sensitive location evidence
    requirement: CONF-01
    verification:
      - kind: other
        ref: git diff c1b07df66197102a87cf607b79a011701cd12f90..HEAD --name-only
        status: pass
    human_judgment: true
    rationale: "Privacy-surface and sensitive-evidence prohibitions require judgment over the bounded diff even though no handler, update-filter, schema, or dependency file changed."

duration: 24 min
completed: 2026-08-28
status: complete
---

# Phase 01 Plan 28: Privacy-Mode Time-Zone Prompt Summary

**One contract-fixed reply instruction now reaches setup Step 1 and the settings time-zone editor, with unit drift guards, composed-bot proof, and an aligned live-verification ledger.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-28T21:26:34Z
- **Completed:** 2026-08-28T21:50:55Z
- **Tasks:** 3
- **Files modified:** 6 implementation/evidence files plus this summary

## Accomplishments

- Added one normative `Time-zone location prompt` Copywriting Contract row and one exported `TIMEZONE_LOCATION_HINT` used by both renderer branches.
- Added five focused unit behaviors and composed-bot assertions proving the exact reply gesture reaches setup reentry and `Edit time zone`; the full unit suite is 88/88 and the focused integration suite is 9/9.
- Updated only forward-looking live-run instructions and fixed window 17 with landed commit provenance while explicitly retaining the bounded live confirmation debt.
- Kept the change group-native and schema-neutral: no handler, update filter, reply keyboard, WebView, private-chat flow, dependency, coordinate, identity, or migration was added.

## Task Commits

Each task was committed atomically, with RED/GREEN/REFACTOR commits where TDD required them:

1. **Task 1: Prove the contract row through setup Step 1** — `bcc8811` (RED), `f5a659a` (GREEN)
2. **Task 2: Extend the proven path to the settings time-zone prompt** — `7031a2f` (RED), `a385afb` (GREEN), `f6ce0a6` (REFACTOR)
3. **Task 3: Align the live runbook and close window 17** — `72661ff`

**Plan metadata:** this summary commit

## Files Created/Modified

- `tests/unit/timezone-prompt-copy.test.ts` — exact setup/settings literals, constant composition, button-free Step 1, and cross-renderer drift coverage.
- `.planning/phases/01-chat-readiness/01-UI-SPEC.md` — sole-authority row and non-restating setup-sequence note.
- `src/telegram/renderers.ts` — exported shared prompt constant used by setup and settings.
- `tests/integration/chat-readiness.e2e.test.ts` — real composed-bot assertions for `Edit time zone` and setup reentry.
- `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` — forward-looking Step 1 and 2a operator guidance aligned to shipped copy.
- `.planning/WINDOWS.md` — window 17 fixed with identical table/JSON provenance and live confirmation pending.

## Decisions Made

- The reply gesture is fixed copy, not a renderer-local paraphrase: the UI contract owns the sentence and both renderers interpolate one exported constant.
- Window 17 follows the established code-landed/live-pending convention; only Plan 01-30 may supply the human Telegram confirmation.
- The solution changes copy and evidence only. Telegram privacy mode, routing, update ownership, and location handling remain unchanged.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The isolated worktree initially lacked its generated Prisma client and local dependency link. The existing `db:generate` command regenerated ignored client output, and the worktree was linked to the already-installed shared dependencies so Testcontainers could invoke Prisma. No tracked project file changed for this setup repair.
- The final formatting gate found the new unit test needed Prettier normalization; the TDD refactor commit `f6ce0a6` applied it and every verification remained green.

## User Setup Required

None - no new external service configuration is required. Plan 01-30 retains the existing live-verification environment documented in the runbook.

## Verification

- `npm run format:check` — pass.
- `npm run test:unit` — 14 files, 88 tests passed, none skipped.
- `npx vitest run --project integration tests/integration/chat-readiness.e2e.test.ts` — 9 tests passed against Testcontainers PostgreSQL.
- `npm run build` — pass (`tsc --noEmit`).
- Copy/contract gates — one renderer literal, three shared-constant references, zero superseded renderer instructions.
- Window gates — 15 fixed, 1 waived, window 16 open, window 17 fixed with matching Markdown/JSON reason.

## Next Phase Readiness

- Ready for Plan 01-29 to dispose of independent window 16.
- Plan 01-30 must perform the bounded live Telegram re-check before F-12 can be considered human-confirmed and Phase 1 can advance.
- `CONF-01` remains unchanged in `REQUIREMENTS.md`: the shared-requirement gate correctly defers marking until every declaring plan has a summary.

## Self-Check: PASSED

- [x] New focused test file exists.
- [x] All six task commits are reachable from HEAD.
- [x] Every task and plan-level verification passes.
- [x] `STATE.md`, `ROADMAP.md`, and `REQUIREMENTS.md` are untouched.
- [x] No stub, skipped test, unrun verification, new threat surface, or sensitive Telegram/location evidence was introduced.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-28 — window 17 fixed in code; bounded live confirmation remains pending Plan 01-30*
