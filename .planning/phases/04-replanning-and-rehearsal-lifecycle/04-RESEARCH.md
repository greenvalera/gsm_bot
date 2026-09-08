# Phase 4: Replanning and Rehearsal Lifecycle - Research

**Researched:** 2026-09-08
**Domain:** In-repo state-machine extension — Prisma/PostgreSQL enum + column migration, grammY callback routing, availability-outcome derivation, week-claim arithmetic
**Confidence:** HIGH for in-repo findings (every claim below cites a file and line range read this session); MEDIUM for the two external documentation claims

## Summary

Phase 4 adds **no new dependency and no new architectural pattern**. Every mechanism it needs already exists in `src/domain/planning/planning-service.ts` and was shipped by Phase 3: the confirm-then-apply pair (`openBookingGate` / `requestBooking` / `keepBooking` / `applyBooking`), the compare-and-set announcement claim (`claimReadyAnnouncementWindow`), the guarded supersede write (`supersedeStaleRounds`), the two-live-message discipline (`anchorMessageId` / `announcementMessageId`), and the closed-union result shapes every dispatcher fans out over. The phase's work is almost entirely **editing five named functions and adding one migration**, not building new machinery.

The three highest-risk areas, in order. **(1) `availabilityOutcome()` is a 10-line pure function with exactly seven consumers** (enumerated below); D-01 reorders its predicates so `blocked` fires on the first "Cannot attend" rather than on a complete answer set. Six of the seven consumers are unaffected by the reorder; the seventh — the card's closing sentence — needs new copy naming the blocker. Because `AvailabilityOutcome` gains no new member, **the compiler will not find these sites for you**; the enumeration in `## Architecture Patterns` is the checklist. **(2) D-03 gives the announcement slot a second meaning**, which means `claimReadyAnnouncementWindow`'s CONFIRMED-only guard, `renderStep`'s slot predicate, and `handlePlanStatusCommand`'s `readyToBook` predicate must all widen together or the blocked announcement becomes unreachable from `/plan_status` and the two predicates silently drift. **(3) D-09's distinct superseded-round refusal is only reachable if the superseded round's answer tokens are left live** — the established `requestBooking` precedent of expiring a superseded pair would push the refusal above the dispatcher into the callback boundary, where the copy is fixed to `PLANNING_STALE_TEXT`, which D-09 explicitly forbids.

One discretion item the CONTEXT hands to research is settled below: **`/plan_change` should be scoped to the round's own `targetWeekStart`** (same-week date/time change only). A cross-week change would have to re-run `weekIsClaimed()` itself, because `confirm()` never re-checks the week claim — that check lives only in `startOrResume`, and a cross-week change would be the first path to bypass it.

**Primary recommendation:** Treat Phase 4 as five surgical edits to named functions (`availabilityOutcome`, `previousRehearsal`, `wasPreviousParticipant`, `targetWeekStart`, `claimAnnouncement`) plus one supersede-and-create transaction modelled statement-for-statement on `confirm()`, one confirm-then-apply pair modelled on `applyBooking`, and one Prisma migration modelled on `20260905120000_availability_and_booking`. Add nothing that does not already have a precedent in the file being edited.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Replan Trigger (AVAIL-05)**

- **D-01:** The **first "Cannot attend" closes the round and prompts for a new slot immediately** — the band is not made to wait for stragglers to answer about a slot that is already dead. But the closure is **reversible until a new slot is committed**: the person who blocked it can flip their own answer back and the round reopens exactly as it was. This **amends Phase 3 D-05** ("records and keeps the round open"), and it is the only reading that satisfies AVAIL-05's literal text without discarding D-04's rule that a mis-tap must never cost the group a round. The closure is a *derivation*, not a new column: `availabilityOutcome()` returns `blocked` as soon as any participant is `UNAVAILABLE`, instead of waiting for a complete answer set. — **Reversibility:** costly — the `blocked` derivation is read by the card, the announcement directive, and the replan gate; moving the trigger again means changing all three together.
- **D-02:** While the round is blocked, **both answer buttons stay live for every participant**. Nothing is removed from the keyboard; the card text changes to say the slot does not work and who blocked it, and the replan control is added for the eligible actor. D-04 therefore stays literally true for the round's whole life, there is no second class of participant to render, and reopening needs no special action — it is just somebody tapping "Can attend".
- **D-03:** The **announcement slot is the round's single break-through message**, carrying whichever fact the round currently warrants: "everyone is available, book it", or "this slot does not work, a new one is needed". This reuses the existing `AnnouncementDirective` union (`post` / `edit` / `retract` / `none`), the `readyAnnouncedAt` compare-and-set, and the `READY_ANNOUNCE_COOLDOWN_MS` window wholesale — a reopen retracts the blocked message the same way a flipped answer already retracts a ready-to-book one. No third durable message slot is introduced. — **Reversibility:** costly — the claim column and the directive union acquire a second meaning; splitting the two message kinds apart later means a new column, a new re-post path, and a change to what `readyAnnouncedAt` asserts.
- **D-04:** **The planning author or any current chat administrator** may act on the replan prompt, resolved fresh at the action boundary per AUTH-02 and Phase 1 D-12 — the same eligibility rule Phase 3 D-13 gave to booking, and for the same reason: a blocked round must not stall for thirty minutes waiting on `PLANNING_INACTIVITY_MS` because its author has gone quiet. Anyone else gets a private alert naming who can. The attribution question this raises is settled by D-06.

**Replan Mechanics (AVAIL-06, AVAIL-08)**

- **D-05:** Replanning **supersedes the old round and creates a new one**, in one transaction: the old round moves to `SUPERSEDED` and releases `activeWeekStart` to NULL, and a new `PlanningRound` is created at `step: DAY` re-claiming that week. Every attempted slot survives as a row, so the chat has a record of what was tried. AVAIL-08 becomes **structural** rather than a race to win — an old button's token names a superseded round id, and the refusal is decided by identity, not by an `expectedRevision` comparison. The two writes to `activeWeekStart` must be in the same transaction or `@@unique([chatId, activeWeekStart])` will reject the new round. — **Reversibility:** one-way — a round-per-attempt and a link column become the durable history that Phase 5's reminder targeting and every later lifecycle read consume; collapsing back to a single rewound row means a migration and a change to what "a round" means.
- **D-06:** The new round's **`authorUserId` is whoever replanned**. This is what makes D-04's author-or-administrator eligibility coherent rather than a violation of D-02: an administrator who replans does not act on someone else's round, they start their own. The card's attribution line and its controls therefore cannot disagree, which is the drift `planningOwnerLine` exists to prevent.
- **D-07:** The new round **snapshots the chat's currently active roster**, exactly as Confirm does in Phase 2 — it is not a copy of the superseded round's participants. This is the reconciliation AVAIL-06 has been waiting for since Phase 2's deferred list: **"explicitly changed" means roster management** (ROST-01 / ROST-02), and "preserved" is simply what a re-snapshot yields when nobody changed the roster, which is the normal case. It also makes Phase 3 D-06's own sentence — "roster changes take effect on the *next* round" — true rather than aspirational, because under D-05 a replan **is** a next round. A replan attempted with an emptied active roster is refused, per Phase 2 D-10. — **Reversibility:** one-way — this is the settled answer to a cross-phase requirement tension; reversing it re-opens PLAN-09 and needs a per-round participant surface that does not exist.
- **D-08:** When the new round starts, the superseded round's card is **edited to a terminal, keyboard-less line recording the attempt that failed**, its announcement is retracted, and the **new round posts its own day selector as a fresh message**. After a block the old card is buried under chat traffic and the new one has to be where people are looking — the same instinct as Phase 2 D-14's status re-post. The chat is left with a readable trail of what the band tried.
- **D-09:** A tap on a **superseded round's** button receives a **distinct private alert** — "this slot was replanned", pointing at `/plan_status` for the current card. It must **not** reuse `PLANNING_STALE_TEXT`, whose advice ("send /plan to start again") is actively wrong here: the replanned round already claims the week, so `/plan` would refuse with `week-taken` and leave the tapper with two errors and no explanation. Same principle as Phase 3's `not-a-participant` and `already-booked` — a distinct fact gets distinct words because it sends a person somewhere different.

**Cancel and Change (LIFE-03, LIFE-04, LIFE-06)**

- **D-10:** Cancel and change are reachable **both as commands and as inline controls** — `/plan_cancel` and `/plan_change` alongside `/plan` and `/plan_status`, plus buttons on the round's live message. The command is the surface that survives: LIFE-03 and LIFE-04 must work on a rehearsal booked days earlier, whose messages chat traffic has long buried. The buttons are what the band will actually reach for while the round is on screen.
- **D-11:** The controls ride the **round's current control-bearing message** — the announcement when one exists, the availability card when it does not. This is the rule Phase 3 D-17 already established for Mark as booked. Phase 3 D-16 ("a closed card carries no controls") is **narrowed, not reversed**: booking removes the *answer* controls, and lifecycle controls follow the control-bearing message. There is exactly one keyboard to reason about at any moment, and it is always on the message the band most recently heard from.
- **D-12:** **Change runs the same machine as replan** (D-05): supersede, re-snapshot the live roster, neuter the old messages, post a fresh day selector. LIFE-04's "start a fresh availability round" and AVAIL-06's are the same sentence, and they must not become two code paths that can drift.
- **D-13:** Cancellation writes a **new `CANCELLED` value on `PlanningRoundStatus`, appended LAST**, together with `cancelledAt` and `cancelledByUserId` detail columns on the Phase 3 D-15 precedent — the status is the authority for "is it cancelled", the timestamps are detail. `CANCELLED` is absent from `WEEK_CLAIMING_STATUSES`, which is what makes LIFE-06's week release automatic, and absent from `RECOVERABLE_ROUND_STATUSES`. It is deliberately **not** a reuse of `SUPERSEDED`: a superseded round has a successor and a cancelled one never will, and `previousRehearsal()` must never read a cancelled slot as a rehearsal that happened. The append position is load-bearing — `hasExactValues` in `prisma/migrate-deploy.mjs` compares the catalog's labels index by index, and a label inserted mid-list fails the deploy preflight on a correctly migrated database. — **Reversibility:** one-way — a Prisma enum value, its migration, and the preflight's expected-label list.
- **D-14:** Both cancel and change take a **named confirmation step**, on Phase 3 D-14's precedent: these are the transitions with no undo, and the confirm-then-apply pair is the established mis-tap guard. Eligibility is fixed by the requirements themselves — the planning author or a chat administrator — and is re-decided **inside the apply transaction**, never carried on the wire.
- **D-15:** Cancelling a **`BOOKED`** rehearsal posts a **new group message**; cancelling a round that is still collecting **edits the control message in place**. Phase 3 D-12's argument that an in-place edit notifies nobody applies with more force to bad news than it did to good: the band has arranged their week around a booked rehearsal. A round somebody started by mistake ninety seconds ago has cost nobody anything and does not earn a notification.

**Rehearsal Lifecycle Defaults (LIFE-02, LIFE-05)**

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

### Deferred Ideas (OUT OF SCOPE)

- **Suppressing reminders made obsolete by a replan, cancellation, or completion** — Phase 5 (REM-05). D-05's supersede-and-create and D-13's `CANCELLED` are the state transitions that suppression will key off; Phase 4 must leave them cleanly observable and nothing more.
- **Targeted follow-ups that mention only outstanding participants** — Phase 5 (REM-03/REM-04). Phase 3 D-10 keeps real mentions off the card edit path so this still lands cleanly in a fresh message.
- **Duplicate-update and restart idempotency as delivered capabilities** — Phase 5 (RELI-02/RELI-03). Phase 4 inherits and must not weaken the `expectedRevision` and consumed-token guards.
- **Per-round participant adjustment** — still deferred from Phase 2 D-09; would revive the removed PLAN-09. D-07 settles AVAIL-06 without it, and deliberately so.
- **Promoting the one-live-`book-request`-row invariant to a partial unique index** on `(chatId, targetId) WHERE consumedAt IS NULL` — the declared precondition recorded in `03-SECURITY.md`. Phase 4 adds more confirm-then-apply pairs under the same single-process assumption; if any of them makes multi-process deployment more attractive, this is the promotion path.
- **Automatic studio booking** — v2 (BOOK-01 through BOOK-05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AVAIL-05 | A "Cannot attend" response closes the current round and prompts its planning author to select a new date and time. | `## Architecture Patterns` → Pattern 1 (the `availabilityOutcome` reorder, its seven consumers) and Pattern 3 (the blocked announcement through the existing `AnnouncementDirective` machinery). |
| AVAIL-06 | Replanning creates a new availability round with all responses reset and the participant snapshot preserved unless explicitly changed. | Pattern 2 (supersede-and-create, modelled on `confirm()` at `planning-service.ts:2113-2308`); D-07's re-snapshot is `listActiveMemberships` + `createMany`, verbatim from `confirm()`. |
| AVAIL-08 | A stale or superseded button cannot mutate the active round and receives a clear explanatory response. | Pattern 5 (the superseded-round refusal must be produced by the dispatcher, not by the boundary — the tokens must be left live); Pitfall 4 (the unguarded stale fallthrough will swallow a new union member). |
| LIFE-02 | A manually booked rehearsal counts as scheduled when the bot chooses the target week for future planning. | **Already satisfied — verify only.** `WEEK_CLAIMING_STATUSES` already contains `BOOKED` (`target-week.ts:42-45`), and `tests/unit/target-week.test.ts:90-95` already pins it. Phase 4 needs coverage that a BOOKED round makes `targetWeekStart()` roll, not an implementation. |
| LIFE-03 | The planning author or a chat administrator can cancel an active or booked rehearsal. | Pattern 4 (confirm-then-apply pair modelled on `openBookingGate` + `applyBooking`); Pattern 6 (the `CANCELLED` migration and its three preflight edits). |
| LIFE-04 | The planning author or a chat administrator can change a rehearsal's date or time and start a fresh availability round. | Pattern 2, shared with AVAIL-06 per D-12 — one domain method, two callback doors. Open Question 1 resolves the same-week scope. |
| LIFE-05 | After a booked rehearsal's scheduled end, it becomes the previous rehearsal used for future day, time, and participant defaults. | Pattern 7 (`previousRehearsal()`'s `endsAt` filter; why no null guard is needed and why the `orderBy` should stay on `startsAt`). |
| LIFE-06 | Cancelling a rehearsal releases its week so a new planning process can be started when appropriate. | Pattern 8 (`targetWeekStart()`'s selectable-day roll). LIFE-06's "releases its week" half is free — `CANCELLED` is simply absent from `WEEK_CLAIMING_STATUSES`; the "when appropriate" half is the D-18 edit. |
</phase_requirements>

## Project Constraints (from `.claude/CLAUDE.md`)

`claude_md_path` is `./.claude/CLAUDE.md` (`.planning/config.json`). Its actionable directives that bind this phase:

| Directive | Bearing on Phase 4 |
|-----------|--------------------|
| `callback_data` is 1–64 bytes; send compact, versioned opaque data; never serialize names, dates, or authorization claims into it | Every new target (replan, cancel, change, and their confirmation pairs) carries only `{action, roundId}` in the server-side `CallbackAction.targetId`; the wire token stays `v1:<uuid>`. |
| Acknowledge every callback immediately / exactly once | Each new dispatcher branch owns exactly one `answerCallbackQuery`, deferred to the branch that owns the outcome, with the boundary's fallback behind it. |
| Treat updates as untrusted and unordered; authorize from PostgreSQL; use a transaction plus constraints for every transition | Cancel/change eligibility is re-decided inside the apply transaction from `PlanningRound.authorUserId` plus a freshly resolved role. |
| Persist an application roster; `getChatMember` only guaranteed when the bot is an administrator | D-07's re-snapshot reads `listActiveMemberships`, never Telegram. |
| Keep durable business state in PostgreSQL; grammY is transport only | The replan/cancel state machine lives entirely in `PlanningRound.status`. |
| Store timestamps as `timestamptz`, chat/user identifiers as `bigint` | `cancelledAt` is `@db.Timestamptz(3)`; `cancelledByUserId` is `BigInt?`. |
| Verified stack: Node `>=24.19 <25`, TypeScript 7.0.2, grammY 1.45.1, Prisma 7.9.1, PostgreSQL 18.4, Vitest 4.1.11, Testcontainers 12.1.0 | No new dependency is needed or permitted by this phase. |
| Prisma Migrate with a committed migration history | One new migration directory under `prisma/migrations/`. |
| Documentation language: English; agent-runtime portability (Codex and Claude Code) | All artifacts in English; no runtime-specific tooling in scripts. |
| Project instructions: start work through a GSD command; no direct repo edits outside a GSD workflow | Planning and execution proceed through `/gsd-plan-phase` and `/gsd-execute-phase`. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| "Cannot attend" closes the round (AVAIL-05) | Domain (`availabilityOutcome`) | Telegram (copy) | A pure derivation over participant rows; the surface only chooses words from a state the domain already decided (`planning-renderers.ts:456-474` records this rule). |
| Blocked-state break-through message (D-03) | Domain (`claimAnnouncement` / `claimReadyAnnouncementWindow`) | Telegram (`dispatchAnnouncement`) | The *right to notify* is a durable compare-and-set; only the message body is a rendering concern. |
| Supersede-and-create (AVAIL-06, LIFE-04) | Database (one transaction) | Domain | `@@unique([chatId, activeWeekStart])` is the guarantee; `sequentialize` only narrows the window (`planning-service.ts:1670-1675`). |
| Superseded-button refusal (AVAIL-08) | Domain (`answerAvailability` / `openBookingGate` status branch) | Telegram (alert copy) | The refusal is decided by round identity and status read inside the transaction; the boundary cannot see it. |
| Cancel / change eligibility (LIFE-03/LIFE-04) | Domain (apply transaction) | Telegram API (`getChatMember` at tap time) | AUTH-02: role resolved fresh at tap time, re-decided inside the transaction; a rendered control is never authority. |
| Week release (LIFE-06) | Domain (`WEEK_CLAIMING_STATUSES` membership) | — | Automatic: `CANCELLED` is simply not in the set. No write is needed to "release" anything. |
| Selectable-week roll (LIFE-06 "when appropriate") | Domain (`targetWeekStart` + `isPastDay`) | — | Pure civil-date arithmetic; no `Intl` and no clock reads (`target-week.ts:70-92`). |
| `CANCELLED` label + detail columns | Database (migration) | Deploy preflight (`prisma/migrate-deploy.mjs`) | The label order is a catalog fact the preflight asserts index by index. |
| Prior-participant standing (D-19, AUTH-01) | Domain (`wasPreviousParticipant`) | — | An authorization input, not a display one (`planning-service.ts:1508-1524`). |

## Standard Stack

### Core

No package is added, upgraded, or removed by this phase. The stack below is what the phase edits within; every version is the one already pinned in `package.json`.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` / `prisma` | 7.9.1 | Typed data access, migration history | Already the project's ORM; the enum + column migration follows its Migrate workflow. [VERIFIED: package.json:26,41 — `"@prisma/client": "7.9.1"`, `"prisma": "7.9.1"`] |
| `grammy` | 1.45.1 | Telegram transport | Already the framework; new commands register through `bot.command(...)` exactly as `plan` and `plan_status` do. [VERIFIED: package.json:30 — `"grammy": "1.45.1"`] |
| `zod` | 4.4.3 | Callback target validation | `planningTargetSchema` gains new discriminated members. [VERIFIED: package.json:33 — `"zod": "4.4.3"`] |
| `pg` | 8.23.0 | PostgreSQL driver behind `@prisma/adapter-pg` and the deploy preflight | The preflight's catalog queries run through `pg` directly. [VERIFIED: package.json:31 — `"pg": "8.23.0"`; prisma/migrate-deploy.mjs:6 — `import { Client } from "pg";`] |
| `pino` | 10.3.1 | Structured logs | New outcomes/reasons join the closed `PLANNING_OUTCOMES` / `PLANNING_REASONS` unions. [VERIFIED: package.json:32 — `"pino": "10.3.1"`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | 4.1.11 | Unit + integration runner, two named projects | Every plan's verification. [VERIFIED: package.json:47 — `"vitest": "4.1.11"`; vitest.config.ts declares `name: "unit"` and `name: "integration"`] |
| `testcontainers` | 12.1.0 | Disposable PostgreSQL 18.4 for migration and repository tests | The migration-preflight matrix and every `planning-*.test.ts` integration file. [VERIFIED: package.json:46 — `"testcontainers": "12.1.0"`; tests/helpers/postgres.ts:106 — `new GenericContainer("postgres:18.4")`] |
| `typescript` | 7.0.2 | `npm run build` = `tsc --noEmit` | The closed-union exhaustiveness that catches most missed branches. [VERIFIED: package.json:45 and package.json:14 — `"build": "tsc --noEmit"`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A new `CANCELLED` enum label | A `cancelledAt IS NOT NULL` predicate with no label | Rejected by D-13, and correctly: `PlanningRound.status` is the single lifecycle position, and `applyBooking`'s own comment forbids branching on a nullable detail column to decide a lifecycle question [VERIFIED: planning-service.ts:2916-2920 — "No call site anywhere may branch on either being non-null to decide whether a round is booked — `PlanningRound.status` is the single lifecycle position"]. |
| A stored `supersededByRoundId` link column | Deriving the successor from `(chatId, targetWeekStart, createdAt)` | The derived form is one query too, but becomes ambiguous once a week has been planned, cancelled, and re-planned: "the next round for this week" is not necessarily "the round that replaced this one". Recommend the explicit nullable scalar. |
| A third durable message column for the blocked message | Reusing `announcementMessageId` | Locked by D-03. The reuse costs the column a second meaning; a third column costs a migration, a third re-post slot in `repostAnchor`, and a third arm in every correction path. |
| Widening `RECOVERABLE_ROUND_STATUSES` to include `CANCELLED` | — | Forbidden by D-13. It would let a cancelled round acquire a fresh anchor and re-post a keyboard. |

**Installation:**

```bash
# None. Phase 4 adds no package.
npm ci   # only to restore the existing, approved lockfile
```

**Version verification:** No new package is proposed, so no registry lookup was performed for a new name. The versions above were read from `package.json` in this session.

## Package Legitimacy Audit

**This phase installs no external packages.** The Package Legitimacy Gate is therefore not applicable: there is no candidate name to check against a registry, and no `postinstall` surface to inspect.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none)* | — | — | — | — | — | No installation in this phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

If planning later concludes a package *is* needed, it must first run `gsd-tools query package-legitimacy check` and gate the install behind a `checkpoint:human-verify` task — the standing project rule recorded in STATE.md ("Approved exact Phase 1 roots including geo-tz@8.1.8; require explicit candidate selection", "tz-lookup@6.1.25 remains rejected").

## Architecture Patterns

### System Architecture Diagram

```
                        Telegram update
                              │
                    ┌─────────┴──────────┐
                    │                    │
              command update       callback_query:data
                    │                    │
                    ▼                    ▼
        ┌───────────────────┐   ┌──────────────────────────┐
        │  PLANNING_ROUTES  │   │ registerCallbackBoundary │
        │  authority:       │   │  1 acknowledge (fallback)│
        │  route-resolved / │   │  2 role revalidate       │
        │  planning-access  │   │  3 load CallbackAction   │
        └─────────┬─────────┘   │  4 chat / expiry / actor │
                  │             └────────────┬─────────────┘
                  │                          │  (row is live: expiry NOT passed)
                  │                          ▼
                  │              ┌──────────────────────────┐
                  │              │ dispatchPlanningCallback │
                  │              │  parse planningTarget    │
                  │              └────────────┬─────────────┘
                  │                           │
        ┌─────────┴───────────────────────────┴──────────────────────────┐
        │                                                                │
        ▼                                                                ▼
 /plan  /plan_status                                       answer │ book-* │ NEW: replan
 /plan_cancel (NEW)  /plan_change (NEW)                           │ cancel-* │ change-*
        │                                                                │
        └───────────────────────────┬────────────────────────────────────┘
                                    ▼
                    ┌───────────────────────────────────┐
                    │        PlanningService            │
                    │                                   │
                    │  READ-ONLY GATE (no writes yet)   │
                    │   token kind/chat/expiry/consumed │
                    │   round status + chatId           │
                    │   eligibility: authorUserId       │
                    │              OR fresh admin role  │
                    │   outcome = availabilityOutcome() │◄── D-01 reorder
                    │                                   │
                    │  ── every refusal returns here ──│
                    │                                   │
                    │  CONSUME  updateMany              │
                    │    consumedAt: null → count === 1 │
                    │                                   │
                    │  TRANSITION updateMany            │
                    │    guarded on status + revision   │
                    │    lost race → releaseAction()    │
                    └────────────────┬──────────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              ▼                      ▼                       ▼
      SUPERSEDE + CREATE       CANCEL (LIFE-03)      BOOK (Phase 3)
      one transaction:         status=CANCELLED
       old.status=SUPERSEDED   activeWeekStart=NULL
       old.activeWeekStart=NULL cancelledAt/By
       old.supersededBy=new.id         │
       new PlanningRound DRAFT         │
       new participants snapshot       │
              │                        │
              └──────────┬─────────────┘
                         ▼
          ┌──────────────────────────────────┐
          │   MESSAGE EFFECTS (never roll     │
          │   back a committed transition)    │
          │                                   │
          │  anchorMessageId ── edit terminal │
          │  announcementMessageId ── retract │
          │  NEW message ── day selector /    │
          │                 cancellation news │
          └──────────────────────────────────┘
                         │
                         ▼
      PlanningRound.status drives every later read:
        WEEK_CLAIMING_STATUSES  → weekIsClaimed / targetWeekStart / previousRehearsal
        RECOVERABLE_ROUND_STATUSES → status() / reanchor()
        (no status filter)      → wasPreviousParticipant   ◄── D-19
```

### Recommended Project Structure

No new directory. The phase edits files that already exist:

```
prisma/
├── schema.prisma                      # PlanningRoundStatus += CANCELLED (LAST);
│                                      #   PlanningRound += cancelledAt, cancelledByUserId,
│                                      #   supersededByRoundId
├── migrate-deploy.mjs                 # + migration const, + PLANNING_ROUND_STATUS_LABELS row,
│                                      #   + roundColumns arm, (+ index arm if indexed)
└── migrations/
    └── 2026MMDDHHMMSS_cancellation/   # ONE migration (see Pattern 6)
src/
├── domain/planning/
│   ├── target-week.ts                 # targetWeekStart() gains the selectable-day roll (D-18)
│   └── planning-service.ts            # availabilityOutcome (D-01), claimAnnouncement (D-03),
│                                      #   previousRehearsal (D-16), wasPreviousParticipant (D-19),
│                                      #   + replanRound(), + cancel confirm/apply pair
├── shared/callback-schema.ts          # planningTargetSchema += replan / cancel-* / change-*
└── telegram/
    ├── handlers.ts                    # ChatReadinessRouteId += command:plan_cancel|plan_change;
    │                                  #   PLANNING_ROUTES += two entries; two bot.command(...)
    ├── keyboards.ts                   # PlanningControlAction += members; labels; declared rows
    ├── planning-renderers.ts          # blocked card copy, blocked announcement, terminal
    │                                  #   superseded line, cancellation render
    └── planning-handlers.ts           # dispatchReplan / dispatchCancel* / dispatchChange*;
                                       #   PLANNING_OUTCOMES + PLANNING_REASONS members;
                                       #   D-09 refusal copy; controlBearingMessageId helper
tests/
├── unit/                              # new: replan derivation, blocked copy, new keyboards,
│                                      #   new logging branches
└── integration/                       # new: replan transaction, cancel transaction,
                                       #   migration-preflight matrix extension
```

### Pattern 1: Reorder `availabilityOutcome()` — and hand-check its seven consumers

**What:** D-01 makes any `UNAVAILABLE` answer sufficient for `blocked`, instead of requiring a complete answer set.

**Current implementation** [VERIFIED: src/domain/planning/planning-service.ts:708-717]:

```ts
export function availabilityOutcome(
  participants: readonly Readonly<{ marker: ParticipantMarker }>[],
): AvailabilityOutcome {
  if (participants.length === 0) return "collecting";
  if (participants.some((cell) => cell.marker === "pending"))
    return "collecting";
  return participants.every((cell) => cell.marker === "available")
    ? "all-available"
    : "blocked";
}
```

Its doc comment states the rule being amended, verbatim: *"Order is load-bearing: a round with anybody still pending is `collecting` whatever the answers so far are, because D-05's 'the slot does not work' is a statement about a COMPLETE set of answers."* [VERIFIED: planning-service.ts:697-707]. That comment is now wrong and must be rewritten in the same edit — it is the only place the old rule is stated in prose.

**Recommended shape:**

```ts
export function availabilityOutcome(
  participants: readonly Readonly<{ marker: ParticipantMarker }>[],
): AvailabilityOutcome {
  if (participants.length === 0) return "collecting";
  // D-01: blocked beats pending. One "cannot attend" is a complete answer
  // about THIS slot; the remaining answers cannot make it work again.
  if (participants.some((cell) => cell.marker === "unavailable"))
    return "blocked";
  if (participants.some((cell) => cell.marker === "pending"))
    return "collecting";
  return "all-available";
}
```

The empty-lineup `collecting` case must stay first and stay answered rather than thrown — the existing comment's reason still holds ("a total function cannot be called at the wrong moment").

**When to use:** once, in the plan that lands D-01. The type `AvailabilityOutcome` gains no member [VERIFIED: planning-service.ts:629 — `export type AvailabilityOutcome = "collecting" | "all-available" | "blocked";`], so **no consumer will fail to compile.** The seven consumers, enumerated by grep this session:

| # | Site | Effect of the reorder |
|---|------|-----------------------|
| 1 | `availabilityStepProjection` — `outcome: availabilityOutcome(cells)` [planning-service.ts:747] | Carries the new value through. No edit. |
| 2 | `claimAnnouncement` — `if (outcome !== "all-available")` [planning-service.ts:2405] | Semantics unchanged for `retract`; **D-03 changes this branch anyway** (Pattern 3). |
| 3 | `answerAvailability` — derives `outcome` from freshly read rows [planning-service.ts:2669-2674] | No edit; it already calls the single derivation. |
| 4 | `openBookingGate` — `if (outcome !== "all-available")` → `unanimity-lost` [planning-service.ts:3069-3077] | Behaviour identical: a round with one "no" and others pending was already `collecting`, already ≠ `all-available`, already refused. No edit. |
| 5 | `AVAILABILITY_OUTCOME_SENTENCES[projection.outcome]` [planning-renderers.ts:563] | **Edit required.** The `blocked` sentence now fires while answers are outstanding, and D-02 requires it to name who blocked it. |
| 6 | `renderStep`'s announcement predicate — `round.readyAnnouncedAt !== null && projection.outcome === "all-available"` [planning-handlers.ts:996-1001] | **Edit required** for D-03 (Pattern 3). |
| 7 | `handlePlanStatusCommand`'s `readyToBook` — `projection?.outcome === "all-available"` [planning-handlers.ts:1773-1776] | **Edit required** for D-03 (Pattern 3), and it must move in lockstep with #6. |

**Naming the blocker without a new projection field.** `AvailabilityStepProjection.participants` already carries a `marker` per cell [VERIFIED: planning-service.ts:652-658 — `AvailabilityParticipantCell` is `{ telegramUserId, firstName, lastName, username, marker }`], so the renderer can filter `marker === "unavailable"` and run the result through the same `sortRosterMembers` + `memberLabel` pair the card already uses [VERIFIED: planning-renderers.ts:551-554]. No domain change, no second identity read, and the `Telegram user ••••NNNN` mask and single escaper are inherited (threat T-01-21).

### Anti-Patterns to Avoid

- **Adding a `blocked` member to `AvailabilityOutcome` or a fourth `AnnouncementDirective` member.** D-03 locks the union at `post` / `edit` / `retract` / `none` [VERIFIED: planning-service.ts:780 — `export type AnnouncementDirective = "post" | "edit" | "retract" | "none";`]. The *directive* says what to do to the message; the *outcome* on the projection says which body to render. Splitting them is what keeps the claim column single-purpose.
- **Re-deriving the outcome at a call site.** Phase 3's standing constraint, restated in `planning-renderers.ts:456-462`: *"the renderer CHOOSES copy from a state `availabilityOutcome` already decided and never re-derives it, so the card and the domain cannot come to disagree about whether a slot still works."*
- **Reaching for the administrator-requirement helper.** `planning-handlers.ts:42-49` states the rule in prose: *"The planning surface never imports the administrator-requirement helper or its permission error: that path deletes the acting user's setup and settings drafts on denial."* Every new eligibility check uses `AuthorizationService.currentRole` (threat T-02-14).
- **Recomputing the target week during a replan.** Phase 2 Pitfall 6, restated at `planning-service.ts:1668-1671`. The new round takes the superseded round's `targetWeekStart` verbatim.
- **Sharing one status list between two questions.** `RECOVERABLE_ROUND_STATUSES`' own comment: *"Sharing one list would make a Phase 4 edit to either question silently change the other"* [VERIFIED: planning-service.ts:160-163]. Phase 4 touches all three sets in different ways; they stay three constants.

### Pattern 2: Supersede-and-create in one transaction (AVAIL-06, LIFE-04, D-05/D-12)

**What:** One domain method — call it `replanRound` — reached from two callback doors (the replan tap, and the change-apply tap), because D-12 forbids two code paths.

**Model it on `confirm()`** [VERIFIED: src/domain/planning/planning-service.ts:2113-2308], statement for statement. `confirm()` already does four of the five things a replan needs, in the right order:

1. read + validate the token (kind, chat, expiry, `consumedAt`, parsed target) → `stale` / `duplicate`;
2. read + validate the round (chat, status) → `stale`;
3. `SELECT id FROM chat_memberships WHERE chat_id = $1 FOR SHARE` [VERIFIED: planning-service.ts:2210-2215] — the READ COMMITTED lock that makes the roster snapshot safe;
4. `listActiveMemberships(tx, chatId)`; `if (members.length === 0) return { kind: "empty-roster" }` [VERIFIED: planning-service.ts:2221-2222] — D-07's empty-roster refusal, free;
5. consume the token with `updateMany({ where: { token, consumedAt: null, expiresAt: { gt: now } } })` asserting `count === 1` [VERIFIED: planning-service.ts:2224-2236];
6. the guarded transition asserting `count === 1`, with `releaseAction` on a lost race [VERIFIED: planning-service.ts:2238-2263];
7. `planningParticipant.createMany` from `members` [VERIFIED: planning-service.ts:2269-2276].

The replan differs only in steps 6–7: instead of one `updateMany` promoting the draft, it runs a supersede `updateMany` on the old round and a `create` for the new one, then `createMany`s participants **onto the new round's id**.

**Recommended transaction body (skeleton):**

```ts
// 1. supersede the old round — status and activeWeekStart in ONE statement
const superseded = await tx.planningRound.updateMany({
  where: {
    id: round.id,
    status: round.status,               // CONFIRMED (or DRAFT for a change)
    revision: expectedRevision ?? round.revision,
  },
  data: {
    status: PlanningRoundStatus.SUPERSEDED,
    activeWeekStart: null,
    lastActivityAt: now,
    revision: { increment: 1 },
  },
});
if (superseded.count !== 1) {
  await this.releaseAction(tx, callbackToken);
  return { kind: "stale" };
}

// 2. create the successor for the SAME week — never a recomputed one
const next = await tx.planningRound.create({
  data: {
    chatId,
    authorUserId: actorId,               // D-06
    targetWeekStart: round.targetWeekStart,
    activeWeekStart: round.targetWeekStart,
    status: PlanningRoundStatus.DRAFT,
    step: PlanningStep.DAY,
    timezone: /* see Open Question 2 */,
    durationMinutes: /* … */,
    dailyStartMinute: /* … */,
    dailyEndMinute: /* … */,
    lastActivityAt: now,
  },
});

// 3. record the link, so D-09 answers "which round replaced this one" in one query
await tx.planningRound.updateMany({
  where: { id: round.id },
  data: { supersededByRoundId: next.id },
});

const actions = await this.mintStepActions(tx, next, now);
```

**The `@@unique([chatId, activeWeekStart])` reasoning, corrected.** The constraint is real [VERIFIED: prisma/schema.prisma:226 — `@@unique([chatId, activeWeekStart])`] and the schema comment explains why NULLs make it work: *"PostgreSQL treats NULLs in a unique index as distinct, so many finished rounds coexist for one week while at most one DRAFT can exist"* [VERIFIED: prisma/schema.prisma:183-186]. But **a CONFIRMED round already carries NULL** — `confirm()` sets `activeWeekStart: null` in the same statement that promotes it [VERIFIED: planning-service.ts:2246-2251]. So for the ordinary replan-a-blocked-CONFIRMED-round case, the CONTEXT's sentence *"the two writes to `activeWeekStart` must be in the same transaction or `@@unique` will reject the new round"* is **vacuously satisfied — there is nothing to release.** The constraint bites in two other cases the plan must still handle:

- **changing a DRAFT round** (its `activeWeekStart` is non-null), where the supersede genuinely must precede the create in the same transaction; and
- **a concurrent `/plan`** that created a draft for the same week between the read and the create. Handle it the way `startOrResume` already does: catch `P2002` via `isUniqueViolation(error)` [VERIFIED: planning-service.ts:1042-1048] and return a refusal, exactly as `startOrResume` maps it to `week-taken` [VERIFIED: planning-service.ts:1756-1759].

Implementing it as one transaction is still correct and required — just do not rely on the constraint as the *only* guard for the confirmed case.

**Two doors, one machine.** The precedent for one statement with two callers is `claimReadyAnnouncementWindow`, whose doc comment states the reason: *"Extracted rather than duplicated because there is now more than one door to the same notification … A second, path-specific window beside this one is exactly the shape that produced gap G-01"* [VERIFIED: planning-service.ts:2323-2328]. Replan (one tap, no confirmation — D-14 names only cancel and change as taking a confirmation) and change-apply (behind a confirmation) call the same method.

### Pattern 3: The blocked announcement rides the existing claim (D-03)

**What:** The announcement slot carries either "ready to book" or "this slot does not work", chosen by the projection's outcome; the directive still says post/edit/retract/none.

**Three coupled edits, which must land together or the two predicates drift:**

1. **`claimAnnouncement`** [VERIFIED: planning-service.ts:2386-2427]. It currently short-circuits on `if (outcome !== "all-available")` and returns `retract` or `none`. It must instead treat `blocked` as a *claimable* outcome (post/edit through `claimReadyAnnouncementWindow`) and keep `retract`/`none` for `collecting`. The three-way shape becomes: `all-available` → claim; `blocked` → claim; `collecting` → retract-if-a-message-exists, else none.

2. **`claimReadyAnnouncementWindow`** [VERIFIED: planning-service.ts:2348-2363]. Its `WHERE` is `{ id, status: PlanningRoundStatus.CONFIRMED, OR: [{ readyAnnouncedAt: null }, { readyAnnouncedAt: { lte: cutoff } }] }`. **Keep the `CONFIRMED` guard exactly as it is.** A SUPERSEDED or CANCELLED round must never win the right to notify the group. Only the *caller's* outcome test widens.

3. **The two `all-available` predicates on the surface.** `renderStep` at `planning-handlers.ts:996-1001` and `handlePlanStatusCommand` at `planning-handlers.ts:1773-1776` each independently test `readyAnnouncedAt !== null && outcome === "all-available"`. `renderStep`'s own comment already warns what happens when the two disagree: *"Gating only the SLOT would leave this predicate in charge of the message body, so a refused claim would still post the ready-to-book copy with a live booking control (D-21a, gap G-01)"* [VERIFIED: planning-handlers.ts:958-961].

   **Recommend extracting one named predicate** — e.g. `announcementBody(round, projection): "ready" | "blocked" | null` — consumed by both. This is the same "one derivation, two callers" move the codebase already makes for the announcement window, and it is the cheapest insurance against the drift the phase's own CONTEXT calls out.

**`readyAnnouncedAt` acquires a second meaning.** D-03 accepts this explicitly and rates it costly-reversible. The column's schema comment must be updated in the same edit, because it currently asserts a narrower fact: *"NULL means the round has never been announced ready to book"* [VERIFIED: prisma/schema.prisma:204-209]. Leaving it is a documentation defect that will mislead Phase 5.

**`READY_ANNOUNCE_COOLDOWN_MS` is 30 minutes** [VERIFIED: planning-service.ts:115 — `export const READY_ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;`] and its rationale explicitly covers a flip-flopping mis-tap: *"at one minute a flip-flopping tap could notify the whole band repeatedly inside a single conversation"* [VERIFIED: planning-service.ts:104-108]. Under D-01, a single participant toggling between the two live buttons now flips the round between `blocked` and `collecting` on every tap. The existing window is exactly the right protection — **do not add a second, blocked-specific cooldown.**

### Pattern 4: Cancel as a confirm-then-apply pair (LIFE-03, D-14/D-15)

**What:** Copy `openBookingGate` + `requestBooking` / `keepBooking` / `applyBooking` [VERIFIED: planning-service.ts:2742-3080] with the round-status set widened and the transition changed.

**The five ordering rules `applyBooking`'s doc comment states, all of which bind here** [VERIFIED: planning-service.ts:2894-2914]:

1. every refusal the gate can produce is a READ and precedes the consume, so a refused tap leaves the control spendable;
2. the role is resolved a second time on the apply path, because an administrator can be demoted between render and tap (T-03-32);
3. the round-state test is re-derived inside the gate, never from the message on screen (T-03-34);
4. the consume is one atomic compare-and-set on `consumedAt IS NULL` asserting `count === 1` (RELI-02, T-03-33);
5. the transition is guarded on `status` AND `revision`; on a lost race the consume is released in the same transaction (`releaseAction`) and the result is `stale`.

**One more rule from `requestBooking`, which is easy to miss:** before minting a replacement confirmation pair, the *previous* pair for the same round is expired in the same transaction by `updateMany({ … targetId in ["book-apply","book-keep"], consumedAt: null }, { expiresAt: now })` [VERIFIED: planning-service.ts:2794-2806]. Its comment records the defect it closes: *"a double tap on an irreversible-looking button stops leaving a valid booking token that is reachable from no screen (T-03-49)"*. The cancel and change pairs need the identical treatment for their own targets. **Note the deliberate asymmetry with Pattern 5:** expiring is right for a confirmation pair (whose refusal genuinely *is* "no longer available") and wrong for a superseded round's answer tokens (whose refusal needs different words).

**The cancel transition:**

```ts
data: {
  status: PlanningRoundStatus.CANCELLED,
  activeWeekStart: null,          // safe and idempotent: already NULL for CONFIRMED/BOOKED
  cancelledAt: now,
  cancelledByUserId: actorId,
  lastActivityAt: now,
  revision: { increment: 1 },
}
```

Guard on `status: { in: [DRAFT, CONFIRMED, BOOKED] }` — the set of positions a cancellation is legal from. Do **not** reuse `RECOVERABLE_ROUND_STATUSES` for this even though it currently has the same three members [VERIFIED: planning-service.ts:169-173 — `[DRAFT, CONFIRMED, BOOKED]`]: that constant answers "can this round's card be re-posted", a different question, and its own comment forbids the sharing.

**D-15's message shape** is decided by the *pre-transition* status the gate read: `BOOKED` → post a new group message; anything else → edit the control-bearing message in place. Read it from the row the gate returned, never from a second read.

### Pattern 5: The superseded/cancelled refusal must come from the dispatcher (AVAIL-08, D-09)

**What:** A tap on a superseded round's still-live button gets distinct words, not `PLANNING_STALE_TEXT`.

**Why this is reachable at all — and how to keep it reachable.** The callback boundary refuses a row whose `expiresAt` has passed *before* the dispatcher runs, and answers with the route's fixed `staleText`:

```ts
if (
  action.chatId !== context.chatId ||
  action.expiresAt <= now ||
  (route.actorBinding === "strict" && action.actorUserId !== context.actorId)
) { … await ctx.answerCallbackQuery({ text: route.staleText, show_alert: true }); return; }
```
[VERIFIED: src/telegram/callbacks.ts:423-437], and for the planning route `staleText: PLANNING_STALE_TEXT` [VERIFIED: callbacks.ts:503-505], whose value is `"This planning action is no longer available. Send /plan to start again."` [VERIFIED: callbacks.ts:39-40].

The superseded round's answer tokens are minted with `availabilityExpiresAt(round, now)` = `endsAt + AVAILABILITY_ACTION_SLACK_MS` (24 h) [VERIFIED: planning-service.ts:117-147 and 1206], so they are **still unexpired** when the round is superseded. The dispatcher therefore runs and can improve the copy — provided **the supersede transaction does not expire them.**

**Recommendation: leave the superseded round's `answer` and `book-request` rows live.** Do not copy `requestBooking`'s expire-the-old-pair move here. Expiring them would push the refusal above the dispatcher into the boundary, where the copy is fixed to exactly the text D-09 forbids. The rows are already swept on schedule by `reapExpiredActions` measuring `PLANNING_ACTION_RETENTION_MS` from expiry [VERIFIED: planning-service.ts:66-75, 3147-3153]. D-08's keyboard-less terminal edit is what removes the buttons from screen; the token staying live only affects a tapper who scrolled back to an old message, which is precisely the person D-09 is written for.

**Where the branches go.** Two status tests must gain arms:

- `answerAvailability` — currently `if (round.status === BOOKED) return { kind: "already-booked" }; if (round.status !== CONFIRMED) return { kind: "stale" };` [VERIFIED: planning-service.ts:2626-2629]. Add `SUPERSEDED` → a new `replanned` kind and `CANCELLED` → a new `cancelled` kind, both before the `!== CONFIRMED` fallthrough.
- `openBookingGate` — the identical pair at [VERIFIED: planning-service.ts:3050-3053]. The `BookingRefusal` union is shared by all three booking transitions [VERIFIED: planning-service.ts:887-905], so a new member forces all three dispatchers to answer it.

**The trap:** each dispatcher ends in an *unguarded* fallthrough that answers `CALLBACK_STALE` — for example `dispatchBookApply`'s trailing block at [VERIFIED: planning-handlers.ts:3030-3038], which logs `"stale-action"` and answers `{ text: CALLBACK_STALE }`. `CALLBACK_STALE` is byte-identical to `PLANNING_STALE_TEXT` [VERIFIED: planning-handlers.ts:107-108 — `"This planning action is no longer available. Send /plan to start again."`]. A new union member with no branch lands there **silently and without a type error**. See Pitfall 4.

### Pattern 6: The `CANCELLED` migration, and its four preflight edits (D-13)

**What:** One Prisma migration adding the enum label and the nullable columns, plus the deploy-preflight expectations that assert the resulting catalog.

**Recommend ONE migration, not two.** The PostgreSQL restriction is only that the *new label* cannot be referenced in the adding transaction — adding nullable columns references nothing about it. This is exactly the precedent already in the repo [VERIFIED: prisma/migrations/20260905120000_availability_and_booking/migration.sql, entire file]:

```sql
-- CreateEnum
CREATE TYPE "ParticipantAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "PlanningRoundStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "planning_participants" ADD COLUMN     "answered_at" TIMESTAMPTZ(3),
ADD COLUMN     "availability" "ParticipantAvailability";

-- AlterTable
ALTER TABLE "planning_rounds" ADD COLUMN     "announcement_message_id" INTEGER,
ADD COLUMN     "booked_at" TIMESTAMPTZ(3),
ADD COLUMN     "booked_by_user_id" BIGINT,
ADD COLUMN     "ready_announced_at" TIMESTAMPTZ(3);
```

The restriction it obeys is documented: *"If `ALTER TYPE ... ADD VALUE` (the form that adds a new value to an enum type) is executed inside a transaction block, the new value cannot be used until after the transaction has been committed."* [CITED: https://www.postgresql.org/docs/18/sql-altertype.html]. Concretely, the new migration must contain **no** `DEFAULT 'CANCELLED'`, **no** `UPDATE … SET status = 'CANCELLED'`, and **no** `CHECK` naming the label. Nullable columns with no default satisfy this, which is why `bookedAt`'s schema comment says *"Nullable with no default, so this migration never has to reference the new enum label"* [VERIFIED: prisma/schema.prisma:214-217].

**Schema edits** [VERIFIED: prisma/schema.prisma:37-49 — the enum block and its order-is-load-bearing comment]:

```prisma
enum PlanningRoundStatus {
  DRAFT
  CONFIRMED
  SUPERSEDED
  BOOKED
  CANCELLED   // appended LAST — see the block comment above
}
```

Three nullable columns on `PlanningRound`: `cancelledAt DateTime? @map("cancelled_at") @db.Timestamptz(3)`, `cancelledByUserId BigInt? @map("cancelled_by_user_id")`, `supersededByRoundId String? @map("superseded_by_round_id")`.

**Four `prisma/migrate-deploy.mjs` edits:**

1. Add `const CANCELLATION_MIGRATION = "<new dir name>";` beside the existing migration constants [VERIFIED: prisma/migrate-deploy.mjs:11-19].
2. Append one row to `PLANNING_ROUND_STATUS_LABELS`:
   `[CANCELLATION_MIGRATION, ["DRAFT", "CONFIRMED", "SUPERSEDED", "BOOKED", "CANCELLED"]]`.
   The existing table is [VERIFIED: prisma/migrate-deploy.mjs:447-451]:
   ```js
   const PLANNING_ROUND_STATUS_LABELS = [
     [PLANNING_MIGRATION, ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"]],
     [INTEGRITY_MIGRATION, ["DRAFT", "CONFIRMED", "SUPERSEDED"]],
     [AVAILABILITY_MIGRATION, ["DRAFT", "CONFIRMED", "SUPERSEDED", "BOOKED"]],
   ];
   ```
   `planningRoundStatusLabels` takes the LAST applied pair [VERIFIED: prisma/migrate-deploy.mjs:453-459], so appending in order is the whole edit. `hasExactValues` compares index by index [VERIFIED: prisma/migrate-deploy.mjs:282-288].
3. Extend `roundColumns` with a `cancellationApplied` arm. The current shape is [VERIFIED: prisma/migrate-deploy.mjs:491-501] — `PLANNING_ROUND_COLUMNS` followed by an `availabilityApplied ? [...] : []` spread. **Do not guess the tuple order.** The comment above it states the rule: *"Both lists are ordered by PHYSICAL column position (`attnum`) … PostgreSQL orders the statements of one `ALTER TABLE` alphabetically in Prisma's generated SQL — so the appended tuples follow the migration's own order, not the Prisma model's"* [VERIFIED: prisma/migrate-deploy.mjs:476-480]. Generate the migration first, read the emitted SQL, and transcribe the order from it.
4. If `supersededByRoundId` is indexed, add a matching `btreeIndex(...)` entry to the `planning_rounds` index list, gated on the same flag. All three new columns are nullable, so **no** `notNullConstraints` entry is added [VERIFIED: prisma/migrate-deploy.mjs:407-411].

**Test edits.** `tests/integration/migration-preflight.test.ts` pins the current final migration as `const TARGET_MIGRATION = "20260905120000_availability_and_booking";` [VERIFIED: tests/integration/migration-preflight.test.ts:26]. The new migration becomes the target, and the two cases that key off it — *"applies the availability migration to a database stopped one migration short"* (line 1068) and *"accepts a fully migrated database with nothing left to apply"* (line 1167) — move with it. Add a case for the cancellation migration applied to a database stopped one short.

### Pattern 7: `previousRehearsal()` — swap the filter column, keep the ordering (D-16/D-17, LIFE-05)

**Current implementation** [VERIFIED: src/domain/planning/planning-service.ts:1494-1506]:

```ts
async previousRehearsal(chatId: bigint, now: Date): Promise<PlanningRound | null> {
  return await this.prisma.planningRound.findFirst({
    where: {
      chatId,
      status: { in: [...WEEK_CLAIMING_STATUSES] },
      startsAt: { lt: now },
    },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
  });
}
```

**The edit is one line:** `startsAt: { lt: now }` → `endsAt: { lt: now }`.

**Two things NOT to add:**

- **No `endsAt: { not: null }`.** SQL `ends_at < now` evaluates to NULL for a NULL column, which is not true, so NULL rows are already excluded. Adding the guard is harmless but noise, and it would imply the null case is reachable when D-16 says it is not: `confirm()` writes `endsAt` in the same statement that sets `status: CONFIRMED` [VERIFIED: planning-service.ts:2199-2201, 2244-2257 — `const endsAt = new Date(startsAt.getTime() + round.durationMinutes * 60_000);` written alongside `status: PlanningRoundStatus.CONFIRMED`].
- **No `OR` fallback to `startsAt`.** It would re-admit a rehearsal that is currently in progress, which is exactly the state D-16 removes.

**Keep `orderBy` on `startsAt`.** Because `durationMinutes` is a per-round snapshot, two rounds can order differently by `endsAt` than by `startsAt`. "The previous rehearsal" is the one that most recently *started*, and both derived values read `startsAt` — `rehearsalDate` and `rehearsalStartMinute` [VERIFIED: planning-service.ts:948-958, both guarded on `round.startsAt === null` and both calling `civilNow(round.timezone, round.startsAt)`]. Ordering by `endsAt` while reading `startsAt` would let a long rehearsal that started earlier beat a short one that started later. Record the choice; it is not obvious.

**Index note:** `@@index([chatId, startsAt])` exists [VERIFIED: prisma/schema.prisma:228]. Filtering on `endsAt` no longer uses it for the range, but it still serves the `chatId` + ordering. For band-sized data this is irrelevant; **no new index is warranted.**

**Two call sites, both internal:** `dayStepProjection` [planning-service.ts:1555] and `timeStepProjection` [planning-service.ts:1587]. Both feed the PLAN-05/PLAN-07 markers. Four test sites exercise it: `tests/integration/planning-round.test.ts:966,1000,1050` and `tests/integration/planning-booking.test.ts:1201`. The last of these has a comment naming the Phase 3 widening it asserts [VERIFIED: tests/integration/planning-booking.test.ts:1176] and will need its expectations moved to the `endsAt` boundary.

### Pattern 8: `targetWeekStart()` — the selectable-day roll (D-18, LIFE-06)

**Current signature** [VERIFIED: src/domain/planning/target-week.ts:93-104]:

```ts
export function targetWeekStart(
  nowCivil: CivilDate,
  isClaimed: (weekStart: string) => boolean,
): string | null {
  let monday = mondayOf(nowCivil);
  for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
    const candidate = isoDate(monday);
    if (!isClaimed(candidate)) return candidate;
    monday = addDays(monday, 7);
  }
  return null;
}
```

D-18 adds a second reason to roll: the week has no still-selectable day. The rule is already written, once, and must be reused rather than restated [VERIFIED: src/domain/planning/planning-service.ts:373-382]:

```ts
export function isPastDay(day: string, today: CivilDate): boolean {
  return day < isoDate(today);
}
```

**Recommended shape** — keep the function pure and total, and keep the roll predicate inside it rather than at the one production call site:

```ts
for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
  const candidate = isoDate(monday);
  if (!isClaimed(candidate) && weekDates(candidate).some((day) => !isPastDay(day, nowCivil)))
    return candidate;
  monday = addDays(monday, 7);
}
```

`weekDates` is already exported from the same module [VERIFIED: target-week.ts:107-112]. **Note the import direction:** `isPastDay` currently lives in `planning-service.ts`, which already imports from `target-week.ts` [VERIFIED: planning-service.ts:43 imports `WEEK_CLAIMING_STATUSES`]. Importing it back would be a cycle. **Move `isPastDay` down into `target-week.ts`** (or into `infrastructure/time/civil.ts`, where `isoDate` lives) and re-export it from `planning-service.ts` so `buildDayStepProjection`'s `classifyDay` [VERIFIED: planning-service.ts:418-431, `if (isPastDay(day, today)) return "past";`] and its existing test importers are unchanged. This is a real, easy-to-hit structural trap.

**Call sites:** exactly one in production — `startOrResume` [VERIFIED: planning-service.ts:1725-1728] — plus eight in `tests/unit/target-week.test.ts` (lines 100, 106, 128, 150, 158, 180, 196, 199), all of which pass a two-argument call. Adding no parameter (the predicate goes inside) means those call sites compile unchanged and their expectations only shift where the current week is exhausted.

**Residual limitation to record, not to fix.** Day-level selectability is what D-18 names. A week whose only remaining day is *today*, where every generated hour has already passed, will still be offered — the time card then shows all hours marked unavailable, per Phase 2 D-06/D-07 and `slotAvailability`. That is **pre-existing Phase 2 behaviour**, not a regression introduced here, and widening the roll to hour granularity would need `ChatConfiguration`'s window inside `targetWeekStart`, which would destroy its purity. Recommend: implement exactly the day rule, and note the today-only case in the phase's UAT.

### Pattern 9: `wasPreviousParticipant()` — drop the status filter entirely (D-19, AUTH-01)

**Current implementation** [VERIFIED: src/domain/planning/planning-service.ts:1526-1537]:

```ts
async wasPreviousParticipant(chatId: bigint, actorId: bigint): Promise<boolean> {
  const count = await this.prisma.planningParticipant.count({
    where: {
      telegramUserId: actorId,
      round: { chatId, status: { in: [...WEEK_CLAIMING_STATUSES] } },
    },
  });
  return count > 0;
}
```

**The edit:** `round: { chatId }`. That is the whole of D-19.

**Why it is safe.** `PlanningParticipant` rows are created in exactly one place — the `createMany` inside `confirm()` [VERIFIED: planning-service.ts:2269-2276] — so a DRAFT round never has participants and the status filter was already vacuous for drafts. Dropping it admits only `SUPERSEDED` and `CANCELLED` rounds' snapshots, which is precisely what D-19 asks for. The rows are bounded by `listActiveMemberships`, i.e. the administrator-curated roster at confirm time.

**Its doc comment must be rewritten**, because it currently asserts the coupling being removed: *"The status set is therefore read from `WEEK_CLAIMING_STATUSES` rather than restated, so a member's standing can never drift away from what counts as a rehearsal."* [VERIFIED: planning-service.ts:1508-1524]. That sentence becomes false. The next paragraph — *"The two questions share a status filter and nothing else"* — is the one D-19 cites, and after this edit they share nothing at all.

**This is an authorization widening (AUTH-01).** See `## Security Domain` for the ASVS V4 treatment and the two tests it requires.

### Pattern 10: One named helper for the control-bearing message (D-11)

D-17's rule is currently stated inline, once, in `dispatchBookRequest`: `if (result.round.announcementMessageId !== null) { … }` with the comment *"The ANNOUNCEMENT is the message that carries the booking control (D-17), so the confirmation replaces it in place"* [VERIFIED: planning-handlers.ts:2589-2608]. `closeBookedRound` states the pair separately, editing both messages [VERIFIED: planning-handlers.ts:2861-2895].

Phase 4 adds three more surfaces that need the same rule (replan control, cancel control, change control), plus a fourth in Phase 5. **Recommend a single helper** — `controlBearingMessageId(round): number | null` returning `round.announcementMessageId ?? round.anchorMessageId` — and route every new lifecycle control through it. Three inline restatements of a two-column rule is exactly the drift the codebase's "one derivation" convention exists to prevent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exactly-once transition under concurrent taps | An `if (row.consumedAt === null)` check followed by an update | `updateMany({ where: { token, consumedAt: null, expiresAt: { gt: now } } })` asserting `count === 1` | The one-statement compare-and-set is *both* the idempotency and the concurrency guarantee; the check-then-act loses to a simultaneous tap [VERIFIED: planning-service.ts:2232-2236]. |
| Rate-limiting a group notification | Reading `readyAnnouncedAt`, comparing, then posting | `claimReadyAnnouncementWindow`'s `updateMany` with the cutoff inside the `WHERE` | *"two concurrent requests both see a clear window and both notify … Only a committed compare-and-set refuses the second one"* [VERIFIED: planning-service.ts:2434-2439]. |
| Deciding who may cancel | A flag on the callback token, or a value captured at render | `round.authorUserId === actorId \|\| isAdministratorRole(role)` inside the apply transaction | *"an administrator can be demoted between the render and the tap, and rendering is never authority (T-03-32)"* [VERIFIED: planning-service.ts:2901-2903]. |
| Fetching the actor's role | `AuthorizationService`'s administrator-requirement helper | `AuthorizationService.currentRole` | The requirement helper deletes the actor's setup and settings drafts on denial (threat T-02-14) [VERIFIED: planning-handlers.ts:42-49 and 2502-2507]. |
| Sorting / labelling participants on a new card | A new formatter | `sortRosterMembers` + `memberLabel` (via `lineupLines`) | They carry the `Intl.Collator` order and the `Telegram user ••••NNNN` mask, and `memberLabel` already escapes — a second escape double-escapes [VERIFIED: planning-renderers.ts:522-527]. |
| Bounding a callback alert that quotes a member label | `String.slice` on a character budget | `boundedLabel(label, budget)` | Telegram counts UTF-16 code units and rejects a lone surrogate; `slice` produces both defects (finding WR-04) [VERIFIED: planning-handlers.ts:198-233]. |
| Retiring a round for a past week | A cron job, an in-process timer, or a durable queue | `supersedeStaleRounds` at read time | *"An in-process timer would not survive a restart and could not coordinate replicas — the exact reasons `.claude/CLAUDE.md` rejects process-memory scheduling"*, and a negative grep in the acceptance criteria holds the line [VERIFIED: planning-service.ts:3082-3095]. |
| Dropping a control from a keyboard | A disabled-button concept | Don't mint the token — `planningControlRows` drops a control whose token is `undefined` | [VERIFIED: src/telegram/keyboards.ts:315-338]. |
| An empty keyboard on a terminal card | `reply_markup: { inline_keyboard: [[]] }` | `withoutEmptyKeyboard(card)` | grammY's `InlineKeyboard` is never `undefined`; an empty one still paints a control strip [VERIFIED: planning-handlers.ts:916-930]. |
| A new lifecycle boolean column | `isCancelled`, `isReplanned` | `PlanningRound.status` plus timestamp *detail* columns | D-13, and the standing rule at [VERIFIED: planning-service.ts:2916-2920]. |

**Key insight:** every one of the above already exists in the two files this phase edits. The phase's failure mode is not "missing library" — it is "a second copy of a rule that already had exactly one home." Every new branch should be able to point at the existing statement it is reusing.

## Runtime State Inventory

Phase 4 changes durable schema and durable state semantics, so the rename/refactor inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `planning_rounds.status` gains a fifth PostgreSQL enum label. Existing rows are untouched — no row is retroactively `CANCELLED`. `planning_rounds` gains three NULL columns; every existing row reads NULL, which is the correct history ("was never cancelled, has no successor"). **`wasPreviousParticipant`'s widening (D-19) changes the meaning of existing `planning_participants` rows**: a person snapshotted into a round that was later superseded now confers `PREVIOUS_PARTICIPANTS` standing where they previously did not. No data migration — the change is in the query, and the widening is the decided intent. | Code edit only. **No backfill, and no `UPDATE … SET status = 'CANCELLED'` may appear in the migration** (PostgreSQL forbids referencing the new label in the adding transaction). |
| **Live service config** | None. The bot has no externally-hosted workflow, dashboard, or ACL configuration. The only external service is the Telegram Bot API, whose registered command list (`setMyCommands`) is *not* set by this codebase — `grep` over `src/` found no `setMyCommands` call, so adding `/plan_cancel` and `/plan_change` requires no external config sync. If the operator has registered commands manually through BotFather, that list is out-of-repo state the runbook should mention. | None in code. Add a runbook line noting the two new commands are not auto-registered with BotFather. |
| **OS-registered state** | None — verified: no `systemd` unit, `pm2` ecosystem file, `launchd` plist, or Task Scheduler registration exists in the repo. The deployment shape is a Docker image plus Compose (`docker:up` → `docker compose up --build bot`, package.json:22). | None. |
| **Secrets / env vars** | None added or renamed. No new configuration key, no new `ChatConfiguration` field. Cancel/change reuse the existing bot token and database URL. | None. |
| **Build artifacts / installed packages** | `src/generated/prisma/` is a **committed, generated** Prisma client (`generator client { output = "../src/generated/prisma" }`, prisma/schema.prisma:1-4). It contains `models/PlanningRound.ts` and `enums.ts`, which encode `PlanningRoundStatus`'s members. **A schema edit without `npm run db:generate` leaves the committed client asserting four labels while the database has five**, and `PlanningRoundStatus.CANCELLED` will not exist at the type level. | **Run `npm run db:generate` and commit the regenerated `src/generated/prisma/` in the same commit as the schema change.** This is the single most likely mechanical failure in the phase. |

## Common Pitfalls

### Pitfall 1: The `availabilityOutcome` reorder is invisible to the compiler

**What goes wrong:** `AvailabilityOutcome` gains no member, so `tsc --noEmit` passes with every consumer untouched. The card then says "This slot doesn't work for the whole band." while four people are still pending, with no indication of who blocked it — a card that reads as broken.
**Why it happens:** the change is to a *predicate order*, not to a *type*.
**How to avoid:** work the seven-site table in Pattern 1 as an explicit checklist; add a unit test asserting `availabilityOutcome([unavailable, pending])  === "blocked"` **and** a rendering test asserting the blocked card names the blocker.
**Warning signs:** a plan that touches `availabilityOutcome` and `planning-handlers.ts` but not `planning-renderers.ts`.

### Pitfall 2: `renderStep` and `handlePlanStatusCommand` drift on the announcement predicate

**What goes wrong:** the blocked announcement is posted by an answer but `/plan_status` re-posts the *availability card* over it, or worse re-points `announcementMessageId` at an availability card — inverting the two columns.
**Why it happens:** the `readyAnnouncedAt !== null && outcome === "all-available"` test is written out twice, independently [planning-handlers.ts:996-1001 and 1773-1776], and only one of them is obvious from a grep for `readyToBook`.
**How to avoid:** extract one named predicate consumed by both (Pattern 3). The `renderStep` comment at lines 951-965 already explains why the slot and the card must agree.
**Warning signs:** a diff that changes one of the two lines.

### Pitfall 3: The migration references the new enum label

**What goes wrong:** `prisma migrate deploy` fails with `unsafe use of new value "CANCELLED" of enum type`, on a live database, mid-deploy.
**Why it happens:** the label cannot be used until the adding transaction commits [CITED: https://www.postgresql.org/docs/18/sql-altertype.html], and Prisma applies each migration file in one transaction.
**How to avoid:** the migration contains only `ALTER TYPE "PlanningRoundStatus" ADD VALUE 'CANCELLED';` and `ADD COLUMN` statements with no defaults. Copy `20260905120000_availability_and_booking/migration.sql`'s shape exactly.
**Warning signs:** the word `CANCELLED` appearing more than once in the generated SQL.

### Pitfall 4: A new refusal kind falls into the unguarded stale fallthrough

**What goes wrong:** a superseded-round tap receives *"This planning action is no longer available. Send /plan to start again."* — the exact copy D-09 forbids, because `/plan` will then refuse with `week-taken`.
**Why it happens:** every planning dispatcher ends in an unguarded `logPlanning(… "stale-action" …)` + `answerCallbackQuery({ text: CALLBACK_STALE })` block with no exhaustiveness check [VERIFIED: planning-handlers.ts:3030-3038 for `dispatchBookApply`; the same shape ends `dispatchAvailabilityAnswer` at 2364-2372 and `dispatchBookRequest` at 2687-2695]. A new `BookingRefusal` or `AnswerResult` member lands there and typechecks.
**How to avoid:** add the explicit branch in every dispatcher that consumes the widened union — `dispatchAvailabilityAnswer`, `dispatchBookRequest`, `dispatchBookKeep`, `dispatchBookApply` — and add a unit test per dispatcher asserting the distinct alert. Consider converting the fallthrough to a `satisfies never` exhaustiveness assertion in the same edit.
**Warning signs:** a new union member with fewer than four new dispatcher branches.

### Pitfall 5: Expiring the superseded round's answer tokens

**What goes wrong:** D-09's distinct alert becomes unreachable — the callback boundary refuses first, with fixed copy.
**Why it happens:** `requestBooking` sets `expiresAt: now` on the superseded confirmation pair [VERIFIED: planning-service.ts:2794-2806] and reads as the house pattern for "retire an old capability". It is the right pattern for a *confirmation pair* and the wrong one here.
**How to avoid:** leave `answer` and `book-request` rows live on a superseded round; let the dispatcher refuse. `reapExpiredActions` cleans up on its own schedule.
**Warning signs:** an `updateMany({ … expiresAt: now })` over `answer` targets inside the supersede transaction.

### Pitfall 6: The generated Prisma client is not regenerated

**What goes wrong:** `PlanningRoundStatus.CANCELLED` does not exist at the type level, or exists in the database but not in the client — a whole plan fails at `tsc` for a reason that looks like a typo.
**Why it happens:** `src/generated/prisma/` is committed to the repo (it is listed under `src/`), so a schema edit alone leaves it stale.
**How to avoid:** `npm run db:generate` in the same task as the schema edit; commit the result.
**Warning signs:** a plan that edits `prisma/schema.prisma` with no `db:generate` step in its verification.

### Pitfall 7: `isPastDay` imported back into `target-week.ts` creates a module cycle

**What goes wrong:** `target-week.ts` importing from `planning-service.ts`, which already imports `WEEK_CLAIMING_STATUSES` from `target-week.ts` [VERIFIED: planning-service.ts:43], is a cycle. Under ESM this manifests as a `TDZ`/undefined-at-module-init failure that only shows up at runtime, not at typecheck.
**Why it happens:** D-18 says to reuse `isPastDay`, which currently lives in the wrong module for that reuse [VERIFIED: planning-service.ts:373-382].
**How to avoid:** move `isPastDay` into `target-week.ts` (or `infrastructure/time/civil.ts`) and re-export it from `planning-service.ts` so `classifyDay` and the existing test imports are unchanged.
**Warning signs:** an `import { isPastDay } from "./planning-service.js"` line in `target-week.ts`.

### Pitfall 8: The `roundColumns` preflight tuples are guessed rather than transcribed

**What goes wrong:** `hasExactColumns` compares index by index [VERIFIED: prisma/migrate-deploy.mjs:379-392], so a wrong order fails the preflight on a *correctly* migrated database — the worst possible failure mode, because it looks like data corruption.
**Why it happens:** the physical order is the migration's alphabetical `ALTER TABLE` order, not the Prisma model's declaration order [VERIFIED: prisma/migrate-deploy.mjs:476-480].
**How to avoid:** generate the migration first; read the emitted `ADD COLUMN` order; transcribe it. Verify with the preflight integration test before writing any application code.

### Pitfall 9: `/plan_status` after a cancellation surfaces last week's booked round

**What goes wrong:** the band cancels this week's round; `/plan_status` re-posts *last* week's booked summary as if it were current.
**Why it happens:** `status()` selects `findFirst({ where: { chatId, status: { in: RECOVERABLE_ROUND_STATUSES } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })` [VERIFIED: planning-service.ts:3334-3337]. `CANCELLED` is not recoverable (D-13), so the cancelled round vanishes from the query and the next-newest recoverable round — possibly a `BOOKED` one from a previous week — wins.
**Why it matters now:** this is **pre-existing Phase 3 behaviour**, but D-13 makes it reachable for the first time, because before this phase there was no way for a round to leave the recoverable set while an older one remained.
**How to avoid:** decide deliberately. Either accept it (a booked rehearsal *is* still a thing the chat may want to see) and cover it in UAT, or bound the query by the current week. Recommend: accept, and make the re-posted booked card's copy unambiguous about its date — `renderBookingConfirmation` already leads with the day heading [VERIFIED: planning-renderers.ts:696-699].

### Pitfall 10: Cancelling a `BOOKED` round leaves the availability card claiming a booked rehearsal

**What goes wrong:** `closeBookedRound` edited both messages to their booked-final state [VERIFIED: planning-handlers.ts:2861-2895]. Cancelling afterwards must correct **both**, or the anchor goes on saying "This rehearsal is booked." — the exact class of defect T-03-27 named for the announcement.
**Why it happens:** D-15 says cancelling a BOOKED round *posts a new message*, which is easy to read as "and touches nothing else".
**How to avoid:** post the new message **and** neuter both durable message ids. `AVAILABILITY_BOOKED_SENTENCE` is `"This rehearsal is booked."` [VERIFIED: planning-renderers.ts:487] and is chosen by `projection.booked`, i.e. by `round.status === BOOKED` [VERIFIED: planning-service.ts:748-750]; once the status is `CANCELLED` the flag is false and the renderer falls back to the *outcome* sentence, which will read "Everyone can make it." — worse than the booked line. The cancelled state therefore needs its own explicit render, not a fall-through.

## Code Examples

### Detecting the round's control-bearing message (D-11)

```ts
// Source: derived from src/telegram/planning-handlers.ts:2589-2608 and 2861-2895,
// which state the D-17 rule inline twice today.
/**
 * The message that carries the round's controls right now (D-11/D-17).
 *
 * The announcement when the round has one, the availability card otherwise.
 * ONE helper rather than a fourth inline restatement of a two-column rule:
 * every lifecycle control this phase adds needs the same answer, and two of
 * them disagreeing is two live keyboards for one round.
 */
function controlBearingMessageId(
  round: Pick<PlanningRound, "announcementMessageId" | "anchorMessageId">,
): number | null {
  return round.announcementMessageId ?? round.anchorMessageId;
}
```

### The read-only gate a cancel transition opens with

```ts
// Source: modelled on src/domain/planning/planning-service.ts:3007-3080
// (`openBookingGate`), whose ordering rules are quoted in Pattern 4.
const action = await tx.callbackAction.findUnique({ where: { token: callbackToken } });
if (
  action === null ||
  action.kind !== CallbackActionKind.PLANNING ||
  action.chatId !== chatId ||
  action.expiresAt <= now
)
  return refuse({ kind: "stale" });
if (action.consumedAt !== null) return refuse({ kind: "duplicate" });
const target = parsePlanningTarget(action.targetId);
if (!target.success || target.data.action !== expected)
  return refuse({ kind: "stale" });

const round = await tx.planningRound.findUnique({ where: { id: target.data.roundId } });
if (round === null || round.chatId !== chatId) return refuse({ kind: "stale" });
if (round.status === PlanningRoundStatus.CANCELLED) return refuse({ kind: "already-cancelled" });
if (round.status === PlanningRoundStatus.SUPERSEDED) return refuse({ kind: "replanned" });

// D-13/D-14: the role was resolved at TAP time and is evaluated HERE, from the
// author column this transaction just read.
if (round.authorUserId !== actorId && !isAdministratorRole(role))
  return refuse({ kind: "not-eligible" });
```

### The new `planningTargetSchema` members

```ts
// Source: extends src/shared/callback-schema.ts:97-131, following the existing
// `.strict()` discriminated-object convention exactly.
z.object({
  action: z.enum([
    "replan",          // one tap, no confirmation (D-14 names only cancel/change)
    "cancel-request",
    "cancel-apply",
    "cancel-keep",
    "change-request",
    "change-apply",
    "change-keep",
  ]),
  roundId: z.string().min(1),
}).strict(),
```

`CallbackActionKind` needs **no** new member: every planning target already travels under `CallbackActionKind.PLANNING` [VERIFIED: prisma/schema.prisma:20-25 — `START_SETUP / SETTINGS_EDIT / ROSTER_REMOVE / PLANNING`, and planning-service.ts:1154, 1202, 1251, 1345 all write `kind: CallbackActionKind.PLANNING`]. This means **no enum migration for `CallbackActionKind`** — only `PlanningRoundStatus` changes.

### The two new command routes

```ts
// Source: extends src/telegram/handlers.ts:238-276 (`PLANNING_ROUTES`).
// `authority` is `route-resolved`, NOT `current-admin`: LIFE-03/LIFE-04 admit
// the round's AUTHOR as well as an administrator, and that is a durable-state
// question the route cannot answer (Phase 1 finding F-7 — declare
// `protectedWhen` deliberately).
{
  id: "command:plan_cancel",
  kind: "command",
  filter: "plan_cancel",
  surface: "planning",
  protectedRoute: true,
  protectedWhen: "always",
  authority: "route-resolved",
},
```

`ChatReadinessRouteId` must gain `"command:plan_cancel"` and `"command:plan_change"` [VERIFIED: handlers.ts:82-94 — the closed union], and `chatReadinessRouteId` resolves every emitted label against `ROUTE_BY_ID` at run time [VERIFIED: handlers.ts:284-301], so a route id in a log line with no table entry throws.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `blocked` requires a complete answer set (Phase 3 D-05) | `blocked` on the first `UNAVAILABLE` (Phase 4 D-01) | This phase | The card's closing sentence and the announcement fire earlier; `openBookingGate` is unaffected. |
| A closed card carries no controls (Phase 3 D-16) | Booking removes the *answer* controls; lifecycle controls follow the control-bearing message (D-11) | This phase | `closeBookedRound`'s `noControls` render gains cancel/change tokens. |
| `previousRehearsal` = most recent round with `startsAt < now` | `endsAt < now` (D-16) | This phase | A rehearsal in progress stops being "the previous one". |
| `wasPreviousParticipant` reads `WEEK_CLAIMING_STATUSES` | No status filter (D-19) | This phase | `PREVIOUS_PARTICIPANTS` standing survives a cancellation or replan. |
| `ALTER TYPE ... ADD VALUE` could not run inside a transaction block at all | Since PostgreSQL 12 it may run inside one; the *label* still cannot be referenced until commit | PostgreSQL 12 | The repo's existing pattern (add label + nullable columns in one migration) is correct and should be copied. [CITED: https://www.postgresql.org/docs/18/sql-altertype.html] |

**Deprecated/outdated:**

- `ABANDONED` on `PlanningRoundStatus` — removed by the integrity migration [VERIFIED: prisma/migrate-deploy.mjs:448-449 — the planning migration's labels include `"ABANDONED"`, the integrity migration's do not]. Do not resurrect it; `SUPERSEDED` and now `CANCELLED` cover the terminal positions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The new round created by a replan should snapshot the **live** `ChatConfiguration` (timezone, duration, daily window), not copy the superseded round's snapshot. | Pattern 2, Open Question 2 | An author who widened the daily window *because* the slot did not work would replan into the old window and be unable to pick the hour they need. Conversely, if the timezone changed, the inherited `targetWeekStart` could name a week boundary the new snapshot disagrees with. |
| A2 | `previousRehearsal()`'s `orderBy` should stay on `startsAt` after the filter moves to `endsAt`. | Pattern 7 | With mixed `durationMinutes`, a long rehearsal that started earlier could be reported as "the previous one" over a short one that started later, mis-marking the PLAN-05/PLAN-07 hints. |
| A3 | An explicit nullable `supersededByRoundId` scalar is preferable to deriving the successor from `(chatId, targetWeekStart, createdAt)`. | Standard Stack → Alternatives; Pattern 2 | If derivation were chosen instead, D-09's alert could name the wrong successor once a week has been planned, cancelled, and re-planned. |
| A4 | Replan is a single tap with no confirmation step; only cancel and change take the D-14 confirm-then-apply pair. | Pattern 2 | If replan also needs a confirmation, the plan's route/target/keyboard inventory is short by one pair. D-14's text names only cancel and change, and D-01's answer-flip reversibility is the stated mis-tap guard — but this is an inference, not a stated decision. |
| A5 | `setMyCommands` is not called anywhere in this codebase, so `/plan_cancel` and `/plan_change` need no external command-list sync. | Runtime State Inventory | If the operator relies on BotFather's registered list for discoverability, the two new commands will be invisible in Telegram's command menu until manually added. |
| A6 | Telegram imposes no practical age limit on a bot editing its own group message, so `/plan_cancel` can still neuter the announcement of a rehearsal booked days earlier (D-10's stated purpose). | Open Question 3 | If an age limit exists, cancelling an old booked rehearsal would fail its edit; the transition would still commit (Phase 3 D-03 rule) but the old message would keep asserting the rehearsal is booked. The `editMessageText` documentation could not be retrieved to confirm. |
| A7 | Accepting Pitfall 9's behaviour (a cancelled round exposing an older booked round to `/plan_status`) is the right call. | Pitfall 9 | If unacceptable, `status()` needs a week bound, which is a wider change than this phase scoped. |

## Open Questions

1. **May `/plan_change` move a rehearsal to a different target week?** *(the CONTEXT's explicit research-and-resolve item)*
   - **What we know:** `weekIsClaimed()` reads `WEEK_CLAIMING_STATUSES` [VERIFIED: target-week.ts:47-56]. A DRAFT round deliberately does **not** claim its week [VERIFIED: target-week.ts:20-26]. And critically, **`confirm()` never re-checks `weekIsClaimed`** — its validations are token, status, step, `weekDates` membership, slot membership, and `slotAvailability` [VERIFIED: planning-service.ts:2137-2181]. The week check exists only in `startOrResume` [VERIFIED: planning-service.ts:1721-1734], whose own comment explains why the constraint cannot catch a mistake there: *"a confirmed round has already released `activeWeekStart` to NULL — there is no live row to collide with"* [VERIFIED: target-week.ts:80-87].
   - **What's unclear:** nothing material — the cost is now measurable. A cross-week change would be the first path that creates a draft for a week without going through `startOrResume`'s claim check, and it would still leave a TOCTOU window until confirm that no index closes.
   - **Recommendation: scope `/plan_change` to the round's own `targetWeekStart`.** Same-week date and time changes satisfy LIFE-04's literal text ("change a rehearsal's date or time and start a fresh availability round"), keep change byte-identical to replan as D-12 requires, and avoid opening the un-guarded confirm-time week check. A band that needs a different week has a clean two-step path that is already fully specified: `/plan_cancel` (LIFE-03) frees the week (LIFE-06, automatic), then `/plan` rolls to the right week (D-18). **Record this in the plan as a decision, and record the rejected alternative's cost** — cross-week would require adding a `weekIsClaimed` check to `confirm()`, which is a Phase 4 scope expansion touching a shipped transition.

2. **Does the replanned round inherit the superseded round's schedule snapshot, or re-read `ChatConfiguration`?**
   - **What we know:** `startOrResume` reads the live configuration for a brand-new round [VERIFIED: planning-service.ts:1746-1749 — `timezone: configuration.timezone, durationMinutes: configuration.durationMinutes, dailyStartMinute: …, dailyEndMinute: …`]. The snapshot exists so a mid-round `/settings` edit cannot move a card already on screen (threat T-02-11) [VERIFIED: prisma/schema.prisma:171-176].
   - **What's unclear:** not decided in CONTEXT. D-07 settles the *roster* re-snapshot but says nothing about the *schedule* snapshot.
   - **Recommendation: re-read `ChatConfiguration`, matching `startOrResume`.** D-07's own logic applies — a replan *is* a next round, so it takes the current facts. Flag the timezone edge: if `configuration.timezone !== round.timezone`, the chat-local week boundary has moved and the inherited `targetWeekStart` may no longer be the chat's current week. Recommend keeping `targetWeekStart` verbatim regardless (Phase 2 Pitfall 6 — never recompute the week mid-round) and covering the timezone-changed-mid-round case in UAT rather than in code.

3. **Is there an age limit on editing a bot's own group message?**
   - **What we know:** `answerCallbackQuery`'s `text` is documented as "notification text, 0-200 characters" [CITED: https://core.telegram.org/bots/api#answercallbackquery], matching `CALLBACK_ALERT_LIMIT = 200` in the codebase [VERIFIED: planning-handlers.ts:187-196]. The `editMessageText` and `deleteMessage` sections could not be retrieved — the Bot API page truncated in two fetch attempts.
   - **What's unclear:** whether a bot can edit its own group message of arbitrary age. D-10 depends on it: `/plan_cancel` must work on a rehearsal booked days earlier.
   - **Recommendation:** the risk is already contained by the Phase 3 D-03 rule that a failed edit never rolls back a committed durable transition, and by `PLANNING_CATCH_SITES.delivery` absorbing and logging the failure. Plan for D-15's new-message-on-BOOKED-cancellation as the *primary* notification and treat the old-message neuter as best-effort. Resolve definitively during planning with a live check against `core.telegram.org/bots/api`.

4. **Is `repostReasonFor` affected?**
   - **What we know:** it handles `CONFIRMED`, `BOOKED`, and a trailing draft case, and its comment says *"A Phase 4 position that renders its own card must add its own reason here; the `BRANCHES` gate in `tests/unit/planning-logging.test.ts` fails a re-post shape that reuses another one's reason"* [VERIFIED: planning-handlers.ts:1829-1852].
   - **Answer:** **no new arm is needed**, because D-13 keeps `CANCELLED` out of `RECOVERABLE_ROUND_STATUSES`, and `status()` only ever returns a round in that set [VERIFIED: planning-service.ts:3334-3337]. Neither `SUPERSEDED` nor `CANCELLED` can reach the function. Verify with a test rather than by inspection.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ⚠️ version mismatch | v24.18.0 installed; `engines` requires `>=24.19 <25` | Upgrade to 24.19.x, or accept the `EBADENGINE` warning for local work |
| npm | Install, scripts | ✓ | 11.16.0 | — |
| Docker Engine | Integration tests (Testcontainers `postgres:18.4`), `docker compose up bot` | ✓ | 29.7.2 | none needed |
| `psql` client | none — the preflight uses the `pg` Node driver | ✗ | — | Not required; `prisma/migrate-deploy.mjs` connects via `pg` [VERIFIED: prisma/migrate-deploy.mjs:6] |
| PostgreSQL server | Integration tests | ✓ via Testcontainers | 18.4 image [VERIFIED: tests/helpers/postgres.ts:106 — `new GenericContainer("postgres:18.4")`] | Compose service for manual work |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- **Node v24.18.0 vs `engines: ">=24.19 <25"`.** Unit tests, typecheck, and Prisma generation all work on 24.18, but `npm install` emits `EBADENGINE` and CI (which presumably pins 24.19+) may behave differently from local. **Recommend the plan include a first-task check** that the executing environment's Node satisfies `engines`, so a version-sensitive failure is diagnosed once rather than per-plan.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11, two named projects [VERIFIED: vitest.config.ts — `name: "unit"` / `name: "integration"`] |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:unit` (= `vitest run --project unit`), or `npx vitest run --project unit tests/unit/<file>.test.ts` |
| Full suite command | `npm run build && npm run test:unit && npm run test:integration` |
| Integration constraints | `fileParallelism: false`, `maxWorkers: 1`, `testTimeout: 60_000`, `hookTimeout: 60_000` — requires Docker [VERIFIED: vitest.config.ts] |
| Typecheck | `npm run build` = `tsc --noEmit` [VERIFIED: package.json:14] |
| Format gate | `npm run lint` = `prettier --check . --ignore-unknown` [VERIFIED: package.json:12-13] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AVAIL-05 | One `UNAVAILABLE` among pending answers yields `blocked` | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ✅ extend |
| AVAIL-05 | Blocked card names who blocked it and keeps both answer buttons live | unit | `npx vitest run --project unit tests/unit/planning-availability-card.test.ts` | ✅ extend |
| AVAIL-05 | Flipping the blocking answer back reopens the round and retracts the blocked announcement | integration | `npx vitest run --project integration tests/integration/planning-availability.test.ts` | ✅ extend |
| AVAIL-06 | Replan supersedes the old round, creates a DRAFT for the same week, re-snapshots the live roster, links successor | integration | `npx vitest run --project integration tests/integration/planning-replan.test.ts` | ❌ Wave 0 |
| AVAIL-06 | Replan with an emptied active roster is refused (D-07 / Phase 2 D-10) | integration | same file | ❌ Wave 0 |
| AVAIL-08 | A tap on a superseded round's answer token gets the distinct replanned alert, never `PLANNING_STALE_TEXT` | unit + integration | `npx vitest run --project unit tests/unit/planning-logging.test.ts` and the replan integration file | ❌ Wave 0 |
| AVAIL-08 | The superseded round's tokens are still live at supersede time (so the dispatcher, not the boundary, refuses) | integration | `tests/integration/planning-replan.test.ts` | ❌ Wave 0 |
| LIFE-02 | A BOOKED round makes `weekIsClaimed` true and `targetWeekStart` roll | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ✅ extend (constant already pinned at line 90) |
| LIFE-03 | Cancel confirm/apply pair: eligibility re-decided at apply, `status: CANCELLED`, `cancelledAt`/`cancelledByUserId` written, refused tap leaves the token spendable | integration | `npx vitest run --project integration tests/integration/planning-cancel.test.ts` | ❌ Wave 0 |
| LIFE-03 | Cancelling a BOOKED round posts a new message and neuters BOTH durable message ids (Pitfall 10) | integration | same file | ❌ Wave 0 |
| LIFE-04 | Change runs the same transaction as replan (one machine, D-12) | integration | `tests/integration/planning-replan.test.ts` | ❌ Wave 0 |
| LIFE-05 | `previousRehearsal` excludes a rehearsal in progress and includes one whose `endsAt` has passed; excludes CANCELLED | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ✅ extend (lines 966, 1000, 1050) |
| LIFE-06 | Cancelling frees the week; `targetWeekStart` rolls past a week with no selectable day left | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ✅ extend |
| D-19 / AUTH-01 | A participant of a CANCELLED or SUPERSEDED round retains `PREVIOUS_PARTICIPANTS` standing; a non-participant gains none | integration | `tests/integration/planning-round.test.ts` (lines 1017, 1049 already assert the positive/negative pair) | ✅ extend |
| D-13 | Migration preflight accepts the new label order and rejects a mid-list insertion | integration | `npx vitest run --project integration tests/integration/migration-preflight.test.ts` | ✅ extend |
| Copy | Cancellation copy never offers an undo; superseded copy never mentions `/plan` | unit | `tests/unit/planning-availability-card.test.ts` structural sweep (the existing precedent at planning-renderers.ts:680-684) | ✅ extend |

### Sampling Rate

- **Per task commit:** `npm run build && npx vitest run --project unit <the touched test file>` — under 30 s.
- **Per wave merge:** `npm run lint && npm run build && npm run test:unit`.
- **Migration-touching waves additionally:** `npm run test:integration -- migration-preflight` before any application code depends on the new label.
- **Phase gate:** `npm run lint && npm run build && npm run test:unit && npm run test:integration` all green before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `tests/integration/planning-replan.test.ts` — covers AVAIL-06, AVAIL-08, LIFE-04
- [ ] `tests/integration/planning-cancel.test.ts` — covers LIFE-03, LIFE-06
- [ ] `tests/unit/planning-replan-card.test.ts` (or extend `planning-availability-card.test.ts`) — blocked-card copy, blocker naming, cancellation render
- [ ] `prisma/migrations/<new>/migration.sql` generated and its column order transcribed into `prisma/migrate-deploy.mjs` **before** any code references `PlanningRoundStatus.CANCELLED`
- [ ] `npm run db:generate` + committed `src/generated/prisma/` regeneration, in the schema-edit task

*No framework install is needed — Vitest, Testcontainers, and the Postgres helper are all present.*

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1`, `security_block_on: "high"` [VERIFIED: .planning/config.json].

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Identity is Telegram's; the bot mints no credential. |
| V3 Session Management | yes | `CallbackAction` rows are the session-equivalent: opaque `v1:<uuid>` tokens bound to chat, actor, target, and expiry, resolved server-side, consumed by compare-and-set. Every new target follows this [VERIFIED: src/shared/callback-schema.ts:5, 133-135; prisma/schema.prisma:143-157]. |
| V4 Access Control | **yes — the phase's principal surface** | Eligibility re-decided inside the apply transaction from `PlanningRound.authorUserId` + a freshly resolved `currentRole`; never from a rendered control, never from a wire claim (AUTH-02, D-04, D-14). |
| V5 Input Validation | yes | `planningTargetSchema` `.strict()` discriminated unions over the server-side `targetId`; `parsePlanningTarget` returns a `safeParse` result every caller checks [VERIFIED: callback-schema.ts:97-131, 203-211]. |
| V6 Cryptography | yes (trivially) | `randomUUID()` from `node:crypto` for tokens [VERIFIED: callback-schema.ts:1, 133-135]. Nothing hand-rolled. |
| V7 Error Handling & Logging | yes | Bounded `PLANNING_OUTCOMES` / `PLANNING_REASONS` unions; a caught value bound under any key but `err` is unloggable [VERIFIED: planning-handlers.ts:278-284]. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Privilege widening via D-19** — a person snapshotted into a round the band immediately cancelled retains `PREVIOUS_PARTICIPANTS` standing to start planning, forever | Elevation of Privilege | **Accepted and decided (D-19).** The widening is bounded by "was on the administrator-curated active roster at some `confirm()`", because `PlanningParticipant` rows are written in exactly one place from `listActiveMemberships` [VERIFIED: planning-service.ts:2269-2276]. It is also strictly narrower than the alternative failure D-19 prevents (silently revoking access for every non-administrator when a chat cancels its only rehearsal). **Required coverage:** a positive test (cancelled round still confers standing) and a negative test (a never-snapshotted member gains none) — both fixtures already exist at `tests/integration/planning-round.test.ts:1017,1049`. **Required note in `04-SECURITY.md`:** ROST-02 removal does not retroactively revoke prior-participation standing, which is already true today for confirmed rounds and is not changed here. |
| **Cancel/change by a demoted administrator** | Elevation of Privilege | Role resolved at tap time via `currentRole` and re-evaluated inside the apply transaction, per `applyBooking`'s rule 2 (T-03-32) [VERIFIED: planning-service.ts:2901-2903]. |
| **Unbounded live-capability inflation** — a request/keep loop minting a new confirmation pair per tap | Denial of Service | Copy `requestBooking`'s expire-the-previous-pair statement (T-03-18, T-03-45, T-03-49) [VERIFIED: planning-service.ts:2794-2806]. |
| **Group-notification flooding via the blocked announcement** — one participant toggling their answer notifies the band on every flip | Denial of Service | `READY_ANNOUNCE_COOLDOWN_MS` (30 min) already covers exactly this; its rationale names the flip-flopping tap [VERIFIED: planning-service.ts:98-115]. Do not add a second window. |
| **Refusal copy leaking who holds power in the chat** | Information Disclosure | `PLANNING_BOOKING_NOT_ELIGIBLE` names the two *roles* and no member label, ids, or administrator list (threat T-03-36) [VERIFIED: planning-handlers.ts:164-174]. Every new refusal must follow it. |
| **Member display names in permanent group history** | Information Disclosure | `memberLabel`'s `Telegram user ••••NNNN` mask and single escaper (T-01-21); never assemble identity columns on the planning surface [VERIFIED: planning-handlers.ts:244-256, planning-renderers.ts:522-527]. The blocked card names the blocker — it must go through `memberLabel`. |
| **Unacknowledged callback from an over-long alert** | Denial of Service (user-visible) | `boundedLabel` in UTF-16 code units, cut on code-point boundaries (WR-04) [VERIFIED: planning-handlers.ts:198-233]; the 200-unit cap matches the documented `answerCallbackQuery` limit [CITED: https://core.telegram.org/bots/api#answercallbackquery]. |
| **Inherited-database migration hazard** — a partially migrated or drifted database silently accepting the new migration | Tampering | The deploy preflight's index-by-index catalog comparison, extended per Pattern 6; the real-PostgreSQL matrix in `tests/integration/migration-preflight.test.ts` must gain the new case. Recorded as a blocking constraint in `02-.continue-here.md`. |
| **Carried precondition (not introduced here):** the one-live-`book-request`-row invariant is a load-then-mint pair closed by chat-key `sequentialize`, a **single-process** guarantee | Tampering | Phase 4 adds *more* confirm-then-apply pairs under the same assumption. **The phase's `04-SECURITY.md` must re-declare this precondition** and note that each new pair inherits it. Promotion path: a partial unique index on `(chatId, targetId) WHERE consumedAt IS NULL` [VERIFIED: `.planning/phases/03-availability-and-booking-decision/03-SECURITY.md` → Declared Preconditions, which cites `create-bot.ts:62`]. |

## Sources

### Primary (HIGH confidence — read in this session)

- `prisma/schema.prisma` (full file) — enum order rule, `PlanningRound` columns and constraints, the `ALTER TYPE` comment
- `prisma/migrate-deploy.mjs` (lines 1-140, 200-520) — migration constants, `hasExactValues`, `hasExactColumns`, `PLANNING_ROUND_STATUS_LABELS`, `expectedApplicationCatalog`
- `prisma/migrations/20260905120000_availability_and_booking/migration.sql` (full file) — the add-label-plus-nullable-columns precedent
- `src/domain/planning/target-week.ts` (full file) — `WEEK_CLAIMING_STATUSES`, `weekIsClaimed`, `targetWeekStart`, `weekDates`, `MAX_WEEK_LOOKAHEAD`
- `src/domain/planning/planning-service.ts` (lines 96-180, 355-460, 600-1060, 1063-1462, 1463-1762, 2113-2462, 2593-3160, 3308-3470) — every function this phase edits
- `src/shared/callback-schema.ts` (full file) — `planningTargetSchema`, token shape
- `src/telegram/planning-handlers.ts` (lines 36-340, 423-500, 869-1068, 1265-1505, 1665-1855, 2064-2400, 2502-2700, 2861-3080) — dispatchers, renderers' callers, logging vocabulary, D-17 inline statements
- `src/telegram/planning-renderers.ts` (lines 419-713) — availability card, announcements, booking confirmation
- `src/telegram/keyboards.ts` (lines 137-340) — `PlanningControlAction`, declared rows, `planningControlRows`
- `src/telegram/callbacks.ts` (lines 30-50, 410-440, 481-546) — the boundary's expiry refusal and `PLANNING_STALE_TEXT`
- `src/telegram/handlers.ts` (lines 78-300) — route table, `ChatReadinessRouteId`, `PLANNING_ROUTES`
- `package.json`, `vitest.config.ts`, `tests/helpers/postgres.ts`, `.planning/config.json`
- `.planning/phases/04-.../04-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/phases/03-.../03-SECURITY.md`
- `.claude/CLAUDE.md` (project instructions, in session context)

### Secondary (MEDIUM confidence)

- [PostgreSQL 18 — `ALTER TYPE`](https://www.postgresql.org/docs/18/sql-altertype.html) — the transaction-block restriction on `ADD VALUE`, quoted verbatim in Pattern 6. Retrieved via `WebFetch`; the `classify-confidence` seam rates the `webfetch` provider **LOW** absent an authoritative-provider assertion, so this is recorded as `[CITED]`, not `[VERIFIED]`.
- [Telegram Bot API — `answerCallbackQuery`](https://core.telegram.org/bots/api#answercallbackquery) — `text` is "notification text, 0-200 characters". Same provider caveat.

### Tertiary (LOW confidence)

- `editMessageText` / `deleteMessage` age constraints — **not retrieved.** Two `WebFetch` attempts against `core.telegram.org/bots/api` returned truncated content without the method sections. Recorded as assumption A6 and Open Question 3.

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** — no package is added; every version was read from `package.json` this session.
- **Architecture: HIGH** — every recommended pattern cites a file and line range read this session, and every one has an existing in-repo precedent being copied rather than invented.
- **Pitfalls: HIGH** — Pitfalls 1, 2, 4, 5, 7, 8, 9, 10 were each derived from a specific code fact verified this session (a non-widening union, two duplicated predicates, three unguarded fallthroughs, an `expiresAt: now` precedent, an import direction, an index-by-index comparison, a `findFirst` ordering, and a status-derived boolean). Pitfalls 3 and 6 are mechanical.
- **External documentation: LOW** — the `webfetch` provider is rated LOW by the `classify-confidence` seam, and one of the three questions could not be answered at all (Open Question 3).
- **Open Question 1 (cross-week change): HIGH** — resolved by a verified absence (`confirm()` performs no week-claim check), which is a stronger basis than the discussion had.

**Research date:** 2026-09-08
**Valid until:** 2026-10-08 for the in-repo findings (stable — they describe committed code); 7 days for the Telegram Bot API claims, which are undated upstream and were only partially retrieved.
