import { formatPlanningDuration } from "./planning-format.js";
import type { MessageCatalog } from "./index.js";

export const en = {
  "migration.upgraded": () =>
    "This group was upgraded. Open /plan_status in the supergroup.",
  "reminder.planning.body": ({ weekRange }) =>
    `Plan rehearsal for ${weekRange}.`,
  "reminder.planning.start": () => "Start planning",
  "reminder.followup.heading": ({
    date,
    startTime,
    timezone,
    durationMinutes,
  }) =>
    `Rehearsal ${date} at ${startTime} (${timezone}), ${durationMinutes} minutes.`,
  "reminder.followup.pending": ({ mentions }) =>
    `Still waiting for: ${mentions}.`,
  "reminder.followup.link": () => "Open availability card",
  "reminder.followup.basicInstruction": () =>
    "Open the replied-to availability card to answer.",
  "reminder.followup.basicRecovery": () => "Use /plan_status to bring it back.",
  "planning.feedback.replanDenied": () =>
    "Only the planning author or a current chat administrator can replan this slot.",
  "planning.feedback.replanEmptyRoster": () =>
    "Add someone to the band roster before replanning.",
  "planning.feedback.ownerOnly": ({ label }) =>
    `Only ${label} can use this card's buttons — they started this plan.`,
  "planning.feedback.denied": () =>
    "Only people this chat's planning access setting allows can start a rehearsal plan.",
  "planning.feedback.notConfigured": () =>
    "This chat isn't set up for rehearsals yet. Send /setup first, then try /plan again.",
  "planning.feedback.statusDenied": () =>
    "Only people in this chat can check the rehearsal plan.",
  "planning.feedback.nonMember": () =>
    "Only people in this chat can use this rehearsal card.",
  "planning.feedback.noRound": () =>
    "Nobody is planning a rehearsal right now. Send /plan to start one.",
  "planning.feedback.weekTaken": () =>
    "Someone is already planning this week's rehearsal. Ask them to finish, or try again later.",
  "planning.feedback.noFreeWeek": () =>
    "Every week ahead already has a confirmed rehearsal. There is nothing left to plan yet.",
  "planning.feedback.startFailed": () =>
    "I couldn't start the rehearsal plan. Please try again.",
  "planning.feedback.stale": () =>
    "This planning action is no longer available. Send /plan to start again.",
  "planning.feedback.replanned": () =>
    "This slot was replanned. Send /plan_status to find the current card.",
  "planning.feedback.cancelled": () => "This rehearsal was cancelled.",
  "planning.feedback.changeDenied": () =>
    "Only the planning author or a current chat administrator can change this rehearsal.",
  "planning.feedback.cancelDenied": () =>
    "Only the planning author or a current chat administrator can cancel this rehearsal.",
  "planning.feedback.pastDay": () =>
    "That day has already passed. Pick one of the days still ahead.",
  "planning.feedback.pastTime": () =>
    "That time has already passed. Pick one of the hours still ahead.",
  "planning.feedback.nonexistentTime": () =>
    "That hour doesn't exist on that day — the clocks change. Pick another one.",
  "planning.feedback.emptyRoster": () =>
    "Nobody is on the band roster yet. Reply to a member's message with /roster_add, then confirm again.",
  "planning.feedback.takeoverActive": () =>
    "This plan is still active. You can take it over only after its author has been quiet for a while.",
  "planning.feedback.takeoverDenied": () =>
    "Only a chat administrator can take over someone else's rehearsal plan.",
  "planning.feedback.notParticipant": () =>
    "This rehearsal is asking the people who were on the band roster when it was confirmed. You aren't one of them, so there's nothing here for you to answer.",
  "planning.feedback.booked": () =>
    "This rehearsal is already booked, so availability answers are closed.",
  "planning.feedback.bookingDenied": () =>
    "Only the person who started this plan, or a chat administrator, can mark this rehearsal as booked.",
  "planning.feedback.unanimityLost": () =>
    "Someone can no longer make this slot, so it can't be booked. The availability card above has the current answers.",
  "planning.feedback.confirmationRecovery": () =>
    "The confirmation could not be opened. Send /plan_status to recover the current rehearsal, then try again.",
  "planning.feedback.reminderStale": () =>
    "This reminder is no longer current. Use /plan_status to view the rehearsal plan.",
  "planning.feedback.noCancel": () => "There is no rehearsal to cancel.",
  "planning.feedback.noChange": () => "There is no rehearsal to change.",
  "planning.feedback.cancelUnavailable": () =>
    "This rehearsal is no longer available to cancel.",
  "planning.feedback.changeUnavailable": () =>
    "This rehearsal is no longer available to change.",
  "planning.feedback.changeEmptyRoster": () =>
    "Add someone to the band roster before changing the slot.",
  "planning.lifecycle.plan": () => `the rehearsal plan`,
  "planning.lifecycle.previous": () => `The previous planning attempt`,
  "planning.lifecycle.slot": ({ value, time }) => `${value} at ${time}`,
  "planning.lifecycle.retired": ({ value }) =>
    `<b>Earlier message — ${value}</b>\nThis copy is no longer current. Use /plan_status to find the current rehearsal details.`,
  "planning.lifecycle.cancelPrompt": ({ value }) =>
    `Cancel ${value}?\nThe rehearsal will be called off.`,
  "planning.lifecycle.changePrompt": ({ value }) =>
    `Change ${value}?\nEveryone will answer again within the same week. To plan another week, cancel first and send /plan.`,
  "planning.lifecycle.cancelledHeading": ({ value }) =>
    `<b>Cancelled — ${value}</b>`,
  "planning.lifecycle.superseded": ({ value }) =>
    `${value} was replanned. See /plan_status for the current plan.`,
  "planning.lifecycle.blockedHeading": ({ value }) =>
    `<b>This slot does not work — ${value}</b>`,
  "planning.lifecycle.blocked": () =>
    `The planning author or a chat administrator can use Replan to choose a new slot.`,
  "planning.lifecycle.readyHeading": ({ value }) =>
    `<b>Ready to book — ${value}</b>`,
  "planning.lifecycle.readyMembers": () =>
    `<b>Everyone who was asked can make it:</b>`,
  "planning.lifecycle.ready": () => `Time to book the rehearsal.`,
  "planning.lifecycle.retractedHeading": ({ value }) =>
    `<b>Still collecting answers — ${value}</b>`,
  "planning.lifecycle.retracted": () =>
    `The earlier announcement no longer stands. Please answer on the availability card.`,
  "planning.lifecycle.bookedHeading": ({ value }) =>
    `<b>Rehearsal booked — ${value}</b>`,
  "planning.lifecycle.booked": () => `The band has this slot.`,
  "planning.lifecycle.bookingHeading": ({ value }) =>
    `<b>Mark this rehearsal as booked — ${value}</b>`,
  "planning.lifecycle.bookingQuestion": () =>
    `Only confirm if the band has already booked this slot with the studio.`,
  "planning.lifecycle.bookingEffect": () =>
    `Recording it marks this rehearsal as booked.`,
  "planning.lifecycle.bookRequest": () => `Mark as booked`,
  "planning.lifecycle.bookApply": () => `Yes, it's booked`,
  "planning.lifecycle.bookKeep": () => `Not yet`,
  "planning.lifecycle.cancelRequest": () => `✕ Cancel rehearsal`,
  "planning.lifecycle.cancelApply": () => `Yes, cancel it`,
  "planning.lifecycle.cancelKeep": () => `Keep rehearsal`,
  "planning.lifecycle.changeRequest": () => `↻ Change date or time`,
  "planning.lifecycle.changeApply": () => `Yes, choose a new slot`,
  "planning.lifecycle.changeKeep": () => `Keep this slot`,
  "planning.dayHeading": ({ value }) =>
    `<b>Plan a rehearsal — week of ${value}</b>`,
  "planning.timeHeading": ({ value }) => `<b>Plan a rehearsal — ${value}</b>`,
  "planning.reviewHeading": ({ value }) =>
    `<b>Confirm the rehearsal — ${value}</b>`,
  "planning.availabilityHeading": ({ value }) =>
    `<b>Rehearsal confirmed — ${value}</b>`,
  "planning.cancelledHeading": ({ value }) =>
    `<b>Rehearsal cancelled — ${value}</b>`,
  "planning.owner": ({ label }) => `Planned by ${label}.`,
  "planning.lineup": ({ total }) =>
    total === 0
      ? "<b>Nobody is on the band roster yet.</b> Add members with /roster_add before confirming."
      : total === 1
        ? "<b>Asking this band member:</b>"
        : `<b>Asking these ${total} band members:</b>`,
  "planning.reviewInstructions": ({ total }) =>
    total === 1
      ? "Confirming commits the rehearsal and starts the availability round, where they answer whether they can make it."
      : "Confirming commits the rehearsal and starts the availability round, where each of them answers whether they can make it.",
  "planning.answered": ({ value, total }) =>
    `<b>Answered ${value} of ${total}.</b>`,
  "planning.unavailableMembers": ({ label }) => `Cannot attend: ${label}.`,
  "planning.chooseDay": () => "Choose a day.",
  "planning.chooseTime": () => "Choose a start time.",
  "planning.emptyWindow": () =>
    "No rehearsal fits inside this chat's daily window. Adjust it with /settings.",
  "planning.legend.dayDefault": () => "⭐ usual day",
  "planning.legend.previous": () => "🔁 last rehearsal",
  "planning.legend.past": () => "🚫 already past",
  "planning.legend.timeDefault": () => "⭐ usual time",
  "planning.legend.unavailable": () => "🚫 unavailable",
  "planning.legend.chosen": () => "✅ your current choice",
  "planning.legend.pending": () => "⬜ no answer yet",
  "planning.legend.available": () => "👍 can attend",
  "planning.legend.cannotAttend": () => "👎 cannot attend",
  "planning.outcome.collecting": () => "Answers are still coming in.",
  "planning.outcome.all-available": () => "Everyone can make it.",
  "planning.outcome.blocked": () =>
    "This slot doesn't work for the whole band.",
  "planning.booked": () => "This rehearsal is booked.",
  "planning.cancelled": () => "This rehearsal was cancelled.",
  "planning.control.back": () => "Back",
  "planning.control.confirm": () => "Confirm rehearsal",
  "planning.control.takeover": () => "Take over this plan",
  "planning.control.available": () => "👍 Can attend",
  "planning.control.unavailable": () => "👎 Cannot attend",
  "planning.control.replan": () => "↻ Replan",
  "planning.applied": () => "Already applied.",
  "planning.retrySafe": () => "I couldn't save that change. Please try again.",
  "planning.savedRecovery": () =>
    "The change was saved, but the card could not be updated. Use /plan_status to recover the current plan.",
  "language.failure": () => "I couldn't save the language. Please try again.",
  "language.stale": () =>
    "This action is no longer available. Open /settings or /setup and try again.",
  "callback.denied": () => "Only current chat administrators can do that.",
  "language.select": () => "Choose this chat's language.",
  "language.row": () => "Language: English",
  "language.changed": () => "Language changed to English.",
  "language.entry": () => "Мова / Language",
  "language.english": () => "English",
  "language.ukrainian": () => "Українська",
  "timezone.title": () => "Time zone",
  "timezone.intro": () =>
    "Reply to this message with a location to choose this chat's time zone.",
  "timezone.loading": () => "Looking up time zone…",
  "timezone.failure": () =>
    "I couldn't determine a time zone from that location. Send a more precise location or another location in this group.",
  "timezone.another": () => "Send another location",
  "setup.review": () => "<b>Review configuration</b>",
  "setup.saved": () => "<b>Chat configuration saved</b>",
  "setup.entry": () =>
    "<b>Set up rehearsal planning</b>\nThis chat is not configured yet.",
  "setup.start": () => "Start setup",
  "setup.continue": () => "Continue setup",
  "setup.cancelled": () => "Setup cancelled.",
  "setup.stale": () =>
    "This setup action is no longer available. Send /setup to start again.",
  "setup.expired": () =>
    "This setup expired after 30 minutes of inactivity. Send /setup to start again.",
  "input.time": () => "Use 24-hour time in HH:MM format, for example 19:30.",
  "input.duration": () =>
    "Send a positive whole number of minutes, for example 120.",
  "input.schedule": () =>
    "That schedule does not fit inside the daily time boundaries. No changes were saved.",
  "input.reminders": () =>
    "Send two times in HH:MM format, separated by a comma.",
  "common.saveFailure": () => "I couldn't save that change. Please try again.",
  "common.applied": () => "Already applied.",
  "common.stale": () =>
    "This action is no longer available. Open /settings or /roster and try again.",
  "common.denied": () =>
    "Only current chat administrators can change chat setup, roster, or planning access.",
  "setup.weekday": () => "Choose the default rehearsal weekday.",
  "setup.startTime": () =>
    "Send the default rehearsal start time. Send a time in 24-hour format, for example <code>19:30</code>.",
  "setup.duration": () =>
    "Send the rehearsal duration as a positive whole number of minutes.",
  "setup.dailyStart": () =>
    "Send the daily start boundary. Send a time in 24-hour format, for example <code>19:30</code>.",
  "setup.dailyEnd": () =>
    "Send the daily end boundary. Send a time in 24-hour format, for example <code>19:30</code>.",
  "setup.reminders": () =>
    "Availability reminders default to <code>10:00</code> and <code>16:00</code>.",
  "setup.firstReminder": () =>
    "Send the first reminder time. Send a time in 24-hour format, for example <code>19:30</code>.",
  "setup.secondReminder": () =>
    "Send the second reminder time. Send a time in 24-hour format, for example <code>19:30</code>.",
  "setup.validReminders": () =>
    "Choose two valid reminder times before review.",
  "setup.policy": () =>
    "Choose who can start rehearsal planning. The default is Admins only.",
  "policy.prompt": () => "Choose who can start rehearsal planning.",
  "policy.ADMINS_ONLY": () => "Admins only",
  "policy.PREVIOUS_PARTICIPANTS": () => "Previous participants",
  "policy.ANYONE_IN_CHAT": () => "Anyone in chat",
  "button.defaults": () => "Use defaults",
  "button.editTimes": () => "Edit times",
  "button.saveConfiguration": () => "Save configuration",
  "button.cancelSetup": () => "Cancel setup",
  "button.saveChange": () => "Save change",
  "button.keepValue": () => "Keep current value",
  "settings.title": () => "<b>Chat settings</b>",
  "settings.schedule": () => "<b>Schedule</b>",
  "settings.reminders": () => "<b>Availability reminders</b>",
  "settings.access": () => "<b>Planning access</b>",
  "settings.review": () => "<b>Review change</b>",
  "settings.notConfigured": () =>
    "This chat is not configured yet. Send /setup to start.",
  "settings.failure": () => "I couldn't load chat settings. Please try again.",
  "settings.expired": () =>
    "This settings change expired after 30 minutes of inactivity. Open /settings to start again.",
  "settings.kept": () => "Current value kept.",
  "settings.saved": () => "Change saved.",
  "settings.weekdayHint": () => "Choose a weekday.",
  "settings.timeHint": () => "Send a time in 24-hour HH:MM format.",
  "settings.durationHint": () => "Send a positive whole number of minutes.",
  "settings.remindersHint": () =>
    "Send two times in HH:MM format, separated by a comma.",
  "roster.title": () => "<b>Band roster</b>",
  "roster.empty": () => "<b>No band members yet</b>",
  "roster.addHint": () =>
    "Reply to a member's message, then send /roster_add to add them.",
  "roster.addUsage": () =>
    "Reply to a band member's message with /roster_add, or send /roster_add @username to invite them.",
  "roster.loading": () => "Loading the roster…",
  "roster.failure": () => "I couldn't load the roster. Please try again.",
  "roster.consequence": () =>
    "They will no longer be selected for future rehearsals.",
  "roster.updated": () => "<b>Roster updated</b>",
  "roster.cancelled": () => "Removal cancelled.",
  "roster.add": () => "Add member",
  "roster.remove": () => "Remove member",
  "roster.confirm": () => "Remove",
  "roster.keep": () => "Keep member",
  "roster.inviteButton": () => "Join",
  "roster.inviteStale": () =>
    "This invite is no longer available. Ask an administrator to send /roster_add again.",
  "roster.inviteNonMember": () =>
    "Only people in this chat can join the band roster.",
  "button.previous": () => "Previous",
  "button.next": () => "Next",
  "button.retry": () => "Retry",
  "field.TIMEZONE": () => "Time zone",
  "edit.TIMEZONE": () => "Edit time zone",
  "field.DEFAULT_WEEKDAY": () => "Default day",
  "edit.DEFAULT_WEEKDAY": () => "Edit weekday",
  "field.DEFAULT_START_MINUTE": () => "Default start",
  "edit.DEFAULT_START_MINUTE": () => "Edit default start",
  "field.DURATION_MINUTES": () => "Duration",
  "edit.DURATION_MINUTES": () => "Edit duration",
  "field.DAILY_START_MINUTE": () => "Daily start",
  "edit.DAILY_START_MINUTE": () => "Edit daily start",
  "field.DAILY_END_MINUTE": () => "Daily end",
  "edit.DAILY_END_MINUTE": () => "Edit daily end",
  "field.REMINDER_MINUTES": () => "Reminder times",
  "edit.REMINDER_MINUTES": () => "Edit reminders",
  "field.PLANNING_ACCESS_POLICY": () => "Planning access",
  "edit.PLANNING_ACCESS_POLICY": () => "Edit planning access",
  "weekday.MON": () => "Mon",
  "weekday.TUE": () => "Tue",
  "weekday.WED": () => "Wed",
  "weekday.THU": () => "Thu",
  "weekday.FRI": () => "Fri",
  "weekday.SAT": () => "Sat",
  "weekday.SUN": () => "Sun",
  "setup.progress": ({ step, prompt }) =>
    `Setup in progress\nStep ${step} of 8\n\n${prompt}`,
  "duration.value": ({ minutes }) => formatPlanningDuration("en", minutes),
  "settings.current": ({ value }) => `Current: ${value}`,
  "settings.new": ({ value }) => `New: ${value}`,
  "settings.row": ({ label, value }) => `${label}: ${value}`,
  "timezone.use": ({ timezone }) => `Use ${timezone}`,
  "timezone.candidate": ({ timezone }) =>
    `<b>Time zone found</b>\nCandidate: <code>${timezone}</code>\n\nSend another location`,
  "timezone.candidates": ({ candidates }) =>
    `<b>Time zone found</b>\nCandidates:\n${candidates}\n\nSend another location`,
  "roster.added": ({ label }) => `✅ Added ${label} to the band roster.`,
  "roster.alreadyActive": ({ label }) =>
    `✅ ${label} is already in the band roster.`,
  "roster.removeTitle": ({ label }) => `<b>Remove ${label}?</b>`,
  "roster.fallback": ({ suffix }) => `Telegram user ••••${suffix}`,
  "roster.page": ({ start, end, total }) =>
    `Showing ${start}–${end} of ${total}`,
  "roster.invitePrompt": ({ username }) =>
    `@${username}, press Join to be added to the band roster.`,
  "roster.inviteWrongUser": ({ username }) =>
    `This invite is for @${username}.`,
} satisfies MessageCatalog;
