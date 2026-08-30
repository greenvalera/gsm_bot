# Phase 2: Weekly Rehearsal Proposal - Research

**Researched:** 2026-08-30
**Domain:** Telegram inline-card wizard over a durable PostgreSQL state machine, with IANA-timezone-aware civil-week and hourly-slot computation on Node.js 24
**Confidence:** HIGH for the in-repo integration surface and the time/DST policy (both proven in this session); MEDIUM for external API limits; LOW for the two items in the Assumptions Log that need owner confirmation.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Proposal Card Flow
- **D-01:** `/plan` (or the equivalent start command) posts a **single group card that is replaced in place** at every step: day → time → review. No new message per step. The round has exactly one anchor `message_id`, persisted so it can be recovered. — **Reversibility:** costly — the anchor `message_id` becomes a persisted column on the planning round and every step renderer edits rather than sends; switching to message-per-step later means changing every transition and the durable schema.
- **D-02:** Only the **planning author** may advance the card. A tap from anyone else is refused with a private callback alert naming who owns the round. Administrator takeover (D-09) is the single deliberate exception.
- **D-03:** Every step after the first carries a **Back** action that returns to the previous selector with the earlier choice still applied. A mis-tap must never force cancel-and-restart.
- **D-04:** The phase ends at a **durably confirmed proposal**: the review step's Confirm atomically promotes the draft into a committed proposal record (day, time, participant snapshot) and states that the availability round is next. No placeholder or disabled "publish" control is shipped. — **Reversibility:** one-way — the confirmed proposal record is the durable hand-off Phase 3 reads; changing what Confirm commits after Phase 3 exists requires a migration and a change to the Phase 3 contract.

#### Week and Slot Boundaries
- **D-05:** The day selector renders **all seven days** of the target Monday–Sunday week. Days earlier than today are marked as past and **refuse selection** with a private alert; they are never hidden.
- **D-06:** A time slot is offered only when the **whole rehearsal fits**: `start + durationMinutes <= dailyEndMinute`, and `start >= dailyStartMinute`. With the defaults (10:00–21:00, 2h) that yields hourly slots 10:00 through 19:00. This is the containment rule `validateSchedule` already enforces for the configured default (CONF-04).
- **D-07:** When the chosen day is **today**, hours already past are rendered but disabled, exactly like past days — one consistent "in the past" rule across both selectors.
- **D-08:** Default and previous-rehearsal highlights are **leading emoji markers with a legend in the card text** above the keyboard (a distinct marker each for default, previous, and past/unavailable). Word suffixes on button labels are rejected: Telegram button width already truncated a label in Phase 1 (finding F-9). When the configured default and the previous rehearsal coincide, only the default marker is shown (PLAN-05, PLAN-07).

#### Participants
- **D-09:** **The active roster IS the lineup.** The wizard has **no participant-selection step**. On Confirm the proposal snapshots every currently active roster member. Changing who plays is done by changing the roster (`/roster_add`, roster removal) — not per round. This deliberately supersedes the previous-rehearsal-seeded default; see "Requirements Ripple" below. — **Reversibility:** costly — the wizard step, its callback shapes, and the seeding source would all have to be added back, though the confirm-time snapshot column stays valid either way.
- **D-10:** Confirming with an **empty active roster is refused**, with a message directing the author to `/roster_add`: an availability round with nobody in it can never complete. Any non-empty roster confirms normally, including a single member.
- **D-11:** A participant **snapshot is still taken and persisted at confirm time**. Phase 3 needs it to decide who may respond, and the `PREVIOUS_PARTICIPANTS` planning-access policy reads from it.

#### Ownership and Recovery
- **D-12:** A planning process becomes **abandoned by inactivity timeout** — a configured period with no action from the author, following the Phase 1 setup-draft expiry precedent (30 minutes). Only then does a Take over action appear for administrators. An administrator cannot seize an actively-used round.
- **D-13:** Takeover **keeps the existing day/time selections** and continues from where the round stopped; the card shows who took it over. Back on every step (D-03) is how the new author revises anything they disagree with.
- **D-14:** The status request **re-posts the live card** at the bottom of the chat and makes that new message the round's anchor; the previous message stops being live. This is what "recover the active interaction" means once the card is buried by chat traffic (PLAN-10).
- **D-15:** **Anyone in the chat may request status.** The re-posted card renders for everyone, but its buttons still refuse anyone who is not the current author (D-02). Visibility for all, control for one.

#### Requirements Ripple (MUST be reconciled before or during planning)

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

### Deferred Ideas (OUT OF SCOPE)
- **Per-round participant adjustment** — dropped from Phase 2 by D-09. If the band later needs a one-week lineup change without editing the roster, it returns as its own decision (and would revive PLAN-09).
- **Explicit author hand-off of a round** ("I'm stepping away, someone else take it") — considered alongside D-12 and not adopted; the inactivity timeout covers the case.
- **Reconciling `AVAIL-06` and `LIFE-05` with the roster-as-lineup model** — belongs to the Phase 3 and Phase 4 discussions, not here.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONF-04 | Time slots are generated in one-hour increments and never extend beyond the configured daily boundary. | "Slot Generation" pattern — reuse `validateSchedule`'s containment rule verbatim rather than re-deriving it (Don't Hand-Roll #2). |
| AUTH-03 | A chat administrator can take ownership of an abandoned active planning process. | "Abandonment and takeover" pattern — lazy inactivity evaluation on `lastActivityAt`, expected-revision transaction, no scheduler. Pitfall 2 (do not reuse `requireCurrentAdministrator` for planning authorization). |
| PLAN-01 | An authorized user can start rehearsal planning in the group chat. | `canStartPlanning` already exists and is complete (`src/domain/auth/planning-access-service.ts:24-42`). Pitfall 1 is the blocker to fix: the callback boundary hard-denies non-admins. |
| PLAN-02 | The bot permits only one active planning process per chat and target calendar week. | "One active round" pattern — nullable `activeWeekStart` column + plain `@@unique([chatId, activeWeekStart])`; PostgreSQL treats NULLs in a unique index as distinct. Avoids the Prisma `partialIndexes` preview flag. |
| PLAN-03 | Planning targets the current Monday–Sunday week when no rehearsal has occurred or been scheduled in it; otherwise it targets the next week. | "Civil week arithmetic" pattern + the single `weekIsClaimed()` predicate so Phase 4 (LIFE-02/LIFE-06) extends one place. |
| PLAN-04 | The planning author can select from every day in the target Monday–Sunday week. | Day-selector keyboard built on the Phase 1 declared-rows pattern (`src/telegram/keyboards.ts:24-33`); D-05 renders all 7 and refuses past ones. |
| PLAN-05 | The day selector highlights the configured default day and previous rehearsal day, showing only the default highlight when they match. | `ChatConfiguration.defaultWeekday` is `Int` 1..7 with MON=1 — see the weekday-encoding verbatim quote below. Previous-rehearsal source is A1 in the Assumptions Log. |
| PLAN-06 | The planning author can select a valid generated time slot. | "Slot Generation" + "Wall-clock → instant resolution" patterns; skipped/ambiguous DST slots are total cases, not exceptions. |
| PLAN-07 | The time selector highlights the configured default time and previous rehearsal time, showing only the default highlight when they match. | `formatLocalTime` / `MinuteOfDay` already exist; markers per D-08. |
| PLAN-08 | *(superseded by D-09)* A new plan initially selects participants from the previous confirmed rehearsal. | Requirements Ripple — must be rewritten to "snapshots the current active roster at confirm time" before planning locks tasks. |
| PLAN-09 | *(removed from Phase 2 by D-09)* The planning author can add or remove participants from the band roster before publishing availability. | Requirements Ripple — participant changes happen via ROST-01/ROST-02 (Phase 1, shipped). |
| PLAN-10 | A user can request the current planning status and recover the active interaction after messages, restarts, or interruptions. | "Anchor re-post" pattern (D-14/D-15) + cooldown (security threat T-02-08). All state durable in PostgreSQL. |
| RELI-01 | Active planning, roster, settings, responses, and reminder state survive bot restarts. | Every wizard value is a column on `PlanningRound`; no in-memory session, no grammY `conversations`. Integration test with a restarted composition root (Phase 1 precedent: `tests/integration/chat-readiness.e2e.test.ts`). |
</phase_requirements>

---

## Summary

Phase 2 is **not** primarily a "new technology" phase. Every external building block it needs — grammY, Prisma 7, PostgreSQL 18, Zod, the opaque-callback-token pattern, the in-place card replacement pattern, the redacting logger — already exists and is proven in the Phase 1 code that shipped. The two genuinely new technical problems are (a) **IANA-timezone-aware civil-week and hourly-slot arithmetic on Node.js 24**, which is the named open concern in `STATE.md`, and (b) **relaxing the Phase 1 callback boundary so a non-administrator planning author can press a button** without weakening any of the security properties that boundary was hardened to hold.

On (a): **Temporal is not available on Node.js 24.** Verified locally in this session — `node -e "console.log(typeof Temporal)"` on `v24.18.0` prints `undefined`, and Temporal shipped unflagged only in Node.js 26. The recommendation is to add **no time library at all** and implement a ~40-line dependency-free resolver on `Intl.DateTimeFormat(...).formatToParts`, which was written and empirically verified this session against Europe/Kyiv, America/New_York, and Australia/Lord_Howe DST transitions (including a 30-minute shift). This matters disproportionately for this project: Phase 1's dependency history (`tz-lookup` rejected, `geo-tz` approved only after a separate human audit — `STATE.md` Accumulated Decisions) makes any new npm root an expensive, human-gated event. A verified zero-dependency solution avoids that gate entirely.

On (b): `registerCallbackBoundary` in `src/telegram/callbacks.ts` calls `requireCurrentAdministrator` **unconditionally, before the token parse and the durable read**, for every `callback_query:data` update, and it is registered with `exhaustive: true`. As written, a `PREVIOUS_PARTICIPANTS` or `ANYONE_IN_CHAT` planning author who is not a chat administrator **cannot press any planning button**, and a second `registerCallbackBoundary` registration would never be reached. This is the single highest-risk integration point in the phase and the plan must address it explicitly and with a regression test that pins the Phase 1 behavior unchanged.

**Primary recommendation:** Model the round as one `PlanningRound` row carrying every wizard value plus the anchor `message_id`, enforce PLAN-02 with a nullable `activeWeekStart` column under a plain `@@unique([chatId, activeWeekStart])`, compute all week/slot arithmetic in **civil** (wall-clock) space with a dependency-free `Intl`-based resolver used only at the civil→instant boundary, and extend the existing callback boundary with an explicit per-kind authority declaration rather than adding a second boundary.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Command entry (`/plan`, status) | Telegram update router (`src/telegram/handlers.ts`) | — | The one registration point that makes the authorization boundary provable (Phase 1 invariant). |
| Callback dispatch and acknowledgement | Telegram callback boundary (`src/telegram/callbacks.ts`) | — | Telegram honours only the first `answerCallbackQuery` per `callback_query.id`; the boundary owns that single-shot guard. |
| Card text + keyboard rendering | Telegram projection (`renderers`/`keyboards`) | — | Pure transforms; no durable reads, no authorization. Keeps rendering unit-testable without a database. |
| Planning-start authorization | Domain (`planning-access-service.ts`) | Domain (`authorization-service.ts` for the fresh role) | `canStartPlanning` is a pure policy function; the *role* must come from a live `getChatMember` at the action boundary (AUTH-02). |
| Author-ownership authorization (D-02) | Domain (planning service) | PostgreSQL (`PlanningRound.authorUserId`) | Authority is a durable column, never a callback-token claim. |
| Target-week selection (PLAN-03) | Domain (planning service) | Time infrastructure (civil-date helpers) | A pure function of `(now, timezone, claimed weeks)`; deterministic and unit-testable with an injected clock. |
| Day/slot generation (PLAN-04/06, CONF-04) | Domain (schedule) | — | Civil arithmetic only; reuses `validateSchedule`'s containment rule. No timezone needed to *generate* — only to decide "past". |
| Wall-clock → UTC instant resolution | Time infrastructure (`src/infrastructure/time/`) | — | The only place `Intl`/DST reasoning lives. Sits beside the existing `timezone-resolver.ts`. |
| One-active-round invariant (PLAN-02) | PostgreSQL (unique constraint) | Domain (transaction + friendly copy) | `sequentialize` is UX ordering only; the database is the correctness boundary (Phase 1 `01-PATTERNS.md`). |
| Abandonment / takeover (AUTH-03) | Domain (planning service) | PostgreSQL (`lastActivityAt`, `revision`) | Lazy evaluation at read time — no scheduler in Phase 2; pg-boss belongs to Phase 5. |
| Participant snapshot (D-09/D-11) | Domain (planning service reading `RosterService.listActive`) | PostgreSQL (`PlanningParticipant`) | One source of truth for the lineup; the snapshot is the Phase 3 contract. |
| Restart survival (RELI-01) | PostgreSQL | — | Every wizard value and the anchor `message_id` are columns. No in-memory session. |

---

## Standard Stack

### Core — already installed, no change required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| grammy | 1.45.1 | Telegram transport, `InlineKeyboard`, `ctx.api.editMessageText` | Already the project framework; in-place card editing is already proven in `src/telegram/settings-handlers.ts:452,473`. [VERIFIED: package.json dependencies] |
| @grammyjs/runner | 2.0.3 | Long-poll runner + `sequentialize` by chat key | Installed by `createBot` **before** handler registration (`src/app/create-bot.ts:60-64`); middleware registered after non-terminating handlers never runs. [VERIFIED: src/app/create-bot.ts:60-64] |
| @prisma/client + prisma | 7.9.1 | Typed data access, migrations | The migration-first workflow and `revision`/`expectedRevision` guard are established Phase 1 patterns. [VERIFIED: package.json] |
| pg / @prisma/adapter-pg | 8.23.0 / 7.9.1 | PostgreSQL driver | Unchanged. [VERIFIED: package.json] |
| zod | 4.4.3 | Callback target-payload validation | `src/shared/callback-schema.ts` already uses discriminated unions per surface; planning copies that shape. [VERIFIED: src/shared/callback-schema.ts:11-79] |
| pino | 10.3.1 | Redacting structured logs | The allow list **already contains `roundId` and `jobId`** — see the verbatim quote under "In-repo verified values". [VERIFIED: src/shared/logger.ts:21-52] |
| Node.js | `>=24.19 <25` (engines); CI pins `24.19.0` | Runtime | `Intl` with full ICU is built in; no tz library required. [VERIFIED: package.json engines; .github/workflows/ci.yml:51] |
| PostgreSQL | 18.4 | Durable state and uniqueness | Runtime image `postgres:18.4-bookworm`; Testcontainers uses `postgres:18.4`. [VERIFIED: docker-compose.yml:3; tests/helpers/postgres.ts:29] |

### Supporting — new code, no new packages

| Module | Purpose | When to Use |
|--------|---------|-------------|
| `src/infrastructure/time/civil.ts` *(new)* | Civil-date types (`{ year, month, day }` / `"YYYY-MM-DD"`), ISO weekday (MON=1), Monday-of-week, day arithmetic | Every week/day computation in the phase. Pure, no timezone. |
| `src/infrastructure/time/zoned-clock.ts` *(new)* | `civilNow(tz, instant)`, `offsetMsAt(tz, instant)`, `resolveWallClock(tz, civilDate, minuteOfDay) -> { instantMs, kind: "unique" | "ambiguous" | "skipped" }` | The **only** place `Intl` DST reasoning lives. Used to decide "is this slot in the past" and to compute `startsAt`/`endsAt` at confirm time. |
| `src/domain/planning/slot-generator.ts` *(new)* | Hourly slot list from `ChatConfiguration`, reusing the containment rule | CONF-04, PLAN-06, D-06. |
| `src/domain/planning/planning-service.ts` *(new)* | Round lifecycle: start/resume, select day, select time, back, confirm, takeover, status | All durable transitions. |
| `src/telegram/planning-handlers.ts` + `planning-renderers.ts` *(new)* | Route registration, dispatch, card text/keyboards | Mirrors `roster-handlers.ts` / `roster-renderers.ts` split. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dependency-free `Intl` resolver | `luxon@3.7.2` | Mature, ~39M weekly downloads, `DateTime.fromObject({...}, { zone })` handles gaps/ambiguity. Costs a new npm root + a human dependency-approval gate (Phase 1 precedent) + `@types/luxon@3.7.5`. Choose only if the owner wants a battle-tested library over ~40 lines of verified code. [ASSUMED — package discovered via WebSearch/training data, not via official Node/Prisma docs] |
| Dependency-free `Intl` resolver | `temporal-polyfill@1.0.4` | Forward-compatible with the Node 26 native API, so the eventual migration is a delete. Flagged `SUS` (`too-new` — last publish 2026-08-13) by the legitimacy seam; would need a `checkpoint:human-verify`. [ASSUMED] |
| Dependency-free `Intl` resolver | `@date-fns/tz@1.5.0`, `@js-joda/core@6.1.0` + `@js-joda/timezone@2.25.2` | Both viable; js-joda needs a *second* package for tz data and ships its own tzdb copy that must be kept fresh. [ASSUMED] |
| Nullable `activeWeekStart` + plain `@@unique` | Prisma partial index (`where:` on `@@unique`) | Prisma exposes `where` on `@unique`/`@@unique`/`@@index`, but **behind the `partialIndexes` preview feature flag**, and multiple open issues report `migrate dev` dropping/recreating hand-written partial indexes. A preview flag is a poor fit for this project's posture. [CITED: prisma.io/docs/orm/prisma-schema/data-model/indexes] |
| Nullable `activeWeekStart` + plain `@@unique` | Hand-written `CREATE UNIQUE INDEX ... WHERE status='DRAFT'` via `migrate dev --create-only` | Prisma's documented escape hatch for unsupported features, but the shadow-database diff then proposes to drop the index on every subsequent migration. [CITED: prisma.io/docs/orm/prisma-migrate/workflows/unsupported-database-features] |
| Lazy abandonment evaluation | `pg-boss@12.27.0` scheduled reaper | pg-boss is the recommended Phase 5 scheduler (`.claude/CLAUDE.md`). Introducing it in Phase 2 adds a queue schema, a worker lifecycle, and a dependency gate for a problem that needs no background job at all. Defer. |
| PostgreSQL round record | grammY `conversations` / `session` plugin | Explicitly rejected in `.claude/CLAUDE.md` Alternatives Considered: "Conversations replay execution and session state is not the durable, auditable state machine this group workflow needs." Also fails RELI-01. |

**Installation:**
```bash
# No package installation is required for this phase.
```

**Version verification:** Every version above was read from `package.json` in this session. Candidate time libraries were checked against the npm registry on 2026-08-30 with `npm view <pkg> version`.

---

## Package Legitimacy Audit

> Phase 2 as researched installs **no external packages**. The table records the candidates evaluated for the DST decision so that a later reversal of that decision starts from audited data rather than from scratch.

| Package | Registry | Age (last publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| luxon | npm 3.7.2 | 2025-09-05 | ~39.3M/wk | github.com/moment/luxon | OK | Not installed — alternative only |
| @date-fns/tz | npm 1.5.0 | 2026-05-21 | ~36.0M/wk | github.com/date-fns/date-fns | OK | Not installed — alternative only |
| @js-joda/core | npm 6.1.0 | 2026-07-10 | ~4.75M/wk | github.com/js-joda/js-joda | OK | Not installed — alternative only |
| @js-temporal/polyfill | npm 0.5.1 | 2025-03-31 | ~2.41M/wk | github.com/js-temporal/temporal-polyfill | OK | Not installed — alternative only |
| temporal-polyfill | npm 1.0.4 | 2026-08-13 | ~3.54M/wk | github.com/fullcalendar/temporal-polyfill | **SUS** (`too-new`) | Not installed — if ever adopted, the planner MUST add a `checkpoint:human-verify` first |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `temporal-polyfill` — flagged only on publish recency; it is a well-known FullCalendar-maintained package, but the flag stands and gates any adoption.

*All five names were discovered via WebSearch/training data rather than from an authoritative Node or Prisma document, so every one is tagged `[ASSUMED]` in the Alternatives table above regardless of its clean registry lookup. If the owner reverses the zero-dependency decision, the planner must gate the install behind `checkpoint:human-verify`, exactly as Phase 1 did for `geo-tz`.*

Verdicts produced by `gsd-tools query package-legitimacy check --ecosystem npm ...` on 2026-08-30. No candidate declares a `postinstall` script.

---

## Architecture Patterns

### System Architecture Diagram

```
 Telegram group chat
   │
   │  /plan            /plan_status        button tap (callback_query:data)
   ▼                        ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  grammY  ·  sequentialize(chat:<id>)  installed at createBot         │
└──────────────────────────────────────────────────────────────────────┘
   │                        │                        │
   ▼                        ▼                        ▼
┌────────────────┐  ┌────────────────┐  ┌──────────────────────────────┐
│ command route  │  │ command route  │  │ registerCallbackBoundary     │
│ authority:     │  │ authority:     │  │  1 single-shot ack guard     │
│ planning-policy│  │ chat-member    │  │  2 fresh getChatMember role  │  ← must run first
└────────────────┘  └────────────────┘  │  3 parse v1:<uuid> token     │
   │                        │           │  4 load CallbackAction row   │
   │                        │           │  5 PER-KIND authority ←NEW   │
   │                        │           │  6 dispatch by kind          │
   │                        │           └──────────────────────────────┘
   │                        │                        │
   ▼                        ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Domain: PlanningService                              │
│                                                                       │
│  start/resume ──► targetWeek(now,tz) ──► weekIsClaimed(chat,week)?    │
│        │                                        │ yes → next Monday    │
│        ▼                                                              │
│  selectDay ──► selectTime ──► review ──► CONFIRM (atomic)             │
│        ▲            ▲            │           │                        │
│        └── Back ────┴────────────┘           │                        │
│                                              ▼                        │
│  takeover (admin, only if inactive ≥ threshold, expectedRevision)     │
│  status   (anyone; re-post card, re-anchor, cooldown)                 │
└──────────────────────────────────────────────────────────────────────┘
   │                    │                     │                   │
   ▼                    ▼                     ▼                   ▼
┌──────────┐  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Roster   │  │ PlanningAccess   │  │ Slot         │  │ ZonedClock       │
│ Service  │  │ canStartPlanning │  │ generator    │  │ Intl formatToParts│
│ listActive│ │ (pure policy)    │  │ (civil only) │  │ resolveWallClock  │
└──────────┘  └──────────────────┘  └──────────────┘  └──────────────────┘
   │                                                          │
   ▼                                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  PostgreSQL 18 (Prisma)  — the correctness boundary                   │
│  ChatConfiguration ·  ChatMembership  ·  CallbackAction               │
│  PlanningRound  @@unique(chatId, activeWeekStart)  ← PLAN-02          │
│    ├─ anchorMessageId, step, selectedDate, selectedStartMinute        │
│    ├─ authorUserId, lastActivityAt, revision      ← AUTH-03           │
│    └─ PlanningParticipant[] (snapshot at confirm) ← D-11 / Phase 3    │
└──────────────────────────────────────────────────────────────────────┘
   │
   ▼  confirmed proposal record = the Phase 3 contract (D-04)
```

### Component Responsibilities

| File | Role | Responsibility |
|------|------|----------------|
| `src/infrastructure/time/civil.ts` | utility, transform | Civil date type, ISO weekday (MON=1..SUN=7), Monday-of-week, `addDays`, `"YYYY-MM-DD"` codec. No `Intl`, no zone. |
| `src/infrastructure/time/zoned-clock.ts` | provider, transform | `offsetMsAt`, `civilNow`, `resolveWallClock`. The single `Intl` seam. |
| `src/domain/planning/slot-generator.ts` | utility, transform | Hourly slots from `ChatConfiguration`; delegates the fit rule to the shared containment predicate. |
| `src/domain/planning/target-week.ts` | utility, transform | `targetWeek(nowCivil, claimedWeeks)`; `weekIsClaimed()` is the single extension point for Phase 4. |
| `src/domain/planning/planning-service.ts` | service, CRUD | Every durable transition, each an `expectedRevision`-guarded transaction. |
| `src/telegram/planning-renderers.ts` | component, transform | Card text, legend, markers, keyboards. Pure. |
| `src/telegram/planning-handlers.ts` | controller, event-driven | Command routes + `dispatchPlanningCallback`. |
| `prisma/schema.prisma` | model, CRUD | `PlanningRound`, `PlanningParticipant`, `PlanningRoundStatus`, `PlanningStep`, new `CallbackActionKind` member. |

### Recommended Project Structure
```
src/
├── domain/
│   └── planning/          # round lifecycle, target week, slot generation (pure + service)
├── infrastructure/
│   └── time/              # civil.ts, zoned-clock.ts alongside existing timezone-resolver.ts
└── telegram/
    ├── planning-handlers.ts   # routes + callback dispatch (mirrors roster-handlers.ts)
    └── planning-renderers.ts  # card text + keyboards (mirrors roster-renderers.ts)
```

### Pattern 1: Wall-clock → UTC instant with total DST handling (dependency-free)

**What:** Resolve a civil `(date, minuteOfDay)` in an IANA zone to a UTC instant, classifying the three possible outcomes.
**When to use:** Only at the civil→instant boundary — deciding whether a slot is in the past, and computing `startsAt`/`endsAt` at confirm time. Never for day/slot *generation*, which stays purely civil.

```typescript
// Source: written and empirically verified in this session on Node v24.18.0.
// Technique per MDN Intl.DateTimeFormat.formatToParts; DST edge semantics per
// the ECMA-402 / Temporal disambiguation model ("compatible" behaviour).
const partsFmt = (tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

/** The offset (ms) `tz` was at, at a given UTC instant. */
export function offsetMsAt(tz: string, instantMs: number): number {
  const p = Object.fromEntries(
    partsFmt(tz).formatToParts(new Date(instantMs)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - instantMs;
}

const DAY_MS = 86_400_000;

export type WallClockResolution =
  | Readonly<{ kind: "unique";    instantMs: number }>
  | Readonly<{ kind: "ambiguous"; instantMs: number; alternativeMs: number }>
  | Readonly<{ kind: "skipped";   instantMs: number }>;

/**
 * Probe the offset on BOTH sides of any possible transition, form both candidate
 * instants, then keep only the self-consistent ones. Two candidates = the
 * fall-back repeated hour; zero = the spring-forward gap.
 */
export function resolveWallClock(
  tz: string, year: number, month: number, day: number, minuteOfDay: number,
): WallClockResolution {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay, 0);
  const before = offsetMsAt(tz, naive - DAY_MS);
  const after = offsetMsAt(tz, naive + DAY_MS);
  const candidates = [...new Set([naive - before, naive - after])]
    .filter((c) => offsetMsAt(tz, c) === naive - c)
    .sort((a, b) => a - b);
  if (candidates.length === 1) return { kind: "unique", instantMs: candidates[0]! };
  if (candidates.length > 1)
    return { kind: "ambiguous", instantMs: candidates[0]!, alternativeMs: candidates[1]! };
  return { kind: "skipped", instantMs: naive - before };
}
```

Empirically verified this session (`node` v24.18.0), all cases correct:

| Zone | Local date | Wall clock | Result |
|------|-----------|-----------|--------|
| Europe/Kyiv | 2027-03-28 | 03:00 | `skipped` (→ 04:00 EEST) |
| Europe/Kyiv | 2027-10-31 | 03:00 | `ambiguous` (03:00 EEST, alt 03:00 EET) |
| America/New_York | 2027-03-14 | 02:00 | `skipped` (→ 03:00 EDT) |
| America/New_York | 2027-11-07 | 01:00 | `ambiguous` (01:00 EDT, alt 01:00 EST) |
| Australia/Lord_Howe | 2027-04-04 | 02:00 | `unique` (30-minute shift handled) |
| Europe/Kyiv | 2027-03-28 | 10:00–19:00 | all `unique` — the default rehearsal window is untouched by the transition |

### Pattern 2: The DST policy (this closes the `STATE.md` open concern)

**What:** The exact, recordable policy planning must adopt. State it verbatim in the PLAN so the executor has no latitude.

1. **Generation is civil.** Day lists and hourly slots are produced from `ChatConfiguration` minutes-of-day only. DST never changes which slots the containment rule admits (CONF-04, D-06).
2. **Skipped wall clock (spring forward)** → the slot is **rendered and refused**, using the same "past / unavailable" marker and private alert as a past slot (D-05/D-07 already establish "visible, marked, refused"). One consistent unavailability rule.
3. **Ambiguous wall clock (fall back)** → resolves to the **earlier (pre-transition) occurrence**; the slot is offered normally with no special marker. *(Matches the Temporal `"compatible"` disambiguation default.)*
4. **Duration is exact elapsed time.** `endsAt = startsAt + durationMinutes * 60_000`. A rehearsal spanning a fall-back transition is two real hours, not three wall-clock hours. State this in the plan; it is the non-obvious half.
5. **Civil values are authoritative; the instant is derived.** Persist `selectedDate` (`"YYYY-MM-DD"`), `selectedStartMinute` (`MinuteOfDay`), the `timezone` snapshot, **and** the derived `startsAt`/`endsAt` `timestamptz`. Display always renders from the civil pair (so a chat that later changes `timezone` still shows the day the band agreed on); ordering and "is it past" use the instant, which is recomputable from the civil pair plus the zone.
6. **tzdata freshness is a deployment concern.** Node's bundled ICU carries the tz database, so a zone whose rules change (a real and recurring event) is only corrected by a Node upgrade. Note it in the plan's risks; it is not fixable in code.

### Pattern 3: One active round per chat and target week (PLAN-02) without a preview flag

**What:** A nullable "active key" column carrying the week only while the round is live.
**When to use:** Any "at most one row per group in state X" invariant on PostgreSQL under Prisma.

```prisma
enum PlanningRoundStatus { DRAFT CONFIRMED ABANDONED SUPERSEDED }
enum PlanningStep        { DAY TIME REVIEW }

model PlanningRound {
  id                  String              @id @default(cuid())
  chatId              BigInt              @map("chat_id")
  authorUserId        BigInt              @map("author_user_id")
  /// Chat-local Monday of the target week, "YYYY-MM-DD".
  targetWeekStart     String              @map("target_week_start")
  /// Equals targetWeekStart while DRAFT; NULL otherwise. PostgreSQL treats
  /// NULLs in a unique index as distinct, so many finished rounds coexist
  /// while at most one DRAFT exists per (chat, week).
  activeWeekStart     String?             @map("active_week_start")
  status              PlanningRoundStatus @default(DRAFT)
  step                PlanningStep        @default(DAY)
  /// Snapshots taken when the round starts, so a mid-round settings edit
  /// cannot invalidate an in-flight card.
  timezone            String
  durationMinutes     Int                 @map("duration_minutes")
  dailyStartMinute    Int                 @map("daily_start_minute")
  dailyEndMinute      Int                 @map("daily_end_minute")
  selectedDate        String?             @map("selected_date")
  selectedStartMinute Int?                @map("selected_start_minute")
  anchorMessageId     Int?                @map("anchor_message_id")
  startsAt            DateTime?           @map("starts_at")    @db.Timestamptz(3)
  endsAt              DateTime?           @map("ends_at")      @db.Timestamptz(3)
  confirmedAt         DateTime?           @map("confirmed_at") @db.Timestamptz(3)
  lastActivityAt      DateTime            @map("last_activity_at") @db.Timestamptz(3)
  lastStatusPostedAt  DateTime?           @map("last_status_posted_at") @db.Timestamptz(3)
  revision            Int                 @default(1)
  createdAt           DateTime            @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt           DateTime            @updatedAt      @map("updated_at") @db.Timestamptz(3)
  participants        PlanningParticipant[]

  @@unique([chatId, activeWeekStart])
  @@index([chatId, status, targetWeekStart])
  @@index([chatId, startsAt])
  @@map("planning_rounds")
}

model PlanningParticipant {
  id             String        @id @default(cuid())
  roundId        String        @map("round_id")
  telegramUserId BigInt        @map("telegram_user_id")
  membershipId   String        @map("membership_id")
  round          PlanningRound @relation(fields: [roundId], references: [id], onDelete: Cascade)

  @@unique([roundId, telegramUserId])
  @@map("planning_participants")
}
```

The PostgreSQL guarantee, verbatim: *"By default, null values in a unique column are not considered equal, allowing multiple nulls in the column. The `NULLS NOT DISTINCT` option modifies this and causes the index to treat nulls as equal."* [CITED: postgresql.org/docs/18/indexes-unique.html] — the default is exactly what this pattern needs; do **not** add `NULLS NOT DISTINCT`.

Also add `PLANNING` to `CallbackActionKind` (`prisma/schema.prisma:20-24`), following the `START_SETUP` / `SETTINGS_EDIT` / `ROSTER_REMOVE` convention.

### Pattern 4: Target-week selection (PLAN-03) with one Phase-4 extension point

```typescript
// Civil-only; no Intl inside. Inject `nowCivil` from zonedClock.civilNow(tz, now()).
export function targetWeekStart(
  nowCivil: CivilDate,
  weekIsClaimed: (weekStart: string) => boolean,
): string {
  const currentMonday = isoDate(mondayOf(nowCivil));
  return weekIsClaimed(currentMonday) ? isoDate(addDays(mondayOf(nowCivil), 7)) : currentMonday;
}
```

`weekIsClaimed(chatId, weekStart)` is the ONLY place Phase 4 has to change. In Phase 2 it is: *a `CONFIRMED` `PlanningRound` exists for this chat with `targetWeekStart === weekStart`.* Phase 4 extends it with booked/cancelled state (LIFE-02, LIFE-06).

**Critical:** a `DRAFT` round must **not** claim its week. Otherwise resuming a round mid-week would recompute a *different* target week and orphan the card. Therefore `/plan` **resumes** an existing `DRAFT` round for the chat rather than computing a new week.

### Pattern 5: Per-kind authority at the callback boundary (the Phase 1 integration fix)

**What:** Extend `CallbackRoute` with an explicit authority declaration so a non-admin planning author can act, while every Phase 1 kind keeps its exact current behavior.
**When to use:** This is the single required change to `src/telegram/callbacks.ts`.

```typescript
export type CallbackAuthority =
  /** Phase 1 behaviour, unchanged: current chat administrator, checked before parse. */
  | "current-admin"
  /** The route resolves authority from durable state (round author, or admin takeover). */
  | "route-resolved";

export type CallbackRoute = Readonly<{
  staleText: string;
  authority: CallbackAuthority;      // NEW — every existing route declares "current-admin"
  actorBinding: "strict" | "route-resolved"; // NEW — see below
  dispatch: CallbackDispatcher;
}>;
```

Boundary order, with the Phase 1 security invariant preserved:

1. Install the single-shot `answerCallbackQuery` guard (unchanged).
2. Resolve `ActionContext` (unchanged).
3. **Fresh `getCurrentRole` lookup — still before the token parse and before any durable read.** Do not throw here; capture the role. An unavailable lookup still denies fail-closed.
4. **Fast path:** if the role is `creator`/`administrator`, continue exactly as today.
5. If the role is *not* administrator, parse the token and load the action row, then:
   - if the row's `kind` declares `authority: "current-admin"` → emit the identical `CALLBACK_DENIAL` alert. Observable behavior is unchanged for every Phase 1 kind.
   - if it declares `"route-resolved"` → hand to the dispatcher, which resolves ownership from `PlanningRound.authorUserId` and emits the D-02 alert naming the owner.
   - if the token is unparseable or the row is unknown → emit `CALLBACK_DENIAL`, matching today's behavior for a non-admin.
6. `actorBinding`: today the boundary treats `action.actorUserId !== context.actorId` as *stale*. Planning needs a **different** message (D-02: "name who owns the round"), so planning routes declare `"route-resolved"`; the boundary then still enforces `action.chatId === context.chatId` **and** `expiresAt > now` and defers only the actor comparison to the dispatcher.

**Why not a second `registerCallbackBoundary`:** the Phase 1 registration passes `{ exhaustive: true }`, and its `unresolved()` helper calls `next()` **only** when `!options.exhaustive` (`src/telegram/callbacks.ts`, `unresolved`). A second `bot.on("callback_query:data", …)` registration would therefore never run.

**Pin with tests.** Threat `T-01-16-01` states the invariant this change must not break: *"The fix moves only the acknowledgement; `requireCurrentAdministrator` still runs before parse, durable read and dispatch."* [VERIFIED: .planning/phases/01-chat-readiness/01-SECURITY.md, threat register]. Phase 2's change makes the *role lookup* still run first but moves the *denial decision* after the kind is known for non-admins only. That difference must be explicitly reasoned about in `02-SECURITY.md` and asserted by a regression test that a non-admin tapping every Phase 1 token still receives `CALLBACK_DENIAL`.

### Pattern 6: Route table with an explicit authority column

`CHAT_READINESS_ROUTES` already distinguishes *when* a route is protected (`protectedWhen: "always" | "in-flight"`) — the distinction whose absence caused finding F-7. Phase 2 introduces a second dimension: *who*. Add a parallel `PLANNING_ROUTES` table with an `authority` field and export a combined `ALL_ROUTES` for the bounded route-id resolver, so the "one registration point, one bounded vocabulary" invariant survives.

| Route id | Kind | `protectedWhen` | Authority |
|----------|------|-----------------|-----------|
| `command:plan` | command | `always` | `planning-access-policy` (`canStartPlanning`) |
| `command:plan_status` | command | `always` | `chat-member` (fail-closed on an unavailable lookup) |
| `callback:PLANNING` | callback | `always` | `route-resolved` (round author, or admin after the inactivity threshold) |

No new `message:text` or `message:location` route is needed: every Phase 2 step is button-driven. That deliberately avoids deferred item **N-6** (in-place card replacement on text-input steps is not implemented).

### Pattern 7: In-place card replacement and re-anchoring

```typescript
// Advancing a step (D-01): edit the anchor in place. Established in Phase 1.
await ctx.api.editMessageText(
  context.chatId.toString(),
  round.anchorMessageId,
  rendered.text,
  { parse_mode: "HTML", reply_markup: keyboard },
);

// Status request (D-14): post a NEW message, make it the anchor, and stop the old
// one being live by clearing its keyboard. Persist the new id in the SAME
// transaction that records lastStatusPostedAt.
const posted = await ctx.reply(rendered.text, { parse_mode: "HTML", reply_markup: keyboard });
await planning.reanchor(round.id, posted.message_id, round.revision, now);
```

Signature confirmed against the existing code: `ctx.api.editMessageText(chatIdString, messageId, text, options)` (`src/telegram/settings-handlers.ts:452-478`). grammY maps `chat_id`/`message_id` to positional arguments. [CITED: grammy.dev/guide/api]

Clearing the superseded card's keyboard is the mechanism threat `T-01-19-01` relies on: in-place editing removes the superseded keyboard so orphaned tokens are no longer reachable from any on-screen surface.

### Pattern 8: Abandonment and takeover (AUTH-03, D-12/D-13) with no scheduler

```typescript
export const PLANNING_INACTIVITY_MS = 30 * 60 * 1000; // mirrors DRAFT_LIFETIME_MS

export function isTakeoverEligible(round: { lastActivityAt: Date }, now: Date) {
  return now.getTime() - round.lastActivityAt.getTime() >= PLANNING_INACTIVITY_MS;
}
```

- Every author action writes `lastActivityAt = now` inside its `expectedRevision`-guarded transaction. An author who returns after the threshold simply resets it.
- The `Take over` button is **rendered only** when `isTakeoverEligible()` is true **and** the viewer is an administrator. Rendering is not authority: the takeover transaction re-checks both the inactivity condition and the fresh administrator role, so a button that went stale in the seconds between render and tap cannot seize an active round.
- A `DRAFT` round is **never deleted**. Unlike `SetupDraft` (which `requireActive` deletes on expiry), the round holds selections that D-13 requires takeover to keep.
- **Stale-week reaping without a job:** at read time, a `DRAFT` round whose `targetWeekStart` is strictly before the current chat-local Monday is transitioned to `SUPERSEDED` (which nulls `activeWeekStart`), so last week's ghost can never block this week's planning. This is the "mechanism that expires or reaps stale rounds" the CONTEXT left to discretion — no `pg-boss`, no cron.

### Pattern 9: Confirm (D-04, D-09, D-10, D-11) as one transaction

```typescript
await prisma.$transaction(async (tx) => {
  // 1. fresh role/policy authority was already established at the boundary
  // 2. consume the callback action exactly once (Phase 1 pattern)
  const consumed = await tx.callbackAction.updateMany({
    where: { token, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now },
  });
  if (consumed.count !== 1) return { kind: "duplicate" };   // → "Already applied."
  // 3. D-10: refuse an empty active roster
  const members = await tx.chatMembership.findMany({
    where: { chatId, activeAt: { not: null }, deactivatedAt: null },
  });
  if (members.length === 0) return { kind: "empty-roster" };
  // 4. promote with an expected-revision guard
  const promoted = await tx.planningRound.updateMany({
    where: { id: roundId, revision: expectedRevision, status: "DRAFT" },
    data: { status: "CONFIRMED", activeWeekStart: null, confirmedAt: now,
            startsAt, endsAt, revision: { increment: 1 } },
  });
  if (promoted.count !== 1) return { kind: "stale" };
  // 5. D-11: the snapshot Phase 3 and PREVIOUS_PARTICIPANTS read
  await tx.planningParticipant.createMany({
    data: members.map((m) => ({ roundId, telegramUserId: m.telegramUserId, membershipId: m.id })),
  });
  return { kind: "confirmed" };
});
```

Note `activeWeekStart: null` on promotion — that is what releases the unique slot and is the whole point of Pattern 3.

### Pattern 10: Minting the step's callback actions

Each render of the day step mints ~9 actions (7 days + Back/Cancel where applicable); the time step ~12. Mint them with a single `createMany` inside the same transaction that writes the step transition, all bound to `(chatId, actorUserId = author, roundId, expiresAt)` and carrying a `targetId` JSON payload validated by a Zod discriminated union, exactly as `parseRosterRemovalTarget` does.

```typescript
const planningTargetSchema = z.union([
  z.object({ action: z.literal("day"),  roundId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  z.object({ action: z.literal("time"), roundId: z.string().min(1), startMinute: z.number().int().min(0).max(1439) }).strict(),
  z.object({ action: z.enum(["back", "confirm", "cancel", "takeover", "refuse-past"]), roundId: z.string().min(1) }).strict(),
]);
```

The wire token stays `v1:<uuid>` (39 bytes) — well inside Telegram's *"Data to be sent back to the bot when the button is pressed, 1-64 bytes."*

Include a `step` and `revision` in the round row (not the token) so a tap arriving from a superseded render is refused as stale rather than applied to the wrong step.

### Anti-Patterns to Avoid

- **Encoding the date, weekday, minute, or round id in `callback_data`.** `.claude/CLAUDE.md` and threat `T-01-05` forbid it: authority comes only from the server-side `CallbackAction` row. The date belongs in `targetId` on that row, not on the wire.
- **Reusing `AuthorizationService.requireCurrentAdministrator` for planning authorization.** On denial it executes `setupDraft.deleteMany` and `settingsEditDraft.deleteMany` for the actor (`src/domain/auth/authorization-service.ts`). A band member tapping a planning button would silently destroy an unrelated administrator draft. Add a *non-destructive* role accessor instead.
- **Hiding past days or unavailable slots.** D-05/D-07 require them rendered, marked, and refused. A card whose shape changes with the day of the week is exactly what the CONTEXT's "Specific Ideas" rejects.
- **A second `registerCallbackBoundary`.** Unreachable behind `exhaustive: true` (Pattern 5).
- **A background reaper / `pg-boss` in Phase 2.** Nothing in this phase needs one (Pattern 8).
- **Word suffixes on button labels** ("Mon (default)"). Rejected by D-08 on the strength of Phase 1 finding F-9.
- **Storing the target week as a `timestamptz`.** It is a civil label, not an instant; a `timestamptz` invites an off-by-one across the zone boundary.
- **`grammy` `session`/`conversations` for the wizard.** Fails RELI-01 and is rejected in `.claude/CLAUDE.md`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| IANA offset / DST rules | An offset table, a `getTimezoneOffset()` hack, or hard-coded EU/US transition dates | `Intl.DateTimeFormat(...).formatToParts` (Pattern 1) | Zone rules change; only the ICU/tz database is authoritative. |
| Rehearsal-fits-in-window rule | A second copy of `start >= dailyStart && start + duration <= dailyEnd` | The predicate already in `src/domain/chat/schedule-validator.ts` (see verbatim quote) | The floor half of this rule was *missing* until Phase 1 plan 01-18 repaired it (finding F-5/F-6). A second copy will re-introduce the same bug. |
| `HH:MM` parse/format | New regex/formatting code | `parseLocalTime` / `formatLocalTime` (same file) | Strict 24-hour contract already enforced and tested. |
| One-active-round enforcement | An application-level "check then insert" | A database unique constraint (Pattern 3) | `sequentialize` is UX ordering only; the database is the correctness boundary (`01-PATTERNS.md`). |
| Callback token minting/parsing | New id scheme or JSON on the wire | `createCallbackToken()` + a per-surface Zod target schema (`src/shared/callback-schema.ts`) | The 64-byte limit and the "no authority on the wire" rule are both already solved. |
| Member display labels and ordering | New name formatting or sorting | `memberLabel` / `sortRosterMembers` (`src/telegram/roster-renderers.ts`) | Includes HTML escaping and the `Telegram user ••••NNNN` fallback that threat `T-01-21` requires. |
| HTML escaping in card text | `String.replace` chains at each call site | Export and reuse the existing `escapeHtml` (currently module-private at `src/telegram/roster-renderers.ts:14-19`) | One escaper, one place to get wrong. Exporting it is a one-line change; duplicating it is a latent XSS-in-Telegram-markup bug. |
| Abandonment scheduling | A `setInterval` reaper or an early `pg-boss` install | Lazy evaluation on `lastActivityAt` (Pattern 8) | In-process timers do not survive restarts and cannot coordinate replicas — the exact reason `.claude/CLAUDE.md` rejects `node-cron`/`setTimeout`. |
| Duplicate-tap protection | A new idempotency mechanism | `CallbackAction.consumedAt` + `updateMany ... where consumedAt: null` returning `Already applied.` | Proven in `RosterService.removeConfirmed`. |
| Callback acknowledgement | A new `answerCallbackQuery` call at the top of the handler | The boundary's single-shot guard, answering from the branch that owns the outcome | Telegram honours only the FIRST answer per `callback_query.id`; acknowledging up front made every alert unreachable (finding F-3, closed by plan 01-16). |

**Key insight:** almost every "new" mechanism this phase appears to need already exists in the Phase 1 code, hardened by a documented defect. The expensive mistake in Phase 2 is *re-deriving* one of them and re-introducing the defect it was hardened against — F-5/F-6 (missing window floor), F-3 (unreachable alerts), and F-9 (truncated labels) are all one copy-paste away.

---

## Common Pitfalls

### Pitfall 1: The callback boundary hard-denies every non-administrator
**What goes wrong:** With `AUTH-01` set to `PREVIOUS_PARTICIPANTS` or `ANYONE_IN_CHAT`, a non-admin author starts planning via `/plan` (allowed by `canStartPlanning`) and then cannot press a single button on the card they own.
**Why it happens:** `registerCallbackBoundary` calls `deps.authorization.requireCurrentAdministrator(...)` unconditionally for every `callback_query:data` update, before the token is even parsed. The route table only chooses the *dispatcher*, never the *authority*.
**How to avoid:** Pattern 5. Preserve the fast admin path and the pre-parse role lookup; move only the *denial decision* for non-admins to after the kind is known.
**Warning signs:** A UAT step where a non-admin author taps a day button and receives `Only current chat administrators can do that.` This will not appear in any unit test that stubs the membership gateway to `administrator` — Phase 1's fake defaults to a two-valued role function (`tests/fakes/chat-readiness.ts`), so the non-admin case must be written deliberately.

### Pitfall 2: Planning authorization destroys unrelated setup/settings drafts
**What goes wrong:** A band member taps a planning button; an administrator's in-progress `/setup` wizard silently vanishes.
**Why it happens:** `requireCurrentAdministrator` deletes the actor's `setupDraft` and `settingsEditDraft` rows on denial. That side effect is correct for admin-only surfaces (threat `T-01-08`) and wrong everywhere else.
**How to avoid:** Introduce a non-destructive `currentRole(chatId, actorId)` accessor on `AuthorizationService` that returns the role (fail-closed to `"unknown"` on an unavailable lookup, with the same `err`-bound error log) and leave `requireCurrentAdministrator` untouched for Phase 1 routes.
**Warning signs:** Any planning code path that imports `PermissionDeniedError`.

### Pitfall 3: `Bad Request: message is not modified`
**What goes wrong:** `editMessageText` with byte-identical text *and* markup returns HTTP 400 and the handler throws, so the user sees a spinner and no card change.
**Why it happens:** Telegram rejects a no-op edit. This is reachable in Phase 2 in three ordinary ways: double-tapping the same day, `Back` returning to a step that renders identically, and a re-render after a duplicate callback.
**How to avoid:** Compare the newly rendered `{ text, reply_markup }` against the last-rendered projection before calling `editMessageText`; when identical, skip the edit and answer the callback with the appropriate alert. Additionally catch grammY's `GrammyError` with `description` containing `message is not modified` and treat it as success — the durable transition already committed. Bind the caught error under the `err` key or it is unloggable (Phase 1 accumulated decision).
**Warning signs:** `bot.catch` firing on a happy-path double tap.

### Pitfall 4: Weekday encoding rotation bug
**What goes wrong:** The default-day marker lands on the wrong button — off by one, or Sunday/Monday swapped.
**Why it happens:** Three different encodings are in play. `ChatConfiguration.defaultWeekday` is `Int` **1..7 with MON=1** (derived from `WEEKDAYS.indexOf(weekday) + 1`, validated by `isWeekday` as `value >= 1 && value <= 7`); `WEEKDAYS`/`WEEKDAY_LABELS` are 0-indexed arrays; and JavaScript's `Date.prototype.getUTCDay()` is **0..6 with SUN=0**.
**How to avoid:** Define one `IsoWeekday = 1|2|3|4|5|6|7` type in `civil.ts` with a single `isoWeekdayOf(civilDate)` (`const wd = new Date(Date.UTC(y, m-1, d)).getUTCDay(); return wd === 0 ? 7 : wd;`) and convert at exactly one boundary. Add a unit test asserting `isoWeekdayOf` for all seven days of a known week.
**Warning signs:** Any expression containing `- 1` or `+ 1` next to a weekday outside `civil.ts`.

### Pitfall 5: Button-label truncation returns (finding F-9)
**What goes wrong:** `⭐ Mon 31` renders as `⭐ Mon…` in a 4-button row on a narrow client.
**Why it happens:** Telegram sizes buttons by row width. Phase 1 hit this with `Previous participants` and fixed it by declaring one button per row (`SETUP_POLICY_BUTTONS`). D-08's emoji prefix adds width to every day and slot label.
**How to avoid:** Pin the exact row split in `02-UI-SPEC.md`, keep labels ≤ 24 visible characters (Phase 1 UI-SPEC rule), and assert the **serialized keyboard shape** in a unit test — the Phase 1 precedent is `tests/unit/schedule-settings.test.ts`, which asserts `SETUP_WEEKDAY_BUTTONS`' shape. A 4/3 day split and a 3/3/3/1 slot split are the starting proposal; the live run is the arbiter.
**Warning signs:** Any keyboard built by `.map()` over a full array with no explicit `.row()` boundary.

### Pitfall 6: A `DRAFT` round shifts its own target week
**What goes wrong:** An author starts planning on Sunday for the current week, is interrupted, resumes on Monday, and the card silently now targets a different week — or the unique constraint fires on resume.
**Why it happens:** Recomputing `targetWeek()` on every `/plan` instead of resuming the existing round.
**How to avoid:** `/plan` first looks for a `DRAFT` round for the chat. If one exists, resume and re-anchor it (D-14 behavior); only compute a target week when creating a new round. Never let a `DRAFT` round count as "claiming" its week in `weekIsClaimed()`.
**Warning signs:** `targetWeekStart` being written by anything other than the create path.

### Pitfall 7: Prisma `@db.Date` / `BigInt` boundary surprises
**What goes wrong:** `selectedDate` comes back as a `Date` at UTC midnight and renders as the previous day for a negative-offset chat; or a `chatId` is compared as `number` and silently mismatches.
**Why it happens:** Prisma maps `@db.Date` to a JS `Date`, and JS `Date` is an instant.
**How to avoid:** Store civil dates as `String` `"YYYY-MM-DD"` (they sort lexicographically = chronologically, so range queries still work) — this is why Pattern 3 uses `String` and not `@db.Date`. Keep `BigInt` at the repository boundary for `chatId`/`telegramUserId` per `.claude/CLAUDE.md`; `anchorMessageId` is a per-chat `Integer` in the Bot API and maps to Prisma `Int`.
**Warning signs:** Any `new Date("YYYY-MM-DD")` in domain code.

### Pitfall 8: Status re-post as a spam vector
**What goes wrong:** D-15 lets anyone request status; a member (or a malfunctioning client) repeats it and the bot floods the chat with re-anchored cards, also invalidating everyone else's live card each time.
**Why it happens:** No rate limit on an unauthenticated-by-role, side-effecting command.
**How to avoid:** Persist `lastStatusPostedAt` on the round and refuse a re-post inside a short cooldown with a concise group reply (or a silent no-op). Log the refusal with a bounded `outcome`/`reason` so it is never a silent branch (finding F-4).
**Warning signs:** `/plan_status` having no durable write at all.

### Pitfall 9: New log fields are silently redacted
**What goes wrong:** Planning log lines emit `[redacted]` for the fields an operator needs.
**Why it happens:** `SafeLogger` is an **allow list**, not a deny list.
**How to avoid:** `roundId` and `jobId` are already allow-listed — use them. `weekday`, `minute`, `date`, `weekStart`, and `timezone` are **not**, and adding any of them is a deliberate security decision that must be reasoned about in `02-SECURITY.md` (threat `T-01-21-03` kept `timezone` off the list because it is a location proxy). Prefer bounded classifications (`step`, `outcome`, `reason`) over values.
**Warning signs:** A log call with a key not in the allow list, or an object under an allow-listed key (an allow-listed key holding an object is redacted, not walked — threat `T-01-21-02`).

### Pitfall 10: `Intl.DateTimeFormat` construction cost in a hot path
**What goes wrong:** Slot generation constructs a formatter per slot per render.
**Why it happens:** `new Intl.DateTimeFormat(...)` is comparatively expensive.
**How to avoid:** Memoize one formatter per IANA zone in a module-level `Map`. At this project's scale it is not a correctness issue, but the memo is three lines.

---

## Runtime State Inventory

> Phase 2 is additive greenfield work inside an existing application — no rename, refactor, or migration of existing identifiers. The categories are answered explicitly rather than omitted, because the phase *does* introduce new durable state that a later phase will inherit.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None to migrate. New tables only (`planning_rounds`, `planning_participants`) and one new `CallbackActionKind` enum member. No existing row's meaning changes. | Forward-only Prisma migration; no data backfill. |
| Live service config | None — verified: the only external service is the Telegram Bot API, and this phase adds no webhook, no BotFather command-list dependency beyond optionally registering `/plan` and `/plan_status` in BotFather's command menu (cosmetic; the bot matches commands itself via `bot.command`). | Optional: update the BotFather command list during the live run. |
| OS-registered state | None — verified: `docker-compose.yml` declares two services (`postgres`, `bot`); there is no cron entry, systemd unit, or Task Scheduler registration in the repo. | None. |
| Secrets/env vars | None added. `src/app/config.ts` is unchanged; the inactivity threshold is a module constant, not an env var (matching `DRAFT_LIFETIME_MS`). | None. |
| Build artifacts | `src/generated/prisma/**` is regenerated by `prisma generate` after the schema change and **is committed to the repo** (models for `CallbackAction`, `ChatConfiguration`, … are tracked files). New model files will appear there. | Run `npm run db:generate` and commit the regenerated client as part of the schema task. |

---

## Code Examples

### Generating the hourly slot list (CONF-04 / D-06)

```typescript
// Source: derived from src/domain/chat/schedule-validator.ts (this repo).
// Reuses the SAME containment rule; does not restate it.
export type Slot = Readonly<{ startMinute: MinuteOfDay; label: string }>;

export function generateSlots(config: {
  dailyStartMinute: number; dailyEndMinute: number; durationMinutes: number;
}): readonly Slot[] {
  const slots: Slot[] = [];
  for (let m = config.dailyStartMinute; m + config.durationMinutes <= config.dailyEndMinute; m += 60) {
    slots.push({ startMinute: m, label: formatLocalTime(m) });
  }
  return slots;
}
// Defaults 10:00–21:00 with a 2h rehearsal (dailyStart 600, dailyEnd 1260,
// duration 120) yield exactly 10:00 … 19:00 — the D-06 expectation.
```

Note the loop starts *at* `dailyStartMinute`, matching the repaired floor rule (`values.defaultStartMinute < values.dailyStartMinute` → invalid; "Starting exactly at the floor is inside the window, hence `<`").

### Deciding "is this slot in the past" (D-07)

```typescript
export function slotAvailability(
  tz: string, date: CivilDate, startMinute: number, now: Date,
): "available" | "past" | "nonexistent" {
  const r = resolveWallClock(tz, date.year, date.month, date.day, startMinute);
  if (r.kind === "skipped") return "nonexistent";   // DST policy rule 2
  return r.instantMs <= now.getTime() ? "past" : "available";
}
```

Comparing **instants** (not civil minutes) is what makes the rule correct on a transition day.

### Non-destructive role accessor (Pitfall 2)

```typescript
// Add to AuthorizationService. Does NOT delete drafts; fails closed.
async currentRole(chatId: bigint, actorId: bigint): Promise<CurrentTelegramRole> {
  try {
    return await this.membershipGateway.getCurrentRole(chatId, actorId);
  } catch (error) {
    this.logFailure(AUTHORIZATION_CATCH_SITES.membershipLookup, chatId, actorId, error);
    return "unknown"; // canStartPlanning() denies "unknown" — fail closed
  }
}
```

`canStartPlanning` already denies `"unknown"`: `isCurrentMember` accepts only `creator | administrator | member | restricted`, and the `default:` branch of the policy switch returns `false`.

### Card copy skeleton (D-08 legend)

```
<b>Plan a rehearsal — week of Mon 24 Aug</b>
Choose a day.

⭐ configured default   ·   🔁 last rehearsal   ·   🚫 unavailable

[⭐ Mon 24] [ Tue 25 ] [🔁 Wed 26] [ Thu 27 ]
[ Fri 28 ] [ Sat 29 ] [ Sun 30 ]
```

Marker glyphs, exact labels, and the row split are Claude's discretion (CONTEXT) and belong in `02-UI-SPEC.md`; the *structure* — legend above the keyboard, leading marker on the label, default wins over previous when they coincide — is locked by D-08.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `moment-timezone` for IANA arithmetic | `Intl.DateTimeFormat` + `formatToParts`, or Temporal | `Intl` timeZone support universal since ~2019; Temporal unflagged in Node 26 | No new dependency is needed on Node 24; the eventual Temporal migration is a straight replacement of `zoned-clock.ts`. |
| Temporal behind `--harmony-temporal` | Temporal enabled by default | Node.js 26, May 2026 | **Not usable here.** This project pins `>=24.19 <25`; verified locally that `typeof Temporal === "undefined"` on v24.18.0. Revisit at the Node 26 LTS migration (Oct 2026 per release schedule). |
| Hand-written `CREATE UNIQUE INDEX … WHERE` in a `--create-only` migration | `where:` on `@unique`/`@@unique`/`@@index` in Prisma Schema Language | Recent Prisma, behind the `partialIndexes` **preview** flag | Still preview; the nullable-active-key pattern avoids the flag and the reported `migrate dev` drop/recreate churn. |

**Deprecated/outdated:**
- `moment`/`moment-timezone`: legacy-maintained; do not introduce.
- Acknowledging a callback bare and up front: superseded by the Phase 1 decision recorded in `PROJECT.md` Key Decisions — the single honoured answer must carry the outcome.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Previous rehearsal" in Phase 2 = the most recent `CONFIRMED` `PlanningRound` for the chat with `startsAt < now`, ordered by `startsAt` desc. No booked-rehearsal record exists until LIFE-05 (Phase 4). | Pattern 4 / PLAN-05 / PLAN-07 | The wrong record drives both highlight markers and `wasPreviousParticipant` for the `PREVIOUS_PARTICIPANTS` policy — i.e. the wrong people can start planning. **Needs owner confirmation.** |
| A2 | The abandonment threshold is 30 minutes, matching `DRAFT_LIFETIME_MS`. | Pattern 8 / AUTH-03 | Too short lets an admin seize a round from an author who stepped out for coffee; too long makes AUTH-03 unusable. CONTEXT grants discretion but the number should be stated aloud. |
| A3 | An ambiguous (fall-back) wall clock resolves to the **earlier** occurrence. | DST policy rule 3 | A one-hour error on one rehearsal every few years. Matches the Temporal `"compatible"` default. |
| A4 | A skipped (spring-forward) wall clock is rendered-and-refused, not silently shifted. | DST policy rule 2 | Alternative (shift forward to the next real instant) would show one time and mean another. |
| A5 | Duration is exact elapsed time (`startsAt + durationMinutes`), so a rehearsal spanning a fall-back is 2 real hours. | DST policy rule 4 | The alternative (preserve wall-clock end) yields a 3-real-hour booking. Affects Phase 3/4 booking copy. |
| A6 | Command names `/plan` and `/plan_status`. | Pattern 6 | Cosmetic; CONTEXT grants discretion. Belongs in `02-UI-SPEC.md`. |
| A7 | A status-re-post cooldown exists and is short (order of 30–60 s). | Pitfall 8 | Without it, D-15 is an unrated flood vector. The exact value is discretion. |
| A8 | Marker glyphs `⭐` (default), `🔁` (previous), `🚫` (past/unavailable). | Code Examples | Cosmetic; CONTEXT grants discretion. |
| A9 | `targetWeekStart` / `selectedDate` are stored as `String` `"YYYY-MM-DD"` rather than `@db.Date`. | Pattern 3 / Pitfall 7 | Both work; the string avoids the `Date`-at-UTC-midnight class of bug and keeps lexicographic ordering. |
| A10 | The Phase 4 `weekIsClaimed()` extension (booked/cancelled rehearsals) is out of Phase 2 scope; Phase 2 counts only `CONFIRMED` rounds. | Pattern 4 / PLAN-03 | If the owner expects a manually-booked rehearsal to affect week selection *in Phase 2*, LIFE-02 would have to move forward. |

---

## Open Questions

1. **What record is "the previous rehearsal" for PLAN-05/PLAN-07 in a phase where LIFE-05 does not yet exist?**
   - What we know: LIFE-05 ("after a booked rehearsal's scheduled end, it becomes the previous rehearsal used for future day, time, and participant defaults") is mapped to Phase 4. Phase 2's only durable rehearsal-shaped record is a `CONFIRMED` `PlanningRound`.
   - What's unclear: whether a *confirmed but never booked* proposal should drive the highlight, or whether Phase 2 should simply show no previous-rehearsal marker until Phase 4 lands.
   - Recommendation: adopt A1 (most recent `CONFIRMED` round with `startsAt < now`) and make `previousRehearsal()` a single named function, so Phase 4 narrows it to "booked" in one place. Surface this to the owner during plan review.

2. **Does the Requirements Ripple get reconciled before planning, or as the first task of the plan?**
   - What we know: CONTEXT states it "MUST be reconciled before or during planning" and names four documents (`REQUIREMENTS.md` PLAN-08/PLAN-09, `ROADMAP.md` criterion 5, `PROJECT.md`).
   - Recommendation: make it Task 1 of Plan 02-01, as a docs-only commit, so no downstream artifact is written against superseded text. PLAN-09 should be marked *removed from v1 scope by D-09* rather than deleted, preserving traceability; PLAN-08 should be rewritten to the roster-snapshot model.

3. **How much of the Phase 1 callback boundary may Phase 2 modify?**
   - What we know: `T-01-16-01` pins the ordering invariant; `PROJECT.md` Key Decisions records the acknowledgement contract.
   - What's unclear: whether the owner treats the boundary as frozen.
   - Recommendation: Pattern 5's shape (fast admin path + per-kind authority) preserves every observable Phase 1 behavior. The plan should include an explicit regression task with a test matrix over `{admin, non-admin} × {START_SETUP, SETTINGS_EDIT, ROSTER_REMOVE, PLANNING, garbage token}`.

4. **Should `/plan` be reachable in an unconfigured chat?**
   - Recommendation: no — `ChatConfiguration` supplies `timezone`, `durationMinutes`, and the daily window, none of which have a safe default at planning time. Reply with a concise group message pointing at `/setup`, mirroring the Phase 1 unconfigured-readiness copy. Add a Copywriting Contract row for it in `02-UI-SPEC.md`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ (with a caveat) | local `v24.18.0`; `package.json` engines require `>=24.19 <25`; CI pins `24.19.0` | npm does not enforce `engines` without `engine-strict`, and no `.npmrc` exists, so local work proceeds. Prefer running the suite in the container, or upgrade the local Node to 24.19.x. |
| Docker Engine | Testcontainers integration suite, Compose runtime | ✓ | 29.7.2, daemon reachable | — |
| PostgreSQL 18 | Migrations, integration tests | ✓ via Docker | `postgres:18.4` (Testcontainers), `postgres:18.4-bookworm` (Compose) | — |
| `psql` CLI | none | ✗ | — | Not needed; `tests/helpers/postgres.ts` drives `prisma migrate deploy` + `migrate status` against a Testcontainer. |
| npm registry | Version checks only (no installs) | ✓ | — | — |
| Full-ICU `Intl` | The entire DST policy | ✓ | Built into Node 24 (verified locally: `Intl.DateTimeFormat` with `timeZone: "Europe/Kyiv"` resolves) | If ever built with `small-icu`, the phase would need a tz library — check on any base-image change. |
| Telegram Bot API | Live verification only | n/a in CI | — | Automated tests use grammY with `botInfo` injected and no network (Phase 1 precedent). |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** local Node is one patch line below the declared floor — run the suite in Docker or upgrade before the live run.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11, two projects (`unit`, `integration`) |
| Config file | `vitest.config.ts` — `unit` = `tests/unit/**/*.test.ts`; `integration` = `tests/integration/**/*.test.ts` with `fileParallelism: false`, `maxWorkers: 1`, 60 s timeouts |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run format:check && npm run build && npm run test:unit && npx vitest run --project integration` |

Deterministic seams already available: `createClock(initial)` (injectable `now`), `createMembershipGateway(roleFor)`, `createTimezoneResolver(tz)`, `transactionFailurePrisma()` in `tests/fakes/chat-readiness.ts`; `startPostgresTestContainer()` + `applyCommittedMigrations()` in `tests/helpers/postgres.ts`.

> **`createMembershipGateway` gap:** its `roleFor` return type is `"administrator" | "member"`. Phase 2 needs `creator`, `restricted`, `left`, `kicked`, and `unknown` to exercise `canStartPlanning` and the fail-closed path. Widening it to `CurrentTelegramRole` is a Wave 0 item.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-04 | Slots are hourly and never exceed the daily boundary; defaults yield 10:00…19:00 | unit | `npx vitest run --project unit tests/unit/slot-generation.test.ts` | ❌ Wave 0 |
| PLAN-03 | Current week when unclaimed; next week when a confirmed rehearsal exists in it | unit | `npx vitest run --project unit tests/unit/target-week.test.ts` | ❌ Wave 0 |
| PLAN-04, PLAN-05 | All 7 days rendered; default and previous markers; default wins on a tie; past days marked | unit | `npx vitest run --project unit tests/unit/planning-day-card.test.ts` | ❌ Wave 0 |
| PLAN-06, PLAN-07 | Valid slot selection; default/previous markers; past hours on today disabled | unit | `npx vitest run --project unit tests/unit/planning-time-card.test.ts` | ❌ Wave 0 |
| CONF-04 (DST) | Skipped hour → `nonexistent`; ambiguous hour → earlier instant; 30-minute zone; 10:00–19:00 unaffected on a transition day | unit | `npx vitest run --project unit tests/unit/zoned-clock.test.ts` | ❌ Wave 0 |
| PLAN-01 | `/plan` allowed/denied across every `CurrentTelegramRole` × every `PlanningAccessPolicy` | unit | `npx vitest run --project unit tests/unit/planning-start-authorization.test.ts` | ❌ Wave 0 |
| PLAN-01 (regression) | Non-admin tapping each Phase 1 kind still receives `CALLBACK_DENIAL`; non-admin author tapping `PLANNING` is dispatched | unit | `npx vitest run --project unit tests/unit/callback-authority.test.ts` | ❌ Wave 0 |
| PLAN-02 | Second concurrent start for the same chat+week is refused; a confirmed round releases the week | integration | `npx vitest run --project integration tests/integration/planning-round.test.ts` | ❌ Wave 0 |
| AUTH-03 | Takeover refused before the threshold; allowed after, by an admin only; selections preserved; `expectedRevision` guarded | integration | `npx vitest run --project integration tests/integration/planning-takeover.test.ts` | ❌ Wave 0 |
| PLAN-10, RELI-01 | Status re-posts and re-anchors; a fresh composition root resumes the exact step and selections; cooldown refuses a rapid repeat | integration | `npx vitest run --project integration tests/integration/planning-recovery.test.ts` | ❌ Wave 0 |
| D-04, D-10, D-11 | Confirm snapshots the active roster; empty roster refused; duplicate confirm returns `Already applied.` | integration | `npx vitest run --project integration tests/integration/planning-confirm.test.ts` | ❌ Wave 0 |
| D-02 | A non-author tap is refused with the owner-naming alert and mutates nothing | unit | `npx vitest run --project unit tests/unit/planning-ownership.test.ts` | ❌ Wave 0 |
| D-08 (F-9 guard) | Serialized keyboard row shape for the day and time cards | unit | `npx vitest run --project unit tests/unit/planning-keyboards.test.ts` | ❌ Wave 0 |
| Observability | Every planning branch emits a distinct `event`/`outcome`/`reason`; no date, minute, or timezone value survives redaction | unit | `npx vitest run --project unit tests/unit/planning-logging.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:unit`
- **Per wave merge:** `npm run format:check && npm run build && npm run test:unit && npx vitest run --project integration`
- **Phase gate:** full suite green, then `/gsd-verify-work` with a live Telegram run (Phase 1 precedent: the live run is the only arbiter of button width and copy).

### Wave 0 Gaps

- [ ] `tests/unit/zoned-clock.test.ts` — DST resolution, all three kinds, ≥3 zones incl. a 30-minute shift
- [ ] `tests/unit/target-week.test.ts` — REQ-PLAN-03
- [ ] `tests/unit/slot-generation.test.ts` — REQ-CONF-04
- [ ] `tests/unit/planning-day-card.test.ts` / `planning-time-card.test.ts` — REQ-PLAN-04…07
- [ ] `tests/unit/planning-keyboards.test.ts` — serialized row shape (F-9 guard)
- [ ] `tests/unit/planning-start-authorization.test.ts` — REQ-PLAN-01
- [ ] `tests/unit/callback-authority.test.ts` — the Pattern 5 regression matrix
- [ ] `tests/unit/planning-ownership.test.ts` — D-02
- [ ] `tests/unit/planning-logging.test.ts` — redaction + non-silent branches
- [ ] `tests/integration/planning-round.test.ts` — REQ-PLAN-02
- [ ] `tests/integration/planning-takeover.test.ts` — REQ-AUTH-03
- [ ] `tests/integration/planning-recovery.test.ts` — REQ-PLAN-10, REQ-RELI-01
- [ ] `tests/integration/planning-confirm.test.ts` — D-04/D-10/D-11
- [ ] Widen `createMembershipGateway` in `tests/fakes/chat-readiness.ts` to the full `CurrentTelegramRole` union
- [ ] Add a `createChatConfiguration(overrides)` fixture — 13 Phase 2 tests need a configured chat
- [ ] Framework install: none — Vitest 4.1.11 and Testcontainers 12.1.0 are already present

---

## Security Domain

### Applicable ASVS Categories (level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (delegated) | Identity is asserted by Telegram. The bot never trusts a claim carried in `callback_data`; it re-reads `ctx.from.id` and re-checks the live role via `getChatMember` at every action boundary (AUTH-02). |
| V3 Session Management | yes | No client-side session. The "session" is the `PlanningRound` row plus single-use `CallbackAction` rows with `expiresAt` and `consumedAt`. Tokens are `randomUUID()` from `node:crypto` behind `^v1:[0-9a-f-]{36}$`. |
| V4 Access Control | **yes — the dominant category** | Three distinct authorities: `canStartPlanning` (policy, PLAN-01), round-author ownership (D-02, a durable column), and administrator takeover gated on inactivity (AUTH-03). Every one is re-resolved from PostgreSQL at the action boundary; none is ever read from the wire. |
| V5 Input Validation | yes | Zod discriminated union per callback surface, `.strict()`, plus `"YYYY-MM-DD"` and `MinuteOfDay` range checks. Every selection is additionally re-validated against the round's own snapshot of the target week and daily window — a valid-looking date outside the target week must be refused. |
| V6 Cryptography | no (none hand-rolled) | Only `randomUUID()` for opaque tokens. No hashing, encryption, or signing is introduced. |
| V7 Error handling & logging | yes | Allow-list redaction; every terminating branch emits a distinct `event`/`outcome`/`reason`; every caught error bound under `err`. |

### Known Threat Patterns for grammY + Prisma + PostgreSQL in a shared Telegram group

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Any group member can tap another user's visible inline button | Elevation of privilege | Ownership resolved from `PlanningRound.authorUserId` inside the transaction; the tap is a no-op plus a private alert (D-02). Never rely on "they can't see the button". |
| IDOR: forging or replaying a token to act on another chat's round | Tampering | Boundary enforces `action.chatId === ctx.chat.id` and `expiresAt > now`; the dispatcher additionally asserts the loaded round's `chatId` matches. |
| Double-tap / duplicate update creating two proposals | Repudiation | `consumedAt` single-consumption + `expectedRevision` guard; a repeat returns `Already applied.` with no second transition (RELI-02 precedent). |
| Race: two authorized users start planning simultaneously | Tampering | `@@unique([chatId, activeWeekStart])`. `sequentialize` reduces the window but is **not** the guarantee. The unique-violation path must render friendly copy, not a stack trace. |
| Premature takeover of an active round | Elevation of privilege | Inactivity re-checked **inside** the takeover transaction, not only at render time (AUTH-03 / D-12). |
| HTML injection via a Telegram display name into card text | Tampering / XSS-in-markup | Reuse `memberLabel`, which escapes `&`, `<`, `>`; never interpolate a raw name into a `parse_mode: "HTML"` card. |
| Status re-post flood (D-15 is open to everyone) | Denial of service | `lastStatusPostedAt` cooldown; refusal logged with a bounded outcome. |
| Callback-action row growth (≈12 rows minted per card render) | Denial of service | Bounded `expiresAt`; rows are already indexed on `[chatId, actorUserId, expiresAt]`. Consider a bounded cleanup in a later phase; at band scale this is an accepted risk to state explicitly. |
| Leaking rehearsal times / the chat's timezone into logs | Information disclosure | Allow-list redaction; `timezone` deliberately stays off the list (threat `T-01-21-03`). Do not widen it for convenience. |
| Fail-open on an unavailable `getChatMember` | Elevation of privilege | `currentRole()` returns `"unknown"`; `canStartPlanning` denies `"unknown"` via `isCurrentMember`. Assert this with a test. |
| Wizard values invalidated mid-round by a concurrent `/settings` edit | Tampering | The round snapshots `timezone`, `durationMinutes`, `dailyStartMinute`, `dailyEndMinute` at start; a settings change cannot retroactively invalidate an in-flight card. Re-validate the final selection against the snapshot at Confirm. |

---

## In-repo verified values (verbatim)

Every value a Phase 2 task may reference, quoted from the file read in this session.

**Weekday encoding — `ChatConfiguration.defaultWeekday` is `Int` 1..7 with MON=1** [VERIFIED: src/domain/chat/setup-service.ts:86-88, 201-211; src/domain/chat/types.ts:1-21]

```typescript
// src/domain/chat/types.ts:1-11
export const WEEKDAYS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;
```
```typescript
// src/domain/chat/setup-service.ts:86-88
function isWeekday(value: number): value is 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}
```
```typescript
// src/domain/chat/setup-service.ts:201-211
  async selectWeekday(draftId: string, weekday: Weekday, now: Date) {
    const value = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(
      weekday,
    );
    if (!isWeekday(value + 1)) {
      throw new RangeError("Unsupported weekday.");
    }
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: { defaultWeekday: value + 1, expiresAt: expiresAt(now) },
    });
  }
```

**The containment rule (D-06 / CONF-04)** [VERIFIED: src/domain/chat/schedule-validator.ts:66-78]

```typescript
  // The rehearsal is contained by the window at BOTH ends. Only the ceiling was
  // ever enforced, so a rehearsal starting before the window opened was
  // accepted. Starting exactly at the floor is inside the window, hence `<`.
  if (values.defaultStartMinute < values.dailyStartMinute) {
    return { valid: false, reason: "outside-boundaries" };
  }
  if (
    values.defaultStartMinute + values.durationMinutes >
    values.dailyEndMinute
  ) {
    return { valid: false, reason: "outside-boundaries" };
  }
```

**`CallbackActionKind` — the enum Phase 2 extends** [VERIFIED: prisma/schema.prisma:20-24]

```prisma
enum CallbackActionKind {
  START_SETUP
  SETTINGS_EDIT
  ROSTER_REMOVE
}
```

**Callback token shape** [VERIFIED: src/shared/callback-schema.ts:5]

```typescript
export const callbackTokenSchema = z.string().regex(/^v1:[0-9a-f-]{36}$/i);
```
(`v1:` + a 36-character UUID = 39 bytes, inside Telegram's 1–64.)

**Boundary copy Phase 2 must not restate or diverge from** [VERIFIED: src/telegram/callbacks.ts:31-35]

```typescript
export const CALLBACK_DENIAL = "Only current chat administrators can do that.";
export const SETUP_STALE_TEXT =
  "This setup action is no longer available. Send /setup to start again.";
export const GENERIC_STALE_TEXT =
  "This action is no longer available. Open /settings or /roster and try again.";
```

**Logger allow list — `roundId` and `jobId` are ALREADY allowed; `date`/`minute`/`timezone`/`weekStart` are NOT** [VERIFIED: src/shared/logger.ts:21-52]

```typescript
const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  // Bounded identifiers
  "chatId",
  "actorId",
  "targetId",
  "updateId",
  "messageId",
  "actionId",
  "draftId",
  "membershipId",
  "roundId",
  "jobId",
  // Bounded classifications chosen by our own code, never by Telegram input
  "actionKind",
  "callbackKind",
  "route",
  "command",
  "field",
  "event",
  "outcome",
  "reason",
  "status",
  "signal",
  // Bounded counters
  "revision",
  "expectedRevision",
  "attempt",
  "count",
  "page",
  "pageCount",
  "durationMs",
]);
```

**Existing expiry constants Phase 2's threshold mirrors** [VERIFIED: src/domain/chat/setup-service.ts:14; src/domain/chat/settings-service.ts:15; src/domain/roster/roster-service.ts:39]

```typescript
const DRAFT_LIFETIME_MS = 30 * 60 * 1000;                       // setup-service.ts:14
const DRAFT_LIFETIME_MS = 30 * 60 * 1000;                       // settings-service.ts:15
export const ROSTER_ACTION_LIFETIME_MS = 30 * 60 * 1000;        // roster-service.ts:39
```

**Existing route ids — the closed union Phase 2 extends** [VERIFIED: src/telegram/handlers.ts, `ChatReadinessRouteId`]

```typescript
export type ChatReadinessRouteId =
  | "command:setup"
  | "command:settings"
  | "command:roster"
  | "command:roster_add"
  | "update:message:location"
  | "update:message:text"
  | "callback:START_SETUP"
  | "callback:SETTINGS_EDIT"
  | "callback:ROSTER_REMOVE";
```

**Roster projection page size and label collation Phase 2 reuses** [VERIFIED: src/telegram/roster-renderers.ts:4, 12, 46-60]

```typescript
export const ROSTER_PAGE_SIZE = 20;
const LABEL_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });
```

---

## Project Constraints (from CLAUDE.md)

Directives extracted from `./.claude/CLAUDE.md`; treat with the same authority as locked CONTEXT decisions.

| Constraint | Planning implication |
|-----------|---------------------|
| Interactions must work in a Telegram group chat with no separate client | No web view, no private-chat-only step. |
| Agent-runtime portability (Codex **and** Claude Code) | No script, hook, or doc may depend on a single runtime. |
| **All documentation in English** | Every Phase 2 artifact, comment, and commit message. |
| Keep an application roster; `getChatMember` is only guaranteed for other users when the bot is an administrator | D-09's snapshot reads the roster, never a Telegram member enumeration. |
| `callback_data` is 1–64 bytes; send compact versioned opaque data; never serialize names, dates, or authorization claims | Pattern 10 — the date lives on the `CallbackAction` row, not the wire. |
| Acknowledge every callback immediately; handle stale/double clicks as idempotent no-ops with a short notification | The boundary's single-shot guard + `Already applied.` |
| Privacy mode stays enabled | Commands, callbacks on the bot's own message, and replies suffice — Phase 2 needs no free-text step, so this holds without effort. |
| Treat updates as untrusted and unordered; persist `chat_id`, `message_id`, and round version; authorize callback user ids against the selected participant set; use a transaction plus constraints for every transition | Directly prescribes `anchorMessageId`, `revision`, and the unique constraint. |
| Use database `bigint` and TypeScript `bigint` at the repository boundary for Telegram ids | `chatId`, `authorUserId`, `telegramUserId` are `BigInt`. |
| Timestamps as `timestamptz`; store each chat's IANA timezone separately | `@db.Timestamptz(3)` on every instant column; the round snapshots `timezone`. |
| Prisma provides schema, transactions, compound unique constraints, and a committed migration history | Migration-first; no `db push`; the committed history is what Testcontainers replays. |
| pg-boss is for durable deferred jobs | Phase 5, not Phase 2. |
| Vitest for unit/integration; Testcontainers for a disposable PostgreSQL | Already wired; only new test files are needed. |
| Prefer grammY for transport only; keep durable business state in PostgreSQL | No `session`, no `conversations` as the source of truth. |
| **GSD workflow enforcement:** no direct repo edits outside a GSD command | Phase 2 work runs through `/gsd-execute-phase`. |

---

## Sources

### Primary (HIGH confidence)
- This repository, read in full this session: `prisma/schema.prisma`, `src/domain/chat/{types,schedule-validator,setup-service,settings-service}.ts`, `src/domain/auth/{authorization-service,planning-access-service}.ts`, `src/domain/roster/roster-service.ts`, `src/shared/{callback-schema,logger}.ts`, `src/telegram/{callbacks,handlers,keyboards,roster-renderers,settings-handlers}.ts`, `src/app/create-bot.ts`, `tests/{fakes/chat-readiness.ts,helpers/postgres.ts}`, `vitest.config.ts`, `package.json`, `docker-compose.yml`, `Dockerfile`, `.github/workflows/ci.yml`.
- Phase 1 artifacts: `01-CONTEXT.md`, `01-PATTERNS.md`, `01-UI-SPEC.md`, `01-SECURITY.md` (threat register), `01-VALIDATION.md`.
- Local runtime probes executed this session: `node --version` → `v24.18.0`; `typeof Temporal` → `undefined`; `docker info` → daemon reachable; `Intl.DateTimeFormat` with `timeZone: "Europe/Kyiv"` → resolves; the `resolveWallClock` verification matrix in Pattern 1.
- `gsd-tools query package-legitimacy check --ecosystem npm …` (2026-08-30) and `npm view <pkg> version` for five candidate time libraries.

### Secondary (MEDIUM confidence)
- Telegram Bot API reference (core.telegram.org/bots/api) — `callback_data` *"1-64 bytes"*, `answerCallbackQuery` text *"0-200 characters"*, `editMessageText` text *"New text of the message, 1-4096 characters"* with `chat_id` + `message_id` required when `inline_message_id` is absent.
- PostgreSQL 18 documentation, "Unique Indexes" — *"By default, null values in a unique column are not considered equal, allowing multiple nulls in the column."*
- grammY guide, "Calling API methods" — `bot.api`/`ctx.api` positional mapping of `chat_id`/`message_id`.
- Prisma documentation — partial indexes via `where:` behind the `partialIndexes` preview flag; `migrate dev --create-only` as the unsupported-feature workflow.

### Tertiary (LOW confidence)
- WebSearch on Temporal's Node.js availability (Node 26, May 2026) — corroborated by the direct local probe, which is the load-bearing evidence.
- WebSearch on `Bad Request: message is not modified` — a widely reported grammY/Bot API behavior; treat the exact error string as `[ASSUMED]` and match on a substring, not an equality, in the catch.
- npm package metadata for `luxon`, `@date-fns/tz`, `temporal-polyfill`, `@js-temporal/polyfill`, `@js-joda/core` — registry existence confirmed, but all five names were discovered from non-authoritative sources and remain `[ASSUMED]`.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new packages; every version read from `package.json` in this session.
- Architecture / integration points: **HIGH** — every claim traces to a file read this session, with line numbers and verbatim quotes.
- DST policy: **HIGH** — the algorithm was written and empirically verified against five DST scenarios on the actual runtime.
- External API limits: **MEDIUM** — quoted from the official Bot API and PostgreSQL docs via a fetch tool, not via a curated docs provider (no Context7/Ref/Exa configured in `.planning/config.json`).
- Pitfalls: **HIGH** — 1, 2, 4, 5, 7, 9 are derived from the current source and from closed Phase 1 findings; 3, 8, 10 are MEDIUM.
- "Previous rehearsal" definition, abandonment threshold, marker glyphs, command names: **LOW** — see the Assumptions Log; A1 in particular needs owner confirmation before it becomes a locked decision.

**Research date:** 2026-08-30
**Valid until:** 2026-09-29 (30 days). Re-check earlier if the project moves to Node 26 (Temporal becomes available and `zoned-clock.ts` should be retired) or if Prisma promotes `partialIndexes` out of preview.
