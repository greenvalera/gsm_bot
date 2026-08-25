---
phase: 01-chat-readiness
plan: 05
subsystem: telegram-setup
tags: [grammy, prisma, geo-tz, authorization, timezone]
requires:
  - 01-04
provides:
  - actor-bound, authorization-checked timezone setup actions
  - package-neutral geo-tz IANA candidate resolver
  - opaque server-side timezone candidate bindings
affects:
  - 01-06
  - 01-07
tech-stack:
  added: []
  patterns:
    - fresh Telegram administrator lookup at every protected setup boundary
    - lazy 30-minute durable draft expiry
    - explicit IANA candidate confirmation through opaque callback tokens
key-files:
  created:
    - src/domain/auth/authorization-service.ts
    - src/domain/chat/setup-service.ts
    - src/infrastructure/time/timezone-resolver.ts
    - src/shared/callback-schema.ts
    - src/telegram/setup-handlers.ts
    - tests/unit/setup.test.ts
  modified:
    - src/app/create-bot.ts
decisions:
  - Retain geo-tz behind TimezoneResolver and preserve all returned valid IANA candidates.
  - Store candidate authority server-side in the existing CallbackAction.targetId field; no Prisma migration is needed.
metrics:
  duration: 10m 11s
  completed: 2026-08-20
  tasks: 1
  files: 7
status: complete
actuals:
  tokens: 5993
  tasks: 1
  commits: 3

# Coverage block authored retroactively in plan 01-20 (finding N-5). This summary
# previously carried no `coverage:` key, so classify-coverage silently returned
# mode `legacy` and fell through to prose extraction — its deliverables were never
# deterministically classified. Each entry below is derived from this summary's own
# Accomplishments and key-files, and cites only verifications that exist today.
coverage:
  - id: D1
    description: "Fail-closed current-role authorization deletes a demoted actor's draft BEFORE returning the channel-specific denial"
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#deletes a demoted actor's drafts before denying access"
        status: pass
    human_judgment: false
  - id: D2
    description: "A durable setup draft is bound to one actor and chat and expires lazily after 30 minutes of inactivity"
    requirement: CONF-01
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#starts only the current administrator's actor-bound draft and expires it after 30 minutes"
        status: pass
    human_judgment: false
  - id: D3
    description: "GeoTzTimezoneResolver validates and de-duplicates every IANA candidate geo-tz returns and never selects one automatically, yielding resolved, ambiguous, or a bounded failure"
    requirement: CONF-01
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#returns no candidate for invalid coordinates and preserves every valid geo-tz candidate without selecting one"
        status: pass
    human_judgment: false
  - id: D4
    description: "Timezone authority lives only in the server-side binding, never in the opaque versioned callback token, and only the administrator's explicitly selected candidate is written to the draft"
    requirement: AUTH-02
    verification:
      - kind: unit
        ref: "tests/unit/setup.test.ts#contains timezone authority only in a server-side target, never in its opaque callback token"
        status: pass
      - kind: unit
        ref: "tests/unit/setup.test.ts#writes only the administrator's selected candidate to the existing draft field"
        status: pass
    human_judgment: false
  - id: D5
    description: "The timezone candidate surface renders the in-flight lookup state, one Use <IANA zone> action per candidate, a neutral send-another-location action, and the UI-contract failure, expiry and denial copy"
    requirement: CONF-01
    verification:
      - kind: integration
        ref: "tests/integration/chat-readiness.e2e.test.ts#completes setup, survives a restart, edits settings, and manages the roster"
        status: pass
    human_judgment: true
    rationale: "Only the Use <IANA zone> button is actually asserted — the e2e workflow selects it by label to advance the wizard. The rest of this deliverable's copy has no automated assertion anywhere in the suite: a grep for `Send another location` across tests/ returns no match, and neither the in-flight lookup state nor the location-resolution failure copy is exercised. Rather than cite a reference that does not prove the claim, this stays a human checkpoint; the live-verification runbook's timezone steps are where it is actually confirmed."
---

# Phase 01 Plan 05: Location-confirmed timezone setup with resumable authorization Summary

**Authorized Telegram setup now resolves geo-tz IANA candidates, binds each selection to the administrator's durable draft, and waits for explicit confirmation before persisting a draft-only timezone.**

## Accomplishments

- Extracted fail-closed current-role authorization that deletes a demoted actor's draft before returning the channel-specific denial.
- Added a durable setup service with actor/chat ownership and lazy 30-minute inactivity expiry.
- Added `GeoTzTimezoneResolver`, importing `geo-tz/dist/find-now`, validating and de-duplicating all IANA output, and returning resolved, ambiguous, or bounded failure results.
- Added opaque versioned callbacks that bind each candidate to the chat, actor, draft, expiry, and selected IANA value server-side; no raw coordinates or candidate lists are persisted.
- Rendered the in-flight lookup state, one `Use <IANA zone>` action per candidate, a neutral send-another-location action, and the UI-contract failure/expiry/denial copy.

## Verification

- `npm run format:check` — passed.
- `npm run test:unit` — passed (2 files, 9 tests).
- `npm run build` — passed.
- `prisma validate` with a local non-secret PostgreSQL URL — passed.
- `npm run test:integration` could not start because this environment has no working container runtime; the plan's required focused unit verification passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed an unnecessary Prisma enum migration before completion**
- **Found during:** Task 1 verification.
- **Issue:** The initial implementation added enum values solely to distinguish timezone callback variants, contradicting the plan's schema-neutral constraint.
- **Fix:** Reused the existing initial draft and callback action kinds; the existing server-side `targetId` stores the draft/candidate binding while tokens remain opaque.
- **Files modified:** `prisma/schema.prisma`, `src/domain/chat/setup-service.ts`, `src/telegram/setup-handlers.ts`, `tests/unit/setup.test.ts`.
- **Commit:** `d64ca49`.

## Decisions Made

- `geo-tz@8.1.8` remains isolated behind the package-neutral `TimezoneResolver` and uses `geo-tz/dist/find-now`.
- A single resolver result is still an explicit administrator choice; ambiguous results render every valid candidate without a first-result shortcut.
- No Prisma migration or new persistent field is required for timezone candidates.

## Self-Check: PASSED

- Confirmed all listed source and test files exist.
- Confirmed commits `e75d463`, `f3c6b8e`, and `d64ca49` exist in Git history.
- No placeholder or TODO stubs were found in the plan's created or modified implementation files.
