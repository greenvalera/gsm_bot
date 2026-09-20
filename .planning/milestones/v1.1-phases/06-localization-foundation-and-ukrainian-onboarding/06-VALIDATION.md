---
phase: 06
slug: localization-foundation-and-ukrainian-onboarding
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-16
---

# Phase 6 Validation Strategy

This is a source-grounded plan, not execution evidence. Research was explicitly skipped. No implementation tests were run while authoring these plans. New tests below are created test-first in their owning task; existing Vitest unit/integration projects and tests/helpers/postgres.ts supply the harness. There is no separate empty scaffold wave.

## Execution waves and dependencies

| Wave | Plans | Output |
|---|---|---|
| 1 | 06-01 | Real persisted-locale /settings tracer; blocking migration and catalog preflight |
| 2 | 06-02 | Administrator selection, setup gate, incomplete settings and resumption |
| 3 | 06-03, 06-06 | Complete setup/catalogs; independent identity-transfer hardening |
| 4 | 06-04 | Complete settings and open-edit preservation |
| 5 | 06-05 | Complete roster and safe names |
| 6 | 06-07 | Localized boundary feedback and composed state-preservation proof |

Wave 3 ownership is disjoint: 06-03 owns catalog/setup/keyboard files; 06-06 owns preference service/migration/identity tests. All catalog and handler overlaps elsewhere are ordered through dependencies. The 06-01 tracer passes before expansions. Its disposable helper applies committed migrations before behavior queries; its blocking second task proves fresh/upgrade/repeat deployment through the repository wrapper before plan 02 starts.

## Test infrastructure and cadence

- Framework: Vitest 4.1.11, separate unit and integration projects from existing package scripts.
- Fast check: npm run test:unit -- tests/unit/i18n.test.ts tests/unit/language-selection.test.ts. Target is under 60 seconds after tests exist; runtime is unmeasured at planning.
- Per task: the specific automated command in that task. New tests must fail for the expected missing behavior before implementation, then pass.
- Per plan: targeted suites plus npm run typecheck.
- Schema gate: npm run test:integration -- tests/integration/chat-language-migration.test.ts tests/integration/migration-preflight.test.ts.
- Phase regression: npm run test:unit; npm run test:integration -- tests/integration/localized-onboarding.e2e.test.ts tests/integration/localization-tracer.test.ts tests/integration/chat-language-identity.test.ts tests/integration/chat-migration.test.ts tests/integration/reminder-settings.test.ts; npm run typecheck; npm run build:runtime; npm run format:check.
- Integration tests use PostgreSQL 18.4 through existing Testcontainers helpers. Container initialization may exceed 60 seconds; report running progress. Docker unavailability is a blocking schema/integration gap, not permission to substitute mocks.
- Set DATABASE_URL only from the disposable fixture. Deploy reviewed committed migrations and check status. Never use a real configured database, schema push, reset or destructive fallback.
- Preserve pre-existing formatting/CI failures as separately attributed evidence; do not format unrelated edits. Record exact revision and test commands in summaries.

## Per-task verification map

| Task | Requirements | Automated proof | Existing harness / new test |
|---|---|---|---|
| 06-01-01 | LANG-03/04/05, L10N-01 | localization-tracer.test.ts through composed bot and real PostgreSQL | New test; chat-readiness.e2e analog |
| 06-01-02 | LANG-03/05 | chat-language-migration.test.ts and migration-preflight.test.ts | New upgrade test; existing preflight |
| 06-02-01 | LANG-01/02/04 | language-selection.test.ts | New, existing callback authority pattern |
| 06-02-02 | LANG-01/02/03/05 | language-navigation.test.ts and localization-tracer.test.ts | New, existing setup/settings harness |
| 06-03-01 | TEXT-01, L10N-01 | i18n.test.ts plus typecheck | New typed/render contract test |
| 06-03-02 | LANG-01/04, TEXT-01 | setup.test.ts, timezone-prompt-copy.test.ts, language-navigation.test.ts | Existing and new |
| 06-04-01 | LANG-02/04, TEXT-01 | settings-localization.test.ts, settings-dashboard-keyboard.test.ts, schedule-settings.test.ts | Existing and new |
| 06-04-02 | LANG-02/04 | settings.test.ts, settings-localization.test.ts, language-navigation.test.ts | Existing and new |
| 06-05-01 | TEXT-01, LANG-04 | roster-rendering.test.ts | Existing |
| 06-05-02 | TEXT-01, LANG-04 | roster-add.test.ts, roster-remove.test.ts, roster-localization.test.ts | Existing and new |
| 06-06-01 | LANG-05 | chat-language-identity.test.ts and chat-migration.test.ts | New plus existing PostgreSQL migration |
| 06-06-02 | LANG-03/04/05 | chat-language-service.test.ts and chat-language-identity.test.ts | New unit and real PostgreSQL |
| 06-07-01 | LANG-02/04, TEXT-01 | onboarding-feedback.test.ts and callback-authority.test.ts | New plus existing |
| 06-07-02 | All seven | localized-onboarding.e2e.test.ts plus phase regression | New composed real-DB flow |

## Source coverage audit

| Source | Item | Plan(s) | Status |
|---|---|---|---|
| GOAL | Persistent pre-configuration language and complete Ukrainian onboarding through shared infrastructure | 01–07 | COVERED |
| REQ | LANG-01 first setup selection | 02,03,07 | COVERED |
| REQ | LANG-02 administrator settings selection and new-locale confirmation | 02,04,07 | COVERED |
| REQ | LANG-03 English default for existing/new groups | 01,02,06,07 | COVERED |
| REQ | LANG-04 independent group locale, client-language independence | 01–07 | COVERED |
| REQ | LANG-05 restart/repeat/pre-configuration migration survival | 01,02,06,07 | COVERED |
| REQ | TEXT-01 complete setup/settings/roster text and controls | 03,04,05,07 | COVERED |
| REQ | L10N-01 shared typed catalogs and context-free background representative | 01,03,07 | COVERED |
| RESEARCH | Explicit user selection to skip research; no RESEARCH.md | — | EXCLUDED, authorized |
| CONTEXT | D-01 first language screen | 02 | COVERED |
| CONTEXT | D-02 resume saved language | 02,03,06 | COVERED |
| CONTEXT | D-03 timezone change and incomplete settings | 02 | COVERED |
| CONTEXT | D-04 localized review row and independent persistence | 03 | COVERED |
| CONTEXT | D-05 immediate change/new-language confirmation | 02,04 | COVERED |
| CONTEXT | D-06 incomplete language-only settings | 02,04 | COVERED |
| CONTEXT | D-07 bilingual navigation label | 02 | COVERED |
| CONTEXT | D-08 same-language silence/no-op with acknowledgement | 02,04,06 | COVERED |
| CONTEXT | D-09 informal singular Ukrainian | 03,04,05 | COVERED |
| CONTEXT | D-10 roster vocabulary | 05 | COVERED |
| CONTEXT | D-11 approved planning-access labels | 03 | COVERED |
| CONTEXT | D-12 conversational corrective examples | 03,04,05 | COVERED |
| CONTEXT | D-13 old-prompt answer/current-language outcome | 03,04,07 | COVERED |
| CONTEXT | D-14 last valid selection wins | 02,06,07 | COVERED |
| CONTEXT | D-15 open independent confirmation validity | 04,05,07 | COVERED |
| CONTEXT | D-16 Continue setup and actor/expiry rules | 02,06 | COVERED |

No deferred idea was imported. Phase 7 full lifecycle/help/error/date/plural acceptance and Phase 8 actual reminder delivery/full runtime inventory remain owned by those phases. Existing accepted historical waivers are unchanged.

## Spec-less edge report resolution

The input 06-EDGE-PROBE.json contains 15 unresolved rows. This table records the planner's disposition without overwriting the raw report. Every classified row has an explicit observable truth in the named plan; unclassified rows stay flagged assumptions.

| Requirement / category | Resolution and criterion | Location |
|---|---|---|
| LANG-01 / unclassified | FLAGGED UNRESOLVED assumption: approved first-setup decisions define acceptance; classifier supplies no additional predicate. Do not treat unclassified as proven. | 01 flagged assumptions; 02 behavior |
| LANG-02 / adjacency | Explicit: current explicit locale is no-write no-op with unchanged updatedAt | 02 truths |
| LANG-02 / empty | Explicit: incomplete settings can select language without configuration | 02 truths |
| LANG-02 / ordering | Explicit: last accepted still-valid independent selection wins | 02 truths |
| LANG-03 / unclassified | FLAGGED UNRESOLVED assumption: absence means implicit English; legacy configured chats follow existing English setup route. Classifier supplies no additional predicate. | 01 flagged assumptions |
| LANG-04 / adjacency | Explicit: equal locale values in two chats remain separate preferences | 01 truths |
| LANG-04 / empty | Explicit: missing preference resolves English for that chat | 01 truths |
| LANG-04 / ordering | Explicit: latest choice affects only subsequent rendering in its group | 02 truths |
| LANG-05 / adjacency | Explicit: duplicate migration pair preserves transferred preference | 06 truths |
| LANG-05 / empty | Explicit: preference-only incomplete setup is durable | 01 truths |
| LANG-05 / ordering | Explicit: transfer/tombstone/domain changes are atomic | 06 truths |
| TEXT-01 / empty | Explicit: partial draft shows current step and optional empty values retain meaning | 03 truths |
| TEXT-01 / encoding | Explicit: preserved names/escaping and UTF-16 output plus UTF-8 callback budget | 05 truths |
| L10N-01 / empty | Explicit: nonempty catalog entries and matching key/parameter contracts | 03 truths |
| L10N-01 / encoding | Explicit: Ukrainian and dynamic Unicode preserve text identity | 03 truths |

Accounting: 15 surfaced = 13 explicit truths + 2 flagged unresolved assumptions; 0 silent drops, 0 backstop substitutions.

## Prohibition probe

Ran the two-stage adversarial recall per prohibition-probe.md across all seven requirements. Raw candidates included unwanted auto-detection, per-member preference, translating identifiers/names, rewriting historical messages, changing authorization, dropping acknowledgements, cross-chat preference leakage, resetting setup, changing reminder timing, silent catalog fallback and destructive schema application. These are already explicit product exclusions or routine correctness obligations represented in plan behavior/edge truths; they do not introduce a new bespoke safety/ethics constraint. Authorization/injection/privacy candidates are canon security concerns: refer to $gsd-secure-phase and this phase's ASVS-1 threat models; no duplicate prohibition is minted. Precision outcome: zero new kept prohibitions, zero dismissed surfaced items, zero serializer inputs. If later review surfaces a bespoke prohibition, use projectProhibitions descriptor-less serialization and flag it unverified; do not invent a wired check.

## Assumption delta and integration scope

Promote implicit English rendering to explicit per-chat Locale as the rendering input. Chat bigint identity remains primary and unchanged; preference existence/explicitlySelected are independent of configuration readiness. The initial same-default English choice records the explicit marker once, while already-explicit same-locale selections perform no repeated preference write. This distinction implements D-01/D-08 without asking again.

The API detector returned detected=false for the plan scope. This phase modifies existing Telegram transport usage and internal localization; it introduces no external integration or capability surface.

## Human verification at end of phase

Use the project telegram-web-uat skill if live Telegram acceptance is performed. Do not send messages to unrelated chats. Verify authorized test-chat flows: first Ukrainian selection, complete setup, bilingual recovery entry, settings change/no-op, roster labels, and older-language open edit/removal confirmation. Check Ukrainian naturalness and button legibility in the real client. Automated payload tests cannot establish native-client visual quality. Report missing native evidence without reopening historical accepted waivers.

## Sign-off

- [ ] Each task's test-first behavior and passing evidence recorded.
- [ ] Blocking migrated PostgreSQL fresh/upgrade/identity evidence recorded.
- [ ] All D-01–D-16 and seven requirement rows have tested implementation links.
- [ ] No unresolved high/critical scoped threat.
- [ ] Native-client evidence or explicit scoped outstanding status recorded.
- [ ] Nyquist status updated only from execution evidence.


## Plan review evidence

On 2026-09-16, independent gsd-plan-checker review passed all seven plans after one targeted revision. Intermediate locale API compatibility and the two-task scope rationale were clarified. Structural checks passed for all 14 tasks; decision coverage passed 16/16 and post-planning coverage passed 23/23 requirement/decision items. This evidence validates plans only; implementation and runtime checks remain pending.

## Execution evidence — plan 06-07

Recorded 2026-09-16 against implementation revision `418a942`. The planning strategy and source-coverage table above describe intended coverage; this section records executed checks. Final phase verification and Nyquist sign-off remain with the orchestrator/verifier.

| Check | Result |
|---|---|
| Boundary RED | `3f7e040`: Ukrainian command denial, unresolved-token and bound stale/denial tests failed against English-only boundaries. An initially incorrect consumed/malformed fixture expectation was corrected to the existing stale response. |
| Boundary GREEN | `1659834`: targeted onboarding-feedback, callback-authority and language-selection suites passed 53/53. |
| Audit follow-up RED/GREEN | `4f89fdc` reproduced pre-write English failure feedback after preference changed to Ukrainian; `0074382` resolves failure/stale language replies through response-time typed catalog entries. |
| Full unit | `npm run test:unit`: 546/546 tests, 36 files passed. |
| Real PostgreSQL regression | `npm run test:integration -- tests/integration/localized-onboarding.e2e.test.ts tests/integration/localization-tracer.test.ts tests/integration/chat-language-identity.test.ts tests/integration/chat-migration.test.ts tests/integration/reminder-settings.test.ts tests/integration/chat-readiness.e2e.test.ts`: 42/42 tests, six files passed in 36.14 seconds. |
| Compile/runtime | `npm run typecheck` and `npm run build:runtime`: passed. |
| Formatting | `npm run format:check`: all matched files passed; unrelated files were not reformatted. |

Runtime was Node 24.19.0 with disposable PostgreSQL 18.4 and committed migrations through the existing fixture. Telegram transport was intercepted; no live messages were sent. Prior schema/upgrade and identity evidence remains in 06-01/06-06 summaries.

The new composed suite completes setup fields, settings edits and roster add/page/remove in both locales; compares configuration revisions, both draft types, roster identities, planning ownership/answers, reminder generation and occurrence due times immediately around language-only changes; preserves old-language prompts and open settings/roster confirmations; reconstructs the bot; rejects expired, consumed, foreign and unauthorized language tokens; verifies independent administrator ordering, same-language timestamp no-op, group isolation and client-language independence. Every callback helper checks exactly one outbound acknowledgement.

Production locale call-site audit: setup handlers pass locale to renderSetupStep, renderCommittedConfiguration and candidate rendering; settings handlers pass locale to renderSettingsProjection, renderSettingsDashboard, renderSettingsEditPrompt, renderSettingsReview, weekdayKeyboard, settingsDashboardKeyboard, settingsReviewKeyboard and planningAccessKeyboard; roster projections, labels and keyboards receive locale. Internal renderer calls propagate locale. setupKeyboard has no locale argument because its rows are already localized. Language selection/recovery uses typed catalog entries; shared callback feedback resolves actual update chat identity. No Phase 6 compatibility-default caller remained. Pure en/uk background settings/keyboard projections are exercised in i18n.test.ts; actual reminder delivery remains Phase 8.

Native Telegram button legibility and Ukrainian naturalness remain **pending human verification**. No native-client evidence is claimed, and historical accepted waivers are unchanged. Independent code/security review and final phase verifier have not been claimed by this executor.

### Independent review recovery fix

Review found that database-backed locale reads could suppress an already-caught operational failure response. RED `38e2c32` and GREEN `e5c97d6` cover five language/settings/roster outage cases. The presentation-only resolver now prefers the current lookup, falls back to the same operation's last-known language where available, then English, and records safe structured failure metadata. Authorization and durable-operation failure semantics are unchanged.

At `e5c97d6`: targeted six suites **160/160 passed**, full unit **551/551 passed** across 36 files, typecheck passed, and all eight affected source/test files formatted. Earlier real-database/runtime/global-format results retain their stated implementation revision; native-client evidence remains pending. See 06-07-SUMMARY.md follow-up for scope and commits.


### Final orchestrator evidence and pending gates

Generated client packaging was repaired in b2b5701; a successful generation-only Prisma run with a placeholder URL produced no generated-source diff. No database connection or migration was involved. Final correction e6f02f0 uses committed result locale when the confirmation lookup fails; its regression was observed failing before correction. At e6f02f0, full unit 552/552, targeted feedback/language 47/47, typecheck, runtime build and touched-file formatting pass. The 42/42 PostgreSQL result remains scoped to 418a942; subsequent changes only add generated-source tracking and presentation failure handling.

Independent security audit closed 28/28 registered mitigations (06-SECURITY.md). Code review corrections are implemented, but targeted independent confirmation and goal verification were interrupted by Codex usage limits. No final VERIFICATION verdict or native-client UAT pass is claimed. Nyquist sign-off remains pending. Resume from .continue-here.md.

## Validation Audit 2026-09-17 — resumed execution

This audit cross-referenced behavioral assertions with the seven requirements, fourteen tasks and sixteen decisions. Historical planning coverage above is not retroactively presented as executed proof. Status is **validated with partial decision coverage**; `nyquist_compliant` remains false until the two narrow gaps below run green. Existing test infrastructure and all task test files exist, so wave zero is complete. No implementation files or test files were changed by this audit.

Fresh execution evidence supplied by the orchestrator at HEAD `d665c1e` (implementation `e6f02f0`, pre-existing dirty baseline preserved): `npm run test:unit` passed **552/552**; the six-file PostgreSQL phase regression listed under plan 06-07 passed **42/42** in approximately 34 seconds; typecheck, runtime build and full formatting passed. Independent review additionally reran its six targeted suites **161/161**, confirmed both recovery corrections and reported zero open findings. These are executed checks reported by their owners, not additional runs by this auditor. The earlier **40/40** fresh/upgrade/repeat migration gate at `c173986` remains the schema evidence; it is not relabeled as a fresh HEAD run. Security remains 28/28 closed at its documented scope.

| Metric | Count |
|---|---|
| Requirements with executed behavioral coverage | 7/7 |
| Tasks with automated commands and passing evidence | 14/14 |
| Decisions fully supported by automated behavior, subject to human copy judgment | 14/16 |
| Narrow decision coverage gaps | 2 |
| New tests created/run by this auditor | 0 |
| Implementation defects demonstrated | 0 |

### Executed task and requirement cross-reference

Paths below are relative to `tests/`; `U` means `npm run test:unit --`, `I` means `npm run test:integration --`. Append the listed paths to the runner. All statuses refer to the cited execution evidence; PARTIAL means a narrower decision predicate is still unverified, not that an existing test failed.

| Task | Requirements | Command suffix / assertion evidence | Status |
|---|---|---|---|
| 06-01-01 | LANG-03/04/05, L10N-01 | I `tests/integration/localization-tracer.test.ts`: absent preference renders English, Ukrainian survives bot reconstruction, bigint groups retain distinct rows and configuration count remains zero | green |
| 06-01-02 | LANG-03/05 | I `tests/integration/chat-language-migration.test.ts tests/integration/migration-preflight.test.ts`: snapshot equality across upgrade/repeat deployment, invalid locale rejected, ledger/catalog constraints checked; historical 06-01 40/40 gate | green |
| 06-02-01 | LANG-01/02/04 | U `tests/unit/language-selection.test.ts`: durable explicit selection, unchanged repeated timestamp, supported targets and authority rejection; real-DB composed suite checks exactly one acknowledgement | green |
| 06-02-02 | LANG-01/02/03/05 | U `tests/unit/language-navigation.test.ts`; I `tests/integration/localization-tracer.test.ts`: first screen precedes draft, selection advances, saved language resumes, actor-owned drafts and expiry retained | PARTIAL: G-06-D03 |
| 06-03-01 | TEXT-01, L10N-01 | U `tests/unit/i18n.test.ts` plus `npm run typecheck`: equal nonempty catalogs, negative parameter/key contracts, eight steps, review language, escaped Unicode, context-free en/uk settings/keyboard projections | green |
| 06-03-02 | LANG-01/04, TEXT-01 | U `tests/unit/setup.test.ts tests/unit/timezone-prompt-copy.test.ts tests/unit/language-navigation.test.ts`: current-locale transitions, fixed access labels, invalid input, resolver failure and outcome messages | PARTIAL: G-06-D04 |
| 06-04-01 | LANG-02/04, TEXT-01 | U `tests/unit/settings-localization.test.ts tests/unit/settings-dashboard-keyboard.test.ts tests/unit/schedule-settings.test.ts`: editable fields, validation/recovery, configured/incomplete dashboards | green |
| 06-04-02 | LANG-02/04 | U `tests/unit/settings.test.ts tests/unit/settings-localization.test.ts tests/unit/language-navigation.test.ts`: both-direction confirmations preserve drafts/state; save/keep old prompts; real conflicts/expiry/other actors rejected | green |
| 06-05-01 | TEXT-01, LANG-04 | U `tests/unit/roster-rendering.test.ts`: empty/loading/failure, escaped names, same member list across locales, page binding, UTF-16 text and UTF-8 callback budgets | green |
| 06-05-02 | TEXT-01, LANG-04 | U `tests/unit/roster-add.test.ts tests/unit/roster-remove.test.ts tests/unit/roster-localization.test.ts`: add/remove outcomes, current-locale confirmations, denied/duplicate/stale/error behavior | green |
| 06-06-01 | LANG-05 | I `tests/integration/chat-language-identity.test.ts tests/integration/chat-migration.test.ts`: preference-only/configured transfer, destination conflict and tombstone rollback, duplicate migration, source/destination races | green |
| 06-06-02 | LANG-03/04/05 | U `tests/unit/chat-language-service.test.ts`; I `tests/integration/chat-language-identity.test.ts`: reconstructed clients, no-op timestamps, tombstone rejection, independent drafts/configuration/reminder snapshots | green |
| 06-07-01 | LANG-02/04, TEXT-01 | U `tests/unit/onboarding-feedback.test.ts tests/unit/callback-authority.test.ts tests/unit/language-selection.test.ts`: actual-chat feedback and authority, one acknowledgement, preference-read outage recovery and committed-locale fallback | green |
| 06-07-02 | All seven | I `tests/integration/localized-onboarding.e2e.test.ts`: real en/uk setup/settings/roster completion; exact domain snapshots through switching; open confirmations survive restart; invalid tokens denied, group/client-language isolation | green |

### Decision assertion map

| Decision | Behavioral evidence | Classification |
|---|---|---|
| D-01 | localization-tracer first setup assertion, zero draft before choice, minted Ukrainian choice immediately renders timezone | COVERED |
| D-02 | tracer reconstruction/repeated setup retains the stored preference and draft identity | COVERED |
| D-03 | language-navigation asserts timezone bilingual entry; incomplete settings is tested; no negative assertion for subsequent setup steps | PARTIAL: G-06-D03 |
| D-04 | i18n literal `Мова: Українська` review assertion; tracer expiry preserves selected language; cancellation only has a mocked outcome assertion | PARTIAL: G-06-D04 |
| D-05 | tracer and composed callbacks assert new-language success, immediately persisted locale and settings return | COVERED |
| D-06 | language-navigation asserts language/Continue setup and absence of Schedule; tracer confirms no configuration fabricated | COVERED |
| D-07 | literal bilingual entry checked by navigation/settings and both-locale composed token selection | COVERED |
| D-08 | composed suite compares entire preference row before/after same-language choice and asserts undefined feedback with one acknowledgement | COVERED |
| D-09 | literal informal prompts and corrective messages in language-navigation; copy naturalness remains human judgment | COVERED, WARNING: human tone judgment pending |
| D-10 | roster-rendering literal heading plus localized roster flow and catalog output assertions; terminology naturalness remains human judgment | COVERED, WARNING: human wording judgment pending |
| D-11 | language-navigation exact three Ukrainian policy labels with unchanged policy targets; full setup selects existing policy | COVERED |
| D-12 | language-navigation literal corrective time example; settings-localization invalid schedule/expiry and roster failure assertions | COVERED |
| D-13 | old English prompt changes persisted start time and renders Ukrainian next step; both-direction settings tests and composed old prompt flow | COVERED |
| D-14 | two independently minted administrator screens apply uk then en; final persisted locale asserted, expired/consumed/foreign/demoted actions denied | COVERED |
| D-15 | settings confirms old review in both directions, rejects genuine conflicts; composed settings and roster confirmations remain usable after switching/restart | COVERED |
| D-16 | tracer preserves original actor values while another actor gets a separate draft; expired actor draft restarts in Ukrainian; migrated draft continuation covered | COVERED |

### Unresolved automated coverage gaps

| Gap | Task / requirement | Missing behavioral assertion | Suggested existing fixture and command |
|---|---|---|---|
| G-06-D03 | 06-02-02 / LANG-01, TEXT-01 / D-03 | After timezone is entered, later setup steps must omit the language-change control, while timezone still includes it. A regression adding the control everywhere currently would not fail the positive entry tests. | Extend `tests/unit/language-navigation.test.ts` using `harness(true, "uk")`, progressive draft fields and `continueSetup`/`handleSetupCommand`; inspect emitted keyboard labels. Run `npm run test:unit -- tests/unit/language-navigation.test.ts`. |
| G-06-D04 | 06-03-02 / LANG-05, TEXT-01 / D-04 | Cancel an actual persisted setup draft and assert the complete language-preference row survives unchanged, configuration remains absent and subsequent /setup resumes in saved Ukrainian. A mocked cancelled outcome cannot prove independent persistence. | Extend `tests/integration/localization-tracer.test.ts` using `navigation(chatId)` and real `prisma`; select Ukrainian, reach review using existing draft fixture or enter fields, click the real cancel token, compare preference before/after and reconstruct navigation. Run `npm run test:integration -- tests/integration/localization-tracer.test.ts`. |

These are uncovered assertions, not observed implementation failures. They remain unfilled and are handed to the orchestrator for test-only completion under the active execution workflow. No skipped tests or manual substitute is claimed for them.

### Manual-only verification and sign-off limits

Native Telegram Ukrainian wording/tone, button legibility and client presentation remain **pending human verification** in the authorized test chat. Automated API payload checks do not establish these qualities. This does not reopen historical native-client waivers, and Phase 7/8 translation/runtime inventory obligations remain outside this phase.

- [x] Fourteen tasks have automated commands, test files and passing execution evidence; RED/GREEN history remains in seven summaries.
- [x] Fresh/upgrade/repeat schema and durable identity evidence is recorded with original revision scope.
- [x] Seven requirements and D-01 through D-16 are cross-referenced to assertions and explicit limitations.
- [x] Independent review reports zero open findings; prior scoped security register has no open threat.
- [x] Native-client status is explicitly outstanding.
- [ ] G-06-D03 and G-06-D04 have executed passing behavioral assertions.
- [ ] Nyquist compliance is true only after those gaps are filled; final phase verification remains the orchestrator's responsibility.
## Validation gap closure 2026-09-17

The orchestrator authorized test-only completion of the two audit gaps. Both now have executed behavioral assertions; the earlier partial audit is retained as history and superseded by this closure. No production changes were necessary.

| Gap | Added behavioral regression | Execution result | Status |
|---|---|---|---|
| G-06-D03 | `tests/unit/language-navigation.test.ts`: `offers language changes only on the timezone step in %s`, parameterized for en/uk. Asserts the timezone control exists, then progressively fills every setup field (including both reminder substeps and review), requiring each response and rejecting both the bilingual label and a minted language-open action afterward. | `npm run test:unit -- tests/unit/language-navigation.test.ts`: 18/18 passed, 0.515 seconds | FILLED |
| G-06-D04 | `tests/integration/localization-tracer.test.ts`: `keeps the selected language after cancelling persisted setup and reconstructing the bot`. Uses real migrated PostgreSQL, a callback-selected Ukrainian preference and persisted complete draft; clicks the minted cancellation token and asserts draft deletion, no configuration, exact unchanged preference row including timestamps, then reconstructs the bot and asserts a fresh Ukrainian timezone step and retained preference. | `npm run test:integration -- tests/integration/localization-tracer.test.ts`: 7/7 passed, 6.80 seconds | FILLED |

Both suites passed on their first execution. Node 24.19.0 and the existing disposable PostgreSQL fixture were used; Telegram API calls remained intercepted. `npm run typecheck` passed. Both changed test files were formatted with Prettier. These are additional regression tests for already-implemented behavior; no pre-implementation RED or production fix is claimed. The integration fixture seeds completed draft fields to reach the actual review/cancel boundary; the existing composed suite separately verifies normal input completion.

Current coverage: 7/7 requirements, 14/14 tasks and 16/16 decisions have supporting automated evidence. Task 06-02-02 and 06-03-02 are now green. Automated coverage gaps: 0; escalated implementation defects: 0. Native-client button legibility and Ukrainian naturalness remain pending human verification, with historical waivers and Phase 7/8 scope unchanged.

- [x] G-06-D03 and G-06-D04 have executed passing behavioral assertions.
- [x] Nyquist coverage is compliant; `status: validated`, `nyquist_compliant: true`, `wave_0_complete: true`.
- [x] All automated task/requirement/decision links are recorded with evidence and limitations.
- [ ] Native-client visual and wording acceptance remains human-only and unclaimed.

Files for the orchestrator to commit: `tests/unit/language-navigation.test.ts`, `tests/integration/localization-tracer.test.ts`, and this validation record. No commits were made by the auditor.