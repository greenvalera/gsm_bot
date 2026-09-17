import { formatPlanningDuration } from "./planning-format.js";
import type { MessageCatalog } from "./index.js";

export const en = {
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
    "Reply to a band member's message, then send /roster_add to add them.",
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
} satisfies MessageCatalog;
