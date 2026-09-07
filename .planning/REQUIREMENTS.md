# Requirements: GSMBot

**Defined:** 2026-08-19
**Core Value:** The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.

## v1 Requirements

### Chat Configuration

- [x] **CONF-01**: A chat administrator can initialize the bot with an IANA time zone.
- [x] **CONF-02**: A chat administrator can configure the default rehearsal weekday and start time.
- [x] **CONF-03**: A chat administrator can configure the rehearsal duration and daily time boundaries used to generate slots.
- [x] **CONF-04**: Time slots are generated in one-hour increments and never extend beyond the configured daily boundary.
- [x] **CONF-05**: A chat administrator can configure availability-reminder times, defaulting to 10:00 and 16:00.

### Roster and Authorization

- [x] **ROST-01**: A chat administrator can add identifiable Telegram users to the persistent band roster.
- [x] **ROST-02**: A chat administrator can remove users from the band roster.
- [x] **ROST-03**: A chat administrator can view the current band roster.
- [x] **AUTH-01**: A chat administrator can choose whether planning may be started by administrators, previous-poll participants, or anyone in the chat.
- [x] **AUTH-02**: The bot revalidates the user's current permission before every protected action.
- [x] **AUTH-03**: A chat administrator can take ownership of an abandoned active planning process.

### Rehearsal Planning

- [x] **PLAN-01**: An authorized user can start rehearsal planning in the group chat.
- [x] **PLAN-02**: The bot permits only one active planning process per chat and target calendar week.
- [x] **PLAN-03**: Planning targets the current Monday–Sunday week when no rehearsal has occurred or been scheduled in it; otherwise it targets the next week.
- [x] **PLAN-04**: The planning author can select from every day in the target Monday–Sunday week.
- [x] **PLAN-05**: The day selector highlights the configured default day and previous rehearsal day, showing only the default highlight when they match.
- [x] **PLAN-06**: The planning author can select a valid generated time slot.
- [x] **PLAN-07**: The time selector highlights the configured default time and previous rehearsal time, showing only the default highlight when they match.
- [x] **PLAN-08**: A new plan takes a participant snapshot of the chat's currently active band roster at confirm time; the active roster is the lineup.
- [x] **PLAN-09**: *(Removed from v1 Phase 2 scope by D-09 — retained for traceability, not deleted.)* Per-round participant adjustment is not delivered in Phase 2. Participant changes are made through roster management instead: ROST-01 (add) and ROST-02 (remove), both delivered in Phase 1.
- [x] **PLAN-10**: A user can request the current planning status and recover the active interaction after messages, restarts, or interruptions.

### Availability

- [x] **AVAIL-01**: The planning author can publish a custom availability card for the confirmed date, time, and participant snapshot.
- [x] **AVAIL-02**: An included participant can answer “Can attend” or “Cannot attend.”
- [x] **AVAIL-03**: The bot rejects availability responses from users who are not included in the active participant snapshot.
- [x] **AVAIL-04**: The availability card shows every participant as pending, available, or unavailable and displays overall completion.
- [ ] **AVAIL-05**: A “Cannot attend” response closes the current round and prompts its planning author to select a new date and time.
- [ ] **AVAIL-06**: Replanning creates a new availability round with all responses reset and the participant snapshot preserved unless explicitly changed.
- [x] **AVAIL-07**: When all included participants answer “Can attend,” the bot announces that the rehearsal is ready to book.
- [ ] **AVAIL-08**: A stale or superseded button cannot mutate the active round and receives a clear explanatory response.

### Reminders

- [ ] **REM-01**: If weekly planning has not started, the bot reminds the chat on Monday at 10:00 and daily at 10:00 until it starts.
- [ ] **REM-02**: Planning-start reminders stop as soon as an active planning process exists for the target week.
- [ ] **REM-03**: While availability is incomplete, the bot sends follow-ups at the chat's configured reminder times.
- [ ] **REM-04**: Each availability follow-up mentions only participants who have not answered.
- [ ] **REM-05**: The bot suppresses obsolete reminders after replanning, completion, cancellation, or another relevant state change.

### Rehearsal Lifecycle

- [x] **LIFE-01**: The planning author or a chat administrator can mark a ready rehearsal as manually booked.
- [ ] **LIFE-02**: A manually booked rehearsal counts as scheduled when the bot chooses the target week for future planning.
- [ ] **LIFE-03**: The planning author or a chat administrator can cancel an active or booked rehearsal.
- [ ] **LIFE-04**: The planning author or a chat administrator can change a rehearsal's date or time and start a fresh availability round.
- [ ] **LIFE-05**: After a booked rehearsal's scheduled end, it becomes the previous rehearsal used for future day, time, and participant defaults.
- [ ] **LIFE-06**: Cancelling a rehearsal releases its week so a new planning process can be started when appropriate.

### Reliability

- [x] **RELI-01**: Active planning, roster, settings, responses, and reminder state survive bot restarts.
- [ ] **RELI-02**: Repeated Telegram updates or button callbacks do not create duplicate plans, votes, transitions, or reminder records.
- [ ] **RELI-03**: Restarting or redeploying the bot resumes outstanding reminders without reviving obsolete ones.

## v2 Requirements

### Automatic Booking

- **BOOK-01**: An authorized user can start studio booking from a ready rehearsal.
- **BOOK-02**: The bot can check available studio slots through a provider-specific integration.
- **BOOK-03**: The bot can submit a booking through an isolated Playwright-based worker.
- **BOOK-04**: The bot records booking attempts and requires human review when the external result is uncertain.
- **BOOK-05**: Booking credentials and browser state are stored separately from the rehearsal-planning domain.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiple active planning processes for the same chat and week | The initial workflow requires one authoritative rehearsal plan per week. |
| Native Telegram Polls | They cannot enforce the required roster, per-user status, targeted reminders, and versioned replanning behavior. |
| Automatic enumeration of every Telegram chat member | Telegram does not expose a reliable complete member list to bots; administrators maintain the band roster. |
| Calendar and external free/busy synchronization | It is not needed to validate group coordination and would add account integrations. |
| Guaranteed direct-message reminders | Bots cannot initiate a private conversation with users who have not started one. |
| Multi-option availability optimization | v1 deliberately proposes one slot at a time and replans after a negative response. |
| Automatic studio booking in the first milestone | Booking is a separate provider-specific milestone with credentials and irreversible external effects. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONF-01 | Phase 1 | Complete |
| CONF-02 | Phase 1 | Complete |
| CONF-03 | Phase 1 | Complete |
| CONF-04 | Phase 2 | Complete |
| CONF-05 | Phase 1 | Complete |
| ROST-01 | Phase 1 | Complete |
| ROST-02 | Phase 1 | Complete |
| ROST-03 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 2 | Complete |
| PLAN-01 | Phase 2 | Complete |
| PLAN-02 | Phase 2 | Complete |
| PLAN-03 | Phase 2 | Complete |
| PLAN-04 | Phase 2 | Complete |
| PLAN-05 | Phase 2 | Complete |
| PLAN-06 | Phase 2 | Complete |
| PLAN-07 | Phase 2 | Complete |
| PLAN-08 | Phase 2 | Complete |
| PLAN-09 | Phase 2 | Complete |
| PLAN-10 | Phase 2 | Complete |
| AVAIL-01 | Phase 3 | Complete |
| AVAIL-02 | Phase 3 | Complete |
| AVAIL-03 | Phase 3 | Complete |
| AVAIL-04 | Phase 3 | Complete |
| AVAIL-05 | Phase 4 | Pending |
| AVAIL-06 | Phase 4 | Pending |
| AVAIL-07 | Phase 3 | Complete |
| AVAIL-08 | Phase 4 | Pending |
| REM-01 | Phase 5 | Pending |
| REM-02 | Phase 5 | Pending |
| REM-03 | Phase 5 | Pending |
| REM-04 | Phase 5 | Pending |
| REM-05 | Phase 5 | Pending |
| LIFE-01 | Phase 3 | Complete |
| LIFE-02 | Phase 4 | Pending |
| LIFE-03 | Phase 4 | Pending |
| LIFE-04 | Phase 4 | Pending |
| LIFE-05 | Phase 4 | Pending |
| LIFE-06 | Phase 4 | Pending |
| RELI-01 | Phase 2 | Complete |
| RELI-02 | Phase 5 | Pending |
| RELI-03 | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 43 total
- Mapped to phases: 43
- Unmapped: 0

---
*Requirements defined: 2026-08-19*
*Last updated: 2026-08-19 after roadmap creation*
