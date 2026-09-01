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

/**
 * One declared row per policy, so every label gets the full card width. A
 * single mapped array would put all three in one row at roughly a third of the
 * width each, which is what truncated "Previous participants" to "Previous
 * particip…" (F-9). The row split is deliberate, exactly as in
 * `SETUP_WEEKDAY_BUTTONS` above; `tests/unit/schedule-settings.test.ts` asserts
 * the serialized shape.
 */
export const SETUP_POLICY_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  (["ADMINS_ONLY", "PREVIOUS_PARTICIPANTS", "ANYONE_IN_CHAT"] as const).map(
    (value) => [
      {
        text: PLANNING_ACCESS_LABELS[value as PlanningAccessPolicyValue],
        action: `policy:${value}` as SetupActionKey,
      },
    ],
  );

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

/**
 * One action-first row per `SettingsField` member — this keyboard is the only
 * entry point into a settings edit, so any member left unbound is unreachable
 * no matter how complete the rest of its pipeline is. Adding a member to the
 * enum obliges a row here; `tests/unit/settings-dashboard-keyboard.test.ts`
 * asserts that invariant over the whole enum.
 */
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
    .text("Edit daily start", tokenFor(SettingsField.DAILY_START_MINUTE))
    .row()
    .text("Edit daily end", tokenFor(SettingsField.DAILY_END_MINUTE))
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

/** One planning button: a visible label and the opaque token behind it. */
export type PlanningKeyboardButton = Readonly<{
  text: string;
  token: string;
}>;

/**
 * The three day/slot markers, as LEADING glyphs on a button label (D-08).
 *
 * Never word suffixes. Telegram sizes buttons by row width and a trailing
 * annotation is the first thing it drops — that is finding F-9, where
 * "Previous participants" arrived as "Previous particip…". A single leading
 * code point costs one visible character and cannot be truncated away without
 * the whole label going with it.
 *
 * `PLANNING_MARKER_UNAVAILABLE` is shared by past days here and by past or
 * nonexistent hours on the time card, so "in the past" reads the same in both
 * selectors (D-07).
 */
export const PLANNING_MARKER_DEFAULT = "⭐";
export const PLANNING_MARKER_PREVIOUS = "🔁";
export const PLANNING_MARKER_UNAVAILABLE = "🚫";

/**
 * "You already chose this one" — the glyph Back needs (D-03).
 *
 * Deliberately NOT a member of the marker vocabulary above. Those three are one
 * bounded classification precisely so D-08's tie rule is structural; being the
 * author's current choice is an orthogonal fact, and a day can simultaneously
 * be the chosen one AND the chat's usual one. It therefore leads the label,
 * ahead of whichever marker the day or hour carries, so `⭐ Wed 26` becomes
 * `✅ ⭐ Wed 26` rather than losing its star.
 */
export const PLANNING_MARKER_CHOSEN = "✅";

/**
 * The trailing controls, as declared rows — one control per row.
 *
 * The same reasoning that produced the one-policy-per-row split in Phase 1
 * after finding F-9: Telegram sizes buttons by row width and drops the tail of
 * a label first, and "Confirm rehearsal" sharing a row with "Back" would be
 * the widest label on the card fighting for half of it.
 */
export type PlanningControlAction = "back" | "confirm" | "takeover";

export type PlanningControlButton = Readonly<{
  text: string;
  action: PlanningControlAction;
}>;

export const PLANNING_BACK_LABEL = "Back";
export const PLANNING_CONFIRM_LABEL = "Confirm rehearsal";
export const PLANNING_TAKEOVER_LABEL = "Take over this plan";

/** The time step's trailing control: Back alone, under the hours (D-03). */
export const PLANNING_BACK_ROW: readonly (readonly PlanningControlButton[])[] =
  [[{ text: PLANNING_BACK_LABEL, action: "back" }]];

/** The review step's controls: the commit first, the way out under it (D-04). */
export const PLANNING_REVIEW_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_CONFIRM_LABEL, action: "confirm" }],
    [{ text: PLANNING_BACK_LABEL, action: "back" }],
  ];

/**
 * The takeover control, on its own trailing row below whatever the step offers
 * (AUTH-03 / D-12).
 *
 * A row of its own for the F-9 reason every other control has one — it carries
 * the widest label on the card — and because it is categorically different from
 * the step controls above it: Back and Confirm move the author's own round,
 * this one changes whose round it is.
 *
 * It is rendered ONLY when the round is takeover-eligible AND the person the
 * card is being drawn for holds a current administrator role. That is a
 * convenience, never authority: `planningControlRows` drops a control whose
 * token was not minted, and the takeover transaction re-checks both conditions
 * from freshly read state, so a button that went stale between render and tap
 * cannot seize an active round.
 */
export const PLANNING_TAKEOVER_ROW: readonly (readonly PlanningControlButton[])[] =
  [[{ text: PLANNING_TAKEOVER_LABEL, action: "takeover" }]];

/**
 * Resolves declared control rows against the actions actually minted.
 *
 * A control whose token is `undefined` is DROPPED rather than rendered dead: a
 * button with nothing behind it would be answered with the stale alert, which
 * reads to the author as a broken card rather than as a control that is not
 * offered here.
 */
export function planningControlRows(
  rows: readonly (readonly PlanningControlButton[])[],
  tokenFor: (action: PlanningControlAction) => string | undefined,
): readonly (readonly PlanningKeyboardButton[])[] {
  const resolved: PlanningKeyboardButton[][] = [];
  for (const row of rows) {
    const buttons: PlanningKeyboardButton[] = [];
    for (const button of row) {
      const token = tokenFor(button.action);
      if (token === undefined) continue;
      buttons.push({ text: button.text, token });
    }
    if (buttons.length > 0) resolved.push(buttons);
  }
  return resolved;
}

/**
 * The declared 4/3 split for the seven days of the target week.
 *
 * Never a bare `.map()` over all seven. Telegram sizes buttons by row width, and
 * a single seven-wide row would give each label roughly a seventh of the card —
 * which is exactly the shape that truncated a label in Phase 1 (finding F-9).
 * The split is deliberate, mirroring `SETUP_POLICY_BUTTONS` above, and it is
 * data so that a test can assert the SERIALIZED shape rather than the constant:
 * `tests/unit/planning-keyboards.test.ts` gates this declaration and
 * `planningRows`' break logic as a pair, because changing either one alone is
 * enough to bring the defect back.
 */
export const PLANNING_DAY_ROW_SIZES: readonly number[] = [4, 3];

/**
 * The declared 3/3/3/1 split for the default ten hourly slots; same reason, and
 * asserted in the same test.
 *
 * Slot labels carry a leading marker glyph too (`⭐ 10:00`), which is seven
 * visible characters — a strict `HH:MM` plus one code point and a space. Three
 * of those to a row is comfortably inside the width that truncated a label in
 * Phase 1, and `tests/unit/planning-time-card.test.ts` holds the whole marked
 * card to the same 24-character rule the day card is held to.
 */
export const PLANNING_SLOT_ROW_SIZES: readonly number[] = [3, 3, 3, 1];

/**
 * Splits buttons into declared rows.
 *
 * A slot count other than the default ten (a chat with a narrower or wider
 * daily window) keeps the last declared row size as its chunk, so the shape
 * stays declared rather than degenerating into one long row.
 */
export function planningRows(
  buttons: readonly PlanningKeyboardButton[],
  sizes: readonly number[],
): readonly (readonly PlanningKeyboardButton[])[] {
  const rows: PlanningKeyboardButton[][] = [];
  const fallback = sizes[sizes.length - 1] ?? 1;
  let index = 0;
  let row = 0;
  while (index < buttons.length) {
    const size = Math.max(1, sizes[row] ?? fallback);
    rows.push([...buttons.slice(index, index + size)]);
    index += size;
    row += 1;
  }
  return rows;
}

/** Builds an inline keyboard from already-declared rows; mirrors `setupKeyboard`. */
export function planningKeyboard(
  rows: readonly (readonly PlanningKeyboardButton[])[],
) {
  const keyboard = new InlineKeyboard();
  rows.forEach((row, rowIndex) => {
    row.forEach((button) => keyboard.text(button.text, button.token));
    if (rowIndex < rows.length - 1) {
      keyboard.row();
    }
  });
  return keyboard;
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
