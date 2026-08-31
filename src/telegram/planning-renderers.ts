import {
  parseCivilDate,
  weekdayOf,
  type CivilDate,
} from "../infrastructure/time/civil.js";
import type { Slot } from "../domain/planning/slot-generator.js";
import { WEEKDAY_LABELS } from "../domain/chat/types.js";

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
  return `${WEEKDAY_LABELS[weekdayOf(date)]} ${date.day} ${MONTH_LABELS[date.month - 1]}`;
}

/**
 * `Mon 24` — the short form used on buttons.
 *
 * Kept well under the 24-visible-character rule so there is headroom for the
 * marker glyphs that later steps prepend (finding F-9).
 */
export function dayButtonLabel(date: CivilDate) {
  return `${WEEKDAY_LABELS[weekdayOf(date)]} ${date.day}`;
}

export type PlanningCard = Readonly<{ text: string }>;

/** The day step: names the target week, then asks for one day. */
export function renderDayStep(weekStart: string): PlanningCard {
  const lines = [
    `<b>Plan a rehearsal — week of ${dayHeadingLabel(parseCivilDate(weekStart))}</b>`,
    "Choose a day.",
  ];
  return { text: lines.join("\n") };
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
