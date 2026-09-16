import type { PlanningAccessPolicyValue } from "../domain/chat/types.js";
import { formatLocalTime } from "../domain/chat/schedule-validator.js";
import {
  SETUP_POLICY_BUTTONS,
  SETUP_REVIEW_BUTTONS,
  SETUP_REMINDER_BUTTONS,
  SETUP_WEEKDAY_BUTTONS,
  type SetupKeyboardButton,
} from "./keyboards.js";
import { SettingsField } from "../generated/prisma/client.js";
import {
  renderMessage,
  weekdayLabel,
  policyLabel,
  reminderSeparator,
  type Locale,
} from "../shared/i18n/index.js";
import { escapeHtml } from "./roster-renderers.js";

export type SetupRenderDraft = Readonly<{
  timezone: string | null;
  defaultWeekday: number | null;
  defaultStartMinute: number | null;
  durationMinutes: number | null;
  dailyStartMinute: number | null;
  dailyEndMinute: number | null;
  reminderMinutes: readonly number[];
  planningAccessPolicy: PlanningAccessPolicyValue | null;
}>;

export type SetupProjection = Readonly<{
  text: string;
  buttons?: readonly (readonly SetupKeyboardButton[])[];
}>;

export type CompleteSetupReview = Readonly<{
  timezone: string;
  defaultWeekday: number;
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
  reminderMinutes: readonly [number, number];
  planningAccessPolicy: PlanningAccessPolicyValue;
}>;

export type SettingsDashboardConfiguration = Readonly<{
  timezone: string;
  defaultWeekday: number;
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
  reminderMinutes: readonly number[];
  planningAccessPolicy: PlanningAccessPolicyValue;
}>;

export const TIMEZONE_LOCATION_HINT = renderMessage(
  "en",
  "timezone.intro",
  undefined,
);

function localizedButtons(
  rows: readonly (readonly SetupKeyboardButton[])[],
  locale: Locale,
) {
  return rows.map((row) =>
    row.map((button) => {
      const action = button.action;
      const text = action.startsWith("weekday:")
        ? weekdayLabel(
            ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(
              action.slice(8),
            ) + 1,
            locale,
          )
        : action.startsWith("policy:")
          ? policyLabel(action.slice(7) as PlanningAccessPolicyValue, locale)
          : renderMessage(
              locale,
              action === "save"
                ? "button.saveConfiguration"
                : action === "cancel"
                  ? "button.cancelSetup"
                  : action === "reminders:defaults"
                    ? "button.defaults"
                    : "button.editTimes",
              undefined,
            );
      return { ...button, text };
    }),
  );
}
function displaySettingValue(
  field: SettingsField,
  value: unknown,
  locale: Locale,
) {
  if (field === SettingsField.DEFAULT_WEEKDAY && typeof value === "number")
    return weekdayLabel(value, locale);
  if (
    [
      SettingsField.DEFAULT_START_MINUTE,
      SettingsField.DAILY_START_MINUTE,
      SettingsField.DAILY_END_MINUTE,
    ].some((item) => item === field) &&
    typeof value === "number"
  )
    return `<code>${formatLocalTime(value)}</code>`;
  if (field === SettingsField.REMINDER_MINUTES && Array.isArray(value))
    return `<code>${value.map((minute) => formatLocalTime(minute as number)).join(reminderSeparator(locale))}</code>`;
  if (field === SettingsField.PLANNING_ACCESS_POLICY)
    return policyLabel(value as PlanningAccessPolicyValue, locale);
  if (field === SettingsField.DURATION_MINUTES && typeof value === "number")
    return renderMessage(locale, "duration.value", { minutes: value });
  return `<code>${escapeHtml(String(value))}</code>`;
}
function reviewLines(draft: SettingsDashboardConfiguration, locale: Locale) {
  const values: readonly [SettingsField, unknown][] = [
    [SettingsField.TIMEZONE, draft.timezone],
    [SettingsField.DEFAULT_WEEKDAY, draft.defaultWeekday],
    [SettingsField.DEFAULT_START_MINUTE, draft.defaultStartMinute],
    [SettingsField.DURATION_MINUTES, draft.durationMinutes],
    [SettingsField.DAILY_START_MINUTE, draft.dailyStartMinute],
    [SettingsField.DAILY_END_MINUTE, draft.dailyEndMinute],
    [SettingsField.REMINDER_MINUTES, draft.reminderMinutes],
    [SettingsField.PLANNING_ACCESS_POLICY, draft.planningAccessPolicy],
  ];
  return values.map(([field, value]) =>
    renderMessage(locale, "settings.row", {
      label: renderMessage(locale, `field.${field}`, undefined),
      value: displaySettingValue(field, value, locale),
    }),
  );
}
/** Legacy callers default to English until their owning migration. */
export function renderSetupReview(
  draft: CompleteSetupReview,
  locale: Locale = "en",
): SetupProjection {
  return {
    text: [
      renderMessage(locale, "setup.review", undefined),
      renderMessage(locale, "language.row", undefined),
      ...reviewLines(draft, locale),
    ].join("\n"),
    buttons: localizedButtons(SETUP_REVIEW_BUTTONS, locale),
  };
}
export function renderCommittedConfiguration(
  configuration: CompleteSetupReview,
  locale: Locale = "en",
): SetupProjection {
  return {
    text: [
      renderMessage(locale, "setup.saved", undefined),
      renderMessage(locale, "language.row", undefined),
      ...reviewLines(configuration, locale),
    ].join("\n"),
  };
}
export function renderSettingsProjection(
  result:
    | Readonly<{
        kind: "committed";
        configuration: SettingsDashboardConfiguration;
      }>
    | Readonly<{ kind: "not-configured" | "failed" }>,
  locale: Locale = "en",
): Readonly<{
  kind: "dashboard" | "not-configured" | "failure";
  text: string;
}> {
  if (result.kind === "committed")
    return {
      kind: "dashboard",
      text: renderSettingsDashboard(result.configuration, locale).text,
    };
  if (result.kind === "not-configured")
    return {
      kind: "not-configured",
      text: renderMessage(locale, "settings.notConfigured", undefined),
    };
  return {
    kind: "failure",
    text: renderMessage(locale, "settings.failure", undefined),
  };
}
export function renderSettingsDashboard(
  configuration: SettingsDashboardConfiguration,
  locale: Locale = "en",
) {
  const lines = reviewLines(configuration, locale);
  return {
    text: [
      renderMessage(locale, "settings.title", undefined),
      "",
      renderMessage(locale, "settings.schedule", undefined),
      ...lines.slice(0, 6),
      "",
      renderMessage(locale, "settings.reminders", undefined),
      lines[6],
      "",
      renderMessage(locale, "settings.access", undefined),
      lines[7],
    ].join("\n"),
  };
}
export function renderPlanningAccessSelection(
  current: PlanningAccessPolicyValue,
  locale: Locale = "en",
) {
  return {
    text: [
      renderMessage(locale, "settings.access", undefined),
      renderMessage(locale, "settings.current", {
        value: policyLabel(current, locale),
      }),
      "",
      renderMessage(locale, "policy.prompt", undefined),
    ].join("\n"),
  };
}
export function renderPlanningAccessReview(
  current: PlanningAccessPolicyValue,
  replacement: PlanningAccessPolicyValue,
  locale: Locale = "en",
) {
  return renderSettingsReview(
    SettingsField.PLANNING_ACCESS_POLICY,
    current,
    replacement,
    locale,
  );
}
export function renderSettingsEditPrompt(
  field: SettingsField,
  current: SettingsDashboardConfiguration,
  locale: Locale = "en",
) {
  if (field === SettingsField.TIMEZONE)
    return {
      text: `<b>${renderMessage(locale, "timezone.title", undefined)}</b>\n\n${renderMessage(locale, "timezone.intro", undefined)}`,
    };
  if (field === SettingsField.PLANNING_ACCESS_POLICY)
    return renderPlanningAccessSelection(current.planningAccessPolicy, locale);
  const values = {
    DEFAULT_WEEKDAY: current.defaultWeekday,
    DEFAULT_START_MINUTE: current.defaultStartMinute,
    DURATION_MINUTES: current.durationMinutes,
    DAILY_START_MINUTE: current.dailyStartMinute,
    DAILY_END_MINUTE: current.dailyEndMinute,
    REMINDER_MINUTES: current.reminderMinutes,
  };
  const hint =
    field === SettingsField.DEFAULT_WEEKDAY
      ? "settings.weekdayHint"
      : field === SettingsField.DURATION_MINUTES
        ? "settings.durationHint"
        : field === SettingsField.REMINDER_MINUTES
          ? "settings.remindersHint"
          : "settings.timeHint";
  return {
    text: [
      `<b>${renderMessage(locale, `field.${field}`, undefined)}</b>`,
      renderMessage(locale, "settings.current", {
        value: displaySettingValue(field, values[field], locale),
      }),
      "",
      renderMessage(locale, hint, undefined),
    ].join("\n"),
  };
}
export function renderSettingsReview(
  field: SettingsField,
  current: unknown,
  replacement: unknown,
  locale: Locale = "en",
) {
  return {
    text: [
      renderMessage(locale, "settings.review", undefined),
      renderMessage(locale, "settings.current", {
        value: displaySettingValue(field, current, locale),
      }),
      renderMessage(locale, "settings.new", {
        value: displaySettingValue(field, replacement, locale),
      }),
    ].join("\n"),
  };
}
export function renderSetupStep(
  draft: SetupRenderDraft,
  locale: Locale = "en",
): SetupProjection {
  const step = (
    number: number,
    prompt: string,
    buttons?: readonly (readonly SetupKeyboardButton[])[],
  ): SetupProjection => ({
    text: renderMessage(locale, "setup.progress", { step: number, prompt }),
    ...(buttons === undefined
      ? {}
      : { buttons: localizedButtons(buttons, locale) }),
  });
  if (draft.timezone === null)
    return step(1, renderMessage(locale, "timezone.intro", undefined));
  if (draft.defaultWeekday === null)
    return step(
      2,
      renderMessage(locale, "setup.weekday", undefined),
      SETUP_WEEKDAY_BUTTONS,
    );
  if (draft.defaultStartMinute === null)
    return step(3, renderMessage(locale, "setup.startTime", undefined));
  if (draft.durationMinutes === null)
    return step(4, renderMessage(locale, "setup.duration", undefined));
  if (draft.dailyStartMinute === null)
    return step(5, renderMessage(locale, "setup.dailyStart", undefined));
  if (draft.dailyEndMinute === null)
    return step(6, renderMessage(locale, "setup.dailyEnd", undefined));
  if (draft.reminderMinutes.length === 0)
    return step(
      7,
      renderMessage(locale, "setup.reminders", undefined),
      SETUP_REMINDER_BUTTONS,
    );
  if (draft.reminderMinutes[0] === -1)
    return step(7, renderMessage(locale, "setup.firstReminder", undefined));
  if (draft.reminderMinutes.length === 1)
    return step(7, renderMessage(locale, "setup.secondReminder", undefined));
  if (draft.planningAccessPolicy === null)
    return step(
      8,
      renderMessage(locale, "setup.policy", undefined),
      SETUP_POLICY_BUTTONS,
    );
  const [firstReminder, secondReminder] = draft.reminderMinutes;
  if (firstReminder === undefined || secondReminder === undefined)
    return step(7, renderMessage(locale, "setup.validReminders", undefined));
  return renderSetupReview(
    {
      ...draft,
      timezone: draft.timezone,
      defaultWeekday: draft.defaultWeekday,
      defaultStartMinute: draft.defaultStartMinute,
      durationMinutes: draft.durationMinutes,
      dailyStartMinute: draft.dailyStartMinute,
      dailyEndMinute: draft.dailyEndMinute,
      reminderMinutes: [firstReminder, secondReminder],
      planningAccessPolicy: draft.planningAccessPolicy,
    },
    locale,
  );
}
