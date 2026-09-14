# Phase 2: Weekly Rehearsal Proposal - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the week-aware rehearsal proposal. An authorized user starts one planning process per chat and target calendar week; the bot determines the target Monday–Sunday week, offers every day in it and every valid hourly time slot inside the chat's configured window, highlights the configured default and the previous rehearsal's choice, and ends by durably confirming a proposal with a participant snapshot. It also covers recovering an interrupted process and administrator takeover of an abandoned one.

Publishing the availability card, collecting responses, replanning, cancellation, lifecycle transitions, and reminder delivery belong to Phases 3–5.

</domain>

<decisions>
## Implementation Decisions

### Proposal Card Flow
- **D-01:** `/plan` (or the equivalent start command) posts a **single group card that is replaced in place** at every step: day → time → review. No new message per step. The round has exactly one anchor `message_id`, persisted so it can be recovered. — **Reversibility:** costly — the anchor `message_id` becomes a persisted column on the planning round and every step renderer edits rather than sends; switching to message-per-step later means changing every transition and the durable schema.
- **D-02:** Only the **planning author** may advance the card. A tap from anyone else is refused with a private callback alert naming who owns the round. Administrator takeover (D-09) is the single deliberate exception.
- **D-03:** Every step after the first carries a **Back** action that returns to the previous selector with the earlier choice still applied. A mis-tap must never force cancel-and-restart.
- **D-04:** The phase ends at a **durably confirmed proposal**: the review step's Confirm atomically promotes the draft into a committed proposal record (day, time, participant snapshot) and states that the availability round is next. No placeholder or disabled "publish" control is shipped. — **Reversibility:** one-way — the confirmed proposal record is the durable hand-off Phase 3 reads; changing what Confirm commits after Phase 3 exists requires a migration and a change to the Phase 3 contract.

### Week and Slot Boundaries
- **D-05:** The day selector renders **all seven days** of the target Monday–Sunday week. Days earlier than today are marked as past and **refuse selection** with a private alert; they are never hidden.
- **D-06:** A time slot is offered only when the **whole rehearsal fits**: `start + durationMinutes <= dailyEndMinute`, and `start >= dailyStartMinute`. With the defaults (10:00–21:00, 2h) that yields hourly slots 10:00 through 19:00. This is the containment rule `validateSchedule` already enforces for the configured default (CONF-04).
- **D-07:** When the chosen day is **today**, hours already past are rendered but disabled, exactly like past days — one consistent "in the past" rule across both selectors.
- **D-08:** Default and previous-rehearsal highlights are **leading emoji markers with a legend in the card text** above the keyboard (a distinct marker each for default, previous, and past/unavailable). Word suffixes on button labels are rejected: Telegram button width already truncated a label in Phase 1 (finding F-9). When the configured default and the previous rehearsal coincide, only the default marker is shown (PLAN-05, PLAN-07).

### Participants
- **D-09:** **The active roster IS the lineup.** The wizard has **no participant-selection step**. On Confirm the proposal snapshots every currently active roster member. Changing who plays is done by changing the roster (`/roster_add`, roster removal) — not per round. This deliberately supersedes the previous-rehearsal-seeded default; see "Requirements Ripple" below. — **Reversibility:** costly — the wizard step, its callback shapes, and the seeding source would all have to be added back, though the confirm-time snapshot column stays valid either way.
- **D-10:** Confirming with an **empty active roster is refused**, with a message directing the author to `/roster_add`: an availability round with nobody in it can never complete. Any non-empty roster confirms normally, including a single member.
- **D-11:** A participant **snapshot is still taken and persisted at confirm time**. Phase 3 needs it to decide who may respond, and the `PREVIOUS_PARTICIPANTS` planning-access policy reads from it.

### Ownership and Recovery
- **D-12:** A planning process becomes **abandoned by inactivity timeout** — a configured period with no action from the author, following the Phase 1 setup-draft expiry precedent (30 minutes). Only then does a Take over action appear for administrators. An administrator cannot seize an actively-used round.
- **D-13:** Takeover **keeps the existing day/time selections** and continues from where the round stopped; the card shows who took it over. Back on every step (D-03) is how the new author revises anything they disagree with.
- **D-14:** The status request **re-posts the live card** at the bottom of the chat and makes that new message the round's anchor; the previous message stops being live. This is what "recover the active interaction" means once the card is buried by chat traffic (PLAN-10).
- **D-15:** **Anyone in the chat may request status.** The re-posted card renders for everyone, but its buttons still refuse anyone who is not the current author (D-02). Visibility for all, control for one.

### Requirements Ripple (MUST be reconciled before or during planning)

D-09 changes locked requirements. These artifacts still state the superseded model and need updating — planning must not silently proceed against stale text:

- `.planning/REQUIREMENTS.md` **PLAN-08** ("A new plan initially selects participants from the previous confirmed rehearsal") — no longer true; the roster is the source.
- `.planning/REQUIREMENTS.md` **PLAN-09** ("The planning author can add or remove participants from the band roster before publishing availability") — removed from Phase 2 scope; participant changes happen through roster management (ROST-01/ROST-02, delivered in Phase 1).
- `.planning/ROADMAP.md` Phase 2 **success criterion 5** — currently "A new proposal starts from the previous confirmed participants, lets the author adjust them from the roster, and can be recovered…"; the participant clause must become "snapshots the current active roster".
- `.planning/PROJECT.md` active requirement "A new poll includes the previous rehearsal's participants by default; its participant list can be adjusted from the band roster before publication" — same correction.
- **Downstream, not this phase's call:** `AVAIL-06` ("participant snapshot preserved unless explicitly changed") and `LIFE-05` ("becomes the previous rehearsal used for future day, time, and participant defaults") assume a per-round participant set. Phase 3/4 discussion must reconcile the participant half of both against D-09.

### Claude's Discretion
- Exact command names, button labels, marker glyphs, and card copy, provided the decisions above hold.
- The concrete inactivity threshold for abandonment and the mechanism that expires or reaps stale rounds.
- Whether the target-week rule and the one-active-process constraint are enforced by a compound unique constraint, an application transaction, or both — and the exact durable schema for the round, its anchor message, and its participant snapshot.
- How the "past" boundary is computed relative to the chat's IANA timezone, and the DST policy for a target week containing a transition. This is a named open concern in `.planning/STATE.md` ("Select and document the TypeScript time-library DST policy during planning of the week-aware proposal") — **research must resolve it and planning must record the chosen policy.**
- Pagination or message-splitting behavior if a rendered card exceeds Telegram limits.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Acceptance
- `.planning/ROADMAP.md` — Phase 2 boundary, goal, mapped requirements, and the five success criteria. Note criterion 5 is superseded in part by D-09.
- `.planning/REQUIREMENTS.md` — CONF-04, AUTH-03, PLAN-01 through PLAN-10, RELI-01, plus milestone-wide exclusions. PLAN-08 and PLAN-09 are superseded by D-09.

### Product Constraints
- `.planning/PROJECT.md` — Telegram-group-only interaction, one active process per chat and week, administrator-managed roster, per-chat settings, agent-runtime portability, documentation language. Its Key Decisions table carries the callback-acknowledgement contract this phase must follow.
- `.claude/CLAUDE.md` — Verified stack versions and the Telegram design constraints that bind every callback: 1–64 byte `callback_data`, opaque versioned tokens with authorization resolved from PostgreSQL, acknowledge every callback, treat updates as untrusted and unordered, `bigint` at the repository boundary.

### Prior Phase Decisions (binding, do not re-litigate)
- `.planning/phases/01-chat-readiness/01-CONTEXT.md` — D-02 (30-minute draft expiry), D-03 (atomic save on final confirmation), D-08 (24-hour `HH:MM` in the chat timezone), D-12 (admins always pass the planning-access policy), D-13 (private alert for rejected buttons, concise group reply for rejected commands).
- `.planning/STATE.md` — Accumulated Decisions list, in particular: the exactly-once callback acknowledgement deferred to the branch that owns the outcome; opaque `v1:<uuid>` tokens with all state in the server-side `CallbackAction` row; actor-bound drafts with expected-revision transactions; in-place card replacement on every callback transition. Also the open concerns and deferred item N-6 (in-place replacement on *text-input* steps is not yet implemented).

No external specifications or ADRs outside `.planning/` were referenced during this discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/chat/schedule-validator.ts` — `parseLocalTime`, `formatLocalTime`, and `validateSchedule` already implement the exact containment rule D-06 needs (`start >= dailyStart`, `start + duration <= dailyEnd`). Slot generation should be built on the same rule, not a second copy of it.
- `src/domain/auth/planning-access-service.ts` — `canStartPlanning({ currentRole, policy, wasPreviousParticipant })` is complete and is the gate for PLAN-01. `wasPreviousParticipant` must be answered from the persisted participant snapshot (D-11).
- `src/domain/roster/roster-service.ts` — active-membership listing with `Intl.Collator` ordering on the safe display label and idempotent paginated reads; this is the source for the confirm-time snapshot (D-09) and the empty-roster check (D-10).
- `src/domain/chat/types.ts` — `WEEKDAYS`, `WEEKDAY_LABELS`, `MinuteOfDay`, and the planning-access value/label maps.
- `src/telegram/keyboards.ts` — the declared-rows pattern (`SETUP_WEEKDAY_BUTTONS`, `SETUP_POLICY_BUTTONS`), including the deliberate one-button-per-row split that fixed the truncation finding F-9. The 4/3 weekday row split is directly reusable for the day selector.
- `src/telegram/callbacks.ts` — `registerCallbackBoundary` and the acknowledge-authorize-parse-load-dispatch boundary every new callback must cross.
- `src/shared/callback-schema.ts` — `createCallbackToken` (`v1:<uuid>`), `actionContext`, and the per-surface target schema/parse pattern to copy for planning targets.
- `src/shared/logger.ts` — the redacting `SafeLogger`; every new route must bind its caught error under the `err` key or it is unloggable.

### Established Patterns
- Durable state lives in PostgreSQL via Prisma with `timestamptz`, `BigInt` chat/user ids, and explicit migrations; `revision` / `expectedRevision` guards every mutation.
- Callback tokens carry **no** identity, date, or authorization claim — only an opaque token resolved against a server-side `CallbackAction` row bound to chat, actor, target, and expiry.
- One acknowledgement per `callback_query.id`, deferred to the branch that owns the outcome, with a boundary-level fallback.
- Routes are declared in a closed union table (`CHAT_READINESS_ROUTES` in `src/telegram/handlers.ts`) with an explicit `protectedWhen` of `always` or `in-flight`; the distinction is load-bearing — finding F-7 came from conflating them. Planning routes must declare theirs deliberately.
- Duplicate or replayed confirmations return `Already applied.` with no second transition.
- `sequentialize` by chat key is installed by `createBot` before handler registration.

### Integration Points
- A new planning surface registers alongside `registerChatReadinessHandlers` in `src/telegram/handlers.ts` and adds route ids plus a `CallbackActionKind` value.
- `prisma/schema.prisma` gains the planning round, its anchor message, and its participant snapshot; `SetupStep` / `SettingsField` show the enum conventions to follow.
- `ChatConfiguration` supplies every input the selectors need: `timezone`, `defaultWeekday`, `defaultStartMinute`, `durationMinutes`, `dailyStartMinute`, `dailyEndMinute`.
- The confirmed proposal record is the contract Phase 3 consumes to publish the availability card.

</code_context>

<specifics>
## Specific Ideas

- "Roster is the lineup" is the organizing principle for participants — one source of truth, and a lineup change is a roster change. The author's rationale: it makes the logic clearer than seeding each round from the previous rehearsal.
- Past days and past hours obey one and the same rule: visible, marked, and refused — never hidden. The chat's configured window should look the same on a Thursday as on a Monday.
- The proposal card should read like one evolving card in the chat, not a trail of wizard steps.
- A status request should bring the round back to the bottom of the chat where people are actually looking.

</specifics>

<deferred>
## Deferred Ideas

- **Per-round participant adjustment** — dropped from Phase 2 by D-09. If the band later needs a one-week lineup change without editing the roster, it returns as its own decision (and would revive PLAN-09).
- **Explicit author hand-off of a round** ("I'm stepping away, someone else take it") — considered alongside D-12 and not adopted; the inactivity timeout covers the case.
- **Reconciling `AVAIL-06` and `LIFE-05` with the roster-as-lineup model** — belongs to the Phase 3 and Phase 4 discussions, not here.

</deferred>

---

*Phase: 2-Weekly Rehearsal Proposal*
*Context gathered: 2026-08-30*
