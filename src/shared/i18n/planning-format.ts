import { weekdayOf, type CivilDate } from "../../infrastructure/time/civil.js";
import { WEEKDAY_LABELS, type Weekday } from "../../domain/chat/types.js";
import type { Locale } from "./index.js";

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
