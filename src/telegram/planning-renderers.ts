import {
  parseCivilDate,
  weekdayOf,
  type CivilDate,
} from "../infrastructure/time/civil.js";
import type {
  DayMarker,
  DayStepCell,
  DayStepProjection,
  ReviewStepProjection,
  SlotMarker,
  TimeStepCell,
  TimeStepProjection,
} from "../domain/planning/planning-service.js";
import { formatLocalTime } from "../domain/chat/schedule-validator.js";
import { WEEKDAY_LABELS } from "../domain/chat/types.js";
import {
  planningControlRows,
  planningKeyboard,
  planningRows,
  PLANNING_BACK_ROW,
  PLANNING_DAY_ROW_SIZES,
  PLANNING_MARKER_CHOSEN,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
  PLANNING_REVIEW_ROWS,
  PLANNING_SLOT_ROW_SIZES,
  type PlanningControlAction,
  type PlanningKeyboardButton,
} from "./keyboards.js";
import { memberLabel, sortRosterMembers } from "./roster-renderers.js";
import type { RosterMember } from "../domain/roster/roster-service.js";

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
 * What the chosen glyph means, appended to whichever legend is being built.
 *
 * One entry shared by both selectors, for the same reason `MARKER_GLYPHS` is
 * one map: "the one you picked" must not come to mean two different things
 * between the day card and the time card.
 */
export const PLANNING_CHOSEN_LEGEND = `${PLANNING_MARKER_CHOSEN} your current choice`;

/** Joins legend entries, or answers null when the card uses no glyph at all. */
function legendLine(entries: readonly string[], chosen: boolean) {
  const all = chosen ? [...entries, PLANNING_CHOSEN_LEGEND] : entries;
  return all.length === 0 ? null : all.join("   ·   ");
}

/**
 * `⭐ Mon 24` — the short form used on buttons, with at most one leading glyph.
 *
 * Kept well under the 24-visible-character rule (finding F-9): a weekday
 * abbreviation, a day number and one code point of marker.
 */
/**
 * Prefixes a button label with the glyphs it has earned, chosen-ness first.
 *
 * At most two: "you chose this" and the one marker the classification allows.
 * `⭐ 10:00` becoming `✅ ⭐ 10:00` costs two visible characters and keeps both
 * facts, which is why chosen-ness is not folded into the marker vocabulary.
 */
function withGlyphs(label: string, chosen: boolean, marker: string) {
  const glyphs = [chosen ? PLANNING_MARKER_CHOSEN : "", marker].filter(
    (glyph) => glyph !== "",
  );
  return glyphs.length === 0 ? label : `${glyphs.join(" ")} ${label}`;
}

export function dayButtonLabel(day: DayStepCell) {
  return withGlyphs(
    `${day.weekdayLabel} ${day.dayOfMonth}`,
    day.chosen,
    MARKER_GLYPHS[day.marker],
  );
}

export type PlanningCard = Readonly<{ text: string }>;

export type PlanningDayCard = PlanningCard &
  Readonly<{ keyboard: ReturnType<typeof planningKeyboard> }>;

function legendFor(projection: DayStepProjection): string | null {
  const used = new Set(projection.days.map((day) => day.marker));
  return legendLine(
    LEGEND_ORDER.filter((marker) => used.has(marker)).map(
      (marker) => PLANNING_DAY_LEGEND[marker],
    ),
    projection.days.some((day) => day.chosen),
  );
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
  return withGlyphs(slot.label, slot.chosen, MARKER_GLYPHS[slot.marker]);
}

export type PlanningTimeCard = PlanningCard &
  Readonly<{ keyboard: ReturnType<typeof planningKeyboard> }>;

function timeLegendFor(projection: TimeStepProjection): string | null {
  const used = new Set(projection.slots.map((slot) => slot.marker));
  return legendLine(
    TIME_LEGEND_ORDER.filter((marker) => used.has(marker)).map(
      (marker) => PLANNING_TIME_LEGEND[marker],
    ),
    projection.slots.some((slot) => slot.chosen),
  );
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
  /**
   * The trailing Back control (D-03). Optional so the arity stays two — a
   * projection and one token lookup — and so a caller that has minted no
   * control simply gets a card without the row rather than a dead button.
   */
  controlTokenFor: (action: PlanningControlAction) => string | undefined = () =>
    undefined,
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
    keyboard: planningKeyboard([
      ...planningRows(buttons, PLANNING_SLOT_ROW_SIZES),
      ...planningControlRows(PLANNING_BACK_ROW, controlTokenFor),
    ]),
  };
}

export type PlanningReviewCard = PlanningCard &
  Readonly<{ keyboard: ReturnType<typeof planningKeyboard> }>;

/**
 * The lineup, as chat text: one line per active roster member.
 *
 * Ordered by `sortRosterMembers` and labelled by `memberLabel`, both reused
 * rather than re-derived — they already carry the stable ordering and the
 * `Telegram user ••••NNNN` fallback that keeps a complete numeric Telegram id
 * out of chat text (threat T-01-21). `memberLabel` ALSO escapes, which is why
 * nothing here escapes a second time: this text is sent with
 * `parse_mode: "HTML"`, and running the one exported `escapeHtml` over an
 * already-escaped label would render `&amp;amp;` to the band.
 */
function lineupLines(members: readonly RosterMember[]) {
  return sortRosterMembers(members).map((member) => `• ${memberLabel(member)}`);
}

/**
 * The review step: exactly what Confirm is about to commit, and who it will ask.
 *
 * The terminal card of the phase (D-04), so it ships two live controls and no
 * third: Confirm commits the proposal durably, Back returns to the hours. Both
 * do what they say — the phase does not end at a promise of a proposal, it ends
 * at one, so there is no inert stand-in for a control this phase cannot yet
 * honour. The guard on that promise is a grep in this plan's acceptance
 * criteria, which is why the words it looks for appear nowhere in this module.
 *
 * The day and the time are rendered from the CIVIL pair, never from an instant
 * (DST policy rule 5), so a later timezone change still shows the day the band
 * agreed on. The lineup is the chat's active roster and nothing else: D-09
 * removed the participant-selection step, so this list IS the answer to "who is
 * being asked", and it is read from the same source the confirm transaction
 * snapshots from.
 */
export function renderReviewStep(
  projection: ReviewStepProjection,
  tokenFor: (action: PlanningControlAction) => string | undefined,
): PlanningReviewCard {
  const members = lineupLines(projection.members);
  const lines = [
    `<b>Confirm the rehearsal — ${dayHeadingLabel(parseCivilDate(projection.selectedDate))}</b>`,
    `Start ${formatLocalTime(projection.startMinute)} · ${projection.durationMinutes} minutes.`,
    "",
    members.length === 0
      ? "<b>Nobody is on the band roster yet.</b> Add members with /roster_add before confirming."
      : `<b>Asking these ${members.length === 1 ? "band member" : `${members.length} band members`}:</b>`,
    ...members,
    "",
    "Confirming commits the rehearsal and starts the availability round, where each of them answers whether they can make it.",
  ];
  return {
    text: lines.join("\n"),
    keyboard: planningKeyboard(
      planningControlRows(PLANNING_REVIEW_ROWS, tokenFor),
    ),
  };
}

/**
 * The card the anchor ends on: the proposal, committed.
 *
 * Rendered from the lineup the transaction ACTUALLY snapshotted rather than
 * from a fresh roster read, so a member added or removed between the review
 * render and the Confirm tap is visible to the author as a difference between
 * the two cards instead of being silently absorbed. Carries no controls: the
 * round is durable and there is nothing left on it to press.
 */
export function renderConfirmedStep(
  projection: ReviewStepProjection,
): PlanningCard {
  return {
    text: [
      `<b>Rehearsal confirmed — ${dayHeadingLabel(parseCivilDate(projection.selectedDate))}</b>`,
      `Start ${formatLocalTime(projection.startMinute)} · ${projection.durationMinutes} minutes.`,
      "",
      "<b>Asked to confirm availability:</b>",
      ...lineupLines(projection.members),
      "",
      "The availability round is next.",
    ].join("\n"),
  };
}
