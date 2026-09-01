---
phase: 02-weekly-rehearsal-proposal
verified: 2026-09-01T09:15:00Z
status: human_needed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "A new proposal snapshots the chat's current active band roster as its participants (SC5)"
    reason: undeclared-precondition
    harden: "PlanningParticipant.membershipId is a bare String with no @relation and no FK in the migration (prisma/schema.prisma:184-192, migration.sql:39-46). The snapshot's referential integrity holds today ONLY because roster removal is a soft delete (deactivatedAt). Nothing in the schema declares or enforces that precondition. Declare the ChatMembership relation with onDelete: Restrict, matching the existing ChatMembership -> TelegramUser policy, and index telegramUserId (which wasPreviousParticipant filters on and cannot use the (round_id, telegram_user_id) composite for)."
human_verification:
  - test: "Run the full /plan wizard in a real Telegram group: /plan, tap a day, tap an hour, tap Back twice, tap Confirm. Check the marker glyphs (⭐ usual, 🔁 last rehearsal, 🚫 unavailable, ✅ chosen) render as glyphs and not as tofu; check no button label truncates to an ellipsis in the 4/3 day rows and the 3/3/3/1 slot rows; check exactly ONE card is live in the chat at every moment."
    expected: "Every glyph renders. No label truncates (Phase 1 finding F-9 recurrence). The anchor card is edited in place from DAY to TIME to REVIEW to the confirmed card; no second message is posted by a step tap."
    why_human: "Telegram renders emoji, button widths and in-place edits client-side. No automated check in this repo observes what a Telegram client actually draws, and F-9 (Phase 1) was found only on a live run."
  - test: "Configure a chat whose active band roster has EXACTLY ONE member, then reach the review step."
    expected: "The lineup heading reads correctly for one person."
    why_human: "Confirmed defect, not a question: src/telegram/planning-renderers.ts:386 renders '<b>Asking these band member:</b>' for members.length === 1 — the singular arm drops the count but keeps the plural determiner. No test asserts either arm ('Asking these' appears nowhere under tests/). Code review WR-07 was raised and deliberately not fixed; a human decision is needed on whether broken grammar on the terminal decision card ships."
  - test: "In a group where the bot's getChatMember lookup for a band member transiently fails (or with a user who has left), tap any planning button on a live card."
    expected: "A refusal that names the real reason (not in this chat), not an administrator-rights refusal."
    why_human: "Confirmed defect, not a question: src/telegram/callbacks.ts:390-395 routes the route-resolved non-member refusal through denyNonAdministrator, which always answers CALLBACK_DENIAL ('Only current chat administrators can do that.'). That is false for the planning route, where D-02/D-15 admit any member. The correct copy (PLANNING_STATUS_DENIAL) already exists and is unused on this path. Code review WR-10, deliberately not fixed."
  - test: "Have an author whose Telegram display name contains an ampersand or angle bracket (e.g. 'Ben & Jo') own a round, then have a bystander tap a button on that card."
    expected: "The private alert names the owner as 'Ben & Jo'."
    why_human: "WINDOWS.md defect #20 is OPEN and is the only open window in the ledger. memberLabel HTML-escapes for the card, but answerCallbackQuery text is plain, so the alert shows 'Ben &amp; Jo'. Cosmetic, private, single-viewer — deliberately left unfixed because both fixes (a second escaper or a second identity path) were rejected by 02-05. Needs an owner decision: fix, waive, or carry to the live-run pass."
  - test: "Developer decision on the seven deliberately-unfixed code-review items (WR-05 callback_actions never reaped, WR-06 dead Zod action members + dead ABANDONED enum, WR-07 singular grammar, WR-08 missing membershipId FK/index, WR-09 lineup read one statement before the atomic gate under READ COMMITTED, WR-10 wrong non-member refusal text) plus the unreported back()/selectDay/selectTime/takeover lost-revision-race token spend."
    expected: "Each is fixed, ledgered as a broken window, or explicitly accepted with a reason."
    why_human: "None of the seven blocks a Phase 2 success criterion — that judgement is recorded below with evidence — but each is a real defect and only the owner can decide which ship. WR-05 and WR-08 in particular become Phase 3 problems rather than Phase 2 ones."
  - test: "ROADMAP.md format: every phase (1-5) carries '**Mode:** mvp' but no phase Goal is written as a User Story ('As a ..., I want to ..., so that ...')."
    expected: "Either the mode field is corrected, or the goals are rewritten as User Stories via /gsd mvp-phase."
    why_human: "Project-wide roadmap-format mismatch, NOT a Phase 2 defect. Under MVP mode this verifier is instructed to refuse verification and demand a User Story goal. It did not refuse, because the mismatch predates Phase 2, affects all five phases, and Phase 2 carries five explicit, well-formed Success Criteria that ARE a verifiable contract. Verification proceeded goal-backward against those five criteria. Flagging so the discrepancy is not silently absorbed."
---

# Phase 2: Weekly Rehearsal Proposal Verification Report

**Phase Goal:** An authorized planner can create and recover a single, week-aware rehearsal proposal with the right defaults.
**Verified:** 2026-09-01T09:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths 1-5 are the ROADMAP.md Success Criteria (the contract). Truths 6-13 are merged
from the six PLAN frontmatter `must_haves` blocks, selected for the areas the phase was
most at risk in.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An authorized user can start planning; the chat has no more than one active process for the same target calendar week; an administrator can take over an abandoned process | ✓ VERIFIED | Authorization: `handlers.ts:579-613` resolves `currentRole` (non-destructive) then `canStartPlanning` (`planning-access-service.ts:27-43`, fails closed on `unknown`/missing policy). Uniqueness: `@@unique([chatId, activeWeekStart])` (`schema.prisma:167`, `migration.sql` CREATE UNIQUE INDEX) + `startOrResume`'s live-round check (`planning-service.ts:874-882`) + `isUniqueViolation` -> `week-taken`. **CR-01 blocker fix confirmed**: `targetWeekStart` (`target-week.ts:76-89`) now asks the claim predicate about EVERY candidate up to `MAX_WEEK_LOOKAHEAD = 52` and returns `null` at the cap. Takeover: `planning-service.ts:1502-1587` re-checks BOTH inactivity and a freshly resolved administrator role inside the transaction, guards on revision, and mutates only `authorUserId`/`lastActivityAt`/`revision`. Tests: `planning-round.test.ts:554,641,684,725`; `planning-takeover.test.ts` (17 cases); `planning-start-authorization.test.ts` (role × policy matrix) |
| 2 | The bot targets the current Monday–Sunday week when it has no rehearsal or scheduled rehearsal, otherwise the next week | ✓ VERIFIED | `targetWeekStart` + `weekIsClaimed` + `WEEK_CLAIMING_STATUSES = [CONFIRMED]` (`target-week.ts:24-38`); `mondayOf` on a Monday returns that Monday (`civil.ts:60-62`). Chat-local, never process-local: `civilNow(configuration.timezone, now)` at `planning-service.ts:891`. Tests: `target-week.test.ts` (8 cases incl. the Sunday→Monday boundary in Kyiv vs UTC, and the two-consecutive-claimed-weeks case CR-01 named); `planning-round.test.ts:588,641,684` |
| 3 | The planning author can choose any day in the target week and sees the configured default day and previous-rehearsal day highlighted correctly | ✓ VERIFIED | `buildDayStepProjection` (`planning-service.ts:333-357`) is total: always 7 cells from `weekDates`, Monday-first, markers change labels never positions. `classifyDay` (`planning-service.ts:310-323`) is one ordered decision — past > default > previous — so D-08's tie rule is structural. `previousRehearsalWeekday` matches by WEEKDAY and is suppressed when the previous date falls inside the target week (matches the developer decision). Markers are LEADING glyphs (`withGlyphs`, `planning-renderers.ts:159-164`) with a legend line, never word suffixes (F-9). Tests: `planning-day-card.test.ts` (26 cases), `planning-keyboards.test.ts:56` (serialized 4/3 rows). **Verifier probe** (see Behavioral Spot-Checks) closed the one untested link |
| 4 | The planning author can choose a valid hourly time slot within the chat's configured boundaries and sees the configured default time and previous-rehearsal time highlighted correctly | ✓ VERIFIED | `generateSlots` (`slot-generator.ts:38-52`) steps by exactly 60 integer minutes from `dailyStartMinute` and delegates admission to `validateSchedule` rather than restating containment; no rounding, no partial final slot. Window is the ROUND's snapshot (`buildTimeStepProjection(… window: round …)`, `planning-service.ts:809`), not a live config read. `slotAvailability` compares INSTANTS and returns `nonexistent` for a skipped wall clock, never relocating it. `classifySlot` mirrors `classifyDay`'s order. `selectTime` persists `selectedStartMinute`, advances to REVIEW, edits in place. Tests: `slot-generation.test.ts` (15 cases incl. the exact 10:00–19:00 boundary set), `zoned-clock.test.ts` (DST matrix, 3+ zones incl. a 30-minute offset), `planning-time-card.test.ts` (40 cases) |
| 5 | A new proposal snapshots the chat's current active band roster as its participants, and can be recovered with a status request after an interruption or bot restart | ✓ VERIFIED | Snapshot: `confirm` (`planning-service.ts:1268-1425`) is ONE transaction that consumes the callback row exactly once, refuses an empty roster, promotes under a revision guard, sets `activeWeekStart: null` in the SAME statement as `status`, writes `startsAt`/`endsAt = startsAt + durationMinutes*60000`, and `createMany`s one `PlanningParticipant` per row of `listActiveMemberships` (a real `chatMembership.findMany`, `roster-service.ts:128-137`). **Recovery: genuinely reconstructed from PostgreSQL.** `startOrResume` and `status` both read the DRAFT row deterministically (`orderBy [createdAt desc, id desc]`, at most one per (chat, week) by the unique index); every wizard value is a column. Proven by `planning-recovery.test.ts:640` — a second `createPrismaClient` + a second `createBot`, nothing shared but the database, resumes step=REVIEW, selectedDate=2026-08-27, selectedStartMinute=900, and the resumed card's Back button moves the SAME round. Tests: `planning-confirm.test.ts` (18 cases), `planning-recovery.test.ts:640,696` |
| 6 | The planning callback route is route-resolved: a non-administrator author can press a day button; every Phase 1 kind is observably unchanged; a planning tap never deletes anyone's setup/settings draft | ✓ VERIFIED | `planningCallbackRoute` declares `authority: "route-resolved"`, `actorBinding: "route-resolved"` (`callbacks.ts:483-487`); the three Phase 1 kinds keep `current-admin`/`strict` (`callbacks.ts:463,508,515`). The destructive `discardActorDrafts` is gated on `route.authority === "current-admin"` (`callbacks.ts:371`). Tests: `callback-authority.test.ts` (12 cases incl. 243, 259 verbatim-alert regression, 291, 437 draft-intact, 446 distinct reason pairs); `planning-round.test.ts:801` |
| 7 | The committed migration replays cleanly on an empty PostgreSQL 18.4 container with no pending migrations | ✓ VERIFIED | `tests/helpers/postgres.ts:21-24` runs `prisma migrate deploy` then `prisma migrate status` via `execFile` (which throws on non-zero) against a fresh `postgres:18.4` container, in `beforeAll` of every integration file. All 9 integration files passed in this verifier's own run. Two Phase 2 migrations present: `20260831100411_planning_rounds`, `20260901120000_chat_status_cooldowns`. Never `db push`, never implicit DDL |
| 8 | Every step after the first carries Back, returning to the previous selector with the earlier choice still applied and still marked | ✓ VERIFIED | `PREVIOUS_STEP` map + `back()` (`planning-service.ts:1154-1226`); `chosen` is on both projections and `PLANNING_MARKER_CHOSEN` leads the label. Back is minted for TIME and REVIEW and NOT for DAY (`stepTargets`, `planning-service.ts:627-653`) — "Back does not exist here" is an unmintable target, not a dead button. Tests: `planning-time-card.test.ts:976,1005,1032,1052,1074`; `planning-confirm.test.ts:588` (real card, end to end) |
| 9 | Confirm is idempotent and concurrency-safe: a second Confirm on the same token changes nothing, and two concurrent Confirms resolve to exactly one promotion | ✓ VERIFIED | The single atomic gate is `updateMany … where consumedAt: null` asserting `count === 1` (`planning-service.ts:1353-1366`) — a database CAS, not check-then-act. All read-only refusals (state, author, empty roster, snapshot re-validation, skipped wall clock) run BEFORE it, so a refusal never spends the card's only Confirm token. Tests: `planning-confirm.test.ts:506` (no duplicate rows, no second revision, activeWeekStart stays NULL), `:542` (two concurrent Confirms, exactly one promotion) |
| 10 | A status request posts a NEW message at the chat bottom, makes it the anchor, clears the previous keyboard, and two requests inside the cooldown produce at most one new anchor | ✓ VERIFIED | `status()` claims the cooldown as a CAS in the WHERE clause BEFORE returning (`planning-service.ts:1644-1657`); `reanchor` writes `anchorMessageId` + `lastStatusPostedAt` in one guarded statement; `repostAnchor` orders post → re-anchor → clear old keyboard. `/plan_status` is open to any chat member (`handlers.ts:629-653`) but its buttons still refuse a non-author. Tests: `planning-recovery.test.ts:280,391,437,524,579,611` |
| 11 | A DRAFT round whose target week is behind the chat is SUPERSEDED at READ time — not deleted, and with no scheduler, job or timer introduced | ✓ VERIFIED | `supersedeStaleRounds` (`planning-service.ts:1460-1474`) nulls `activeWeekStart` in the same statement as `status`; called first in both `startOrResume` (`:869`) and `status` (`:1629`). No `pg-boss`, `node-cron`, `setTimeout` or `setInterval` anywhere in the planning domain. Tests: `planning-takeover.test.ts:727` (superseded, not deleted), `:770` (a current-week draft is NEVER reaped however silent), `:794` (week released), `:829` (nothing in the planning domain deletes a durable row) |
| 12 | Every terminating planning branch emits exactly one log line with a distinct event/outcome/reason triple, and no line carries a date, minute, weekday, week start or timezone | ✓ VERIFIED | `logPlanning`'s `reason` is a REQUIRED parameter and `roundId` explicitly `string \| undefined`, so a silent branch is a compile error rather than a review finding. `PLANNING_OUTCOMES` is a bounded vocabulary (`planning-handlers.ts:210-240`). Tests: `planning-logging.test.ts:773` (enumerates enough branches to be a real gate), `:806`, `:830` (no two branches share an (outcome, reason) pair even across routes), `:921`, `:938` (a date/zone cannot survive under an allow-listed key), `:972` |
| 13 | REQUIREMENTS.md / ROADMAP.md / PROJECT.md carry the roster-as-lineup model, and no requirement ID was deleted | ✓ VERIFIED | `REQUIREMENTS.md:34` PLAN-08 = "confirm time snapshot of the chat's currently active band roster; the active roster is the lineup". `:35` PLAN-09 retained, marked out of v1 Phase 2 scope by D-09 with ROST-01/ROST-02 named as the replacement path — present, not deleted, and still mapped to Phase 2 in the traceability table (`:117`). Traceability table holds **43** rows, matching the v1 total. `PROJECT.md:23` states the lineup is the current active roster and a lineup change is a roster change |

**Score:** 13/13 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | PlanningRound, PlanningParticipant, both enums, PLANNING kind | ✓ VERIFIED | All present; `activeWeekStart String?` under plain `@@unique([chatId, activeWeekStart])`; `ChatStatusCooldown` added by the WR-04 fix |
| `prisma/migrations/20260831100411_planning_rounds/migration.sql` | Committed forward migration | ✓ VERIFIED | Replays on empty PG 18.4; `migrate status` clean |
| `prisma/migrations/20260901120000_chat_status_cooldowns/migration.sql` | WR-04 fix migration | ✓ VERIFIED | `chat_status_cooldowns` PK on chat_id |
| `src/infrastructure/time/civil.ts` (96 L) | CivilDate, IsoWeekday, isoWeekdayOf, mondayOf, addDays, isoDate, parseCivilDate | ✓ VERIFIED | All exported; the ONE weekday-encoding conversion boundary; `parseCivilDate` rejects `2026-02-30` rather than rolling it over |
| `src/infrastructure/time/zoned-clock.ts` (165 L) | offsetMsAt, civilNow, resolveWallClock | ✓ VERIFIED | Three-way unique/ambiguous/skipped; `skipped` carries NO instantMs, making the prohibited relocation unrepresentable |
| `src/domain/planning/target-week.ts` (95 L) | targetWeekStart, weekIsClaimed, MAX_WEEK_LOOKAHEAD | ✓ VERIFIED | CR-01 fix landed; returns `string \| null` |
| `src/domain/planning/slot-generator.ts` (90 L) | generateSlots, slotAvailability | ✓ VERIFIED | Delegates containment to `validateSchedule` — no fourth copy of the rule |
| `src/domain/planning/planning-service.ts` (1832 L) | startOrResume, selectDay, selectTime, back, confirm, status, reanchor, takeover, supersedeStaleRounds, previousRehearsal | ✓ VERIFIED | All present and substantive; single `planningRound.create` site |
| `src/telegram/planning-renderers.ts` (429 L) | renderDayStep, renderTimeStep, renderReviewStep, renderConfirmedStep, planningOwnerLine | ✓ VERIFIED | Pure projection-in/card-out; one MARKER_GLYPHS map for both selectors. ⚠️ `:386` carries the WR-07 singular-grammar defect |
| `src/telegram/planning-handlers.ts` (1509 L) | handlePlanCommand, handlePlanStatusCommand, dispatchers, repostAnchor | ✓ VERIFIED | WR-02 and WR-03 fixes landed; `claimRoundlessStatusReply` wired into all three roundless branches |
| `src/telegram/keyboards.ts` | PLANNING_DAY_ROW_SIZES 4/3, PLANNING_SLOT_ROW_SIZES 3/3/3/1, marker glyphs, control rows | ✓ VERIFIED | Declared sizes asserted structurally on the SERIALIZED keyboard |
| `tests/integration/planning-round.test.ts` | End-to-end tracer | ✓ VERIFIED | 13 cases; includes `:641` "rolls past EVERY confirmed week" (the CR-01 regression guard) |
| `tests/integration/planning-confirm.test.ts` | D-04/D-09/D-10/D-11 + idempotency + concurrency | ✓ VERIFIED | 18 cases; includes `:731` "leaves the Confirm row spendable after a lost revision race" (the WR-01 fix guard) |
| `tests/integration/planning-recovery.test.ts` | REQ-PLAN-10, REQ-RELI-01 | ✓ VERIFIED | 15 cases across two composition roots |
| `tests/integration/planning-takeover.test.ts` | REQ-AUTH-03 | ✓ VERIFIED | 17 cases; includes `:660` "names the new owner on the terminal confirmed card" (the WR-03 fix guard) |
| `tests/unit/*` (planning-day-card, planning-time-card, planning-keyboards, planning-logging, planning-ownership, planning-start-authorization, slot-generation, target-week, zoned-clock, callback-authority) | Focused matrices | ✓ VERIFIED | All present, all substantive, all passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bot.command("plan")` | `PlanningService.startOrResume` | `currentRole` (non-destructive) → `canStartPlanning` → `ctx.reply` → `setAnchor` | ✓ WIRED | `handlers.ts:579-613` → `planning-handlers.ts:777-860` |
| callback token `v1:<uuid>` | `dispatchPlanningCallback` | `CallbackAction` row kind=PLANNING → `route.authority=route-resolved` → `PlanningRound.authorUserId` | ✓ WIRED | `callbacks.ts:483-524`; authority is a durable column, never a token claim (`resolveOwnership`, `planning-service.ts:703-713`) |
| `ChatConfiguration` snapshot | `PlanningRound` columns | timezone/durationMinutes/dailyStartMinute/dailyEndMinute copied at create | ✓ WIRED | `planning-service.ts:909-913`; every later render reads the ROUND, not the live config (T-02-11) |
| `PlanningRound.activeWeekStart` | one-active-process guarantee | `@@unique([chatId, activeWeekStart])`, NULLed on confirm/supersede | ✓ WIRED | Verified at both the Prisma model and the SQL index |
| `previousRehearsal()` | day + time markers | `rehearsalDate`/`rehearsalStartMinute` → `civilNow(round.timezone, round.startsAt)` → projection input | ✓ WIRED | `planning-service.ts:725-736, 502-512, 777-788, 811-816`. **No repo test covers this link** — closed by the verifier probe below |
| `previousRehearsal()`'s sibling | `canStartPlanning`'s `wasPreviousParticipant` | `planningParticipant.count` over ANY CONFIRMED round | ✓ WIRED | `planning-service.ts:748-758`; deliberately BROADER than `previousRehearsal()`, matching the closed developer decision |
| `RosterService.listActiveMemberships` | review card AND confirm-time snapshot | one function, two call sites | ✓ WIRED | `planning-service.ts:838` (render) and `:1351` (transaction) |
| `PlanningRound.lastActivityAt` + `PLANNING_INACTIVITY_MS` | `isTakeoverEligible` | both the button render AND the in-transaction re-check | ✓ WIRED | `planning-service.ts:580-587`, `:1567` (mint) and `:1566` (transaction) |
| `PlanningRound.lastStatusPostedAt` + `PLANNING_STATUS_COOLDOWN_MS` | status re-post refusal | CAS in the WHERE clause | ✓ WIRED | `planning-service.ts:1644-1657`; extended by `ChatStatusCooldown` for the three roundless branches (WR-04 fix) |
| `schema.prisma` | integration suite + CI | committed migration → `applyCommittedMigrations` | ✓ WIRED | `tests/helpers/postgres.ts:21-24` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `renderDayStep` | `projection.days` | `weekDates(round.targetWeekStart)` — computed from a persisted column | Yes | ✓ FLOWING |
| `renderDayStep` | `defaultWeekday` marker | `chatConfiguration.findUnique` | Yes | ✓ FLOWING |
| `renderDayStep` | `previousRehearsalDate` | `planningRound.findFirst` CONFIRMED + `startsAt < now` | Yes | ✓ FLOWING (verified by probe against real PostgreSQL) |
| `renderTimeStep` | `projection.slots` | `generateSlots(round)` — from the round's own persisted window snapshot | Yes | ✓ FLOWING |
| `renderTimeStep` | `previousRehearsalStartMinute` | `civilNow(round.timezone, round.startsAt).minuteOfDay` | Yes | ✓ FLOWING (verified by probe) |
| `renderReviewStep` | `projection.members` | `chatMembership.findMany({ activeAt: not null, deactivatedAt: null })` | Yes | ✓ FLOWING |
| `renderConfirmedStep` | `projection.members` | the rows the confirm transaction ACTUALLY snapshotted (returned from the tx) | Yes | ✓ FLOWING |
| every card | `projection.owner` | `resolveTelegramIdentity(prisma, round.authorUserId)` | Yes | ✓ FLOWING |
| keyboard buttons | `token` | `callbackAction.createMany` inside the step transaction | Yes | ✓ FLOWING |

No static returns, hardcoded literals or mocks found on any rendered value.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Type contract holds | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Full unit suite | `npx vitest run --project unit` | 24 files, 257/257 passed | ✓ PASS |
| Full integration suite (real PostgreSQL 18.4 via Testcontainers) | `npx vitest run --project integration` | 9 files, 94/94 passed | ✓ PASS |
| Committed migration replays on an empty PG 18.4 with no pending migrations | `prisma migrate deploy && prisma migrate status` inside `startPostgresTestContainer` | Succeeded 9× (once per integration file); `execFile` throws on non-zero | ✓ PASS |
| **Probe A** — the instant→civil→marker conversion: a stored `startsAt` of Thu 2026-08-20 15:00 Europe/Kyiv yields the previous marker on the target week's Thursday and on the 15:00 slot | Temporary vitest unit probe over `resolveWallClock` → `civilNow` → `isoDate` → `buildDayStepProjection`/`buildTimeStepProjection`; run then deleted | `prevDate 2026-08-20 prevMinute 900`; day markers `…2026-08-27:previous 2026-08-28:default…`; slot markers `…15:00:previous… 18:00:default…` | ✓ PASS |
| **Probe B** — the untested DB link: a real CONFIRMED `PlanningRound` row in PostgreSQL reaches `dayStepProjection` and `timeStepProjection` as the previous marker | Temporary vitest integration probe: seeded a CONFIRMED round (startsAt past) + a DRAFT round, called `service.previousRehearsal`, `service.dayStepProjection`, `service.timeStepProjection`; run then deleted | `previousRehearsal` returned the seeded round; Thu 2026-08-27 marker = `previous`, Fri 2026-08-28 = `default`; slot 900 = `previous`, slot 1080 = `default` | ✓ PASS |

Both probe files were removed after execution; `git status --porcelain` confirms a clean tree
under `src/`, `tests/` and `prisma/`.

**Why the probes were run:** `grep -rn "previousRehearsal" tests/` returns nothing, and every
`previousRehearsalDate` / `previousRehearsalStartMinute` occurrence under `tests/` is a hand-supplied
fixture value. The projection logic is well covered; the link from a real CONFIRMED round through the
timezone conversion into the marker was covered by **no test in the repository**. Criteria 3 and 4
name that link explicitly ("sees the ... previous-rehearsal day/time highlighted correctly"), so it
was verified directly rather than accepted on presence. It works. The **missing permanent regression
guard is recorded as a warning below.**

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` exist in the repository and no PLAN or
SUMMARY declares a probe path.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| CONF-04 | 02-04 | Hourly slots, never beyond the daily boundary | ✓ SATISFIED | `generateSlots` steps 60 min and delegates to `validateSchedule`; `slot-generation.test.ts` pins 10:00–19:00 exactly, both boundary arms, and the empty-list-not-truncated case |
| AUTH-03 | 02-06 | Administrator takes over an abandoned process | ✓ SATISFIED | `takeover` + `isTakeoverEligible` + `mintTakeoverAction`; `planning-takeover.test.ts` (17 cases incl. demotion-between-render-and-tap and author-returns-between-render-and-tap) |
| PLAN-01 | 02-02, 02-06 | Authorized user can start planning | ✓ SATISFIED | `handlers.ts:579-613` + `canStartPlanning`; `planning-start-authorization.test.ts` role × policy matrix, fails closed on `unknown` |
| PLAN-02 | 02-02, 02-05 | One active process per chat and target week | ✓ SATISFIED | `@@unique([chatId, activeWeekStart])`, NULLed on confirm to release the slot; `planning-round.test.ts:554`, `planning-confirm.test.ts:367` |
| PLAN-03 | 02-02, 02-03 | Current Mon–Sun week, else next | ✓ SATISFIED | `targetWeekStart` + `weekIsClaimed`; CR-01 fixed and regression-guarded |
| PLAN-04 | 02-02, 02-03 | Every day in the target week selectable | ✓ SATISFIED | `buildDayStepProjection` is total at 7 cells; past days rendered, marked, refused — never hidden |
| PLAN-05 | 02-03 | Day selector highlights default + previous, default wins on tie | ✓ SATISFIED | `classifyDay` ordered decision; `planning-day-card.test.ts:204,214,230,247,262`; probes A/B for the data link |
| PLAN-06 | 02-04, 02-05 | Author selects a valid generated slot | ✓ SATISFIED | `selectTime` persists the minute, advances to REVIEW, edits the one anchor; `planning-time-card.test.ts:615,634` |
| PLAN-07 | 02-04 | Time selector highlights default + previous, default wins on tie | ✓ SATISFIED | `classifySlot` mirrors `classifyDay`; `planning-time-card.test.ts:185,195,208,237`; probes A/B |
| PLAN-08 | 02-01, 02-05 | Confirm-time snapshot of the currently active roster | ✓ SATISFIED | `confirm` `createMany`s from `listActiveMemberships` inside the transaction; `planning-confirm.test.ts:305,402,421` |
| PLAN-09 | 02-01, 02-05 | *(Out of v1 Phase 2 scope by D-09)* | ✓ TRACED (not implemented, as decided) | Row present at `REQUIREMENTS.md:35` with the supersession reason and ROST-01/ROST-02 as the replacement path; still mapped to Phase 2 at `:117`; traceability table still holds all 43 v1 IDs. Its idempotency/concurrency clause IS exercised by `planning-confirm.test.ts:506,542`. **Correctly not implemented per the developer decision** |
| PLAN-10 | 02-06 | Request status and recover the active interaction | ✓ SATISFIED | `/plan_status` → `status` → `repostAnchor` → `reanchor`, cooldown claimed before the send; `planning-recovery.test.ts:280,524,579,611` |
| RELI-01 | 02-02, 02-06 | Planning state survives restarts | ✓ SATISFIED | Every wizard value is a `PlanningRound` column; `planning-recovery.test.ts:640` proves resumption across two independent composition roots sharing only the database |

**Orphan check:** the union of the six plans' `requirements` fields is exactly the 13 IDs
ROADMAP.md maps to Phase 2. No orphaned requirement.

### Anti-Patterns Found

Debt-marker scan (`TBD`/`FIXME`/`XXX`) over every tracked file under `src/`, `tests/` and
`prisma/` (excluding generated): **zero matches**. No blocker.

The single `TODO`/`PLACEHOLDER`-family match (`tests/unit/planning-time-card.test.ts:1226`)
is a *negative assertion* — the D-04 guard asserting the review card contains none of
`coming soon` / `placeholder` / `not yet` / `disabled` / `todo`. Not a defect.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/telegram/planning-renderers.ts` | 386 | Broken singular grammar: `"Asking these band member:"` for a one-member roster | ⚠️ Warning | The review card is the terminal decision surface. A one-member band reads ungrammatical copy. `grep -rn "Asking these" tests/` returns nothing — neither arm is tested. Code review WR-07, deliberately unfixed. **Does not block SC5**: `planning-confirm.test.ts:402` proves a one-member roster confirms and snapshots correctly |
| `src/telegram/callbacks.ts` | 390-395 (text at `:33`) | Route-resolved non-member is refused with the administrator-rights alert | ⚠️ Warning | A band member whose `getChatMember` blipped is told they lack administrator rights and will ask to be promoted. The correct copy (`PLANNING_STATUS_DENIAL`) exists and is unused here. WR-10, deliberately unfixed. **Does not block SC1**: the refusal itself is correct and fails closed; only the stated reason is wrong |
| `src/domain/planning/planning-service.ts` | 1012, 1126, 1218, 1574 | A lost revision race after the consume CAS spends the callback token without releasing it | ⚠️ Warning | `confirm` (`:1389-1397`) releases the row on this branch — the WR-01 fix. `selectDay`, `selectTime`, `back` and `takeover` do not. For `back` and `takeover` there is exactly ONE token, so the button is permanently dead. **Not reported in 02-REVIEW.md.** Window is narrow (the round read and the guarded update are consecutive statements in one transaction) and recovery exists (`/plan_status` re-mints, subject to the 60 s cooldown). **Does not block a criterion** |
| `src/domain/planning/planning-service.ts` | 1315-1319, 1351, 1364 | Comment claims transactional atomicity the isolation level does not provide | ⚠️ Warning | Prisma interactive transactions run at READ COMMITTED and the lineup read takes no row lock, so a roster change committing between `listActiveMemberships` and `createMany` is invisible. WR-09; neither the code nor the misleading comment was changed. Real but very narrow (one statement apart). **Does not block SC5** |
| `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts` | — | `callback_actions` rows are never deleted anywhere in `src/` | ⚠️ Warning | Phase 2 sharply raises the mint rate (7 or 11 rows per step, plus one full set per `/plan_status`, once a minute indefinitely) and almost none are consumed. The table grows without bound; the boundary's `findUnique` runs on every callback. WR-05, deliberately unfixed. **Operational, not a Phase 2 criterion** |
| `prisma/schema.prisma` | 184-192 | `PlanningParticipant.membershipId` has no `@relation`, no FK and no index | ⚠️ Warning | Contradicts the model's own doc calling it "a durable cross-phase contract". Also, `wasPreviousParticipant` filters on `telegramUserId`, which the only index (`(round_id, telegram_user_id)`) cannot serve. WR-08. See `coincidental_reliance_items` |
| `src/shared/callback-schema.ts`, `prisma/schema.prisma` | 106, 30 | Dead vocabulary: `"cancel"` and `"refuse-past"` are accepted by the Zod boundary but never minted and have no dispatch branch; `PlanningRoundStatus.ABANDONED` is never written | ℹ️ Info | A validator accepting vocabulary the system cannot produce is widened surface for no benefit. WR-06, deliberately unfixed. Both fall through to a bounded catch-all, so behaviour is safe |
| WINDOWS.md #20 | — | `memberLabel` HTML-escapes for the card, but `answerCallbackQuery` text is plain | ⚠️ Warning | `Ben & Jo` reads as `Ben &amp; Jo` in the private refusal alert. **The only OPEN window in the ledger** (`open_count: 1`). Cosmetic, private, single-viewer |
| tests | — | No test covers `previousRehearsal()` → marker | ⚠️ Warning | Verified by verifier probes A and B, which passed — but the probes were deleted and no permanent regression guard exists for a link SC3 and SC4 both depend on. A future change to `rehearsalDate`/`rehearsalStartMinute` or to the suppression rule would go undetected by the suite |

### Human Verification Required

See the `human_verification` frontmatter block. Six items:

1. **Live Telegram run of the wizard** — glyph rendering, label truncation (F-9 recurrence risk),
   single-live-card discipline. Only a real client can answer.
2. **One-member roster review card** — confirmed grammar defect (WR-07), needs a ship/no-ship call.
3. **Non-member planning refusal text** — confirmed wrong-reason copy (WR-10), needs a ship/no-ship call.
4. **HTML-escaped name in a private alert** — WINDOWS.md #20, the only open window.
5. **Decision on the seven deliberately-unfixed items** (WR-05…WR-10 plus the unreported
   `back()`/`takeover()` lost-race token spend) — fix, ledger, or accept.
6. **ROADMAP.md `Mode: mvp` vs non-User-Story goals** — a project-wide format mismatch across all
   five phases, surfaced rather than silently absorbed.

### Gaps Summary

**No gaps.** All five ROADMAP Success Criteria are achieved in the codebase, and all eight
additional PLAN-frontmatter truths selected for scrutiny hold.

Findings against the six areas this verification was asked to be skeptical about:

1. **Criterion 5's recovery half — HOLDS.** State is genuinely reconstructed from PostgreSQL.
   Every wizard value (`step`, `selectedDate`, `selectedStartMinute`, `targetWeekStart`,
   `anchorMessageId`, the four config snapshot columns) is a column on `PlanningRound`.
   No wizard value lives in process memory — `grep` finds no module-level mutable planning
   state, and `planning-recovery.test.ts:640` proves it with a second `createPrismaClient` +
   second `createBot` sharing nothing but the database. The resumed card is *live*, not just
   rendered: Back on it moves the same row.

2. **Criterion 1's one-process-per-week and the CR-01 fix — HOLDS.** `targetWeekStart` now
   interrogates the claim predicate about every candidate up to `MAX_WEEK_LOOKAHEAD = 52` and
   returns `null` at the cap. **There is exactly one caller** (`planning-service.ts:890`) and it
   handles `null` correctly with a distinct `no-free-week` result kind, which the handler answers
   with its own copy and its own bounded log outcome (`planning-handlers.ts:806-811`) rather than
   falling into the generic failure branch. The unit regression guard (`target-week.test.ts`)
   asserts both the two-consecutive-claimed-weeks case and the exhausted-window null, including
   the exact `asked` sequence, so a reversion to the single-question form turns red. The
   integration guard (`planning-round.test.ts:641,684`) covers both ends.

3. **Criteria 3 and 4's markers — HOLD, and the marker is genuinely reachable.** The weekday-match
   rule fires whenever the previous rehearsal's weekday falls on a non-past, non-default day of the
   target week — the ordinary case after a rehearsal has happened. It is correctly suppressed when
   the previous rehearsal falls inside the target week. `previousRehearsal()` returning non-null
   only after a round reaches CONFIRMED with `startsAt < now` is correct by construction, not a
   defect. The one link with **zero test coverage in the repository** — the query and the
   instant→civil conversion feeding the projection — was verified by two verifier probes against
   real PostgreSQL, both passing. The missing permanent regression guard is a warning.

4. **The six deliberately-unfixed warnings — none blocks a success criterion.** WR-05 (unbounded
   `callback_actions`) is operational. WR-06 is dead vocabulary behind a safe catch-all. WR-07 and
   WR-10 are user-visible copy defects on paths whose *behaviour* is correct and tested. WR-08 is a
   Phase 3 integrity risk, recorded as coincidental reliance. WR-09 is a real but one-statement-wide
   race, plus a comment that overstates the guarantee. All six are routed to the human decision item.

5. **The unreported `back()` defect — real, and broader than reported.** `back()` at
   `planning-service.ts:1218` consumes the callback token and then guards on revision, returning
   `stale` without releasing — the exact shape WR-01 identified and `confirm()` fixed at `:1389-1397`.
   **`selectDay` (`:1012`), `selectTime` (`:1126`) and `takeover` (`:1574`) have the same shape.**
   For `back` and `takeover` there is only ONE token, so a lost race leaves a permanently dead
   button. It does **not** threaten a success criterion: all four dispatchers pass `expectedRevision`
   as `null`, so the guard is the round's revision as read *inside* the same transaction one statement
   earlier — a far narrower window than `confirm`'s original one — and recovery exists via
   `/plan_status`, which re-mints the whole step set. Recorded as a warning and routed to the human
   decision item.

6. **WINDOWS.md #20 — confirmed open and correctly characterised.** `open_count: 1`, cosmetic,
   private, single-viewer. Routed to human verification. Note that `workflow.windows_enforce`, if
   enabled, will block `/gsd-ship` while this window is open.

**Why the status is `human_needed` rather than `passed`:** every automated check passes and every
must-have is verified, but this is a Telegram UI phase whose criteria include "highlighted
correctly" — and two confirmed user-visible copy defects (WR-07, WR-10) plus one open ledger
window (#20) are shipping unless someone decides otherwise. Per the decision tree, a non-empty
human-verification section makes `passed` invalid.

---

_Verified: 2026-09-01T09:15:00Z_
_Verifier: Claude (gsd-verifier)_
