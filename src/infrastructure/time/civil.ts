import { WEEKDAYS, type Weekday } from "../../domain/chat/types.js";

/**
 * A calendar date with no zone and no instant attached.
 *
 * Civil values are authoritative in this application and the UTC instant is
 * derived from them, never the reverse (DST policy rule 5). Everything in this
 * module is therefore pure arithmetic: no `Intl`, no zone, no `Date.now()`.
 */
export type CivilDate = Readonly<{ year: number; month: number; day: number }>;

/** ISO-8601 weekday numbering: Monday is 1, Sunday is 7. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAY_MS = 86_400_000;

function utcMsOf(date: CivilDate) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function fromUtcMs(instantMs: number): CivilDate {
  const value = new Date(instantMs);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

/**
 * The ONE conversion boundary between the three weekday encodings in play
 * (Pitfall 4): `ChatConfiguration.defaultWeekday` is 1..7 with MON=1,
 * `WEEKDAYS`/`WEEKDAY_LABELS` are 0-indexed arrays, and `getUTCDay()` is 0..6
 * with SUN=0. Every `+ 1` / `- 1` next to a weekday lives in this file and
 * nowhere else.
 */
export function isoWeekdayOf(date: CivilDate): IsoWeekday {
  const weekday = new Date(utcMsOf(date)).getUTCDay();
  return (weekday === 0 ? 7 : weekday) as IsoWeekday;
}

/** The `WEEKDAYS` member for a civil date; the only lookup into that array. */
export function weekdayOf(date: CivilDate): Weekday {
  return WEEKDAYS[isoWeekdayOf(date) - 1]!;
}

/** Calendar addition. Negative counts move backwards. */
export function addDays(date: CivilDate, days: number): CivilDate {
  if (!Number.isInteger(days)) {
    throw new RangeError("Expected a whole number of days.");
  }
  return fromUtcMs(utcMsOf(date) + days * DAY_MS);
}

/** The Monday of the ISO week containing `date`; a Monday returns itself. */
export function mondayOf(date: CivilDate): CivilDate {
  return addDays(date, 1 - isoWeekdayOf(date));
}

/**
 * The canonical `"YYYY-MM-DD"` rendering.
 *
 * This string is what reaches PostgreSQL. It sorts lexicographically exactly as
 * it sorts chronologically, so range queries stay correct without `@db.Date`.
 */
export function isoDate(date: CivilDate): string {
  const year = date.year.toString().padStart(4, "0");
  const month = date.month.toString().padStart(2, "0");
  const day = date.day.toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a strict `"YYYY-MM-DD"` civil date.
 *
 * A value that is well-formed but not a real date (`2026-02-30`) is rejected
 * too: `Date.UTC` would silently roll it over into March, and a silently
 * rolled-over rehearsal date is worse than a refusal.
 */
export function parseCivilDate(value: string): CivilDate {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new RangeError("Expected a strict YYYY-MM-DD civil date.");
  }
  const candidate: CivilDate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (isoDate(fromUtcMs(utcMsOf(candidate))) !== value) {
    throw new RangeError("Expected a real calendar date.");
  }
  return candidate;
}
