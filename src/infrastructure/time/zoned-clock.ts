import type { MinuteOfDay } from "../../domain/chat/types.js";
import type { CivilDate } from "./civil.js";

/**
 * The single seam where `Intl` DST reasoning is allowed to live.
 *
 * Everything above this module reasons in civil values only (DST policy rule 1:
 * day and slot GENERATION is purely civil). Only the civil-to-instant boundary
 * needs zone rules, and it crosses it here. `resolveWallClock` — the three-way
 * skipped/ambiguous/unique resolution — lands with the step where it first
 * becomes observable; this module carries only what the current step needs.
 */

/** A civil date plus the local minute of day, as read off a wall clock. */
export type CivilMoment = CivilDate &
  Readonly<{
    minuteOfDay: MinuteOfDay;
  }>;

/**
 * One formatter per zone.
 *
 * `new Intl.DateTimeFormat(...)` is comparatively expensive and a card render
 * would otherwise construct one per slot (Pitfall 10). The constructor is also
 * the zone probe: an invalid IANA zone throws a `RangeError` here, which is the
 * same `Intl` guard `timezone-resolver.ts` uses — reusing the construction
 * rather than adding a second probe means one construction, not two.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timezone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  FORMATTERS.set(timezone, formatter);
  return formatter;
}

function partsAt(timezone: string, instantMs: number) {
  const parts = Object.fromEntries(
    formatterFor(timezone)
      .formatToParts(new Date(instantMs))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * The offset, in milliseconds, that `timezone` was at for a given UTC instant.
 *
 * Derived by formatting the instant in the zone and reading the wall clock back
 * as if it were UTC; the difference is the offset that was in force. That is
 * correct across every transition, including the 30-minute and 45-minute zones
 * a fixed table of whole hours would get wrong.
 */
export function offsetMsAt(timezone: string, instantMs: number): number {
  const parts = partsAt(timezone, instantMs);
  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ) - instantMs
  );
}

/** The chat-local wall clock at an instant: the civil date and minute of day. */
export function civilNow(timezone: string, instant: Date): CivilMoment {
  const parts = partsAt(timezone, instant.getTime());
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    minuteOfDay: parts.hour * 60 + parts.minute,
  };
}
