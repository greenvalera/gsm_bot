# Phase 8: Localized Reminders and Bilingual Verification - Context

**Gathered:** 2026-09-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Localize actual durable planning-start and pending-participant reminder delivery and verify the complete Ukrainian interface with retained English behavior. Own LREM-01, LREM-02, L10N-02 and L10N-03.

Resolve the current group language during delivery rendering, including previously scheduled work and eligible recovery. Preserve schedule generation, due times, duplicate suppression, authorization and domain state. Complete catalog/parameter checks, the outbound-surface inventory, bilingual workflow regressions and compiled target-image catalog/Intl verification. Existing native waivers remain valid.
</domain>

<decisions>
## Implementation Decisions

### Planning-start reminder

- **D-01:** Ukrainian text is **Час запланувати репетицію на 21–27 вересня.** Substitute the actual target-week range.
- **D-02:** The existing start control reads **Почати планування**. Preserve its permissions and existing planning flow.
- **D-03:** Within one month use **21–27 вересня**; across months use **28 вересня – 4 жовтня**. Do not add the year, consistent with Phase 7; retain authoritative dates internally.
- **D-04:** Render one sentence, with the start button below. Do not split the call to action and dates into separate lines.

### Pending-participant reminder

- **D-05:** Use **Нагадаймо про репетицію: … — дай знати, чи зможеш прийти.** Replace the ellipsis with real mentions of all currently pending participants.
- **D-06:** Put the rehearsal date/time on a separate line before that sentence, using a full weekday/month date without a year and a 24-hour time range: **Репетиція — понеділок, 21 вересня, 19:00–21:00.**
- **D-07:** Keep mentions inline, comma-separated, preserving every pending mention and existing display order. Visual wrapping is permitted; do not impose one participant per line. Example @names are illustrative, not a replacement for user-ID mention links.
- **D-08:** Put the saved rehearsal timezone in parentheses immediately after the range: **Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv).** Do not translate the identifier or substitute a later chat timezone for the authoritative rehearsal timezone. The range is sufficient without a repeated duration, consistent with Phase 7.

### Navigation to the availability card

- **D-09:** The direct card link in supergroups reads **Відповісти щодо репетиції**. Retain the existing destination and group-type routing; answer buttons remain on the card.
- **D-10:** For basic groups, retain reply-to-card delivery and use **Щоб відповісти щодо репетиції, відкрий картку, на яку відповідає це повідомлення.**
- **D-11:** The existing basic-group recovery hint reads **Не знаходиш картку? Скористайся /plan_status.** Preserve the command token.
- **D-12:** Put that recovery hint on its own line after the basic-group navigation instruction. Supergroups retain the direct link; this discussion does not add the basic-group hint to them.

### Final bilingual verification

- **D-13:** Review new Ukrainian copy directly in Telegram during reminder acceptance testing, rather than requiring a separate up-front copy list. Preserve previously accepted wording and existing native-testing waivers.
- **D-14:** Focus manual verification on new reminders and language switching in both directions. Repeat previously accepted scenarios where changes may affect behavior. Full automated bilingual coverage remains required; this is a manual-test focus decision, not a reduction of L10N-02/03.
- **D-15:** Present manual acceptance scenarios one at a time, explaining the expected result before each check. Each result must be assessable against an explicit condition.
- **D-16:** Accept Ukrainian wording alongside each reminder's behavior; after each scenario the user can accept the result or request a copy change. Do not defer all wording acceptance to a separate final pass.

### Carried-forward constraints

Keep Phase 6's informal singular **ти** voice and Phase 7's date/count helpers and recovery distinctions. Names, command tokens, opaque identifiers, mention/link destinations and IANA identifiers remain unchanged. Preserve escaping, Unicode-safe labels and Telegram output budgets.

Language is presentation: a committed change affects subsequent rendering, including queued reminders, without recalling an in-flight send or rewriting history. Preserve valid controls, current authorization, exactly-once callback acknowledgement and durable reminder claims. Retain Phase 5's eligibility, grace/cooldown, catch-up and uncertain-delivery rules, including no retry of an occurrence with unknown delivery outcome. Planning-start reminders have no mentions; follow-ups mention only pending participants from the authoritative round snapshot.

### Agent Discretion and Planning Responsibilities

No additional product choices were explicitly delegated. Exact unselected copy follows established tone and semantics; do not record it as user-selected. Ukrainian selections do not authorize unrelated English wording changes.

Research/planning own locale integration, catalog contracts, outbound-surface inventory design and test implementation. Missing-key fallback is not evidence of complete Ukrainian support. Cover onboarding through reminders and lifecycle recovery, access/stale/error paths, long Unicode names, escaping, output limits and the required count boundaries. Prove both catalogs and Ukrainian Intl behavior in the compiled target image. Required affected tests and repository CI checks must pass with evidence tied to the tested revision. Preserve prior waiver scope and distinguish automated evidence from native acceptance. No deployment or live test execution occurred during this discussion.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and accepted behavior

- `.planning/ROADMAP.md` — Phase 8 goal, four requirements and complete verification criteria.
- `.planning/REQUIREMENTS.md` — approved language, delivery, formatting and verification boundaries.
- `.planning/PROJECT.md` — Telegram-only workflow, runtime portability, acknowledgement contract and historical waiver boundaries.
- `.planning/phases/06-localization-foundation-and-ukrainian-onboarding/06-CONTEXT.md` — language persistence, voice and safe language changes.
- `.planning/phases/07-ukrainian-planning-and-lifecycle/07-CONTEXT.md` — authoritative date/time rendering, selected terminology and recovery distinctions.
- `.planning/milestones/v1.0-phases/05-proactive-reliable-reminders/05-CONTEXT.md` — reminder eligibility, timing, mentions, recovery and uncertain delivery.
- `.planning/milestones/v1.0-phases/05-proactive-reliable-reminders/05-ACCEPTANCE.md` — existing scoped native waivers and non-blocking first-real-use observation.
- `.planning/phases/07-ukrainian-planning-and-lifecycle/07-UAT.md` — accepted prior scenarios and explicit unclassifiable-probe disposition; do not reinterpret it as a behavioral pass.
- `.codex/skills/telegram-web-uat/SKILL.md` — native Telegram testing, evidence and fixture-restoration workflow; read before live UAT.

### Implementation seams

- `src/telegram/reminder-renderers.ts` — both reminder projections, group-type navigation and mention/output limits.
- `src/domain/reminders/reminder-service.ts` — durable delivery, current-state checks, retry classification and recovery.
- `src/infrastructure/jobs/reminder-queue.ts` — worker delivery integration.
- `src/shared/i18n/index.ts`, `src/shared/i18n/en.ts`, `src/shared/i18n/uk.ts` — shared explicit-locale message and parameter contracts.
- `src/shared/i18n/planning-format.ts` — reusable localized date/time and count presentation.
- `src/telegram/presentation-locale.ts` — durable presentation-locale resolution.
- `Dockerfile` — compiled runtime image and runtime smoke-check integration.

No external specifications or ADRs were introduced during this discussion.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- The shared English/Ukrainian catalogs and explicit-locale renderer already serve interactive flows; extend them to actual background delivery.
- Phase 7's formatting helpers preserve civil dates and authoritative rehearsal ranges. Reuse them instead of retaining the reminder renderer's raw ISO date and minute count.
- The follow-up renderer already filters pending participants, preserves roster ordering, escapes labels and shortens labels on Unicode code-point boundaries while retaining mention links.

### Established Patterns

- The inspected reminder renderers still contain English copy. Planning reminders show an ISO week range and a start button; follow-ups include basic-group reply navigation or public/private supergroup links.
- Follow-ups return empty/unsendable outcomes and enforce a conservative 4096-character encoded-text budget. Translation must preserve these safety outcomes and all pending mentions.
- Durable occurrence/claim handling separates explicit Bot API rejection from uncertain external delivery. Presentation changes must not reset occurrence identity or create extra sends.

### Integration Points

- Thread one resolved current locale consistently through reminder text and controls at delivery rendering, including recovery paths.
- Connect the catalog and outbound-surface checks with bilingual regressions and target-runtime validation. The Dockerfile already builds TypeScript and includes a runtime data smoke check, providing an integration point for catalog/Intl checks.
- Existing unrelated workspace changes must be preserved. This discussion creates planning documents and updates session state only.
</code_context>

<specifics>
## Specific Ideas

Illustrative Ukrainian follow-up in a supergroup:

> Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv).
> Нагадаймо про репетицію: @Олена, @Андрій — дай знати, чи зможеш прийти.
> Відповісти щодо репетиції

The final line is the existing direct link, and participant labels are real mentions. Dates, times, names and timezone are dynamic. Basic groups use D-10 and D-11 on separate lines instead of the direct link.

All four areas were selected and completed. User-facing discussion is Ukrainian; planning prose remains English, with Ukrainian UI examples retained. The user explicitly requested final context creation after the discussion.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No pending todos matched. Existing exclusions and native waivers remain valid; no new help workflow, additional languages, automatic booking or unrelated backlog work was added.
</deferred>

---

*Phase: 8-Localized Reminders and Bilingual Verification*
*Context gathered: 2026-09-18*
