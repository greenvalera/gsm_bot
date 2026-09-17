# Roadmap: GSMBot

- ✅ **v1.0 Rehearsal Coordination** — Phases 1–5, 66 plans; completed 2026-09-15 with accepted debt and scoped waivers. [Archived roadmap](milestones/v1.0-ROADMAP.md).

## v1.1 Localization and Ukrainian

**Status:** Phase 6 complete, including native Telegram and user wording acceptance. Phase 7 is ready for discussion and planning.
**Goal:** Deliver a complete Ukrainian Telegram interface with durable administrator-controlled group language and retained English support.

English remains the default. Language selection is available at the beginning of first setup and later in settings. Current language governs subsequent rendering, including queued reminders at delivery; active cards change on their next normal update. Documentation remains English.

## Phases

- [x] **Phase 6: Localization Foundation and Ukrainian Onboarding** — Persistent group language and a complete Ukrainian setup/settings/roster slice. (completed 2026-09-17)
- [ ] **Phase 7: Ukrainian Planning and Lifecycle** — Localized planning, availability, booking, recovery and formatting with safe mid-round switching.
- [ ] **Phase 8: Localized Reminders and Bilingual Verification** — Both reminder streams and complete interface/runtime verification.

## Phase Details

### Phase 6: Localization Foundation and Ukrainian Onboarding

**Goal**: Administrators can select and retain the group's language before configuration exists, and users can complete setup, settings and roster interactions in Ukrainian using shared localization infrastructure.
**Depends on**: Completed v1.0 (Phases 1–5).
**Requirements**: LANG-01, LANG-02, LANG-03, LANG-04, LANG-05, TEXT-01, L10N-01
**Success Criteria**:

1. A new chat starts in English; an administrator can choose Ukrainian at the beginning of /setup and finish all remaining setup prompts in Ukrainian. Choosing a language alone does not make the chat configured.
2. Administrators can view/change language in settings and receive confirmation in the new language; non-administrators cannot change it. Setup/settings/roster text, buttons and their feedback use the selected language.
3. Existing chats remain English until explicitly changed; groups keep independent choices regardless of actors' Telegram language. Preferences survive restart, repeated setup and group migration, including incomplete setup.
4. Maintainers use shared typed English/Ukrainian message contracts through an explicit-locale renderer usable without a Telegram update context; representative background rendering exercises that same interface.
5. Locale-only changes preserve schedule generation, due times and existing domain state. Names, stable identifiers and callback authority remain intact.

**Plans**: 7/7 plans executed

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Persisted-locale settings tracer and blocking migration verification.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — Administrator language selection, first setup and incomplete settings.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-03-PLAN.md — Typed bilingual catalogs and complete Ukrainian setup.
- [x] 06-06-PLAN.md — Preference-only group migration and persistence hardening.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-04-PLAN.md — Ukrainian settings and safe open edits.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-05-PLAN.md — Ukrainian roster display and member actions.

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 06-07-PLAN.md — Localized feedback boundaries and composed bilingual verification.

**Implementation boundaries:** Establish reusable date/plural helpers here as needed by onboarding; Phase 7 owns complete interface formatting acceptance. Translate onboarding errors now; Phase 7 completes the cross-feature help/error inventory. Full worker delivery integration is Phase 8. Prefer independent preference storage; schema details belong to phase planning.

### Phase 7: Ukrainian Planning and Lifecycle

**Goal**: The group can complete the full interactive rehearsal workflow in Ukrainian, with correct calendar/count display and safe language changes during active planning.
**Depends on**: Phase 6
**Requirements**: LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01, LFMT-02
**Success Criteria**:

1. Date/time selection, availability cards, legends, participant status and ownership text are Ukrainian when selected, while retaining English behavior.
2. Readiness-to-book, manual booking, replanning, date/time changes, cancellation and lifecycle recovery are usable in Ukrainian.
3. Existing help/instructions, validation errors, permission denials and stale/duplicate-action feedback use the group language without changing acknowledgement or authorization behavior.
4. Switching language mid-round changes subsequent messages and the next ordinary card update while preserving responses, date/time, ownership and valid controls; both card text and button labels change together.
5. Interface dates use appropriate weekday/month forms and 24-hour time without shifting civil dates or changing authoritative timezones. Counts/durations use correct English/Ukrainian forms, including the specified 0–111 boundary cases.

**Plans**: TBD

**Implementation boundaries:** Keep commands, identifiers and user-entered names unchanged. Translate complete phrases and preserve HTML escaping. Do not proactively rewrite historical messages. Phase 8 applies these formatting helpers to actual reminder delivery and validates end-to-end coverage.

### Phase 8: Localized Reminders and Bilingual Verification

**Goal**: Durable reminders use the current group language and verification demonstrates a complete Ukrainian experience with retained English behavior in the target runtime.
**Depends on**: Phase 7
**Requirements**: LREM-01, LREM-02, L10N-02, L10N-03
**Success Criteria**:

1. Planning-start reminders, including their controls, use the current language even when scheduled before the language changed.
2. Follow-up reminders use the current language with correct date/count formatting, all pending mentions and working navigation; language changes preserve timing and duplicate suppression across recovery paths.
3. Catalog/parameter checks and an outbound-surface inventory detect missing translations and uncovered bot-owned copy, rather than silently treating English fallback as complete Ukrainian support.
4. Bilingual workflow verification covers onboarding through reminders and lifecycle recovery, including access/stale/error paths, long Unicode names, escaping and Telegram output budgets.
5. The compiled target image includes both catalogs and supports Ukrainian Intl behavior. Required affected tests and repository CI checks pass with evidence scoped to the tested revision and existing native waivers preserved.

**Plans**: TBD

## Requirement Coverage

17 approved requirements map to exactly one primary phase: Phase 6 owns 7, Phase 7 owns 6, Phase 8 owns 4. Shared helpers can be introduced earlier and reused later; the named phase owns its requirement's acceptance. See [traceability](REQUIREMENTS.md#traceability).

## Scope Boundaries

No inherited backlog item is added. Any future inclusion needs explicit user selection or a documented localization dependency. Existing waivers remain valid. More languages, per-member preferences, automatic language detection, historical-message rewriting, new help/menu products and automatic booking remain excluded.

## Progress

Execution order: 6 → 7 → 8. All 7 Phase 6 plans are implemented and summarized. Independent verification confirms 34/34 truths, 7/7 requirements and 16/16 decisions; review is clean and Nyquist coverage compliant. Both native acceptance groups passed in 06-UAT.md on 2026-09-17.

| Phase | Milestone | Plans Complete | Status | Completed |
|---|---|---|---|---|
| 6. Localization Foundation and Ukrainian Onboarding | v1.1 | 7/7 | Complete    | 2026-09-17 |
| 7. Ukrainian Planning and Lifecycle | v1.1 | 0/TBD | Not started | — |
| 8. Localized Reminders and Bilingual Verification | v1.1 | 0/TBD | Not started | — |

---
*Last updated: 2026-09-17 after Phase 6 native acceptance and completion.*

