# Phase 6: Localization Foundation and Ukrainian Onboarding - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver persistent administrator-controlled group language before configuration exists, shared typed English/Ukrainian localization infrastructure, and complete Ukrainian setup, settings and roster interactions. Requirements: LANG-01 through LANG-05, TEXT-01 and L10N-01.

English remains the default until explicit selection. Language is independent of setup completion and survives restart, repeated setup and group migration. Preserve domain state, schedule generation, due times, names, command tokens, stable identifiers and callback authorization. Provide an explicit-locale renderer usable without a Telegram update context, including representative background rendering.

Phase 7 owns full planning/lifecycle translation, cross-feature help/errors, complete date/plural acceptance and mid-round card switching. Phase 8 owns actual reminder delivery localization and complete bilingual coverage/runtime verification. Introduce date/plural helpers here as onboarding needs them. Discussion of unfinished actions here applies to setup/settings/roster and must not pull later-phase delivery into Phase 6.
</domain>

<decisions>
## Implementation Decisions

### Language selection during setup

- **D-01:** First `/setup` begins with a separate language-selection screen using recognizable **English / Українська** buttons. The initial prompt is English. Selecting a language immediately persists it and advances to timezone setup; no separate Continue gesture is required.
- **D-02:** Repeated `/setup` uses the saved language without asking again and resumes the current step while the draft remains valid. Setup repetition never resets the language implicitly.
- **D-03:** Offer a language-change button on the timezone step immediately after selection, but not on every subsequent setup step. Later changes go through `/settings`, which must support language changes before configuration is complete.
- **D-04:** Include a simple localized language row in the final setup review, such as **Мова: Українська**, without explaining that language was already saved. The independent persistence requirement still applies if the rest of setup is cancelled or expires.

### Changing language in settings

- **D-05:** Selecting a different language applies it immediately, returns to settings, and shows successful-change confirmation in the newly selected language. Do not insert a Save/Cancel review step for language changes.
- **D-06:** Before initial configuration is complete, `/settings` shows the current language, its change control, and **Continue setup**. Other settings become available after setup completes; do not render a full editable dashboard from incomplete schedule data.
- **D-07:** Always label the language-change entry **Мова / Language**, regardless of group language. Choices remain **English / Українська**. This is the user's corrected final selection and supersedes the initially selected localized-only label. The review's language row in D-04 is distinct from this navigation entry.
- **D-08:** Selecting the already-current language simply returns to settings without an additional message or repeat mutation. Continue to acknowledge the callback under the existing exactly-once acknowledgement contract; silence means no extra user-facing feedback, not an unacknowledged callback.

### Ukrainian wording and tone

- **D-09:** Use informal singular **ти** address: **Обери**, **Надішли**, rather than formal/plural imperatives or impersonal headings as instructions.
- **D-10:** Use **Склад гурту** for the roster heading and **Додати учасника** for the add-member label. Translate existing surfaces without adding a new roster workflow or changing command tokens.
- **D-11:** Phrase the planning-access prompt as **Хто може запропонувати репетицію?** The offered choices are **Лише адміністратори**, **Учасники попереднього планування**, and **Усі в чаті**. These are presentation labels for existing access policies, not a change to authorization semantics.
- **D-12:** Invalid-input feedback uses a conversational introduction followed by a corrective example, such as **Ой, не вдалося розібрати час. Спробуй так: 19:30.** This decision concerns input errors; no separate tone choice for operational failures or access denials was elicited.

### Switching during unfinished edits

- **D-13:** When a user answers an older-language prompt after the group language changes, accept the input under normal rules and render the next step in the current language. Do not add a language-change explanation or language suffix to the heading.
- **D-14:** A still-valid language-selection screen can apply its selected language even if another administrator changed the language since that screen opened. The last explicit valid selection determines group language. Recheck current administrator authorization and ordinary token validity; this is not permission to accept expired, consumed or otherwise invalid actions.
- **D-15:** A language-only change does not invalidate an already-open confirmation for another action, such as changing a time or removing a roster member. Execute under the existing validity, revision and authorization rules, then render the result in the current language. Do not require a second confirmation solely because the language changed.
- **D-16:** **Continue setup** displays the current step in the current group language while preserving entered values. If the draft expired, start setup again using the saved language. Preserve existing actor/ownership rules; discussion did not authorize taking over another administrator's draft.

### Agent Discretion and Research Responsibilities

No additional product choices were explicitly delegated. Research and planning determine preference storage, localization library/catalog structure, typed parameters, migration design and testing within the requirements above. Prefer independent preference storage as stated in the roadmap.

Keep language changes independent of schedule revisions and draft invalidation so D-14/D-15 coexist with existing safeguards. Inspect incomplete-setup routing, draft ownership and expiration before designing Continue setup. Resolve current language at rendering boundaries; do not proactively rewrite historical messages or recall an in-flight send. Preserve English behavior, safe dynamic-name rendering, output budgets and the existing acknowledgement contract. Exact copy beyond the selected labels/examples must follow the chosen tone and retain required operational meaning.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance

- `.planning/ROADMAP.md` — Phase 6 success criteria, shared-renderer requirement and Phase 7/8 boundaries.
- `.planning/REQUIREMENTS.md` — approved localization requirements and acceptance boundaries, including independent language persistence, safe switching and exclusions.
- `.planning/PROJECT.md` — Telegram-only workflow, roster constraints, runtime portability, English documentation and the superseding exactly-once callback acknowledgement decision.
- `.planning/STATE.md` — current milestone position and existing deferred work; do not reopen historical waivers or import backlog automatically.

### Prior behavior to preserve

- `.planning/milestones/v1.0-phases/03-availability-and-booking-decision/03-CONTEXT.md` — safe names, participant snapshot authority, current authorization and separate card/announcement identities.
- `.planning/milestones/v1.0-phases/04-replanning-and-rehearsal-lifecycle/04-CONTEXT.md` — lifecycle validity and recovery; language is presentation, not a lifecycle transition.
- `.planning/milestones/v1.0-phases/05-proactive-reliable-reminders/05-CONTEXT.md` — reminder schedule, cooldown and recovery decisions that language-only changes must preserve. Actual worker translation remains Phase 8.

### Implementation seams

- `src/telegram/renderers.ts` — setup steps, review, committed configuration, settings dashboard and edit/review rendering.
- `src/telegram/keyboards.ts` — setup/settings labels and stable action values; preserve intentional row layouts for long policy labels.
- `src/telegram/setup-handlers.ts` — setup prompts, validation feedback, draft expiry and timezone handling.
- `src/telegram/settings-handlers.ts` — dashboard routing, per-actor edit drafts and confirmation behavior.
- `src/telegram/roster-renderers.ts` — roster, pagination, loading/failure and removal-confirmation copy.
- `src/telegram/callbacks.ts` — callback validity, authorization and acknowledgement boundary.

No external specifications or ADRs were introduced during this discussion.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- Setup and settings projection functions in `src/telegram/renderers.ts` separate presentation from state and provide direct catalog-integration points. Existing setup has eight schedule/access steps; timezone is currently the first.
- `src/telegram/keyboards.ts` separates display text from stable action keys. Replace localized labels without translating action identifiers. Policy choices deliberately occupy separate rows to avoid truncation.
- `src/telegram/roster-renderers.ts` renders paginated safe member labels and existing empty/loading/failure/removal states. Localize surrounding phrases while retaining name safety and existing roster semantics.

### Established Patterns

- Durable state lives in PostgreSQL/Prisma, with opaque server-side callback records, expiry, revision checks and fresh authorization.
- Setup/settings handlers already have distinct expiry and recovery messages. Translation must retain the correct recovery destination for each surface.
- Exactly one callback acknowledgement is owned by the outcome branch, with a boundary fallback. A no-message language selection still follows that rule.
- HTML text, dynamic labels and 24-hour time already have rendering conventions. Translate complete phrases while preserving escaping, command tokens and IANA identifiers.

### Integration Points

- Existing settings rendering rejects an unconfigured chat with a `/setup` instruction. D-06 requires a deliberate language-only settings projection before schedule configuration exists.
- Setup and settings handler dependencies currently use their domain services and Prisma. Add durable preference lookup/change without treating the preference as complete chat configuration or triggering schedule changes.
- `src/telegram/migration-handler.ts` and durable chat identity handling need planning review for preference survival across group migration, especially before setup completion.
- `prisma/schema.prisma` and migration/preflight handling must support the chosen storage design. Catalog/rendering infrastructure must also be callable from background code without a Telegram context.
- The workspace contains pre-existing source/config changes. Scout findings describe the inspected workspace; implementation must inspect current files and preserve unrelated work.
</code_context>

<specifics>
## Specific Ideas

- The bilingual **Мова / Language** entry lets an administrator recover from an accidental language switch.
- The user explicitly corrected the language-entry choice from localized-only to bilingual; do not use the superseded answer.
- The Ukrainian voice is informal and conversational, with **Склад гурту** and **Хто може запропонувати репетицію?** as selected vocabulary.
- All four discussion areas were selected and completed. User-facing discussion is Ukrainian; planning prose remains English, with Ukrainian UI examples retained.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Existing milestone exclusions and Phase 7/8 ownership remain unchanged.
</deferred>

---

*Phase: 6-Localization Foundation and Ukrainian Onboarding*
*Context gathered: 2026-09-16*
