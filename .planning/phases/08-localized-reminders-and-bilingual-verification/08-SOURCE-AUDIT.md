# Phase 8 Source Audit and Planning Decisions

Research was explicitly skipped by the user. No RESEARCH.md or research-derived VALIDATION.md is required or produced. Local source discovery and 08-PATTERNS.md supply implementation evidence. No AI integration, frontend UI-SPEC, schema mutation or new dependency is in scope. Existing PostgreSQL schema and selected group locale remain authoritative. Estimate calibration: factor 1, sample_count 0, confidence low.

## Source coverage

| Source | ID | Scope | Plans | Status |
|---|---|---|---|---|
| GOAL | Phase 8 | Durable current-language reminders; complete Ukrainian and retained English in target runtime | 08-01–05 | COVERED |
| REQ | LREM-01 | Planning-start actual delivery and controls, queued language changes | 08-01,03,05 | COVERED |
| REQ | LREM-02 | Pending-only follow-ups/navigation, timing and duplicate suppression | 08-02,03,05 | COVERED |
| REQ | L10N-02 | Missing catalog/parameters/untranslated surfaces caught automatically | 08-04,05 | COVERED |
| REQ | L10N-03 | Bilingual workflows, Unicode budgets, target catalogs/Intl and CI | 08-02–05 | COVERED |
| RESEARCH | N/A | Explicitly skipped; no source artifact exists | N/A | NOT APPLICABLE |
| CONTEXT | D-01 | Planning reminder phrase | 08-01 | COVERED |
| CONTEXT | D-02 | Start label/permissions | 08-01,03 | COVERED |
| CONTEXT | D-03 | Same/cross-month dates, no year | 08-01 | COVERED |
| CONTEXT | D-04 | One sentence and button below | 08-01 | COVERED |
| CONTEXT | D-05 | Pending reminder phrase | 08-02 | COVERED |
| CONTEXT | D-06 | Full weekday/date and 24-hour range on first line | 08-02 | COVERED |
| CONTEXT | D-07 | Every pending mention inline/stable order | 08-02 | COVERED |
| CONTEXT | D-08 | Saved rehearsal timezone after range | 08-02 | COVERED |
| CONTEXT | D-09 | Supergroup link label/destination | 08-02 | COVERED |
| CONTEXT | D-10 | Basic-group reply instruction | 08-02 | COVERED |
| CONTEXT | D-11 | /plan_status hint | 08-02 | COVERED |
| CONTEXT | D-12 | Hint on separate line only in basic groups | 08-02 | COVERED |
| CONTEXT | D-13 | Native copy review alongside reminder | 08-05 | COVERED |
| CONTEXT | D-14 | New reminders and both locale directions; full automation | 08-03,05 | COVERED |
| CONTEXT | D-15 | One assessable manual scenario at a time | 08-05 | COVERED |
| CONTEXT | D-16 | User accepts wording per scenario | 08-05 | COVERED |

Native execution is a later verify-work activity, not part of planning or the automated execute-phase tasks. The plan produces its explicit runbook and preserves unresolved native acceptance honestly.

## Ten-pair edge probe trace

Nine resolved explicit predicates project to the named plan's must_haves.truths. The one unclassified pair stays a flagged scanner limitation, separate from meaningful requirement tests.

| Pair | Classification | Resolution / acceptance predicate | Projection |
|---|---|---|---|
| LREM-01 / adjacency | resolved / explicit | Work scheduled before either locale switch uses committed locale at render boundary | 08-01 truths; 08-03 task 1 |
| LREM-01 / empty | resolved / explicit | Missing preference yields English; missing Ukrainian key fails strict verification | 08-01 truths; 08-04 task 3 |
| LREM-01 / ordering | resolved / explicit | Duplicate/competing claims attempt once; text and button use same locale | 08-01 truths; 08-03 task 1 |
| LREM-02 / adjacency | resolved / explicit | Queued/recovered follow-up reflects committed locale, same identities and timing | 08-03 truths/task 2 |
| LREM-02 / empty | resolved / explicit | Zero pending means no send; one pending means one mention | 08-02 truths/task 2 |
| LREM-02 / encoding | resolved / explicit | Code-point shortening, escaped HTML, complete mentions or unsendable within 4096 encoded units | 08-02 truths/task 2 |
| LREM-02 / ordering | resolved / explicit | Stable roster order including equal visible names does not depend on locale | 08-02 truths/task 2 |
| L10N-02 / unclassified | unresolved / flagged | Classifier supplied no observable edge condition. Scanner limitation only, never behavioral pass or extra undefined human scenario | 08-04 flagged_assumption |
| L10N-03 / empty | resolved / explicit | Missing/empty runtime catalog fails strict check | 08-04 and 08-05 truths |
| L10N-03 / encoding | resolved / explicit | Complete bilingual workflows preserve escaping, Unicode and 200/4096 budgets | 08-04 and 08-05 truths |

Count invariant: 10 surfaced = 9 explicit truth predicates + 1 flagged assumption.

## Prohibition recall and precision

Stage 1 considered ten candidates per requirement:

- LREM-01: duplicate sends; queued stale locale; schedule drift; wrong group; authorization drift; historical rewriting; language coercion; shaming CTA; extra reminders; false delivery claims.
- LREM-02: dropped mentions; non-pending mentions; reordered participants; broken links; wrong timezone; unsafe labels; added pressure; shaming pending members; bypassed cooldown; misleading recovery.
- L10N-02: hidden missing keys; inventory omissions; blanket exemptions; mismatched parameters; false pass; English treated as complete Ukrainian; rewritten user identities; translation telemetry; forced language; inaccessible copy process.
- L10N-03: fabricated native pass; widened waivers; false revision evidence; missing runtime catalog; unsupported Intl; altered command identities; changed accepted tone; automatic booking implication; secret leakage; changed test fixtures.

Stage 2: duplicate/delivery/format/identity/catalog/inventory/evidence items are engineering predicates already planned. Tone, neutral reminder wording, booking transparency, selected language and waiver honesty are already explicit locked constraints (Phase 6/7 plus D-13–16), preserved in tasks; no new bespoke product prohibition survives. Speculative telemetry/language coercion is outside this phase's source scope. Injection/secrets canon is referred to gsd-secure-phase and existing test/static checks, not minted as a new prohibition. Result: 0 new surfaced prohibitions, 0 projections, 0 hidden judgment gates. No descriptor is fabricated and no new manual copy gate is added beyond D-13–16.

## Dependencies and reachability

| Plan | Needs | Creates / expands | Wave |
|---|---|---|---|
| 08-01 | Existing locale persistence and durable reminders | Production planning delivery, typed keys, calendar ranges | 1 |
| 08-02 | 08-01 catalogs | Actual follow-up delivery/navigation/safety | 2 |
| 08-03 | Both delivery paths | Persisted switches/recovery/claim proof | 3 |
| 08-04 | Complete reminder surface | Migration recovery localization, then strict catalogs and source-to-inventory checks | 4 |
| 08-05 | Inventory and delivery evidence | Cross-workflow gaps, target image, CI evidence, native runbook | 5 |

Source files overlap across delivery plans; inventory is populated only after those seams are settled. Wave 5 consumes complete evidence from all preceding plans. Each new production function is called by existing main/ReminderService paths; tests use those same seams. Runtime smoke runs in Docker/CI. Native runbook is consumed by later gsd-verify-work.

## Assumption delta and workflow boundaries

Revision 1 closes the demonstrated L10N-02/L10N-03 migrated-chat recovery dependency: 08-04 Task 1 owns migration-handler.ts, the typed migration.upgraded en/uk catalog contract and composed-bot tests in tests/integration/chat-migration.test.ts. The persisted chatMigration.newChatId is used only to resolve presentation locale because migrateChat moves chat_language_preferences to that destination. Old-chat commands remain ignored and callbacks remain refused, with exactly one acknowledgement and no forwarded action or domain mutation. 08-04 Tasks 2–3 inventory and strictly sample this surface; 08-05 Task 2 consumes its bilingual evidence. No migration schema/service behavior, new manual scenario or waiver change is planned. Five plans now contain twelve tasks; existing five execution waves and dependencies remain valid, with catalog writes in wave 4 after earlier catalog consumers.

Decision: no-change. Existing Telegram group identity and persisted selected locale remain primary. The detector's fallback term concerns strict missing-translation coverage, not a second tenant, platform or identity. No new API capability integration is introduced; actual existing Telegram sends are extended for presentation only.

No source, package/config, state, old phase artifact, deployment or native fixture was changed during planning. Parent owns final independent checks and commit. Preserve all unrelated workspace changes.

Sizing note: 08-01 task 1 requires six files to traverse the existing three-file typed catalog contract, renderer, production transport and persisted test. Task 2 keeps six files for its atomic catalog contract plus working calendar expansion. This is an explicitly surfaced sizing deviation; no unfinished catalog-only prerequisite is represented as a tracer. All other tasks remain at most five files.
