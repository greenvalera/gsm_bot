---
phase: 02-weekly-rehearsal-proposal
fixed_at: 2026-09-03T07:14:07Z
review_path: .planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-09-03T07:14:07Z
**Source review:** `.planning/phases/02-weekly-rehearsal-proposal/02-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Stale-round cleanup ignores the round's timezone snapshot

**Files modified:** `src/domain/planning/planning-service.ts`, `tests/integration/planning-recovery.test.ts`
**Commit:** 3fa377e
**Status:** fixed: requires human verification
**Applied fix:** Stale cleanup now evaluates each draft against the UTC instant in its own snapshotted timezone and uses an id/status/revision-guarded update. Added a Honolulu-to-Kiritimati week-boundary regression.

### WR-01: Initial `/plan` leaves a live, unanchored card when anchor persistence fails

**Files modified:** `src/telegram/planning-handlers.ts`, `tests/unit/planning-logging.test.ts`
**Commit:** 2a4747d
**Status:** fixed
**Applied fix:** Every non-anchored initial card now has its keyboard removed through the existing superseded-card cleanup path. Added a handler-level regression for a lost anchor CAS.

### WR-02: A participant row can pair a round with another chat's membership and another user

**Files modified:** `prisma/schema.prisma`, `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`, `src/domain/planning/planning-service.ts`, `src/generated/prisma/internal/class.ts`, `src/generated/prisma/internal/prismaNamespace.ts`, `src/generated/prisma/internal/prismaNamespaceBrowser.ts`, `src/generated/prisma/models/ChatMembership.ts`, `src/generated/prisma/models/PlanningParticipant.ts`, `src/generated/prisma/models/PlanningRound.ts`, `tests/integration/planning-participant-integrity.test.ts`
**Commit:** 4f33665
**Status:** fixed
**Applied fix:** Participant snapshots now store `chatId` and use composite foreign keys that bind the snapshot to its round/chat and membership/chat/user identities. The migration backfills existing rows before making `chat_id` required. Added mismatched-user and cross-chat rejection tests and regenerated the Prisma client.

### WR-03: `/plan` queries participant history even when authorization cannot use it

**Files modified:** `src/telegram/handlers.ts`, `tests/unit/planning-start-authorization.test.ts`
**Commit:** c8b368e
**Status:** fixed
**Applied fix:** Participant history is queried only for current non-admin members under `PREVIOUS_PARTICIPANTS`; all other policy/role combinations pass `false` without touching the participant table. Added route tests with a throwing history query for administrator and `ANYONE_IN_CHAT` requests.

### WR-04: The one-minute status cooldown stays closed at exactly one minute

**Files modified:** `src/domain/planning/planning-service.ts`, `tests/integration/planning-recovery.test.ts`, `tests/unit/planning-logging.test.ts`
**Commit:** a465ced
**Status:** fixed: requires human verification
**Applied fix:** Both live-round and roundless cooldown claims now use an inclusive `lte` cutoff. Tests assert rejection at 59,999 ms and acceptance at exactly 60,000 ms, and the semantic unit double models the inclusive predicate.

### WR-05: Retention sweep failures are deliberately swallowed without any observable trace

**Files modified:** `src/domain/planning/planning-service.ts`, `src/app/create-bot.ts`, `tests/integration/planning-action-retention.test.ts`
**Commit:** ffb71f3
**Status:** fixed
**Applied fix:** The production planning service now receives the scoped logger and emits one bounded `planning.housekeeping.failure` error with route, chat id, and caught error while retaining best-effort behavior. Start and status failure paths are both asserted.

### WR-06: Callback acknowledgement is marked successful before delivery succeeds

**Files modified:** `src/telegram/callbacks.ts`, `tests/unit/callback-authority.test.ts`
**Commit:** 5b0109b
**Status:** fixed: requires human verification
**Applied fix:** The single-shot guard marks an acknowledgement complete only after Telegram delivery resolves. A rejected first alert now leaves the fallback available, preserves the original error, and makes exactly one bare retry.

## Verification

- Isolated worktree: TypeScript typecheck passed; unit suite passed (24 files, 267 tests); scoped Prettier check over `src`, `prisma`, and `tests` passed; Prisma schema validation passed.
- Main checkout after fast-forward: `npm run typecheck` passed; `npm run test:unit` passed (24 files, 267 tests).
- Main checkout after fast-forward with Docker access: `npm run test:integration` passed (12 files, 118 tests).
- The repository-wide `npm run format:check` reported only pre-existing untracked GSD installation files under `.agents/` and `.codex/`; all tracked product/schema/test files in this fix passed the scoped format check.

---

_Fixed: 2026-09-03T07:14:07Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 1_
