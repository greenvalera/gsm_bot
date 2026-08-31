import {
  parseCivilDate,
  weekdayOf,
  type CivilDate,
} from "../infrastructure/time/civil.js";
import type {
  DayMarker,
  DayStepCell,
  DayStepProjection,
  SlotMarker,
  TimeStepCell,
  TimeStepProjection,
} from "../domain/planning/planning-service.js";
import { formatLocalTime } from "../domain/chat/schedule-validator.js";
import { WEEKDAY_LABELS } from "../domain/chat/types.js";
import {
  planningKeyboard,
  planningRows,
  PLANNING_DAY_ROW_SIZES,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
  PLANNING_SLOT_ROW_SIZES,
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

/**
 * The glyph a classification puts in front of its label; `none` adds none.
 *
 * ONE map covering both selectors' markers, which is what makes D-07's "one
 * consistent 'in the past' rule across both selectors" structural rather than a
 * convention. A past DAY and an unavailable HOUR resolve to the same glyph here
 * because they are the same fact to the reader; keeping two maps in step by hand
 * is exactly how a second rule would appear.
 */
const MARKER_GLYPHS: Readonly<Record<DayMarker | SlotMarker, string>> = {
  default: PLANNING_MARKER_DEFAULT,
  previous: PLANNING_MARKER_PREVIOUS,
  past: PLANNING_MARKER_UNAVAILABLE,
  unavailable: PLANNING_MARKER_UNAVAILABLE,
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

/**
 * What each time marker means, for the legend line above the keyboard (D-08).
 *
 * `unavailable` is worded to cover BOTH facts it stands for — an hour already
 * gone and an hour the clock change removed. The card gives them one glyph on
 * purpose; the logs and the private alert keep them apart.
 */
export const PLANNING_TIME_LEGEND: Readonly<
  Record<Exclude<SlotMarker, "none">, string>
> = {
  default: `${PLANNING_MARKER_DEFAULT} usual time`,
  previous: `${PLANNING_MARKER_PREVIOUS} last rehearsal`,
  unavailable: `${PLANNING_MARKER_UNAVAILABLE} unavailable`,
};

/** Fixed legend order, so the line does not reshuffle between renders. */
const TIME_LEGEND_ORDER: readonly Exclude<SlotMarker, "none">[] = [
  "default",
  "previous",
  "unavailable",
];

/**
 * `⭐ 10:00` — the short form used on slot buttons, with at most one glyph.
 *
 * Five characters of strict 24-hour `HH:MM` plus one code point of marker, well
 * inside the 24-visible-character rule (finding F-9). Never a word suffix:
 * Telegram sizes buttons by row width and drops the tail first, which is how
 * "Previous participants" arrived as "Previous particip…".
 */
export function slotButtonLabel(slot: TimeStepCell) {
  const glyph = MARKER_GLYPHS[slot.marker];
  return glyph === "" ? slot.label : `${glyph} ${slot.label}`;
}

export type PlanningTimeCard = PlanningCard &
  Readonly<{ keyboard: ReturnType<typeof planningKeyboard> }>;

function timeLegendFor(projection: TimeStepProjection): string | null {
  const used = new Set(projection.slots.map((slot) => slot.marker));
  const entries = TIME_LEGEND_ORDER.filter((marker) => used.has(marker)).map(
    (marker) => PLANNING_TIME_LEGEND[marker],
  );
  return entries.length === 0 ? null : entries.join("   ·   ");
}

/**
 * The time step: names the chosen day, explains the markers, then asks for one
 * start time.
 *
 * The heading is rendered from the CIVIL pair, never from an instant (DST policy
 * rule 5), so a chat that later changes its timezone still sees the day the band
 * was choosing for. Projection in, card out: no client, no repository and no
 * clock reaches this function, which is what makes the Pitfall 3 "is this edit a
 * no-op" comparison meaningful — and what makes it impossible for rendering a
 * marker to select anything.
 */
export function renderTimeStep(
  projection: TimeStepProjection,
  tokenFor: (startMinute: number) => string | undefined,
): PlanningTimeCard {
  const buttons: PlanningKeyboardButton[] = [];
  for (const slot of projection.slots) {
    const token = tokenFor(slot.startMinute);
    if (token === undefined) continue;
    buttons.push({ text: slotButtonLabel(slot), token });
  }
  const lines = [
    `<b>Plan a rehearsal — ${dayHeadingLabel(parseCivilDate(projection.selectedDate))}</b>`,
    projection.slots.length === 0
      ? "No rehearsal fits inside this chat's daily window. Adjust it with /settings."
      : "Choose a start time.",
  ];
  const legend = timeLegendFor(projection);
  if (legend !== null) lines.push(legend);
  return {
    text: lines.join("\n"),
    keyboard: planningKeyboard(planningRows(buttons, PLANNING_SLOT_ROW_SIZES)),
  };
}

/**
 * The review step, as far as this plan takes it: what the author just chose.
 *
 * Deliberately carries NO keyboard. The time buttons must not stay live on an
 * anchor whose round has already moved past the time step (D-01: one card,
 * edited), and the Confirm and Back actions are minted by the confirm step, not
 * here. Rendered from the civil pair for the same reason the time card is.
 */
export function renderReviewStep(
  selectedDate: string,
  startMinute: number,
  durationMinutes: number,
): PlanningCard {
  return {
    text: [
      `<b>Plan a rehearsal — ${dayHeadingLabel(parseCivilDate(selectedDate))}</b>`,
      `Start ${formatLocalTime(startMinute)}, ${durationMinutes} minutes.`,
    ].join("\n"),
  };
}
