---
phase: 01-chat-readiness
plan: 02
subsystem: Telegram authorization and PostgreSQL persistence
tags: [grammy, prisma, postgresql, testcontainers, geo-tz, telegram]
requires:
  - phase: 01-15
    provides: "Approved exact versions for every Phase 1 direct package root, including geo-tz@8.1.8"
provides:
  - "Committed PostgreSQL schema and migration for chat configuration, setup drafts, and opaque callback actions"
  - "Migration-first grammY /setup tracer with current-role authorization and actor-bound durable drafts"
  - "Exact approved dependency lockfile that excludes tz-lookup"
affects: [01-03, 01-04, setup-wizard, authorization, Dockerfile]
actuals:
  tokens: 59271
  tasks: 1
  commits: 3
tech-stack:
  added: [grammy, prisma, @prisma/client, @prisma/adapter-pg, pg, geo-tz, vitest, testcontainers, prettier, typescript]
  patterns:
    - "Protected Telegram actions acknowledge callbacks before role lookup and revalidate the current role before durable state access."
    - "Setup drafts are uniquely actor-and-chat-bound, expire after 30 minutes, and are separate from active chat configuration."
key-files:
  created:
    - package.json
    - package-lock.json
    - prisma/schema.prisma
    - prisma/migrations/20260819000000_chat_readiness_core/migration.sql
    - src/app/create-bot.ts
    - tests/integration/walking-skeleton.test.ts
  modified:
    - .prettierignore
key-decisions:
  - "Install only Plan 01-15-approved exact direct roots; geo-tz@8.1.8 is present and tz-lookup is absent."
  - "Use Prisma 7's generated client with the PostgreSQL driver adapter and a committed migration-first integration test."
  - "Callback acknowledgement is sent before the live membership lookup; a denial then sends the required private alert and deletes any identified actor draft."
patterns-established:
  - "Use opaque versioned callback tokens as database pointers, never as authorization claims."
  - "Treat missing, unsupported, or unavailable Telegram membership evidence as a fail-closed denial."
requirements-completed: [CONF-01, AUTH-02]
coverage:
  - id: D1
    description: "A migrated PostgreSQL database supports one current-administrator /setup draft per chat and actor, exact denial behavior, and ordered callback authorization."
    requirement: AUTH-02
    verification:
      - kind: integration
        ref: "tests/integration/walking-skeleton.test.ts#walking-skeleton"
        status: pass
      - kind: other
        ref: "npm run format:check && npm run test:integration -- walking-skeleton"
        status: pass
    human_judgment: false
  - id: D2
    description: "The approved production package set contains geo-tz@8.1.8, excludes rejected tz-lookup, and preserves its later Docker data-path obligation."
    requirement: CONF-01
    verification:
      - kind: other
        ref: "npm ls --depth=0 and exact-root manifest check"
        status: pass
    human_judgment: false
  - id: D3
    description: "A real Telegram group can deliver the /setup readiness prompt and immediately reject a demoted administrator."
    requirement: AUTH-02
    verification: []
    human_judgment: true
    rationale: "Telegram group membership responses and client rendering require the private test-group procedure documented in 01-USER-SETUP.md."
duration: 38 min
completed: 2026-08-20
status: complete
---

# Phase 01 Plan 02: End-to-End /setup Tracer Summary

**A migration-first grammY `/setup` path now creates an actor-bound PostgreSQL draft only after current Telegram administrator authorization, then renders the readiness prompt.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-08-20T11:37:00Z
- **Completed:** 2026-08-20T12:15:00Z
- **Tasks:** 1/1
- **Files modified:** 10

## Accomplishments

- Installed and locked all 15 exact Plan 01-15-approved direct roots, including `geo-tz@8.1.8`; rejected `tz-lookup` is absent.
- Added the initial reviewed PostgreSQL migration for active configuration, expiring setup drafts, and opaque callback actions.
- Proved administrator create/resume, non-administrator denial, unavailable-membership fail-closed behavior, and callback acknowledgement ordering against a clean PostgreSQL 18 container.

## Task Commits

1. **Task 1 infrastructure: audited dependency and migration foundation** — `abeb6d6` (chore)
2. **Task 1 RED: failing migration-first setup tracer** — `8cbd61f` (test)
3. **Task 1 GREEN: protected `/setup` walking skeleton** — `11878d7` (feat)

## Files Created/Modified

- `package.json` and `package-lock.json` — exact dependency manifest, deterministic scripts, and lockfile.
- `prisma/schema.prisma` and `prisma/migrations/20260819000000_chat_readiness_core/migration.sql` — durable ChatConfiguration, SetupDraft, and CallbackAction contracts.
- `src/app/create-bot.ts` — composition seam with `/setup` and protected opaque callback handling.
- `tests/integration/walking-skeleton.test.ts` — PostgreSQL 18 migration-first end-to-end tracer.
- `01-USER-SETUP.md` — required private-group and secret setup for live Telegram verification.

## Decisions Made

- Chose `geo-tz@8.1.8` only through the independently approved recovery record; its data directory remains a mandatory later Docker concern.
- Kept draft state separate from active configuration and made authorization an action-bound live gateway check.
- Sent a silent callback acknowledgement before any membership lookup, then send the locked private alert only if the lookup denies access.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test fixture] Returned proper grammY API response envelopes from the test transformer.**

- **Found during:** Task 1 GREEN verification
- **Issue:** The mocked transformer returned bare result values, which grammY correctly rejected as malformed Bot API responses.
- **Fix:** Returned `{ ok: true, result }` envelopes matching grammY's transformer contract.
- **Files modified:** `tests/integration/walking-skeleton.test.ts`
- **Verification:** All five migration-first tracer tests pass.

**2. [Rule 2 - Security] Failed closed when Telegram membership evidence cannot be obtained.**

- **Found during:** Task 1 GREEN verification
- **Issue:** A membership gateway failure could have escaped the handler instead of delivering the required non-mutating denial.
- **Fix:** Converted unavailable membership evidence into the same denial path that removes an identifiable actor draft.
- **Files modified:** `src/app/create-bot.ts`, `tests/integration/walking-skeleton.test.ts`
- **Verification:** The integration tracer verifies no draft is created when membership evidence is unavailable.

**Total deviations:** 2 auto-fixed (Rule 1, Rule 2).

## Issues Encountered

The first Testcontainers startup exceeded Vitest's default 10-second hook timeout while preparing PostgreSQL. The test now has an explicit 60-second lifecycle timeout and consistently passes with the disposable PostgreSQL 18 container.

## User Setup Required

See [01-USER-SETUP.md](./01-USER-SETUP.md) for the BotFather token, PostgreSQL URL, and private-group administrator setup needed for the live Telegram check.

## Next Phase Readiness

Plan 01-03 can harden strict TypeScript and shared configuration/test seams over the committed tracer. Later Docker work must retain `node_modules/geo-tz/data` or an explicitly configured equivalent.

## Self-Check: PASSED

- `abeb6d6`, `8cbd61f`, and `11878d7` exist in Git history.
- All declared runtime files and the committed migration exist.
- `npm run format:check && npm run test:integration -- walking-skeleton` passes with all five tracer tests green.

---

*Phase: 01-chat-readiness*
*Completed: 2026-08-20*
