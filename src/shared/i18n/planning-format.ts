import {
  addDays,
  isoDate,
  parseCivilDate,
  weekdayOf,
  type CivilDate,
} from "../../infrastructure/time/civil.js";
import { WEEKDAY_LABELS, type Weekday } from "../../domain/chat/types.js";
import type { Locale } from "./index.js";

/** Unit inflection is independent of duration decomposition. */
export function formatPlanningUnit(
  locale: Locale,
  count: number,
  unit: "hour" | "minute",
): string {
  if (locale === "en") return `${count} ${unit}${count === 1 ? "" : "s"}`;
  const forms =
    unit === "hour"
      ? ["година", "години", "годин"]
      : ["хвилина", "хвилини", "хвилин"];
  const last = count % 10;
  const teen = count % 100 >= 11 && count % 100 <= 14;
  const index =
    !teen && last === 1 ? 0 : !teen && last >= 2 && last <= 4 ? 1 : 2;
  return `${count} ${forms[index]}`;
}

/** Stored whole minutes stay exact; validation remains at the input boundary. */
export function formatPlanningDuration(
  locale: Locale,
  minutes: number,
): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const parts: string[] = [];
  if (hours !== 0) parts.push(formatPlanningUnit(locale, hours, "hour"));
  if (remainder !== 0 || hours === 0)
    parts.push(formatPlanningUnit(locale, remainder, "minute"));
  return parts.join(" ");
}

const UK_WEEKDAYS: Readonly<Record<Weekday, readonly [string, string]>> = {
  MON: ["Понеділок", "Пн"],
  TUE: ["Вівторок", "Вт"],
  WED: ["Середа", "Ср"],
  THU: ["Четвер", "Чт"],
  FRI: ["П’ятниця", "Пт"],
  SAT: ["Субота", "Сб"],
  SUN: ["Неділя", "Нд"],
};
const MONTHS = {
  en: [
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
  ],
  uk: [
    "січня",
    "лютого",
    "березня",
    "квітня",
    "травня",
    "червня",
    "липня",
    "серпня",
    "вересня",
    "жовтня",
    "листопада",
    "грудня",
  ],
} as const;

/** Date-only presentation: never reinterpret the date in the host timezone. */
export function formatReminderWeekRange(
  locale: Locale,
  targetWeek: string,
): string {
  const start = parseCivilDate(targetWeek);
  const end = addDays(start, 6);
  if (locale === "en") return `${targetWeek} – ${isoDate(end)}`;
  const endLabel = `${end.day} ${MONTHS.uk[end.month - 1]}`;
  return start.year === end.year && start.month === end.month
    ? `${start.day}–${endLabel}`
    : `${start.day} ${MONTHS.uk[start.month - 1]} – ${endLabel}`;
}

/** Date-only presentation: never reinterpret the date in the host timezone. */
export function formatPlanningDate(locale: Locale, date: CivilDate): string {
  const weekday = weekdayOf(date);
  const heading =
    locale === "uk" ? `${UK_WEEKDAYS[weekday][0]},` : WEEKDAY_LABELS[weekday];
  return `${heading} ${date.day} ${MONTHS[locale][date.month - 1]}`;
}

export function formatPlanningDayButton(
  locale: Locale,
  date: CivilDate,
): string {
  const weekday = weekdayOf(date);
  return `${locale === "uk" ? UK_WEEKDAYS[weekday][1] : WEEKDAY_LABELS[weekday]} ${date.day}`;
}
