# Roadmap: GSMBot

## Overview

GSMBot v1 delivers a complete Telegram-based rehearsal-coordination loop: administrators prepare a chat, an authorized member proposes a week-aware rehearsal, the selected band members confirm availability, and the group reaches a clear ready-to-book result. The final phase adds the durable, state-aware reminders that remove manual chasing. Automatic studio booking remains a later milestone.

## Phases

**Phase Numbering:**

- Integer phases are planned milestone work.
- Decimal phases are urgent insertions, if needed.

- [ ] **Phase 1: Chat Readiness** - Administrators configure a persistent, access-controlled planning space.
- [ ] **Phase 2: Weekly Rehearsal Proposal** - An authorized planner selects a recoverable date, time, and participant set for the correct week.
- [ ] **Phase 3: Availability and Booking Decision** - Participants confirm one proposal and the group can record it as manually booked.
- [ ] **Phase 4: Replanning and Rehearsal Lifecycle** - The group safely recovers from conflicts, changes, cancellation, and completed rehearsals.
- [ ] **Phase 5: Proactive Reliable Reminders** - State-aware reminders prompt planning and outstanding participants without duplicate or obsolete messages.

## Phase Details

### Phase 1: Chat Readiness

**Goal:** Administrators can prepare a persistent, access-controlled chat for rehearsal coordination.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** CONF-01, CONF-02, CONF-03, CONF-05, ROST-01, ROST-02, ROST-03, AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):

  1. A chat administrator can initialize the bot with an IANA time zone and configure the default rehearsal day, start time, duration, time boundaries, and availability-reminder times.
  2. A chat administrator can add identifiable Telegram users to the band roster, remove them, and view the current roster.
  3. A chat administrator can choose whether administrators, previous-poll participants, or anyone may start planning.
  4. A user who no longer has the required current permission cannot perform a protected configuration, roster, or planning-policy action.

**Plans:** 22/27 plans executed (15 original, 7 prior gap closure, 5 current gap closure from the latest UAT evidence)

Plans:

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

- [ ] 01-23-PLAN.md — Route expired settings text/location edits to exact settings-specific expiry feedback without bypassing authorization or deleting unrelated durable state (F-10 / window 14).
- [ ] 01-24-PLAN.md — Make `/setup` on a configured chat start or resume the exact setup step instead of emitting the unconfigured readiness prompt (F-11 / window 15).
- [ ] 01-25-PLAN.md — Repair the composed planning-access regression and pin invalid policy selection as fail-soft and non-mutating (windows 2 and 3).

**Wave 24** *(blocked on all Wave 23 plans)*

- [ ] 01-26-PLAN.md — Run the complete automated closure gate, disposition windows 2/3/14/15 with evidence, and publish the English Run 3 protocol.

**Wave 25** *(blocked on Wave 24; contains the final human Telegram checkpoint)*

- [ ] 01-27-PLAN.md — Execute Run 3 in Telegram and reconcile UAT, windows, and D5 strictly to the explicit human verdict.

**UI hint:** yes

### Phase 2: Weekly Rehearsal Proposal

**Goal:** An authorized planner can create and recover a single, week-aware rehearsal proposal with the right defaults.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** CONF-04, AUTH-03, PLAN-01, PLAN-02, PLAN-03, PLAN-04, PLAN-05, PLAN-06, PLAN-07, PLAN-08, PLAN-09, PLAN-10, RELI-01
**Success Criteria** (what must be TRUE):

  1. An authorized user can start planning, while the chat has no more than one active process for the same target calendar week; an administrator can take over an abandoned process.
  2. The bot targets the current Monday–Sunday week when it has no rehearsal or scheduled rehearsal, otherwise the next week.
  3. The planning author can choose any day in the target week and sees the configured default day and previous-rehearsal day highlighted correctly.
  4. The planning author can choose a valid hourly time slot within the chat’s configured boundaries and sees the configured default time and previous-rehearsal time highlighted correctly.
  5. A new proposal starts from the previous confirmed participants, lets the author adjust them from the roster, and can be recovered with a status request after an interruption or bot restart.

**Plans:** TBD
**UI hint:** yes

### Phase 3: Availability and Booking Decision

**Goal:** The selected band members can confirm a proposed rehearsal and the group can mark a unanimous result as manually booked.
**Mode:** mvp
**Depends on:** Phase 2
**Requirements:** AVAIL-01, AVAIL-02, AVAIL-03, AVAIL-04, AVAIL-07, LIFE-01
**Success Criteria** (what must be TRUE):

  1. After confirming the date, time, and participant snapshot, the planning author can publish a custom availability card in the chat.
  2. Every included participant can select “Can attend” or “Cannot attend,” while users outside the snapshot cannot submit an availability response.
  3. The availability card visibly shows each participant as pending, available, or unavailable and shows the overall response-completion state.
  4. When every included participant can attend, the chat receives a ready-to-book announcement and the planning author or an administrator can mark the rehearsal as manually booked.

**Plans:** TBD
**UI hint:** yes

### Phase 4: Replanning and Rehearsal Lifecycle

**Goal:** The group can safely resolve conflicts and manage a rehearsal through change, cancellation, and completion.
**Mode:** mvp
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
**Mode:** mvp
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
| 1. Chat Readiness | 22/22 | In Progress|  |
| 2. Weekly Rehearsal Proposal | 0/TBD | Not started | - |
| 3. Availability and Booking Decision | 0/TBD | Not started | - |
| 4. Replanning and Rehearsal Lifecycle | 0/TBD | Not started | - |
| 5. Proactive Reliable Reminders | 0/TBD | Not started | - |
