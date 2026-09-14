---
phase: 01-chat-readiness
plan: 26
subsystem: testing
tags: [vitest, testcontainers, postgres, telegram, uat, broken-windows, runbook]

# Dependency graph
requires:
  - phase: 01-23
    provides: Tri-state settings-draft routing and the settings-specific expiry sentence (F-10 / window 14)
  - phase: 01-24
    provides: The four-state `/setup` entry projection and its real-PostgreSQL coverage (F-11 / window 15)
  - phase: 01-25
    provides: Label-addressed planning-access gate and the fail-soft invalid-policy contract (windows 2 and 3)
provides:
  - A single-commit green Phase 1 baseline — format, types, 83 unit tests, 36 PostgreSQL-backed integration tests
  - Evidence-backed closure of broken windows 2, 3, 14 and 15
  - An English live-verification runbook that preserves Runs 1 and 2 verbatim
  - A complete, unexecuted Run 3 protocol with an empty human approval field
affects: [01-27, live-verification, gsd-ship, phase-01-signoff]

# Actuals (#2632) — same estimateTokens scale as the plan's estimate (chars/4).
actuals:
  tokens: 20600
  tasks: 2
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A ledger entry closes on reproducible automated evidence; live confirmation is tracked by its UAT test, not by the same entry"
    - "Translation of an evidence document is verified by set-comparing every backtick-quoted verbatim string before and after"
    - "A prepared run protocol ships with its verdict field empty; approval is never pre-filled by the document that requests it"

key-files:
  created:
    - .planning/phases/01-chat-readiness/01-26-SUMMARY.md
  modified:
    - .planning/WINDOWS.md
    - .planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md

key-decisions:
  - "Closed windows 14 and 15 despite 01-23 and 01-24 deliberately leaving them open — the ledger records a code defect at a file:line, and that defect is fixed and covered; the live evidence they were withholding is tracked by UAT tests 22 and 23, which stay pending"
  - "Left window 16 open: it duplicates windows 2 and 3 and is objectively resolved, but this plan's acceptance criteria forbid changing any window other than 2, 3, 14 and 15"
  - "Kept Runs 1 and 2 byte-faithful during translation; every one of the 78 verbatim Telegram strings survives, verified by set comparison rather than by reading"
  - "Run 3 must inherit Run 2's Postgres volume — both F-10 and F-11 are structurally unreachable from a clean slate, so a clean-slate Run 3 would prove nothing about either"
  - "The Run 3 verdict field ships empty; a green automated gate does not authorize approval, since Runs 1 and 2 were both NOT APPROVED against suites green at the time"

patterns-established:
  - "Ledger-vs-UAT split: a broken window closes on reproducible automated evidence, while the live claim it was opened by stays with its UAT test until a live run"
  - "Verbatim-string set comparison as the acceptance gate for translating an evidence document"

requirements-completed:
  [
    CONF-01,
    CONF-02,
    CONF-03,
    CONF-05,
    ROST-01,
    ROST-02,
    ROST-03,
    AUTH-01,
    AUTH-02,
  ]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The complete automated Phase 1 gate passes from one commit: formatting, type check, the full unit suite, and the full PostgreSQL-backed integration suite"
    requirement: "CONF-01"
    verification:
      - kind: other
        ref: "npm run format:check && npm run build"
        status: pass
      - kind: unit
        ref: "npm test — 83 passed / 13 files"
        status: pass
      - kind: integration
        ref: "npm run test:integration — 36 passed / 5 files"
        status: pass
    human_judgment: false
  - id: D2
    description: "Window 14 (F-10): an expired settings-edit draft reaches its settings-specific expiry response with the fresh administrator check still preceding the durable delete, and the setup wizard is never consulted"
    requirement: "CONF-02"
    verification:
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#authorizes, discards only the lapsed row, and answers with settings expiry copy"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#answers a lapsed timezone edit answered with a location the same way"
        status: pass
      - kind: unit
        ref: "tests/unit/update-route-ownership.test.ts#keeps the lapsed row intact when the membership lookup cannot be answered"
        status: pass
    human_judgment: false
  - id: D3
    description: "Window 15 (F-11): `/setup` on a configured chat renders `Setup in progress` / `Step 1 of 8` instead of the unconfigured readiness prompt, and a live draft resumes at its exact current step"
    requirement: "CONF-05"
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#opens a revision-bound wizard directly when the chat is already configured"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#resumes a live draft at its exact current step without resetting it"
        status: pass
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#reports the setup expiry and starts no mutation once the draft lapses"
        status: pass
    human_judgment: false
  - id: D4
    description: "Window 2: the composed-bot planning-access test addresses `Edit planning access` by visible label and persists the non-default `ANYONE_IN_CHAT` policy through review and save"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#renders committed settings in fixed order and changes planning access only after review"
        status: pass
    human_judgment: false
  - id: D5
    description: "Window 3: an unsupported planning-access token resolves `undefined` and leaves the committed row and the actor-bound draft unchanged"
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#rejects stale, expired, duplicate, and invalid planning-access saves without revision changes"
        status: pass
    human_judgment: false
  - id: D6
    description: "COVERAGE.md remains present and valid, and the 01-14 summary coverage classifier reports no structural error"
    verification:
      - kind: other
        ref: "test -s .planning/phases/01-chat-readiness/COVERAGE.md"
        status: pass
      - kind: other
        ref: "gsd-tools uat classify-coverage --summary 01-14-SUMMARY.md — mode coverage, total 5, errors []"
        status: pass
    human_judgment: false
  - id: D7
    description: "The runbook is English, retains every verbatim Telegram string from the previous revision, keeps Runs 1 and 2 including both NOT APPROVED verdicts, and commits no secret or private identifier"
    verification:
      - kind: other
        ref: "backtick-quoted ASCII string set comparison HEAD~1 vs working tree — 78 old strings, 0 missing, 13 added"
        status: pass
      - kind: other
        ref: "grep -cP '[\\x{0400}-\\x{04FF}]' runbook — 0 Cyrillic lines"
        status: pass
      - kind: other
        ref: "secret scan for bot-token, chat-id and @username patterns — no match"
        status: pass
      - kind: other
        ref: "grep for Run 1 / Run 2 / Run 3 / NOT APPROVED / F-10 / F-11 / 30 minutes / PROJECT.md / STATE.md / test 16 / pending — 88 matching lines, every token present"
        status: pass
    human_judgment: false
  - id: D8
    description: "The Run 3 protocol is adequate to produce the remaining live evidence for UAT tests 22, 23 and 24"
    verification: []
    human_judgment: true
    rationale: "Adequacy of a live protocol can only be established by executing it. The document is complete and mechanically checked, but whether its rows actually elicit the F-10 and F-11 evidence is decided by the human operator who runs it in 01-27. Its verdict field is empty by construction."

# Metrics
duration: 11 min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 26: Automated Closure Gate and English Run 3 Protocol Summary

**A single-commit green Phase 1 baseline (83 unit + 36 PostgreSQL integration tests) closes broken windows 2, 3, 14 and 15 on reproducible evidence, and the live-verification runbook becomes English with Runs 1 and 2 preserved verbatim and an unexecuted Run 3 protocol whose approval field ships empty.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-26T19:09:11Z
- **Completed:** 2026-08-26T19:20:52Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Ran the composed gate from one commit and got a fully green tree for the first time in this phase: `format:check` clean, `tsc --noEmit` clean, 83/83 unit tests across 13 files, 36/36 integration tests across 5 files against real PostgreSQL via Testcontainers.
- Confirmed each of the four assigned windows against the specific assertion that proves it, not merely against a green suite — including the exact call-order assertion that shows the F-10 fix does not bypass authorization.
- Closed windows 2, 3, 14 and 15; `open_count` fell from 5 to 1.
- Translated the 484-line runbook from Ukrainian to English while preserving all 78 verbatim Telegram strings, both NOT APPROVED verdicts, and the retracted vacuous step-2e pass.
- Added a Run 3 protocol with preconditions, reproducibility metadata, an automated preflight, restart and preserved-volume checks, 25 behaviour rows, and three high-attention rows (F-10, F-11, UAT test 24).

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Run the composed automated closure gate and disposition windows 2, 3, 14, 15** — `7148824` (docs)
2. **Task 2: Preserve earlier live evidence and publish the English Run 3 protocol** — `0a057f3` (docs)

_Both commits are `docs` because this plan changes no source or test file. The code and test evidence it gates was landed by 01-23, 01-24 and 01-25; this plan only runs the gate and records its outcome._

## Files Created/Modified

- `.planning/WINDOWS.md` — windows 2, 3, 14 and 15 moved `open` → `fixed` with resolution timestamps. Exactly four status transitions; no other entry touched.
- `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` — English throughout; Runs 1 and 2 retained as immutable evidence; new Run 3 protocol appended.

## Verification Results

### Composed gate (Task 1), re-run after the Task 1 commit and again at plan close

| Check | Result |
| --- | --- |
| `npm run format:check` | pass — all matched files use Prettier code style |
| `npm run build` (`tsc --noEmit`) | pass — no output |
| `npm test` (unit) | pass — 83 tests, 13 files |
| `npm run test:integration` | pass — 36 tests, 5 files |
| `test -s .planning/phases/01-chat-readiness/COVERAGE.md` | pass |
| `gsd-tools uat classify-coverage --summary 01-14-SUMMARY.md` | pass — mode `coverage`, total 5, `errors: []` |
| `gsd-tools windows status` | pass — `open_count` 5 → 1 |

Evidence commit for the gate: base `bbf0867` (the merged wave-1 tree), unchanged by Task 1 in any source or test file.

### Focused window evidence

| Window | Proving assertion | Result |
| --- | --- | --- |
| 14 (F-10) | `update-route-ownership.test.ts` asserts the exact order `setupDraft.findUnique → settingsEditDraft.findUnique → membership → settingsEditDraft.findUnique → settingsEditDraft.deleteMany → api:sendMessage`, the settings-specific sentence as the only reply, `setup.requireActive` never called, and `configurationWrites` empty | 14/14 pass |
| 15 (F-11) | `walking-skeleton.test.ts` asserts `Setup in progress` as the first line and `Step 1 of 8` on a configured chat, exact-step resume on a live draft, and expiry copy with no replacement draft | 8/8 pass |
| 2 | `chat-configuration.test.ts` resolves the callback token via `callbackTokenFor(..., "Edit planning access")`, drives `Anyone in chat` through `Current: Admins only` / `New: Anyone in chat`, and persists `ANYONE_IN_CHAT` | 12/12 pass |
| 3 | the same file asserts `selectPlanningAccessPolicy(..., "INVALID")` resolves `undefined` with committed `planningAccessPolicy`/`revision` and draft `field`/`expiresAt`/`replacementPayload` snapshot-compared as unchanged | 12/12 pass |

The F-10 order assertion is what makes the acceptance criterion "without authorization bypass" objectively true rather than plausible: the fresh membership lookup sits between the read-only ownership probe and the durable delete, so no cleanup precedes authorization.

### Runbook evidence (Task 2)

| Check | Result |
| --- | --- |
| Verbatim Telegram strings preserved | pass — 78 backtick-quoted ASCII strings in the previous revision, **0 missing**, 13 added for Run 3 |
| Narrative is English | pass — 0 lines containing Cyrillic characters |
| Runs 1 and 2 retained with their verdicts | pass — `NOT APPROVED` appears 6 times, including both run verdicts |
| Run 3 verdict unfilled | pass — `Run 3 verdict \| _empty — to be recorded by the human operator_` |
| Test 16 explicitly owner-deferred | pass — row 3-21 marked `YES — owner-deferred. Not a Run 3 approval condition.` |
| No secret or private identifier | pass — scans for bot-token, chat-id and `@username` patterns return no match |
| Plan `<verify>` grep | pass — 88 matching lines; each of the 11 required tokens present individually |

## Decisions Made

- **Windows 14 and 15 are closed, over the recorded objections of 01-23 and 01-24.** Both sibling plans deliberately left their window open, arguing that F-10 and F-11 were found live against an inherited volume and that closing them on automated evidence "would repeat the pattern this phase has already been burned by". That instinct is right about the risk and wrong about the instrument. A `.planning/WINDOWS.md` entry names a **code defect at a file and line** — window 14 is `src/telegram/settings-handlers.ts:303`, window 15 is `src/telegram/setup-handlers.ts:443`. Both of those defects are fixed, and both are now pinned by tests that fail when the fix is reverted (01-24 demonstrated exactly that by restoring the pre-fix file and watching all four new cases fail). The claim the siblings were protecting — "the sentence actually reaches a real Telegram group" — is not what the ledger records; it is what **UAT tests 22 and 23** record, and those remain `[pending]` in `01-UAT.md`, untouched by this plan. Keeping both instruments open for the same evidence does not double the safety; it just makes `open_count` stop meaning anything. The gate that would catch a live discrepancy is Run 3, and it is now written down in full.
- **Window 16 stays open, and I disagree with leaving it there.** 01-24 filed it as an `unmet-truth` describing two `chat-configuration.test.ts` failures at lines 186 and 302. Those are the same two defects as windows 2 and 3, re-filed under different line numbers after the file shifted, and 01-25 fixed both — the file is now 12/12 green, which is direct evidence that window 16's stated symptom no longer reproduces. But this plan's acceptance criteria say "no other window is changed", and its success criteria say "Only windows 2, 3, 14, and 15 are closed by this plan". Silently exceeding that scope would be the same category of error as closing a window without evidence. So the entry stays open and the evidence is recorded here for whoever holds the disposition: **window 16 is a duplicate of windows 2 and 3 and is resolved; it needs `gsd-tools windows fixed 16` from the orchestrator, the verifier, or plan 01-27.** Until then it alone keeps `open_count` at 1 and `/gsd-ship` blocked.
- **Run 3 must inherit Run 2's Postgres volume.** This is written into the Run 3 preconditions as a hard prohibition on `docker compose down -v`. Run 2's own methodological note is the argument: F-10 required a two-day-old expired draft and F-11 required an already-saved configuration, so both are structurally unreachable from a clean slate. A clean-slate Run 3 could pass every row and still prove nothing about the two defects it exists to verify.
- **The Run 3 verdict ships empty and the document says why.** Runs 1 and 2 were both NOT APPROVED against test suites that were green at the time. A runbook that pre-fills its own verdict, or that lets a green gate imply one, would have been wrong twice already in this phase.
- **Translation was verified by set comparison, not by reading.** A 484-line document translated by hand is exactly where a verbatim contract string quietly acquires a typo. Extracting every backtick-quoted ASCII string from both revisions and diffing the sets turns "I preserved the exact copy" from a claim into a check: 78 in, 0 lost.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies and generated the Prisma client in the fresh worktree**

- **Found during:** Task 1 (before the precondition check could be acted on)
- **Issue:** The worktree had neither `node_modules` nor `src/generated/prisma` — both gitignored — so `tsc`, `vitest` and Prettier could not run at all, and the plan's entire gate was unexecutable.
- **Fix:** `npm ci` against the committed lockfile (no package added, no lockfile change), then `DATABASE_URL=<placeholder> npx prisma generate`. The placeholder is consumed only by `prisma.config.ts` validation; `prisma generate` opens no connection, and the integration tests take their real URL from the Testcontainers instance.
- **Files modified:** None tracked — `git check-ignore -v` confirms both paths are gitignored, and `git status --short` was empty immediately afterwards.
- **Verification:** `npm run build` clean on the untouched base tree before any edit.
- **Committed in:** N/A (no tracked change)

This is not a package install in the sense the Rule 3 exclusion guards against: no new package name was introduced, resolved, or substituted. `npm ci` reproduces the exact committed lockfile.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Environment bootstrap only. No scope creep, no dependency change, no source or test file touched. The plan's stated scope — two planning artifacts — held exactly.

## Threat Model Disposition

| Threat ID | Disposition | Where mitigated |
| --- | --- | --- |
| T-01-26-01 (Tampering, `WINDOWS.md`) | mitigated | Only IDs 2, 3, 14 and 15 changed status, after every named gate passed. The diff carries exactly four `open` → `fixed` transitions; window 16 and all previously-resolved entries are byte-identical. Command, test counts and base commit recorded above. |
| T-01-26-02 (Repudiation, Run 1/Run 2 evidence) | mitigated | Both runs kept with their dates, outcomes, per-step observations, both NOT APPROVED verdicts, the F-10/F-11 rationale, and the retracted vacuous 2e pass. Preservation verified by set-comparing every verbatim quoted string, not by reading. |
| T-01-26-03 (Information Disclosure, Run 3 metadata) | mitigated | The metadata table asks for commit SHA, volume name, migration count and role descriptions, and explicitly forbids the chat ID, group title, usernames, display names, raw coordinates, the token and the Postgres password. A pattern scan of the committed file returns no match. |
| T-01-26-04 (EoP, final approval state) | mitigated | The Run 3 verdict, recorder and date fields are empty; the document states that approval is a human outcome and that a green gate does not authorize it. UAT tests 22, 23 and 24 remain `[pending]` in `01-UAT.md`, which this plan did not modify. |
| T-01-26-SC (Tampering, supply chain) | accepted (as planned) | No package installed or changed. `npm ci` reproduces the committed lockfile; `git diff bbf0867..HEAD -- package.json package-lock.json prisma` is empty. |

## Issues Encountered

**Window 16 remains open and blocks `/gsd-ship` for a defect that is objectively fixed.** Detailed under Decisions Made. One command resolves it once someone with the disposition authority runs it:

```bash
gsd-tools windows fixed 16
```

This is the only reason `open_count` is 1 rather than 0.

## Known Stubs

None. The two modified files are planning artifacts; neither introduces a stub, placeholder, TODO, or unwired data path. The Run 3 protocol's `_to be filled_` cells are not stubs — they are the deliberately empty observation fields of an unexecuted run, and the plan's own acceptance criteria require the approval field to be empty. No entry was appended to `.planning/WINDOWS.md`.

## Threat Flags

None. This plan touches no source file and introduces no network endpoint, auth path, file-access pattern, or schema change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The automated Phase 1 baseline is green from one commit and can be handed to 01-27 as a stated precondition rather than an assumption.
- **Blocking for phase sign-off:** UAT tests 22, 23 and 24 stay `[pending]`. Their evidence is live-Telegram evidence and belongs to 01-27, which now has a written protocol rather than an improvised third run.
- **Requires action outside this plan:** `gsd-tools windows fixed 16` (see Issues Encountered). `.planning/REQUIREMENTS.md` was correctly left unwritten — `requirements.ready-ids` returned 0 of 9 ready, because 01-27 declares the same IDs and has no SUMMARY yet.
- Carried forward untouched: UAT test 16's pagination gap, the multi-candidate time-zone branch, the "only the offending field is re-asked" clause, and the `update-path-logging.test.ts:357` scan-root observation. All four are recorded in the runbook as explicitly non-blocking.

## Self-Check: PASSED

- `.planning/WINDOWS.md` — FOUND on disk, `open_count: 1`
- `.planning/phases/01-chat-readiness/01-LIVE-VERIFICATION-RUNBOOK.md` — FOUND on disk, 0 Cyrillic lines
- `.planning/phases/01-chat-readiness/01-26-SUMMARY.md` — FOUND on disk
- Commit `7148824` (Task 1) — FOUND in git log
- Commit `0a057f3` (Task 2) — FOUND in git log
- Both tasks' `<acceptance_criteria>` re-run and passing (10 of 10)
- Plan-level `<verification>` re-run at close: full gate green, four windows carry matching evidence, runbook retains Runs 1/2 and carries an unapproved Run 3 protocol
- Working tree clean; no untracked or deleted files across both commits

---

_Phase: 01-chat-readiness_
_Completed: 2026-08-26_
