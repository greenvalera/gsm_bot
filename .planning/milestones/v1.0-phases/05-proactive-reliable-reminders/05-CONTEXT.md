# Phase 5: Proactive Reliable Reminders - Context

**Gathered:** 2026-09-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver useful planning-start and outstanding-participant reminders that survive restarts, suppress obsolete work, and do not create duplicate records or domain transitions from repeated updates. Scope: REM-01 through REM-05, RELI-02 and RELI-03. Preserve the completed planning, availability and lifecycle behavior from Phases 1–4. Automatic booking and private-message reminders remain outside this phase.
</domain>

<decisions>
## Implementation Decisions

### Planning-start reminders
- **D-01:** Remind at 10:00 in the chat timezone from Monday, then daily until planning starts for the target week. An existing active planning process suppresses these reminders, including a draft; do not confuse that check with the confirmed/booked week-claim predicate.
- **D-02:** Once this week's rehearsal is agreed, reminders for next week wait until next Monday at 10:00. Do not immediately chase the next unplanned week. Earlier manual planning remains available.
- **D-03:** After cancellation frees the current week, suppress planning-start reminders for the remainder of that week. Resume eligibility next Monday; manual planning remains available immediately. This suppression must survive restart.
- **D-04:** A planning-start reminder contains the target week and a Start planning button, without mentions. The button checks current planning permissions and uses the existing planning flow; the message is not authorization.
- **D-05:** After initial setup midweek, the first eligible reminder is the next 10:00, not immediately and not necessarily next Monday.

### Participant follow-ups
- **D-06:** Send a fresh message containing rehearsal date/time, real mentions of only pending participants in the current round's authoritative snapshot, and a link to the current card. Answer buttons remain on the card; do not duplicate them on reminder messages.
- **D-07:** Pause follow-ups while any unavailable answer blocks the slot. If that answer changes and the slot becomes viable with pending participants, resume at scheduled times. New rounds use the existing current-roster snapshot behavior; old-round jobs cannot target their successor implicitly.
- **D-08:** Stop follow-ups at the scheduled rehearsal start even when responses remain outstanding. Completion, booking, cancellation and supersession also suppress inapplicable follow-ups.
- **D-09:** Allow at least 30 minutes after availability-card publication before a follow-up. Skip scheduled occurrences inside this grace period; do not defer them to an arbitrary publication-plus-30-minutes send.
- **D-10:** Maintain at least 30 minutes between reminders for the same round, including recovery and settings changes. Skip closer scheduled occurrences. Exactly 30 minutes satisfies the minimum.

### Recovery after downtime
- **D-11:** On recovery, send one currently relevant missed reminder if lateness is at most two hours, inclusive. Skip older occurrences and coalesce accumulated eligible occurrences rather than replaying a backlog. Re-evaluate current state and pending participants before delivery; recovery never revives obsolete reminders.
- **D-12:** If the delivery outcome is unknown, do not retry that occurrence. The user accepts a possible missed reminder to avoid a duplicate; future scheduled reminders remain eligible. Distinguish this from a known rejection before delivery. Do not promise guaranteed exactly-once Telegram delivery.
- **D-13:** Send an eligible catch-up immediately even if the next scheduled reminder is imminent. Skip that next occurrence if it falls less than 30 minutes after the catch-up. This explicitly overrides the offered recommendation to wait for the imminent occurrence.
- **D-14:** Do not send separate outage/recovery notices to the group. Record failures in technical logs and resume under these rules.

### Settings changes
- **D-15:** Apply saved reminder-time changes immediately to current and future rounds. Cancel future work under the old schedule.
- **D-16:** Generate only future occurrences after a settings change. Adding a time already past today does not create a missed occurrence or trigger catch-up.
- **D-17:** Apply a changed chat timezone immediately to future reminder occurrences, preserving configured local wall-clock times: 10:00 means 10:00 in the new timezone. This decision concerns reminders, not rescheduling an already agreed rehearsal.
- **D-18:** A settings change does not reset the same-round 30-minute minimum interval or bypass publication grace.

### Requirement clarification for planning
- D-03 is an explicit exception to REM-01's broad daily-until-started wording: cancellation intentionally silences planning-start reminders for the rest of the current week. Reconcile acceptance wording during planning; do not implement automatic next-day resumption after cancellation.
- D-02 separates proactive weekly eligibility from the existing manual target-week search, which can look ahead. Reuse date arithmetic without treating every manually selectable future week as immediately reminder-eligible.
- D-07 and D-08 narrow REM-03's incomplete-availability condition: a blocked or already-started slot does not merit outstanding-participant reminders.
- RELI-02's duplicate-record and transition guarantees remain required; D-12 defines the user-approved tradeoff for uncertain external delivery.

### Agent's Discretion and Research Responsibilities
No additional product preferences were explicitly delegated. Resolve implementation details within the decisions above: durable occurrence identity, atomic claims, queue integration, stale-job checks, retry classification for known non-delivery, and migration/test coverage.

Research and planning must document DST gap/overlap handling, usable card-link behavior across supported Telegram group types and re-anchoring, publication-grace behavior after failed publication recovery, and week-boundary handling under timezone changes. Do not present these unasked edge cases as user-selected policies. Preserve current single-polling-process deployment assumptions and existing authorization boundaries.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and prior decisions
- `.planning/ROADMAP.md` — Phase 5 goal and success criteria.
- `.planning/REQUIREMENTS.md` — REM-01–REM-05, RELI-02/03, and milestone exclusions; reconcile the clarifications above.
- `.planning/PROJECT.md` — per-chat scheduling, roster, Telegram-only product constraints and English documentation.
- `.planning/STATE.md` — completed-phase state, accumulated safeguards and declared single-process constraints.
- `.planning/phases/02-weekly-rehearsal-proposal/02-CONTEXT.md` — draft ownership, manual week selection, status re-anchoring and roster snapshot.
- `.planning/phases/03-availability-and-booking-decision/03-CONTEXT.md` — snapshot authority, plain card labels versus follow-up mentions, two live messages, booking and announcement claims.
- `.planning/phases/04-replanning-and-rehearsal-lifecycle/04-CONTEXT.md` — blocked outcome, superseded rounds, cancellation and lifecycle boundaries.

### Existing implementation
- `src/domain/planning/target-week.ts` — manual target-week selection and week-claim predicates.
- `src/domain/planning/planning-service.ts` — availability outcome, participant snapshots and durable lifecycle transitions.
- `src/domain/chat/schedule-validator.ts` — minute-of-day validation.
- `src/domain/chat/settings-service.ts` — saved per-chat settings changes.
- `src/infrastructure/time/civil.ts` — civil-date operations.
- `src/infrastructure/time/zoned-clock.ts` — timezone-aware time operations.
- `src/telegram/planning-handlers.ts` — planning dispatch and message recovery.
- `src/telegram/planning-renderers.ts` — current card and announcement rendering.
- `src/app/main.ts` — runtime integration point.
- `prisma/schema.prisma` — durable state to extend.
- `prisma/migrate-deploy.mjs` — migration catalog/preflight must remain aligned with new schema changes.

No external specifications or ADRs were introduced during this discussion.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `targetWeekStart`, `weekIsClaimed`, civil dates and named status sets provide existing calendar rules. A draft deliberately does not claim a week in the manual search, so reminder suppression requires the separate active-process check.
- `availabilityOutcome` provides the shared collecting/all-available/blocked classification; follow-ups must not invent a conflicting derivation.
- Current planning services and renderers already track participants, card anchors and a separate announcement message. Link to the current card without moving answer controls into reminders.
- Settings services and minute-of-day parsing provide the saved schedule inputs.

### Established Patterns
- PostgreSQL/Prisma durable state, explicit migrations, revision checks and opaque callback tokens.
- Current permissions checked at the action boundary; repeated actions are idempotent.
- Chat-key serialization precedes handler registration and assumes one polling process.
- Failed Telegram edits do not roll back committed domain transitions. Reminder delivery state must distinguish durable work from external send outcome.

### Integration Points
- Add reminder scheduling and recovery to runtime startup/shutdown and saved configuration changes.
- Revalidate reminders against lifecycle transitions, current pending responses and the active round identity.
- Extend migration preflight and relevant deterministic clock, restart, duplicate-update and real-database coverage as required by the final plan.
</code_context>

<specifics>
## Specific Ideas
- A card published at 09:59 must not trigger a 10:00 follow-up; wait for the next scheduled occurrence after the 30-minute grace.
- Recovery at 15:50 may send the still-relevant 14:00 reminder, then skip 16:00.
- Adding 14:00 at 15:00 never produces an immediate catch-up.
- The user selected all four discussion areas. User-facing discussion must be Ukrainian (English is also acceptable), never Russian. Project artifacts remain English. Interactive questions use three buttons with one recommended option.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. Existing milestone exclusions remain unchanged.
</deferred>

---

*Phase: 5-Proactive Reliable Reminders*
*Context gathered: 2026-09-13*
