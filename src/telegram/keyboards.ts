import { InlineKeyboard } from "grammy";

import {
  PLANNING_ACCESS_LABELS,
  WEEKDAY_LABELS,
  type PlanningAccessPolicyValue,
  type Weekday,
} from "../domain/chat/types.js";
import { SettingsField } from "../generated/prisma/client.js";

export type SetupActionKey =
  | `weekday:${Weekday}`
  | "reminders:defaults"
  | "reminders:edit"
  | "save"
  | "cancel"
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

export const SETUP_REVIEW_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  [
    [{ text: "Save configuration", action: "save" }],
    [{ text: "Cancel setup", action: "cancel" }],
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

export function settingsDashboardKeyboard(
  tokenFor: (field: SettingsField) => string,
) {
  return new InlineKeyboard()
    .text("Edit time zone", tokenFor(SettingsField.TIMEZONE))
    .row()
    .text("Edit weekday", tokenFor(SettingsField.DEFAULT_WEEKDAY))
    .row()
    .text("Edit default start", tokenFor(SettingsField.DEFAULT_START_MINUTE))
    .row()
    .text("Edit duration", tokenFor(SettingsField.DURATION_MINUTES))
    .row()
    .text("Edit daily boundaries", tokenFor(SettingsField.DAILY_START_MINUTE))
    .row()
    .text("Edit reminders", tokenFor(SettingsField.REMINDER_MINUTES))
    .row()
    .text(
      "Edit planning access",
      tokenFor(SettingsField.PLANNING_ACCESS_POLICY),
    );
}

export function planningAccessKeyboard(
  tokenFor: (policy: PlanningAccessPolicyValue) => string,
) {
  const keyboard = new InlineKeyboard();
  for (const policy of [
    "ADMINS_ONLY",
    "PREVIOUS_PARTICIPANTS",
    "ANYONE_IN_CHAT",
  ] as const) {
    keyboard.text(PLANNING_ACCESS_LABELS[policy], tokenFor(policy)).row();
  }
  return keyboard;
}

export function settingsReviewKeyboard(saveToken: string, keepToken: string) {
  return new InlineKeyboard()
    .text("Save change", saveToken)
    .row()
    .text("Keep current value", keepToken);
}

export type RosterPageNavigation = Readonly<{
  previousToken?: string;
  nextToken?: string;
}>;

/**
 * One action-first `Remove member` row per rendered member, in the exact
 * rendered order, followed by neutral page controls when a page boundary exists.
 */
export function rosterRemovalKeyboard(
  removalTokens: readonly string[],
  navigation: RosterPageNavigation = {},
) {
  const keyboard = new InlineKeyboard();
  removalTokens.forEach((token) => keyboard.text("Remove member", token).row());
  if (navigation.previousToken !== undefined) {
    keyboard.text("Previous", navigation.previousToken);
  }
  if (navigation.nextToken !== undefined) {
    keyboard.text("Next", navigation.nextToken);
  }
  return keyboard;
}

export function rosterRetryKeyboard(retryToken: string) {
  return new InlineKeyboard().text("Retry", retryToken);
}

export function rosterRemovalConfirmationKeyboard(
  removeToken: string,
  keepToken: string,
) {
  return new InlineKeyboard()
    .text("Remove member", removeToken)
    .row()
    .text("Keep member", keepToken);
}
