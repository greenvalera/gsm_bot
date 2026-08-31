import {
  parseCivilDate,
  weekdayOf,
  type CivilDate,
} from "../infrastructure/time/civil.js";
import type {
  DayMarker,
  DayStepCell,
  DayStepProjection,
} from "../domain/planning/planning-service.js";
import type { Slot } from "../domain/planning/slot-generator.js";
import { WEEKDAY_LABELS } from "../domain/chat/types.js";
import {
  planningKeyboard,
  planningRows,
  PLANNING_DAY_ROW_SIZES,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
  type PlanningKeyboardButton,
} from "./keyboards.js";

/**
 * Pure planning card text. No I/O, no token minting, no clock — the same inputs
 * always render the same bytes, which is what makes the Pitfall 3 "is this edit
 * a no-op" comparison meaningful.
 *
 * The D-08 legend line and the marker glyphs belong to the steps that introduce
 * markers; this module renders only what the current steps can show.
 */

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `Mon 24 Aug` — the long form used in headings. */
export function dayHeadingLabel(date: CivilDate) {
  // The month index is deliberately hoisted off the line below: the guard that
  // keeps every day-of-week offset inside civil.ts greps for an offset beside a
  // day-of-week token, and a month offset must not be able to masquerade as one.
  const month = MONTH_LABELS[date.month - 1];
  return `${WEEKDAY_LABELS[weekdayOf(date)]} ${date.day} ${month}`;
}

/** The glyph a day's classification puts in front of its label; `none` adds none. */
const MARKER_GLYPHS: Readonly<Record<DayMarker, string>> = {
  default: PLANNING_MARKER_DEFAULT,
  previous: PLANNING_MARKER_PREVIOUS,
  past: PLANNING_MARKER_UNAVAILABLE,
  none: "",
};

/**
 * What each marker means, for the legend line above the keyboard (D-08).
 *
 * The card advertises only the markers it actually uses, so a chat with no
 * previous rehearsal never explains a glyph the reader cannot see.
 */
export const PLANNING_DAY_LEGEND: Readonly<
  Record<Exclude<DayMarker, "none">, string>
> = {
  default: `${PLANNING_MARKER_DEFAULT} usual day`,
  previous: `${PLANNING_MARKER_PREVIOUS} last rehearsal`,
  past: `${PLANNING_MARKER_UNAVAILABLE} already past`,
};

/** Fixed legend order, so the line does not reshuffle between renders. */
const LEGEND_ORDER: readonly Exclude<DayMarker, "none">[] = [
  "default",
  "previous",
  "past",
];

/**
 * `⭐ Mon 24` — the short form used on buttons, with at most one leading glyph.
 *
 * Kept well under the 24-visible-character rule (finding F-9): a weekday
 * abbreviation, a day number and one code point of marker.
 */
export function dayButtonLabel(day: DayStepCell) {
  const glyph = MARKER_GLYPHS[day.marker];
  const label = `${day.weekdayLabel} ${day.dayOfMonth}`;
  return glyph === "" ? label : `${glyph} ${label}`;
}

export type PlanningCard = Readonly<{ text: string }>;

export type PlanningDayCard = PlanningCard &
  Readonly<{ keyboard: ReturnType<typeof planningKeyboard> }>;

function legendFor(projection: DayStepProjection): string | null {
  const used = new Set(projection.days.map((day) => day.marker));
  const entries = LEGEND_ORDER.filter((marker) => used.has(marker)).map(
    (marker) => PLANNING_DAY_LEGEND[marker],
  );
  return entries.length === 0 ? null : entries.join("   ·   ");
}

/**
 * The day step: names the target week, explains the markers, then asks for one
 * day.
 *
 * Projection in, text and keyboard out. No client, no repository and no clock
 * reaches this function, which is what makes the card's bytes a function of its
 * inputs alone — and therefore what makes the Pitfall 3 "is this edit a no-op"
 * comparison meaningful. Rendering a marker selects nothing: it writes no
 * `selectedDate`, advances no step and mints no shortcut.
 *
 * `tokenFor` answers `undefined` only if a day of the target week has no minted
 * action, which the caller's `mintStepActions` makes unreachable — it mints one
 * per `weekDates` entry, the same seven the projection carries.
 */
export function renderDayStep(
  projection: DayStepProjection,
  tokenFor: (isoDate: string) => string | undefined,
): PlanningDayCard {
  const buttons: PlanningKeyboardButton[] = [];
  for (const day of projection.days) {
    const token = tokenFor(day.isoDate);
    if (token === undefined) continue;
    buttons.push({ text: dayButtonLabel(day), token });
  }
  const lines = [
    `<b>Plan a rehearsal — week of ${dayHeadingLabel(parseCivilDate(projection.weekStart))}</b>`,
    "Choose a day.",
  ];
  const legend = legendFor(projection);
  if (legend !== null) lines.push(legend);
  return {
    text: lines.join("\n"),
    keyboard: planningKeyboard(planningRows(buttons, PLANNING_DAY_ROW_SIZES)),
  };
}

/** The time step: names the chosen day, then asks for one start time. */
export function renderTimeStep(
  selectedDate: string,
  slots: readonly Slot[],
): PlanningCard {
  const lines = [
    `<b>Plan a rehearsal — ${dayHeadingLabel(parseCivilDate(selectedDate))}</b>`,
    slots.length === 0
      ? "No rehearsal fits inside this chat's daily window. Adjust it with /settings."
      : "Choose a start time.",
  ];
  return { text: lines.join("\n") };
}
