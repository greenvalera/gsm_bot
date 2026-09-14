---
phase: 01-chat-readiness
plan: 11
subsystem: roster
tags: [telegram, prisma, postgresql, authorization, roster, destructive-action]
requires:
  - phase: 01-10
    provides: Reply-anchored durable Telegram identities, soft-active chat memberships, and safe roster labels
provides:
  - Initiator/chat/target/expiry-bound opaque roster removal actions
  - Named D-06 second confirmation with `Remove member` / `Keep member`
  - Transactional single-consumption soft removal with replay and concurrency safety
  - Reusable safe roster projection module (`roster-renderers.ts`)
affects: [chat-readiness, rehearsal-participants, authorization]
actuals:
  tokens: 9977
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - Two-step destructive action where every binding lives in a server-side CallbackAction row
    - Single-consumption via conditional `updateMany` count inside one Prisma transaction
    - Consequence copy scoped strictly to future rehearsal selection
key-files:
  created:
    - src/telegram/roster-renderers.ts
    - prisma/migrations/20260820030000_roster_removal/migration.sql
  modified:
    - prisma/schema.prisma
    - src/domain/roster/roster-service.ts
    - src/telegram/roster-handlers.ts
    - src/telegram/keyboards.ts
    - src/shared/callback-schema.ts
    - src/telegram/setup-handlers.ts
    - src/app/create-bot.ts
    - tests/unit/roster-remove.test.ts
    - tests/integration/roster-repository.test.ts
key-decisions:
  - "Removal tokens are random `v1:<uuid>` values; initiator, chat, target membership, expiry, and consumption state live only in the `CallbackAction` row."
  - "The request action is itself consumed when the confirmation is issued, so a roster row button cannot open two live confirmations."
  - "Removal is a soft deactivation (`activeAt: null`, `deactivatedAt`) so identity and history survive for later reactivation."
  - "Duplicate and concurrent confirmations resolve to a non-mutating `Already applied.` rather than an error."
patterns-established:
  - "Destructive roster actions revalidate the current Telegram administrator at both the request and the confirmation boundary."
  - "Confirmation copy names the safe member label and never implies Telegram group removal."
requirements-completed: [ROST-02, ROST-03, AUTH-02]
coverage:
  - id: D1
    description: Initiator/chat/target/expiry-bound opaque removal action with a named second confirmation
    requirement: ROST-02
    verification:
      - kind: unit
        ref: tests/unit/roster-remove.test.ts#creates opaque actor-bound confirmation actions and removes only once
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#renders the named second confirmation and rechecks the administrator before removal
        status: pass
    human_judgment: false
  - id: D2
    description: Declining the confirmation consumes the action without changing active membership
    requirement: ROST-02
    verification:
      - kind: unit
        ref: tests/unit/roster-remove.test.ts#keeps the member active when the initiator declines the confirmation
        status: pass
    human_judgment: false
  - id: D3
    description: Replay and concurrency safety — at most one transition and one stable deactivation timestamp
    requirement: ROST-02
    verification:
      - kind: unit
        ref: tests/unit/roster-remove.test.ts#refuses to remove an already-inactive membership
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#consumes one initiator-bound confirmation and soft-deactivates the exact membership once
        status: pass
    human_judgment: false
  - id: D4
    description: Cross-actor, cross-chat, expired, malformed, stale-target, and demoted-actor paths denied before mutation
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: tests/unit/roster-remove.test.ts#denies a different actor, a different chat, an expired action, and a malformed token
        status: pass
      - kind: unit
        ref: tests/unit/roster-remove.test.ts#refuses to remove a member using the keep action's token
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#rejects expired and stale targets before changing membership
        status: pass
    human_judgment: false
  - id: D5
    description: Soft removal retains identity/history and drops the member from the active roster projection
    requirement: ROST-03
    verification:
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#consumes one initiator-bound confirmation and soft-deactivates the exact membership once
        status: pass
    human_judgment: false
duration: 12 min
completed: 2026-08-21
status: complete
---

# Phase 01 Plan 11: Initiator-Bound Roster Removal Summary

**A D-06 named second confirmation whose initiator/chat/target/expiry authority lives entirely in a server-side action row, executing exactly one soft membership deactivation under replay and concurrency.**

## Performance

- **Duration:** 12 min (resume session only)
- **Tasks:** 1
- **Files modified:** 11 (2 created, 9 modified)

## Execution Note — Resumed Mid-Flight

This plan was executed across two sessions. The RED commit (`e760820`) landed in a prior
session; that session was interrupted after writing the GREEN implementation but before
committing it, so the implementation sat uncommitted in the working tree with no SUMMARY.

This session **audited the existing uncommitted work against every `must_haves` entry**
rather than re-implementing it, closed the one genuine coverage gap found (see Deviations),
then committed GREEN and this summary. The prior session's implementation was confirmed to
be the real GREEN step: at `e760820` the unit test fails to load without it.

## Accomplishments

- Added the `ROSTER_REMOVE` callback action kind plus its reviewed PostgreSQL enum migration.
- Removal request tokens are random `v1:<uuid>` values carrying no name, Telegram ID, permission, or authority; the `CallbackAction` row supplies initiator, chat, target membership, and expiry.
- `/roster` now renders one `Remove member` button per active member, each bound to its own server-side action.
- `beginRemoval` consumes the request action and issues a named `Remove <member>?` confirmation with `Remove member` / `Keep member` tokens bound to the same initiator.
- `removeConfirmed` requires an unconsumed, unexpired, initiator-matching `confirm` action and an active target, then consumes the action and soft-deactivates the membership in one transaction.
- Duplicate and parallel confirmations return `Already applied.` with no second transition and no deactivation-timestamp change.
- Extracted the safe roster projection into `src/telegram/roster-renderers.ts`, adding `renderRemovalConfirmation` while keeping the 01-10 label rules.

## Task Commits

1. **Task 1: Confirm and execute one initiator-bound idempotent roster removal (RED)** - `e760820` (`test`) — prior session
2. **Task 1: Confirm and execute one initiator-bound idempotent roster removal (GREEN)** - `6e5fab4` (`feat`) — this session

## Decisions Made

- **Consume the request action when issuing the confirmation.** A roster row button is single-use, so a stale roster message cannot open a second live confirmation for the same member.
- **Bind the `keep` branch to its own action token.** Declining is an explicit consumption, which keeps the "one action, one outcome" invariant symmetric and makes the decline path independently auditable.
- **Reject a `keep` token presented to `removeConfirmed`.** The stored `targetId` records the intended branch, so a token cannot be redirected to a more destructive operation.
- **Soft-deactivate rather than delete.** Identity and membership history remain for later reactivation, matching the 01-10 reactivation path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical coverage] Added the absent `Keep member` and denial unit coverage**

- **Found during:** Task 1 must_haves audit (this session)
- **Issue:** The `must_haves` artifact for `tests/unit/roster-remove.test.ts` requires "Confirmation, binding, stale, replay, and denial behavior coverage", and the plan `<behavior>` specifies five tests. The inherited working tree contained a single unit test covering only confirmation, binding, and replay. Plan behavior Test 2 (`Keep member` consumes the action without changing active membership) had **no coverage anywhere** — `keepRemoval` was implemented but entirely untested — and the unit-level stale/denial paths were missing.
- **Fix:** Added four unit tests: the decline path (including its own replay), cross-actor / cross-chat / expired / malformed-token denial, `keep`-token-cannot-remove, and already-inactive target refusal. Implementation required no change — every new test passed against the existing code, confirming the gap was coverage-only.
- **Files modified:** `tests/unit/roster-remove.test.ts`
- **Commit:** `6e5fab4`

**2. [Rule 1 - Test bug] Corrected `activeAt` assertions in the new tests**

- **Found during:** Task 1, first run of the added tests
- **Issue:** The new assertions expected `activeAt: NOW`, but `addFromRepliedUser` (inherited from plan 01-10) stamps `activeAt` with `new Date()` rather than the injected clock, so three assertions failed.
- **Fix:** Assert `activeAt: expect.any(Date)` where only "still active" is the behavior under test. The injected-clock assertions that genuinely matter (`deactivatedAt: NOW` on removal) were left exact.
- **Files modified:** `tests/unit/roster-remove.test.ts`
- **Commit:** `6e5fab4`

**Total deviations:** 2 auto-fixed (1 missing critical coverage, 1 test bug).
**Impact:** No production-code behavior changed by either deviation. Coverage now matches all five behaviors the plan specified.

## Known Issues

### Inherited pre-existing failure — `tests/integration/chat-configuration.test.ts` (NOT caused by this plan)

Two tests fail in the integration suite:

- `chat configuration promotion > renders committed settings in fixed order and changes planning access only after review`
- `chat configuration promotion > rejects stale, expired, duplicate, and invalid planning-access saves without revision changes`

**Evidence they are inherited:** the orchestrator ran the suite in a scratch worktree pinned
at `e760820` (before any 01-11 implementation existed) and both tests fail **identically with
and without** the 01-11 changes. They originate in the settings plans (01-08 / 01-09).

**Disposition:** deliberately out of scope for 01-11 and left unfixed by user decision; to be
addressed at the phase regression gate. Flagged here so that gate picks them up.

A passing run for this plan means: all `roster-remove` and `roster-repository` tests pass and
these two are the only failures in the suite. That is the observed state.

## Verification Results

| Check | Command | Result |
|---|---|---|
| Formatting | `npm run format:check` | PASS |
| Types | `npm run build` (`tsc --noEmit`) | PASS |
| Removal unit tests | `npm run test:unit -- roster-remove` | PASS (5/5) |
| Full unit suite | `npm run test:unit` | PASS (31/31, 8 files) |
| Repository integration tests | `npm run test:integration -- roster-repository` | PASS (6/6) |
| Full integration suite | `npm run test:integration` | 21/23 — only the 2 inherited `chat-configuration` failures above |

## must_haves Audit

| Item | Status | Evidence |
|---|---|---|
| Truth: named member + second initiator/chat/target/expiry-bound confirmation | MET | `renderRemovalConfirmation` names the safe label; `beginRemoval` writes `confirm`/`keep` actions carrying `actorUserId`, `chatId`, `membershipId`, `expiresAt` |
| Truth: replay returns `Already applied.` with no transition or timestamp change | MET | `removeConfirmed` returns `duplicate` on `consumedAt !== null`; integration asserts an unchanged `deactivatedAt` |
| Truth: parallel confirmations → one consumption, at most one transition | MET | conditional `updateMany` count check inside `$transaction`; integration asserts `["duplicate","removed"]` |
| Artifact: `roster-service.ts` exports `RosterService` | MET | present |
| Artifact: `roster-renderers.ts` exports `renderRemovalConfirmation` | MET | present |
| Artifact: unit test — confirmation, binding, stale, replay, denial | MET after fix | gap closed by Deviation 1 |
| Artifact: integration test — single-consumption, soft-removal, replay, concurrency | MET | 3 added integration tests |
| Key link: handlers → `requireCurrentAdministrator` | MET | fresh check on the command path and again on every callback, before request and confirmation |
| Key link: handlers → `CallbackAction` opaque binding | MET | token is `v1:<uuid>`; all authority read from the row |
| Key link: service → `$transaction` single consumption + soft deactivation | MET | one transaction consumes the action and updates membership |
| Prohibition ROST-02 (transparency) | MET | copy is `They will no longer be selected for future rehearsals.`; no text implies Telegram group removal |

## Threat Mitigations Applied

| Threat ID | Mitigation |
|---|---|
| T-01-19 (removal replay / cross-target) | Initiator/chat/target/expiry-bound action, fresh authorization, one transaction, single consumption; verified by replay and concurrency tests |
| T-01-20 (elevation of privilege) | `requireCurrentAdministrator` revalidated at request and confirmation; demotion-between-steps denial covered by integration test |
| T-01-21 (identity disclosure) | Only the 01-10 safe label is rendered; tokens and `targetId` assert-tested to exclude the Telegram ID |
| T-01-SC (supply chain) | No dependency added; lockfile untouched |

## Next Phase Readiness

Ready for `01-12`. Roster add, view, and removal are complete, so rehearsal participant
selection can rely on the active-membership projection.

The two inherited `chat-configuration` integration failures remain outstanding for the phase
regression gate.

## Self-Check: PASSED

All created files exist on disk and all three plan commits (`e760820` RED, `6e5fab4` GREEN,
`4fa4e71` docs) are present in git history. TDD gate sequence RED → GREEN verified.
