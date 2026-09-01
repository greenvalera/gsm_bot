import { describe, expect, it } from "vitest";

import {
  MAX_WEEK_LOOKAHEAD,
  targetWeekStart,
  weekDates,
} from "../../src/domain/planning/target-week.js";
import {
  addDays,
  isoDate,
  isoWeekdayOf,
  mondayOf,
  parseCivilDate,
} from "../../src/infrastructure/time/civil.js";
import { civilNow } from "../../src/infrastructure/time/zoned-clock.js";
import { createClock } from "../fakes/chat-readiness.js";

/**
 * REQ-PLAN-03: which Monday–Sunday week a round targets, and where that week's
 * two boundaries are.
 *
 * Everything here is pure and clock-injected. The Sunday-to-Monday boundary is
 * the whole point: an off-by-one there does not throw, it silently plans the
 * wrong week, and the only thing that catches it is an assertion that names the
 * expected date out loud.
 */

const KYIV = "Europe/Kyiv";

/** 2026-08-24 is a Monday; 08-27 a Thursday; 08-30 the Sunday that closes it. */
const MONDAY = "2026-08-24";
const NEXT_MONDAY = "2026-08-31";

function chatToday(instant: string, timezone = KYIV) {
  return civilNow(timezone, createClock(new Date(instant)).now());
}

describe("the Monday a new round targets", () => {
  it("returns the current chat-local Monday while the week is unclaimed", () => {
    expect(
      targetWeekStart(chatToday("2026-08-27T09:00:00Z"), () => false),
    ).toBe(MONDAY);
  });

  it("returns the following Monday once the current week is claimed", () => {
    const asked: string[] = [];
    const weekStart = targetWeekStart(
      chatToday("2026-08-27T09:00:00Z"),
      (candidate) => {
        asked.push(candidate);
        return candidate === MONDAY;
      },
    );

    expect(weekStart).toBe(NEXT_MONDAY);
    // The week that is actually RETURNED was itself asked about. Stopping after
    // the current week would hand back the next one untested.
    expect(asked).toEqual([MONDAY, NEXT_MONDAY]);
  });

  it("keeps advancing while consecutive weeks are claimed", () => {
    // The three-command sequence, inside one week: /plan targets 08-24 and is
    // confirmed; /plan targets 08-31 and is confirmed; the third /plan must NOT
    // land on 08-31 again. A confirmed round has already released
    // `activeWeekStart` to NULL, so `@@unique([chatId, activeWeekStart])` would
    // not catch the duplicate — this predicate is the only thing that can.
    const claimed = new Set([MONDAY, NEXT_MONDAY]);
    const asked: string[] = [];
    const weekStart = targetWeekStart(
      chatToday("2026-08-27T09:00:00Z"),
      (candidate) => {
        asked.push(candidate);
        return claimed.has(candidate);
      },
    );

    expect(weekStart).toBe("2026-09-07");
    expect(asked).toEqual([MONDAY, NEXT_MONDAY, "2026-09-07"]);
  });

  it("skips a whole run of claimed weeks and lands on the first free one", () => {
    const claimed = new Set([
      MONDAY,
      NEXT_MONDAY,
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);

    expect(
      targetWeekStart(chatToday("2026-08-27T09:00:00Z"), (candidate) =>
        claimed.has(candidate),
      ),
    ).toBe("2026-09-28");
  });

  it("answers null rather than a claimed week once the lookahead is exhausted", () => {
    const asked: string[] = [];
    const weekStart = targetWeekStart(
      chatToday("2026-08-27T09:00:00Z"),
      (candidate) => {
        asked.push(candidate);
        return true;
      },
    );

    // Total and explicit: the caller is handed "there is no free week", never a
    // week that was asked about and answered yes.
    expect(weekStart).toBeNull();
    // The current week plus MAX_WEEK_LOOKAHEAD more, and then it stops.
    expect(asked).toHaveLength(MAX_WEEK_LOOKAHEAD + 1);
    expect(asked[0]).toBe(MONDAY);
    expect(asked.at(-1)).toBe("2027-08-23");
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("still answers the last week inside the window when only that one is free", () => {
    const lastInWindow = "2027-08-23";

    expect(
      targetWeekStart(
        chatToday("2026-08-27T09:00:00Z"),
        (candidate) => candidate !== lastInWindow,
      ),
    ).toBe(lastInWindow);
  });

  it("uses the chat's own day, not the process's, at the day boundary", () => {
    // 22:30Z on Sunday 2026-08-30 is already Monday 2026-08-31 in Kyiv, so the
    // chat has rolled into the next week while UTC has not.
    expect(chatToday("2026-08-30T22:30:00Z")).toMatchObject({
      year: 2026,
      month: 8,
      day: 31,
    });
    expect(
      targetWeekStart(chatToday("2026-08-30T22:30:00Z"), () => false),
    ).toBe(NEXT_MONDAY);
    expect(
      targetWeekStart(chatToday("2026-08-30T22:30:00Z", "UTC"), () => false),
    ).toBe(MONDAY);
  });
});

describe("the ISO week boundary", () => {
  it("returns a Monday unchanged rather than stepping back a week", () => {
    expect(isoDate(mondayOf(parseCivilDate(MONDAY)))).toBe(MONDAY);
  });

  it("maps a Sunday back to the Monday six days earlier, never forward", () => {
    // Sunday-first weeks would answer 2026-08-31 here. Monday-first is the
    // contract, so the Sunday closes its week instead of opening the next one.
    expect(isoDate(mondayOf(parseCivilDate("2026-08-30")))).toBe(MONDAY);
    expect(isoDate(addDays(parseCivilDate("2026-08-30"), -6))).toBe(MONDAY);
  });

  it("stays a valid Monday across a month and a year boundary", () => {
    for (const [date, expected] of [
      ["2026-03-01", "2026-02-23"],
      ["2027-01-03", "2026-12-28"],
      ["2026-12-31", "2026-12-28"],
    ] as const) {
      const monday = isoDate(mondayOf(parseCivilDate(date)));
      expect(monday, date).toBe(expected);
      expect(monday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isoWeekdayOf(parseCivilDate(monday)), monday).toBe(1);
    }
  });

  it("numbers weekdays 1..7 with Monday 1 and Sunday 7, never 0", () => {
    const week = weekDates(MONDAY);
    expect(week.map((date) => isoWeekdayOf(parseCivilDate(date)))).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(isoWeekdayOf(parseCivilDate("2026-08-30"))).toBe(7);
  });
});

describe("the seven dates of a target week", () => {
  it("separates the Sunday-to-Monday boundary instead of merging it", () => {
    const week = weekDates(MONDAY);

    expect(week).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
    // Neither neighbour of the week may leak in.
    expect(week).not.toContain("2026-08-23");
    expect(week).not.toContain(NEXT_MONDAY);
  });
});
