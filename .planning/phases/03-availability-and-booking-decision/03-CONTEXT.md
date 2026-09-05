# Phase 3: Availability and Booking Decision - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase turns a durably confirmed proposal into a group decision. Phase 2 ends at a `PlanningRound` in `CONFIRMED` status with a day, a start minute, and a confirm-time `PlanningParticipant` snapshot, rendered as a controls-free card. Phase 3 publishes an availability card against that snapshot, collects "Can attend" / "Cannot attend" from exactly those participants, shows each participant's status and the overall completion count, announces that the rehearsal is ready to book when every participant can attend, and lets the planning author or a chat administrator record it as manually booked.

Requirements in scope: AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-04, AVAIL-07, LIFE-01.

Explicitly **not** this phase:

- The "Cannot attend" → close-and-replan flow (AVAIL-05) and fresh rounds with cleared responses (AVAIL-06) — Phase 4.
- Stale/superseded button semantics as a delivered capability (AVAIL-08) — Phase 4. Phase 3 still applies the existing expiry and `expectedRevision` guards it inherits.
- Cancel, change, week release, and previous-rehearsal defaults (LIFE-02 through LIFE-06) — Phase 4.
- Every reminder and follow-up (REM-01 through REM-05) — Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Publishing the Availability Card

- **D-01:** Confirm **auto-publishes**. The transaction that commits the proposal also opens the availability round — there is no separate Publish button, command, or author gesture. This settles the question Phase 2 D-04 deliberately left open by refusing to ship a placeholder control: the answer is that no control was needed. — **Reversibility:** costly — publication becomes part of the confirm transaction and the round's state machine; splitting it back out later means a new callback action kind, a new intermediate durable state, and a change to what Confirm means.
- **D-02:** The availability card **replaces the anchor in place**. `renderConfirmedStep` stops being a terminal render and becomes a transition: the round keeps exactly one live `anchorMessageId` from `/plan` through to booking, carrying Phase 2 D-01 forward unbroken. The confirmed summary is folded into the availability card's header rather than surviving as its own message.
- **D-03:** A **failed publish edit never rolls back a committed proposal**. The durable round stands as open-for-availability regardless of what Telegram did with the edit; recovery is the existing status re-post (Phase 2 D-14), which must therefore render the availability card as well as the wizard steps. No compensating message is posted on the failure path.

### Answering and Changing

- **D-04:** Answers are **freely changeable until the round closes**. Both buttons stay live for every participant; tapping the other one overwrites the previous answer. Re-tapping the answer you already gave is an idempotent no-op acknowledged with a short private alert, following the established `Already applied.` shape. A mis-tap must never be able to derail a round.
- **D-05:** A "Cannot attend" **records and keeps the round open**. It marks that participant unavailable and collection continues — this is the only behavior consistent with D-04, and it leaves the round in exactly the state Phase 4's AVAIL-05 trigger will attach to. Once every participant has answered and at least one said no, the card states plainly that the slot does not work. Phase 3 ships **no** replan action, so the card must not offer one or imply one is a tap away.
- **D-06:** The **confirm-time snapshot is authoritative for the round's whole life**. A participant removed from the roster mid-round can still answer, and still counts toward completion; a member added mid-round is not in this round. Roster changes take effect on the *next* round, which is what Phase 2 D-09's "change the roster to change the lineup" already means. The completion denominator therefore cannot shift under an open round. This is the reconciliation of AUTH-02 (revalidate current permission) against D-11 for this surface: the permission being revalidated is snapshot membership, read fresh from `PlanningParticipant` at the action boundary, not live roster membership. — **Reversibility:** one-way — Phase 4's AVAIL-06 ("participant snapshot preserved unless explicitly changed") and Phase 5's follow-up targeting both read this rule; changing it later changes who a booked round was ever asking.
- **D-07:** A tap from someone **outside the snapshot** is refused with a private callback alert naming the reason — invisible to the group, per Phase 1 D-13 and the same shape as Phase 2's owner-naming refusal. The alert does not route them to roster management; that is Phase 1's surface, not this card's.

### Card Status Display

- **D-08:** The card renders **one roster-ordered line per participant with a leading marker** (pending / can attend / cannot attend) and a legend above the list — the Phase 2 D-08 marker-plus-legend pattern, not grouped sections. Order is fixed by the roster's `Intl.Collator` ordering and never reshuffles as answers arrive, so a participant can always find their own name in the same place.
- **D-09:** Overall completion (AVAIL-04) is **a single count line above the list** — how many of how many have answered. The marked list underneath already says who is missing; no separate outstanding-names line is rendered on the card.
- **D-10:** Names are **plain safe display labels, never Telegram mentions**. The card is edited on every single answer, so real mentions would risk re-notifying the whole lineup repeatedly with no new information. Targeted pinging belongs to Phase 5's follow-ups (REM-04), where it happens once per reminder in a fresh message.
- **D-11:** The card is **edited immediately on every answer**, serialized by the chat-key `sequentialize` that `createBot` already installs. No debouncing or coalescing: a participant's own tap must always be visibly acknowledged, and a band-sized roster produces only a handful of edits.

### Ready to Book and Manual Booking

- **D-12:** Unanimity (AVAIL-07) produces a **new announcement message**, not only an edit. The anchor card updates to its all-clear state and a fresh message lands in the chat saying everyone is available and the rehearsal should be booked. An in-place edit notifies nobody, and this is the one moment in the round that has to break through. **The announcement message carries the Mark as booked control and becomes the round's new anchor.** — **Reversibility:** costly — the anchor moves to a second message id at the end of the round, which every later re-anchor, status re-post, and Phase 4 lifecycle action must respect.
  - **AMENDMENT to D-12 (accepted by the owner during `/gsd-plan-phase 3` plan verification; supersedes the reversibility note above where the two conflict).** "Becomes the round's new anchor" holds **behaviorally**, not as a column move. From the moment the announcement exists it is the message that carries the round's remaining control and the message `/plan_status` re-posts once the round is ready-to-book. But the durable **`anchorMessageId` column keeps naming the availability card**, because RESEARCH Pitfall 7 requires that card to stay live and editable for the whole round — D-04 keeps answers changeable until booking closes it — and `anchorMessageId` is the card's only durable handle; repurposing the column would leave the card unreachable and permanently stale. The announcement is addressed by a **separate `announcementMessageId` column**. Neither column is ever written with the other's message id. **Phase 4's LIFE-02 and LIFE-05 must read this amended two-column shape, not D-12's original single-moving-anchor text.** Recorded as D-17 in `03-04-PLAN.md`; the announcement's own re-post and re-anchor go through `reanchorAnnouncement`, which writes only `announcementMessageId`.
- **D-13:** **The planning author or any current chat administrator** may mark the rehearsal booked (LIFE-01 as written). Administrator eligibility is resolved fresh at the action boundary, per Phase 1 D-12 and AUTH-02. Anyone else gets a private alert naming who can. The person who phones the studio is not reliably the planner, so author-only would make the author a single point of failure for recording a fact that is already true.
- **D-14:** Mark as booked takes a **named confirmation step** — a confirm-then-apply pair modelled on Phase 1's roster-removal confirmation, not a single tap. Phase 3 ships no way to undo booking (LIFE-03/LIFE-04 are Phase 4), so the mis-tap guard is worth the extra callback action kind and round trip.
- **D-15:** Booked is recorded as a **new `BOOKED` value on `PlanningRoundStatus`**, added to `WEEK_CLAIMING_STATUSES` in `src/domain/planning/target-week.ts` alongside `CONFIRMED`. The round moves `CONFIRMED → BOOKED`; one enum value carries the lifecycle position and the compiler exhausts it, rather than a nullable `bookedAt` null-check spreading across callers. Per-participant availability lives on the participant rows, not on the round status. — **Reversibility:** one-way — a Prisma enum value and its migration; Phase 4's LIFE-02 and LIFE-05 read this status directly.
- **D-16:** **Booking closes the availability round.** The card is re-rendered with its controls removed and any late tap receives a private alert saying the rehearsal is already booked. This is precisely the boundary D-04's "freely changeable until the round closes" was written against — booking is what closes it. Changing a booked rehearsal is Phase 4's LIFE-04.

### Claude's Discretion

- Exact command names, button labels, marker glyphs, legend wording, and all card copy, provided the decisions above hold. Copy must not offer or imply a replan action (D-05) or an undo for booking (D-14/D-16).
- The durable shape of a participant's answer: whether it is a nullable enum column on `PlanningParticipant`, a separate response table, or another form — plus the migration that carries it and the `BOOKED` enum value (D-15) together.
- Whether the all-answered-with-a-no state gets its own explicit round status or is derived from the participant rows. Phase 3 has no transition out of it either way, so the cheaper option is fine; but if it is derived, the derivation must be one function, not repeated at each call site.
- The callback action kinds, target schema entries, and route ids for answering, the booking confirmation pair, and any late-tap refusals — following the existing `planningTargetSchema` / `PLANNING_ROUTES` / `CallbackActionKind` conventions, with `protectedWhen` declared deliberately (Phase 1 finding F-7).
- Retry, backoff, and error-classification behavior on the card edit path, within D-03 and D-11.
- How the status re-post (Phase 2 D-14) and its cooldown behave once the anchor has moved to the announcement message (D-12).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Acceptance

- `.planning/ROADMAP.md` — Phase 3 boundary, goal, mapped requirements, and the four success criteria. Also read the Phase 4 and Phase 5 entries to see exactly what this phase must *not* deliver.
- `.planning/REQUIREMENTS.md` — AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-04, AVAIL-07, LIFE-01 are this phase. AVAIL-05, AVAIL-06, AVAIL-08 and LIFE-02 through LIFE-06 are Phase 4 and are out of scope here.

### Product Constraints

- `.planning/PROJECT.md` — Telegram-group-only interaction, administrator-managed roster, per-chat settings, agent-runtime portability, English documentation. Its Key Decisions table carries the callback-acknowledgement contract every route in this phase must follow.
- `.claude/CLAUDE.md` — Verified stack versions and the binding Telegram design constraints: 1–64 byte `callback_data`, opaque versioned tokens with authorization resolved from PostgreSQL, acknowledge every callback exactly once, treat updates as untrusted and unordered, `bigint` at the repository boundary.

### Prior Phase Decisions (binding, do not re-litigate)

- `.planning/phases/02-weekly-rehearsal-proposal/02-CONTEXT.md` — D-01 (single in-place anchor card), D-02 (author-only control with a naming refusal), D-04 (Confirm commits the durable proposal; the confirmed record is the contract this phase consumes), D-09/D-10/D-11 (roster-is-lineup, empty-roster refusal, confirm-time snapshot persisted for Phase 3), D-14/D-15 (status re-posts and re-anchors with a cooldown; anyone may request status, only the author may act). Its Deferred Ideas section explicitly hands the AVAIL-06/LIFE-05 participant reconciliation to Phases 3 and 4 — D-06 above settles the Phase 3 half.
- `.planning/phases/01-chat-readiness/01-CONTEXT.md` — D-02 (30-minute expiry precedent), D-03 (atomic promotion on final confirmation), D-08 (24-hour `HH:MM` in the chat timezone), D-12 (administrators always pass the planning-access policy), D-13 (private alert for a rejected button, concise group reply for a rejected command).
- `.planning/STATE.md` — Accumulated Decisions, in particular the exactly-once callback acknowledgement deferred to the branch that owns the outcome with a boundary-level fallback; opaque `v1:<uuid>` tokens with all state in the server-side `CallbackAction` row; actor-bound records with `expectedRevision` transactions; `Already applied.` on replays; an unbound catch clause is unloggable.
- `.planning/phases/02-weekly-rehearsal-proposal/.continue-here.md` — the migration-preflight anti-patterns from Phase 2's gap closure. Phase 3 adds at least one migration (D-15), so its constraints on `prisma/migrate-deploy.mjs` and inherited database state remain live.

No external specifications or ADRs outside `.planning/` and `.claude/CLAUDE.md` were referenced during this discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/domain/planning/planning-service.ts` — `PlanningService`, the `ConfirmResult` union (its `confirmed` branch already carries `round`, the snapshotted `members`, and the resolved `owner`, which is everything D-01's auto-publish needs), `PLANNING_ACTION_LIFETIME_MS` / `PLANNING_ACTION_RETENTION_MS` / `PLANNING_STATUS_COOLDOWN_MS`, and the `MintedPlanningAction` pattern. The projection-then-render split (`buildDayStepProjection` → `renderDayStep`) is the shape an availability projection should copy.
- `src/telegram/planning-renderers.ts` — `renderConfirmedStep` is the render D-02 converts into a transition; `lineupLines`, `planningOwnerLine`, `dayHeadingLabel`, `PLANNING_DAY_LEGEND` / `PLANNING_CHOSEN_LEGEND` and the marker constants are the direct model for D-08's marked list and legend.
- `src/domain/planning/target-week.ts` — `WEEK_CLAIMING_STATUSES` is the single list D-15 extends with `BOOKED`; the comment there states the invariant that only a week-claiming status claims its week.
- `src/domain/roster/roster-service.ts` — safe display labels and the `Intl.Collator` ordering that fixes D-08's stable line order.
- `src/domain/auth/authorization-service.ts` and `src/domain/auth/planning-access-service.ts` — the fresh current-role lookup D-13 needs for administrator eligibility.
- `src/shared/callback-schema.ts` — `planningTargetSchema`, `createPlanningTarget`, `parsePlanningTarget`, and `createCallbackToken` (`v1:<uuid>`); the vocabulary is derived from the minting sites, so new actions are added at both ends.
- `src/telegram/callbacks.ts` — `registerCallbackBoundary`, the acknowledge-authorize-parse-load-dispatch boundary every new callback must cross.
- `src/shared/logger.ts` — the redacting `SafeLogger`; every caught value must be bound under the `err` key or it is unloggable (Phase 1 finding F-4).

### Established Patterns

- Durable state in PostgreSQL via Prisma with `timestamptz`, `BigInt` chat/user ids, explicit migrations, and `revision` / `expectedRevision` guarding every mutation.
- Callback tokens carry no identity, date, or authorization claim — only an opaque token resolved against a server-side `CallbackAction` row bound to chat, actor, target, and expiry.
- One acknowledgement per `callback_query.id`, deferred to the branch that owns the outcome, with a boundary-level fallback.
- Routes are declared in a closed union table (`PLANNING_ROUTES` / `ALL_ROUTES` in `src/telegram/handlers.ts`) with an explicit `protectedWhen` of `always` or `in-flight` — the distinction is load-bearing and conflating it caused finding F-7.
- Duplicate or replayed confirmations return `Already applied.` with no second transition.
- `sequentialize` by chat key is installed by `createBot` before handler registration — this is what makes D-11's immediate per-answer edit safe.
- Civil dates are stored as `"YYYY-MM-DD"` strings, never `@db.Date`; minute-of-day integers, never wall-clock strings.

### Integration Points

- `prisma/schema.prisma` — `PlanningRoundStatus` gains `BOOKED` (D-15) and `PlanningParticipant` gains the durable answer; one migration carries both. `CallbackActionKind` gains whatever the answering and booking-confirmation actions need.
- `src/domain/planning/planning-service.ts` — the confirm transaction extends to open the availability round (D-01), and the service gains the answer, booking-confirmation, and booking-apply transitions.
- `src/telegram/planning-handlers.ts` — `dispatchPlanningCallback` gains the new branches; `handlePlanStatusCommand` must render the availability card, which is the D-03 recovery path.
- `src/domain/planning/target-week.ts` — `WEEK_CLAIMING_STATUSES` extension (D-15); this is the seam Phase 4's LIFE-02 lands on.
- `prisma/migrate-deploy.mjs` and `tests/integration/migration-preflight.test.ts` — a new migration means the Phase 2 preflight classifier and its real-PostgreSQL matrix need their cutoff updated.

</code_context>

<specifics>
## Specific Ideas

- Confirm should be the last gesture the author has to make. The band gets asked the moment the proposal is real — no second "now actually send it" step to forget.
- One card, from `/plan` through to the answers. The round reads as a single evolving message, not a trail of wizard artifacts.
- A mis-tap must never cost the group a round. That is the whole reason answers stay changeable.
- The list of names should not move. People look for their own line, and reshuffling it on every answer makes the card harder to read exactly when it is being read most.
- Unanimity is worth a notification. Everything else in the round can be a quiet edit; "everyone can make it, book it" cannot.
- Booking is the round's closing gesture — after it, there is nothing left on the card to press.

</specifics>

<deferred>
## Deferred Ideas

- **The "Cannot attend" → close-and-replan flow** — Phase 4 (AVAIL-05/AVAIL-06). D-05 deliberately leaves the round in the state that trigger will attach to.
- **Undoing or changing a booking** — Phase 4 (LIFE-03/LIFE-04). D-14's confirmation step exists precisely because Phase 3 has no undo.
- **Booked rounds counting as scheduled for future target-week selection, and supplying previous-rehearsal defaults** — Phase 4 (LIFE-02/LIFE-05). D-15 puts `BOOKED` in `WEEK_CLAIMING_STATUSES` so the seam exists, but the previous-rehearsal defaults themselves are Phase 4's.
- **Reconciling AVAIL-06's "participant snapshot preserved unless explicitly changed" with roster-as-lineup** — inherited from Phase 2's deferred list. D-06 settles the Phase 3 half (the snapshot is authoritative for a round's life); the "unless explicitly changed" half is Phase 4's to decide.
- **Pinging outstanding participants** — Phase 5 (REM-04). D-10 keeps notifications off the card edit path so this lands cleanly in a fresh reminder message.
- **Per-round participant adjustment** — still deferred from Phase 2 D-09; would revive PLAN-09 as its own decision.

</deferred>

---

*Phase: 3-Availability and Booking Decision*
*Context gathered: 2026-09-05*
