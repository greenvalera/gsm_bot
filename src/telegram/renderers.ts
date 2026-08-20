import {
  PLANNING_ACCESS_LABELS,
  WEEKDAY_LABELS,
  type PlanningAccessPolicyValue,
} from "../domain/chat/types.js";
import { formatLocalTime } from "../domain/chat/schedule-validator.js";
import {
  SETUP_POLICY_BUTTONS,
  SETUP_REMINDER_BUTTONS,
  SETUP_WEEKDAY_BUTTONS,
  type SetupKeyboardButton,
} from "./keyboards.js";

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

const TIME_HINT =
  "Send a time in 24-hour format, for example <code>19:30</code>.";

function weekdayLabel(value: number) {
  return WEEKDAY_LABELS[
    ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][
      value - 1
    ] as keyof typeof WEEKDAY_LABELS
  ];
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
  return {
    text: [
      "<b>Review configuration</b>",
      `Time zone: <code>${draft.timezone}</code>`,
      `Default day: ${weekdayLabel(draft.defaultWeekday)}`,
      `Default start: <code>${formatLocalTime(draft.defaultStartMinute)}</code>`,
      `Duration: ${draft.durationMinutes} minutes`,
      `Daily start: <code>${formatLocalTime(draft.dailyStartMinute)}</code>`,
      `Daily end: <code>${formatLocalTime(draft.dailyEndMinute)}</code>`,
      `Reminder times: <code>${draft.reminderMinutes.map(formatLocalTime).join("</code> and <code>")}</code>`,
      `Planning access: ${PLANNING_ACCESS_LABELS[draft.planningAccessPolicy]}`,
    ].join("\n"),
  };
}
