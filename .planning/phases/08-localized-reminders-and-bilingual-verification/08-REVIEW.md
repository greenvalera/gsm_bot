---
phase: 08-localized-reminders-and-bilingual-verification
reviewed: 2026-09-18T23:55:01Z
depth: standard
files_reviewed: 25
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
  - tests/helpers/reminders.ts
  - tests/integration/bilingual-workflow.test.ts
  - tests/integration/chat-language-migration.test.ts
  - tests/integration/chat-migration.test.ts
  - tests/integration/localized-reminders.test.ts
  - tests/integration/reminder-followups.test.ts
  - tests/integration/walking-skeleton.test.ts
  - tests/unit/i18n.test.ts
  - tests/unit/outbound-surfaces.test.ts
  - tests/unit/planning-format.test.ts
  - tests/unit/reminder-renderers.test.ts
  - tests/unit/runtime-smoke.test.ts
findings:
  critical: 0
  warning: 1
  info: 0
  total: 1
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-09-18T23:55:01Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Narrative Findings (AI reviewer)

### Summary

Reviewed the implementation range `7c42e66^..7cbd793` and its later documentation-only continuation, cross-checking all five plan summaries against the 25 source/test/build paths. No scoped path is ignored. Traced locale reads, reminder reservation and delivery, round-time projection, HTML mentions, migration refusal, strict catalog samples, runtime-image checks, and inventory evidence references. No production correctness or security blocker was established. One test-reliability defect prevents treating the inventory's 464 evidence mappings as complete bilingual branch coverage.

### Warnings

#### WR-01: WARNING — Inventory marks unexercised branches as bilingual evidence

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
