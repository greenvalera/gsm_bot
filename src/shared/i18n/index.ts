import { en } from "./en.js";
import { uk } from "./uk.js";
import type { PlanningAccessPolicyValue } from "../../domain/chat/types.js";

/** Presentation locale is explicit and independent of Telegram client language. */
export type Locale = "en" | "uk";
export type MessageParameters = {
  "planning.dayHeading": { value: string };
  "planning.timeHeading": { value: string };
  "planning.reviewHeading": { value: string };
  "planning.availabilityHeading": { value: string };
  "planning.cancelledHeading": { value: string };
  "planning.owner": { label: string };
  "planning.lineup": { total: number };
  "planning.reviewInstructions": { total: number };
  "planning.answered": { value: number; total: number };
  "planning.unavailableMembers": { label: string };
  "planning.chooseDay": undefined;
  "planning.chooseTime": undefined;
  "planning.emptyWindow": undefined;
  "planning.legend.dayDefault": undefined;
  "planning.legend.previous": undefined;
  "planning.legend.past": undefined;
  "planning.legend.timeDefault": undefined;
  "planning.legend.unavailable": undefined;
  "planning.legend.chosen": undefined;
  "planning.legend.pending": undefined;
  "planning.legend.available": undefined;
  "planning.legend.cannotAttend": undefined;
  "planning.outcome.collecting": undefined;
  "planning.outcome.all-available": undefined;
  "planning.outcome.blocked": undefined;
  "planning.booked": undefined;
  "planning.cancelled": undefined;
  "planning.control.back": undefined;
  "planning.control.confirm": undefined;
  "planning.control.takeover": undefined;
  "planning.control.available": undefined;
  "planning.control.unavailable": undefined;
  "planning.control.replan": undefined;
  "planning.applied": undefined;
  "planning.retrySafe": undefined;
  "planning.savedRecovery": undefined;
  "language.select": undefined;
  "language.row": undefined;
  "language.changed": undefined;
  "language.failure": undefined;
  "language.stale": undefined;
  "language.entry": undefined;
  "language.english": undefined;
  "language.ukrainian": undefined;
  "timezone.title": undefined;
  "timezone.intro": undefined;
  "timezone.loading": undefined;
  "timezone.failure": undefined;
  "timezone.another": undefined;
  "setup.review": undefined;
  "setup.saved": undefined;
  "setup.entry": undefined;
  "setup.start": undefined;
  "setup.continue": undefined;
  "setup.cancelled": undefined;
  "setup.stale": undefined;
  "setup.expired": undefined;
  "input.time": undefined;
  "input.duration": undefined;
  "input.schedule": undefined;
  "input.reminders": undefined;
  "common.saveFailure": undefined;
  "common.applied": undefined;
  "common.stale": undefined;
  "common.denied": undefined;
  "callback.denied": undefined;
  "setup.weekday": undefined;
  "setup.startTime": undefined;
  "setup.duration": undefined;
  "setup.dailyStart": undefined;
  "setup.dailyEnd": undefined;
  "setup.reminders": undefined;
  "setup.firstReminder": undefined;
  "setup.secondReminder": undefined;
  "setup.validReminders": undefined;
  "setup.policy": undefined;
  "policy.prompt": undefined;
  "policy.ADMINS_ONLY": undefined;
  "policy.PREVIOUS_PARTICIPANTS": undefined;
  "policy.ANYONE_IN_CHAT": undefined;
  "button.defaults": undefined;
  "button.editTimes": undefined;
  "button.saveConfiguration": undefined;
  "button.cancelSetup": undefined;
  "button.saveChange": undefined;
  "button.keepValue": undefined;
  "settings.title": undefined;
  "settings.schedule": undefined;
  "settings.reminders": undefined;
  "settings.access": undefined;
  "settings.review": undefined;
  "settings.notConfigured": undefined;
  "settings.failure": undefined;
  "settings.expired": undefined;
  "settings.kept": undefined;
  "settings.saved": undefined;
  "settings.weekdayHint": undefined;
  "settings.timeHint": undefined;
  "settings.durationHint": undefined;
  "settings.remindersHint": undefined;
  "roster.title": undefined;
  "roster.empty": undefined;
  "roster.addHint": undefined;
  "roster.addUsage": undefined;
  "roster.loading": undefined;
  "roster.failure": undefined;
  "roster.consequence": undefined;
  "roster.updated": undefined;
  "roster.cancelled": undefined;
  "roster.add": undefined;
  "roster.remove": undefined;
  "roster.confirm": undefined;
  "roster.keep": undefined;
  "button.previous": undefined;
  "button.next": undefined;
  "button.retry": undefined;
  "field.TIMEZONE": undefined;
  "edit.TIMEZONE": undefined;
  "field.DEFAULT_WEEKDAY": undefined;
  "edit.DEFAULT_WEEKDAY": undefined;
  "field.DEFAULT_START_MINUTE": undefined;
  "edit.DEFAULT_START_MINUTE": undefined;
  "field.DURATION_MINUTES": undefined;
  "edit.DURATION_MINUTES": undefined;
  "field.DAILY_START_MINUTE": undefined;
  "edit.DAILY_START_MINUTE": undefined;
  "field.DAILY_END_MINUTE": undefined;
  "edit.DAILY_END_MINUTE": undefined;
  "field.REMINDER_MINUTES": undefined;
  "edit.REMINDER_MINUTES": undefined;
  "field.PLANNING_ACCESS_POLICY": undefined;
  "edit.PLANNING_ACCESS_POLICY": undefined;
  "weekday.MON": undefined;
  "weekday.TUE": undefined;
  "weekday.WED": undefined;
  "weekday.THU": undefined;
  "weekday.FRI": undefined;
  "weekday.SAT": undefined;
  "weekday.SUN": undefined;
  "setup.progress": { step: number; prompt: string };
  "duration.value": { minutes: number };
  "settings.current": { value: string };
  "settings.new": { value: string };
  "settings.row": { label: string; value: string };
  "timezone.use": { timezone: string };
  "timezone.candidate": { timezone: string };
  "timezone.candidates": { candidates: string };
  "roster.added": { label: string };
  "roster.alreadyActive": { label: string };
  "roster.removeTitle": { label: string };
  "roster.fallback": { suffix: string };
  "roster.page": { start: number; end: number; total: number };
};
export type MessageCatalog = {
  readonly [Key in keyof MessageParameters]: (
    params: MessageParameters[Key],
  ) => string;
};
export const catalogs: Record<Locale, MessageCatalog> = { en, uk };
/** Phrase payload strings are already escaped by HTML projections; plain button labels remain raw. */
export function renderMessage<Key extends keyof MessageParameters>(
  locale: Locale,
  key: Key,
  params: MessageParameters[Key],
): string {
  return catalogs[locale][key](params);
}
export function weekdayLabel(value: number, locale: Locale = "en") {
  const day = (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const)[
    value - 1
  ];
  if (!day) throw new RangeError("Invalid weekday");
  return renderMessage(locale, `weekday.${day}`, undefined);
}
export function policyLabel(
  value: PlanningAccessPolicyValue,
  locale: Locale = "en",
) {
  return renderMessage(locale, `policy.${value}`, undefined);
}
export function reminderSeparator(locale: Locale) {
  return locale === "uk" ? "</code> та <code>" : "</code> and <code>";
}
