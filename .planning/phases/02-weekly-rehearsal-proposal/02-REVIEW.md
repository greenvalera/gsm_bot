---
phase: 02-weekly-rehearsal-proposal
reviewed: 2026-09-03T06:35:42Z
depth: standard
files_reviewed: 42
files_reviewed_list:
  - prisma/migrations/20260831100411_planning_rounds/migration.sql
  - prisma/migrations/20260901120000_chat_status_cooldowns/migration.sql
  - prisma/migrations/20260902152000_planning_participant_integrity/migration.sql
  - prisma/schema.prisma
  - src/app/create-bot.ts
  - src/domain/auth/authorization-service.ts
  - src/domain/auth/planning-access-service.ts
  - src/domain/planning/planning-service.ts
  - src/domain/planning/slot-generator.ts
  - src/domain/planning/target-week.ts
  - src/domain/roster/roster-service.ts
  - src/infrastructure/time/civil.ts
  - src/infrastructure/time/zoned-clock.ts
  - src/shared/callback-schema.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/planning-renderers.ts
  - src/telegram/roster-renderers.ts
  - tests/fakes/chat-readiness.ts
  - tests/helpers/racing-client.ts
  - tests/integration/chat-configuration.test.ts
  - tests/integration/chat-readiness.e2e.test.ts
  - tests/integration/planning-action-retention.test.ts
  - tests/integration/planning-confirm.test.ts
  - tests/integration/planning-participant-integrity.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/planning-round.test.ts
  - tests/integration/planning-takeover.test.ts
  - tests/integration/planning-token-release.test.ts
  - tests/unit/callback-authority.test.ts
  - tests/unit/planning-day-card.test.ts
  - tests/unit/planning-keyboards.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/planning-ownership.test.ts
  - tests/unit/planning-start-authorization.test.ts
  - tests/unit/planning-time-card.test.ts
  - tests/unit/roster-rendering.test.ts
  - tests/unit/slot-generation.test.ts
  - tests/unit/target-week.test.ts
  - tests/unit/zoned-clock.test.ts
findings:
  critical: 1
  warning: 6
  info: 0
  total: 7
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-09-03T06:35:42Z
**Depth:** standard
**Files Reviewed:** 42
**Status:** issues_found

## Summary

The gap plans resolved all eleven findings from the previous Phase 2 review. The fresh
adversarial pass nevertheless found one blocker and six warnings. The blocker can
supersede an in-progress round early after the chat timezone changes because cleanup uses
the mutable configuration rather than the round's timezone snapshot. The warnings cover an
unanchored live Telegram card, incomplete participant snapshot integrity, an unnecessary
authorization query on routes that do not use it, two exact-boundary/failure-observability
gaps, and a callback acknowledgement guard that records an answer before Telegram accepts
it.

`src/generated/prisma/**` was excluded as generated output; the Prisma schema and all three
Phase 2 migrations were reviewed instead. `npm run typecheck` and the unit suite passed
(24 files, 263 tests). The integration suite could not execute in this environment because
Testcontainers could not find a container runtime; all twelve integration suites failed in
`beforeAll`, before their tests ran.

## Narrative Findings (AI reviewer)

### Prior review verification

All former findings are closed in the current tree:

- Former CR-01 is covered by the bounded multi-week search in
  `src/domain/planning/target-week.ts:76-86` and the explicit no-free-week result in
  `src/domain/planning/planning-service.ts:925-934`.
- Former WR-01 releases a consumed token after every lost revision CAS through
  `src/domain/planning/planning-service.ts:705-713`, including Confirm at `1446-1449`.
- Former WR-02 strips an unanchored re-post at
  `src/telegram/planning-handlers.ts:741-756`.
- Former WR-03 carries the durable owner through confirmation at
  `src/domain/planning/planning-service.ts:1472-1477` and
  `src/telegram/planning-handlers.ts:1144-1155`.
- Former WR-04 now uses the durable roundless cooldown claim at
  `src/domain/planning/planning-service.ts:1770-1793` for the three no-card branches at
  `src/telegram/planning-handlers.ts:954-1000`.
- Former WR-05 has an expiry index in
  `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql:12-13`
  and bounded reaping at `src/domain/planning/planning-service.ts:1534-1539`.
- Former WR-06's unreachable actions and `ABANDONED` status have been removed from
  `src/shared/callback-schema.ts:90-111` and the database enum.
- Former WR-07's singular availability sentence is selected at
  `src/telegram/planning-renderers.ts:379-389`.
- Former WR-08's basic membership foreign key and lookup index exist at
  `prisma/schema.prisma:203-213` (WR-02 below identifies a stricter integrity invariant
  that this basic foreign key still does not enforce).
- Former WR-09 locks the roster before creating the confirmation snapshot at
  `src/domain/planning/planning-service.ts:1390-1408`.
- Former WR-10 routes member/nonmember denial copy separately at
  `src/telegram/callbacks.ts:405-414,502-514`.

## Critical Issues

### CR-01: Stale-round cleanup ignores the round's timezone snapshot

**Classification:** BLOCKER

**File:** `src/domain/planning/planning-service.ts:890-901,1511-1523,1694-1703`

**Issue:** Both `startOrResume` and `status` convert `now` with the current
`ChatConfiguration.timezone`, then pass that one civil date to `supersedeStaleRounds`.
The cleanup marks every draft whose `targetWeekStart` is before that computed Monday as
`SUPERSEDED`. This contradicts the durable snapshot contract documented at
`prisma/schema.prisma:153-158`.

The failure is reachable around a week boundary. A round created on Sunday in
`Pacific/Honolulu` targets the still-current Monday in that snapshot. If an administrator
then changes the chat to `Pacific/Kiritimati`, the same instant is already Monday of the
next week there. The next `/plan` or `/plan_status` evaluates the Honolulu round using the
Kiritimati calendar, marks it superseded, releases `activeWeekStart`, and starts or reports
another round even though the original round is still current in its own timezone. The
opposite timezone change can delay legitimate cleanup. This silently destroys the active
wizard and violates the settings-change isolation promised by the phase.

**Fix:** Make stale detection accept the UTC `now`, load the draft round(s) with their
snapshotted `timezone`, compute `mondayOf(civilNow(round.timezone, now))` per round, and use
a guarded update (`id`, `status: DRAFT`, and preferably `revision`) only for rounds stale in
their own calendar. Add a boundary regression that creates a round in Honolulu, changes the
live setting to Kiritimati, and proves the round survives until Monday in Honolulu.

## Warnings

### WR-01: Initial `/plan` leaves a live, unanchored card when anchor persistence fails

**Classification:** WARNING

**File:** `src/telegram/planning-handlers.ts:860-900`

**Issue:** The command posts a card containing fresh callback capabilities and then calls
`setAnchor`. If that CAS returns anything except `anchored`, the handler only logs and
returns. The durable round still has no `anchorMessageId`, but the new message remains
pressable. A tap can commit a domain transition and then fail to edit the card the member is
looking at. The equivalent re-post path correctly strips the new keyboard on an anchor race
at `src/telegram/planning-handlers.ts:741-756`; the initial-card path lacks that recovery.

**Fix:** On every non-`anchored` result, call `clearSupersededCard` for `messageId` and the
rendered `card` before returning, then leave the round resumable through a new `/plan`.
Add a handler test that forces `setAnchor` to lose its CAS and asserts `editMessageText` (or
markup removal) disables the posted keyboard.

### WR-02: A participant row can pair a round with another chat's membership and another user

**Classification:** WARNING

**File:** `prisma/schema.prisma:203-213`, `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql:18-19`, `src/domain/planning/planning-service.ts:776-786`

**Issue:** The new foreign key proves only that `membershipId` exists. It does not prove
that `PlanningParticipant.telegramUserId` equals that membership's user or that the
membership belongs to the same chat as the participant's round. PostgreSQL therefore
accepts, for example, a snapshot row for round/chat A whose `membershipId` belongs to
chat B and whose `telegramUserId` names user C. `wasPreviousParticipant` trusts the
independent `telegramUserId` column when granting the `PREVIOUS_PARTICIPANTS` policy, so a
malformed snapshot can authorize the wrong account. The integrity suite checks missing,
soft-deactivated, deleted, and indexed memberships at
`tests/integration/planning-participant-integrity.test.ts:68-233`, but never mismatched
identity or chat pairs.

**Fix:** Enforce both relationships in the database. One workable normalization is to add
`chatId` to the snapshot and create composite foreign keys from
`(roundId, chatId)` to the round and `(membershipId, chatId, telegramUserId)` to the
membership, with corresponding unique keys on the referenced models. Alternatively, remove
the redundant participant user column and derive it through the membership, while still
enforcing that round and membership share a chat. Add rejection tests for both a mismatched
user and a cross-chat membership.

### WR-03: `/plan` queries participant history even when authorization cannot use it

**Classification:** WARNING

**File:** `src/telegram/handlers.ts:587-600`, `src/domain/auth/planning-access-service.ts:27-43`, `src/domain/planning/planning-service.ts:776-786`

**Issue:** Object-literal evaluation eagerly awaits `wasPreviousParticipant` before
`canStartPlanning` runs. The policy function returns immediately for an administrator and
uses participant history only for `PREVIOUS_PARTICIPANTS`; `ANYONE_IN_CHAT` also ignores
it. A failure in the participant table/query can therefore abort `/plan` for an admin or an
ANYONE_IN_CHAT member even though that lookup has no bearing on their authorization. It
also prevents the normal unconfigured response for an administrator if that unrelated
query fails first.

**Fix:** Resolve participant history only when the actor is a current non-admin member and
the loaded policy is `PREVIOUS_PARTICIPANTS`; pass `false` in all other cases. Add route
tests with a throwing `planningParticipant.count` stub proving admin and ANYONE_IN_CHAT
requests still reach the planning handler.

### WR-04: The one-minute status cooldown stays closed at exactly one minute

**Classification:** WARNING

**File:** `src/domain/planning/planning-service.ts:1723-1735,1770-1777`

**Issue:** Both the live-round and roundless claims require the previous timestamp to be
strictly less than `now - PLANNING_STATUS_COOLDOWN_MS`. At exactly 60,000 ms it is equal,
so a request is still rejected and the window opens only one millisecond later. Existing
tests advance one second inside the window and then another full minute
(`tests/integration/planning-recovery.test.ts:544-570,790-806`), testing 61 seconds rather
than the advertised boundary.

**Fix:** Use `lte` in both compare-and-set predicates, and add cases that assert refusal at
59,999 ms and acceptance at exactly 60,000 ms for live and roundless status replies.

### WR-05: Retention sweep failures are deliberately swallowed without any observable trace

**Classification:** WARNING

**File:** `src/domain/planning/planning-service.ts:902-908,1704-1710`

**Issue:** Both planning reads catch every `reapExpiredActions` failure and discard it. It
is correct for optional housekeeping not to refuse `/plan`, but there is no logger in this
service and no failure detail in the returned result, so an invalid migration, permissions
problem, or persistent database error can disable cleanup indefinitely without an operator
ever knowing. The new failure-path test at
`tests/integration/planning-action-retention.test.ts:192-213` verifies only that round
creation continues; it does not require an operational signal.

**Fix:** Keep the best-effort behavior but make it observable: inject a scoped logger or
failure callback into `PlanningService`, or return a housekeeping warning that the handler
logs, including `chatId` and the caught error. Add assertions that both start and status log
one bounded error when deletion fails.

### WR-06: Callback acknowledgement is marked successful before delivery succeeds

**Classification:** WARNING

**File:** `src/telegram/callbacks.ts:262-272,446-474`

**Issue:** The single-shot wrapper sets `answered = true` before awaiting Telegram's
`answerCallbackQuery` request. If `deliver` rejects before Telegram accepts the request,
the `finally` block sees `answered` and suppresses its bare fallback. The error reaches the
global handler, but the client keeps showing progress until Telegram times it out. This
also invalidates the wrapper's own distinction between an acknowledged callback and a
fallback acknowledgement failure.

**Fix:** Set `answered = true` only after `await deliver(...args)` resolves. If the first
delivery rejects, let `finally` attempt the guarded bare acknowledgement and log any second
failure without masking the original error. Add a boundary test whose first
`answerCallbackQuery` call rejects and assert that the fallback is attempted exactly once.

---

_Reviewed: 2026-09-03T06:35:42Z_
_Reviewer: Codex (gsd-code-reviewer)_
_Depth: standard_
