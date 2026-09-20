---
phase: 08-localized-reminders-and-bilingual-verification
plan: "04"
subsystem: testing
tags: [localization, catalogs, typescript, migration, inventory]
requires:
  - phase: 08-03
    provides: Bilingual durable reminder regressions
provides:
  - Destination-locale migrated-chat refusal with unchanged authority
  - AST inventory of 477 transport, button and projection sites
  - Exact typed samples for all 222 catalog keys
affects: [08-05]
tech-stack:
  added: []
  patterns: [Native TypeScript AST parsing with virtual filesystem, independent strict catalog validation]
key-files:
  created: [tests/fixtures/outbound-surfaces.ts, tests/unit/outbound-surfaces.test.ts, tests/fixtures/catalog-samples.ts]
  modified: [src/telegram/migration-handler.ts, src/shared/i18n/index.ts, src/shared/i18n/en.ts, src/shared/i18n/uk.ts, tests/integration/chat-migration.test.ts, tests/unit/i18n.test.ts]
key-decisions:
  - TypeScript 7 native API supplies AST parsing without adding or changing dependencies.
  - Structural inventory success does not establish complete branch coverage; 48 explicit residual sites must be closed by 08-05.
requirements-completed: []
actuals:
  tokens: 106740
  tasks: 3
  commits: 9
duration: 15min
completed: 2026-09-19
status: complete
coverage:
  - id: migration-refusal
    description: Old-chat callbacks use the destination's current locale and do not forward or mutate state.
    verification:
      - kind: integration
        ref: tests/integration/chat-migration.test.ts
        status: pass
    human_judgment: false
  - id: strict-catalogs
    description: Both complete catalogs are directly sampled, with independent compile-time parameter checks.
    verification:
      - kind: unit
        ref: tests/unit/i18n.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck
        status: pass
    human_judgment: false
  - id: source-branch-coverage
    description: Every production output branch has concrete bilingual evidence; completion depends on 08-05 residual closure.
    verification:
      - kind: unit
        ref: tests/unit/outbound-surfaces.test.ts
        status: unknown
    human_judgment: false
---

# Phase 8 Plan 4: Strict Catalogs and Outbound Source Inventory Summary

**Migrated-chat recovery uses the destination language; AST checks reconcile 477 output sites and strict samples verify all 222 English/Ukrainian catalog keys.**

All three tasks have execution artifacts. The complete-surface-evidence truth is explicitly transferred to Plan 08-05: 48 source sites remain pending branch evidence or legacy-row reachability proof. This summary's completed execution status does not claim that truth or either phase requirement is complete.

## Task Commits

1. Task 1 RED `d11d2d8`; GREEN `28ad736`: persisted migration regression and catalog-backed destination-locale refusal.
2. Task 2 RED `cd80125`; GREEN `bd82f49`: AST source inventory, mutation failures, dependency tracing and explicit residual evidence.
3. Task 3 RED `1fc96cb`; GREEN `9e3e11b`: exhaustive typed samples, strict cloned-catalog failures and compile-only reminder contract checks.

Earlier checkpoint metadata: `80e4a4f`, `57ac0ac`. The user approved Task 1 before this continuation; it was verified again without repeating implementation.

## Accomplishments

- Migration uses persisted `newChatId` for presentation only. Old commands remain silent, callbacks acknowledge once, and rounds, preferences, migration ledger, tokens, memberships, settings, reminders and drafts remain unchanged after presentation.
- AST discovery recursively reads production TypeScript, scans message/edit/alert/keyboard/text-projection sites and renderer factories, and follows local/imported declaration references. Stable locators, exact expressions and dependency fingerprints detect new sinks, changed copy and helper changes. Catalog paths and concrete named test references are maintained separately from source discovery.
- Synthetic tests reject unlisted send, reply wrapper, edit wrapper, keyboard and callback alert sites, added prose in a registered renderer, changed imported helper copy, stale entries, missing catalog keys and nonexistent evidence references. There are no directory-wide translation exemptions; generated ORM files are excluded from application source discovery.
- Every catalog key has its own exact mapped payload, including `migration.upgraded: undefined`, planning week ranges and all follow-up fields. Both catalogs are invoked directly, without fallback substitution. Strict checks reject missing catalogs/keys, empty output, noncallable entries, invalid output and incompatible runtime payload access. Typecheck separately consumes deliberate unknown-key, missing-parameter and wrong-type errors.
- Existing count/duration tests retain 0, 1, 2, 5, 11, 14, 21, 22, 25, 101 and 111 in both languages plus mixed-hour forms. Existing escaping and UTF-16 budget checks remain intact.

## Verification

Verified source revision: `9e3e11b`.

- `npm run test:unit -- tests/unit/outbound-surfaces.test.ts tests/unit/i18n.test.ts tests/unit/planning-format.test.ts`: **62/62 passed**.
- `npm run test:integration -- tests/integration/chat-migration.test.ts`: **7/7 passed**, fresh disposable PostgreSQL with committed migrations.
- `npm run typecheck`: **passed**, including negative compile-only contracts.
- Scoped Prettier and `git diff --check`: **passed**.
- Task 2 RED initially failed because the new inventory module did not yet exist; after the AST implementation, the actual production reconciliation failed on all 477 unregistered sites, while synthetic failure checks passed. Task 3 RED initially failed on the missing sample module. Its earlier real defect was already observed at the tracer checkpoint: catch-all payload omitted `weekRange` and rendered `undefined`.
- No live Telegram, installation, deployment, domain/schema migration, or live fixture modification occurred.
- Stub scan found no production stubs, TODO/FIXME or skipped tests. The known evidence gap is tracked as Windows ledger entry **24**, not a hidden successful assertion.

## Deviations from Plan

1. **[Rule 3 - Blocking] Native TypeScript 7 API.** The installed `typescript` entry exports version metadata rather than the removed TS6 compiler API. Used the installed `typescript/unstable/sync`, `typescript/unstable/ast` and virtual filesystem APIs. Local declarations and the official compiler API documentation were checked. No package changes.
2. **Cross-plan completion dependency.** Existing successful onboarding tests cannot truthfully prove every setup error/expiry branch. Structural reconciliation and reference checks pass, but strict evidence validation deliberately returns 48 `pending-branch-evidence` diagnostics. The orchestrator explicitly assigned their closure to 08-05; complete L10N-02/L10N-03 coverage remains pending.

## Exact Residual Handoff to 08-05

Each ID is `<source>#<locator>`. The fixture's `residual` field is the authoritative machine-readable list. Multiple transport/text sites can refer to the same actual branch; close them using the same concrete handler test when appropriate.

| Source | Exact locators | Count | Required closure |
|---|---|---:|---|
| `src/telegram/handlers.ts` | `registerChatReadinessHandlers:reply:1` through `:8`; `replyCommandDenial:reply:1` | 9 | Exercise each readiness/authorization reply branch in en/uk and reference its actual named case. |
| `src/telegram/keyboards.ts` | `PLANNING_BOOKING_ROWS:text:1`; `PLANNING_BOOKING_CONFIRM_ROWS:text:1`, `:2`; `PLANNING_CANCEL_CONFIRM_ROWS:text:1`, `:2`; `PLANNING_CHANGE_CONFIRM_ROWS:text:1`, `:2`; `PLANNING_LIFECYCLE_ROWS:text:1`, `:2` | 9 | Prove these historical English compatibility constants are unreachable from production transports. Do not treat their prose as dynamic data or claim a bilingual test exercises them. Introduce a narrow verified non-production classification if needed. |
| `src/telegram/setup-handlers.ts` | `handleSetupCommand:reply:2`; `handleSetupLocation:reply:1`; `handleSetupText:reply:1`; `dispatchSetupCallback:reply:1` through `:5`; `dispatchSetupCallback:answerCallbackQuery:1` through `:11`; `dispatchSetupCallback:text:1` through `:11` | 30 | Parameterize actual expiry/stale/duplicate/save-failure and dispatcher-result branches in en/uk; preserve exactly one acknowledgement and mutation invariants. |

Recommended closeout: add the missing real handler/controller tests in Plan 08-05, replace candidate references with the exact named branch tests, remove resolved `residual` fields, and require `verifyInventory(productionSources(), outboundSurfaces, true)` to return `[]`. The current test explicitly accepts only the enumerated pending diagnostics to preserve honest intermediate status; replace that allowance with the strict empty result once all are closed. Recheck other candidate references for exact branch relevance during the cross-workflow audit. Resolve ledger entry 24 only after the strict test passes.

## Acceptance Boundaries

Native Telegram wording acceptance is still separate. No new waiver or native pass is claimed. The generic unclassified L10N-02 assumption remains a scanner limitation with no observable predicate, not a successful behavior or a human approval request.

## Self-Check: PASSED

All nine listed source/test artifacts exist. All six task commits and both prior checkpoint commits exist. The fresh command outcomes above match the recorded revision. The phase requirements intentionally remain unchecked pending Plan 08-05 and phase verification.
