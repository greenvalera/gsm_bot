import {
  PLANNING_ACCESS_LABELS,
  WEEKDAY_LABELS,
  type PlanningAccessPolicyValue,
} from "../domain/chat/types.js";
import { formatLocalTime } from "../domain/chat/schedule-validator.js";
import {
  SETUP_POLICY_BUTTONS,
  SETUP_REVIEW_BUTTONS,
  SETUP_REMINDER_BUTTONS,
  SETUP_WEEKDAY_BUTTONS,
  type SetupKeyboardButton,
} from "./keyboards.js";
import { SettingsField } from "../generated/prisma/client.js";

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

const TIME_HINT =
  "Send a time in 24-hour format, for example <code>19:30</code>.";

function weekdayLabel(value: number) {
  return WEEKDAY_LABELS[
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][
      value - 1
    ] as keyof typeof WEEKDAY_LABELS
  ];
}

function reviewLines(draft: CompleteSetupReview) {
  return [
    `Time zone: <code>${draft.timezone}</code>`,
    `Default day: ${weekdayLabel(draft.defaultWeekday)}`,
    `Default start: <code>${formatLocalTime(draft.defaultStartMinute)}</code>`,
    `Duration: ${draft.durationMinutes} minutes`,
    `Daily start: <code>${formatLocalTime(draft.dailyStartMinute)}</code>`,
    `Daily end: <code>${formatLocalTime(draft.dailyEndMinute)}</code>`,
    `Reminder times: <code>${draft.reminderMinutes.map(formatLocalTime).join("</code> and <code>")}</code>`,
    `Planning access: ${PLANNING_ACCESS_LABELS[draft.planningAccessPolicy]}`,
  ];
}

/** Renders only a fully validated draft; partial setup values never enter review. */
export function renderSetupReview(draft: CompleteSetupReview): SetupProjection {
  return {
    text: ["<b>Review configuration</b>", ...reviewLines(draft)].join("\n"),
    buttons: SETUP_REVIEW_BUTTONS,
  };
}

/** Shows the committed values after a successful atomic promotion. */
export function renderCommittedConfiguration(
  configuration: CompleteSetupReview,
): SetupProjection {
  return {
    text: [
      "<b>Chat configuration saved</b>",
      ...reviewLines(configuration),
    ].join("\n"),
  };
}

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

export function renderSettingsDashboard(
  configuration: SettingsDashboardConfiguration,
) {
  return {
    text: [
      "<b>Chat settings</b>",
      "",
      "<b>Schedule</b>",
      `Time zone: <code>${configuration.timezone}</code>`,
      `Default day: ${weekdayLabel(configuration.defaultWeekday)}`,
      `Default start: <code>${formatLocalTime(configuration.defaultStartMinute)}</code>`,
      `Duration: ${configuration.durationMinutes} minutes`,
      `Daily start: <code>${formatLocalTime(configuration.dailyStartMinute)}</code>`,
      `Daily end: <code>${formatLocalTime(configuration.dailyEndMinute)}</code>`,
      "",
      "<b>Availability reminders</b>",
      `Reminder times: <code>${configuration.reminderMinutes.map(formatLocalTime).join("</code> and <code>")}</code>`,
      "",
      "<b>Planning access</b>",
      `Planning access: ${PLANNING_ACCESS_LABELS[configuration.planningAccessPolicy]}`,
    ].join("\n"),
  };
}

export function renderPlanningAccessSelection(
  current: PlanningAccessPolicyValue,
) {
  return {
    text: `<b>Planning access</b>\nCurrent: ${PLANNING_ACCESS_LABELS[current]}\n\nChoose who can start rehearsal planning.`,
  };
}

export function renderPlanningAccessReview(
  current: PlanningAccessPolicyValue,
  replacement: PlanningAccessPolicyValue,
) {
  return {
    text: [
      "<b>Review change</b>",
      `Current: ${PLANNING_ACCESS_LABELS[current]}`,
      `New: ${PLANNING_ACCESS_LABELS[replacement]}`,
    ].join("\n"),
  };
}

export function renderSettingsEditPrompt(
  field: SettingsField,
  current: SettingsDashboardConfiguration,
) {
  switch (field) {
    case SettingsField.TIMEZONE:
      return {
        text: "<b>Time zone</b>\n\nSend a location in this group to choose this chat's time zone.",
      };
    case SettingsField.DEFAULT_WEEKDAY:
      return {
        text: `<b>Default day</b>\nCurrent: ${weekdayLabel(current.defaultWeekday)}\n\nChoose a weekday.`,
      };
    case SettingsField.DEFAULT_START_MINUTE:
      return {
        text: `<b>Default start</b>\nCurrent: <code>${formatLocalTime(current.defaultStartMinute)}</code>\n\nSend a time in 24-hour HH:MM format.`,
      };
    case SettingsField.DURATION_MINUTES:
      return {
        text: `<b>Duration</b>\nCurrent: ${current.durationMinutes} minutes\n\nSend a positive whole number of minutes.`,
      };
    case SettingsField.DAILY_START_MINUTE:
      return {
        text: `<b>Daily start</b>\nCurrent: <code>${formatLocalTime(current.dailyStartMinute)}</code>\n\nSend a time in 24-hour HH:MM format.`,
      };
    case SettingsField.DAILY_END_MINUTE:
      return {
        text: `<b>Daily end</b>\nCurrent: <code>${formatLocalTime(current.dailyEndMinute)}</code>\n\nSend a time in 24-hour HH:MM format.`,
      };
    case SettingsField.REMINDER_MINUTES:
      return {
        text: `<b>Reminder times</b>\nCurrent: <code>${current.reminderMinutes.map(formatLocalTime).join("</code> and <code>")}</code>\n\nSend two times in HH:MM format, separated by a comma.`,
      };
    case SettingsField.PLANNING_ACCESS_POLICY:
      return renderPlanningAccessSelection(current.planningAccessPolicy);
  }
}

function displaySettingValue(field: SettingsField, value: unknown) {
  if (field === SettingsField.DEFAULT_WEEKDAY && typeof value === "number")
    return weekdayLabel(value);
  if (
    (field === SettingsField.DEFAULT_START_MINUTE ||
      field === SettingsField.DAILY_START_MINUTE ||
      field === SettingsField.DAILY_END_MINUTE) &&
    typeof value === "number"
  )
    return `<code>${formatLocalTime(value)}</code>`;
  if (field === SettingsField.REMINDER_MINUTES && Array.isArray(value))
    return `<code>${value.map((minute) => formatLocalTime(minute as number)).join("</code> and <code>")}</code>`;
  if (field === SettingsField.PLANNING_ACCESS_POLICY)
    return PLANNING_ACCESS_LABELS[value as PlanningAccessPolicyValue];
  if (field === SettingsField.DURATION_MINUTES) return `${value} minutes`;
  return `<code>${String(value)}</code>`;
}

export function renderSettingsReview(
  field: SettingsField,
  current: unknown,
  replacement: unknown,
) {
  return {
    text: [
      "<b>Review change</b>",
      `Current: ${displaySettingValue(field, current)}`,
      `New: ${displaySettingValue(field, replacement)}`,
    ].join("\n"),
  };
}

export function renderSetupStep(draft: SetupRenderDraft): SetupProjection {
  if (draft.timezone === null) {
    return {
      text: "Setup in progress\nStep 1 of 8\n\nSend a location in this group to choose this chat's time zone.",
    };
  }
  if (draft.defaultWeekday === null) {
    return {
      text: "Setup in progress\nStep 2 of 8\n\nChoose the default rehearsal weekday.",
      buttons: SETUP_WEEKDAY_BUTTONS,
    };
  }
  if (draft.defaultStartMinute === null) {
    return { text: `Setup in progress\nStep 3 of 8\n\n${TIME_HINT}` };
  }
  if (draft.durationMinutes === null) {
    return {
      text: "Setup in progress\nStep 4 of 8\n\nSend the rehearsal duration as a positive whole number of minutes.",
    };
  }
  if (draft.dailyStartMinute === null) {
    return { text: `Setup in progress\nStep 5 of 8\n\n${TIME_HINT}` };
  }
  if (draft.dailyEndMinute === null) {
    return { text: `Setup in progress\nStep 6 of 8\n\n${TIME_HINT}` };
  }
  if (draft.reminderMinutes.length === 0) {
    return {
      text: "Setup in progress\nStep 7 of 8\n\nAvailability reminders default to <code>10:00</code> and <code>16:00</code>.",
      buttons: SETUP_REMINDER_BUTTONS,
    };
  }
  if (draft.reminderMinutes[0] === -1) {
    return {
      text: `Setup in progress\nStep 7 of 8\n\nSend the first reminder time. ${TIME_HINT}`,
    };
  }
  if (draft.reminderMinutes.length === 1) {
    return {
      text: `Setup in progress\nStep 7 of 8\n\nSend the second reminder time. ${TIME_HINT}`,
    };
  }
  if (draft.planningAccessPolicy === null) {
    return {
      text: "Setup in progress\nStep 8 of 8\n\nChoose who can start rehearsal planning. The default is Admins only.",
      buttons: SETUP_POLICY_BUTTONS,
    };
  }
  const [firstReminder, secondReminder] = draft.reminderMinutes;
  if (firstReminder === undefined || secondReminder === undefined) {
    return {
      text: "Setup in progress\nStep 7 of 8\n\nChoose two valid reminder times before review.",
    };
  }
  return renderSetupReview({
    timezone: draft.timezone,
    defaultWeekday: draft.defaultWeekday,
    defaultStartMinute: draft.defaultStartMinute,
    durationMinutes: draft.durationMinutes,
    dailyStartMinute: draft.dailyStartMinute,
    dailyEndMinute: draft.dailyEndMinute,
    reminderMinutes: [firstReminder, secondReminder],
    planningAccessPolicy: draft.planningAccessPolicy,
  });
}
