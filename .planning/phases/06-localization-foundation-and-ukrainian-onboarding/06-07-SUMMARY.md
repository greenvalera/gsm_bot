---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "07"
subsystem: localization
tags: [telegram, i18n, postgresql, authorization, regression]
requires:
  - phase: 06-05
    provides: Localized onboarding and roster projections
  - phase: 06-06
    provides: Durable independent language preferences and identity guards
provides:
  - Response-time localized command and callback boundary feedback
  - Typed language recovery with current-locale failure responses
  - Composed bilingual onboarding and domain-state preservation proof
affects: [07, 08]
tech-stack:
  added: []
  patterns: [Typed callback feedback keys with legacy string compatibility, actual-update chat locale resolution]
key-files:
  created:
    - tests/unit/onboarding-feedback.test.ts
    - tests/integration/localized-onboarding.e2e.test.ts
  modified:
    - src/telegram/callbacks.ts
    - src/telegram/handlers.ts
    - src/telegram/language-handlers.ts
    - src/shared/i18n/index.ts
    - src/shared/i18n/en.ts
    - src/shared/i18n/uk.ts
    - tests/unit/i18n.test.ts
    - tests/unit/callback-authority.test.ts
    - tests/unit/update-route-ownership.test.ts
    - tests/fakes/chat-readiness.ts
key-decisions:
  - Callback routes accept typed catalog keys while unchanged planning routes retain literal strings.
  - Feedback locale comes from actual Telegram update chat identity, never the stored untrusted target chat.
  - Failure messages resolve locale after the attempted operation, matching other response-time projections.
requirements-completed: [LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, TEXT-01, L10N-01]
coverage:
  - id: onboarding-boundaries
    description: Current-locale command and callback denials retain fresh authority, draft cleanup and exactly one acknowledgement.
    verification:
      - kind: unit
        ref: tests/unit/onboarding-feedback.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/callback-authority.test.ts
        status: pass
    human_judgment: false
  - id: composed-bilingual-state
    description: Both languages complete onboarding while switching preserves drafts, planning answers and reminder timing.
    verification:
      - kind: integration
        ref: tests/integration/localized-onboarding.e2e.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/i18n.test.ts
        status: pass
    human_judgment: false
  - id: native-copy-quality
    description: Ukrainian wording and control legibility in native Telegram.
    verification: []
    human_judgment: true
    rationale: Intercepted transport proves payload behavior but cannot establish native-client visual quality or human wording judgment.
actuals:
  tokens: 9575
  tasks: 2
  commits: 7
duration: 13min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 7: Localized Boundary Feedback and Composed Proof Summary

**Onboarding boundaries now reply in the current group language, with real PostgreSQL flows proving bilingual setup and state-preserving language switches.**

## Accomplishments

- Typed callback feedback supports localized onboarding routes and unchanged planning-route strings. Stale and denial feedback resolves the actual update chat, including foreign-target probes. Existing fresh authorization, actor/chat/expiry checks, draft cleanup and outcome-owned exactly-once acknowledgement remain intact.
- Setup/settings/roster command and active-prompt denials resolve current language, including the focused roster registration. Unknown tokens receive localized recovery without trusting token-provided identity.
- Added callback denial and language stale/failure catalog entries. Language save failure now reads locale after the failed attempt; recognized language choice labels also use the catalog.
- Four composed database scenarios complete English/Ukrainian setup, edit settings, add/page/remove roster, preserve old prompts and open confirmations, reconstruct bot services, isolate groups/client languages, exercise two independent administrators, and reject stale/expired/consumed/foreign/unauthorized language controls.
- Snapshots compare full configuration/revision and reminder state, setup/settings draft identities and values, roster IDs, planning ownership/participant answers and reminder occurrence due times immediately around language-only changes. Repeated current-language selection preserves preference timestamps and sends one bare acknowledgement.
- Audited Phase 6 renderer/helper/keyboard calls: all applicable production callers pass explicit locale. setupKeyboard receives already-localized rows and has no locale argument. Compatibility defaults remain available to untouched callers. Pure background settings and keyboard projections are tested in both locales.

## Task Commits

1. `3f7e040` — Task 1 RED: onboarding boundary behavior.
2. `49dc1da` — scoped typed callback denial catalog prerequisite.
3. `1659834` — Task 1 GREEN: actual-chat response-time boundary feedback and fake seams.
4. `4f89fdc` — Task 2 audit follow-up RED: response-time language failure locale.
5. `0074382` — audit follow-up GREEN: current-locale typed language recovery.
6. `418a942` — composed bilingual flow and pure projection regression proof.

Summary and validation evidence are committed separately. No branch/worktree was created. Existing dirty files were inspected and preserved; modified fake files had no substantive pre-existing diff. No tracked deletions occurred.

## Verification Evidence

Implementation revision: `418a942`. Runtime: Node 24.19.0, disposable PostgreSQL 18.4 with committed migrations. No configured real database or live Telegram transport was used.

- Task 1 behavioral RED confirmed English-only Ukrainian boundary responses. A missing migration fixture delegate and an incorrect consumed/malformed expectation were corrected before accepting the evidence; malformed targets retain their existing stale semantics.
- Task 1 targeted command: onboarding-feedback, callback-authority, language-selection — **53/53 passed**.
- Task 2 audit RED reproduced an English failure after locale changed to Ukrainian during the attempted write; the new response-time behavior passed.
- `npm run test:unit`: **546/546 passed**, 36 files.
- `npm run test:integration -- tests/integration/localized-onboarding.e2e.test.ts tests/integration/localization-tracer.test.ts tests/integration/chat-language-identity.test.ts tests/integration/chat-migration.test.ts tests/integration/reminder-settings.test.ts tests/integration/chat-readiness.e2e.test.ts`: **42/42 passed**, six files, 36.14 seconds.
- `npm run typecheck`, `npm run build:runtime`, `npm run format:check`: passed. Repository-wide formatting reported all matched files compliant; unrelated files were not formatted.
- No skipped tests or unrun automated verification. Earlier schema fresh/upgrade/repeat evidence remains in plan 01; identity concurrency evidence remains in plan 06.

## Deviations from Plan

- [Rule 2 - Missing critical localization] Added callback.denied through a three-file catalog follow-up to preserve distinct existing English command/callback copy.
- [Rule 3 - Fixture compatibility] Updated update-route-ownership.test.ts with an absent-preference delegate so its prior setup/settings recovery tests exercise the required locale lookup. This was a scoped sixth file beyond Task 1's nominal five-path budget.
- [Rule 1 - Bug] The Phase 6 call-site audit found language-handlers failure copy tied to a pre-write locale and recovery strings outside the catalog. Added a failing behavioral test, then corrected language-handlers and the shared catalog in a scoped follow-up. This closes the required response-time boundary rather than importing later-phase behavior.
- Composed tests are additive verification of the already-implemented features. Initial fixture corrections (existing roster button labels and participant schema) are not claimed as behavioral RED evidence; the task's behavioral RED/GREEN is the concrete failure-locale regression above.

## Remaining Scope and Threat Review

Native-client Ukrainian naturalness and button legibility remain pending. Historical accepted waivers are unchanged. Full planning/lifecycle translation and actual reminder delivery localization remain Phase 7/8 scope. Independent review/security and final phase verification remain with the orchestrator.

No known production stubs or additional unmodeled trust surfaces were introduced. Actual-chat locale lookup, unchanged authorization effects, denied-write tests and domain snapshots address the plan's scoped spoofing/tampering threats; this is not a substitute for independent security review.

## TDD Gate Compliance

Both behavior-changing slices have failing test commits followed by green implementation commits. Existing-feature composed tests add evidence without manufacturing a production defect. Actual tokens are the ceiling of realized source/test diff characters divided by four, excluding unrelated workspace changes and documentation.

## Self-Check: PASSED

All 12 modified source/test files and all six task commits were verified on disk/in history. Required automated checks passed, no task commit deleted tracked files, and no stub or skipped-test defect was found. STATE, ROADMAP, config and global requirements remain owned by the parent orchestrator after the summary commit.
