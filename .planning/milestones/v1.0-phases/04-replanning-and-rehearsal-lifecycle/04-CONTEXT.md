# Phase 4: Replanning and Rehearsal Lifecycle - Context

**Gathered:** 2026-09-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 3 gave a round exactly one exit: everyone answers "Can attend" and somebody marks it booked. Phase 4 gives the round its remaining transitions. A "Cannot attend" now routes back into a fresh proposal instead of parking the round in a terminal `blocked` state; a rehearsal that has been agreed — or already booked — can be changed or cancelled, and cancelling gives its week back to the chat. The stale-button semantics Phase 3 inherited become a delivered, named capability, because replanning is the first thing in the project that leaves a live keyboard pointing at a round that no longer exists.

Requirements in scope: AVAIL-05, AVAIL-06, AVAIL-08, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06.

Explicitly **not** this phase:

- Every reminder and follow-up, and the suppression of obsolete ones after a replan or cancellation (REM-01 through REM-05) — Phase 5.
- Update/callback idempotency and restart-safe reminder resumption as delivered capabilities (RELI-02, RELI-03) — Phase 5. Phase 4 still holds the `expectedRevision` and consumed-token guards it inherits.
- Per-round participant adjustment (the removed PLAN-09) — still deferred; D-07 below settles AVAIL-06 without reviving it.
- Automatic studio booking (BOOK-01 through BOOK-05) — v2.

**Already satisfied, verify rather than build:** LIFE-02. `WEEK_CLAIMING_STATUSES` in `src/domain/planning/target-week.ts` already contains `BOOKED` (Phase 3 D-15), so a manually booked rehearsal already counts as scheduled when `targetWeekStart()` chooses a target week. Phase 4 must prove this with coverage, not re-implement it.

</domain>

<decisions>
## Implementation Decisions

### Replan Trigger (AVAIL-05)

- **D-01:** The **first "Cannot attend" closes the round and prompts for a new slot immediately** — the band is not made to wait for stragglers to answer about a slot that is already dead. But the closure is **reversible until a new slot is committed**: the person who blocked it can flip their own answer back and the round reopens exactly as it was. This **amends Phase 3 D-05** ("records and keeps the round open"), and it is the only reading that satisfies AVAIL-05's literal text without discarding D-04's rule that a mis-tap must never cost the group a round. The closure is a *derivation*, not a new column: `availabilityOutcome()` returns `blocked` as soon as any participant is `UNAVAILABLE`, instead of waiting for a complete answer set. — **Reversibility:** costly — the `blocked` derivation is read by the card, the announcement directive, and the replan gate; moving the trigger again means changing all three together.
- **D-02:** While the round is blocked, **both answer buttons stay live for every participant**. Nothing is removed from the keyboard; the card text changes to say the slot does not work and who blocked it, and the replan control is added for the eligible actor. D-04 therefore stays literally true for the round's whole life, there is no second class of participant to render, and reopening needs no special action — it is just somebody tapping "Can attend".
- **D-03:** The **announcement slot is the round's single break-through message**, carrying whichever fact the round currently warrants: "everyone is available, book it", or "this slot does not work, a new one is needed". This reuses the existing `AnnouncementDirective` union (`post` / `edit` / `retract` / `none`), the `readyAnnouncedAt` compare-and-set, and the `READY_ANNOUNCE_COOLDOWN_MS` window wholesale — a reopen retracts the blocked message the same way a flipped answer already retracts a ready-to-book one. No third durable message slot is introduced. — **Reversibility:** costly — the claim column and the directive union acquire a second meaning; splitting the two message kinds apart later means a new column, a new re-post path, and a change to what `readyAnnouncedAt` asserts.
- **D-04:** **The planning author or any current chat administrator** may act on the replan prompt, resolved fresh at the action boundary per AUTH-02 and Phase 1 D-12 — the same eligibility rule Phase 3 D-13 gave to booking, and for the same reason: a blocked round must not stall for thirty minutes waiting on `PLANNING_INACTIVITY_MS` because its author has gone quiet. Anyone else gets a private alert naming who can. The attribution question this raises is settled by D-06.

### Replan Mechanics (AVAIL-06, AVAIL-08)

- **D-05:** Replanning **supersedes the old round and creates a new one**, in one transaction: the old round moves to `SUPERSEDED` and releases `activeWeekStart` to NULL, and a new `PlanningRound` is created at `step: DAY` re-claiming that week. Every attempted slot survives as a row, so the chat has a record of what was tried. AVAIL-08 becomes **structural** rather than a race to win — an old button's token names a superseded round id, and the refusal is decided by identity, not by an `expectedRevision` comparison. The two writes to `activeWeekStart` must be in the same transaction or `@@unique([chatId, activeWeekStart])` will reject the new round. — **Reversibility:** one-way — a round-per-attempt and a link column become the durable history that Phase 5's reminder targeting and every later lifecycle read consume; collapsing back to a single rewound row means a migration and a change to what "a round" means.
- **D-06:** The new round's **`authorUserId` is whoever replanned**. This is what makes D-04's author-or-administrator eligibility coherent rather than a violation of D-02: an administrator who replans does not act on someone else's round, they start their own. The card's attribution line and its controls therefore cannot disagree, which is the drift `planningOwnerLine` exists to prevent.
- **D-07:** The new round **snapshots the chat's currently active roster**, exactly as Confirm does in Phase 2 — it is not a copy of the superseded round's participants. This is the reconciliation AVAIL-06 has been waiting for since Phase 2's deferred list: **"explicitly changed" means roster management** (ROST-01 / ROST-02), and "preserved" is simply what a re-snapshot yields when nobody changed the roster, which is the normal case. It also makes Phase 3 D-06's own sentence — "roster changes take effect on the *next* round" — true rather than aspirational, because under D-05 a replan **is** a next round. A replan attempted with an emptied active roster is refused, per Phase 2 D-10. — **Reversibility:** one-way — this is the settled answer to a cross-phase requirement tension; reversing it re-opens PLAN-09 and needs a per-round participant surface that does not exist.
- **D-08:** When the new round starts, the superseded round's card is **edited to a terminal, keyboard-less line recording the attempt that failed**, its announcement is retracted, and the **new round posts its own day selector as a fresh message**. After a block the old card is buried under chat traffic and the new one has to be where people are looking — the same instinct as Phase 2 D-14's status re-post. The chat is left with a readable trail of what the band tried.
- **D-09:** A tap on a **superseded round's** button receives a **distinct private alert** — "this slot was replanned", pointing at `/plan_status` for the current card. It must **not** reuse `PLANNING_STALE_TEXT`, whose advice ("send /plan to start again") is actively wrong here: the replanned round already claims the week, so `/plan` would refuse with `week-taken` and leave the tapper with two errors and no explanation. Same principle as Phase 3's `not-a-participant` and `already-booked` — a distinct fact gets distinct words because it sends a person somewhere different.

### Cancel and Change (LIFE-03, LIFE-04, LIFE-06)

- **D-10:** Cancel and change are reachable **both as commands and as inline controls** — `/plan_cancel` and `/plan_change` alongside `/plan` and `/plan_status`, plus buttons on the round's live message. The command is the surface that survives: LIFE-03 and LIFE-04 must work on a rehearsal booked days earlier, whose messages chat traffic has long buried. The buttons are what the band will actually reach for while the round is on screen.
- **D-11:** The controls ride the **round's current control-bearing message** — the announcement when one exists, the availability card when it does not. This is the rule Phase 3 D-17 already established for Mark as booked. Phase 3 D-16 ("a closed card carries no controls") is **narrowed, not reversed**: booking removes the *answer* controls, and lifecycle controls follow the control-bearing message. There is exactly one keyboard to reason about at any moment, and it is always on the message the band most recently heard from.
- **D-12:** **Change runs the same machine as replan** (D-05): supersede, re-snapshot the live roster, neuter the old messages, post a fresh day selector. LIFE-04's "start a fresh availability round" and AVAIL-06's are the same sentence, and they must not become two code paths that can drift.
- **D-13:** Cancellation writes a **new `CANCELLED` value on `PlanningRoundStatus`, appended LAST**, together with `cancelledAt` and `cancelledByUserId` detail columns on the Phase 3 D-15 precedent — the status is the authority for "is it cancelled", the timestamps are detail. `CANCELLED` is absent from `WEEK_CLAIMING_STATUSES`, which is what makes LIFE-06's week release automatic, and absent from `RECOVERABLE_ROUND_STATUSES`. It is deliberately **not** a reuse of `SUPERSEDED`: a superseded round has a successor and a cancelled one never will, and `previousRehearsal()` must never read a cancelled slot as a rehearsal that happened. The append position is load-bearing — `hasExactValues` in `prisma/migrate-deploy.mjs` compares the catalog's labels index by index, and a label inserted mid-list fails the deploy preflight on a correctly migrated database. — **Reversibility:** one-way — a Prisma enum value, its migration, and the preflight's expected-label list.
- **D-14:** Both cancel and change take a **named confirmation step**, on Phase 3 D-14's precedent: these are the transitions with no undo, and the confirm-then-apply pair is the established mis-tap guard. Eligibility is fixed by the requirements themselves — the planning author or a chat administrator — and is re-decided **inside the apply transaction**, never carried on the wire.
- **D-15:** Cancelling a **`BOOKED`** rehearsal posts a **new group message**; cancelling a round that is still collecting **edits the control message in place**. Phase 3 D-12's argument that an in-place edit notifies nobody applies with more force to bad news than it did to good: the band has arranged their week around a booked rehearsal. A round somebody started by mistake ninety seconds ago has cost nobody anything and does not earn a notification.

### Rehearsal Lifecycle Defaults (LIFE-02, LIFE-05)

- **D-16:** `previousRehearsal()` moves from `startsAt < now` to **`endsAt < now`** — LIFE-05's literal "after a booked rehearsal's scheduled end". `endsAt` is written by the confirm transaction (`startsAt + durationMinutes * 60_000`) so it is non-null for every `CONFIRMED` or `BOOKED` round; no column, backfill, or null-fallback branch is needed. A rehearsal in progress stops being simultaneously "happening now" and "the last one".
- **D-17:** `previousRehearsal()` **keeps reading `WEEK_CLAIMING_STATUSES`** — `CONFIRMED` or `BOOKED`. LIFE-05's literal "booked rehearsal" is deliberately not honoured here, for the reason Phase 3 recorded when it broadened this function: narrowing to booked-only would blank the PLAN-05 usual-day and PLAN-07 last-time markers the first time a chat skips Mark as booked, silently, with nothing on screen to say why. `CANCELLED` is excluded for free by D-13, which is the correction LIFE-05 actually needed.
- **D-18:** `targetWeekStart()` **rolls past a week that has no still-selectable day left**. This is what LIFE-06's "so a new planning process can be started *when appropriate*" means concretely: cancel on Tuesday and the band re-plans Thursday; cancel on Sunday night and `/plan` offers next week rather than a card whose seven buttons all refuse as past. It is the containment idea of Phase 2 D-06 applied one level up, and it must reuse the same chat-local past-day rule (`isPastDay`) rather than restating it.
- **D-19:** `wasPreviousParticipant()` is **decoupled from `WEEK_CLAIMING_STATUSES`**: **any** round a person was snapshotted into confers `PREVIOUS_PARTICIPANTS` standing, whatever that round's status became. Standing comes from having been *asked* — an administrator put them on the roster and a round took their name; a slot the band later cancelled or replanned does not un-vouch for them. Without this, D-13 introduces a silent regression in which cancelling a chat's only rehearsal revokes planning access for every non-administrator, with no message anywhere explaining it. Phase 3's own comment already notes the two questions "share a status filter and nothing else". — **Reversibility:** costly — this is an authorization input (AUTH-01); widening and then narrowing it again would revoke access people already have.

### Claude's Discretion

- Exact command names, button labels, marker glyphs, confirmation copy, and every line of card and announcement text, provided the decisions above hold. Copy must never offer an undo for a cancellation (D-14) and must never send a superseded-button tapper to `/plan` (D-09).
- The name and direction of the link between a superseded round and its successor, and whether the relation is stored at all or derived from `(chatId, targetWeekStart, createdAt)`. Whatever is chosen must make "which round replaced this one" answerable in one query for D-09's alert.
- **Whether `/plan_change` may move a rehearsal to a different target week, or only within the round's own snapshotted `targetWeekStart`.** Not decided in discussion; research and planning must resolve it and record the choice. Either answer must keep `@@unique([chatId, activeWeekStart])` honest — a cross-week change releases one week and claims another in the same transaction — and must not let a change quietly claim a week that `weekIsClaimed()` says is already spoken for.
- The callback action kinds, `planningTargetSchema` entries, and `PLANNING_ROUTES` ids for replan, cancel, change, and their confirmation pairs — following the existing conventions, with `protectedWhen` declared deliberately (Phase 1 finding F-7).
- The durable shape of the `CANCELLED` migration and whether it travels with the `cancelledAt` / `cancelledByUserId` columns in one migration or two. Note that `ALTER TYPE ... ADD VALUE` cannot be referenced in the transaction that adds it, so nothing in the migration itself may name the new label — the schema comment on `ParticipantAvailability` records why.
- Retry, backoff, and error classification on the neuter-old-card and post-new-card paths (D-08), within the Phase 3 D-03 rule that a failed edit never rolls back a committed durable transition.
- Whether the blocked-state and cancelled-state renders are separate functions or one parameterised render, provided the `blocked` derivation itself stays a single function (Phase 3's standing constraint).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Acceptance

- `.planning/ROADMAP.md` — the Phase 4 entry: goal, mapped requirements, and the four success criteria. Read the Phase 5 entry too, to see exactly what this phase must *not* deliver.
- `.planning/REQUIREMENTS.md` — AVAIL-05, AVAIL-06, AVAIL-08, LIFE-02 through LIFE-06 are this phase. REM-01 through REM-05, RELI-02 and RELI-03 are Phase 5 and are out of scope here. PLAN-09 remains removed.

### Product Constraints

- `.planning/PROJECT.md` — Telegram-group-only interaction, administrator-managed roster, per-chat settings, agent-runtime portability, English documentation. Its Key Decisions table carries the two-live-messages rule (D-17), the atomic unanimity claim, the apply-time eligibility re-decision, and the exactly-once callback acknowledgement contract that every route added here must follow.
- `.claude/CLAUDE.md` — verified stack versions and the binding Telegram design constraints: 1–64 byte `callback_data`, opaque versioned tokens with authorization resolved from PostgreSQL, acknowledge every callback exactly once, treat updates as untrusted and unordered, `bigint` at the repository boundary.

### Prior Phase Decisions (binding, do not re-litigate)

- `.planning/phases/03-availability-and-booking-decision/03-CONTEXT.md` — D-04 (answers freely changeable until the round closes), D-05 (**amended by D-01 above**), D-06 (the confirm-time snapshot is authoritative for a round's life), D-12 and its **amendment / D-17** (two live messages: `anchorMessageId` for the card, `announcementMessageId` for the announcement; neither column ever written with the other's id), D-13 (author-or-administrator eligibility resolved fresh), D-14 (named confirmation for an irreversible transition), D-15 (`BOOKED` on `PlanningRoundStatus`, added to `WEEK_CLAIMING_STATUSES`), D-16 (**narrowed by D-11 above**).
- `.planning/phases/02-weekly-rehearsal-proposal/02-CONTEXT.md` — D-01 (single in-place anchor card), D-02 (author-only card control), D-03 (Back on every step), D-05/D-06/D-07 (all seven days rendered; past days and past hours refuse selection; the whole rehearsal must fit inside the daily boundary), D-09/D-10/D-11 (roster-is-lineup, empty-roster refusal, confirm-time snapshot), D-12/D-13 (abandonment by inactivity, takeover keeps selections), D-14/D-15 (status re-post and re-anchor with a cooldown; anyone may request status). Its Requirements Ripple section is the origin of the AVAIL-06 tension that D-07 above settles.
- `.planning/phases/01-chat-readiness/01-CONTEXT.md` — D-02 (30-minute expiry precedent), D-03 (atomic promotion on final confirmation), D-12 (administrators always pass the planning-access policy), D-13 (private alert for a rejected button, concise group reply for a rejected command).
- `.planning/STATE.md` — Accumulated Decisions, in particular the exactly-once acknowledgement deferred to the branch that owns the outcome; opaque `v1:<uuid>` tokens with all state in the server-side `CallbackAction` row; actor-bound records with `expectedRevision` transactions; `Already applied.` on replays; callback alert budgets measured in UTF-16 code units; an unbound catch clause is unloggable. Its Blockers section carries the Phase 3 declared precondition that the one-live-`book-request`-row invariant holds only under a single polling process.

### Migration Constraints (live, and this phase adds a migration)

- `.planning/phases/02-weekly-rehearsal-proposal/.continue-here.md` — the blocking migration-preflight anti-patterns: schema state must agree with migration history, and table absence alone never implies a safe prefix. D-13 adds an enum label and two columns, so these constraints bind directly.
- `prisma/migrate-deploy.mjs` — `hasExactValues` compares enum labels index by index; its expected-label list and its committed ledger cutoff both need updating for the `CANCELLED` migration.
- `tests/integration/migration-preflight.test.ts` — the existing real-PostgreSQL matrix that must be extended for the new migration.
- `prisma/schema.prisma` — the comment on `ParticipantAvailability` records why `ALTER TYPE ... ADD VALUE` cannot be referenced by the migration that adds it; the comment on `PlanningRoundStatus` records why labels are appended last.

No external specifications or ADRs outside `.planning/`, `.claude/CLAUDE.md`, and the repository itself were referenced during this discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/domain/planning/target-week.ts` — `WEEK_CLAIMING_STATUSES` (D-13 must leave `CANCELLED` out of it, which is all LIFE-06 needs), `weekIsClaimed()`, and `targetWeekStart()` — the function D-18 edits. Its comment already names Phase 4's LIFE-02 / LIFE-06 as the next editor of the status set.
- `src/domain/planning/planning-service.ts` —
  - `availabilityOutcome()` — the single `blocked` derivation D-01 changes. Currently returns `collecting` while anyone is pending; D-01 makes any `UNAVAILABLE` answer sufficient.
  - `AnnouncementDirective` (`post` / `edit` / `retract` / `none`), `claimAnnouncementRepost`, `recordAnnouncement`, `releaseAnnouncementClaim`, `reanchorAnnouncement`, and `READY_ANNOUNCE_COOLDOWN_MS` — D-03 reuses this machinery for the blocked message.
  - `previousRehearsal()` (D-16, D-17) and `wasPreviousParticipant()` (D-19) — one function each, no call site restates either query.
  - `confirm()` — the transaction D-05 and D-12 model the supersede-and-create pair on; it already writes `startsAt`/`endsAt`, snapshots participants, and opens the availability round in one statement.
  - `requestBooking` / `keepBooking` / `applyBooking` and the shared `BookingRefusal` union — the confirm-then-apply pair D-14 copies, including apply-time eligibility re-decision.
  - `supersedeStaleRounds()` — the existing `SUPERSEDED` + `activeWeekStart: null` + `revision` increment write, and the shape D-05's transaction extends.
  - `isTakeoverEligible` / `PLANNING_INACTIVITY_MS` — the escape hatch D-04 makes less load-bearing but does not remove.
  - `RECOVERABLE_ROUND_STATUSES` — its comment explicitly warns that sharing one list with `WEEK_CLAIMING_STATUSES` would let a Phase 4 edit to one silently change the other. D-13 and D-19 each touch a different set; keep all three separate.
- `src/telegram/planning-renderers.ts` — `renderConfirmedStep`, the availability card render, `lineupLines`, `planningOwnerLine`, marker constants and legends. D-02's blocked card and D-08's terminal attempt line are renders on this surface.
- `src/telegram/planning-handlers.ts` — `dispatchPlanningCallback`, `handlePlanStatusCommand`, `retractStaleAnnouncement`, `closeBookedRound`, and the existing `stale-action` outcome logging. D-09 adds a refusal beside `PLANNING_STALE_TEXT` (currently `"This planning action is no longer available. Send /plan to start again."`).
- `src/domain/auth/authorization-service.ts` (`currentRole`, the non-destructive accessor — the administrator-requirement helper beside it destroys the actor's drafts on denial, threat T-02-14) and `src/domain/auth/planning-access-service.ts` — the fresh role lookups D-04 and D-14 need.
- `src/domain/roster/roster-service.ts` — `listActiveMemberships`, the `Intl.Collator` order, and `memberLabel`; D-07's re-snapshot reads exactly what Confirm reads.
- `src/shared/callback-schema.ts` — `planningTargetSchema`, `createPlanningTarget`, `parsePlanningTarget`, `createCallbackToken`.
- `src/telegram/callbacks.ts` — `registerCallbackBoundary` and its `staleText` / `PLANNING_STALE_TEXT` wiring, the acknowledge-authorize-parse-load-dispatch boundary every new action crosses.

### Established Patterns

- Durable state in PostgreSQL via Prisma with `timestamptz`, `BigInt` chat/user ids, explicit migrations, and `revision` / `expectedRevision` guarding every mutation.
- Callback tokens carry no identity, date, or authorization claim — only an opaque `v1:<uuid>` resolved against a server-side `CallbackAction` row bound to chat, actor, target, and expiry. Eligibility is re-decided inside the apply transaction.
- One acknowledgement per `callback_query.id`, deferred to the branch that owns the outcome, with a boundary-level fallback; alert budgets measured in UTF-16 code units.
- Routes declared in a closed union table (`PLANNING_ROUTES` / `ALL_ROUTES`) with an explicit `protectedWhen` of `always` or `in-flight`.
- Duplicate or replayed confirmations return `Already applied.` with no second transition.
- `sequentialize` by chat key is installed by `createBot` before handler registration — a single-process guarantee, and the declared precondition of Phase 3's one-live-`book-request`-row invariant.
- Civil dates stored as `"YYYY-MM-DD"` strings, never `@db.Date`; minute-of-day integers, never wall-clock strings.
- A status set that answers a distinct question gets its own named constant, never a shared list.

### Integration Points

- `prisma/schema.prisma` — `PlanningRoundStatus` gains `CANCELLED` **appended last**; `PlanningRound` gains `cancelledAt`, `cancelledByUserId`, and whatever link D-05 chooses for the superseded → successor relation. `CallbackActionKind` may need entries for the replan, cancel, and change confirmation pairs.
- `prisma/migrate-deploy.mjs` and `tests/integration/migration-preflight.test.ts` — the preflight's expected enum labels and committed ledger cutoff both move; the real-PostgreSQL matrix gains cases for this migration.
- `src/domain/planning/target-week.ts` — `targetWeekStart()` gains the selectable-day rule (D-18); the status constants stay three separate lists.
- `src/domain/planning/planning-service.ts` — `availabilityOutcome()` (D-01), `previousRehearsal()` (D-16/D-17), `wasPreviousParticipant()` (D-19), plus new replan / cancel / change transitions modelled on `confirm()` and the booking confirm-apply pair.
- `src/telegram/planning-handlers.ts` and `src/telegram/handlers.ts` — new command routes for `/plan_cancel` and `/plan_change` (D-10), new callback branches, and the D-09 refusal.
- `src/telegram/planning-renderers.ts` — the blocked card, the terminal attempt line, the cancelled-state render, and the blocked variant of the announcement message.

</code_context>

<specifics>
## Specific Ideas

- A mis-tap must never cost the band a round — but neither should the band be made to chase answers about a slot that is already dead. Both, not one.
- The chat should be able to read back what was tried. "Tue 19:00 — replanned" left in the scrollback is the record; a rewound card that erases its own history is not.
- The new card goes where people are looking. After a block, the old one is buried.
- One keyboard at a time, and always on the message the band most recently heard from.
- A refusal has to send the person somewhere that works. Telling a superseded-button tapper to send `/plan` — when the replanned round already holds the week — is worse than saying nothing.
- Cancelling something the band arranged their week around is news. Cancelling a `/plan` somebody started by mistake ninety seconds ago is not.
- Being asked is what confers standing. A rehearsal getting cancelled does not un-invite the people who were in it.

</specifics>

<deferred>
## Deferred Ideas

- **Suppressing reminders made obsolete by a replan, cancellation, or completion** — Phase 5 (REM-05). D-05's supersede-and-create and D-13's `CANCELLED` are the state transitions that suppression will key off; Phase 4 must leave them cleanly observable and nothing more.
- **Targeted follow-ups that mention only outstanding participants** — Phase 5 (REM-03/REM-04). Phase 3 D-10 keeps real mentions off the card edit path so this still lands cleanly in a fresh message.
- **Duplicate-update and restart idempotency as delivered capabilities** — Phase 5 (RELI-02/RELI-03). Phase 4 inherits and must not weaken the `expectedRevision` and consumed-token guards.
- **Per-round participant adjustment** — still deferred from Phase 2 D-09; would revive the removed PLAN-09. D-07 settles AVAIL-06 without it, and deliberately so.
- **Promoting the one-live-`book-request`-row invariant to a partial unique index** on `(chatId, targetId) WHERE consumedAt IS NULL` — the declared precondition recorded in `03-SECURITY.md`. Phase 4 adds more confirm-then-apply pairs under the same single-process assumption; if any of them makes multi-process deployment more attractive, this is the promotion path.
- **Automatic studio booking** — v2 (BOOK-01 through BOOK-05).

No scope creep was raised during this discussion; every item above was already deferred by an earlier phase or by the roadmap.

</deferred>

---

*Phase: 4-Replanning and Rehearsal Lifecycle*
*Context gathered: 2026-09-08*
