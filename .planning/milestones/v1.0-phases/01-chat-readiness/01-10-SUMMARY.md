---
phase: 01-chat-readiness
plan: 10
subsystem: roster
tags: [telegram, prisma, postgresql, authorization, roster]
requires:
  - phase: 01-09
    provides: Current-administrator authorization and a migrated Prisma application baseline
provides:
  - Reply-anchored durable Telegram identities and soft-active chat memberships
  - Authorized `/roster_add` and `/roster` command adapters with safe identity projection
  - Clean PostgreSQL migration-status and uniqueness verification
affects: [chat-readiness, roster-removal, rehearsal-participants, authorization]
actuals:
  tokens: 6607
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - Reply-anchored identity conversion at the Telegram boundary
    - Transactional identity upsert plus idempotent/reactivated membership upsert
    - Safe roster labels that keep full Telegram IDs server-side
key-files:
  created:
    - prisma/migrations/20260819020000_roster/migration.sql
    - src/domain/roster/roster-service.ts
    - src/telegram/roster-handlers.ts
    - tests/unit/roster-add.test.ts
    - tests/integration/roster-repository.test.ts
  modified:
    - prisma/schema.prisma
    - src/app/create-bot.ts
    - tests/helpers/postgres.ts
key-decisions:
  - "Store Telegram identities under bigint keys and keep one unique, soft-active membership per chat/user pair."
  - "Accept roster additions only from `reply_to_message.from`; typed names and usernames are never authority."
  - "Render names and usernames when available, otherwise only the final four Telegram ID digits."
patterns-established:
  - "Protected roster commands revalidate the current Telegram administrator role before every read or write."
  - "Clean Testcontainers databases run both `prisma migrate deploy` and `prisma migrate status`."
requirements-completed: [ROST-01, ROST-03, AUTH-02]
coverage:
  - id: D1
    description: Reply-anchored, idempotent roster addition with safe confirmation copy
    requirement: ROST-01
    verification:
      - kind: unit
        ref: tests/unit/roster-add.test.ts#roster add and safe rendering
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#adds only a replied non-bot user and renders the exact add confirmation
        status: pass
    human_judgment: false
  - id: D2
    description: Active-only safe roster projection and durable one-membership database constraint
    requirement: ROST-03
    verification:
      - kind: unit
        ref: tests/unit/roster-add.test.ts#renders an exact empty state and never exposes a full numeric ID
        status: pass
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#enforces one chat membership per Telegram user and lists active identities only
        status: pass
    human_judgment: false
  - id: D3
    description: Fresh administrator authorization before roster access, including draft deletion after demotion
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: tests/integration/roster-repository.test.ts#revalidates the current administrator before roster reads and deletes their draft on demotion
        status: pass
    human_judgment: false
duration: 5 min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 10: Persistent Roster Add and View Summary

**A migrated, reply-anchored Telegram roster with transactional active/reactivated memberships and privacy-safe `/roster` rendering.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-20T10:44:00Z
- **Completed:** 2026-08-20T10:49:03Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments

- Added `TelegramUser` and `ChatMembership` Prisma models with bigint identity keys, one membership per chat/user, and soft-active timestamps.
- Registered current-administrator-only `/roster_add` and `/roster` handlers; additions only use the replied message's non-bot `from` user.
- Added idempotent/re-activation behavior and safe identity rendering that never outputs a complete numeric Telegram ID.
- Verified a clean PostgreSQL 18 migration history, migration status, and unique membership constraint using Testcontainers.

## Task Commits

1. **Task 1: Add and view persistent roster members through the committed roster migration (RED)** - `1387d20` (`test`)
2. **Task 1: Add and view persistent roster members through the committed roster migration (GREEN)** - `61cfbf9` (`feat`)

## Files Created/Modified

- `prisma/schema.prisma` — Durable Telegram identity and chat-membership relations.
- `prisma/migrations/20260819020000_roster/migration.sql` — Reviewed PostgreSQL roster migration.
- `src/domain/roster/roster-service.ts` — Transactional add/reactivate/list roster service.
- `src/telegram/roster-handlers.ts` — Reply-anchored, authorized Telegram command adapters and safe renderer.
- `src/app/create-bot.ts` — Registers the roster capability in the composition root.
- `tests/unit/roster-add.test.ts` and `tests/integration/roster-repository.test.ts` — Behavioral, privacy, authorization, migration, and constraint coverage.

## Decisions Made

- Store the durable Telegram user independently from chat membership so reactivation preserves identity history.
- Treat the Telegram reply's `from` object as the sole membership authority; anonymous/channel origins, absent replies, and bots are rejected before writes.
- Escape readable labels and fall back to only the final four ID digits, preventing full numeric-ID disclosure in roster output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical verification] Added a clean migration-status check to the shared PostgreSQL test helper.**
- **Found during:** Task 1
- **Issue:** Migration deployment alone did not prove that the clean database had no pending migrations.
- **Fix:** Run `prisma migrate status` immediately after `prisma migrate deploy` for each disposable integration database.
- **Files modified:** `tests/helpers/postgres.ts`
- **Verification:** `npm run test:integration -- roster-repository` passed against PostgreSQL 18.
- **Committed in:** `61cfbf9`

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required for the plan's clean-schema acceptance criterion; no scope expansion.

## Issues Encountered

- The sandbox cannot access Docker's container runtime. The identical Testcontainers verification passed after Docker access was granted.
- Prisma client generation requires a syntactically valid `DATABASE_URL`; generation succeeded with the project's documented build-only URL and made no connection.

## Next Phase Readiness

- Plan 01-11 can add the separate, initiator-bound removal confirmation flow atop the durable membership model.
- Full Telegram IDs remain restricted to storage and service objects; future callback actions must continue to use opaque membership-bound tokens.

## Self-Check: PASSED

- Confirmed the migration, service, handler, and roster test files exist.
- Confirmed task commits `1387d20` and `61cfbf9` exist.

---
*Phase: 01-chat-readiness*
*Completed: 2026-08-20*
