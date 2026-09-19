---
phase: 08-localized-reminders-and-bilingual-verification
fixed_at: 2026-09-19T00:20:38Z
review_path: .planning/phases/08-localized-reminders-and-bilingual-verification/08-REVIEW.md
iteration: 2
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Source review:** `08-REVIEW.md`, WR-01.
**Summary:** 1 finding in scope, 1 fixed, 0 skipped. Independent re-review remains pending.

## Iteration 2: Actual follow-up transport

**Commit:** `d91f5f7996d3b3251a63293a70a19c1ced0743dc` — `fix(08): WR-01 exercise production follow-up transport`.
**Status:** fixed: requires human verification. The first re-review correctly retained WR-01 because the former follow-up service stub did not execute the production API wrapper; the iteration 1 claims below are historical and are superseded for this transport site.
**Files:** `src/app/main.ts`, `tests/integration/localized-reminders.test.ts`, `tests/fixtures/outbound-surfaces.ts`, new `tests/unit/reminder-transports.test.ts`.

Extracted `createFollowupReminderTransport` beside the planning factory and wired `main()` to it, preserving HTML mode, disabled previews, optional reply forwarding, return mapping and error propagation. The persisted en/uk metadata-await test now invokes that exact factory with a captured Telegram API, asserting the complete text, numeric chat ID, exact basic-group reply parameters, once-only delivery and returned message ID stored on the occurrence. Additional unit cases prove omission of reply parameters for non-reply sends and preservation of the exact Telegram rejection object used by durable classification. The old `message:sendMessage:2` registration is removed; AST discovery now identifies `sent:sendMessage:1` with refreshed fingerprints and an explicit rendered-payload contract. The adjacent planning mapping was checked and already invokes the actual planning factory.

All checks ran in the main checkout, with no new dependencies or live actions:

- Affected unit suites: **29 passed / 4 files** (`reminder-transports`, `reminder-renderers`, `outbound-surfaces`, `runtime-smoke`).
- Affected integration suites: **73 passed / 3 files**, 24.83 seconds (`localized-reminders`, `reminder-followups`, `reminder-runtime`), isolated PostgreSQL only. Fresh report: `node_modules/.cache/review-transport-integration.json`.
- Existing executed-evidence gate: **15 passed**. Inputs were the unchanged prior full-unit report, a derived prior-integration report retaining 195 unchanged cases from six suites, and the fresh 73-case report. The original 216-case report is untouched; its old localized-reminders result is excluded rather than reused against changed source.
- Typecheck, four-file formatting, `git diff --check`, runtime build and host smoke passed.
- Rebuilt `gsmbot:phase08-reviewfix2`; dependency installation layer was cached. Runtime smoke passed after pruning as `gsmbot` and again in a disposable network-disabled container. A second network-disabled container imported compiled `main.js` without starting the bot and confirmed both transport exports.

Final image ID: `sha256:82014398e1c8a2fd6aaa2e2faa3e7f887bda21cb33af0245ec46f31c30a37192`; config digest `sha256:bd608ae74fcd70925293a5c2903f7566e61c16bd0cd8e4f942d828ea77b4b173`; platform manifest `sha256:bdf368f4421117db070d14f96eeb1bb8a221f6825b9326f61177cc2272521806`. Observed Node `v24.19.0`, ICU `78.3`, UID `999`. Compiled `dist/app/main.js` SHA-256 is identical on host and in image: `7be3f5c665a868c32936415cddff40c8845cfa19d3fd7eb6cab5c7474f743d8e`. Production source tree at the fix commit is `2d57c5829b55a6b09b6012d3b85113f0a822276c`; runtime build-input Git diff is empty after the commit. The image was built from that working-tree content before commit; no Git build attestation is claimed.

No broad unchanged integration rerun or new native acceptance was performed. The report and evidence amendments remain uncommitted for the orchestrator. Unrelated working-tree changes are preserved.

## Iteration 1: Fixed Issues and Historical Verification

### WR-01: Inventory marks unexercised branches as bilingual evidence

**Status:** fixed: requires human verification (the evidence acceptance logic changed; independent re-review must confirm the audited branch contracts).
**Commit:** `c4602df` — `fix(08): WR-01 bind bilingual evidence to exercised branches`.
**Files modified:** `tests/fixtures/outbound-surfaces.ts`, new `tests/helpers/outbound-evidence.ts`; integration suites `bilingual-workflow`, `chat-migration`, `localized-lifecycle.e2e`, `localized-onboarding.e2e`, `localized-planning-feedback.e2e`, `localized-planning.e2e`, `localized-reminders`; unit suites `i18n`, `localized-lifecycle-cards`, `localized-planning-cards`, `onboarding-feedback`, `outbound-surfaces`, `planning-format`, `roster-localization`, `settings-localization`, and new `roster-projection-evidence` and `setup-branch-evidence`.

**Applied fix:** Added actual en/uk handler cases for successful setup cancellation, resolver failure/throw and ambiguous candidates, roster corrective input/add failure/request and confirmation failures, malformed targets, list/retry and successful remove/keep. Assertions cover captured text, controls, acknowledgement counts at the composed callback boundary, and durable state or mutation-service invariants. The wider mapping audit also corrected settings guard/select/keep/dashboard and text-review paths; language navigation wrappers; planning feedback success, exception and delivery-recovery paths; and pure renderer/date/duration/identity mappings. Where an existing bilingual case already exercised the site, its actual name replaces the unrelated reference.

Each of the 464 reachable inventory sites now has a literal site ID registered inside its exact test callback after behavioral assertions. The static check parses test ASTs and rejects a real but unrelated test name even when the correct registration appears elsewhere in the same file. It still rejects explicit residuals. A second gate consumes passing Vitest JSON records, rejects incomplete runs, checks the registered case family and both locales, and rejects changed test/production source hashes. The test helper emits the metadata; a case name's mere existence is no longer accepted as behavioral evidence. These are manually audited case-family contracts across all parameter rows, not automatically measured statement/branch coverage. The 13 prior narrow non-production proofs are unchanged.

## Verification

All commands ran in the **main checkout**, honoring `workflow.use_worktrees=false`. No worktree or recovery sentinel was created. All integration databases were disposable Testcontainers PostgreSQL instances. No production code, package versions, live services or live Telegram state changed.

| Check | Result |
| --- | --- |
| Modified-section re-read, worker review and `git diff --check -- tests` | Passed |
| `npm run typecheck` | Passed |
| Prettier check of all 19 modified/new TypeScript files | Passed |
| Fresh full `npm run test:unit -- --reporter=default --reporter=json --outputFile=node_modules/.cache/review-unit-final.json` | 755 passed / 45 files; 8.23 seconds |
| Fresh integration run of all seven registered integration suites, with JSON reporter | 216 passed / 7 files; 51.40 seconds |
| `OUTBOUND_EVIDENCE_REPORTS` set to the two fresh reports, then inventory unit suite | 15 passed; all 464 sites have passing en/uk registrations, current source hashes and no pending evidence |

The seven integration filters were `bilingual-workflow.test.ts`, `chat-migration.test.ts`, `localized-lifecycle.e2e.test.ts`, `localized-onboarding.e2e.test.ts`, `localized-planning-feedback.e2e.test.ts`, `localized-planning.e2e.test.ts`, and `localized-reminders.test.ts`, all under `tests/integration/`. JSON output is `node_modules/.cache/review-integration-final.json`.

Earlier focused runs passed 25 roster unit cases, 62 setup/onboarding integration cases, 78 planning-feedback integration cases, 111 settings unit cases, 49 onboarding-feedback unit cases and 2 roster projection cases. Those overlap the fresh runs and are not added to their totals.

No full integration-suite, runtime-image or native acceptance rerun was performed in this test-only fix. Original run provenance remains in `08-AUTOMATED-EVIDENCE.md`; the corrective addendum supersedes its former reference-existence coverage claim. This report and the addendum are left uncommitted for the orchestrator, as required by the fixer workflow. All 19 code/test files are committed; unrelated pre-existing working-tree changes are preserved.
