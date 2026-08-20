import { InlineKeyboard } from "grammy";

import {
  PLANNING_ACCESS_LABELS,
  WEEKDAY_LABELS,
  type PlanningAccessPolicyValue,
  type Weekday,
} from "../domain/chat/types.js";

export type SetupActionKey =
  | `weekday:${Weekday}`
  | "reminders:defaults"
  | "reminders:edit"
  | `policy:${PlanningAccessPolicyValue}`;

export type SetupKeyboardButton = Readonly<{
  text: string;
  action: SetupActionKey;
}>;

export const SETUP_WEEKDAY_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  [
    ["MON", "TUE", "WED", "THU"].map((value) => ({
      text: WEEKDAY_LABELS[value as Weekday],
      action: `weekday:${value}` as SetupActionKey,
    })),
    ["FRI", "SAT", "SUN"].map((value) => ({
      text: WEEKDAY_LABELS[value as Weekday],
      action: `weekday:${value}` as SetupActionKey,
    })),
  ];

export const SETUP_REMINDER_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  [
    [
      { text: "Use defaults", action: "reminders:defaults" },
      { text: "Edit times", action: "reminders:edit" },
    ],
  ];

export const SETUP_POLICY_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  [
    ["ADMINS_ONLY", "PREVIOUS_PARTICIPANTS", "ANYONE_IN_CHAT"].map((value) => ({
      text: PLANNING_ACCESS_LABELS[value as PlanningAccessPolicyValue],
      action: `policy:${value}` as SetupActionKey,
    })),
  ];

export function setupKeyboard(
  rows: readonly (readonly SetupKeyboardButton[])[],
  tokenFor: (action: SetupActionKey) => string,
) {
  const keyboard = new InlineKeyboard();
  rows.forEach((row, rowIndex) => {
    row.forEach((button) =>
      keyboard.text(button.text, tokenFor(button.action)),
    );
    if (rowIndex < rows.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
}
