---
phase: 04-replanning-and-rehearsal-lifecycle
plan: "06"
subsystem: telegram
tags: [gap-closure, message-history, lifecycle, recovery]
gap_ids: [G-04-1]
requires:
  - phase: 04-05
    provides: Reachable lifecycle confirmations and guarded message tracking
provides:
  - Neutral retirement of untracked planning messages
  - Regression and fresh Chrome evidence for G-04-1
affects: [telegram-recovery, phase-04-acceptance]
tech-stack:
  added: []
  patterns: [Retire displaced copies only after successful pointer movement]
key-files:
  created:
    - .planning/phases/04-replanning-and-rehearsal-lifecycle/04-06-SUMMARY.md
  modified:
    - src/telegram/planning-handlers.ts
    - src/telegram/planning-renderers.ts
    - tests/unit/planning-availability-card.test.ts
    - tests/integration/planning-lifecycle-review.test.ts
    - tests/integration/planning-recovery.test.ts
    - tests/integration/planning-availability.test.ts
    - .planning/phases/04-replanning-and-rehearsal-lifecycle/04-UAT.md
    - .planning/phases/04-replanning-and-rehearsal-lifecycle/04-LIVE-TEST-2026-09-09.md
key-decisions:
  - Untracked copies carry dated neutral recovery advice, never current readiness or booking claims.
  - Keep explicit terminal records and existing best-effort delivery and compensation behavior.
requirements-completed: [AVAIL-05, AVAIL-06, LIFE-03, LIFE-04]
coverage:
  - id: retired-surfaces
    description: Displaced message history remains neutral after answer and lifecycle transitions.
    verification:
      - kind: integration
        ref: tests/integration/planning-lifecycle-review.test.ts#displaced message history
        status: pass
      - kind: integration
        ref: tests/integration/planning-recovery.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/planning-availability-card.test.ts#retired planning messages
        status: pass
    human_judgment: false
  - id: fresh-live-regressions
    description: Fresh Chrome attempts verify ready reversal, booked change/cancel and status/resume retirement.
    verification:
      - kind: manual_procedural
        ref: 04-LIVE-TEST-2026-09-09.md#post-fix-rerun--plan-04-06
        status: pass
    human_judgment: true
    rationale: Scoped live regression observations do not accept remaining multi-account cases or human prohibitions.
duration: 12min recorded verification window, plus preparation
completed: 2026-09-09
status: complete
---

# Phase 4 Plan 06: Retired message history

**Displaced Telegram copies now become dated historical notices with `/plan_status` recovery instead of retaining current ready or booked claims.**

## Accomplishments

- Closed G-04-1 across lifecycle commands, status/resume relocation, failed initial tracking and announcement displacement. Existing terminal cancellation/supersession remains explicit.
- Added successful send/edit history to the real-PostgreSQL Telegram harness, including two-participant retraction/recovery, later blocking, booked change and cancellation, and failed pointer tracking.
- Rebuilt the single local bot and repeated the fresh Chrome scenarios at 13:22–13:27 local time. Both test attempts ended terminal; no active or booked test rehearsal remains.

## Task commits

1. RED regression tests: `f586b80` — three lifecycle contradictions and eight recovery failures reproduce stale copy/recovery defects.
2. Implementation and renderer tests: `a9a6f44` — neutral retirement, preserving live availability controls and terminal records.
3. Existing compensation expectation: `336b7f4` — the prior test explicitly required Ready to book on an untracked message; it now requires neutral recovery copy.
4. Fresh Chrome/UAT evidence and targeted review: see the preceding `test(04-06)` evidence commit.

## Verification

Supported Node 24.19.0, PostgreSQL 18.4 Testcontainers and existing Docker environment; no dependencies installed.

| Check | Result |
| --- | --- |
| First lifecycle RED run | 3 failed for stale readiness/booked text; 56 passed |
| Recovery RED run | 8 failed for active copy/missing recovery advice; 34 passed |
| Focused lifecycle/recovery/renderer GREEN | 95 passed in 3 files |
| Availability compensation follow-up | 39 passed |
| `npm run typecheck` | Passed |
| `npm run test:unit` | 362 passed in 25 files |
| Final `npm run test:integration` | 307 passed in 21 files; 228.51 seconds |
| Touched source/test formatting | Passed |
| Compose rebuild and restart | Passed; migration exit 0, database retained |
| Fresh Chrome regression sequences | Passed; exact observations and DOM identifiers in live evidence |
| GSD schema/UI gates | No blocking findings; codebase drift skipped because no STRUCTURE.md |
| Targeted code review | No new findings; performed inline, not by an independent subagent |

Local run logs are `.planning/04-06-{red,recovery-red,green,unit,integration-final,availability,build}.log`. First automated reproduction started at 13:18:13 local; final integration run finished around 13:29:21. The initial full suite had one obsolete copy assertion; final results above follow its correction.

## Deviations and limits

- Added the existing `planning-availability.test.ts` compensation assertion to scope after full-suite testing exposed its obsolete active-copy expectation.
- The successor test initially counted participants instead of answered participants. Corrected it to require zero non-null answers; the roster snapshot itself correctly remains present.
- Used sequential inline execution under the skill's Codex fallback. No independent executor/verifier claim is made.
- Remote edits remain best effort. Pre-fix untracked copies are retained as evidence and are not retroactively repaired.
- `requirements-completed` records the plan's implemented scope. Requirement acceptance and Phase 4 completion remain pending H1–H7 subcases and all 14 human prohibition dispositions.

## Self-Check: PASSED

Implementation, tests and evidence exist and are committed; RED and GREEN results are recorded. G-04-1 is resolved. Continue with `$gsd-verify-work 4` for remaining acceptance; do not advance Phase 4 yet.
