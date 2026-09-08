# GSMBot

## What This Is

A Telegram bot for a music band's group chat that coordinates weekly rehearsal planning. It reminds the group to start planning, helps select a date and time, collects individual availability responses, follows up with non-responders, and announces when the rehearsal is ready to book.

## Core Value

The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.

## Requirements

### Validated

- ✓ After the date, time, and participants are confirmed, the bot publishes a custom availability card showing each participant's status with “Can attend” and “Cannot attend” buttons. — Phase 3 (AVAIL-01, AVAIL-02, AVAIL-04)
- ✓ Only participants included in the availability card can respond. — Phase 3 (AVAIL-03)
- ✓ When every participant selects “Can attend,” the bot announces that everyone is available and the rehearsal should be booked. — Phase 3 (AVAIL-07, LIFE-01)

### Active

- [ ] The bot maintains no more than one active planning process per chat for a calendar week.
- [ ] If planning has not started for the target week, the bot reminds the chat on Monday at 10:00 and then daily at 10:00 until planning begins.
- [ ] Each chat can choose who may start planning: administrators only, members of the previous poll, or anyone in the chat.
- [ ] Administrators maintain a persistent band-member roster for the chat.
- [ ] A new poll includes the chat's currently active band roster; the lineup is changed by changing the roster, not per poll.
- [ ] Planning displays every day in the target calendar week, Monday through Sunday, and highlights the configured default day and the previous rehearsal's day.
- [ ] If the configured default day matches the previous rehearsal's day, only the default highlight is shown.
- [ ] If no rehearsal has occurred or been scheduled in the current week, planning targets the current week; otherwise it targets the next week.
- [ ] The bot generates time slots in one-hour increments within configured boundaries; the defaults are 10:00–21:00 and a two-hour rehearsal duration.
- [ ] Each chat can configure its time boundaries, rehearsal duration, default day, and default time.
- [ ] The time list highlights the configured default time and the previous rehearsal's time; if they match, only the default highlight is shown.
- [ ] The bot displays the current response completion state and mentions specific participants who have not responded.
- [ ] Follow-up reminder times are configurable per chat; the defaults are 10:00 and 16:00 each day.
- [ ] When a participant selects “Cannot attend,” the current planning author immediately chooses a new date and time, all previous answers are cleared, and availability is collected again.
- [ ] An authorized user can cancel a scheduled rehearsal or change its date and time, triggering a new availability round.

### Out of Scope

- Automatic studio booking through a website — this is a separate major feature for a later milestone after the planning workflow is stable.
- Multiple simultaneous planning processes in one chat for the same week — the initial use case needs only one.
- Native Telegram Polls — they do not provide the required control over participants, individual statuses, and targeted reminders; the bot uses a custom message with inline buttons.

## Context

- Rehearsal coordination currently happens in the band's Telegram chat and requires manual reminders and response tracking.
- Poll participants are not the entire chat. They come from an administrator-managed band roster.
- Date selection follows calendar weeks from Monday through Sunday.
- A later booking milestone may automate a rehearsal studio's website with Playwright or a similar browser automation tool.
- Project planning and implementation may be performed from either Codex or Claude Code.

## Constraints

- **Platform**: Telegram group chat — all primary interactions must work without a separate client application.
- **Scheduling**: Reminder timing and generated time slots depend on per-chat settings.
- **Participation**: Availability collection operates on a persistent administrator-managed band roster.
- **Scope**: The first release completes coordination by announcing readiness to book; it does not automate booking.
- **Agent runtime portability**: Project instructions, scripts, and planning documentation must remain usable from both Codex and Claude Code and must not depend on a single agent runtime.
- **Documentation language**: All project and planning documentation must be written in English.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One active process per chat and week | This matches the band's rehearsal cadence and keeps scheduling state unambiguous | — Pending |
| Custom availability card instead of Telegram Poll | Individual participants, visible statuses, response control, and targeted reminders are required | — Pending |
| Persistent band-member roster | A Telegram chat may contain people who should not be included in rehearsal planning | — Pending |
| A negative response triggers replanning by the planning author | The workflow must find a slot that works for everyone | — Pending |
| Automatic booking is deferred | It is a separate complex integration and is not required to validate the planning workflow | — Pending |
| Support both Codex and Claude Code | The project should remain executable across the user's preferred agent runtimes | — Pending |
| A round owns TWO live messages, not one | Phase 2's anchor discipline kept exactly one live card. The ready-to-book announcement has to be a NEW message so the group is notified, while the availability card must stay editable in place. D-17 keeps `anchorMessageId` on the card and adds `announcementMessageId` for the announcement, each with its own re-post slot | Implemented in plans 03-04 and 03-05 |
| Unanimity is claimed atomically before the announcement is sent | Two participants answering at once, or an un-role-gated `/plan_status`, could each observe a complete lineup and each notify the band. One `updateMany` compare-and-set on `readyAnnouncedAt` — with the cooldown window in the WHERE clause — makes the notification exactly-once per window; the claim is durable BEFORE the send so a Telegram outage cannot be replayed into a second notification | Closed gap G-01; implemented in plans 03-04 and 03-06 |
| Booking eligibility is re-decided inside the apply transaction, never carried on the wire | A rendered control is a convenience, never authority. The role is resolved at both request and apply time and evaluated against `PlanningRound.authorUserId`, and unanimity is re-derived from the participant rows on apply, so a demotion or a flipped answer between opening the confirmation and confirming refuses the booking | Implemented in plan 03-05 |
| The confirm/keep pair is deliberately actor-unbound | D-19 lets a second eligible person complete a confirmation the author opened. The token grants only the right to attempt; the authorization decision lives entirely in the apply-time re-check, the same property the answer tokens have | Accepted risk R-03-02 in 03-SECURITY.md |
| Callback alert budgets are measured in UTF-16 code units | Telegram counts `answerCallbackQuery` text in UTF-16 code units. Measuring a display name in any other unit lets an astral-plane name satisfy the budget and still be rejected on the wire, which would break the alert for every other member of the chat | Implemented in plan 03-09 |
| A callback is acknowledged exactly once per `callback_query.id`, and the acknowledgement is deferred to the branch that owns the outcome, with a boundary-level fallback when no branch chose a text | Telegram honours only the first answer per `callback_query.id` and silently discards every later one, so acknowledging bare and up front spent the single answer slot and made every denial, stale and duplicate alert unreachable. Deferring it makes the alert text the answer Telegram honours, while the fallback still dismisses the client's progress indicator. The fresh current-role lookup continues to precede every token parse and durable read, and unavailable membership evidence still denies access fail-closed | Supersedes "protected callbacks acknowledge before a live role lookup" — implemented in plan 01-16 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-08 after Phase 3*
