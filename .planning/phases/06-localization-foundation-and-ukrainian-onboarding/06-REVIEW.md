---
phase: 06-localization-foundation-and-ukrainian-onboarding
reviewed: 2026-09-16T21:49:29Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - prisma/migrate-deploy.mjs
  - prisma/migrations/20260916180000_chat_language_preferences/migration.sql
  - prisma/schema.prisma
  - src/domain/chat/language-service.ts
  - src/domain/chat/migration-service.ts
  - src/shared/callback-schema.ts
  - src/shared/i18n/en.ts
  - src/shared/i18n/index.ts
  - src/shared/i18n/uk.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/language-handlers.ts
  - src/telegram/presentation-locale.ts
  - src/telegram/renderers.ts
  - src/telegram/roster-handlers.ts
  - src/telegram/roster-renderers.ts
  - src/telegram/settings-handlers.ts
  - src/telegram/setup-handlers.ts
  - tests/fakes/chat-readiness.ts
  - tests/integration/chat-language-identity.test.ts
  - tests/integration/chat-language-migration.test.ts
  - tests/integration/chat-migration.test.ts
  - tests/integration/chat-readiness.e2e.test.ts
  - tests/integration/localization-tracer.test.ts
  - tests/integration/localized-onboarding.e2e.test.ts
  - tests/integration/migration-preflight.test.ts
  - tests/unit/callback-authority.test.ts
  - tests/unit/chat-language-service.test.ts
  - tests/unit/i18n.test.ts
  - tests/unit/language-navigation.test.ts
  - tests/unit/language-selection.test.ts
  - tests/unit/onboarding-feedback.test.ts
  - tests/unit/roster-localization.test.ts
  - tests/unit/roster-rendering.test.ts
  - tests/unit/settings-localization.test.ts
  - tests/unit/timezone-prompt-copy.test.ts
  - tests/unit/update-path-logging.test.ts
  - tests/unit/update-route-ownership.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
reviewed_revision: 418a942
followup_revision: e6f02f0
---

# Phase 6: Code Review Report

## Narrative Findings (AI reviewer)

**Current verdict:** No open findings. Targeted independent follow-up confirmed WR-01 is resolved by `e5c97d6` together with `e6f02f0`. The original review and correction history below are retained as historical evidence; the frontmatter totals count only open findings. This continuation reviewed the two corrections and their call paths, rather than repeating the entire original phase review.

Reviewed the Phase 6 production, schema and test changes against `fe20140..418a942`, with surrounding authorization, draft, migration and deployment context. Pre-existing unrelated working-tree changes were preserved. The generated-client correction in `b2b5701` was checked separately. No structural pre-pass was supplied.

### WR-01: Database failure also disables the newly localized recovery feedback

**Classification:** WARNING — resolved by `e5c97d6` and `e6f02f0`; independently confirmed below.

**File:** `C:/dev/gsm_bot/src/telegram/language-handlers.ts:91-96`  
**Related files:** `C:/dev/gsm_bot/src/telegram/settings-handlers.ts:439-445`; `C:/dev/gsm_bot/src/telegram/roster-handlers.ts:239-266`; presentation helpers in setup/settings/roster and the callback boundary.

**Issue:** Recovery copy now depends on another successful query to the same database that just failed. In the language dispatcher, an exception from `accept` becomes `kind: "failed"`, but the unconditional `service.resolve` throws before the failure alert can be sent. The callback boundary consequently sends only its bare acknowledgement, leaving the user without a failure or retry explanation. Settings similarly reads the preference before handling `getCommitted().kind === "failed"`. Roster's initial loading projection performs its preference read outside its recovery block, and its terminal failure projection repeats that read even when persistence is unavailable. These paths previously had database-independent static error text.

**Evidence:** An isolated invocation of the compiled language dispatcher, with both `$transaction` and `chatLanguagePreference.findUnique` rejecting with `database offline`, produced `{"thrown":"database offline","feedback":[]}`. No Telegram network call was made. Current failure tests simulate a failed mutation while leaving preference reads healthy, so they do not cover this case.

**Fix:** Make presentation-only locale resolution resilient to lookup failure: retain the last successfully resolved request-local locale when possible, otherwise use English; log the lookup failure. Continue attempting a fresh lookup at response boundaries so successful concurrent language changes remain visible. Do not weaken persistence, authorization or action validity, and do not turn a failed mutation into success. Cover unavailable preference reads in language failure alerts, failed settings loads and roster failure output, including the single acknowledgement boundary.

## Resolved during review

### CR-01: Generated Prisma client omitted from the schema change

**Classification:** BLOCKER — resolved by `b2b5701`.

At `418a942`, `prisma/schema.prisma:79-88` defined `ChatLanguagePreference`, but the committed generated client lacked its delegate and model. The implementation's passing local checks used modified/untracked generated files. In addition to fresh-checkout type errors, Docker generates the client before `COPY src ./src`, which then overwrites generated files with the stale committed client.

The orchestrator committed the generated outputs in `b2b5701`. The commit contains the new model and updated client/namespace exports. The orchestrator reports regeneration produces no diff and typecheck/runtime build pass. This resolved finding is excluded from the open frontmatter totals.

## Evidence and limits

- Traced administrator/actor/chat/expiry/consumption checks, language callback dispatch, pre-configuration setup/settings navigation, retained drafts, current-locale rendering, migration lock ordering and HTML escaping.
- Inspected Phase 6 test changes for authority, identity transfer, no-op preference writes, old-language confirmations and composed onboarding.
- Prior execution evidence supplied by the orchestrator: 546 unit tests, 42 integration tests, typecheck, runtime build and formatting passed. These suites were not rerun by this reviewer.
- The isolated failing-storage probe above was run specifically to substantiate WR-01.
- No source files were modified, no commit was made, and no live Telegram messages were sent.
- Native-client Ukrainian wording/legibility remains a human verification matter. Deferred Phase 7/8 translation surfaces and pre-existing unrelated changes are outside this review.

_Reviewer: gsd-code-reviewer_


## Orchestrator correction follow-up — historical pending confirmation

WR-01 was repaired by e5c97d6 (presentation-only fallback with current/last-known/English precedence; 551 full unit tests passed). The reviewer confirmed the original outage paths were fixed and identified a narrow post-success fallback issue: a committed Ukrainian selection could still announce English if its final read failed. The orchestrator reproduced it in a focused regression, then fixed it in e6f02f0 using the accepted result locale as fallback for changed/unchanged results. Targeted tests 47/47, final full unit 552/552, typecheck, runtime build and touched-file formatting pass.

The final reviewer continuation was terminated by the Codex usage limit before it updated its verdict. The historical warning and issues_found status are retained for an independent targeted confirmation; they do not assert the original reproduction still fails in current source. Re-review e6f02f0 against WR-01, then mark resolved if confirmed. No other open findings were reported.

## Independent targeted confirmation — 2026-09-16T21:49:29Z

**Verdict:** WR-01 resolved; no new BLOCKER or WARNING findings in the corrections. The historical pending status above is superseded by this confirmation.

- Inspected both correction commits and the current source at checkout `d665c1e`. The affected Telegram source and `tests/unit/onboarding-feedback.test.ts` have no diff against `e6f02f0`.
- `src/telegram/presentation-locale.ts:7-22` catches presentation lookup errors and returns the supplied last-known locale, defaulting to English. It still attempts a fresh read first and logs through the supplied logger. It does not authorize an action or accept a failed mutation.
- `src/telegram/language-handlers.ts:77-110` retains the pre-action locale for failed/stale outcomes and uses the accepted transaction result locale for changed/unchanged outcomes. Therefore a failed post-write lookup cannot replace a committed Ukrainian selection with the earlier English locale. The durable transaction and callback validity checks remain in `LanguageService.accept`.
- `src/telegram/settings-handlers.ts:444-453` renders the failed committed-settings result even when preference reads also fail. `SettingsService.getCommitted` maps storage errors to that failed result. `src/telegram/roster-handlers.ts:210-345` preserves the loading locale through failure rendering and omits the retry keyboard if the retry action cannot be persisted.
- Traced setup recovery messages, command denials, callback feedback resolution and the existing single-answer guard. The fallback is confined to presentation; authorization, token binding, expiry and consumption checks remain in place.
- Independently ran `npm.cmd run test:unit -- tests/unit/onboarding-feedback.test.ts tests/unit/language-selection.test.ts tests/unit/language-navigation.test.ts tests/unit/callback-authority.test.ts tests/unit/roster-localization.test.ts tests/unit/settings-localization.test.ts`: **6 test files, 161 tests passed**. This includes failed mutation plus unavailable preference reads, English/last-known Ukrainian recovery, roster failure without an unsafe retry action, the committed-Ukrainian post-write regression, fresh locale reads, and callback authority/single-acknowledgement assertions.
- No integration suite, full unit suite, build or native Telegram UAT was rerun for this targeted continuation. Earlier aggregate results remain attributed to the orchestrator. Only this review artifact was changed; no source edits or commits were made.
- Fresh aggregate evidence supplied by the orchestrator at `d665c1e`: **552/552 unit tests**, **42/42 tests in the six-file PostgreSQL phase regression** (34.00 seconds), typecheck, runtime build and full repository formatting passed. These aggregate checks were run by the orchestrator, not this reviewer; native Telegram UAT remains outstanding.
