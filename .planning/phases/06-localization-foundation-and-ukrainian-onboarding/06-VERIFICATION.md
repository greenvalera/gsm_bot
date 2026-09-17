---
phase: 06-localization-foundation-and-ukrainian-onboarding
verified: 2026-09-16T22:00:00Z
status: passed
score: 34/34 must-haves verified
behavior_unverified: 0
overrides_applied: 0
verified_revision: d0eaa531fe5eb48993dc18dc4e72b02299e7ae91
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: "Ukrainian wording and Telegram control legibility"
    expected: "Setup, settings and roster copy is natural informal Ukrainian; approved vocabulary, corrective examples, bilingual language navigation and long policy buttons are readable and understandable."
    why_human: "Catalog assertions establish exact strings and payload bounds, but no native-client rendering or Ukrainian speaker acceptance was observed."
  - test: "Complete the Phase 6 onboarding and language-switch flow in the authorized Telegram test chat"
    expected: "Choose Ukrainian before configuration; complete setup, edit settings and add/remove a roster member; language changes and same-language selection behave correctly, and an older-language prompt or open settings/removal confirmation remains usable with current-language output."
    why_human: "Composed tests use real PostgreSQL with intercepted Telegram transport; they do not prove client presentation and successful interaction through Telegram itself. Preserve existing scoped waivers."
---

# Phase 6: Localization Foundation and Ukrainian Onboarding Verification Report

**Phase Goal:** Administrators can select and retain the group's language before configuration exists, and users can complete setup, settings and roster interactions in Ukrainian using shared localization infrastructure.

**Verified:** 2026-09-16T22:00:00Z  
**Status:** passed  
**Re-verification:** No — initial verification; no previous Phase 6 VERIFICATION.md or overrides existed.  
**Implementation:** `d0eaa53`; production correction baseline `e6f02f0`. The later commit adds tests and validation evidence, not production changes.

The implementation and automated behavior support the phase goal. No implementation blocker was found. Native Telegram acceptance was completed on 2026-09-17: both UAT groups passed through observed Telegram interactions and explicit user wording acceptance. The 34/34 implementation score retains its original automated scope; native evidence is separately recorded in 06-UAT.md and 06-LIVE-TEST-2026-09-17.md.

## Verification Method and Evidence Scope

Read the roadmap, requirements, seven plans/summaries, context, validation, review and security reports, then independently traced production handlers, preference transactions, schema/migration, catalogs and behavioral assertions. Summary completion claims were not used as implementation proof. The active `/gsd-execute-phase 6` workflow owns this report; no source, state, roadmap or requirement tracking was changed and no commit or Telegram message was made.

Evidence shorthand used below:

| ID | Actual evidence and scope |
| --- | --- |
| E1 | `tests/integration/localization-tracer.test.ts`: real migrated PostgreSQL, minted language callbacks, no configuration fabricated, bot reconstruction, independent bigint groups, actor-owned continuation/expiry, explicit English/no-op ordering and persisted cancellation. The orchestrator ran 7/7 at `d0eaa53` (6.80 s); assertions inspected here. |
| E2 | `tests/integration/localized-onboarding.e2e.test.ts`: complete en/uk setup/settings/roster, snapshots of configuration, drafts, roster, planning answers/ownership and reminder due times, open confirmations, reconstructed bot, invalid/foreign/demoted actions and one acknowledgement per click. Included in the orchestrator's fresh 42/42 six-file PostgreSQL regression at `d665c1e`, with production identical to `e6f02f0`. |
| E3 | `tests/integration/chat-language-identity.test.ts` and `chat-migration.test.ts`: real PostgreSQL preference-only/configured transfer, replay, conflict/rollback, reconstructed clients, both migration/selection orderings, retired-ID suppression and migrated draft continuation. Included in that fresh 42/42 regression; transaction and assertions inspected. |
| E4 | `tests/integration/chat-language-migration.test.ts`, `migration-preflight.test.ts`, and the original tracer: recorded 40/40 schema gate at `c173986`. Independently inspected wrapper invocation, disposable URLs, before/all fixtures, two deployments, migrate-status, exact catalog/check/ledger assertions and domain snapshots. This historical migration execution is not relabeled as a new HEAD run. |
| E5 | Fresh orchestrator unit run at `d665c1e`: 552/552, 36 files; typecheck, runtime build and full formatting passed. Independent reviewer additionally ran six targeted suites, 161/161, and closed the recovery finding. The final test-only commit then ran language-navigation 18/18, tracer 7/7 and typecheck. These runs are attributed to their owners, not claimed as verifier reruns. |
| E6 | This verifier's own four named unit checks: timezone-only navigation (2 parameterized cases), older English prompt/current Ukrainian transition, committed-language confirmation after failed preference lookup, and ordinary context-free background rendering: all passed, each command under one second. See commands below. |
| E7 | This verifier imported `dist/shared/i18n/index.js` in Node and asserted the compiled Ukrainian row equals `Мова: Українська`: passed. This proves local compiled output, not the Phase 8 target-image/Intl gate. |

## Goal Achievement

### Observable Truths

The five roadmap criteria remain verbatim below. All 47 plan truth entries were merged with them into 34 distinct predicates; the complete mapping follows the table. Broad roadmap criteria retain their wording while additional decision/edge predicates remain separately visible. No roadmap scope was removed.

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A new chat starts in English; an administrator can choose Ukrainian at the beginning of /setup and finish all remaining setup prompts in Ukrainian. Choosing a language alone does not make the chat configured. | VERIFIED | `setup-handlers.ts:507` checks configuration separately from explicit preference before starting a draft; `language-handlers.ts` persists then navigates. E1 first-choice/zero-configuration assertions and E2 complete en/uk inputs, saved configuration and output assertions. |
| 2 | Administrators can view/change language in settings and receive confirmation in the new language; non-administrators cannot change it. Setup/settings/roster text, buttons and their feedback use the selected language. | VERIFIED | `settings-handlers.ts:439`, `callbacks.ts:552`, `language-handlers.ts:65`; fresh authority precedes dispatch. E2 verifies changed-language feedback, denial, settings edits and roster actions; localization unit suites cover all settings fields and outcome branches (E5). Native quality remains H1/H2 below. |
| 3 | Existing chats remain English until explicitly changed; groups keep independent choices regardless of actors' Telegram language. Preferences survive restart, repeated setup and group migration, including incomplete setup. | VERIFIED | `language-service.ts:10` defaults only absent/unsupported stored locale to English and keys reads by bigint chat; no client-language input. E1 reconstructed bot and independent groups; E3 reconstructed Prisma clients, preference-only migration and continuation; E4 predecessor chat has no preference and is not backfilled. |
| 4 | Maintainers use shared typed English/Ukrainian message contracts through an explicit-locale renderer usable without a Telegram update context; representative background rendering exercises that same interface. | VERIFIED | `shared/i18n/index.ts` exports mapped `MessageCatalog`, `MessageParameters` and `renderMessage(locale,key,params)`; both catalogs satisfy it. `i18n.test.ts:113` checks literal en/uk background output without ctx; rerun passed (E6). Actual workers are Phase 8. |
| 5 | Locale-only changes preserve schedule generation, due times and existing domain state. Names, stable identifiers and callback authority remain intact. | VERIFIED | `LanguageService.select/accept` writes only preference and the accepted callback claim. E2 exact before/after snapshots include revisions, drafts, roster, rounds/participants and reminder occurrences; E3 checks configuration/reminder/draft equality; Unicode renderer and callback authority tests supply identity/bounds assertions. |
| 6 | Implicit English is distinguishable from explicit English; each bigint chat identity owns its preference. | VERIFIED | Independent `ChatLanguagePreference` PK, `explicitlySelected` and no configuration FK; `select` writes the initial marker even for English. E1 separate bigint rows, E3/E5 first-selection and unchanged-timestamp tests. |
| 7 | Committed schema deployment precedes behavior checks; upgrade preserves existing domain rows and repeat deployment remains valid. | VERIFIED | `tests/helpers/postgres.ts` applies committed migrations; `prisma/migrate-deploy.mjs:919` checks preference catalog. E4 snapshots eight domain collections, runs wrapper twice and migrate-status, and rejects invalid locale/check drift. |
| 8 | Equal locale values in two chats remain separately owned preferences. | VERIFIED | `localization-tracer.test.ts:100` creates distinct bigint chat identities and checks their separately owned English rows; E1 passed. Production reads/writes never key by locale. |
| 9 | Repeated /setup uses saved language and resumes a valid actor-owned draft. | VERIFIED | `handleSetupCommand` calls `requireActive(chatId,actorId)` before `continueSetup`; E1 asserts persisted draft ID survives reconstructed repeated setup. |
| 10 | Language change is offered on the timezone step only, and settings permits changing it before setup completes. | VERIFIED | `buildStepMessage` gates navigation on `draft.timezone === null`; incomplete settings mints language controls. `language-navigation.test.ts:58` progresses every remaining field/substep/review and rejects both label and minted action; E6 both locales passed. |
| 11 | Incomplete settings exposes language/change/Continue setup, without editable schedule data or creating configuration. | VERIFIED | `handleSettingsCommand` separates `not-configured` from `committed`, renders only language row and two actions. E1/E2 check absent configuration; language-navigation checks language/Continue and absence of dashboard. |
| 12 | Language navigation is always Мова / Language; choices remain English / Українська. | VERIFIED | Both catalogs have identical `language.entry`/language-name phrases; language/settings/setup handlers consume them. Literal keyboard checks in E1/E2 and language-navigation. |
| 13 | Already-explicit same-language choice returns to settings with one bare acknowledgement, no extra confirmation and no preference write/timestamp change. | VERIFIED | `select` skips upsert when current explicit locale matches; dispatcher only adds confirmation for `changed`; boundary fallback answers once. E2 compares complete preference row and undefined answer text; E3/E5 preserve timestamps. |
| 14 | Last accepted still-valid explicit selection wins, preserving authorization, actor/chat, expiry and consumption safeguards. | VERIFIED | `LanguageService.accept` transaction checks row bindings, parses strict target and atomically claims token; advisory lock serializes accepted writes. E1/E2 two administrators use previously minted screens; expired/foreign/consumed/demoted actions are rejected with no preference change. |
| 15 | Continue setup preserves the actor's valid draft values and renders current language; expiry restarts with saved language without taking over another actor. | VERIFIED | `continueSetup` delegates to `beginOrResume(chatId,actorId,now)`; E1 checks values, two separate actor drafts and expiry replacement in Ukrainian; E3 migrated owner continuation. |
| 16 | Final review includes the localized language row; cancellation/expiry retains the preference. | VERIFIED | `renderSetupReview` includes `language.row`; E1 cancellation uses actual minted cancel, verifies draft deletion/no configuration/exact preference equality and reconstructed Ukrainian setup. Expiry continuation retains saved language. Literal review assertion in `i18n.test.ts:75`. |
| 17 | Ukrainian setup instructions use informal singular Обери/Надішли. | VERIFIED | `uk.ts` setup/timezone instructions contain the approved forms; language-navigation and i18n assertions exercise output. This verifies selected wording, not unobserved human naturalness (H1). |
| 18 | Approved Ukrainian planning-access question/three labels map to unchanged policies. | VERIFIED | `uk.ts` exact D-11 phrases; `keyboards.ts` maps to unchanged `ADMINS_ONLY`, `PREVIOUS_PARTICIPANTS`, `ANYONE_IN_CHAT`, one row each. `language-navigation.test.ts:203` asserts literal labels; E2 saves original policy. |
| 19 | Invalid onboarding input gives conversational corrective feedback and examples. | VERIFIED | `uk.ts` input keys; setup and settings parsers route errors to them. `language-navigation.test.ts:151` asserts exact 19:30 example; settings-localization covers duration/reminder/schedule failures. E5 passed. |
| 20 | Older-language setup replies remain valid and the next step uses current language. | VERIFIED | `handleSetupText` applies durable transition before `replyWithStep` reads preference. Named test at `language-navigation.test.ts:131` verifies 1170 stored and Ukrainian step 4; E6 passed. |
| 21 | Incomplete setup renders its current step; empty optional collections retain their established meaning. | VERIFIED | `renderSetupStep` branches on missing fields and existing reminder empty/sentinel states; `i18n.test.ts:87` exercises eight steps; setup tests and E2 cover default reminders through real input. Empty roster is independently covered by truth 29. |
| 22 | Every declared key has nonempty en/uk entries with the same parameter contract; missing/wrong parameters fail typecheck. | VERIFIED | Both catalogs use `satisfies MessageCatalog`; no missing-key fallback. `i18n.test.ts:49` loops all entries, checks key equality/nonempty/no undefined; compile-only `@ts-expect-error` unknown/missing/wrong payload cases are included by typecheck (E5). |
| 23 | Ukrainian survives compiled source and Unicode dynamic parameters retain identity. | VERIFIED | E7 executes compiled literal equality; i18n UTF-8 round-trip and escaping checks plus roster Cyrillic/astral/combining examples (E5). |
| 24 | Open schedule confirmations remain valid after language-only change, obey existing revision rules and respond in current language. | VERIFIED | Language writes do not modify `SettingsEditDraft.expectedRevision`; settings dispatcher still invokes `saveChange`/`keepCurrent`. E2 saves an earlier-language token after switch/reconstruction; settings-localization tests both directions and real conflicts/expiry/other actors (E5). |
| 25 | Roster uses Склад гурту and Додати учасника with existing commands/workflow. | VERIFIED | `uk.ts` exact roster keys; roster projections/keyboard consume them and `/roster_add` remains the entry command. Roster-rendering and roster-localization literal/output tests plus E2. |
| 26 | Roster instructions use informal singular wording and retain corrective guidance. | VERIFIED | `roster.addHint/addUsage` use Відповідай with unchanged command; missing/bot target tests verify guidance, failed-add tests retain failure recovery. E5. Human tone judgment remains H1. |
| 27 | Existing removal confirmation survives language-only change and responds in current language. | VERIFIED | `dispatchRosterCallback` keeps stored token/member identity, executes domain operation then resolves locale. E2 uses an open removal after switch/restart; roster-localization exercises remove/keep and genuine removed-member race. |
| 28 | Cyrillic, astral and HTML-sensitive names preserve identity and escaping under existing message/alert/control budgets; callback data stays at most 64 UTF-8 bytes. | VERIFIED | `localizedMemberLabel` escapes exactly once; roster sorting/member bindings are unchanged. `roster-rendering.test.ts:319` checks cross-locale hostile Unicode/page text limits and minted callback bytes; constant feedback alerts do not embed unbounded names. E2 token helper checks every clicked control's byte budget. Scope is existing representative budgets, not a new universal name-length guarantee. |
| 29 | Empty, single-member and paginated rosters retain navigation and membership semantics in both locales. | VERIFIED | `projectRoster` reads `listActive`, paginates and binds actions to returned membership IDs; no hardcoded member data. Roster boundary/localization tests and E2 21-member next/previous/remove flow verify contents/count. |
| 30 | Replaying the same old/new migration pair preserves transferred preference without mutation. | VERIFIED | `migration-service.ts` recognizes completed pair before destination checks. E3 `transfers preference-only ... exactly and replays without mutation` compares entire transferred en/uk rows including timestamps. |
| 31 | Preference/domain transfer and tombstone commit atomically; delayed old-chat selections stay suppressed. | VERIFIED | Migration and selection take compatible advisory/ledger locks, transaction transfers preferences, then creates tombstone; selection checks it before callback/preference mutation. E3 real lock-wait ordering and injected rollback assertions, plus old-ID rejection. |
| 32 | Destination-owned preference causes fail-closed conflict, not overwrite. | VERIFIED | Migration counts destination preferences before transfer. E3 asserts both source/destination rows, source draft and absent tombstone after rejection, including destination-selection race. |
| 33 | Preference migration retains setup ownership/values and prior invalidation of old-message callbacks. | VERIFIED | Migration updates draft chat IDs, consumes/expires old callbacks and retains actor/value fields. E3 composed migrated settings/setup and existing configured migration regression inspect these outcomes. |
| 34 | Onboarding denials, malformed/stale/expired actions and operational feedback use current locale with exactly one acknowledgement. | VERIFIED | `callbacks.ts` resolves from actual update chat and guards one answer/final fallback; handlers use catalog feedback. `presentation-locale.ts` preserves failure reporting with last-known/English fallback only when lookup is unavailable. E5 boundary/outage suites and E6 committed-Ukrainian failed-read regression passed; fallback is not used to claim missing translation coverage. |

**Score:** 34/34 distinct truths verified; 0 present-but-behavior-unverified. **Human acceptance:** 2 outstanding items. All behavior predicates have executed tests and substantive production wiring; no behavior truth was upgraded from symbol presence alone.

### Full Plan Must-Have Accounting

`Tn` means the nth frontmatter truth in that plan; the numbers on the right refer to the table above. This accounts for 47/47 plan entries, including repeated requirements, without inflating the score for duplicate wording.

| Plan | Complete truth mapping |
| --- | --- |
| 06-01 | T1→3; T2→6; T3→7; T4→3; T5→8; T6→1,3 |
| 06-02 | T1→1; T2→9; T3→10; T4→2; T5→11; T6→12; T7→13; T8→14; T9→15; T10→13; T11→11; T12→14; T13→3 |
| 06-03 | T1→16; T2→17; T3→18; T4→19; T5→20; T6→21; T7→22; T8→23; T9→4 |
| 06-04 | T1→24; T2→2; T3→2,13; T4→5 |
| 06-05 | T1→25; T2→26; T3→27; T4→28; T5→29 |
| 06-06 | T1→30; T2→31; T3→3; T4→32; T5→33 |
| 06-07 | T1→34; T2→20,24,27; T3→14; T4→5; T5→1,2,4 |

No plan declares a `must_haves.prohibitions` item, `verification: backstop` truth or deferred `<human-check>` block. The two unclassified edge-probe assumptions add no independent predicate; approved LANG-01/LANG-03 and D-01 define their tested acceptance, rather than treating the classifier output as evidence.

### Required Artifacts

The artifact query passed all 28 declarations across seven plans (18 unique required paths). Source inspection then checked substance and consumers rather than accepting that existence result alone.

| Artifact | Expected implementation / actual consumer | Status |
| --- | --- | --- |
| `prisma/schema.prisma` | Independent bigint preference model; generated client supplies delegate used by LanguageService | VERIFIED |
| `prisma/migrations/20260916180000_chat_language_preferences/migration.sql` | Real table, PK, timestamps, explicit marker and en/uk CHECK; migration helper/wrapper deploy it | VERIFIED |
| `prisma/migrate-deploy.mjs` | Ordered ledger and exact preference catalog; package `db:migrate:deploy` and E4 use it | VERIFIED |
| `src/shared/i18n/index.ts` | Typed renderer, catalogs and explicit-locale helpers; Telegram projections and background-style calls consume them | VERIFIED |
| `src/shared/i18n/en.ts` | Complete English catalog imported into renderer | VERIFIED |
| `src/shared/i18n/uk.ts` | Complete Ukrainian catalog imported into renderer | VERIFIED |
| `src/domain/chat/language-service.ts` | Durable resolution/selection, transactional token acceptance and identity guard; all phase controllers use it | VERIFIED |
| `src/telegram/language-handlers.ts` | Bound action creation, language keyboard and dispatch; setup/settings/callback router invoke it | VERIFIED |
| `src/shared/callback-schema.ts` | Strict supported language target union and opaque tokens; creator and dispatcher validate targets | VERIFIED |
| `src/telegram/callbacks.ts` | Live registered authority/acknowledgement boundary and language dispatch | VERIFIED |
| `src/telegram/setup-handlers.ts` | First-choice gate, actor-owned wizard, localized current-step/outcome rendering; central commands/text/location/callbacks call it | VERIFIED |
| `src/telegram/settings-handlers.ts` | Separate incomplete/committed settings plus unchanged durable edit routes; central handlers/callbacks call it | VERIFIED |
| `src/telegram/renderers.ts` | Localized data projections from draft/configuration values; setup/settings handlers pass explicit locale | VERIFIED |
| `src/telegram/keyboards.ts` | Localized labels with stable actions; production migrated callers pass locale or already-localized rows | VERIFIED |
| `src/telegram/roster-renderers.ts` | Real member projections, safe names and translated surrounding copy; roster handlers consume it | VERIFIED |
| `src/telegram/roster-handlers.ts` | Durable list/add/remove/paging, current-locale outcomes; central commands and callback route invoke it | VERIFIED |
| `src/domain/chat/migration-service.ts` | Locked transactional transfer/conflict/idempotency; migration middleware invokes `migrateChat` | VERIFIED |
| `src/telegram/handlers.ts` | Registers setup/settings/roster carriers and protected callback table; `create-bot.ts:70` calls registration | VERIFIED |

Additional correction artifact `src/telegram/presentation-locale.ts` is imported and called by feedback/controllers; it catches presentation lookup failure without granting authority. Generated Prisma client/model exports include the new delegate, closing the original generated-source review finding. Compatibility defaults in pure helpers remain for untouched later-phase callers; inspected Phase 6 production rendering call sites pass locale explicitly, including internal settings/access projections. English setup constants are relabeled through `localizedButtons` before emission.

### Key Link Verification

The generic key-link query returned 0/13 because it searched target path strings that are not literal source references: this TypeScript project imports relative `.js` specifiers, and some planned links are schema/service transitive relationships. Those heuristic misses were resolved by the concrete import/call/transaction traces below, not waived.

| Plan | From → To | Verified wiring |
| --- | --- | --- |
| 01 | settings handler → i18n | Imports `renderMessage`; language-only/dashboard branches call `language.row` with resolved locale |
| 01 | preference schema → settings | Generated delegate → `LanguageService.resolve.findUnique({where:{chatId}})` → `resolvePresentationLocale` → settings text |
| 02 | callbacks → language handler | `SETTINGS_EDIT` checks `parseLanguageTarget` after boundary authorization/binding, then calls `dispatchLanguageCallback` |
| 02 | language handler → service | Calls transactional `accept`, awaits result, resolves response locale and performs destination navigation |
| 03 | setup handler → renderers | `buildStepMessage` passes resolved locale to `renderSetupStep`; committed configuration receives locale after save |
| 03 | i18n index → Ukrainian catalog | Imports `uk` and includes it in `Record<Locale,MessageCatalog>`; catalog independently satisfies mapped contract |
| 04 | settings handler → renderers | Dashboard, edit, review and result branches pass `currentLocale` result |
| 04 | settings handler → settings service | Keeps existing draft/save/keep methods and revision contracts; language route bypasses schedule mutation |
| 05 | roster handler → roster renderer | `listActive` values flow through pagination/localized labels; awaited writes precede outcome locale lookup |
| 06 | migration → preference schema | Locks/counts real preference table then parameterized UPDATE inside existing transaction |
| 06 | language service ↔ migration | Shared per-chat advisory lock and migration-ledger lock order; tombstone check prevents retired-ID recreation |
| 07 | callbacks → language resolution | `resolveFeedback` uses presentation resolver backed by LanguageService and actual update chat; one-answer guard remains active |
| 07 | composed test → createBot | Imports actual `createBot`, passes migrated Prisma client and only intercepts outbound Telegram transport/role gateway |

**Wiring:** 13/13 manually verified; no missing or orphaned phase link.

### Data-Flow Trace (Level 4)

| Rendered artifact | Data source and propagation | Status |
| --- | --- | --- |
| Language row, selection outcome and localized feedback | PostgreSQL `chatLanguagePreference.findUnique(chatId)` / committed `accept` result → explicit locale → typed catalog → reply/edit/answer | FLOWING |
| Setup prompts/review/saved summary | `SetupService.requireActive/beginOrResume/setScheduleField/saveConfiguration` → actual draft/configuration → explicit-locale renderer → Telegram | FLOWING |
| Settings dashboard/review | `SettingsService.getCommitted/selectValue/saveChange` and actor draft → projection/keyboard → Telegram | FLOWING |
| Roster pages/removal confirmation | `RosterService.listActive/beginRemoval` → actual member IDs/names → pagination/escaping → bound actions plus localized projection | FLOWING |
| Context-free representative | Explicit locale and ordinary duration/settings values → same renderer without ctx | VERIFIED pure rendering contract; no claim of worker integration |

Static catalog phrases are intentional translations, not substitutes for domain data. Empty roster/configuration branches are driven by actual repository outcomes. Presentation fallback on a database outage is an explicit recovery path, not missing-key fallback.

### Behavioral Spot-Checks

The following commands were run independently by this verifier from the repository root using Node 24.19.0 at `C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`. `node` below denotes that executable. Name filtering accounts for Vitest's reported nonselected/skipped cases; there are no source-disabled tests in the scanned requirement files.

| Behavior | Command | Result |
| --- | --- | --- |
| Language entry only at timezone | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/language-navigation.test.ts -t 'offers language changes only on the timezone step'` | PASS; 2 cases, 578 ms |
| Older prompt advances under current locale | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/language-navigation.test.ts -t 'accepts an old English prompt'` | PASS; 1 case, 556 ms |
| Committed language survives failed final lookup | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/onboarding-feedback.test.ts -t 'confirms the committed language'` | PASS; 1 case, 946 ms |
| Background renderer uses ordinary data | `node node_modules/vitest/vitest.mjs run --project unit tests/unit/i18n.test.ts -t 'renders ordinary background payload data'` | PASS; 1 case, 392 ms |
| Compiled Ukrainian encoding | Node ESM import of `./dist/shared/i18n/index.js`, exact `renderMessage('uk','language.row',undefined) === 'Мова: Українська'` assertion | PASS; printed expected Ukrainian text |

No server was started, database mutated or full suite duplicated by this verifier. E1–E5 retain the owners/revisions of their executed behavioral proof.

### Probe Execution

Not applicable: no phase-declared shell probe or conventional `scripts/**/probe-*.sh` was found. `06-EDGE-PROBE.json` is planning classifier data, not an executable verification probe. The runnable migration contract is the Vitest/wrapper evidence in E4; it is explicitly retained at its tested revision.

### Requirements Coverage

All seven Phase 6 requirement IDs appear in plan frontmatter; the REQUIREMENTS traceability table assigns no additional orphan requirement to this phase. Satisfaction below is implementation/automated scope; human release acceptance remains open for the Telegram-facing slice.

| Requirement | Source plans | Description | Status and evidence |
| --- | --- | --- | --- |
| LANG-01 | 02,03,07 | Early English/Ukrainian choice and remaining setup before configuration | SATISFIED in code/automation: truths 1,9,10,15–20; E1/E2/E6. Native flow H2 pending. |
| LANG-02 | 02,04,07 | Admin settings change/new-language confirmation; non-admin denial | SATISFIED in code/automation: truths 2,11–14,24,34; E1/E2/E5. |
| LANG-03 | 01,02,03,06,07 | English default for old/new chats | SATISFIED: truths 3,6,7; absence default, no backfill and E1/E4. |
| LANG-04 | 01–07 | Independent selected group language despite actor client language | SATISFIED for Phase 6 surfaces: truths 2,3,8,14,20,24,27,34; E1/E2. Phase 7/8 own the explicitly deferred surfaces. |
| LANG-05 | 01,02,06,07 | Restart/repeat/migration durability including incomplete setup | SATISFIED: truths 3,9,15,16,30–33; E1/E3 and durable PostgreSQL schema. |
| TEXT-01 | 03,04,05,07 | Ukrainian setup/settings/roster prompts, summaries and controls | SATISFIED in code/automation: truths 1,2,16–29,34; complete composed flow and literal copy assertions. Human wording/legibility H1 and native flow H2 pending. |
| L10N-01 | 01,03,07 | Shared key/parameter catalogs for interactive/background rendering | SATISFIED: truths 4,22,23; mapped contracts, compile misuse checks, E6/E7. |

**Coverage:** 7/7 IDs accounted for; 0 orphaned. No requirement tracking checkbox was changed.

### Decision Coverage

`gsd-tools.cjs query check.decision-coverage-verify` returned: **All trackable CONTEXT.md decisions are honored by shipped artifacts.** Result: `honored: 16`, `total: 16`, `not_honored: []`, `blocking: false`.

The heuristic result was supplemented with source/assertion checks:

| Decision | Concrete verified predicate |
| --- | --- |
| D-01 | Truth 1: initial English choice immediately advances without configuration |
| D-02 | Truth 9: repeated actor draft resumes in saved locale |
| D-03 | Truth 10: timezone-only entry; both-locale negative later-step regression added in `d0eaa53` |
| D-04 | Truth 16: review row and exact persisted preference equality across actual cancellation |
| D-05 | Truth 2: immediate changed-language confirmation/settings return |
| D-06 | Truth 11: incomplete language-only settings |
| D-07 | Truth 12: exact bilingual recovery entry and recognizable choices |
| D-08 | Truth 13: same-locale no mutation/extra feedback, one acknowledgement |
| D-09 | Truths 17,26: informal literal copy; human naturalness remains H1 |
| D-10 | Truth 25: exact roster vocabulary |
| D-11 | Truth 18: approved policy question/labels and stable values |
| D-12 | Truths 19,26: conversational correction and examples |
| D-13 | Truth 20: old prompt accepted, current-locale next step |
| D-14 | Truth 14: valid screen ordering and retained rejection boundaries |
| D-15 | Truths 24,27: open settings/removal confirmation remains valid |
| D-16 | Truth 15: values/actor ownership retained, saved-language expiry restart |

### Test Quality Audit

Scanned every plan-linked test file for disabled tests and expected-output file writers: no `.skip`, `.todo`, `xit`/`xdescribe`, or circular fixture-writing patterns found. Vitest includes the unit/integration paths; compile misuse checks are intentionally compile-only. No external comparison/parity oracle is required by this phase.

| Test group | Linked requirements | Active | Source-skipped | Assertion strength / assessment |
| --- | --- | --- | --- | --- |
| localization-tracer, localized-onboarding.e2e | LANG-01–05, TEXT-01 | Yes | 0 | Behavioral: minted callbacks, SQL state, complete flows, exact before/after snapshots and ack counts |
| chat-language-identity, chat-migration | LANG-03–05 | Yes | 0 | Behavioral: real transactional interleavings, conflict/rollback, preserved rows, reconstructed clients |
| chat-language-migration, migration-preflight | LANG-03/05 | Yes | 0 | Behavioral/value: real committed deployment and catalog/ledger/data equality |
| language-selection, chat-language-service, language-navigation | LANG-01–05, TEXT-01 | Yes | 0 | Value/behavioral: no-write timestamps, typed targets, actor binding, current-locale transitions and negative entry assertions |
| i18n, timezone-prompt-copy, setup | TEXT-01, L10N-01 | Yes | 0 | Literal value, key completeness, compile-negative parameter checks and wizard behavior |
| settings-localization, settings, settings-dashboard-keyboard, schedule-settings | LANG-02/04, TEXT-01 | Yes | 0 | Behavioral/value: every field, open confirmations, genuine revision/expiry/actor invalidity and localized output |
| roster-rendering, roster-localization, roster-add, roster-remove | LANG-04, TEXT-01 | Yes | 0 | Behavioral/value: actual member bindings, Unicode escaping/bounds, pagination and remove/keep outcomes |
| onboarding-feedback, callback-authority and routing/logging regressions | LANG-02/04, TEXT-01 | Yes | 0 | Behavioral: actual-chat locale, denial effects, one ack, failed persistence and locale-read recovery |

**Disconfirmation checks:** Catalog-derived expected strings in the composed helper establish routing/locale selection, not independent translation correctness. Literal D-07/D-10/D-11/D-12 assertions and catalog review supplement them; naturalness stays human. The cancellation test seeds completed draft fields to reach the real cancellation boundary; E2 separately proves ordinary input completion, so the fixture does not supply a missing production precondition. Inspected failure paths include database mutation plus preference-read failure, genuine settings conflicts and removed-member races. No uncovered behavior invariant or coincidental-reliance predicate was identified. The prior D-03/D-04 assertion gaps now have executed tests; neither remains open.

### Anti-Patterns Found

| File/surface | Pattern | Severity | Assessment |
| --- | --- | --- | --- |
| Phase-modified production/test files | No unreferenced TBD/FIXME/XXX, TODO/HACK/PLACEHOLDER or implementation placeholder found | None | No debt-marker blocker |
| `prisma/migrate-deploy.mjs` | Intentional empty catalog for a pre-core schema and console status output | Info | Real deployment validation surrounds these branches; not a stub |
| Test fakes | Null/empty returns model absent preferences, empty rosters and failure fixtures | Info | Other paths populate actual results; not disconnected production data |
| Catalog-derived composed assertions | Same renderer helps select localized controls | Info | Proves wiring, not wording quality; literal tests plus H1 prevent a false native acceptance claim |

The clean follow-up code review reports zero open findings; its two historical issues are closed by generated-client tracking and the presentation recovery fixes. The security report closes 28/28 authored mitigations at its stated scope. This verifier traced the corrected authority/recovery paths but does not relabel that scoped audit as a comprehensive new security assessment.

### Deferred Scope Check

No Phase 6 failure was hidden by deferral. The roadmap specifically assigns full planning/lifecycle/help/error and date/plural acceptance to Phase 7, and actual reminder delivery, outbound inventory, full bilingual workflow and target-image/Intl verification to Phase 8. Those are future obligations, not failed Phase 6 predicates. In particular, a context-free representative render is verified here; translated reminder workers are not claimed.

### Human Verification Required

This phase includes an actual Telegram interface despite “Foundation” in its name. The infrastructure-only UAT exemption does not apply. Both items below are **UNCERTAIN / WARNING pending human decision**, not demonstrated implementation failures.

#### H1. Ukrainian naturalness and native control legibility

**Test:** Review the Ukrainian setup prompts/review, settings dashboard/edit/error copy and roster add/remove wording in the authorized Telegram test chat. Inspect the bilingual language entry and all three long planning-access labels at normal client width.

**Expected:** Natural informal singular wording, approved roster/access vocabulary, understandable corrective examples and readable controls without misleading truncation or malformed formatting.

**Why human:** Exact string, Unicode and representative budget tests cannot establish human wording quality or client layout. No Phase 6 native-client screenshots/observations were supplied.

#### H2. Native Phase 6 onboarding and switch continuity

**Test:** In the authorized test chat, choose Ukrainian on first setup, complete the wizard, edit a setting and add/remove a member. Use Мова / Language to switch and select the current language again. Answer an older-language prompt and complete an already-open settings or removal confirmation after switching. Compare the resulting English/Ukrainian navigation and feedback.

**Expected:** Choice works before configuration, setup can finish in Ukrainian, changed-language confirmation is readable, same-language selection is silent beyond acknowledgement, and valid older controls finish in current language without losing input or requiring another confirmation.

**Why human:** PostgreSQL/composed tests prove durable state and outbound payloads while intercepting Telegram. They do not show the actual client interaction or server-delivered interface. Do not create a new large-account pagination, third-account, phone, morning-reminder or other historical waiver requirement to perform this check.

Historical v1.0 waivers remain exactly scoped as recorded in `milestones/v1.0-MILESTONE-AUDIT.md` and their UAT sources: the 20+ account roster exercise, Phase 4 third-account/phone variants and scoped Phase 5 native checks are not reopened or silently converted into observed passes. No new Phase 6 waiver is inferred from them. Any acceptance or further test action belongs to the end-of-phase human checkpoint.

### Gaps Summary

**Implementation blockers:** 0. **Behavior-unverified invariants:** 0. **Human items:** 2. **Overall status:** `human_needed` because the human verification section is nonempty. All 5 roadmap criteria, 47 plan truth entries, 7 requirements and 16 decisions have explicit implementation/automated evidence, with duplicate truths scored once. Native acceptance remains unclaimed; next action is the scoped Phase 6 human verification checkpoint, not phase completion.

---

_Verified: 2026-09-16T22:00:00Z_  
_Verifier: gsd-verifier_

## Native acceptance closure — 2026-09-17

H1 and H2 are resolved: native onboarding, language continuity, settings and roster actions were observed; the user accepted Ukrainian wording and retained the secondary test configuration. UAT is complete (2/2 passed, no issues or waivers). Earlier pending statements in the original dated assessment are historical and superseded by this closure. Original automated revision and evidence provenance remain unchanged. Overall verification status: passed.

