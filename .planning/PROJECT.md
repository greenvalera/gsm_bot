# GSMBot

## What This Is

A Telegram bot for a music band's group chat that coordinates weekly rehearsal planning. It reminds the group to start planning, helps select a date and time, collects individual availability responses, follows up with non-responders, and announces when the rehearsal is ready to book.

## Core Value

The band can agree on a rehearsal date and time that works for everyone without manually chasing members for answers.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] The bot maintains no more than one active planning process per chat for a calendar week.
- [ ] If planning has not started for the target week, the bot reminds the chat on Monday at 10:00 and then daily at 10:00 until planning begins.
- [ ] Each chat can choose who may start planning: administrators only, members of the previous poll, or anyone in the chat.
- [ ] Administrators maintain a persistent band-member roster for the chat.
- [ ] A new poll includes the previous rehearsal's participants by default; its participant list can be adjusted from the band roster before publication.
- [ ] Planning displays every day in the target calendar week, Monday through Sunday, and highlights the configured default day and the previous rehearsal's day.
- [ ] If the configured default day matches the previous rehearsal's day, only the default highlight is shown.
- [ ] If no rehearsal has occurred or been scheduled in the current week, planning targets the current week; otherwise it targets the next week.
- [ ] The bot generates time slots in one-hour increments within configured boundaries; the defaults are 10:00–21:00 and a two-hour rehearsal duration.
- [ ] Each chat can configure its time boundaries, rehearsal duration, default day, and default time.
- [ ] The time list highlights the configured default time and the previous rehearsal's time; if they match, only the default highlight is shown.
- [ ] After the date, time, and participants are confirmed, the bot publishes a custom availability card showing each participant's status with “Can attend” and “Cannot attend” buttons.
- [ ] Only participants included in the availability card can respond.
- [ ] The bot displays the current response completion state and mentions specific participants who have not responded.
- [ ] Follow-up reminder times are configurable per chat; the defaults are 10:00 and 16:00 each day.
- [ ] When a participant selects “Cannot attend,” the current planning author immediately chooses a new date and time, all previous answers are cleared, and availability is collected again.
- [ ] When every participant selects “Can attend,” the bot announces that everyone is available and the rehearsal should be booked.
- [ ] An authorized user can cancel a scheduled rehearsal or change its date and time, triggering a new availability round.

### Out of Scope

- Automatic studio booking through a website — this is a separate major feature for a later milestone after the planning workflow is stable.
- Multiple simultaneous planning processes in one chat for the same week — the initial use case needs only one.
- Native Telegram Polls — they do not provide the required control over participants, individual statuses, and targeted reminders; the bot uses a custom message with inline buttons.

## Context

- Rehearsal coordination currently happens in the band's Telegram chat and requires manual reminders and response tracking.
- Poll participants are not the entire chat. They come from an administrator-managed band roster, with the previous rehearsal's participants used as the default selection.
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
*Last updated: 2026-08-19 after initialization*
