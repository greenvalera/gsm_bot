---
phase: 06-localization-foundation-and-ukrainian-onboarding
plan: "06"
subsystem: localization
tags: [postgresql, prisma, migration, concurrency, language]
requires:
  - phase: 06-02
    provides: Independent durable language service and setup navigation
provides:
  - Atomic preference transfer for incomplete and configured group identities
  - Retired-identity selection guards coordinated with migration
  - Real PostgreSQL ordering, rollback, no-op and restart evidence
affects: [06-07]
tech-stack:
  added: []
  patterns: [Sorted identity advisory locks before table locks, ledger-first preference transaction guard]
key-files:
  created:
    - tests/integration/chat-language-identity.test.ts
    - tests/unit/chat-language-service.test.ts
  modified:
    - src/domain/chat/migration-service.ts
    - src/domain/chat/language-service.ts
    - tests/integration/chat-migration.test.ts
    - tests/unit/language-selection.test.ts
key-decisions:
  - Migration acquires sorted source and destination advisory locks before existing table locks; language transactions acquire the same per-chat lock.
  - Language transactions lock the migration ledger before accessing callbacks or preferences to prevent unrelated-chat lock inversion.
  - Parameterized identity-only SQL preserves preference timestamps and explicit selection metadata during transfer.
requirements-completed: [LANG-03, LANG-04, LANG-05]
coverage:
  - id: language-identity-transfer
    description: Incomplete and configured migration preserves locale, duplicate events are no-ops, and conflicts or failures roll back.
    verification:
      - kind: integration
        ref: tests/integration/chat-language-identity.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/chat-migration.test.ts
        status: pass
    human_judgment: false
  - id: durable-selection-ordering
    description: Real PostgreSQL locks order selection against migration and prevent retired-ID recreation without modifying schedules or drafts.
    verification:
      - kind: integration
        ref: tests/integration/chat-language-identity.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/chat-language-service.test.ts
        status: pass
    human_judgment: false
actuals:
  tokens: 6376
  tasks: 2
  commits: 5
duration: 9min
completed: 2026-09-16
status: complete
---

# Phase 6 Plan 6: Language Identity Continuity Summary

**English and Ukrainian preferences now move atomically with group migration, while database guards prevent delayed language selections from recreating retired identities.**

## Accomplishments

- Added preferences to migration's table-lock order and destination-conflict checks. A completed identical migration pair still returns before those checks, preserving replay idempotency.
- Source and destination advisory locks are acquired in numeric order before table locks. Existing process-wide chat coordination remains unchanged; the database mechanism also protects independent clients.
- Preference transfer updates only chat identity using parameterized SQL, retaining locale, explicit marker, createdAt and updatedAt. No configuration is manufactured for preference-only chats.
- LanguageService checks the migration tombstone inside the locked transaction. Direct selection rejects retired identities; callback acceptance returns stale before token consumption. Exported method signatures remain compatible.
- A ledger table lock precedes callback/preference access to avoid an unrelated callback holding callback_actions while migration holds the preference table. The real PostgreSQL test observes the migration waiting on the ledger and both operations completing.
- Tests retain existing configured-chat roster/planning/callback transfer coverage, verify rollback at final ledger creation, preserve destination-owned choices, and run composed settings/setup against the migrated incomplete chat with intercepted Telegram calls.
- Reconstructed clients read the same durable locale while another group remains implicit English. Initial English records its explicit marker once; repeated English/Ukrainian selections leave timestamps unchanged. Configuration, reminder state and both draft types remain equal across locale-only writes.

## Task Commits

1. Task 1 RED: `12c33c7` — preference transfer/conflict and composed route tests.
2. Task 1 GREEN: `b900264` — atomic identity transfer and paired locks.
3. Task 2 RED: `7626e22` — tombstone and deterministic migration race tests.
4. Task 2 GREEN: `1fffff0` — guarded service transactions and lock-order regression evidence.

Summary is committed separately. No branch/worktree was created. Unrelated workspace edits were preserved.

## Verification Evidence

Runtime: Node 24.19.0; disposable PostgreSQL 18.4 with committed migrations. No configured real database was migrated and no real Telegram messages were sent.

- Task 1 RED: five failures initially, including two test-fixture enum errors. After correcting the fixture to the existing READINESS enum, the identity suite showed four expected behavioral failures: missing transfers, accepted conflict and English destination rendering. The configured migration test separately failed on its missing preference.
- Task 1 GREEN: `npm run test:integration -- tests/integration/chat-language-identity.test.ts tests/integration/chat-migration.test.ts`: **11/11 passed**.
- Task 2 RED: **2 unit failures** for absent tombstone protection and **1 database failure** proving an old-ID selection was accepted after waiting for migration.
- `npm run test:unit -- tests/unit/chat-language-service.test.ts tests/unit/language-selection.test.ts`: **21/21 passed**.
- Updated migration integration command: **15/15 passed** across both files. After adding the final unrelated-callback lock-order case, focused identity suite: **10/10 passed**. Existing migration suite remains **6/6 passed**.
- Final `npm run typecheck`: passed.
- Targeted Prettier check: passed for all six source/test files.
- No skipped tests or unrun required verification. No task commit deleted tracked files.

Lock ordering follows the transaction-lock and deadlock guidance in the [PostgreSQL 18 explicit locking documentation](https://www.postgresql.org/docs/18/explicit-locking.html).

## Deviations from Plan

- [Rule 3 - Regression fixture] Added a current-identity delegate to the existing language-selection unit fake so existing service/callback tests exercise the new guard. This sixth owned file was needed to keep the prior service suite valid.
- The existing process-wide ChatCoordinator required no changes: migration middleware already supplies both keys. Database locks provide the additional cross-client guarantee.
- A broad read-only whitespace check reported pre-existing whitespace in `.codex/config.toml` and generated `prismaNamespace.ts`; these unrelated files were left unchanged. Targeted formatting passed.

## Remaining Scope and Threat Review

No implementation stubs or new unmodeled trust surfaces were introduced. This extends existing identity, callback and PostgreSQL boundaries. Existing authorization and callback acknowledgement behavior remains covered by the language-selection regression suite. Full reminder/lifecycle translation and native-client acceptance remain with their designated plans and end-of-phase verification.

## TDD Gate Compliance

Both tasks have a failing behavioral test commit followed by their green implementation commit. Actual token cost is realized implementation/test diff characters divided by four, rounded up; it excludes unrelated edits and this summary.

## Self-Check: PASSED

All six source/test artifacts, this summary and all four task commits exist. No tracked deletions or stub patterns were found. Required targeted tests, typecheck and formatting passed. STATE, ROADMAP and global requirements remain owned by the parent orchestrator after this summary commit.
