---
phase: 01-chat-readiness
plan: 25
subsystem: testing
tags: [vitest, testcontainers, postgres, prisma, grammy, telegram, auth]

# Dependency graph
requires:
  - phase: 01-22
    provides: Corrected phase gates and the composed-bot registration surface this test drives
provides:
  - Label-addressed composed-bot regression gate for the AUTH-01 planning-access write path
  - Explicit fail-soft contract for unsupported planning-access selections, pinned with durable non-mutation evidence
  - A reusable in-test pattern for addressing inline-keyboard actions by visible label instead of row index
affects: [phase-02-planning-access-enforcement, chat-settings, regression-gates]

actuals:
  tokens: 7000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Integration tests address a card action by exact visible label; row order is presentation, never field identity"
    - "Fail-soft service results are pinned by before/after snapshots of every mutation-sensitive durable field, not by a bare return-value assertion"

key-files:
  created: []
  modified:
    - tests/integration/chat-configuration.test.ts

key-decisions:
  - "Retain the existing fail-soft `undefined` contract for unsupported planning-access values; the defect was the test expectation, not production behavior"
  - "Address dashboard, policy, and review actions by exact visible label so keyboard reordering cannot silently redirect a gate"
  - "Prove every absence claim with a negative probe before trusting it, per the phase's vacuous-gate rule"

patterns-established:
  - "callbackTokenFor: exactly-one-match label lookup over the flattened serialized keyboard; absent or duplicated labels fail loudly"
  - "Invalid-input contracts assert the safe return value AND that the committed row and actor-bound draft are byte-for-byte unchanged"

requirements-completed: [AUTH-01]

coverage:
  - id: D1
    description: "The composed bot opens planning-access editing by the `Edit planning access` label, reviews the non-default `Anyone in chat` transition, saves it, and persists ANYONE_IN_CHAT with exactly one revision increase in real PostgreSQL."
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#renders committed settings in fixed order and changes planning access only after review"
        status: pass
      - kind: integration
        ref: "npx vitest run --project integration --no-file-parallelism tests/integration/chat-configuration.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "An unsupported planning-access value resolves `undefined`, leaves the committed policy, committed revision, draft field, draft expiry, and draft replacement payload unchanged, and leaves the same draft usable for a later valid PREVIOUS_PARTICIPANTS selection and save."
    requirement: "AUTH-01"
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#rejects stale, expired, duplicate, and invalid planning-access saves without revision changes"
        status: pass
    human_judgment: false
  - id: D3
    description: "The label lookup and the durable non-mutation assertions are live, not vacuous — each was proven to fail against a deliberately wrong expectation before being trusted."
    verification:
      - kind: manual_procedural
        ref: "negative probes: renamed label -> 'Expected exactly one \"Edit planning access RENAMED\" button, found 0.'; replacementPayload probe -> null vs object; revision probe -> 1 vs 2"
        status: pass
    human_judgment: false

# Metrics
duration: 7 min
completed: 2026-08-26
status: complete
---

# Phase 01 Plan 25: Close Broken Windows 2 and 3 Summary

**Label-addressed composed-bot gate for the AUTH-01 non-default policy write, plus an explicit fail-soft contract for unsupported planning-access values pinned by before/after snapshots of the committed row and the actor-bound draft.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-26T18:53:14Z
- **Completed:** 2026-08-26T19:00:20Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Broken window 2 closed: the composed-bot AUTH-01 test no longer reads `inline_keyboard[0][0]` (which resolved to `Edit time zone`) and now finds `Edit planning access` by exact visible label, then drives the non-default `Anyone in chat` transition through review to a real PostgreSQL write.
- Broken window 3 closed: the undecided contract is now decided and documented in the test itself — an unsupported value fails soft as `undefined` and mutates nothing durable.
- The integration file is fully green for the first time since 2026-08-21: **12 passed / 0 failed**, with no test skipped, todo'd, filtered, or converted to a soft failure.
- Both new absence claims were proven non-vacuous by negative probes before being trusted, satisfying the phase's own rule that a gate must fail when the thing it guards is broken.
- No production file changed, confirming the plan's diagnosis that both defects were stale/undecided test contracts rather than product behavior defects.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the composed bot save a non-default policy through the labelled dashboard action** - `40b77dc` (test)
2. **Task 2: Pin unsupported policy selection as fail-soft and durably non-mutating** - `cfa3ddc` (test)

## Files Created/Modified

- `tests/integration/chat-configuration.test.ts` - Added the `callbackTokenFor` label lookup and `SerializedKeyboard` type; replaced three positional keyboard reads with label lookups; added a pre-save non-mutation assertion; replaced the inherited throw expectation with the fail-soft `undefined` contract plus committed-row and draft snapshot comparisons; asserted the recovered valid selection and the exact final policy/revision transition.

## Decisions Made

- **Retain fail-soft `undefined` for unsupported planning-access values.** An unsupported value is untrusted callback data. `selectValue` already rejects it before writing anything, and the production dispatcher maps `undefined` onto the same stale private alert it uses for mis-bound and expired selections. Throwing would have made this one input escape the shared safe-result contract without adding user value. Recorded as a test-contract correction, not a production behavior change.
- **Address card actions by exact visible label, requiring exactly one match.** `settingsDashboardKeyboard` deliberately renders `Edit time zone` first and `Edit planning access` last; row order is presentation, not field identity. Requiring a unique label match means an absent or ambiguously duplicated label fails loudly instead of silently falling back to a neighbouring field.
- **Use literal label strings, not the `PLANNING_ACCESS_LABELS` constant.** Importing the constant would make the assertion tautological with respect to the visible copy; literals pin the copy the user actually sees.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed dependencies and generated the Prisma client in the worktree**

- **Found during:** Task 1 (before the RED baseline run)
- **Issue:** The worktree had no `node_modules` and no `src/generated/prisma`, so `vitest` could not run at all. `npx prisma generate` additionally failed with `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL` because `prisma.config.ts` requires it even for client generation.
- **Fix:** Ran `npm ci` against the committed lockfile (no package added, no lockfile change), then `DATABASE_URL=<placeholder> npx prisma generate`. The placeholder is only consumed by config validation; the integration tests obtain their real URL from the Testcontainers PostgreSQL instance.
- **Files modified:** None tracked — `node_modules/` and `src/generated/` are gitignored.
- **Verification:** `git status --short` reported only `tests/integration/chat-configuration.test.ts` throughout.
- **Committed in:** N/A (no tracked change)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Environment bootstrap only. No scope creep, no production change, no dependency change.

## Verification Results

| Check | Result |
|---|---|
| `npx vitest run --project integration --no-file-parallelism tests/integration/chat-configuration.test.ts` | PASS — 12 passed / 0 failed |
| `npm run build` (`tsc --noEmit`) | PASS |
| `npm run format:check` (`prettier --check`) | PASS |
| No test skipped, todo'd, filtered, or `continue-on-error` | PASS — `grep -nE "\.skip\|\.todo\|\.only\|xit\(\|xdescribe\("` returns nothing |
| `npm run test:unit` (coherence check, out of plan scope) | PASS — 74 passed / 13 files |

### RED baseline captured before any edit

The plan's diagnosis was confirmed empirically before the first change: 2 failed / 10 passed, with `expected '<b>Time zone</b>…' to contain 'Choose who can start'` (window 2) and `promise resolved "undefined" instead of rejecting` (window 3).

### Negative probes (anti-vacuity)

Each new absence claim was proven to fail when the guarded property is violated, then reverted:

| Probe | Observed failure |
|---|---|
| Label renamed to `Edit planning access RENAMED` | `Error: Expected exactly one "Edit planning access RENAMED" button, found 0.` |
| Expected `replacementPayload: { value: "INVALID" }` | `- "replacementPayload": { … }` vs `+ "replacementPayload": null` |
| Expected `revision: committedBefore.revision + 1` | `- "revision": 2` vs `+ "revision": 1` |

The final committed state is the reverted, green version; the probes exist only in this record.

## TDD Gate Compliance

Both tasks carry `tdd="true"`, but the plan's frontmatter type is `execute`, not `tdd`, and the plan explicitly forbids production changes.

- **RED:** inherited and independently reproduced — the suite was run before any edit and both target assertions failed for the diagnosed reasons (transcript above).
- **GREEN:** achieved by correcting the test contracts, committed as `test(01-25)` × 2.
- **No `feat(01-25)` commit exists, and none should.** Production behavior was already correct; the defects were a stale positional expectation and an undecided contract. A `feat` commit here would mean production was changed to satisfy a test, which the plan prohibits. Gate-checkers scanning for a `feat(...)` commit should read this absence as conformance, not violation.

## Threat Mitigations

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-01-25-01 (Tampering, policy selection) | mitigated | Unsupported value resolves `undefined`; committed policy/revision and draft field/expiry/replacement payload all snapshot-compared as unchanged; comparison proven live by negative probe. |
| T-01-25-02 (EoP, broadened policy) | mitigated | Only a reviewed enum value is written; the review card proves `Current: Admins only` → `New: Anyone in chat` and the committed row is asserted unchanged between review and Save. D-12 semantics untouched — current administrators remain allowed independently of the stored policy. |
| T-01-25-03 (Repudiation, positional test) | mitigated | All three actions addressed by exact visible label with an exactly-one-match requirement; non-default transition proven in both the review card and PostgreSQL. |
| T-01-25-04 (DoS, invalid recovery) | accepted (as planned) | The same draft is asserted to still accept a valid `PREVIOUS_PARTICIPANTS` selection and save after the rejected attempt, bounding disruption to one rejected action. |

## Known Stubs

None. No stub, placeholder, TODO, or unwired data path was introduced.

## Issues Encountered

**Broken windows 2 and 3 are resolved in code but still read `open` in `.planning/WINDOWS.md`.**

This plan's `files_modified` scopes it to the test file only, and the ledger is a shared cross-phase artifact that a worktree agent should not write during a parallel wave. The closure therefore needs one post-merge action by the orchestrator or verifier:

```bash
gsd-tools windows fixed 2
gsd-tools windows fixed 3
```

Until that runs, `open_count` stays at 4 and `/gsd-ship` remains blocked on entries whose underlying defects are fixed. Windows 14 and 15 (F-10, F-11) are the genuinely remaining open entries and belong to sibling plans 01-23 and 01-24 in this same wave.

`.planning/REQUIREMENTS.md` needed no write — AUTH-01 was already checked off and marked `Complete` in the traceability table (a premature marking flagged in `01-VERIFICATION.md`, now retroactively earned by this gate).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The AUTH-01 composed-bot regression gate is green and can no longer pass through a default-policy no-op or a keyboard-position accident, which was `01-VERIFICATION.md`'s stated blocker for this requirement.
- CI's "Integration tests" job should now pass on this file; `01-14`'s "CI is expected to report red" note is superseded for `chat-configuration.test.ts`.
- Enforcement of the stored policy (`canStartPlanning` / `PlanningAccessService`, currently referenced only by its own unit test) remains deferred to Phase 2 exactly as `01-VERIFICATION.md` records. This plan closed policy *choice*, not policy *enforcement*.
- Outstanding for the phase, unchanged by this plan: the ledger closure above, the live-Telegram UAT for the non-default policy round trip, and windows 14/15 from live run 2.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-26*
