# Phase 7: Ukrainian Planning and Lifecycle - Context

**Gathered:** 2026-09-18 (discussion began 2026-09-17)
**Status:** Ready for planning

<domain>
## Phase Boundary

Localize the full interactive rehearsal workflow: day/time selection, availability, readiness to book, manual booking, replanning, date/time changes, cancellation and recovery. Complete existing help, validation, permission, stale/duplicate and recoverable-error translation. Own LANG-06, TEXT-02, TEXT-03, TEXT-04, LFMT-01 and LFMT-02.

Retain English support and existing domain behavior. Mid-round language changes affect subsequent rendering and the next ordinary card update, with text and buttons changing together; preserve answers, selected date/time, ownership and valid controls. No proactive historical-message rewriting. Actual reminder delivery and full bilingual inventory/runtime verification belong to Phase 8.
</domain>

<decisions>
## Implementation Decisions

### Participant responses and planning owner

- **D-01:** Availability buttons read **Можу / Не можу**.
- **D-02:** The participant-status legend uses **Очікуємо відповідь / Може / Не може**, respectively pending, available and unavailable. Retain existing markers and status semantics.
- **D-03:** Identify the current planning owner as **Організатор: Ім’я**. This is the existing owner role, not a new permission or broader responsibility.
- **D-04:** Label the administrator takeover control **Стати організатором**. Preserve existing takeover eligibility and current authorization checks.

### Booking and replanning

- **D-05:** The unanimity announcement reads **Усі можуть! Час бронювати репетицію.** It means the group is available, not that external booking has occurred.
- **D-06:** Label the control reporting completed external booking **Студію заброньовано**. Retain the existing subsequent confirmation step; the bot does not book the studio.
- **D-07:** Booking confirmation asks **Студію вже заброньовано на цей час?**, with **Так, заброньовано / Назад** controls. Keep the rehearsal date and time in this message. The Back label maps to the existing keep/dismiss behavior, not a new transition.
- **D-08:** When the slot is blocked, say **Цей час підходить не всім. Обери іншу дату й час.** Retain the existing identification of unavailable participants and existing replanning authority; the imperative does not grant every reader control.

### Dates and durations

- **D-09:** Use full Ukrainian weekday and month names in headings/messages, e.g. **Понеділок, 21 вересня**, with appropriate grammatical forms. Short day-selector labels such as **Пн 21** were carried forward during the question; preserve compact button layouts and markers.
- **D-10:** Where duration is displayed separately, use natural hours/minutes with grammatical agreement, e.g. **2 години**, **1 година 30 хвилин**, rather than always expressing the value in minutes or abbreviations. Preserve duration values and input semantics.
- **D-11:** Do not add the year to displayed card dates, including dates in another year. The user explicitly chose this over conditional or always-present years; preserve full authoritative dates internally.
- **D-12:** On the rehearsal summary card, show the time range alone, e.g. **19:00–21:00**, without repeating duration beside it. Use 24-hour time and the authoritative rehearsal timezone. D-10 remains applicable wherever duration appears separately.

### Denials and recovery

- **D-13:** Permission denials explain who may perform the action, e.g. **Змінити дату може лише організатор або адміністратор.** Match the roles to the actual action's authorization rules; do not copy this example into actions with different eligibility.
- **D-14:** An outdated control when a newer planning round exists says **Планування вже змінилося. Поточний стан — /plan_status.** Preserve recovery destinations appropriate to other stale cases; this choice does not imply that a current round always exists.
- **D-15:** For a temporary failure where the action definitely did not complete and retry is safe, say **Ой, щось пішло не так. Спробуй ще раз трохи пізніше.** Do not use this retry invitation to misrepresent a committed mutation followed by failed rendering, or an uncertain outcome.
- **D-16:** For a repeated action already completed, say **Усе гаразд, цю дію вже виконано.** Preserve idempotency and the existing exactly-once callback acknowledgement contract.

### Carried-forward requirements and preferences

Phase 6's informal singular **ти** voice, conversational corrective input errors, **Склад гурту**, and bilingual **Мова / Language** navigation remain established. Names, commands, opaque identifiers, mention/link destinations and IANA timezone identifiers remain unchanged; preserve HTML escaping and output budgets.

Resolve the current group language at rendering boundaries, independently of individual Telegram client language. A language-only change is presentation, not a scheduling or lifecycle transition. Do not invalidate otherwise-valid actions solely because language changed. Do not recall an already-in-flight send. Keep live card and announcement identities and existing recovery/authorization behavior.

### Agent Discretion and Research Responsibilities

No additional product choices were explicitly delegated. Exact change/cancellation copy and unselected wording should follow the agreed voice and existing semantics; do not represent unasked wording as user-selected decisions. The user approved completing context after all four areas.

Research/planning own catalog integration, locale threading, calendar/plural helpers, translation of complete phrases and appropriate verification. Retain English behavior; Ukrainian wording examples do not authorize unrelated English copy changes. Verify natural Ukrainian/English count and duration forms for 0, 1, 2, 5, 11, 14, 21, 22, 25, 101 and 111, including mixed-hour durations. Derive displayed dates/ranges without shifting civil dates or replacing a round's authoritative timezone with later chat settings. Keep required recovery distinctions rather than collapsing all errors into one phrase.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and prior decisions

- `.planning/ROADMAP.md` — Phase 7 acceptance and Phase 6/8 boundaries.
- `.planning/REQUIREMENTS.md` — all six owned requirements, formatting boundary cases and switching safeguards.
- `.planning/PROJECT.md` — product constraints and superseding exactly-once acknowledgement contract.
- `.planning/phases/06-localization-foundation-and-ukrainian-onboarding/06-CONTEXT.md` — selected voice, established terminology and language-switching decisions.
- `.planning/milestones/v1.0-phases/04-replanning-and-rehearsal-lifecycle/04-CONTEXT.md` — lifecycle authority, blocked rounds, cancellation, successor navigation and recovery semantics.
- `.planning/milestones/v1.0-phases/05-proactive-reliable-reminders/05-CONTEXT.md` — reminder behavior and historical waivers to preserve; actual delivery translation remains Phase 8.

### Implementation seams

- `src/telegram/planning-renderers.ts` — pure card projections, date labels, ownership, legends, availability and lifecycle copy.
- `src/telegram/keyboards.ts` — displayed labels, row budgets and stable action values.
- `src/telegram/planning-handlers.ts` — interactive dispatch, refusal feedback and card/announcement recovery.
- `src/telegram/callbacks.ts` — validity, authorization and acknowledgement boundaries.
- `src/shared/i18n/index.ts` — explicit-locale typed message and parameter contracts.
- `src/shared/i18n/en.ts` and `src/shared/i18n/uk.ts` — shared catalogs to extend.
- `src/telegram/presentation-locale.ts` — durable preference resolution and presentation-only fallback.

No external specifications or ADRs were introduced during this discussion.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `renderMessage` uses explicit `en`/`uk` locale and a shared typed parameter map. Extend this established contract for planning and lifecycle phrases.
- Planning renderers already separate text/keyboard projection from I/O and token minting. Date headings, owner lines and legends provide direct localization seams.
- Existing member-label rendering provides escaping and masked fallback identities. Preserve those protections while passing locale consistently.

### Established Patterns

- Planning heading dates currently use English month/weekday labels based on civil dates. Replace presentation labels without converting date-only values through unrelated timezones.
- Planning cards have fixed marker order, compact button rows and text derived from domain outcomes. Translation must not derive a competing state machine.
- Durable state, opaque server-side callback actions, revision checks, fresh authorization and branch-owned acknowledgement remain authoritative.
- `resolvePresentationLocale` reads durable preferences and has a presentation-only fallback. Fallback is not proof of complete Ukrainian coverage and never grants permission to mutate.

### Integration Points

- Thread locale through handlers, renderer calls, keyboard controls and refusal/recovery paths, including shared help/error boundaries.
- Render both text and buttons in the current language on ordinary active-card updates; ensure unchanged domain state does not cause an old-language render to be treated as complete.
- Reuse calendar/count helpers across interactive surfaces now, leaving actual reminder-worker delivery integration to Phase 8.
- The workspace contains unrelated source/config changes. Preserve them and inspect current implementation when planning; this discussion modified planning artifacts only.
</code_context>

<specifics>
## Specific Ideas

- Keep the distinction between **Усі можуть!** and **Студію заброньовано** unmistakable.
- The user selected **Організатор** over **Планує** and chose natural full dates without years.
- The summary's time range is intentionally sufficient by itself; natural-language duration remains available on other relevant surfaces.
- User-facing discussion is Ukrainian; project and planning prose remains English, with Ukrainian UI examples preserved.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No pending todos matched. Existing exclusions and native-testing waivers remain valid; no new help product, automatic booking, additional languages or unrelated backlog work was added.
</deferred>

---

*Phase: 7-Ukrainian Planning and Lifecycle*
*Context gathered: 2026-09-18*
