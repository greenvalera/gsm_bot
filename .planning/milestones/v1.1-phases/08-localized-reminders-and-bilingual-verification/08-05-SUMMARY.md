---
phase: 08-localized-reminders-and-bilingual-verification
plan: "05"
subsystem: testing
tags: [localization, docker, intl, bilingual, regression]
requires:
  - phase: 08-04
    provides: Strict catalogs and explicit 48-site residual evidence handoff
provides:
  - Final non-root runtime catalog and Ukrainian Intl smoke
  - Zero-pending inventory with real bilingual branch evidence and narrow reachability proofs
  - Revision-bound complete regression evidence with scoped correction provenance
  - Native reminder acceptance runbook preserving historical waivers
affects: [phase-08-verification, native-acceptance]
tech-stack:
  added: []
  patterns: [Non-root compiled runtime smoke, explicit pre-migration fixture mode, fail-closed reachability proofs]
key-files:
  created: [src/shared/i18n/runtime-smoke.ts, tests/unit/runtime-smoke.test.ts, tests/integration/bilingual-workflow.test.ts, .planning/phases/08-localized-reminders-and-bilingual-verification/08-AUTOMATED-EVIDENCE.md, .planning/phases/08-localized-reminders-and-bilingual-verification/08-ACCEPTANCE-RUNBOOK.md]
  modified: [Dockerfile, .github/workflows/ci.yml, tests/fixtures/outbound-surfaces.ts, tests/unit/outbound-surfaces.test.ts, tests/helpers/reminders.ts, tests/integration/chat-language-migration.test.ts, tests/integration/walking-skeleton.test.ts, .planning/WINDOWS.md]
key-decisions:
  - Thirteen unreachable output sites use narrow source/caller proofs and are not counted as bilingual runtime evidence.
  - Original full-suite failures remain recorded; scoped passing correction reruns establish final aggregate coverage without rewriting provenance.
requirements-completed: []
actuals:
  tokens: 25430
  tasks: 3
  commits: 11
duration: 22min
completed: 2026-09-19
status: complete
coverage:
  - id: runtime-catalogs-intl
    description: Both compiled catalogs and Ukrainian dates, h23 time and plural categories work as gsmbot in the pruned image.
    verification:
      - kind: other
        ref: 08-AUTOMATED-EVIDENCE.md#final-runtime-proof
        status: pass
    human_judgment: false
  - id: strict-outbound-inventory
    description: All 477 output sites reconcile with no pending entries; 464 evidence mappings and 13 explicit non-production proofs.
    verification:
      - kind: unit
        ref: tests/unit/outbound-surfaces.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/bilingual-workflow.test.ts
        status: pass
    human_judgment: false
  - id: bilingual-regression
    description: Complete workflow regression coverage includes persisted migration refusal and scoped corrections to all full-suite failures.
    verification:
      - kind: other
        ref: 08-AUTOMATED-EVIDENCE.md#correction-provenance
        status: pass
    human_judgment: false
  - id: native-reminder-wording
    description: New Ukrainian reminder wording and both language directions await scoped native observation and user response.
    verification: []
    human_judgment: true
    rationale: This plan prepares the runbook; no live Telegram session or wording acceptance was authorized or performed.
---

# Phase 8 Plan 5: Bilingual Runtime and Workflow Evidence Summary

**The pruned Node 24.19 image verifies both catalogs and Ukrainian ICU as UID 999; 48 new bilingual handler cases close the explicit evidence handoff, and all full-suite failures have scoped passing correction reruns.**

All three plan tasks are executed. Phase requirements remain unchecked pending the orchestrator's independent review/security/regression/verification and later scoped native acceptance. This is a plan execution summary, not phase closure.

## Task Commits

1. Task 1 RED `b3d463f`; GREEN `8334976`: compiled runtime contract, Docker smoke after `USER gsmbot`, and isolated CI patch preserving existing checks.
2. Task 2 RED `e554d40`; implementation `f639ad0`; reachability hardening `70f963e`; migration fixture correction `5992b40`; legacy setup regression correction `7cbd793`; evidence/ledger `7e527d0`.
3. Task 3 `08da3f3`: one-scenario-at-a-time native reminder wording/behavior runbook; no pre-marked result.

Task 2 is test/evidence work: its GREEN commit intentionally uses `test`, not an invented product feature commit. No package/dependency version, production behavior, schema or scheduling authority changed beyond the requested verification entry point.

## Accomplishments

- Dependency-free compiled smoke imports both catalogs, verifies matching nonzero callable keys, parameterized reminder/planning output, Ukrainian locale support, September/weekday names, h23 time and eleven plural boundaries. Missing either compiled catalog exits 1 in disposable final-image containers; empty/missing/noncallable catalogs and missing ICU support have negative controls.
- New composed-bot/real-PostgreSQL tests cover readiness command identity/authorization, setup command/location/text/callback expiry, stale/consumed/foreign-step controls, save/cancel result branches and claim races in both en/uk. Each callback is acknowledged once; state and valid controls are preserved. Result-seam fault injection is explicitly labeled, not represented as naturally occurring database failure.
- Strict inventory validation now returns no errors. Of 477 sites, 464 have named evidence references; nine historical keyboard rows are proven unreferenced and four dominated setup fallback sites have guarded source/caller proofs. None of the thirteen is mislabeled bilingual evidence or dynamic user data. Mutation controls reject reachable imports/callers and changed guards. Windows item 24 is fixed.
- Existing migration, onboarding, planning, availability, readiness/manual booking, lifecycle, language-switch and actual durable reminder suites supply the complete matrix. Long Unicode/HTML labels, alert/message budgets, routing variants, stale/foreign authority, committed versus safe-retry recovery and unknown delivery ownership remain covered.
- Runbook implements D-13–D-16, actual-week Ukrainian copy, both language directions, immediate per-scenario wording response, baseline/restoration, one polling worker, real visible UI and exact historical waiver scope. Phone prominence remains unobserved/non-blocking; Phase 7 H4 remains historically unclassifiable.

## Verification and Provenance

Canonical details: `08-AUTOMATED-EVIDENCE.md`.

- Initial full check source: `f639ad006c5d7a366731466d68b3855832695b88`. Final tested source: `7cbd7935b48ce40b0e140d1a94643aefc0244f96`. Production `src` tree remains `a00b3f2dd9129a0ad5cdfa7f93af62beee1840ba`; final relevant source/test/build diff is empty. Unrelated actual config and continuation-file differences remain preserved.
- Full unit run: **679 passed / 43 files**. Hardened strict-inventory rerun: **11 passed**; runtime-contract tests: **5 passed**. These overlap the full unit count.
- Full integration run: **679 passed / 5 failed of 684 cases**, **45 passed / 2 failed of 47 files**, 521.02 seconds. It is deliberately recorded as exit 1, not retroactively relabeled a clean final run.
- Corrected migration/localized-reminder/follow-up rerun: **61/61 passed**. Corrected walking-skeleton/localized-onboarding/residual-bilingual rerun: **60/60 passed**. Together these cover every original failure; aggregate evidence covers **684 distinct integration scenarios with no remaining known failure**. Rerun counts are overlapping, not additional unique tests. No unnecessary full-suite repeat was made.
- Formatting/lint, generation, typecheck, runtime compilation, fresh migration deploy/status (14 migrations), Compose validation and final image smoke pass. Generation initially lacked `DATABASE_URL`; the build-only nonconnecting URL corrected the environment, with no source change.
- Final image `sha256:1432cfdae7889efb155247af999cd5acd29cfb2ea9637fb6ca2d0a2eb8a86d62`, configured `gsmbot`, observed UID 999, Node 24.19.0, ICU 78.3. Geo-tz runtime data/coordinate lookup remains valid. Host checks used Node 24.11.1; no claim of hosted GitHub Actions execution is made.
- Runtime smoke was rerun after the final test commit. Disposable DB/image-negative-control containers were removed automatically; live Telegram worker/database were untouched.

## Deviations from Plan

1. **[Rule 2 - Critical evidence] Narrow reachability classification.** The 48-site handoff included nine historical compatibility rows; source inspection additionally proved four setup fallback sinks dominated by earlier returns/caller kind. Added fail-closed proof validation and mutation tests rather than falsifying bilingual branch execution. Files: inventory fixture and unit tests; commits `f639ad0`, `70f963e`.
2. **[Rule 1 - Bug] Phase 08-03 reset helper broke the pre-language migration regression.** Added explicit `before-language` schema mode only for that fixture; retained default scoped preference reset. The real failing test supplied RED evidence; corrected 61-test rerun passed. Files: `tests/helpers/reminders.ts`, `tests/integration/chat-language-migration.test.ts`; commit `5992b40`.
3. **[Rule 3 - Blocking regression, orchestrator-authorized] Legacy walking-skeleton expectations predated Phase 6 language-first setup.** Updated only fixtures/assertions through real language-choice callbacks, keeping draft/revision/resume/expiry/authorization checks. First correction exposed two remaining expectations, fixed before the 60-test final pass. File: `tests/integration/walking-skeleton.test.ts`; commit `7cbd793`. No production behavior changed.
4. **Verification environment:** host Node is older than declared engine; target-image proof uses the declared Node 24.19 runtime. Local required commands passed within recorded scope; dependency versions were not upgraded.

## Acceptance and Deferred Issues

No production stubs, TODO/FIXME or skipped tests were introduced. No unresolved implementation/test failure remains in the observed command set. Native acceptance is a separate planned activity, not a skipped automated verification or a claimed pass. Existing Windows entry 21 and historical waivers are outside this task and remain unchanged. Full Git diff whitespace check reports pre-existing `.codex/config.toml` EOF whitespace; owned-file checks and repository formatting pass.

Threat scan: no new endpoint, authorization path, application file-access trust boundary or schema change. The smoke reads only static compiled catalogs/ICU; testing uses disposable fixtures. T-08-05-01/02 retain identity, escaping, authority and durable-claim checks; T-08-05-03 is addressed by explicit original/corrected provenance. No deployment occurred.

## Self-Check: PASSED

All five new artifact paths exist; all nine task/evidence commit objects exist. Command counts and image ID match observed logs. Strict inventory has no residuals. Requirements remain unchecked; no phase/native completion is claimed.
