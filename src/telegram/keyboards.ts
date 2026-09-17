import { InlineKeyboard } from "grammy";
import {
  renderMessage,
  policyLabel,
  type Locale,
} from "../shared/i18n/index.js";

import {
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

export function setupWeekdayButtons(
  locale: Locale,
): readonly (readonly SetupKeyboardButton[])[] {
  return (
    [
      ["MON", "TUE", "WED", "THU"],
      ["FRI", "SAT", "SUN"],
    ] as const
  ).map((row) =>
    row.map((value) => ({
      text: renderMessage(locale, `weekday.${value}`, undefined),
      action: `weekday:${value}` as SetupActionKey,
    })),
  );
}
export function setupReminderButtons(
  locale: Locale,
): readonly (readonly SetupKeyboardButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "button.defaults", undefined),
        action: "reminders:defaults",
      },
      {
        text: renderMessage(locale, "button.editTimes", undefined),
        action: "reminders:edit",
      },
    ],
  ];
}
/** Long policy labels deliberately occupy one full-width row each. */
export function setupPolicyButtons(
  locale: Locale,
): readonly (readonly SetupKeyboardButton[])[] {
  return (
    ["ADMINS_ONLY", "PREVIOUS_PARTICIPANTS", "ANYONE_IN_CHAT"] as const
  ).map((value) => [
    {
      text: policyLabel(value, locale),
      action: `policy:${value}` as SetupActionKey,
    },
  ]);
}
export function setupReviewButtons(
  locale: Locale,
): readonly (readonly SetupKeyboardButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "button.saveConfiguration", undefined),
        action: "save",
      },
    ],
    [
      {
        text: renderMessage(locale, "button.cancelSetup", undefined),
        action: "cancel",
      },
    ],
  ];
}
/** Compatibility exports for unmigrated callers. */
export const SETUP_WEEKDAY_BUTTONS = setupWeekdayButtons("en");
export const SETUP_REMINDER_BUTTONS = setupReminderButtons("en");
export const SETUP_POLICY_BUTTONS = setupPolicyButtons("en");
export const SETUP_REVIEW_BUTTONS = setupReviewButtons("en");

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
  locale: Locale = "en",
) {
  return new InlineKeyboard()
    .text(
      renderMessage(locale, "edit.TIMEZONE", undefined),
      tokenFor(SettingsField.TIMEZONE),
    )
    .row()
    .text(
      renderMessage(locale, "edit.DEFAULT_WEEKDAY", undefined),
      tokenFor(SettingsField.DEFAULT_WEEKDAY),
    )
    .row()
    .text(
      renderMessage(locale, "edit.DEFAULT_START_MINUTE", undefined),
      tokenFor(SettingsField.DEFAULT_START_MINUTE),
    )
    .row()
    .text(
      renderMessage(locale, "edit.DURATION_MINUTES", undefined),
      tokenFor(SettingsField.DURATION_MINUTES),
    )
    .row()
    .text(
      renderMessage(locale, "edit.DAILY_START_MINUTE", undefined),
      tokenFor(SettingsField.DAILY_START_MINUTE),
    )
    .row()
    .text(
      renderMessage(locale, "edit.DAILY_END_MINUTE", undefined),
      tokenFor(SettingsField.DAILY_END_MINUTE),
    )
    .row()
    .text(
      renderMessage(locale, "edit.REMINDER_MINUTES", undefined),
      tokenFor(SettingsField.REMINDER_MINUTES),
    )
    .row()
    .text(
      renderMessage(locale, "edit.PLANNING_ACCESS_POLICY", undefined),
      tokenFor(SettingsField.PLANNING_ACCESS_POLICY),
    );
}

export function planningAccessKeyboard(
  tokenFor: (policy: PlanningAccessPolicyValue) => string,
  locale: Locale = "en",
) {
  const keyboard = new InlineKeyboard();
  for (const policy of [
    "ADMINS_ONLY",
    "PREVIOUS_PARTICIPANTS",
    "ANYONE_IN_CHAT",
  ] as const) {
    keyboard.text(policyLabel(policy, locale), tokenFor(policy)).row();
  }
  return keyboard;
}

export function settingsReviewKeyboard(
  saveToken: string,
  keepToken: string,
  locale: Locale = "en",
) {
  return new InlineKeyboard()
    .text(renderMessage(locale, "button.saveChange", undefined), saveToken)
    .row()
    .text(renderMessage(locale, "button.keepValue", undefined), keepToken);
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
 * The three availability markers, as LEADING glyphs on a card LINE (D-08).
 *
 * One value per participant, mirroring the day and slot vocabularies above and
 * for the same reason: the three states are mutually exclusive, so there is
 * nowhere to put a second marker even if a later edit wanted one. They lead the
 * line so a reader scanning the card sees the answer before the name, and the
 * two answer glyphs are the SAME ones their buttons carry — the marker a tap
 * produces is the marker the button showed.
 */
export const PLANNING_MARKER_PENDING = "⬜";
export const PLANNING_MARKER_CAN_ATTEND = "👍";
export const PLANNING_MARKER_CANNOT_ATTEND = "👎";

/**
 * The trailing controls, as declared rows — one control per row.
 *
 * The same reasoning that produced the one-policy-per-row split in Phase 1
 * after finding F-9: Telegram sizes buttons by row width and drops the tail of
 * a label first, and "Confirm rehearsal" sharing a row with "Back" would be
 * the widest label on the card fighting for half of it.
 */
export type PlanningControlAction =
  | "back"
  | "confirm"
  | "takeover"
  | "replan"
  | "answer-available"
  | "answer-unavailable"
  | "book-request"
  | "book-apply"
  | "book-keep"
  | "change-request"
  | "change-apply"
  | "change-keep"
  | "cancel-request"
  | "cancel-apply"
  | "cancel-keep";

export type PlanningControlButton = Readonly<{
  text: string;
  action: PlanningControlAction;
}>;

export const PLANNING_BACK_LABEL = "Back";
/** Starts a fresh attempt for a blocked slot; eligibility is checked at tap time. */
export const PLANNING_REPLAN_LABEL = "↻ Replan";
export const PLANNING_CONFIRM_LABEL = "Confirm rehearsal";
export const PLANNING_TAKEOVER_LABEL = "Take over this plan";

/**
 * The two availability controls, each carrying its marker glyph in front.
 *
 * A LEADING glyph and no word suffix, for the F-9 reason every other planning
 * label follows one: Telegram sizes buttons by row width and drops the tail of
 * a label first, so an annotation after the words is the first thing to go.
 */
export const PLANNING_CAN_ATTEND_LABEL = `${PLANNING_MARKER_CAN_ATTEND} Can attend`;
export const PLANNING_CANNOT_ATTEND_LABEL = `${PLANNING_MARKER_CANNOT_ATTEND} Cannot attend`;

/** The one control the ready-to-book announcement carries (LIFE-01, D-12/D-14). */
export const PLANNING_BOOK_LABEL = "Mark as booked";

/**
 * The two controls the named booking confirmation offers (D-14).
 *
 * Both are worded as ANSWERS to the question the confirmation asks, not as
 * repeats of the control that opened it: a second button also reading "Mark as
 * booked" would make the confirmation look like the same tap again, which is
 * exactly the mis-tap D-14 spends a round trip to prevent.
 *
 * Neither offers a way back from a booking that has already happened. Phase 3
 * ships none — LIFE-03/LIFE-04 are Phase 4 — so "Not yet" declines a booking
 * that has not been recorded rather than reversing one that has.
 */
export const PLANNING_BOOK_CONFIRM_LABEL = "Yes, it's booked";
export const PLANNING_BOOK_KEEP_LABEL = "Not yet";

/** The time step's trailing control: Back alone, under the hours (D-03). */
export function planningBackRows(
  locale: Locale = "en",
): readonly (readonly PlanningControlButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "planning.control.back", undefined),
        action: "back",
      },
    ],
  ];
}
export const PLANNING_BACK_ROW = planningBackRows();

/** The review step's controls: the commit first, the way out under it (D-04). */
export function planningReviewRows(
  locale: Locale = "en",
): readonly (readonly PlanningControlButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "planning.control.confirm", undefined),
        action: "confirm",
      },
    ],
    ...planningBackRows(locale),
  ];
}
export const PLANNING_REVIEW_ROWS = planningReviewRows();

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
export function planningTakeoverRows(
  locale: Locale = "en",
): readonly (readonly PlanningControlButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "planning.control.takeover", undefined),
        action: "takeover",
      },
    ],
  ];
}
export const PLANNING_TAKEOVER_ROW = planningTakeoverRows();

/**
 * The availability card's controls: one per row, the positive answer first.
 *
 * Both rows stay live for every participant for the whole round (D-04), so
 * tapping the other one overwrites the previous answer and a mis-tap can never
 * cost the group a round. A blocked card appends the eligible replan control.
 */
export function planningAvailabilityRows(
  locale: Locale = "en",
): readonly (readonly PlanningControlButton[])[] {
  return [
    [
      {
        text: renderMessage(locale, "planning.control.available", undefined),
        action: "answer-available",
      },
    ],
    [
      {
        text: renderMessage(locale, "planning.control.unavailable", undefined),
        action: "answer-unavailable",
      },
    ],
  ];
}
export const PLANNING_AVAILABILITY_ROWS = planningAvailabilityRows();

/** A blocked attempt keeps both answers and adds a separate replan row (D-02). */
export function planningBlockedRows(
  locale: Locale = "en",
): readonly (readonly PlanningControlButton[])[] {
  return [
    ...planningAvailabilityRows(locale),
    [
      {
        text: renderMessage(locale, "planning.control.replan", undefined),
        action: "replan",
      },
    ],
  ];
}
export const PLANNING_BLOCKED_ROWS = planningBlockedRows();

/**
 * The ready-to-book announcement's single control (AVAIL-07 → LIFE-01).
 *
 * Declared HERE, in the one plan of this phase that opens this module before
 * the announcement renderer exists, because that renderer arrives in a later
 * plan which does not open this file — leaving the constant to it would fail
 * that plan's own typecheck. Nothing renders it yet, and nothing needs to:
 * `planningControlRows` DROPS a control whose token was never minted, so an
 * unused row constant draws no button. Do not delete it as dead.
 */
export const PLANNING_BOOKING_ROWS: readonly (readonly PlanningControlButton[])[] =
  [[{ text: PLANNING_BOOK_LABEL, action: "book-request" }]];

/**
 * The named confirmation's controls: the commit first, the way out under it.
 *
 * `PLANNING_REVIEW_ROWS`' shape and `rosterRemovalConfirmationKeyboard`'s
 * ordering, which is the precedent D-14 names — one control per row, per
 * finding F-9, because these carry the widest labels the planning surface has.
 *
 * Neither control is bound to whoever opened the confirmation (D-19). The
 * tokens behind them grant only the right to ATTEMPT, exactly as the shared
 * answer tokens do; who may actually book is re-decided inside the apply
 * transaction from a role resolved at tap time.
 */
export const PLANNING_BOOKING_CONFIRM_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_BOOK_CONFIRM_LABEL, action: "book-apply" }],
    [{ text: PLANNING_BOOK_KEEP_LABEL, action: "book-keep" }],
  ];

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
  locale: Locale = "en",
) {
  const keyboard = new InlineKeyboard();
  removalTokens.forEach((token) =>
    keyboard
      .text(renderMessage(locale, "roster.remove", undefined), token)
      .row(),
  );
  if (navigation.previousToken !== undefined) {
    keyboard.text(
      renderMessage(locale, "button.previous", undefined),
      navigation.previousToken,
    );
  }
  if (navigation.nextToken !== undefined) {
    keyboard.text(
      renderMessage(locale, "button.next", undefined),
      navigation.nextToken,
    );
  }
  return keyboard;
}

export function rosterRetryKeyboard(retryToken: string, locale: Locale = "en") {
  return new InlineKeyboard().text(
    renderMessage(locale, "button.retry", undefined),
    retryToken,
  );
}

export function rosterRemovalConfirmationKeyboard(
  removeToken: string,
  keepToken: string,
  locale: Locale = "en",
) {
  return new InlineKeyboard()
    .text(renderMessage(locale, "roster.remove", undefined), removeToken)
    .row()
    .text(renderMessage(locale, "roster.keep", undefined), keepToken);
}

export const PLANNING_CANCEL_LABEL = "✕ Cancel rehearsal";
export const PLANNING_CANCEL_CONFIRM_LABEL = "Yes, cancel it";
export const PLANNING_CANCEL_KEEP_LABEL = "Keep rehearsal";
export const PLANNING_CANCEL_CONFIRM_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_CANCEL_CONFIRM_LABEL, action: "cancel-apply" }],
    [{ text: PLANNING_CANCEL_KEEP_LABEL, action: "cancel-keep" }],
  ];
export const PLANNING_CHANGE_LABEL = "↻ Change date or time";
export const PLANNING_CHANGE_CONFIRM_LABEL = "Yes, choose a new slot";
export const PLANNING_CHANGE_KEEP_LABEL = "Keep this slot";
export const PLANNING_CHANGE_CONFIRM_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_CHANGE_CONFIRM_LABEL, action: "change-apply" }],
    [{ text: PLANNING_CHANGE_KEEP_LABEL, action: "change-keep" }],
  ];
export const PLANNING_LIFECYCLE_ROWS: readonly (readonly PlanningControlButton[])[] =
  [
    [{ text: PLANNING_CANCEL_LABEL, action: "cancel-request" }],
    [{ text: PLANNING_CHANGE_LABEL, action: "change-request" }],
  ];
