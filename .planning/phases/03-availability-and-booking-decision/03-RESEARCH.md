# Phase 3: Availability and Booking Decision - Research

**Researched:** 2026-09-05
**Domain:** Multi-actor inline availability card over a durable PostgreSQL round, on the existing grammY + Prisma 7 + PostgreSQL 18 stack
**Confidence:** HIGH for the in-repo integration surface (every claim below was read from source this session); MEDIUM for the Telegram and PostgreSQL platform rules (official docs); LOW for the two Prisma semantics questions in the Assumptions Log, both of which have a zero-cost workaround that removes the dependency on the answer.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Publishing the Availability Card

- **D-01:** Confirm **auto-publishes**. The transaction that commits the proposal also opens the availability round — there is no separate Publish button, command, or author gesture. This settles the question Phase 2 D-04 deliberately left open by refusing to ship a placeholder control: the answer is that no control was needed. — **Reversibility:** costly — publication becomes part of the confirm transaction and the round's state machine; splitting it back out later means a new callback action kind, a new intermediate durable state, and a change to what Confirm means.
- **D-02:** The availability card **replaces the anchor in place**. `renderConfirmedStep` stops being a terminal render and becomes a transition: the round keeps exactly one live `anchorMessageId` from `/plan` through to booking, carrying Phase 2 D-01 forward unbroken. The confirmed summary is folded into the availability card's header rather than surviving as its own message.
- **D-03:** A **failed publish edit never rolls back a committed proposal**. The durable round stands as open-for-availability regardless of what Telegram did with the edit; recovery is the existing status re-post (Phase 2 D-14), which must therefore render the availability card as well as the wizard steps. No compensating message is posted on the failure path.

#### Answering and Changing

- **D-04:** Answers are **freely changeable until the round closes**. Both buttons stay live for every participant; tapping the other one overwrites the previous answer. Re-tapping the answer you already gave is an idempotent no-op acknowledged with a short private alert, following the established `Already applied.` shape. A mis-tap must never be able to derail a round.
- **D-05:** A "Cannot attend" **records and keeps the round open**. It marks that participant unavailable and collection continues — this is the only behavior consistent with D-04, and it leaves the round in exactly the state Phase 4's AVAIL-05 trigger will attach to. Once every participant has answered and at least one said no, the card states plainly that the slot does not work. Phase 3 ships **no** replan action, so the card must not offer one or imply one is a tap away.
- **D-06:** The **confirm-time snapshot is authoritative for the round's whole life**. A participant removed from the roster mid-round can still answer, and still counts toward completion; a member added mid-round is not in this round. Roster changes take effect on the *next* round, which is what Phase 2 D-09's "change the roster to change the lineup" already means. The completion denominator therefore cannot shift under an open round. This is the reconciliation of AUTH-02 (revalidate current permission) against D-11 for this surface: the permission being revalidated is snapshot membership, read fresh from `PlanningParticipant` at the action boundary, not live roster membership. — **Reversibility:** one-way — Phase 4's AVAIL-06 ("participant snapshot preserved unless explicitly changed") and Phase 5's follow-up targeting both read this rule; changing it later changes who a booked round was ever asking.
- **D-07:** A tap from someone **outside the snapshot** is refused with a private callback alert naming the reason — invisible to the group, per Phase 1 D-13 and the same shape as Phase 2's owner-naming refusal. The alert does not route them to roster management; that is Phase 1's surface, not this card's.

#### Card Status Display

- **D-08:** The card renders **one roster-ordered line per participant with a leading marker** (pending / can attend / cannot attend) and a legend above the list — the Phase 2 D-08 marker-plus-legend pattern, not grouped sections. Order is fixed by the roster's `Intl.Collator` ordering and never reshuffles as answers arrive, so a participant can always find their own name in the same place.
- **D-09:** Overall completion (AVAIL-04) is **a single count line above the list** — how many of how many have answered. The marked list underneath already says who is missing; no separate outstanding-names line is rendered on the card.
- **D-10:** Names are **plain safe display labels, never Telegram mentions**. The card is edited on every single answer, so real mentions would risk re-notifying the whole lineup repeatedly with no new information. Targeted pinging belongs to Phase 5's follow-ups (REM-04), where it happens once per reminder in a fresh message.
- **D-11:** The card is **edited immediately on every answer**, serialized by the chat-key `sequentialize` that `createBot` already installs. No debouncing or coalescing: a participant's own tap must always be visibly acknowledged, and a band-sized roster produces only a handful of edits.

#### Ready to Book and Manual Booking

- **D-12:** Unanimity (AVAIL-07) produces a **new announcement message**, not only an edit. The anchor card updates to its all-clear state and a fresh message lands in the chat saying everyone is available and the rehearsal should be booked. An in-place edit notifies nobody, and this is the one moment in the round that has to break through. **The announcement message carries the Mark as booked control and becomes the round's new anchor.** — **Reversibility:** costly — the anchor moves to a second message id at the end of the round, which every later re-anchor, status re-post, and Phase 4 lifecycle action must respect.
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

### Deferred Ideas (OUT OF SCOPE)

- **The "Cannot attend" → close-and-replan flow** — Phase 4 (AVAIL-05/AVAIL-06). D-05 deliberately leaves the round in the state that trigger will attach to.
- **Undoing or changing a booking** — Phase 4 (LIFE-03/LIFE-04). D-14's confirmation step exists precisely because Phase 3 has no undo.
- **Booked rounds counting as scheduled for future target-week selection, and supplying previous-rehearsal defaults** — Phase 4 (LIFE-02/LIFE-05). D-15 puts `BOOKED` in `WEEK_CLAIMING_STATUSES` so the seam exists, but the previous-rehearsal defaults themselves are Phase 4's.
- **Reconciling AVAIL-06's "participant snapshot preserved unless explicitly changed" with roster-as-lineup** — inherited from Phase 2's deferred list. D-06 settles the Phase 3 half (the snapshot is authoritative for a round's life); the "unless explicitly changed" half is Phase 4's to decide.
- **Pinging outstanding participants** — Phase 5 (REM-04). D-10 keeps notifications off the card edit path so this lands cleanly in a fresh reminder message.
- **Per-round participant adjustment** — still deferred from Phase 2 D-09; would revive PLAN-09 as its own decision.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AVAIL-01 | The planning author can publish a custom availability card for the confirmed date, time, and participant snapshot. | Pattern 1 (Confirm-opens-availability, one transaction) + Pattern 2 (availability projection). D-01 makes publish implicit; the "author publishes" requirement is satisfied because only the author can press Confirm (Phase 2 D-02, enforced by `resolveOwnership`). |
| AVAIL-02 | An included participant can answer "Can attend" or "Cannot attend." | Pattern 3 (shared, non-consumable answer tokens) + Pattern 4 (per-participant compare-and-set). Finding F-1 and F-2 are the two structural departures from the Phase 2 transition template that make this possible. |
| AVAIL-03 | The bot rejects availability responses from users who are not included in the active participant snapshot. | Pattern 4's authorization read against `PlanningParticipant` (D-06/D-07), refused with a ≤200-character private alert. The boundary's chat-membership check is necessary but NOT sufficient — see Pitfall 4. |
| AVAIL-04 | The availability card shows every participant as pending, available, or unavailable and displays overall completion. | Pattern 2 — an `AvailabilityStepProjection` mirroring `ReviewStepProjection`, rendered through the existing `sortRosterMembers` / `memberLabel` / marker+legend pattern (D-08/D-09/D-10). |
| AVAIL-07 | When all included participants answer "Can attend," the bot announces that the rehearsal is ready to book. | Pattern 5 (one-shot announcement claim). The claim must be a database compare-and-set, not an application `if` — see Pitfall 3. |
| LIFE-01 | The planning author or a chat administrator can mark a ready rehearsal as manually booked. | Pattern 6 (confirm-then-apply booking pair) + Pattern 7 (`CONFIRMED → BOOKED` under an expected-revision guard). Finding F-7 is the set of call sites that must widen or the enum value silently breaks three shipped behaviours. |
</phase_requirements>

---

## Summary

Phase 3 introduces **no new technology**. Every external building block — grammY, `@grammyjs/runner`'s `sequentialize`, Prisma 7, PostgreSQL 18, Zod, the opaque-token callback boundary, the redacting logger, the single-anchor card pattern — is already installed and proven in Phases 1 and 2. The research effort therefore went entirely into the *integration* surface, and it found three structural problems that the Phase 2 transition template cannot solve as written.

**Problem 1 — the availability card is the project's first multi-actor keyboard.** Every callback action shipped so far is minted for exactly one actor and consumed exactly once: `mintStepActions` writes `actorUserId: round.authorUserId`, and every transition performs the atomic `updateMany ... consumedAt: null` compare-and-set. Two availability buttons on one message serving N participants can be neither actor-bound (one keyboard, N tappers) nor consumable (the first tap would kill the button for everyone else, and D-04 requires each participant to be able to change their own answer repeatedly). The answer tokens must be **shared and never consumed** — the `CallbackAction` row degrades to a chat/expiry-bound *capability to attempt an answer*, and the idempotency and authorization guarantees move onto the `PlanningParticipant` row itself as a per-participant compare-and-set. This is the same shape Phase 1 already blessed for roster page/retry actions ("idempotent reads: actor/chat/expiry-bound rows that are never consumed" — STATE.md), extended to a write.

**Problem 2 — `expectedRevision` on the round is the wrong guard for an answer.** Every Phase 2 transition serialises through `revision: { increment: 1 }` on `PlanningRound`, which is correct when exactly one actor (the author) may act. Here N participants legitimately act in parallel, and a round-level revision guard would make one of two simultaneous answers lose its race and be refused as `stale` — a correct answer, silently discarded. The answer transition must guard the **participant row** (compare-and-set on the availability value) and read the round only to assert its status. Round-level `revision` returns for the booking transition, which is single-actor and irreversible, exactly where it belongs.

**Problem 3 — `BOOKED` is not a one-line change.** D-15 says "add `BOOKED` to `WEEK_CLAIMING_STATUSES`", but that constant is an *inner* filter over a set that three separate queries have already narrowed with a hard-coded `status: PlanningRoundStatus.CONFIRMED`. Adding the enum value without widening those three queries silently regresses week claiming (PLAN-02/PLAN-03), the previous-rehearsal markers (PLAN-05/PLAN-07), and the `PREVIOUS_PARTICIPANTS` planning-access policy (AUTH-01) — the last of which is an authorization regression, not a cosmetic one. Separately, `PlanningService.status()` and `reanchor()` both filter `status: DRAFT`, so D-03's recovery path (the status re-post must render the availability card) is unreachable until both widen.

**Primary recommendation:** Model the answer as a nullable enum column on `PlanningParticipant` guarded by a per-participant compare-and-set inside one transaction that also asserts the round's status and re-reads the whole snapshot for the render; mint the two answer tokens once when the confirm transaction opens the round, with a lifetime derived from the round rather than the 30-minute wizard constant, and never consume them; claim the ready-to-book announcement with a one-shot database compare-and-set on a new nullable `readyAnnouncedAt` column; and carry `BOOKED` through **all four** hard-coded `CONFIRMED` filters plus `WEEK_CLAIMING_STATUSES`, not just the constant D-15 names.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Opening the availability round | Domain — `PlanningService.confirm` transaction | PostgreSQL (`PlanningRound`, `PlanningParticipant`) | D-01 folds publication into the existing confirm transaction; a partial outcome (proposal without an answerable round) has no recovery. |
| Publishing the card onto the anchor | Telegram surface — `dispatchConfirm` → `editAnchor` | — | D-02/D-03: the edit is a delivery concern and its failure must not roll back the committed round. |
| Answer authorization (AVAIL-03) | Domain — participant-snapshot read | PostgreSQL (`PlanningParticipant`) | D-06: snapshot membership, read fresh at the action boundary, is the permission AUTH-02 revalidates here — never live roster membership and never a token claim. |
| Answer idempotency (RELI-02) | PostgreSQL — per-participant compare-and-set | — | A single atomic `UPDATE ... WHERE availability IS DISTINCT FROM :new` is the gate; an application check-then-act is not. |
| Card projection (AVAIL-04) | Domain — `availabilityStepProjection` | — | Mirrors `reviewStepProjection`; pure data, so the render stays a total function of its input (keeps the Phase 2 "is this edit a no-op" fingerprint meaningful). |
| Card rendering / markers / legend | Telegram — `planning-renderers.ts` | `roster-renderers.ts` (`sortRosterMembers`, `memberLabel`) | D-08/D-10: one ordering function, one escaper, one label precedence — reused, never re-derived. |
| Ready-to-book announcement (AVAIL-07) | PostgreSQL — one-shot claim column | Telegram — `ctx.reply` + `setAnchor` | D-12 moves the anchor; the claim must be durable so a Telegram failure cannot be replayed into a second announcement. |
| Booking eligibility (LIFE-01) | Domain — `round.authorUserId` OR fresh `AuthorizationService.currentRole` | Telegram — role resolved at tap time, outside the transaction | D-13 + Phase 2's takeover precedent: never hold a PostgreSQL transaction open across a `getChatMember` HTTP round trip. |
| Booking transition (`CONFIRMED → BOOKED`) | Domain — expected-revision transaction | PostgreSQL (`PlanningRoundStatus`) | Single-actor and irreversible: the Phase 2 confirm template applies verbatim, including token consumption. |
| Week claiming with `BOOKED` | Domain — `target-week.ts` + three query call sites | — | Finding F-7: the constant alone is not the seam. |
| Rate-limit / delivery failure absorption | Telegram — `editAnchor` catch site | — | D-03 and D-11; classification lives in the bounded `PLANNING_CATCH_SITES` vocabulary. |

---

## Standard Stack

### Core — already installed, no change required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `grammy` | 1.45.1 | Telegram transport, `InlineKeyboard`, `GrammyError` | Already the project's framework; `GrammyError` is what `isNotModified` narrows on today. [VERIFIED: package.json:31] |
| `@grammyjs/runner` | 2.0.3 | `sequentialize` by chat key | Installed by `createBot` before handler registration; this is what makes D-11's immediate per-answer edit ordered. [VERIFIED: src/app/create-bot.ts:61-65] |
| `@prisma/client` / `prisma` | 7.9.1 | Typed access, migrations, interactive transactions | Every durable guarantee in the phase is a Prisma transaction plus a `WHERE`-clause compare-and-set. [VERIFIED: package.json:33,43] |
| `zod` | 4.4.3 | `planningTargetSchema` extension for the new actions | The existing target vocabulary is a strict Zod union; new actions are added there. [VERIFIED: package.json:38] |
| `pino` | 10.3.1 | `SafeLogger` with the allow-list redactor | New log fields not on the allow list are silently redacted — see Pitfall 9. [VERIFIED: package.json:36] |
| `vitest` | 4.1.11 | Unit + integration runner, two named projects | `npm run test:unit` / `npm run test:integration`. [VERIFIED: package.json:44, vitest.config.ts] |
| `testcontainers` | 12.1.0 | Disposable PostgreSQL for the migration and round suites | The migration-preflight matrix already runs against real PostgreSQL. [VERIFIED: package.json:47] |

### Supporting — evaluated and NOT recommended for this phase

| Library | Version | Purpose | Verdict |
|---------|---------|---------|---------|
| `@grammyjs/auto-retry` | 2.0.2 (latest on npm) | Transparent `retry_after` handling for 429 flood control | **Do not install in Phase 3.** It is a legitimate package (see Package Legitimacy Audit) and would help D-11's burst case, but STATE.md records that adding an npm root in this project is a human-gated event (`tz-lookup` rejected; `geo-tz` required a separate audit and explicit approval). The edit path already has a catch site and a bounded failure vocabulary; classify 429 there instead. If the owner later wants it, it is a one-line `bot.api.config.use(autoRetry())` in `createBot` and belongs in its own approved task. [CITED: https://grammy.dev/plugins/auto-retry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nullable `availability` enum column on `PlanningParticipant` | A separate `AvailabilityResponse` table | The separate table buys an append-only answer history (useful for Phase 4's replan audit) at the cost of a second uniqueness constraint, a join on every render, and a "latest answer" query that is a second place for the state machine to live. D-04 makes answers mutable and Phase 3 needs no history, so the column is correct. The column also keeps the completion count a single `groupBy`/array scan over rows already loaded for the render. |
| One-shot `readyAnnouncedAt` claim column | Deriving "already announced" from the presence of an announcement message id | Equivalent if the message-id column is written in the same statement; a separate `announcementMessageId` is needed anyway for D-12's anchor move. Prefer ONE column that is both the claim and the record, written in the claiming `updateMany` — two columns that can disagree is the exact defect `status`/`activeWeekStart` is commented against in the schema. |
| Deriving "all answered, at least one no" | An explicit round status | The discretion note allows either. Derive it — Phase 3 has no transition out of that state, an extra enum value costs a second migration hazard (Pitfall 1), and `WEEK_CLAIMING_STATUSES` would need a decision about it. Derive it in **one** exported function per the CONTEXT constraint. |
| Re-minting the answer tokens on every render | Minting once at publish with a round-derived lifetime | Re-minting refreshes expiry for free but changes the keyboard bytes on every edit, grows `CallbackAction` linearly with taps, and leaves a widening set of live tokens for the same button. Mint once. |

**Installation:** none. No package is added, removed, or upgraded in this phase.

**Version verification:** `npm view @grammyjs/auto-retry version` → `2.0.2`, published 2024-07-30, 36,433 weekly downloads, source `github.com/grammyjs/auto-retry`. [VERIFIED: npm registry via `gsd-tools query package-legitimacy check`] — recorded only because the package is named in the Supporting table as a rejected option.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@grammyjs/auto-retry` | npm | published 2024-07-30 | 36,433/wk | github.com/grammyjs/auto-retry | `OK` | **Not installed** — discussed and rejected for Phase 3 (new npm root is human-gated per STATE.md). If a later task adopts it, it needs no extra checkpoint on legitimacy grounds, only the project's standing dependency-approval gate. |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.
**Packages installed by this phase:** none. The planner should not create an install task.

---

## Architecture Patterns

### System Architecture Diagram

```
                      ┌──────────────────────────────────────┐
   /plan  ───────────▶│ Phase 2 wizard (DAY → TIME → REVIEW) │
                      └──────────────┬───────────────────────┘
                                     │ Confirm tap (author only)
                                     ▼
              ┌────────────────────────────────────────────────────┐
              │  ONE TRANSACTION — PlanningService.confirm  (D-01)  │
              │  · lock memberships FOR SHARE                       │
              │  · snapshot lineup → PlanningParticipant rows       │
              │  · DRAFT → CONFIRMED, activeWeekStart := NULL       │
              │  · consume the Confirm token (exactly once)         │
              │  · NEW: mint the shared answer-token PAIR,          │
              │         never consumed, round-derived expiry        │
              └──────────────┬─────────────────────────────────────┘
                             │ ConfirmResult { round, members, owner, answerActions }
                             ▼
              ┌──────────────────────────────────────┐
              │ editAnchor(anchorMessageId)  (D-02)  │──── failure ──▶ absorbed, logged
              │   availability card + 2 buttons      │                 (D-03: no rollback,
              └──────────────┬───────────────────────┘                  no compensating msg)
                             │
     ┌───────────────────────┴─────────────────────────────────────────────┐
     │                     callback_query:data                              │
     │   registerCallbackBoundary  (fresh role → token parse → action row)  │
     │   route PLANNING: authority=route-resolved, actorBinding=route-resolved
     └───────────────────────┬─────────────────────────────────────────────┘
                             ▼
              ┌──────────────────────────────────────────────────────┐
              │ dispatchAvailabilityAnswer  (AVAIL-02 / AVAIL-03)     │
              │  1. read PlanningParticipant(roundId, actorId)        │
              │       └─ absent → private alert, no edit  (D-07)      │
              │  2. assert round.status is availability-open          │
              │       └─ BOOKED → "already booked" alert  (D-16)      │
              │  3. UPDATE participant SET availability=:v            │
              │       WHERE roundId AND telegramUserId AND            │
              │             availability IS DISTINCT FROM :v          │
              │       └─ count 0 → "Already applied."      (D-04)     │
              │  4. re-read ALL participants (same tx)                │
              │  5. if unanimous → one-shot claim of readyAnnouncedAt │
              └──────────────┬───────────────────────────┬───────────┘
                             │ answered                  │ claimed unanimity
                             ▼                           ▼
                 editAnchor(card)  (D-11)     ctx.reply(announcement + Mark as booked)
                                                         │  (D-12)
                                                         ▼
                                              setAnchor(announcementMessageId)
                                                         │
                             ┌───────────────────────────┘
                             ▼
              ┌──────────────────────────────────────────────────────┐
              │ dispatchBookRequest → confirmation pair  (D-14)       │
              │   eligibility: round.authorUserId OR fresh currentRole│
              │   (resolved BEFORE the transaction opens)   (D-13)    │
              └──────────────┬───────────────────────────────────────┘
                             ▼
              ┌──────────────────────────────────────────────────────┐
              │ dispatchBookApply — Phase 2 confirm template verbatim │
              │  consume token once → updateMany guarded by          │
              │  { id, revision, status: CONFIRMED } → BOOKED  (D-15) │
              │  → re-render BOTH messages control-free       (D-16)  │
              └──────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new directories. Every change lands in files that already exist:

```
prisma/
├── schema.prisma                    # BOOKED enum value, availability column, claim columns
├── migrations/2026xxxx_availability/ # ONE new migration (see Pitfall 1)
└── migrate-deploy.mjs               # new migration constant + gated catalog entries
src/
├── domain/planning/
│   ├── planning-service.ts          # confirm extension, answer/book transitions, projection
│   └── target-week.ts               # WEEK_CLAIMING_STATUSES += BOOKED
├── shared/callback-schema.ts        # planningTargetSchema union entries
└── telegram/
    ├── keyboards.ts                 # answer buttons + booking control rows, markers
    ├── planning-renderers.ts        # renderAvailabilityCard, renderReadyAnnouncement
    ├── planning-handlers.ts         # new dispatch branches, outcomes, reasons, catch sites
    └── handlers.ts                  # (only if a new route id is added)
tests/
├── unit/                            # projection, rendering, keyboard, logging gates
└── integration/                     # answer concurrency, booking, migration preflight
```

### Pattern 1: Confirm opens the availability round in the same transaction (D-01)

The four facts `confirm` already commits atomically become six. The reason is unchanged and stated in the existing doc comment: every partial outcome is a defect with no recovery. Adding "the round is open for answers" and "the answer buttons exist" to the same transaction keeps that property; minting the tokens afterwards would produce a published card whose buttons do not exist.

```typescript
// inside PlanningService.confirm, after `promoted.count === 1` and the
// participant snapshot createMany — src/domain/planning/planning-service.ts:1496
const answerActions = await this.mintAvailabilityActions(tx, confirmed, now);
return { kind: "confirmed", round: confirmed, members, owner, answerActions };
```

`ConfirmResult`'s `confirmed` branch already carries `round`, `members` and `owner` — everything the card needs (CONTEXT "Reusable Assets"). Adding `answerActions` is the only shape change.

**Where the round's "open for availability" state lives:** it is `status === CONFIRMED` plus `bookedAt === null`. Do **not** add a fourth `PlanningRoundStatus` value for "collecting" — D-15 already spends one migration hazard on `BOOKED`, and a second value would have to be threaded through `WEEK_CLAIMING_STATUSES`, the `startOrResume` claiming query, `previousRehearsal`, and `wasPreviousParticipant` for no behavioural gain.

### Pattern 2: The availability projection mirrors `ReviewStepProjection`

```typescript
export type ParticipantMarker = "pending" | "available" | "unavailable";

export type AvailabilityParticipantCell = Readonly<{
  telegramUserId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  marker: ParticipantMarker;
}>;

export type AvailabilityStepProjection = Readonly<{
  selectedDate: string;              // civil "YYYY-MM-DD", never an instant
  startMinute: MinuteOfDay;
  durationMinutes: number;
  participants: readonly AvailabilityParticipantCell[];  // roster-ordered
  answeredCount: number;
  totalCount: number;
  outcome: "collecting" | "all-available" | "blocked";   // ONE derivation (D-05)
  booked: boolean;                                        // D-16
  owner?: TelegramIdentity;
}>;
```

The cell keeps the four `RosterIdentity` fields verbatim so it can be passed straight to `sortRosterMembers` and `memberLabel` — the D-08 ordering and the `Telegram user ••••NNNN` mask are then the *same* functions the roster and review cards use, not a second copy. `outcome` is the single derivation the CONTEXT discretion note requires ("if it is derived, the derivation must be one function, not repeated at each call site").

Render exactly as `renderReviewStep` does: a `<b>` heading built from `dayHeadingLabel(parseCivilDate(...))` and `formatLocalTime(...)`, a legend line, the count line (D-09), then one `• {marker} {memberLabel(p)}` line per participant.

### Pattern 3: Shared, non-consumable answer tokens (the structural departure)

```typescript
/**
 * The two answer capabilities for one round. NOT bound to an actor and NEVER
 * consumed: one keyboard serves N participants and D-04 lets each of them
 * change their mind. `actorUserId` is written because the column is NOT NULL,
 * and it is NOT authority — exactly as `resolveOwnership` already ignores
 * `CallbackAction.actorUserId` in favour of `PlanningRound.authorUserId`.
 */
private async mintAvailabilityActions(
  tx: Prisma.TransactionClient,
  round: PlanningRound,
  now: Date,
): Promise<readonly MintedPlanningAction[]> {
  const minted = (["available", "unavailable"] as const).map((answer) => ({
    token: createCallbackToken(),
    target: { action: "answer" as const, roundId: round.id, answer },
  }));
  await tx.callbackAction.createMany({
    data: minted.map((action) => ({
      token: action.token,
      kind: CallbackActionKind.PLANNING,
      chatId: round.chatId,
      actorUserId: round.authorUserId,          // placeholder, never read
      targetId: createPlanningTarget(action.target),
      expiresAt: availabilityExpiresAt(round, now),   // NOT the 30-minute wizard lifetime
    })),
  });
  return minted;
}
```

**The route already permits this.** `planningCallbackRoute` declares `actorBinding: "route-resolved"`, and the boundary's stale check only applies the actor comparison `route.actorBinding === "strict"` — so a token minted for the author is dispatchable by any current chat member on the PLANNING route today. [VERIFIED: src/telegram/callbacks.ts:419-437, 503-516]

**Re-render must reuse the same two tokens**, so store or look them up rather than re-minting. Recommended lookup, exact-match on the deterministic target JSON:

```typescript
await this.prisma.callbackAction.findMany({
  where: { chatId: round.chatId, kind: CallbackActionKind.PLANNING,
           targetId: { in: [availableTarget, unavailableTarget] },
           expiresAt: { gt: now } },
});
```

`targetId` is unindexed today; the table is swept by `reapExpiredActions` so it stays small for a band-sized chat, but if the planner prefers a guarantee, add `@@index([chatId, kind])` in the same migration. Storing the two tokens as columns on `PlanningRound` is the alternative — cheaper to read, one more pair of columns that can disagree with the `CallbackAction` rows.

### Pattern 4: The answer transition — per-participant compare-and-set

```typescript
async answerAvailability(
  chatId: bigint, actorId: bigint, callbackToken: string, now: Date,
): Promise<AnswerResult> {
  try {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Same row re-validation as every other transition. The token row is
      //    NOT consumed here and NOT released: it is a standing capability.
      const action = await tx.callbackAction.findUnique({ where: { token: callbackToken } });
      if (action === null || action.kind !== CallbackActionKind.PLANNING ||
          action.chatId !== chatId || action.expiresAt <= now) return { kind: "stale" };
      const target = parsePlanningTarget(action.targetId);
      if (!target.success || target.data.action !== "answer") return { kind: "stale" };
      const answer = target.data.answer;

      const round = await tx.planningRound.findUnique({ where: { id: target.data.roundId } });
      if (round === null || round.chatId !== chatId) return { kind: "stale" };
      if (round.status === PlanningRoundStatus.BOOKED) return { kind: "already-booked" }; // D-16
      if (round.status !== PlanningRoundStatus.CONFIRMED) return { kind: "stale" };

      // 2. AVAIL-03 / D-06: snapshot membership, read FRESH, is the permission.
      //    This read chooses the refusal COPY; the WHERE clause below re-asserts
      //    it atomically, so this is not a check-then-act grant of authority.
      const participant = await tx.planningParticipant.findUnique({
        where: { roundId_telegramUserId: { roundId: round.id, telegramUserId: actorId } },
      });
      if (participant === null) return { kind: "not-a-participant" };

      // 3. The idempotency gate (RELI-02, D-04). ONE atomic compare-and-set.
      //    The explicit OR form is deliberate — see Pitfall 5.
      const applied = await tx.planningParticipant.updateMany({
        where: {
          roundId: round.id,
          telegramUserId: actorId,
          OR: [{ availability: null }, { availability: { not: answer } }],
        },
        data: { availability: answer, answeredAt: now },
      });
      if (applied.count !== 1) return { kind: "duplicate" };   // "Already applied."

      // 4. Consistent snapshot for the render, inside the same transaction.
      const participants = await tx.planningParticipant.findMany({
        where: { roundId: round.id },
        include: { membership: { include: { telegramUser: true } } },
      });

      // 5. AVAIL-07 one-shot claim — see Pattern 5.
      const unanimous = participants.every((p) => p.availability === Availability.AVAILABLE);
      const announce = unanimous && (await tx.planningRound.updateMany({
        where: { id: round.id, status: PlanningRoundStatus.CONFIRMED, readyAnnouncedAt: null },
        data: { readyAnnouncedAt: now },
      })).count === 1;

      return { kind: "answered", round, participants, announce };
    });
  } catch (error) { return { kind: "failed", error }; }
}
```

**No `revision` guard, deliberately.** Round-level expected-revision would make two simultaneous answers race and refuse one of them as stale. The atomicity that matters here is per-participant, and it is in the `WHERE` clause. The round's `revision` is still bumped by the *booking* transition, which is where a lost race is a genuine defect.

**`lastActivityAt` is deliberately not refreshed by an answer.** It measures the AUTHOR's silence for AUTH-03 takeover, and takeover only applies to `DRAFT` rounds anyway; refreshing it from a bystander's tap is the exact defect `reanchor`'s `refreshActivity` parameter exists to prevent.

### Pattern 5: The ready-to-book announcement is a one-shot database claim (AVAIL-07)

Two participants answering "Can attend" within the same instant can both observe unanimity. An application-level `if (unanimous && !alreadyAnnounced)` posts two announcements. The claim must be the same compare-and-set shape as `claimRoundlessStatusReply` and the `lastStatusPostedAt` cooldown — a `WHERE readyAnnouncedAt IS NULL` predicate that exactly one transaction can satisfy. `sequentialize` narrows the window; the database closes it, which is the standing project rule (`PLAN-02` comment: "`sequentialize` only narrows the race window; the constraint is the guarantee").

The claim is durable *before* the message is sent, for the reason the status cooldown gives: a Telegram outage must not be usable as a notification amplifier. The consequence is that a failed announcement send leaves the round claimed and un-announced — absorb it into its own catch site and let the status re-post (D-03/Phase 2 D-14) be the recovery, exactly as D-03 prescribes for the publish edit.

### Pattern 6: The booking confirmation pair (D-14)

Model it on Phase 1's roster removal, which is the named precedent: a *request* action that mints a confirm/keep pair, and an *apply* action that consumes exactly once.

- **Request (`book-request`)** — eligibility is `round.authorUserId === actorId` **or** a fresh administrator role. Resolve the role with `AuthorizationService.currentRole` **at tap time, before the transaction opens**, and pass it in as a thunk exactly as `takeover` does. Never use the administrator-requirement helper: it deletes the actor's setup and settings drafts on denial (threat T-02-14, and the planning module's header comment forbids importing it).
- **Confirm/keep pair** — mint both, and re-verify eligibility on apply. Rendering is never authority; an eligible-when-drawn button must be re-checked when pressed, because an administrator can be demoted between render and tap.
- **Apply (`book-apply`)** — the Phase 2 `confirm` template verbatim: consume the token with `updateMany ... consumedAt: null` asserting `count === 1`, then `planningRound.updateMany({ where: { id, revision, status: CONFIRMED }, data: { status: BOOKED, bookedAt: now, revision: { increment: 1 } } })` asserting `count === 1`, releasing the token on a lost revision race.
- **Re-verify unanimity inside the apply transaction.** A participant may have flipped to "Cannot attend" after the announcement (D-04 keeps answers live until booking closes the round). See Open Question 1.

Whether the confirm/keep pair is actor-bound is a genuine choice: binding them to the requester matches Phase 1's roster removal but means a second administrator's tap is refused; leaving them unbound and re-running the (author OR admin) check on apply matches D-13's intent that no single person is a point of failure. **Recommend unbound + re-check**, and record it as a decision.

### Pattern 7: Carrying `BOOKED` through every call site (D-15)

```typescript
// src/domain/planning/target-week.ts — the constant D-15 names
export const WEEK_CLAIMING_STATUSES: readonly PlanningRoundStatus[] = [
  PlanningRoundStatus.CONFIRMED,
  PlanningRoundStatus.BOOKED,
];
```

…is **necessary and not sufficient.** Four queries filter status by a hard-coded literal and never consult the constant:

| Site | Current filter | What breaks if left alone |
|------|----------------|---------------------------|
| `startOrResume` claiming read (`planning-service.ts:949`) | `status: PlanningRoundStatus.CONFIRMED` | `weekIsClaimed` is an inner filter over rows this query already excluded, so a BOOKED week is re-offered. Breaks PLAN-02/PLAN-03 and D-15's whole point. **Fix: `status: { in: WEEK_CLAIMING_STATUSES }`.** |
| `previousRehearsal` (`planning-service.ts:786`) | `status: PlanningRoundStatus.CONFIRMED` | A booked rehearsal stops being "the previous rehearsal", so the PLAN-05/PLAN-07 default/previous markers regress the moment a chat starts booking. |
| `wasPreviousParticipant` (`planning-service.ts:809`) | `round: { chatId, status: PlanningRoundStatus.CONFIRMED }` | The `PREVIOUS_PARTICIPANTS` planning-access policy silently narrows — members admitted yesterday are denied today. This is an **authorization regression** (AUTH-01), not a cosmetic one. |
| `PlanningService.status` (`planning-service.ts:1774`) and `reanchor` (`planning-service.ts:1887`) | `status: PlanningRoundStatus.DRAFT` | D-03's recovery path is unreachable: `/plan_status` answers `no-active-round` while an availability card is open, and the re-anchor cannot move. |

`stepTargets` also assumes the round is a wizard round: a `CONFIRMED` round falls through its DAY/TIME branches into the REVIEW branch and mints `confirm` + `back` tokens for a round that has neither. Branch on **status before step**.

### Anti-Patterns to Avoid

- **Consuming an availability answer token.** It kills the shared button for the rest of the band and makes D-04's change-your-mind impossible. The answer's exactly-once property lives on the participant row.
- **Guarding an answer with `expectedRevision` on the round.** Silently discards a legitimate concurrent answer as `stale`.
- **Deciding unanimity in application code and then posting.** Two announcements. Claim it in the database.
- **Trusting the rendered card.** Every existing transition re-derives its facts inside the transaction (`weekDates`, `generateSlots`, `slotAvailability`). Booking must re-derive unanimity and eligibility; an answer must re-derive snapshot membership.
- **Real Telegram mentions on the card.** D-10. The card is edited on every answer; mentions would re-notify the lineup on every tap.
- **Importing the administrator-requirement helper into the planning surface.** It destroys unrelated in-flight wizards on denial (threat T-02-14); the module header forbids it.
- **A second `registerCallbackBoundary` registration.** The existing one is `exhaustive: true` and its `unresolved()` calls `next()` only when `!options.exhaustive`, so a second boundary would never run. New actions go in the existing table. [VERIFIED: src/telegram/callbacks.ts:254-260, 523-548]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ordering participant lines on the card | A `.sort()` by name in the renderer | `sortRosterMembers` (`src/telegram/roster-renderers.ts:66-78`) | It already carries the `Intl.Collator` + bigint tie-breaker that D-08 requires for a never-reshuffling order, and STATE.md records it as a locked decision. |
| Rendering a person's name safely | String concatenation of `firstName`/`lastName`/`username` | `memberLabel` (HTML) / `plainMemberLabel` (callback alerts) | They carry the `Telegram user ••••NNNN` mask (threat T-01-21) and the single escaper. `memberLabel` already escapes — escaping again renders `&amp;amp;`. Callback alerts are plain text and must use `plainMemberLabel`. |
| "Is this edit a no-op?" | A fresh comparison in the availability path | `editAnchor`'s `LAST_RENDER` fingerprint + `isNotModified` (`planning-handlers.ts:535-621`) | A second copy is a second place for the comparison to go stale; the comment says so explicitly. |
| Idempotent duplicate-tap handling | An in-memory seen-set of `callback_query.id` | The database compare-and-set (`consumedAt` for one-shot actions, the participant `WHERE` clause for answers) | Process memory does not survive a restart and cannot coordinate replicas — the standing project rule. |
| Exactly-one callback acknowledgement | A new ack helper | The boundary's single-shot `answerCallbackQuery` override (`callbacks.ts:262-273`) plus answering from the branch that owns the outcome | Phase 1 finding F-3 was an up-front ack making every later alert unreachable. |
| Bounded log vocabulary | Free-text log fields | `PLANNING_OUTCOMES` / `PLANNING_REASONS` closed arrays | Anything outside the logger's allow list is silently replaced with `[redacted]`. |
| Waiting out a 429 | A hand-rolled sleep loop | Classify `GrammyError` at the existing `PLANNING_CATCH_SITES.delivery` site and let the next answer re-render | The card is re-rendered on the next tap anyway (D-11), so a dropped edit self-heals. A retry loop inside a `sequentialize`d chat blocks every other update for that chat. |

**Key insight:** every guarantee this phase needs already exists in the codebase as a named function or a `WHERE` clause. The work is deciding *which* row is the atomic gate for each new transition — the participant row for an answer, the round row for booking, the `readyAnnouncedAt` column for the announcement — not inventing a mechanism.

---

## Runtime State Inventory

> Included because this phase ships a Prisma migration and inherits Phase 2's live-database constraints, not because it is a rename.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `planning_rounds` and `planning_participants` rows already exist in any environment that ran Phase 2. Existing `CONFIRMED` rounds have **no** availability answers and **no** `readyAnnouncedAt`. | Nullable columns only; no backfill. A pre-existing `CONFIRMED` round becomes an availability round with all participants pending and no minted answer tokens — its card can never be answered. Decide explicitly: leave them (the week is claimed, the round is inert) or supersede them. Recommend leaving them and documenting it; the deployment has no production users yet. |
| Live service config | None. The bot has no externally stored workflow definitions; every value is in PostgreSQL or in the repo. | None — verified by inspection of `src/app/` and `docker-compose`-driven configuration. |
| OS-registered state | None. The bot is a single long-poll process in a container; there is no OS scheduler registration. | None. |
| Secrets / env vars | Unchanged. No new secret, no new env var — the phase adds no external dependency. | None. |
| Build artifacts | `src/generated/prisma/**` is a committed Prisma Client output. A schema change **must** be followed by `npm run db:generate`, or the new enum value and column are invisible to the compiler. | Run `prisma generate` in the same task as the schema edit; the generated tree is tracked (`src/generated/prisma/models/PlanningRound.ts` etc. exist in the repo). |
| Migration tooling | `prisma/migrate-deploy.mjs` gates deployment on an **exact, ordered** catalog per applied migration name, and `tests/integration/migration-preflight.test.ts` pins a `TARGET_MIGRATION` cutoff. | Both must be updated in the same plan as the migration, with new real-PostgreSQL cases. Skipping this makes `npm run db:migrate:deploy` fail closed on the new schema. |

---

## Common Pitfalls

### Pitfall 1: `ALTER TYPE ... ADD VALUE` and Prisma's per-migration transaction

**What goes wrong:** the migration that adds `BOOKED` also uses it — as a column default, in a backfill `UPDATE`, or in a `CHECK` — and fails with `unsafe use of new value "BOOKED" of enum type "PlanningRoundStatus" / New enum values must be committed before they can be used`.
**Why it happens:** PostgreSQL: *"If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed."* [CITED: https://www.postgresql.org/docs/18/sql-altertype.html] Prisma applies each migration inside a transaction on PostgreSQL, so the restriction bites (prisma/prisma#8424, #7251, #5290). [CITED: https://github.com/prisma/prisma/issues/8424]
**How to avoid:** the Phase 3 migration must add `BOOKED` and **never reference the literal**. `bookedAt`, `readyAnnouncedAt`, `announcementMessageId` and the participant `availability` column are all nullable with no default, so this holds naturally — but a reviewer must check it. The *new* availability enum is a `CREATE TYPE`, which has no such restriction and may be created and used in one migration. If a later phase needs `BOOKED` as a default, that is a **second** migration.
**Warning signs:** any `'BOOKED'` string literal in the generated `migration.sql`.

### Pitfall 2: The migration preflight compares enum labels **in order**

**What goes wrong:** `npm run db:migrate:deploy` refuses a correctly-migrated database.
**Why it happens:** `hasExactValues` is order-sensitive — `actual.every((value, index) => value === expected[index])` [VERIFIED: prisma/migrate-deploy.mjs:281-287] — and it is fed `PlanningRoundStatus: integrityApplied ? ["DRAFT", "CONFIRMED", "SUPERSEDED"] : [...]` [VERIFIED: prisma/migrate-deploy.mjs:736-738]. PostgreSQL orders labels by `enumsortorder`, and without `BEFORE`/`AFTER` *"the new item is added at the end of the list of values"* [CITED: postgresql.org/docs/18/sql-altertype.html].
**How to avoid:** append `BOOKED` at the **end** of the Prisma enum block so the generated `ADD VALUE` appends, then extend `expectedApplicationCatalog` with a new `AVAILABILITY_MIGRATION` constant and gate the label list on it: `availabilityApplied ? ["DRAFT","CONFIRMED","SUPERSEDED","BOOKED"] : ["DRAFT","CONFIRMED","SUPERSEDED"]`. Add the new participant columns, the new `Availability` enum, and any new index behind the same flag, and bump `TARGET_MIGRATION` in the preflight test with new cases for the pre- and post-migration states.
**Warning signs:** a preflight failure naming `PlanningRoundStatus` or `planning_participants`.

### Pitfall 3: A second ready-to-book announcement

**What goes wrong:** the group gets two "everyone can make it" notifications, or two `Mark as booked` controls, from two near-simultaneous final answers.
**Why it happens:** unanimity computed in application code after the write, with no durable claim.
**How to avoid:** Pattern 5 — `updateMany({ where: { id, status: CONFIRMED, readyAnnouncedAt: null }, ... })` and announce only on `count === 1`.
**Warning signs:** an integration test that fires two concurrent final answers and asserts exactly one `ctx.reply` is the only thing that catches this; `sequentialize` will hide it in a single-process unit test.

### Pitfall 4: The callback boundary's membership check is not AVAIL-03

**What goes wrong:** any chat member can answer the availability card.
**Why it happens:** for a `route-resolved` route the boundary only enforces `isCurrentMember(role)` before dispatching [VERIFIED: src/telegram/callbacks.ts:406-415], and it does **not** compare `action.actorUserId` (that is the point of `actorBinding: "route-resolved"`). Snapshot membership is a fact only the dispatcher can check.
**How to avoid:** the `PlanningParticipant` read in Pattern 4 step 2, refused per D-07 with a private alert. Do **not** substitute a live roster read — D-06 makes the snapshot authoritative, so a removed member must still be able to answer.
**Warning signs:** a test that adds a chat member who is not in the snapshot and finds their answer recorded.

### Pitfall 5: Prisma `not` on a nullable column and SQL three-valued logic

**What goes wrong:** the very first answer (from `availability = NULL`) is refused as `Already applied.`
**Why it happens:** `WHERE availability <> 'AVAILABLE'` is `NULL` — not `TRUE` — for a `NULL` row, so the row is not matched. Whether Prisma's `{ not: X }` compiles to a NULL-safe form on a nullable column is **not documented on the page that should document it** [ASSUMED — the Prisma "null and undefined" page does not state the behaviour].
**How to avoid:** never depend on the answer. Write the predicate explicitly: `OR: [{ availability: null }, { availability: { not: answer } }]`. It is unambiguous under either semantics and costs nothing. Add an integration test that asserts the first answer from `NULL` returns `count === 1`.
**Warning signs:** every participant's first tap answering `Already applied.`

### Pitfall 6: The 30-minute action lifetime kills the answer buttons

**What goes wrong:** nobody can answer, and the alert says the planning action expired.
**Why it happens:** `PLANNING_ACTION_LIFETIME_MS = 30 * 60 * 1000` [VERIFIED: src/domain/planning/planning-service.ts:60] and the boundary refuses `action.expiresAt <= now` **before** the dispatcher runs [VERIFIED: src/telegram/callbacks.ts:419-437], so the phase cannot even improve the copy. An availability round lives from confirm until the rehearsal — days.
**How to avoid:** a distinct `availabilityExpiresAt(round, now)` derived from the round (`endsAt` plus slack), not from the wizard constant. `PLANNING_ACTION_RETENTION_MS` is measured from expiry, so the sweep needs no change.
**Warning signs:** an integration test that advances the injected clock past 30 minutes and then answers.

### Pitfall 7: Two live keyboards in the chat — a deliberate exception

**What goes wrong:** a reviewer applies the Phase 2 rule "the non-anchor card's keyboard is stripped" (`clearSupersededCard`, threats T-01-19-01/T-02-13) and strips the availability buttons when the announcement becomes the anchor.
**Why it happens:** Phase 2's rule exists because two copies of the *same step* had two tokens for the *same transition*, and a tap on the wrong one raced. D-04 + D-12 create a genuinely different situation: the availability card's buttons address `PlanningParticipant` rows and the announcement's button addresses the round's status. They cannot race.
**How to avoid:** state the exception explicitly in the plan and in a code comment, and keep the invariant that actually matters — **exactly one live control per durable transition** — rather than "one live keyboard". `clearSupersededCard` still applies to a *re-posted* copy of either card.
**Warning signs:** a plan task worded "strip the previous card's keyboard when the anchor moves".

### Pitfall 8: `answerCallbackQuery` text is capped at 200 characters

**What goes wrong:** a refusal alert is rejected or truncated.
**Why it happens:** *"Text of the notification. If not specified, nothing will be shown to the user, 0-200 characters."* [CITED: https://gramio.dev/telegram/methods/answercallbackquery, mirroring core.telegram.org/bots/api]
**How to avoid:** keep every new refusal string under 200 characters, including the interpolated `plainMemberLabel`. `planningNotAuthorText` already interpolates a label; the booking refusal (D-13) must name *who can* without listing every administrator. A unit test asserting each exported refusal constant is ≤200 characters is cheap.

### Pitfall 9: New log fields are silently redacted

**What goes wrong:** a diagnostic field logs as `[redacted]`.
**Why it happens:** the logger is an allow list [VERIFIED: src/shared/logger.ts:21-50], and it contains `chatId, actorId, targetId, updateId, messageId, actionId, draftId, membershipId, roundId, jobId, actionKind, callbackKind, route, command, field, event, outcome, reason, status, signal, revision, expectedRevision, attempt, count, page, pageCount` (+ `durationMs`). There is no `telegramUserId`, no `participantId`, no `answeredCount`.
**How to avoid:** express Phase 3 diagnostics in fields that already exist — `roundId`, `outcome`, `reason`, `count`, `revision`. Do not add a participant identity field: `actorId` already carries the tapping user. If two counts are genuinely needed, extend `ALLOWED_FIELDS` deliberately and note that `tests/unit/planning-logging.test.ts` asserts no forbidden value survives under an allow-listed key.

### Pitfall 10: The logging gate rejects indistinguishable branches

**What goes wrong:** the unit suite fails with `"X" is indistinguishable from "Y"`.
**Why it happens:** `tests/unit/planning-logging.test.ts` drives every enumerated branch for real and requires every `(outcome, reason)` pair to be globally unique, and every branch to emit **exactly one** matching line. It also asserts `BRANCHES.length >= 10` and at least 3 members in each of the `duplicate-tap`, `stale-action` and `select-failed` families.
**How to avoid:** every new Phase 3 branch needs its own `PLANNING_REASONS` entry (`answer-already-recorded`, `actor-not-in-participant-snapshot`, `round-already-booked`, `booking-not-author-or-administrator`, `rehearsal-marked-booked`, …), its own `PLANNING_OUTCOMES` entry where the outcome is genuinely new, **and** an entry in the test's `BRANCHES` enumeration — otherwise the gate silently stops covering the new surface.

### Pitfall 11: Group flood limits on the per-answer edit

**What goes wrong:** a burst of taps (everyone answering at once after a Phase 5 reminder) draws 429s and edits are dropped.
**Why it happens:** *"In a single chat, avoid sending more than one message per second… eventually you'll begin receiving 429 errors"* and *"In a group, bots are not able to send more than 20 messages per minute."* [CITED: https://core.telegram.org/bots/faq] Whether an *edit* counts against the 20-per-minute group limit is not documented [ASSUMED: it does].
**How to avoid:** `sequentialize` by chat already serialises the edits, and a band-sized roster produces at most a handful. Classify 429 at `PLANNING_CATCH_SITES.delivery` (`error instanceof GrammyError && error.error_code === 429`) as its own bounded reason and absorb it — the next answer re-renders the current state anyway, so a dropped edit self-heals. Do not add a retry loop inside the sequentialized handler; do not install `@grammyjs/auto-retry` in this phase.

### Pitfall 12: `PlanningParticipant` has no `revision`, `createdAt` or `updatedAt`

**What goes wrong:** a plan assumes an expected-revision guard is available on the participant row.
**Why it happens:** the model is `id, roundId, chatId, telegramUserId, membershipId` plus two relations and nothing else [VERIFIED: prisma/schema.prisma:204-216].
**How to avoid:** the compare-and-set is on the **value** (`availability`), which needs no revision column. Add `answeredAt DateTime? @db.Timestamptz(3)` for Phase 5's follow-up targeting and for operator forensics; do not add `revision`.

---

## Code Examples

### Schema additions (one migration)

```prisma
// prisma/schema.prisma

/// A participant's answer to one availability round (AVAIL-02).
/// A CREATE TYPE, so it may be created and used in the same migration —
/// unlike ALTER TYPE ... ADD VALUE (see Pitfall 1).
enum ParticipantAvailability {
  AVAILABLE
  UNAVAILABLE
}

enum PlanningRoundStatus {
  DRAFT
  CONFIRMED
  SUPERSEDED
  BOOKED          // appended LAST so PostgreSQL appends the label last (Pitfall 2)
}

model PlanningRound {
  // ... existing columns unchanged ...
  /// One-shot AVAIL-07 claim AND the record of it. Written by the guarded
  /// updateMany that wins the unanimity race; NULL means never announced.
  readyAnnouncedAt      DateTime? @map("ready_announced_at") @db.Timestamptz(3)
  /// D-12: the announcement message, which becomes the round's new anchor.
  announcementMessageId Int?      @map("announcement_message_id")
  /// LIFE-01. Nullable, no default — the literal 'BOOKED' never appears in
  /// this migration's SQL.
  bookedAt              DateTime? @map("booked_at") @db.Timestamptz(3)
  bookedByUserId        BigInt?   @map("booked_by_user_id")
}

model PlanningParticipant {
  // ... existing columns unchanged ...
  availability ParticipantAvailability? 
  answeredAt   DateTime?                @map("answered_at") @db.Timestamptz(3)
}
```

### The generated migration must look like this (no `'BOOKED'` used)

```sql
-- CreateEnum
CREATE TYPE "ParticipantAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- AlterEnum: append only. The value is NOT referenced anywhere below.
ALTER TYPE "PlanningRoundStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "planning_rounds"
  ADD COLUMN "ready_announced_at" TIMESTAMPTZ(3),
  ADD COLUMN "announcement_message_id" INTEGER,
  ADD COLUMN "booked_at" TIMESTAMPTZ(3),
  ADD COLUMN "booked_by_user_id" BIGINT;

ALTER TABLE "planning_participants"
  ADD COLUMN "availability" "ParticipantAvailability",
  ADD COLUMN "answered_at" TIMESTAMPTZ(3);
```

### Callback target vocabulary (`src/shared/callback-schema.ts`)

```typescript
const planningTargetSchema = z.union([
  // ... existing day / time / back-confirm-takeover members unchanged ...
  z
    .object({
      action: z.literal("answer"),
      roundId: z.string().min(1),
      answer: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    })
    .strict(),
  z
    .object({
      action: z.enum(["book-request", "book-apply", "book-keep"]),
      roundId: z.string().min(1),
    })
    .strict(),
]);
```

The wire token stays `v1:<uuid>` (39 characters, inside Telegram's 1–64-byte `callback_data` limit); the answer literal lives only in the server-side `CallbackAction.targetId`. Nothing on the wire is an authorization claim — the standing rule this schema's comment states.

### Classifying a Telegram flood error at the existing catch site

```typescript
// src/telegram/planning-handlers.ts — beside isNotModified
function isFloodControl(error: unknown): error is GrammyError {
  return error instanceof GrammyError && error.error_code === 429;
}
```

Use it to choose a distinct bounded `reason` (`telegram-flood-controlled-the-edit`) rather than to retry; the next answer re-renders. [CITED: https://grammy.dev/plugins/auto-retry for the 429/`retry_after` semantics]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Native Telegram Poll for availability | Custom inline card over a persisted roster snapshot | Project inception | Polls cannot enforce the snapshot, expose per-participant status, or target follow-ups — recorded in REQUIREMENTS.md "Out of Scope" and in `.claude/CLAUDE.md`. Nothing in the current Bot API changes this. |
| Bots could edit their own messages for a limited time | No documented time limit on a bot editing its own message; the 48-hour rule applies only to *business* messages the bot did not send | Bot API 7.2 (business connections) | Confirms the anchor availability card can be edited for the whole life of a round. [CITED: https://gramio.dev/telegram/methods/editmessagetext] |
| `ALTER TYPE ... ADD VALUE` could not run inside a transaction at all | Allowed inside a transaction since PostgreSQL 12; the new value simply cannot be *used* until commit | PostgreSQL 12 | Makes a single-file Prisma migration viable, provided the literal is never referenced. [CITED: postgresql.org/docs/18/sql-altertype.html] |

**Deprecated/outdated in this repo:** `renderConfirmedStep` ends with the line `"The availability round is next."` [VERIFIED: src/telegram/planning-renderers.ts:431]. D-02 makes the confirmed summary the availability card's header, so either the function is folded into the availability renderer or the sentence is a lie the moment Phase 3 ships. Whichever the planner chooses, `tests/unit/*` assertions on that copy must move with it.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prisma's `{ not: X }` on a nullable column does **not** match `NULL` rows in PostgreSQL. | Pitfall 5 | The first answer from every participant would be refused as `Already applied.` **Mitigated to zero cost:** the recommended predicate is the explicit `OR: [{ availability: null }, { availability: { not: X } }]`, which is correct under either semantics. No user confirmation needed; an integration test settles it. |
| A2 | Telegram counts an `editMessageText` against the ~20-messages-per-minute group limit. | Pitfall 11 | If it does not, the flood concern is smaller than stated and the classification is harmless. If it does and it is ignored, a burst drops edits. The recommended handling (classify and absorb; the next answer re-renders) is correct either way. |
| A3 | Prisma `updateMany` accepts a relation filter (`round: { is: { status } }`) in its `where`. | Pattern 4 | **Avoided:** the recommended shape reads the round explicitly inside the transaction instead of relying on a relation filter, so the answer does not matter. |
| A4 | Leaving pre-existing Phase 2 `CONFIRMED` rounds inert (all-pending, no answer tokens) is acceptable. | Runtime State Inventory | If a real chat already has an open confirmed round, it becomes unanswerable and holds its week. The deployment has no production users recorded in STATE.md, so the risk is low — but the planner should confirm with the owner or add a one-line supersede in the migration. |
| A5 | The round's `endsAt` plus a slack is the right expiry for the answer tokens. | Pitfall 6 | Too short: buttons die before the rehearsal. Too long: dead tokens linger (harmless — the dispatcher re-checks the round's status). A concrete slack value is a planning decision; anything from "until `endsAt`" to "until `endsAt` + 24h" is defensible. |

---

## Open Questions

1. **What happens to the ready-to-book announcement when a participant flips to "Cannot attend" after it was posted?**
   - *What we know:* D-04 keeps answers changeable until the round closes, D-16 says only booking closes it, and D-12 puts a live `Mark as booked` control on the announcement. So the window exists and is reachable by an ordinary mis-tap.
   - *What's unclear:* whether the announcement is edited to retract itself, whether the `Mark as booked` control disappears, and whether a re-achieved unanimity announces a second time.
   - *Recommendation:* (a) the booking **apply** transaction re-derives unanimity from the participant rows and refuses with a private alert if it no longer holds — rendering is never authority, which is the standing rule; (b) the announcement message is **edited** to say the slot no longer works and its control is removed, using the same `clearSupersededCard`-style edit; (c) the `readyAnnouncedAt` claim is **one-shot for the life of the round**, so a re-achieved unanimity updates the card and does not post a second notification. Confirm (c) with the owner — it is the only one that trades a notification the band might want for protection against a flip-flop notification loop.

2. **Does `/plan_status` re-post the availability card, the announcement, or both, once the anchor has moved (D-12)?**
   - *What we know:* the CONTEXT explicitly leaves this to discretion; D-03 requires the status re-post to be the recovery path for a failed publish; `repostAnchor` posts one message and re-anchors to it.
   - *What's unclear:* whether a booked-or-ready round should re-post the card (which carries the answer state) or the announcement (which carries the action).
   - *Recommendation:* re-post **one** message — the card the round's current state makes actionable: the availability card while collecting, the announcement while ready-to-book, and a control-free summary once `BOOKED`. That keeps `repostAnchor`'s single-message contract and the `PLANNING_STATUS_COOLDOWN_MS` semantics intact.

3. **Is the booking confirm/keep pair actor-bound?**
   - *Recommendation and rationale in Pattern 6:* unbound, with the (author OR fresh administrator) check re-run on apply. Record it as a decision so a reviewer does not "fix" it toward the Phase 1 roster-removal precedent.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | v24.18.0 (`engines: >=24.19 <25`) | — |
| Docker Engine | Testcontainers integration suites, migration preflight, `docker compose` | ✓ | 29.7.2 | — |
| PostgreSQL | Integration tests | ✓ (via Testcontainers) | image-pinned | — |
| Prisma CLI | `db:generate`, `db:migrate:dev` | ✓ | 7.9.1 (devDependency) | — |

**Note on the local Node version:** the running interpreter is `v24.18.0` while `package.json` declares `>=24.19 <25`. This is a pre-existing condition, not introduced by Phase 3, but a task that runs `npm ci` with `engine-strict` would fail. Worth a one-line check during planning.

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11, two named projects (`unit`, `integration`) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test:unit && npm run test:integration && npm run typecheck && npm run lint` |

Integration runs with `fileParallelism: false`, `maxWorkers: 1`, 60s test/hook timeouts — Testcontainers-backed and inherently serial.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AVAIL-01 | Confirm opens the availability round and mints the answer pair in one transaction | integration | `npx vitest run --project integration tests/integration/planning-confirm.test.ts` | ✅ extend |
| AVAIL-01 | The published card renders the confirmed date/time/lineup header | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ Wave 0 |
| AVAIL-02 | A snapshot participant's answer is recorded; the other button overwrites it | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` | ❌ Wave 0 |
| AVAIL-02 | Re-tapping the same answer is `Already applied.` and does not re-edit | integration | same file | ❌ Wave 0 |
| AVAIL-02 | The first answer from `availability = NULL` returns `count === 1` (Pitfall 5) | integration | same file | ❌ Wave 0 |
| AVAIL-03 | A chat member outside the snapshot is refused; a roster-removed snapshot member still answers (D-06) | integration | same file | ❌ Wave 0 |
| AVAIL-04 | Markers, roster order stability across answers, and the count line | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ Wave 0 |
| AVAIL-07 | Two concurrent final answers produce exactly one announcement | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` (racing client) | ❌ Wave 0 — reuse `tests/helpers/racing-client.ts` |
| LIFE-01 | Author and a current administrator can book; anyone else is refused | integration | `npx vitest run --project integration tests/integration/planning-booking.test.ts` | ❌ Wave 0 |
| LIFE-01 | Booking is `CONFIRMED → BOOKED` under an expected-revision guard; a duplicate apply is `Already applied.` | integration | same file | ❌ Wave 0 |
| D-15 ripple | A `BOOKED` round claims its week, remains the previous rehearsal, and still admits `PREVIOUS_PARTICIPANTS` | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ✅ extend |
| D-03 ripple | `/plan_status` re-posts the availability card for a `CONFIRMED` round | integration | `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | ✅ extend |
| Migration | Preflight accepts the new migration and refuses drifted enum/column states | integration | `npx vitest run --project integration tests/integration/migration-preflight.test.ts` | ✅ extend |
| Observability | Every new branch emits one distinguishable bounded line | unit | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | ✅ extend `BRANCHES` |
| Copy safety | Every exported refusal constant is ≤200 characters (Pitfall 8) | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:unit && npm run typecheck`
- **Per wave merge:** `npm run test:unit && npm run test:integration`
- **Phase gate:** full suite green plus `npm run lint` before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/unit/planning-availability-card.test.ts` — covers AVAIL-04, D-08/D-09/D-10, Pitfall 8
- [ ] `tests/integration/planning-availability.test.ts` — covers AVAIL-02, AVAIL-03, AVAIL-07, Pitfall 3, Pitfall 5, Pitfall 6
- [ ] `tests/integration/planning-booking.test.ts` — covers LIFE-01, D-13, D-14, D-16
- [ ] Extend `tests/unit/planning-logging.test.ts` `BRANCHES` with every new branch (Pitfall 10)
- [ ] No framework install needed.

---

## Security Domain

### Applicable ASVS Categories (level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Identity is Telegram's; the bot authenticates nobody. |
| V3 Session Management | no | No sessions — every value is a durable row (RELI-01). |
| V4 Access Control | **yes** | Three distinct decisions, all resolved server-side from durable state at the action boundary: chat membership (boundary, `isCurrentMember`), snapshot membership (`PlanningParticipant`, AVAIL-03/D-06), and booking eligibility (`round.authorUserId` OR fresh `currentRole`, LIFE-01/D-13). No authorization claim ever travels on the wire. |
| V5 Input Validation | **yes** | `callbackTokenSchema` (`/^v1:[0-9a-f-]{36}$/i`) at the boundary, then `planningTargetSchema` strict Zod parse of the server-side `targetId`. New union members must be `.strict()`. |
| V6 Cryptography | no new use | Tokens are `randomUUID()`; nothing is added. |
| V7 Error Handling & Logging | **yes** | Bounded `outcome`/`reason` vocabularies, allow-list redaction, `err`-bound catch values. Phase 1 finding F-4. |
| V8 Data Protection | **yes** | Threat T-01-21: no full numeric Telegram id, no unescaped name, no date/time/timezone in a log line. `memberLabel`/`plainMemberLabel` are the only identity renderers. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A non-participant answers the availability card | Elevation of privilege | Snapshot read inside the transaction; the `WHERE roundId AND telegramUserId` clause re-asserts it atomically. |
| A shared answer token is used to answer *on behalf of* someone | Spoofing | The token carries no identity; the acting user comes from `ctx.from.id` via `actionContext`, and the update is authenticated by Telegram. The token grants only the *right to attempt*. |
| Replayed Telegram update double-books | Tampering / RELI-02 | Booking consumes its token with the atomic `consumedAt: null` compare-and-set and guards `status: CONFIRMED` + `revision`. |
| Two final answers double-announce | Tampering | `readyAnnouncedAt IS NULL` claim (Pitfall 3). |
| A demoted administrator books | Elevation of privilege | Role resolved fresh at tap time via the **non-destructive** `currentRole`, and re-checked on apply (never the draft-deleting helper — threat T-02-14). |
| Card-edit flood as a denial vector | Denial of service | Answers are per-participant and bounded by the snapshot size; the edit path is serialized by `sequentialize`; 429 is absorbed, not retried in-handler. The `/plan_status` cooldown continues to cover the only unauthenticated-by-role command. |
| An inherited database receives a partial migration | Tampering | `prisma/migrate-deploy.mjs` preflight, extended with the new migration's catalog (Pitfall 2) and its real-PostgreSQL cases. |
| Identity leakage into chat text or logs | Information disclosure | `memberLabel` mask + escaper; the logger allow list; the negative-value assertions in `tests/unit/planning-logging.test.ts` and `planning-ownership.test.ts`. |

---

## In-repo verified values (verbatim)

Every value below was read from its source-of-truth file **this session**. Paraphrase is deliberately avoided.

**`prisma/schema.prisma:20-31`**
```prisma
enum CallbackActionKind {
  START_SETUP
  SETTINGS_EDIT
  ROSTER_REMOVE
  PLANNING
}

enum PlanningRoundStatus {
  DRAFT
  CONFIRMED
  SUPERSEDED
}
```

**`prisma/schema.prisma:204-216`**
```prisma
model PlanningParticipant {
  id             String         @id @default(cuid())
  roundId        String         @map("round_id")
  chatId         BigInt         @map("chat_id")
  telegramUserId BigInt         @map("telegram_user_id")
  membershipId   String         @map("membership_id")
  round          PlanningRound  @relation(fields: [roundId, chatId], references: [id, chatId], onDelete: Cascade)
  membership     ChatMembership @relation(fields: [membershipId, chatId, telegramUserId], references: [id, chatId, telegramUserId], onDelete: Restrict)

  @@unique([roundId, telegramUserId])
  @@index([telegramUserId])
  @@map("planning_participants")
}
```
(The `@@unique([roundId, telegramUserId])` is what makes `roundId_telegramUserId` a valid `findUnique` key in Pattern 4.)

**`src/domain/planning/target-week.ts:26-28`**
```typescript
export const WEEK_CLAIMING_STATUSES: readonly PlanningRoundStatus[] = [
  PlanningRoundStatus.CONFIRMED,
];
```

**`src/domain/planning/planning-service.ts:60`**
```typescript
export const PLANNING_ACTION_LIFETIME_MS = 30 * 60 * 1000;
```

**`src/domain/planning/planning-service.ts:786`, `:809`, `:949`, `:1774`, `:1887`** — the five hard-coded status filters of Finding F-7:
```typescript
        status: PlanningRoundStatus.CONFIRMED,                       // :786  previousRehearsal
        round: { chatId, status: PlanningRoundStatus.CONFIRMED },    // :809  wasPreviousParticipant
          where: { chatId, status: PlanningRoundStatus.CONFIRMED },  // :949  startOrResume claiming read
          where: { chatId, status: PlanningRoundStatus.DRAFT },      // :1774 status()
          status: PlanningRoundStatus.DRAFT,                         // :1887 reanchor()
```

**`src/shared/callback-schema.ts:105-110`** — the union member new actions extend:
```typescript
  z
    .object({
      action: z.enum(["back", "confirm", "takeover"]),
      roundId: z.string().min(1),
    })
    .strict(),
```

**`src/telegram/keyboards.ts:179`**
```typescript
export type PlanningControlAction = "back" | "confirm" | "takeover";
```

**`src/telegram/keyboards.ts:155-169`** — the marker vocabulary D-08 extends:
```typescript
export const PLANNING_MARKER_DEFAULT = "⭐";
export const PLANNING_MARKER_PREVIOUS = "🔁";
export const PLANNING_MARKER_UNAVAILABLE = "🚫";
export const PLANNING_MARKER_CHOSEN = "✅";
```

**`src/telegram/handlers.ts:82-94`** — the closed route-id union any new route must join:
```typescript
export type ChatReadinessRouteId =
  | "command:setup"
  | "command:settings"
  | "command:roster"
  | "command:roster_add"
  | "command:plan"
  | "command:plan_status"
  | "update:message:location"
  | "update:message:text"
  | "callback:START_SETUP"
  | "callback:SETTINGS_EDIT"
  | "callback:ROSTER_REMOVE"
  | "callback:PLANNING";
```

**`src/telegram/callbacks.ts:503-516`** — the route that already permits shared, non-actor-bound tokens:
```typescript
export function planningCallbackRoute(deps: PlanningHandlerDependencies) {
  return {
    staleText: PLANNING_STALE_TEXT,
    nonMemberText: PLANNING_NON_MEMBER_DENIAL,
    authority: "route-resolved",
    actorBinding: "route-resolved",
```

**`src/shared/logger.ts:21-50`** — the redaction allow list (no `telegramUserId`, no `participantId`):
```typescript
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "chatId", "actorId", "targetId", "updateId", "messageId", "actionId",
  "draftId", "membershipId", "roundId", "jobId",
  "actionKind", "callbackKind", "route", "command", "field", "event",
  "outcome", "reason", "status", "signal",
  "revision", "expectedRevision", "attempt", "count", "page", "pageCount",
```
*(reflowed from the file's one-per-line formatting; the member set is verbatim and complete through line 50, followed by `"durationMs"`).*

**`prisma/migrate-deploy.mjs:281-287`** — the order-sensitive comparison of Pitfall 2:
```javascript
function hasExactValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
```

**`prisma/migrate-deploy.mjs:734-741`** — the gated enum catalog the new migration must extend:
```javascript
    ...(planningApplied
      ? {
          PlanningRoundStatus: integrityApplied
            ? ["DRAFT", "CONFIRMED", "SUPERSEDED"]
            : ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"],
          PlanningStep: ["DAY", "TIME", "REVIEW"],
        }
      : {}),
```

**`src/app/create-bot.ts:61-65`** — the sequentialize key D-11 relies on:
```typescript
  bot.use(
    sequentialize((ctx) =>
      ctx.chat === undefined ? undefined : `chat:${String(ctx.chat.id)}`,
    ),
  );
```

**`src/telegram/planning-renderers.ts:431`** — the sentence D-02 invalidates:
```typescript
      "The availability round is next.",
```

---

## Project Constraints (from CLAUDE.md)

Directives extracted from `.claude/CLAUDE.md`; the planner must verify compliance and must not propose an approach that contradicts them.

1. **Fixed stack, exact versions.** Node 24 LTS, TypeScript 7.0.2, grammY 1.45.1, `@grammyjs/runner` 2.0.3, Zod 4.4.3, Pino 10.3.1, PostgreSQL 18, Prisma 7.9.1 with `@prisma/adapter-pg` + `pg`, pg-boss 12.27.0 (Phase 5), Vitest 4.1.11, Testcontainers 12.1.0. Phase 3 adds no dependency.
2. **TypeScript strictness.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — the last one is why `markupOf` spreads `{}` instead of passing `reply_markup: undefined`; new optional fields must follow the same shape.
3. **Keep an application roster.** Never call `getChatMember` to enumerate the band. AVAIL-03 reads `PlanningParticipant`.
4. **`callback_data` is 1–64 bytes.** Send compact opaque data; never serialize names, dates, or authorization claims into it. Resolve everything from PostgreSQL.
5. **Acknowledge every callback immediately, exactly once**, from the branch that owns the outcome, with the boundary's fallback.
6. **Treat updates as untrusted and unordered.** Persist `chat_id`, `message_id`, and round version; authorize callback user ids against the selected participant set; use a transaction plus constraints for every transition. This is a verbatim mandate for exactly what AVAIL-03 requires.
7. **Privacy mode stays enabled.** No new `message:text` or `message:location` route; every Phase 3 gesture is a button or a command.
8. **`bigint` at the repository boundary** for chat and user ids; `timestamptz` for instants; civil dates as `"YYYY-MM-DD"` strings, never `@db.Date`; minute-of-day integers, never wall-clock strings.
9. **Durable business state in PostgreSQL, not in grammY session or conversations.** The workflow state machine is the `PlanningRound`/`PlanningParticipant` rows.
10. **Agent-runtime portability and English documentation.** Nothing may depend on Claude Code or Codex specifically; all planning artifacts in English.

---

## Sources

### Primary (HIGH confidence)

- The repository itself, read with `Read` this session: `prisma/schema.prisma`, `prisma/migrate-deploy.mjs`, `prisma/migrations/20260902152000_planning_participant_integrity/migration.sql`, `src/domain/planning/planning-service.ts` (full), `src/domain/planning/target-week.ts`, `src/domain/roster/roster-service.ts`, `src/shared/callback-schema.ts`, `src/shared/logger.ts`, `src/telegram/callbacks.ts`, `src/telegram/handlers.ts`, `src/telegram/keyboards.ts`, `src/telegram/planning-handlers.ts`, `src/telegram/planning-renderers.ts`, `src/telegram/roster-renderers.ts`, `src/app/create-bot.ts`, `vitest.config.ts`, `package.json`, `tests/unit/planning-logging.test.ts`, `tests/integration/migration-preflight.test.ts`.
- `.planning/phases/03-availability-and-booking-decision/03-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/02-weekly-rehearsal-proposal/02-RESEARCH.md`, `.planning/phases/02-weekly-rehearsal-proposal/.continue-here.md`, `.claude/CLAUDE.md`.

### Secondary (MEDIUM confidence — official documentation, read via WebFetch)

- [PostgreSQL 18 — ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html) — the transaction-block restriction on `ADD VALUE`, `IF NOT EXISTS`, and end-of-list append ordering.
- [Telegram Bots FAQ](https://core.telegram.org/bots/faq) — one message per second per chat, 20 messages per minute in a group, ~30/second bulk.
- [Telegram Bot API — editMessageText (mirror)](https://gramio.dev/telegram/methods/editmessagetext) — the 48-hour rule applies only to business messages the bot did not send.
- [Telegram Bot API — answerCallbackQuery (mirror)](https://gramio.dev/telegram/methods/answercallbackquery) — `text` is 0–200 characters; `show_alert` defaults to `False`.
- [grammY — auto-retry plugin](https://grammy.dev/plugins/auto-retry) — `retry_after` handling, `maxRetryAttempts`, `maxDelaySeconds`.
- [grammY — runner plugin](https://grammy.dev/plugins/runner) — concurrent processing by default; `sequentialize` orders same-key updates.
- npm registry via `gsd-tools query package-legitimacy check` — `@grammyjs/auto-retry` 2.0.2, verdict `OK`.

### Tertiary (LOW confidence — community sources, flagged for validation)

- [prisma/prisma#8424](https://github.com/prisma/prisma/issues/8424), [#7251](https://github.com/prisma/prisma/issues/7251), [#5290](https://github.com/prisma/prisma/issues/5290) — Prisma runs migrations in a PostgreSQL transaction, so adding *and using* an enum value in one migration fails; split into two. Consistent with the PostgreSQL primary source, and cheaply avoided by never referencing the new literal.
- The Prisma "null and undefined" documentation page does **not** state whether `not` matches `NULL` on a nullable column (Assumption A1). The recommended explicit `OR` predicate removes the dependency.

---

## Metadata

**Confidence breakdown:**

- Standard stack: **HIGH** — no change; every version read from `package.json` this session.
- In-repo integration surface (Findings F-1 through F-7, Pitfalls 2, 4, 6, 9, 10, 12): **HIGH** — each is a quoted line from a file opened with `Read` this session.
- Platform rules (Pitfalls 1, 8, 11): **MEDIUM** — official PostgreSQL and Telegram documentation, read this session; the two `[ASSUMED]` edges are named in the Assumptions Log.
- Prisma NULL/relation-filter semantics (A1, A3): **LOW** — undocumented on the page that should carry it; both are avoided by construction rather than relied on.
- Architecture patterns: **HIGH** — every pattern is a direct extension of a shipped, tested pattern in the same file it extends.

**Research date:** 2026-09-05
**Valid until:** 2026-10-05 (stable stack; re-check only if grammY, Prisma, or the Bot API is upgraded)
