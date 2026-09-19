---
phase: 08-localized-reminders-and-bilingual-verification
reviewed: 2026-09-19T00:22:31Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - .github/workflows/ci.yml
  - Dockerfile
  - src/app/main.ts
  - src/domain/reminders/reminder-service.ts
  - src/shared/i18n/en.ts
  - src/shared/i18n/index.ts
  - src/shared/i18n/planning-format.ts
  - src/shared/i18n/runtime-smoke.ts
  - src/shared/i18n/uk.ts
  - src/telegram/migration-handler.ts
  - src/telegram/reminder-renderers.ts
  - tests/fixtures/catalog-samples.ts
  - tests/fixtures/outbound-surfaces.ts
  - tests/helpers/outbound-evidence.ts
  - tests/helpers/reminders.ts
  - tests/integration/bilingual-workflow.test.ts
  - tests/integration/chat-language-migration.test.ts
  - tests/integration/chat-migration.test.ts
  - tests/integration/localized-lifecycle.e2e.test.ts
  - tests/integration/localized-onboarding.e2e.test.ts
  - tests/integration/localized-planning-feedback.e2e.test.ts
  - tests/integration/localized-planning.e2e.test.ts
  - tests/integration/localized-reminders.test.ts
  - tests/integration/reminder-followups.test.ts
  - tests/integration/walking-skeleton.test.ts
  - tests/unit/i18n.test.ts
  - tests/unit/localized-lifecycle-cards.test.ts
  - tests/unit/localized-planning-cards.test.ts
  - tests/unit/onboarding-feedback.test.ts
  - tests/unit/outbound-surfaces.test.ts
  - tests/unit/planning-format.test.ts
  - tests/unit/reminder-renderers.test.ts
  - tests/unit/reminder-transports.test.ts
  - tests/unit/roster-localization.test.ts
  - tests/unit/roster-projection-evidence.test.ts
  - tests/unit/runtime-smoke.test.ts
  - tests/unit/settings-localization.test.ts
  - tests/unit/setup-branch-evidence.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 8: Code Review Report

**Reviewed:** 2026-09-19T00:22:31Z
**Depth:** standard
**Files Reviewed:** 38 (25 original scope plus 13 additional correction files)
**Status:** clean — no open findings after two corrections

## Narrative Findings (AI reviewer)

### Summary

Reviewed the implementation range `7c42e66^..7cbd793`, cross-checking all five plan summaries against the original 25 source/test/build paths, then independently reviewed corrections `c4602df` and `d91f5f7`. No scoped path is ignored. Traced locale reads, reminder reservation and delivery, round-time projection, HTML mentions, migration refusal, strict catalog samples, runtime-image checks, and inventory evidence references. The test-reliability finding WR-01 is now resolved; no open correctness, security or quality defect was established in the reviewed scope.

The first correction resolves the setup/roster examples and rejects unrelated test references through case-scoped registrations. The second correction resolves the remaining transport mismatch by sharing the actual follow-up API factory between `main()` and the persisted bilingual test. Evidence remains an audited case-family contract, not automatic branch instrumentation. Historical findings and intermediate failed closure are retained below; frontmatter counts describe current open findings only.

### Final re-review of d91f5f7

Confirmed `main()` uses `createFollowupReminderTransport(bot.api)` and the en/uk metadata-await case uses that same factory with a captured API. The test checks the entire localized message, numeric chat ID, HTML mode, disabled previews, exact basic-group reply parameters, one send after duplicate dispatch, and returned message ID persisted on the occurrence. The additional unit tests cover absent reply parameters and exact Telegram rejection propagation. The inventory now points to the actual `src/app/main.ts#sent:sendMessage:1` site; its dynamic `text` position is explicitly the already-rendered payload, whose complete value is asserted by that same registered integration family.

Independently reran `tests/unit/outbound-surfaces.test.ts` and `tests/unit/reminder-transports.test.ts` with the three iteration-2 evidence reports: **17/17 passed**, including the 15-test executed-evidence gate. Read the reported 29-test affected-unit and 73-test affected-integration results and rebuilt-image smoke/import evidence without repeating their broader commands. The reused integration report explicitly excludes the changed localized-reminders suite, and current source hashes reconcile. No new full integration-suite pass or native acceptance is claimed.

**Verdict:** WR-01 closed at `d91f5f7996d3b3251a63293a70a19c1ced0743dc`; zero open findings. Only REVIEW.md was modified in this re-review; no commit was made.

### Resolved finding history

#### WR-01: WARNING (resolved) — Inventory marks unexercised branches as bilingual evidence

**Final status:** resolved at `d91f5f7`. The following first-re-review assessment and original examples are retained as historical evidence.

**First re-review status:** partially corrected at `c4602df`; one same-root transport gap remained.

**File at first re-review:** `C:/dev/gsm_bot/tests/integration/localized-reminders.test.ts:687`

**Related current locations:** `C:/dev/gsm_bot/tests/fixtures/outbound-surfaces.ts:3637-3646`, `C:/dev/gsm_bot/tests/integration/localized-reminders.test.ts:647-666`, and `C:/dev/gsm_bot/src/app/main.ts:231-237`.

**Remaining issue:** The case `sends follow-ups in current %s after metadata await, retaining round timezone` registers `src/app/main.ts#message:sendMessage:2`, the production follow-up Telegram transport. However, this case constructs `ReminderService` with `followups.send` equal to its own `vi.fn` at line 647. It never invokes the closure in `main.ts` that calls `bot.api.sendMessage` with `parse_mode: "HTML"`, disabled link previews, and forwarded reply parameters. Importing the planning transport factory from `main.ts` does not execute `main()`. The test proves the service's rendered payload and claim, but not this registered transport site. The fresh 15/15 executed-evidence gate accepts this incorrect registration. A regression removing HTML mode or basic-group reply forwarding could therefore leave this site's claimed evidence green.

**Remaining fix:** Exercise the actual production follow-up transport in both locales. For example, extract a `createFollowupReminderTransport` factory alongside the existing planning factory, wire `main()` to it, and use that same factory in this integration case with a captured Telegram API. Assert chat ID, exact text, `parse_mode`, link-preview options, reply parameters for basic groups, and message-ID propagation. Register the resulting actual source site only after those assertions, update its locator/fingerprint, and rerun the changed tests plus executed-evidence reconciliation. Alternatively retain an explicit residual until genuine transport evidence exists; do not relabel the current service stub as executing the production transport.

**Correction confirmed:** Real en/uk setup cancellation now checks the edit, draft isolation and consumed action; resolver failure/throw checks the recovery edit and unchanged state; roster invalid input/add failure, malformed targets, request/confirmation failures, list/retry and remove/keep have branch-specific bilingual cases. Settings, language, planning and pure-projection mappings received wider case-family corrections. The AST registration lookup and unrelated-case negative controls address the original reference-existence weakness. The helper/report contract is explicitly manual case-family evidence, not branch instrumentation; that caveat is accurate, but cannot justify registering a transport that the entire family never calls.

**Re-review validation:** Read all 19 correction-file diffs and the new helper/gates and behavioral additions. Confirmed `git diff c4602df^ c4602df -- src` is empty. Independently ran the inventory suite with `OUTBOUND_EVIDENCE_REPORTS=node_modules/.cache/review-unit-final.json;node_modules/.cache/review-integration-final.json`: **15 passed**, including fresh report/source-hash reconciliation. The referenced reports record 755 passing unit and 216 passing scoped integration cases; no broad suite or image rerun was performed in this re-review. Those results do not close the remaining semantic mapping gap.

##### Original finding history (2026-09-18T23:55:01Z; examples below corrected)

**File:** `C:/dev/gsm_bot/tests/fixtures/outbound-surfaces.ts:9148`

**Related locations:** `C:/dev/gsm_bot/tests/fixtures/outbound-surfaces.ts:8854`, `C:/dev/gsm_bot/tests/fixtures/outbound-surfaces.ts:7844-8018`, and `C:/dev/gsm_bot/tests/fixtures/outbound-surfaces.ts:274-285`.

**Issue:** Several reachable output branches point to a real test name that does not execute that branch. `verifyInventory(..., true)` checks only whether the referenced case string occurs somewhere in the file; it cannot substantiate these mappings. Concrete counterexamples:

- `dispatchSetupCallback:editMessageText:2` emits successful `setup.cancelled`, but cites `completes %s setup, edits settings and adds/pages/removes roster`. That test calls `configure`, which chooses `button.saveConfiguration` at `tests/integration/localized-onboarding.e2e.test.ts:172`; it never cancels setup. The new residual suite injects only duplicate/expired/stale/failed cancellation results, so those tests do not supply the missing successful-cancellation evidence either.
- `handleSetupLocation:editMessageText:1` emits `LOCATION_FAILURE`, but cites the same onboarding case. Its timezone resolver always returns `{ kind: "resolved", candidate: "Europe/Kyiv" }` at `tests/integration/localized-onboarding.e2e.test.ts:52`, making the failure branch unreachable in that case.
- Roster corrective input, failed add, and callback branches in lines 7844-8018 repeatedly cite `preserves safe add and duplicate identity in %s`. That case at `tests/unit/roster-localization.test.ts:246` only performs two successful `h.add()` calls. It does not send invalid input, fail storage, or click callbacks. The separate corrective-input, failed-add, and returned-error tests at lines 265, 283, and 356 instantiate the Ukrainian-only default harness; relinking to those names alone would still not prove both locales.

This is a false-positive coverage result, not a claim that the displayed translations are currently wrong. The focused inventory suite passed **11/11** during this review despite these mismatches. Thus zero pending diagnostics and the reported 464 mappings do not establish the required per-branch bilingual regression guarantee; regressions in the unexercised locale/branch combinations can escape the stated check.

**Fix:** Audit each inventory mapping against the exact branch its named test executes. Add or parameterize actual handler tests in both `en` and `uk` for successful setup cancellation, setup timezone resolution failure, roster invalid input/add failure, and the affected roster callback outcomes; assert the captured output, acknowledgement count where applicable, and state invariants. Point each site to its actual case, reusing existing relevant bilingual cases where available. Restore explicit residual markers for any remaining unproven sites instead of marking them covered. Strengthen the evidence contract with registered site/branch IDs emitted by those tests or branch-coverage evidence, and add a negative control for an existing but unrelated test reference. Until that is implemented, document that reference-existence validation alone is not behavioral coverage and manually validate all mappings before claiming completeness.

### Verification and limits

- Fresh focused check: `npm run test:unit -- tests/unit/outbound-surfaces.test.ts` — **11 passed**, confirming the false-positive evidence acceptance described above.
- Prior complete-run results were read from `08-AUTOMATED-EVIDENCE.md`: unit 679 passed; initial integration 679 passed / 5 failed; corrected scoped reruns 61/61 and 60/60. This review does not relabel the initial integration command as a clean full run or add overlapping rerun counts.
- Runtime smoke is executed after pruning and `USER gsmbot` in the image and independently by the CI image job. No new runtime-image execution or broad suite rerun was performed during review.
- No structural pre-pass findings were supplied. Native Telegram wording acceptance remains outside this automated review.
- Only this review artifact was created. Implementation and unrelated working-tree changes were preserved; no commit was made.

---

_Reviewer: gsd-code-reviewer_
_Depth: standard_
