---
phase: 08-localized-reminders-and-bilingual-verification
verified: 2026-09-19T00:30:00Z
status: passed
score: 23/23 must-haves verified
behavior_unverified: 0
overrides_applied: 0
verified_source: d91f5f7996d3b3251a63293a70a19c1ced0743dc
document_head: ebfa23b718e1adeac3bf1fe5f7c469dd06cb40e7
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: Queued planning reminder after en-to-uk, only when a currently authorized occurrence is feasible
    expected: Current Ukrainian sentence and start label, real target week, no mentions or duplicate; record wording response immediately
    why_human: Native display and subjective wording acceptance remain unobserved; preserve the existing morning and Start waiver and explicitly record the wording-observation gap
  - test: Ukrainian pending reminder and current-card navigation
    expected: All and only pending mentions, saved date/time/timezone, correct available private-supergroup destination, and immediate wording response
    why_human: Telegram navigation and wording require native observation; unavailable basic/public variants retain only their existing narrow waivers
  - test: Switch Ukrainian to English before the next normal eligible reminder
    expected: Retained English output and navigation with unchanged schedule, answers, authority and duplicate suppression
    why_human: Real Telegram delivery after the switch remains unobserved; no broad language-switch waiver exists
  - test: Switch English to Ukrainian and perform the next ordinary card update
    expected: Body and buttons change together while answers and valid controls remain; collect wording response immediately
    why_human: End-user interaction and wording acceptance are separate from automated payload assertions
---

# Phase 8: Localized Reminders and Bilingual Verification

**Phase Goal:** Durable reminders use the current group language and verification demonstrates a complete Ukrainian experience with retained English behavior in the target runtime.

**Status:** passed within the recorded acceptance scope. Native scenarios 2–4 are accepted and fixtures restored; scenario 1 retains the existing morning/Start waiver. The original automated verification below is historical; the 2026-09-20 acceptance addendum supersedes its pending native dispositions.

**Re-verification:** No — no previous Phase 8 VERIFICATION.md existed. Five canonical plans were checked; `08-PLAN-CHECK.md` is a review artifact, not a sixth execution plan. The roadmap's stale 5/6 sentence does not change the five-plan contract.

## Goal Achievement

The five roadmap criteria are mandatory rows 1–5. Rows 6–23 merge the plans' additional details; overlapping migration, encoding, missing-catalog and queued-planning truths are deduplicated. All 26 original plan truths map to these rows. No prohibition block, backstop truth or verification override was declared. D-13–D-16 require preparing a later native session; their runbook deliverable is verified, while its four unexecuted scenarios remain human verification items.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Planning-start reminders, including controls, use current language even when scheduled before a change. | VERIFIED | `src/app/main.ts:25` resolves persisted locale immediately before rendering both body and keyboard; production instantiates the same factory at line 248. `localized-reminders.test.ts:527` captures the real transport for en, uk and absent preference, with exact body/control and one durable send. |
| 2 | Follow-ups use current language, correct formatting, all pending mentions and navigation; language changes preserve timing and duplicate suppression through recovery. | VERIFIED | `reminder-service.ts:545` resolves locale after awaited metadata and before the claim transaction; lines 688–718 project saved round instants/timezone. Persisted recovery/rejection/unknown-outcome tests exercise both locales. The production follow-up factory is used by the metadata-await case at test line 629. |
| 3 | Catalog/parameter checks and outbound inventory detect missing translations and uncovered bot-owned copy without accepting English fallback. | VERIFIED | Direct catalog invocation in `i18n.test.ts`, typed samples and compile-negative contracts; AST discovery, expression/dependency hashes, named-case registrations and mutation controls in `outbound-surfaces.test.ts`. Independently rerun executed-evidence gate passes for current source hashes and both locales. |
| 4 | Bilingual verification covers onboarding through reminders and lifecycle recovery, access/stale/error paths, long Unicode, escaping and Telegram budgets. | VERIFIED | Current executed evidence maps 464 sites to passing case families; 13 additional sites have explicit non-production reachability proofs. The seven integration suites and renderer/format/unit families exercise full payloads and durable state, including the WR-01 corrections. Native acceptance is separately pending below. |
| 5 | Final compiled image includes both catalogs and Ukrainian Intl; required affected tests and CI checks have revision-scoped evidence preserving waivers. | VERIFIED | Docker smoke after `USER gsmbot`, CI final-image run, and independent network-disabled smoke exit 0 on image `82014398…`. Required local CI command results and corrected failures are explicitly scoped in `08-AUTOMATED-EVIDENCE.md`; no GitHub Actions or clean final full integration run is claimed. |
| 6 | Planning Ukrainian copy is one sentence, no mentions, with unchanged start capability. | VERIFIED | `renderPlanningReminder` uses exact catalog body/start keys and untouched callback data; captured planning payload assertions at test lines 580–623. D-01/D-02/D-04. |
| 7 | Civil week ranges use same/cross-month and cross-year Ukrainian forms without years, preserving English. | VERIFIED | `formatReminderWeekRange` uses civil-date arithmetic; `planning-format.test.ts` verifies same-month, month/year boundaries and retained English ISO range. D-03. |
| 8 | Absent preference defaults to English without masking missing Ukrainian entries. | VERIFIED | `LanguageService.resolve` via presentation resolver; null-preference durable send case; independent missing-Ukrainian negative controls. |
| 9 | Repeated/competing planning dispatch attempts once and keeps text/control locale coherent. | VERIFIED | Transactional occurrence eligibility/reservation in reminder service; `renders saved planning work…exactly once` dispatches competing/repeated work and asserts one capture and SENT state. |
| 10 | Ukrainian follow-up uses the selected two-line phrase, full date, authoritative 24-hour range and saved IANA timezone. | VERIFIED | Renderer/catalog heading and pending phrase; exact captured complete text at `localized-reminders.test.ts:677`, plus midnight/DST cases at line 717. D-05/D-06/D-08. |
| 11 | Pending-only mentions are comma separated in stable existing roster order, including equal names. | VERIFIED | Renderer filters pending participants then calls `sortRosterMembers`; bilingual renderer cases assert links, order and equal-name tie behavior. D-07. |
| 12 | Supergroups retain direct links; basic groups retain reply navigation and separate Ukrainian recovery line. | VERIFIED | Renderer validates public/private destinations and builds basic reply parameters; real transport capture asserts HTML mode, disabled previews and reply options; unit cases cover public/private/basic variants. D-09–D-12. |
| 13 | Zero pending sends nothing; one pending produces one real mention. | VERIFIED | Renderer returns empty before navigation; service records SKIPPED for non-ready projection. Renderer and persisted follow-up suites exercise empty/pending snapshot paths. |
| 14 | Hostile/long Unicode labels are escaped, shortened by code point, and every mention fits 4096 encoded units or is unsendable. | VERIFIED | `Array.from` before `escapeHtml`, fixed trusted `tg://user?id=` destinations and complete-text length guard; bilingual Unicode/budget renderer cases and complete-workflow captures. Alerts retain the 200-unit boundary. |
| 15 | Queued/recovered planning retains identity, generation, due time and domain state across both language directions. | VERIFIED | `planning recovery in %s preserves durable identity and round state` asserts snapshots after restarted service reconciliation. Plan 03 extends rather than replaces the Plan 01 delivery cases. |
| 16 | Queued/recovered follow-ups retain grace, cooldown, current pending snapshot and claim ownership. | VERIFIED | `queued follow-ups recover in %s with current anchor, pending snapshot and latest eligible identity` plus parameterized `reminder-followups.test.ts` reliability cases. No language-dependent occurrence identity exists. |
| 17 | Unknown outcomes stay consumed after restart/switch; proven rejection retains eligible retry. | VERIFIED | Planning and follow-up rejected/unknown tests assert REJECTED retry, current-language next render, UNKNOWN ownership and no replay. Existing service error classification/active attempt ownership remains wired. |
| 18 | In-flight output is not recalled; next distinct eligible render adopts new language. | VERIFIED | `in-flight %s planning payload retains ownership and next week uses new language` holds the send, commits preference and checks old/new captures with preserved ownership. |
| 19 | Existing controls/destinations, fresh authorization and exactly-once acknowledgement remain valid in both languages. | VERIFIED | `minted reminder control survives switch to %s with fresh authorization and one acknowledgement`; composed-bot lifecycle and language-switch suites also assert retained tokens/answers and denials. |
| 20 | Old-chat callbacks use destination current language once; commands are ignored and no action is forwarded or mutates domain state. | VERIFIED | `migration-handler.ts:57–77` reads migration destination solely for presentation and returns before next; composed `chat-migration.test.ts` exercises uk/en/uk, English default, single acknowledgement and unchanged snapshots. |
| 21 | Missing/empty/noncallable catalogs, incompatible parameters and bad output fail strictly, including runtime absence. | VERIFIED | `catalogSamples` exhaustively follows MessageParameters; `@ts-expect-error` contracts checked by typecheck. Catalog mutation tests and runtime negative controls prove fail-closed behavior. Actual image smoke independently passes; prior disposable-image missing-en/missing-uk controls exited 1. |
| 22 | Native runbook focuses new reminders and both switch directions while preserving accepted copy and historical waiver scope. | VERIFIED | `08-ACCEPTANCE-RUNBOOK.md` scenarios 1–4, feasibility gates and restoration section; no pre-recorded passes. D-13/D-14. |
| 23 | Every native scenario declares its condition first and records wording alongside behavior immediately afterward. | VERIFIED | Each runbook scenario has explicit before-actions and immediately-record sections plus evidence fields. D-15/D-16. This verifies the procedure, not unperformed native outcomes. |

**Score:** 23/23 merged automated/deliverable truths verified; 0 present-but-behavior-unverified truths. Four native acceptance items still require human decisions, so the overall status is **human_needed**, never passed.

### Required Artifacts and Key Links

| Artifact / connection | Status | Substantive implementation and wiring |
| --- | --- | --- |
| `src/app/main.ts` → presentation locale → planning renderer → Telegram API | VERIFIED | Both transport factories are instantiated in production; tests call those same factories. Import guard prevents startup on import. |
| `src/domain/reminders/reminder-service.ts` → follow-up renderer → production follow-up transport | VERIFIED | Real DB selection/reservation, saved-round timezone projection, current locale, ready/empty/unsendable and delivery outcomes; API result message ID is persisted. |
| `src/telegram/reminder-renderers.ts` → i18n and roster helpers | VERIFIED | Catalog phrases, stable sorting, escaping, bounded all-mention rendering and validated navigation, not placeholders. |
| `src/shared/i18n/index.ts`, `en.ts`, `uk.ts`, `planning-format.ts` | VERIFIED | Shared key/parameter types and actual phrases/date helpers are imported by production renderers; strict tests do not rely on fallback. |
| `src/telegram/migration-handler.ts` → locale/i18n → acknowledgement | VERIFIED | Migration boundary remains wired before ordinary dispatch; destination changes presentation only. |
| `localized-reminders`, `reminder-followups`, `chat-migration` integration tests; `tests/helpers/reminders.ts` | VERIFIED | Real isolated PostgreSQL fixtures, composed transport/callback paths and durable assertions. Reset is scoped and has explicit pre-language-schema mode. |
| `tests/fixtures/catalog-samples.ts`, `outbound-surfaces.ts`; i18n/inventory unit tests and `tests/helpers/outbound-evidence.ts` | VERIFIED | Exhaustive typed samples, AST source reconciliation, fail-first mutation controls and case-scoped executed records with current source hashes. |
| `tests/integration/bilingual-workflow.test.ts` and referenced bilingual suites | VERIFIED | Residual negative branches use real routing/authorization/persisted reads and exact payload assertions; explicitly injected durable outcomes are labeled fault injection. |
| `src/shared/i18n/runtime-smoke.ts` → Dockerfile → CI | VERIFIED | Compiled entry imports both catalogs, validates Intl/date/time/plurals, runs after pruning as gsmbot. CI builds Dockerfile then runs its final image. |
| Acceptance runbook → project Telegram UAT skill; automated evidence | VERIFIED | Concrete later native instructions, exact tested revisions/images, truthful failure/rerun history and restoration. |

The automated artifact query for Plan 01 returns 4/4. Literal key-link checking reports two false negatives for Plan 05: Docker references the compiled `dist/...js` path rather than the TypeScript source, and `docker build … .` implicitly consumes Dockerfile. Direct inspection plus actual image execution proves both links; no override is needed.

### Data-Flow Trace (Level 4)

| Output | Actual source → projection → sink | Status |
| --- | --- | --- |
| Planning body/button | Persisted reminder target week/capability + current ChatLanguagePreference → one localized renderer → production `api.sendMessage` | FLOWING |
| Follow-up heading/mentions/navigation | Transactional occurrence + active round/participant projection + saved timezone/endsAt + awaited Telegram chat metadata/current locale → bounded renderer → production transport → saved message ID | FLOWING |
| Migrated-chat alert | `chatMigration.findUnique(oldChatId)` → destination persisted locale → catalog → one acknowledgement, early return | FLOWING |
| Inventory evidence | Actual source AST and callable catalogs + named test registrations + JSON result metadata/current hashes → strict reconciliation | FLOWING; audited case-family contracts, not automatic branch instrumentation |

### Behavioral Spot-Checks and Provenance

Verifier independently ran the following at documentation HEAD `ebfa23b`, production source `d91f5f7`:

| Command/check | Result |
| --- | --- |
| `npx vitest run --project unit tests/unit/outbound-surfaces.test.ts -t 'requires fresh passing executed evidence for both locales at every site'` with the three report paths from the transport-correction section of AUTOMATED-EVIDENCE | PASS: 1 named test, 1.07 seconds test time; reconciles passing en/uk evidence and current hashes for all registered sites. The other 14 are filter exclusions, not disabled coverage. |
| `docker run --rm --network none gsmbot:phase08-reviewfix2 node dist/shared/i18n/runtime-smoke.js` | PASS: exit 0, actual pruned image, no network or service startup. |
| Initial inventory filter `-t 'reconciles passing'` | NO EVIDENCE: matched zero cases; immediately corrected to the exact name above. |

Behavior-dependent truths additionally use actual passing test-result records reconciled against source, not SUMMARY narration. The original full integration run remains **679 passed / 5 failed of 684**, exit 1. Scoped corrections of **61** and **60** cases covered all five failures. WR-01 then ran **216** cases across the seven mapped integration suites; transport correction ran **73** affected cases. Counts overlap and are not added. The orchestration regression gate freshly reports **757/757 unit tests, 46 files** at the same source/doc revision; this is additional orchestration evidence, not a verifier-run full suite.

Final image: `sha256:82014398e1c8a2fd6aaa2e2faa3e7f887bda21cb33af0245ec46f31c30a37192`. Source tree: `2d57c5829b55a6b09b6012d3b85113f0a822276c`. Recorded target: gsmbot UID 999, Node 24.19.0, ICU 78.3. Host Node 24.11.1 is below declared engine; this report distinguishes local command evidence from independently checked target-image support. Full command history, failures and fixes remain in `08-AUTOMATED-EVIDENCE.md`.

### Probe Execution

No phase-declared shell probe exists. The declared compiled runtime smoke was independently executed as above. No live server, worker or Telegram test was started. Research was explicitly skipped; the plans explicitly exclude a research-derived Nyquist VALIDATION artifact, so its absence is not a gap.

### Requirements Coverage

| Requirement | Source plans | Disposition | Evidence |
| --- | --- | --- | --- |
| LREM-01 | 01, 03, 05 | Implementation/automation SATISFIED; native acceptance pending | Truths 1, 6–9, 15, 17–19; native scenario 1 under existing narrow waiver |
| LREM-02 | 01, 02, 03, 05 | Implementation/automation SATISFIED; native acceptance pending | Truths 2, 10–14, 16–19; native scenarios 2–3 |
| L10N-02 | 04, 05 | SATISFIED by strict automated detection | Truths 3, 20–21; 477 inventoried sites = 464 executable registrations + 13 narrowly proven non-production sites |
| L10N-03 | 02, 03, 04, 05 | Automated/runtime contract SATISFIED; human acceptance pending | Truths 4–5, 14, 17–23 and four native scenarios |

All four roadmap requirements are claimed by canonical plans. No orphaned requirement. Requirement checkboxes remain unchanged pending orchestration and acceptance.

### Decision Coverage

`query check.decision-coverage-verify` returns **16/16 honored**, no missing decisions, non-blocking. Its message: “All trackable CONTEXT.md decisions are honored by shipped artifacts.” Code/runbook inspection supports this result.

### Test Quality Audit and Anti-Patterns

| Test family | Linked requirements | Assertion strength / audit result |
| --- | --- | --- |
| Localized reminders and follow-up reliability | LREM-01/02, L10N-03 | Behavioral: real DB state before/after switch, API payload/options, claim/due identity and retries; active passing cases |
| Composed migration/bilingual workflows | L10N-02/03 | Behavioral: exact localized output, single acknowledgement, durable non-mutation; injected failure outcomes explicitly bounded |
| Renderer/format/catalog/runtime | LREM-01/02, L10N-02/03 | Value assertions, hand-authored exact phrases/date categories, malformed/missing controls and budgets |
| Outbound inventory/executed evidence | L10N-02/03 | Source/branch-contract reconciliation; rejects unrelated existing tests and stale/failed evidence; reachability exemptions fail closed |

No disabled requirement-linked tests or unreferenced TBD/FIXME/XXX debt markers were found in the phase's changed source/test files. No circular expected-output generator was found in the inspected evidence pipeline: it records test metadata/source hashes, not expected translated values. Empty/unsendable renderer results are deliberate guarded outcomes, not empty UI stubs. No blocker anti-pattern or missing implementation was found.

Disconfirmation checks specifically examined frozen queue locale, omitted mentions/budget truncation, and the previously misleading test-to-source mapping. Queue payload does not freeze locale; labels shorten without dropping identities; WR-01 now requires named executed records and current hashes, and the actual follow-up transport is exercised. Partial acceptance remains native wording/navigation. Synthetic database-result faults prove presentation handling, not naturally occurring database failure; no such broader claim is made. The runtime catalog smoke alone proves structure/representative output, not all translations; exhaustive direct catalog tests and the inventory supply the additional evidence.

Independent review is clean after `c4602df` and `d91f5f7`. Security records 21/21 dispositions: 16 mitigations verified and five pre-existing low-risk dependency acceptances; no new acceptance is invented.

### Human Verification Required

Follow `08-ACCEPTANCE-RUNBOOK.md` through the project Telegram UAT skill, one scenario at a time. State the explicit condition before action, then record behavior and the user's wording response immediately afterward. All four scenarios are currently **not run**:

1. **Queued planning after en→uk:** observe the actual week, Ukrainian sentence/start control and no mentions/extra send only when an authorized natural occurrence is feasible. Otherwise preserve the historical morning/Start waiver and explicitly record new wording not observed.
2. **Ukrainian pending reminder/navigation:** observe the real pending set, saved slot/timezone and available private-supergroup current-card link; collect wording acceptance. Unavailable basic/public variants retain their existing narrow waivers only.
3. **uk→en next reminder:** observe a new normal eligible English delivery and unchanged schedule/answers/authority. Lack of a feasible occurrence leaves this pending; it does not inherit the morning waiver.
4. **en→uk normal card update:** observe body/buttons together, retained answers and valid controls; collect wording acceptance.

Check runtime revision/image against automated evidence before native work. Restore changed fixtures; cancel only test-created plans. Phone notifications remain unobserved and non-blocking. Phase 7 H4 retains its historical **unclassifiable** disposition, neither a pass nor a new undefined test. No live deployment or blanket waiver is authorized or inferred here.

### Gaps Summary

No actionable implementation gaps or blocker findings. There is no later milestone phase to absorb missing work, and none was deferred. Four native acceptance items are WARNING/human decisions, so the Escalation Gate remains **human_needed** despite 23/23 automated/deliverable truths. This report does not mark Phase 8 or its requirements complete.

---

_Verified: 2026-09-19T00:30:00Z_
_Verifier: gsd-verifier_

## Native acceptance closure — 2026-09-20

This addendum supersedes the original human_needed disposition and pending native statements above, without changing or rerunning the automated evidence. The user accepted scenario 4 wording and scenario 2 Ukrainian reminder wording on 19 September, and the final scenario 3 English reminder/navigation result on 20 September. See 08-UAT.md and 08-LIVE-TEST-2026-09-19.md / 08-LIVE-TEST-2026-09-20.md.

Final UAT: three passed, one skipped with the existing morning planning/Start waiver, zero issues or pending items. Ukrainian planning wording was not natively observed; automated planning/date contracts retain their separate provenance. Unavailable basic/public navigation variants and phone notification observation retain only their prior scoped dispositions. Phase 7 H4 remains historically unclassifiable.

The actual tested bot image matches the original verified image 82014398e1c8a2fd6aaa2e2faa3e7f887bda21cb33af0245ec46f31c30a37192. Ukrainian delivery at 19 September 16:00:15 and English delivery at 20 September 10:00:00 both mention only pending B and navigate to the current card, with no observed duplicate. User acceptance resolves the remaining native conditions for LREM-01, LREM-02 and L10N-03 within this scope; L10N-02 retains automated satisfaction. All four phase requirements are complete within documented scope.

Restoration was verified through Telegram on 20 September: temporary round cancelled, no active plan, baseline English/settings/roster preserved. No open implementation gap or security threat remains. Phase verification is passed; milestone audit/archival is a separate next step.

## GSD transition limitation — 2026-09-20

After final acceptance, the shared `phase uat-passed 8 --require-verification` check reports only `08-UAT.md: test 1 (skipped)` as a blocker. Canonical verification is passed and all other checks pass. The installed predicate accepts only pass/passed, unlike the verify-work completion contract which allows skipped-with-reason. The historical waiver is deliberately preserved as skipped; it was not relabeled or hidden to satisfy the tool. Native UAT is complete, but automatic phase transition was not executed. Resolve this GSD waiver-handling inconsistency before milestone transition; no repeat native test or new waiver is required.
