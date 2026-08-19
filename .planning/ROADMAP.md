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
**Plans:** 11 plans

Plans:
- [ ] 01-01-PLAN.md — Audit and human-approve the exact Phase 1 dependency set before installation.
- [ ] 01-02-PLAN.md — Prove the migration-first `/setup` tracer through live authorization, PostgreSQL, and Telegram.
- [ ] 01-03-PLAN.md — Add strict tooling, deterministic formatting, test seams, and reproducible Docker/Compose runtime.
- [ ] 01-04-PLAN.md — Deliver resumable authorized setup through explicit location-derived timezone confirmation.
- [ ] 01-05-PLAN.md — Collect and validate schedule, reminder, and planning-access setup values.
- [ ] 01-06-PLAN.md — Review and atomically activate the complete configuration with restart/failure coverage.
- [ ] 01-07-PLAN.md — Introduce the committed settings dashboard, planning-access edit, and policy evaluator.
- [ ] 01-08-PLAN.md — Complete every settings edit and harden authorization/read-failure projections.
- [ ] 01-09-PLAN.md — Deliver migrated reply-anchored roster persistence and initiator-bound confirmed removal.
- [ ] 01-10-PLAN.md — Harden roster identity, pagination, Unicode, delay, failure, and retry projections.
- [ ] 01-11-PLAN.md — Integrate every route, enforce format/CI/observability gates, and verify the live Telegram flow.
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
| 1. Chat Readiness | 0/11 | Planned | - |
| 2. Weekly Rehearsal Proposal | 0/TBD | Not started | - |
| 3. Availability and Booking Decision | 0/TBD | Not started | - |
| 4. Replanning and Rehearsal Lifecycle | 0/TBD | Not started | - |
| 5. Proactive Reliable Reminders | 0/TBD | Not started | - |
