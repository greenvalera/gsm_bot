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
 *
 * No time library is installed. `Temporal` is `undefined` on this runtime and
 * ships unflagged only in Node 26, while `package.json` pins `>=24.19 <25`; the
 * five audited alternatives (`luxon`, `@date-fns/tz`, `@js-joda/core`,
 * `@js-temporal/polyfill`, `temporal-polyfill`) are recorded in 02-RESEARCH.md
 * as evaluated-but-not-installed, the last flagged `SUS`/`too-new`. What they
 * would buy is the forty lines below, empirically verified against real
 * transitions in `tests/unit/zoned-clock.test.ts`.
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

export function formatterFor(timezone: string): Intl.DateTimeFormat {
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

const DAY_MS = 86_400_000;

/**
 * What a wall clock turns out to mean in a zone — all three possibilities.
 *
 * A discriminated union rather than a thrown error, matching
 * `timezone-resolver.ts`: the two awkward answers are ordinary outcomes of a
 * total function, and a caller that forgets one fails to compile rather than
 * failing in a group chat.
 *
 * `skipped` deliberately carries NO instant. The spring-forward gap has a
 * tempting nearby instant — the same wall clock read at the pre-transition
 * offset — and handing it out is exactly the prohibition this plan records:
 * showing one time and meaning another would put the band an hour off. Leaving
 * the field out makes that shift unrepresentable rather than merely discouraged.
 */
export type WallClockResolution =
  | Readonly<{ kind: "unique"; instantMs: number }>
  | Readonly<{ kind: "ambiguous"; instantMs: number; alternativeMs: number }>
  | Readonly<{ kind: "skipped" }>;

/**
 * Resolves a civil `(date, minuteOfDay)` in `timezone` to a UTC instant.
 *
 * The zone's offset is probed a day either side of the naive instant, which
 * brackets any transition that could be in between. Each probed offset yields a
 * candidate instant, and a candidate survives only if the zone really is at
 * that offset there — `offsetMsAt(tz, c) === naive - c` — which is what rejects
 * the offset that belongs to the other side of the transition.
 *
 * Exactly one survivor is the ordinary case. Two survivors are a fall-back
 * repeated hour, and the EARLIER is returned as `instantMs` per DST policy
 * rule 3, matching Temporal's `"compatible"` disambiguation. Zero survivors is
 * a spring-forward gap: the wall clock genuinely never happens.
 *
 * Correct for zones whose shift is not a whole hour, because nothing here
 * assumes an hour: the offsets are read from ICU, not from a table. Which also
 * means tzdata freshness is a deployment concern — a zone whose rules change is
 * corrected by a Node upgrade, not by an edit here (DST policy rule 6).
 */
export function resolveWallClock(
  timezone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): WallClockResolution {
  const naive = Date.UTC(year, month - 1, day, 0, minuteOfDay, 0);
  const before = offsetMsAt(timezone, naive - DAY_MS);
  const after = offsetMsAt(timezone, naive + DAY_MS);
  const candidates = [...new Set([naive - before, naive - after])]
    .filter(
      (candidate) => offsetMsAt(timezone, candidate) === naive - candidate,
    )
    .sort((left, right) => left - right);

  const [earlier, later] = candidates;
  if (earlier === undefined) return { kind: "skipped" };
  if (later === undefined) return { kind: "unique", instantMs: earlier };
  return { kind: "ambiguous", instantMs: earlier, alternativeMs: later };
}
