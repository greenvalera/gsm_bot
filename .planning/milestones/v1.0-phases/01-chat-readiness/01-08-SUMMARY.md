---
phase: 01-chat-readiness
plan: 08
subsystem: settings-auth
tags: [telegram, grammy, prisma, postgresql, settings, authorization]
requires:
  - phase: 01-07
    provides: Atomically committed ChatConfiguration records with revision numbers
provides:
  - Committed `/settings` dashboard with fixed configuration sections
  - Actor-bound, revision-safe planning-access edit drafts
  - Future-facing planning-start policy evaluator that preserves administrator access
affects: [01-09, settings, planning-authorization]
actuals:
  tokens: 12522
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - Actor/chat/expiry-bound callback actions for individual settings edits
    - Expected-revision transactions for committed configuration updates
key-files:
  created:
    - prisma/migrations/20260819010000_settings_edits/migration.sql
    - src/domain/chat/settings-service.ts
    - src/domain/auth/planning-access-service.ts
    - src/telegram/settings-handlers.ts
    - tests/unit/planning-access.test.ts
  modified:
    - prisma/schema.prisma
    - src/app/create-bot.ts
    - src/domain/auth/authorization-service.ts
    - src/shared/callback-schema.ts
    - src/telegram/renderers.ts
    - src/telegram/keyboards.ts
    - src/telegram/setup-handlers.ts
    - tests/integration/chat-configuration.test.ts
key-decisions:
  - "Store one actor-bound SettingsEditDraft per chat and actor, with a closed field enum and server-side JSON replacement payload."
  - "Keep current Telegram creators and administrators authorized independently of the stored planning-access policy."
  - "Route valid settings callback actions past setup middleware before either handler acknowledges or mutates state."
patterns-established:
  - "Settings dashboards render only complete committed ChatConfiguration reads; drafts are never projected as active values."
  - "Single-setting saves validate the complete active configuration, compare expected revision, consume the action, and delete the draft in one transaction."
requirements-completed: [CONF-01, CONF-02, CONF-03, CONF-05, AUTH-01, AUTH-02]
coverage:
  - id: D1
    description: "Authorized `/settings` renders complete committed Schedule, Availability reminders, and Planning access sections in fixed order."
    requirement: CONF-01
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#renders committed settings in fixed order and changes planning access only after review"
        status: pass
    human_judgment: false
  - id: D2
    description: "Planning-access edits remain actor-bound and change committed state only after Current/New review, save, and revision checks."
    requirement: AUTH-01
    verification:
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#keeps committed settings unchanged until an actor-bound planning-access review is saved"
        status: pass
      - kind: integration
        ref: "tests/integration/chat-configuration.test.ts#rejects stale, expired, duplicate, and invalid planning-access saves without revision changes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Current administrators always pass planning-start authorization while policy values broaden non-administrator access only as configured."
    requirement: AUTH-01
    verification:
      - kind: unit
        ref: "tests/unit/planning-access.test.ts#planning access policy"
        status: pass
    human_judgment: false
duration: 14 min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 08: Committed settings and planning access Summary

**Administrators can now view complete committed chat settings and safely review, save, or discard a planning-access change with persistent revision and authorization guards.**

## Accomplishments

- Added the migrated `SettingsEditDraft` schema, opaque settings callbacks, and a `/settings` dashboard whose sections always render in the required fixed order.
- Implemented Current/New planning-access review, one-transaction save or keep-current behavior, expected-revision protection, and safe stale/expired/duplicate handling.
- Added a closed policy evaluator: administrators always pass, `PREVIOUS_PARTICIPANTS` requires prior-participant evidence, and `ANYONE_IN_CHAT` broadens only current membership.
- Reauthorized every settings callback and removed the initiating actor's settings draft on demotion.

## Verification

- `npm run format:check` — passed.
- `npm run test:unit -- planning-access` — passed (3 tests).
- `npm run build` — passed.
- `npm run test:integration -- chat-configuration` — passed (12 tests, fresh PostgreSQL 18 container with committed migrations).

## Task Commits

1. **Task 1 RED: View settings and change planning access through a committed edit migration** — `7f41f6c` (test)
2. **Task 1 GREEN: View settings and change planning access through a committed edit migration** — `2c1cdfb` (feat)

## Files Created/Modified

- `prisma/schema.prisma` and `prisma/migrations/20260819010000_settings_edits/migration.sql` — durable actor-bound edit drafts and settings callback enum value.
- `src/domain/chat/settings-service.ts` — committed projection plus review/save/keep-current transactions.
- `src/domain/auth/planning-access-service.ts` — deterministic future planning authorization evaluator.
- `src/telegram/settings-handlers.ts`, `renderers.ts`, and `keyboards.ts` — `/settings` dashboard and planning-access interaction.
- `src/domain/auth/authorization-service.ts` and `src/telegram/setup-handlers.ts` — demotion cleanup and safe middleware routing.
- `tests/unit/planning-access.test.ts` and `tests/integration/chat-configuration.test.ts` — policy, migration, dashboard, review, rejection, discard, and demotion coverage.

## Decisions Made

- Use a closed `SettingsField` enum with a server-side replacement payload so Telegram callbacks remain opaque while Plan 09 can add further field/value-pair edits without a new draft shape.
- Treat a consumed save or keep action as `Already applied.` and preserve the committed revision on every failed path.
- Require current membership before applying any non-administrator broadening policy; unknown, departed, and unsupported policy cases fail closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Let settings callbacks and commands continue past setup middleware**

- **Found during:** Task 1 bot-level integration verification.
- **Issue:** The existing generic setup text/callback middleware stopped the composer chain, so `/settings` and valid settings actions could not reach their handlers.
- **Fix:** Passed command text to downstream handlers and routed valid `SETTINGS_EDIT` actions before setup acknowledgement or authorization; invalid and setup actions retain the existing safe setup behavior.
- **Files modified:** `src/telegram/setup-handlers.ts`.
- **Verification:** The `/settings` command, begin/select/save path, and legacy demoted setup callback integration tests passed.
- **Committed in:** `2c1cdfb`.

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** The routing fix is required for the new settings slice and preserves all existing setup callback behavior.

## Issues Encountered

The initial integration test created an action with a future expiry while asserting the expired path. The test now explicitly expires that stored action before verification; the production expiry contract was unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 01-09 can reuse `SettingsEditDraft`, the complete committed projection seam, and settings callback routing to add the remaining editable settings fields without changing the migration shape.

## Self-Check: PASSED

- Confirmed the settings migration, services, handlers, and policy test exist.
- Confirmed commits `7f41f6c` and `2c1cdfb` exist in Git history.
- No placeholder, TODO, FIXME, or non-functional stub was introduced by this plan.
