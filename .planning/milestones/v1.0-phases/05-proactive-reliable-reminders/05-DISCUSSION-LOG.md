# Phase 5: Proactive Reliable Reminders - Discussion Log

> Audit trail only. Research, planning and execution consume 05-CONTEXT.md instead.

**Date:** 2026-09-13
**Areas discussed:** Planning-start reminders; participant follow-ups; recovery after downtime; settings changes.

## Planning-start reminders

### When should reminders target next week after this week's rehearsal is agreed?

- Next Monday at 10:00 (recommended)
- The next day at 10:00, then daily
- The next 10:00 after the rehearsal ends, then daily

**User choice:** Next Monday at 10:00. Earlier manual planning remains available.

### When should planning-start reminders resume after cancellation frees the current week?

- The next 10:00 (recommended)
- Immediately after cancellation, then daily at 10:00
- Only next Monday

**User choice:** Only next Monday. Planning again this week remains a manual action.

### What should the planning-start reminder contain?

- Week and Start planning button, no mentions (recommended)
- Week and /plan command, no button or mentions
- Week, Start planning button, and mentions of the active roster

**User choice:** The target week and a Start planning button, with no mentions. The button checks the actor's current permissions.

### When should the first reminder run after initial setup midweek?

- The next 10:00 (recommended)
- Next Monday at 10:00
- Immediately after saving setup, then daily at 10:00

**User choice:** At the next 10:00, so this week's rehearsal can still be planned.

### Continue discussing planning-start reminders or move on?

- Move to participant follow-ups (recommended)
- Discuss an abandoned date-selection draft
- Discuss another planning-start case

**User choice:** Move to participant follow-ups.

## Participant follow-ups

### What should participant follow-ups contain?

- Date/time, mentions and card link (recommended)
- Date/time, mentions and answer buttons in reminder
- Short request, mentions and /plan_status

**User choice:** Rehearsal date and time, mentions of pending participants only, and a link to the current card. Answer buttons remain on the card.

### What happens when an unavailable answer blocks the slot?

- Pause while blocked, resume if viable (recommended)
- Continue until everyone answers or replanning starts
- Stop permanently for this round

**User choice:** Pause follow-ups while blocked. Resume at scheduled times if the negative answer changes and the slot becomes viable again.

### When do follow-ups stop if the rehearsal time arrives with answers pending?

- At rehearsal start (recommended)
- At rehearsal end
- Only on completion, cancellation or replanning

**User choice:** At the scheduled rehearsal start.

### Should a reminder run one minute after card publication?

- At least 30 minutes (recommended)
- Always follow the schedule
- At least two hours

**User choice:** Allow at least 30 minutes after publication. Skip scheduled occurrences within that period and wait for the next scheduled time.

### Continue participant follow-up discussion or move on?

- Move to downtime (recommended)
- Discuss intervals and daily count
- Discuss another participant reminder case

**User choice:** Move to recovery after downtime.

## Recovery after downtime

### How should a missed reminder be handled on recovery?

- Catch up within two hours (recommended)
- Wait for next scheduled occurrence
- Send one relevant reminder regardless of downtime duration

**User choice:** Send one currently relevant reminder if its scheduled time is no more than two hours ago, inclusive. Skip older occurrences.

### What if Telegram delivery outcome is unknown?

- Do not retry (recommended)
- Retry once within two hours
- Retry until confirmed within two hours

**User choice:** Do not retry that occurrence. Accept a possible missed reminder to avoid duplicates; subsequent scheduled occurrences remain eligible.

### What if the next scheduled reminder is less than 30 minutes after recovery catch-up?

- Wait for the imminent scheduled reminder (recommended)
- Send catch-up now and skip the imminent scheduled reminder
- Send both

**User choice:** Send the eligible missed reminder immediately and skip the next scheduled occurrence if it is less than 30 minutes later.

### Should the group receive a separate outage/recovery notice?

- No separate notice (recommended)
- Notify only when a reminder was permanently missed
- Notify after every restart

**User choice:** No separate group notice. Resume reminders under the agreed rules and record the cause in technical logs.

### Continue recovery discussion or move on?

- Move to settings changes (recommended)
- Discuss multi-day downtime or a week boundary
- Discuss another recovery case

**User choice:** Move to settings changes.

## Settings changes

### When does a changed reminder schedule apply?

- Immediately (recommended)
- Next day
- Next round

**User choice:** Immediately after saving, including the current round. Cancel future occurrences under the old schedule.

### Does adding a time already past today create a catch-up reminder?

- Future occurrences only (recommended)
- Catch up if within two hours
- Send immediately after every schedule change

**User choice:** No. Use only future occurrences under the new schedule; settings changes do not create missed occurrences.

### When does a changed chat timezone apply to reminders?

- Immediately, future only (recommended)
- Next day
- Next round

**User choice:** Immediately, using local wall-clock times in the new timezone, for future occurrences only.

### Does changing settings preserve a minimum interval after a reminder?

- 30 minutes (recommended)
- No minimum; new schedule wins
- Two hours

**User choice:** At least 30 minutes between reminders for the same round. Skip closer occurrences, including after settings changes.

### Continue settings discussion or summarize?

- Summarize decisions (recommended)
- Discuss daylight-saving gaps and overlaps
- Discuss another settings case

**User choice:** Proceed to the decision summary.

## Completion and interaction preferences

The user selected all four areas, reviewed the summary, and authorized writing the context with an instruction to proceed. Discussion was conducted in Ukrainian after the user corrected the initial Russian response. The user requested interactive buttons with three options, one recommended. Alternatives above are English translations for the project documentation.

## Agent discretion

No additional product policies were explicitly delegated. Implementation and unasked edge cases are identified as research responsibilities in CONTEXT.md, not user decisions.

## Deferred ideas

None.
