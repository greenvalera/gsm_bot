---
phase: 08-localized-reminders-and-bilingual-verification
plan: "03"
subsystem: testing
tags: [reminders, postgres, localization, recovery]
requires:
  - phase: 08-02
    provides: Production localized planning and follow-up delivery
provides:
  - Bilingual durable reminder recovery and callback authority regressions
  - Scoped preference and participant-label fixture isolation
affects: [08-04, 08-05]
tech-stack:
  added: []
  patterns: [Parameterize established reliability fixtures by committed delivery locale]
key-files:
  created: []
  modified: [tests/helpers/reminders.ts, tests/integration/localized-reminders.test.ts, tests/integration/reminder-followups.test.ts]
key-decisions:
  - Existing production invariants are regression evidence, not fabricated failing feature tests.
requirements-completed: []
actuals:
  tokens: 10198
  tasks: 2
  commits: 3
duration: 7min
completed: 2026-09-19
status: complete
coverage:
  - id: planning-recovery
    description: Both language directions preserve planning occurrence identity, claims, in-flight payloads and unknown-outcome consumption.
    verification:
      - kind: integration
        ref: tests/integration/localized-reminders.test.ts
        status: pass
    human_judgment: false
  - id: callback-authority
    description: Real delivery-minted controls preserve current authorization and exactly one acknowledgement on denial, success and duplicate clicks.
    verification:
      - kind: integration
        ref: tests/integration/localized-reminders.test.ts#minted reminder control survives switch
        status: pass
    human_judgment: false
  - id: followup-reliability
    description: Both locales preserve follow-up grace, spacing, suppression, current pending snapshots and recovery semantics.
    verification:
      - kind: integration
        ref: tests/integration/reminder-followups.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/localized-reminders.test.ts
        status: pass
    human_judgment: false
---

# Phase 8 Plan 3: Bilingual Durable Delivery Verification Summary

**Real PostgreSQL tests prove language switches preserve reminder identity, recovery eligibility, current authorization, pending snapshots and consumed uncertain sends.**

## Accomplishments

- Planning sends use the newly committed locale in both directions without modifying queued identity, generation, due time or domain rounds. Competing service instances send once. Reconciliation retains live ownership, and an in-flight payload remains in its original language while the next week's occurrence uses the new language.
- Real production-transport callback capabilities remain usable after switching language. A member is denied, a subsequently authorized administrator succeeds, and a duplicate creates no additional state; each click receives exactly one acknowledgement.
- Explicit 429 rejection preserves retry eligibility and re-renders in the new language after retryAt. A subsequent unknown outcome remains consumed across service reconstruction and another language switch. Follow-up unknown attempts retain spacing; rejection restores prior spacing.
- The existing follow-up matrix now runs in English and Ukrainian, including 29/30-minute publication and spacing boundaries, blocked/unblocked suppression, ready/booked/cancelled/superseded/started states, empty/unacknowledged snapshots, oversized unsendable payloads, and competing reservations.
- Persisted recovery picks the latest eligible occurrence, coalesces earlier work, refreshes the card anchor and pending respondents, retains all mention destinations, and escapes hostile Unicode labels. Language-only changes leave queued rows and schedule generation unchanged; an actual schedule change invalidates pending old-generation work.

## Task Commits

1. Task 1 RED: `65b9fdd` — planning recovery regressions and failing scoped preference cleanup test.
2. Task 1 GREEN: `9e8ad9b` — scoped reset and real localized callback authorization coverage.
3. Task 2: `29f715a` — bilingual follow-up recovery matrix and isolated participant labels.

## Verification

- Task 1 initial run: 7 passed, 8 failed. The genuine missing behavior was resetReminders retaining the test chat's language preference; other failures were consequent unique-key collisions. Production planning reliability checks passed before helper implementation.
- Task 1 completion: `npm run test:integration -- tests/integration/localized-reminders.test.ts` — 17/17 passed; `npm run typecheck` passed after matching the existing typed botInfo harness convention.
- Task 2 initial run: 55/57 passed. Hostile-label coverage exposed fixture label persistence into subsequent existing tests. Resetting the helper's owned user label fixed the leak.
- Final task verification on the source committed as `29f715a`: `npm run test:integration -- tests/integration/localized-reminders.test.ts tests/integration/reminder-followups.test.ts` — 59/59 passed (21 localized and 38 follow-up cases); `npm run typecheck` passed.
- Scoped Prettier checks passed, and final test edits were formatted with the same installed formatter before verification.
- Tests used disposable PostgreSQL 18.4 containers and committed migrations. No live Telegram, deployment, package installation or live fixture access occurred.
- Source scan found no TODO/FIXME, skipped tests, placeholder delivery or new security-relevant production surface. Threat register T-08-03-01/02 is exercised through escaped pending mentions, stable destinations, actual callback authorization and durable claim evidence; T-08-03-03 is addressed by exact commands/revisions and explicit acceptance boundaries.

## TDD Gate Compliance

The plan is test-only despite task tdd attributes. Existing invariants already worked in plans 08-01/02, so no production failure or feat commit was fabricated. Task 1 has a real failing cleanup assertion followed by its helper fix. Task 2 was written and run before its fixture correction; production reliability passed immediately. The absence of a feat commit is intentional for this test-only plan.

## Deviations from Plan

- [Rule 1 - Bug] New hostile-label tests revealed a shared helper upsert retained the prior label. Reset firstName, lastName and username to the fixture baseline in tests/helpers/reminders.ts (`29f715a`). No production behavior changed.
- Corrected new planning fixtures to use canonical midnight civil dates, matching generated occurrence identities; asserted exactly one persisted due-time identity after reconciliation.

## Residual Acceptance

Requirements LREM-01/LREM-02/L10N-03 remain pending phase verification and later plans. Native wording and Telegram acceptance remain separate; existing waivers were not changed. No unresolved defect or unrun task verification remains.

## Metrics

Two tasks; three task commits; three source/test files. Actual tokens use ceil(realized scoped git diff characters / 4) from `65b9fdd^..29f715a`, not harness token usage.

## Self-Check: PASSED

All three modified files exist; task commits 65b9fdd, 9e8ad9b and 29f715a exist. The canonical summary is written to disk.
