# Roadmap: GSMBot

## Overview

GSMBot v1 delivers a complete Telegram-based rehearsal-coordination loop: administrators prepare a chat, an authorized member proposes a week-aware rehearsal, the selected band members confirm availability, and the group reaches a clear ready-to-book result. The final phase adds the durable, state-aware reminders that remove manual chasing. Automatic studio booking remains a later milestone.

## Phases

**Phase Numbering:**

- Integer phases are planned milestone work.
- Decimal phases are urgent insertions, if needed.

- [x] **Phase 1: Chat Readiness** - Administrators configure a persistent, access-controlled planning space. (completed 2026-08-30)
- [x] **Phase 2: Weekly Rehearsal Proposal** - An authorized planner selects a recoverable date, time, and participant set for the correct week. (completed 2026-09-05)
- [x] **Phase 3: Availability and Booking Decision** - Participants confirm one proposal and the group can record it as manually booked. (completed 2026-09-08)
- [ ] **Phase 4: Replanning and Rehearsal Lifecycle** - The group safely recovers from conflicts, changes, cancellation, and completed rehearsals.
- [ ] **Phase 5: Proactive Reliable Reminders** - State-aware reminders prompt planning and outstanding participants without duplicate or obsolete messages.

## Phase Details

### Phase 1: Chat Readiness

**Goal:** As a chat admin, I want to configure a durable, access-controlled chat, so that the band can plan rehearsals.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** CONF-01, CONF-02, CONF-03, CONF-05, ROST-01, ROST-02, ROST-03, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):

  1. A chat administrator can initialize the bot with an IANA time zone and configure the default rehearsal day, start time, duration, time boundaries, and availability-reminder times.
  2. A chat administrator can add identifiable Telegram users to the band roster, remove them, and view the current roster.
  3. A chat administrator can choose whether administrators, previous-poll participants, or anyone may start planning.
  4. A user who no longer has the required current permission cannot perform a protected configuration, roster, or planning-policy action.

**Plans:** 30/30 plans complete

Plans:

- [x] 01-14-PLAN.md

- [x] 01-01-PLAN.md

**Historical dependency decision** *(summarized; execute-phase must not rerun it)*

- [!] 01-01-PLAN.md — HALTED: `tz-lookup@6.1.25` was rejected; replan and independently audit/approve `geo-tz@8.1.8` before installation.

**Wave 1** *(runnable recovery prerequisite; historical 01-01 remains outside the runnable wave count)*

- [x] 01-15-PLAN.md — Preserve the rejected resolver evidence, independently audit/approve `geo-tz@8.1.8` and every pending direct root, and emit a resumable approval or renewed halt summary without installing packages.

**Wave 2** *(depends on an approved, non-halted 01-15 recovery summary)*

- [x] 01-02-PLAN.md — Install only the 01-15-approved roots, then prove the migration-first `/setup` tracer through live authorization, PostgreSQL, and Telegram.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Add strict TypeScript, configuration, Prisma, and deterministic test seams around the tracer.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-04-PLAN.md — Package the migrated tracer in a non-root image and single-worker Docker Compose runtime.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-05-PLAN.md — Deliver resumable authorized setup through explicit location-derived timezone confirmation.

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 01-06-PLAN.md — Collect and validate schedule, reminder, and planning-access setup values.

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 01-07-PLAN.md — Review and atomically activate the complete configuration with restart/failure coverage.

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 01-08-PLAN.md — Introduce the committed settings dashboard, planning-access edit, and policy evaluator.

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 01-09-PLAN.md — Complete every settings edit and harden authorization/read-failure projections.

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 01-10-PLAN.md — Deliver migrated reply-anchored roster persistence with safe add/view behavior.

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 01-11-PLAN.md — Add initiator-bound named roster-removal confirmation with replay/concurrency safety.

**Wave 12** *(blocked on Wave 11 completion)*

- [x] 01-12-PLAN.md — Harden roster identity, pagination, Unicode, delay, failure, and retry projections.

**Wave 13** *(blocked on Wave 12 completion)*

- [x] 01-13-PLAN.md — Integrate every protected route and prove the complete migrated flow end to end.

**Wave 14** *(blocked on Wave 13 completion)*

- [~] 01-14-PLAN.md — Enforce CI/observability gates and verify the final live Telegram flow. EXECUTED 2026-08-21/08-24; Task 1 delivered, Task 2 live run returned NOT APPROVED (F-1…F-9, all closed by 01-16…01-22). Summary written by 01-22. Remaining gate: the live re-run in phase verification. Not complete.

**Gap closure** *(live-verification run 2026-08-24, verdict NOT approved; F-1…F-9 registered as broken windows 4-12. Strictly sequential — the fix order and two of its couplings are load-bearing.)*

**Wave 16** *(blocked on Wave 14 execution; F-3 must precede F-2)*

- [x] 01-16-PLAN.md — Make the single honoured callback answer carry the outcome, so the four verbatim private-alert texts become reachable (G-01-17 / F-3).

**Wave 17** *(blocked on Wave 16 completion)*

- [x] 01-17-PLAN.md — Establish route ownership before authorizing the two update branches, so an ordinary non-administrator message draws no reply (G-01-14 / F-7).

**Wave 18** *(blocked on Wave 17 completion; the expectedRevision repair must land with the validator)*

- [x] 01-18-PLAN.md — Make the daily window fully editable, anchor the rehearsal to its floor, and repair the already-committed rows (G-01-8 / F-5, F-6, N-1).

**Wave 19** *(blocked on Wave 18 completion; requires 01-16)*

- [x] 01-19-PLAN.md — Replace the setup card in place on every callback transition and give the planning-access step one button per row (G-01-18 / F-2, F-9).

**Wave 20** *(blocked on Wave 19 completion)*

- [x] 01-20-PLAN.md — Name the time each wizard step collects, correct the empty-roster expectation, and repair the coverage blocks and ledger attributions (G-01-3, G-01-15, G-01-19 / F-1, F-8, N-3, N-5).

**Wave 21** *(blocked on Wave 20 completion)*

- [x] 01-21-PLAN.md — Thread the redacting logger into the update path and prove emission before absence (G-01-6 / F-4, part 1).

**Wave 22** *(blocked on Wave 21 completion)*

- [x] 01-22-PLAN.md — Bind every discarded exception, make the manual log check non-vacuous, and write the missing 01-14 summary (G-01-6 / F-4, part 2).

**Wave 23** *(three source/test closure plans run in parallel against the current Phase 1 implementation)*

- [x] 01-23-PLAN.md — Route expired settings text/location edits to exact settings-specific expiry feedback without bypassing authorization or deleting unrelated durable state (F-10 / window 14).
- [x] 01-24-PLAN.md — Make `/setup` on a configured chat start or resume the exact setup step instead of emitting the unconfigured readiness prompt (F-11 / window 15).
- [x] 01-25-PLAN.md — Repair the composed planning-access regression and pin invalid policy selection as fail-soft and non-mutating (windows 2 and 3).

**Wave 24** *(blocked on all Wave 23 plans)*

- [x] 01-26-PLAN.md — Run the complete automated closure gate, disposition windows 2/3/14/15 with evidence, and publish the English Run 3 protocol.

**Wave 25** *(blocked on Wave 24; contains the final human Telegram checkpoint)*

- [x] 01-27-PLAN.md — Execute Run 3 in Telegram and reconcile UAT, windows, and D5 strictly to the explicit human verdict.

**Gap closure** *(Run 3 verdict NOT APPROVED on 2026-08-28; F-12 registered as broken window 17, and inherited window 16 still needs a disposition.)*

**Wave 26** *(blocked on Wave 25; the copy fix must land before any live re-check)*

- [x] 01-28-PLAN.md — Make both time-zone prompts state the privacy-mode reply gesture from one Copywriting Contract row, with focused tests, an aligned runbook instruction, and window 17 closed (F-12 / window 17).

**Wave 27** *(blocked on Wave 26; independent of the F-12 fix in substance, serialized only because both edit the window ledger)*

- [x] 01-29-PLAN.md — Dispose of broken window 16 on captured evidence and named commit provenance, stating which invalid-policy contract won, and reconcile the deferred-items record (window 16).

**Wave 28** *(blocked on Waves 26 and 27; contains a bounded human Telegram checkpoint)*

- [x] 01-30-PLAN.md — Run a scoped live re-check of the two fixed time-zone prompts and the replied-location path, then reconcile only what that bounded run exercised.

**UI hint:** yes

### Phase 2: Weekly Rehearsal Proposal

**Goal:** An authorized planner can create and recover a single, week-aware rehearsal proposal with the right defaults.
**Depends on:** Phase 1
**Requirements:** CONF-04, AUTH-03, PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, PLAN-07, PLAN-08, PLAN-09, PLAN-10, RELI-01
**Success Criteria** (what must be TRUE):

  1. An authorized user can start planning, while the chat has no more than one active process for the same target calendar week; an administrator can take over an abandoned process.
  2. The bot targets the current Monday–Sunday week when it has no rehearsal or scheduled rehearsal, otherwise the next week.
  3. The planning author can choose any day in the target week and sees the configured default day and previous-rehearsal day highlighted correctly.
  4. The planning author can choose a valid hourly time slot within the chat’s configured boundaries and sees the configured default time and previous-rehearsal time highlighted correctly.
  5. A new proposal snapshots the chat's current active band roster as its participants, and can be recovered with a status request after an interruption or bot restart.

**Plans:** 11/11 plans complete

Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Reconcile the four artifacts still carrying the superseded participant model, and confirm the one-way durable planning-round contract at a decision checkpoint.

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — Tracer: prove `/plan` end to end through the extended callback boundary, the durable round, and the day-to-time card replacement; materialize the single Phase 2 migration; pin both authorization matrices.

**Wave 3** *(blocked on Wave 2)*

- [x] 02-03-PLAN.md — Day selector: all seven days, the default and previous-rehearsal markers with the default winning on a tie, and past days rendered, marked and refused.

**Wave 4** *(blocked on Wave 3)*

- [x] 02-04-PLAN.md — Time selector: hourly slots that never overrun the daily boundary, the recorded DST policy with total wall-clock resolution, markers, and past or nonexistent hours refused.

**Wave 5** *(blocked on Wave 4)*

- [x] 02-05-PLAN.md — Back on every step, the review card, and Confirm as one atomic transaction that snapshots the active roster, releases the week, and refuses an empty lineup.

**Wave 6** *(blocked on Wave 5)*

- [x] 02-06-PLAN.md — Author-only control with an owner-naming refusal, status re-post and re-anchor with a cooldown, restart resumption, and inactivity-gated administrator takeover with non-destructive stale-week reaping.

*Gap closure from 02-UAT.md — the owner elected on UAT test 5 to fix all seven deliberately-unfixed defects. Waves below are numbered within this gap-closure batch.*

**Gap-closure wave 1**

- [x] 02-07-PLAN.md — Singular-roster grammar on the review card, member-appropriate copy for a route-resolved non-member refusal, and a plain-text owner name in the private alert (G-02-2, G-02-3, G-02-4; closes broken window 20).
- [x] 02-08-PLAN.md — ROADMAP mode/goal format mismatch on phases 2-5, decided by the owner at a blocking checkpoint; project-wide bookkeeping that does not gate Phase 2 (G-02-6).
- [x] 02-10-PLAN.md — Release the callback token on the lost revision race in selectDay, selectTime, back and takeover, with regression tests that actually lose the race (G-02-5).

**Gap-closure wave 2** *(blocked on gap-closure wave 1)*

- [x] 02-09-PLAN.md — Participant foreign key and lookup index, the callback expiry index, the unreachable round status, and the unmintable callback actions, in one reviewed migration (G-02-5).

**Gap-closure wave 3** *(blocked on gap-closure waves 1 and 2)*

- [x] 02-11-PLAN.md — Hold the confirm-time lineup under a row-share lock, and sweep expired callback actions at read time without letting housekeeping fail a command (G-02-5).

**UI hint:** yes

### Phase 3: Availability and Booking Decision

**Goal:** The selected band members can confirm a proposed rehearsal and the group can mark a unanimous result as manually booked.
**Depends on:** Phase 2
**Requirements:** AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-04, AVAIL-07, LIFE-01
**Success Criteria** (what must be TRUE):

  1. After confirming the date, time, and participant snapshot, the planning author can publish a custom availability card in the chat.
  2. Every included participant can select “Can attend” or “Cannot attend,” while users outside the snapshot cannot submit an availability response.
  3. The availability card visibly shows each participant as pending, available, or unavailable and shows the overall response-completion state.
  4. When every included participant can attend, the chat receives a ready-to-book announcement and the planning author or an administrator can mark the rehearsal as manually booked.

**Plans:** 9/9 plans complete

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Migration, deploy preflight, and the end-to-end tracer: Confirm auto-publishes the availability card and one participant answers

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — Markers, legend, completion count, stable ordering, snapshot-membership refusal, and the bounded log vocabulary

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 03-03-PLAN.md — The BOOKED ripple across all five status filters, and `/plan_status` recovery for non-draft rounds

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 03-04-PLAN.md — The rate-limited ready-to-book announcement, its retraction, and the ready-state status re-post

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 03-05-PLAN.md — Mark as booked: the confirmation pair, author-or-administrator eligibility, the CONFIRMED→BOOKED transition, and round closure

**Wave 6** *(gap closure — blocked on Wave 5 completion)*

- [x] 03-06-PLAN.md — G-01 (BLOCKER): the 30-minute announcement window becomes a property of the notification, so `/plan_status` can no longer re-notify the band once a minute

**Wave 7** *(gap closure — blocked on Wave 6 completion)*

- [x] 03-07-PLAN.md — G-02, G-04, WR-06: ensure-then-mint the standing booking capability, a deterministic action order, a draft guard on the takeover mint, and one live confirmation pair per round

**Wave 8** *(gap closure — blocked on Wave 7 completion)*

- [x] 03-08-PLAN.md — G-03, WR-05, IN-02, IN-03: release the claim and strip the orphan when an announcement pointer cannot be recorded, and stop process memory deciding what a user and an operator observe

**Wave 9** *(gap closure — blocked on Wave 8 completion)*

- [x] 03-09-PLAN.md — WR-04, WR-07, IN-01, G-05: budget the callback alert in UTF-16 units, match migration catalogs as sets, and bring the requirement ledger in step

**UI hint:** yes

### Phase 4: Replanning and Rehearsal Lifecycle

**Goal:** The group can safely resolve conflicts and manage a rehearsal through change, cancellation, and completion.
**Depends on:** Phase 3
**Requirements:** AVAIL-05, AVAIL-06, AVAIL-08, LIFE-02, LIFE-03, LIFE-04, LIFE-05, LIFE-06
**Success Criteria** (what must be TRUE):

  1. A “Cannot attend” response closes that availability round and directs its planning author to choose a new date and time.
  2. Replanning starts a fresh availability round with all responses cleared and preserves the participant snapshot unless the author explicitly changes it; stale or superseded buttons receive a clear explanation and cannot alter the active round.
  3. The planning author or a chat administrator can change a rehearsal to begin a fresh availability round, or cancel an active or booked rehearsal and free its week for appropriate new planning.
  4. A manually booked rehearsal counts as scheduled for future target-week selection and, after its scheduled end, supplies the prior day, time, and participants used as future planning defaults.

**Plans:** TBD
**UI hint:** yes

### Phase 5: Proactive Reliable Reminders

**Goal:** The chat and outstanding participants receive only the reminders that are currently useful, even across duplicate updates and restarts.
**Depends on:** Phase 4
**Requirements:** REM-01, REM-02, REM-03, REM-04, REM-05, RELI-02, RELI-03
**Success Criteria** (what must be TRUE):

  1. When planning has not begun for its target week, the chat receives a Monday 10:00 reminder and daily 10:00 reminders until an active planning process exists.
  2. While availability is incomplete, follow-up reminders run at the chat’s configured times and mention only the participants who have not answered.
  3. Replanning, completion, cancellation, and other relevant state changes suppress reminders that are no longer applicable.
  4. Repeated Telegram updates or callbacks do not create duplicate plans, votes, transitions, or reminder records, and a restart or redeploy resumes outstanding relevant reminders without reviving obsolete ones.

**Plans:** TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Chat Readiness | 30/30 | Complete    | 2026-08-30 |
| 2. Weekly Rehearsal Proposal | 11/11 | Complete    | 2026-09-05 |
| 3. Availability and Booking Decision | 9/9 | Complete    | 2026-09-08 |
| 4. Replanning and Rehearsal Lifecycle | 0/TBD | Not started | - |
| 5. Proactive Reliable Reminders | 0/TBD | Not started | - |
