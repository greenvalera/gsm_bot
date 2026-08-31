import { describe, expect, it } from "vitest";

import { formatLocalTime } from "../../src/domain/chat/schedule-validator.js";
import {
  generateSlots,
  slotAvailability,
  type SlotWindow,
} from "../../src/domain/planning/slot-generator.js";

/**
 * REQ-CONF-04: the boundary and precision contract of the hourly slot list.
 *
 * This requirement is the one this project has already got wrong once. The
 * containment rule has two halves and only the CEILING was ever enforced, so a
 * rehearsal starting before the window opened was accepted until Phase 1 plan
 * 01-18 repaired it (findings F-5/F-6). Both halves are asserted here, and the
 * generator delegates to the repaired rule in `schedule-validator.ts` rather
 * than restating it — a second copy is one edit away from losing the floor
 * again.
 */

const DEFAULTS: SlotWindow = {
  dailyStartMinute: 600, // 10:00
  dailyEndMinute: 1260, // 21:00
  durationMinutes: 120,
};

const hhmm = (hour: number, minute = 0) => hour * 60 + minute;

const labels = (window: SlotWindow) =>
  generateSlots(window).map((slot) => slot.label);

const startMinutes = (window: SlotWindow) =>
  generateSlots(window).map((slot) => slot.startMinute);

describe("which starts the configured window admits", () => {
  it("yields exactly ten slots, 10:00 through 19:00, for the defaults", () => {
    expect(labels(DEFAULTS)).toEqual([
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
    ]);
  });

  it("offers 19:00 because the rehearsal ends exactly at the window's close", () => {
    // 19:00 + 120 == 21:00 == dailyEndMinute. Ending exactly at the ceiling is
    // inside the window; 20:00 would run an hour past it.
    expect(startMinutes(DEFAULTS)).toContain(hhmm(19));
    expect(startMinutes(DEFAULTS)).not.toContain(hhmm(20));
  });

  it("offers 10:00 because starting exactly at the floor is inside the window", () => {
    // The F-5/F-6 repair, from the slot list's side. If the floor half of the
    // containment rule goes missing again, 09:00 reappears here.
    expect(startMinutes(DEFAULTS)).toContain(hhmm(10));
    expect(startMinutes(DEFAULTS)).not.toContain(hhmm(9));
  });

  it("drops the last slot when the window closes one minute earlier", () => {
    // 19:00 + 120 == 1260, which is one minute past a 1259 ceiling.
    const narrowed = labels({ ...DEFAULTS, dailyEndMinute: 1259 });

    expect(narrowed).toHaveLength(9);
    expect(narrowed).not.toContain("19:00");
    expect(narrowed[narrowed.length - 1]).toBe("18:00");
  });

  it("offers eleven slots when the rehearsal is only an hour long", () => {
    const hourly = labels({ ...DEFAULTS, durationMinutes: 60 });

    expect(hourly).toHaveLength(11);
    expect(hourly[0]).toBe("10:00");
    expect(hourly[hourly.length - 1]).toBe("20:00");
  });

  it("yields an EMPTY list when no whole rehearsal fits, never a truncated one", () => {
    // 10:00-11:00 cannot hold a two-hour rehearsal. The honest answer is "no
    // slots", not a slot that would overrun the window the chat configured.
    expect(
      generateSlots({
        dailyStartMinute: 600,
        dailyEndMinute: 660,
        durationMinutes: 120,
      }),
    ).toEqual([]);
  });
});

describe("the generator's precision", () => {
  it("steps by exactly sixty minutes and never snaps to the hour", () => {
    // A window opening at 10:15 yields 10:15, 11:15, 12:15 ... No rounding, no
    // snapping, no half-up or half-even tie-breaking of any kind: the offset
    // the chat configured is the offset the band is offered.
    const offset = { ...DEFAULTS, dailyStartMinute: hhmm(10, 15) };
    const minutes = startMinutes(offset);

    expect(minutes.length).toBeGreaterThan(0);
    for (const minute of minutes) {
      expect(minute % 60, formatLocalTime(minute)).toBe(15);
    }
    expect(labels(offset).slice(0, 3)).toEqual(["10:15", "11:15", "12:15"]);
    for (const [index, minute] of minutes.entries()) {
      expect(minute).toBe(hhmm(10, 15) + index * 60);
    }
  });

  it("labels every slot as a strict 24-hour HH:MM", () => {
    for (const window of [
      DEFAULTS,
      { ...DEFAULTS, durationMinutes: 60 },
      { ...DEFAULTS, dailyStartMinute: hhmm(10, 15) },
      { dailyStartMinute: 0, dailyEndMinute: 1439, durationMinutes: 30 },
    ]) {
      for (const slot of generateSlots(window)) {
        expect(slot.label).toMatch(/^([01][0-9]|2[0-3]):[0-5][0-9]$/);
        expect(slot.label).toBe(formatLocalTime(slot.startMinute));
      }
    }
  });

  it("satisfies BOTH halves of the containment rule across a spread of windows", () => {
    // A property-style sweep rather than a single fixture: the count is exactly
    // the number of 60-minute steps that fit, and no returned start violates
    // either half. Written out here as the arithmetic the rule implies, so the
    // test disagrees with the implementation if either half is dropped.
    for (const dailyStartMinute of [0, 420, 600, 615, 1000]) {
      for (const dailyEndMinute of [660, 1259, 1260, 1439]) {
        for (const durationMinutes of [30, 60, 90, 120, 240]) {
          if (dailyStartMinute >= dailyEndMinute) continue;
          const window = {
            dailyStartMinute,
            dailyEndMinute,
            durationMinutes,
          };
          const name = `${dailyStartMinute}/${dailyEndMinute}/${durationMinutes}`;
          const minutes = startMinutes(window);

          const span = dailyEndMinute - durationMinutes - dailyStartMinute;
          const expected = span < 0 ? 0 : Math.floor(span / 60) + 1;
          expect(minutes.length, name).toBe(expected);

          for (const minute of minutes) {
            expect(minute, `${name} floor`).toBeGreaterThanOrEqual(
              dailyStartMinute,
            );
            expect(
              minute + durationMinutes,
              `${name} ceiling`,
            ).toBeLessThanOrEqual(dailyEndMinute);
          }
        }
      }
    }
  });
});

describe("whether a generated slot can still be picked", () => {
  const KYIV = "Europe/Kyiv";
  const DAY = { year: 2026, month: 8, day: 24 };

  /** 2026-08-24 13:30 in Kyiv (+03:00) is 10:30 UTC. */
  const NOW = new Date("2026-08-24T10:30:00Z");

  it("calls an hour already behind the chat past, and one ahead available", () => {
    expect(slotAvailability(KYIV, DAY, hhmm(12), NOW)).toBe("past");
    expect(slotAvailability(KYIV, DAY, hhmm(13), NOW)).toBe("past");
    expect(slotAvailability(KYIV, DAY, hhmm(14), NOW)).toBe("available");
  });

  it("counts an instant exactly at now as past", () => {
    // A rehearsal that starts this very second is not something to agree on.
    expect(slotAvailability(KYIV, DAY, hhmm(13, 30), NOW)).toBe("past");
  });

  it("calls a wall clock that does not exist nonexistent, not past", () => {
    // DST policy rule 2. Kyiv skips 03:00 on 2027-03-28, and 03:00 that day is
    // comfortably in the future relative to this clock — so "past" would be
    // both wrong and, worse, indistinguishable from an hour that has simply
    // gone by.
    expect(
      slotAvailability(KYIV, { year: 2027, month: 3, day: 28 }, hhmm(3), NOW),
    ).toBe("nonexistent");
    expect(
      slotAvailability(KYIV, { year: 2027, month: 3, day: 28 }, hhmm(4), NOW),
    ).toBe("available");
  });

  it("compares INSTANTS, so it stays right across a transition", () => {
    // Kyiv falls back at 04:00 local on 2027-10-31, so 03:00 happens twice:
    // 00:00 UTC and 01:00 UTC. A clock sitting between the two occurrences is
    // past the FIRST one, which is the instant the resolver returns — an
    // implementation comparing civil minutes cannot tell those two apart.
    const between = new Date("2027-10-31T00:30:00Z");
    const fallBack = { year: 2027, month: 10, day: 31 };

    expect(slotAvailability(KYIV, fallBack, hhmm(3), between)).toBe("past");
    expect(slotAvailability(KYIV, fallBack, hhmm(5), between)).toBe(
      "available",
    );
  });

  it("answers by the chat's clock, not the process's", () => {
    // 10:30 UTC is 13:30 in Kyiv but still 06:30 in New York, so the same
    // instant makes the same slot past in one chat and available in another.
    expect(slotAvailability(KYIV, DAY, hhmm(12), NOW)).toBe("past");
    expect(slotAvailability("America/New_York", DAY, hhmm(12), NOW)).toBe(
      "available",
    );
  });
});
