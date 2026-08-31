import { describe, expect, it } from "vitest";

import {
  civilNow,
  formatterFor,
  offsetMsAt,
  resolveWallClock,
  type WallClockResolution,
} from "../../src/infrastructure/time/zoned-clock.js";

/**
 * The recorded DST policy, as a test.
 *
 * 02-RESEARCH.md Pattern 1 carries an empirically verified matrix; this file is
 * that matrix, so the policy is enforced rather than merely written down. It
 * closes the STATE.md concern "Select and document the TypeScript time-library
 * DST policy": the answer is a zero-dependency `Intl` resolver, and these cases
 * are what "it works" means.
 *
 * Three distinct zones, deliberately: two whole-hour zones on opposite
 * hemispheres and Australia/Lord_Howe, whose shift is THIRTY minutes. A table of
 * whole-hour offsets — the obvious wrong implementation — passes every Kyiv and
 * New York case and fails Lord Howe, so the 30-minute zone is the one that
 * actually discriminates between a correct resolver and a plausible one.
 */

const KYIV = "Europe/Kyiv";
const NEW_YORK = "America/New_York";
const LORD_HOWE = "Australia/Lord_Howe";

type Case = Readonly<{
  name: string;
  timezone: string;
  year: number;
  month: number;
  day: number;
  minuteOfDay: number;
  kind: WallClockResolution["kind"];
}>;

const hhmm = (hour: number, minute = 0) => hour * 60 + minute;

/** The six rows verified on this runtime, plus the fixed-offset control. */
const MATRIX: readonly Case[] = [
  {
    name: "Kyiv spring forward: 03:00 does not exist",
    timezone: KYIV,
    year: 2027,
    month: 3,
    day: 28,
    minuteOfDay: hhmm(3),
    kind: "skipped",
  },
  {
    name: "Kyiv fall back: 03:00 happens twice",
    timezone: KYIV,
    year: 2027,
    month: 10,
    day: 31,
    minuteOfDay: hhmm(3),
    kind: "ambiguous",
  },
  {
    name: "New York spring forward: 02:00 does not exist",
    timezone: NEW_YORK,
    year: 2027,
    month: 3,
    day: 14,
    minuteOfDay: hhmm(2),
    kind: "skipped",
  },
  {
    name: "New York fall back: 01:00 happens twice",
    timezone: NEW_YORK,
    year: 2027,
    month: 11,
    day: 7,
    minuteOfDay: hhmm(1),
    kind: "ambiguous",
  },
  {
    name: "Lord Howe: 02:00 survives the 30-minute shift",
    timezone: LORD_HOWE,
    year: 2027,
    month: 4,
    day: 4,
    minuteOfDay: hhmm(2),
    kind: "unique",
  },
  {
    name: "an ordinary hour on an ordinary day",
    timezone: KYIV,
    year: 2026,
    month: 8,
    day: 24,
    minuteOfDay: hhmm(19),
    kind: "unique",
  },
  {
    name: "a fixed-offset zone",
    timezone: "UTC",
    year: 2027,
    month: 3,
    day: 28,
    minuteOfDay: hhmm(3),
    kind: "unique",
  },
];

function resolve(input: Case) {
  return resolveWallClock(
    input.timezone,
    input.year,
    input.month,
    input.day,
    input.minuteOfDay,
  );
}

describe("the three-way wall-clock resolution", () => {
  it("classifies every verified case exactly as the recorded matrix says", () => {
    for (const input of MATRIX) {
      expect(resolve(input).kind, input.name).toBe(input.kind);
    }
  });

  it("covers at least three distinct IANA zones and all three kinds", () => {
    expect(
      new Set(MATRIX.map((input) => input.timezone)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(new Set(MATRIX.map((input) => input.kind))).toEqual(
      new Set(["unique", "ambiguous", "skipped"]),
    );
  });

  it("returns the EARLIER occurrence of a repeated wall clock", () => {
    // DST policy rule 3. Matching Temporal's "compatible" default: the band
    // agreed on a wall clock, and the first time that clock reads 03:00 is when
    // they meant to arrive.
    for (const input of MATRIX.filter((row) => row.kind === "ambiguous")) {
      const resolution = resolve(input);
      expect(resolution.kind, input.name).toBe("ambiguous");
      if (resolution.kind !== "ambiguous") continue;

      expect(resolution.instantMs, input.name).toBeLessThan(
        resolution.alternativeMs,
      );
      // Both candidates really are the same wall clock in that zone; the
      // resolver is choosing between two truths, not inventing one.
      for (const candidate of [
        resolution.instantMs,
        resolution.alternativeMs,
      ]) {
        expect(
          civilNow(input.timezone, new Date(candidate)),
          input.name,
        ).toEqual({
          year: input.year,
          month: input.month,
          day: input.day,
          minuteOfDay: input.minuteOfDay,
        });
      }
      // And they are genuinely different instants — an hour apart in both of
      // these zones, but the assertion is only that they differ.
      expect(resolution.alternativeMs, input.name).toBeGreaterThan(
        resolution.instantMs,
      );
    }
  });

  it("offers no instant at all for a wall clock that never happens", () => {
    // The prohibition, as a type-level fact: a `skipped` resolution carries no
    // instant, so there is nothing for a careless caller to shift to. Showing
    // one time and meaning another is the failure this shape makes
    // unrepresentable.
    for (const input of MATRIX.filter((row) => row.kind === "skipped")) {
      const resolution = resolve(input);
      expect(resolution.kind, input.name).toBe("skipped");
      expect(Object.keys(resolution), input.name).toEqual(["kind"]);
    }
  });

  it("round-trips every unique resolution back to the same wall clock", () => {
    for (const input of MATRIX.filter((row) => row.kind === "unique")) {
      const resolution = resolve(input);
      expect(resolution.kind, input.name).toBe("unique");
      if (resolution.kind !== "unique") continue;

      expect(
        civilNow(input.timezone, new Date(resolution.instantMs)),
        input.name,
      ).toEqual({
        year: input.year,
        month: input.month,
        day: input.day,
        minuteOfDay: input.minuteOfDay,
      });
    }
  });

  it("leaves the default rehearsal window untouched on a transition day", () => {
    // The load-bearing reassurance. Kyiv springs forward at 03:00 on
    // 2027-03-28, and the whole 10:00-19:00 window is on the far side of it:
    // every one of the ten default slots resolves uniquely, so the transition
    // is invisible to a chat running the defaults.
    const resolutions = Array.from({ length: 10 }, (_unused, index) =>
      resolveWallClock(KYIV, 2027, 3, 28, hhmm(10 + index)),
    );

    expect(resolutions).toHaveLength(10);
    expect(resolutions.map((resolution) => resolution.kind)).toEqual(
      Array.from({ length: 10 }, () => "unique"),
    );
  });
});

describe("the offset probe underneath it", () => {
  it("reads zero for a fixed-offset zone", () => {
    expect(offsetMsAt("UTC", Date.UTC(2027, 2, 28, 3, 0, 0))).toBe(0);
  });

  it("reads a whole-hour offset on each side of a transition", () => {
    // Kyiv is +02:00 before 2027-03-28T01:00Z and +03:00 after it.
    expect(offsetMsAt(KYIV, Date.UTC(2027, 2, 27, 12))).toBe(2 * 3_600_000);
    expect(offsetMsAt(KYIV, Date.UTC(2027, 2, 29, 12))).toBe(3 * 3_600_000);
  });

  it("reads a HALF-hour offset where the zone has one", () => {
    // +10:30 outside Lord Howe's DST. Any implementation rounding to whole
    // hours reports +10:00 or +11:00 here and books the band 30 minutes out.
    expect(offsetMsAt(LORD_HOWE, Date.UTC(2027, 5, 1))).toBe(10.5 * 3_600_000);
  });
});

describe("the per-zone formatter memo", () => {
  it("constructs one formatter per zone and reuses that exact instance", () => {
    // Pitfall 10: a card render resolves one wall clock per slot, and
    // `new Intl.DateTimeFormat(...)` is comparatively expensive. Identity, not
    // equality — two equivalent formatters would still be two constructions.
    expect(formatterFor(KYIV)).toBe(formatterFor(KYIV));
    expect(formatterFor(KYIV)).not.toBe(formatterFor(NEW_YORK));
  });
});
