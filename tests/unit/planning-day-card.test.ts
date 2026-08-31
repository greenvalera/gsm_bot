import { describe, expect, it } from "vitest";

import {
  buildDayStepProjection,
  type DayStepInput,
} from "../../src/domain/planning/planning-service.js";
import { civilNow } from "../../src/infrastructure/time/zoned-clock.js";
import {
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
} from "../../src/telegram/keyboards.js";
import {
  PLANNING_DAY_LEGEND,
  renderDayStep,
} from "../../src/telegram/planning-renderers.js";
import { createClock } from "../fakes/chat-readiness.js";

/**
 * REQ-PLAN-04 and REQ-PLAN-05: the day card's shape and its two highlights.
 *
 * The organizing rule under test is 02-CONTEXT.md's: the card should look the
 * same on a Thursday as on a Monday. Markers change LABELS, never positions,
 * and no configuration produces a partial list — so every fixture below asserts
 * seven buttons, including the one whose whole week is already gone.
 */

const KYIV = "Europe/Kyiv";
const MONDAY = "2026-08-24";

/** The seven civil dates of the 2026-08-24 target week, Monday first. */
const WEEK = [
  "2026-08-24",
  "2026-08-25",
  "2026-08-26",
  "2026-08-27",
  "2026-08-28",
  "2026-08-29",
  "2026-08-30",
] as const;

const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MARKERS = [
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
] as const;

function chatToday(instant: string, timezone = KYIV) {
  return civilNow(timezone, createClock(new Date(instant)).now());
}

function project(overrides: Partial<DayStepInput> = {}) {
  return buildDayStepProjection({
    targetWeekStart: MONDAY,
    // Monday of the target week: nothing is past unless a fixture says so.
    today: chatToday("2026-08-24T09:00:00Z"),
    defaultWeekday: 3,
    previousRehearsalDate: null,
    ...overrides,
  });
}

type RenderedCard = Readonly<{
  text: string;
  keyboard: { inline_keyboard: readonly (readonly { text: string }[])[] };
}>;

function render(overrides: Partial<DayStepInput> = {}): RenderedCard {
  return renderDayStep(
    project(overrides),
    (isoDate) => `v1:token-${isoDate}`,
  ) as RenderedCard;
}

function labelsOf(card: RenderedCard): string[] {
  return card.keyboard.inline_keyboard.flatMap((row) =>
    row.map((button) => button.text),
  );
}

/** Indexed access that fails the test rather than silently yielding undefined. */
function nth(labels: readonly string[], index: number): string {
  const label = labels[index];
  expect(label, `button ${index} is missing`).toBeDefined();
  return label as string;
}

/** Code points, so a single astral-plane glyph counts as one visible character. */
function visibleLength(label: string) {
  return [...label].length;
}

/** Which one marker, if any, a rendered label leads with. */
function markerOf(label: string) {
  return MARKERS.find((glyph) => label.startsWith(glyph)) ?? null;
}

/** The label with its leading marker removed, so positions can be compared. */
function stripMarker(label: string) {
  const glyph = markerOf(label);
  return glyph === null ? label : label.slice(glyph.length).trimStart();
}

function markersUsed(card: RenderedCard) {
  return [
    ...new Set(
      labelsOf(card)
        .map(markerOf)
        .filter((glyph): glyph is (typeof MARKERS)[number] => glyph !== null),
    ),
  ];
}

/** Every fixture the "always seven, always in order" rules must survive. */
const FIXTURES: Readonly<Record<string, Partial<DayStepInput>>> = {
  "default on a Monday": { defaultWeekday: 1 },
  "default on a Sunday": { defaultWeekday: 7 },
  "no previous rehearsal": { previousRehearsalDate: null },
  "previous rehearsal mid-week": { previousRehearsalDate: "2026-08-27" },
  "whole week already past": { today: chatToday("2026-09-10T09:00:00Z") },
};

describe("the shape of the day card", () => {
  it("offers exactly seven days, Monday first, in every fixture", () => {
    for (const [name, overrides] of Object.entries(FIXTURES)) {
      const projection = project(overrides);
      const labels = labelsOf(render(overrides));

      expect(
        projection.days.map((day) => day.isoDate),
        name,
      ).toEqual([...WEEK]);
      expect(labels.length, name).toBe(7);
      expect(
        labels.map((label) => stripMarker(label).split(" ")[0]),
        name,
      ).toEqual(WEEKDAY_ORDER);
    }
  });

  it("keeps day positions identical whatever the configured default is", () => {
    expect(labelsOf(render({ defaultWeekday: 1 })).map(stripMarker)).toEqual(
      labelsOf(render({ defaultWeekday: 7 })).map(stripMarker),
    );
  });

  it("never annotates a label with a word suffix, and stays inside the width", () => {
    for (const [name, overrides] of Object.entries(FIXTURES)) {
      for (const label of labelsOf(render(overrides))) {
        expect(label, `${name}: ${label}`).not.toContain("(");
        expect(visibleLength(label), `${name}: ${label}`).toBeLessThanOrEqual(
          24,
        );
      }
    }
  });
});

describe("the configured default and the previous rehearsal", () => {
  it("marks the day whose ISO weekday matches the chat's configured default", () => {
    // defaultWeekday is stored 1..7 with MON=1, so 3 is Wednesday: 2026-08-26.
    const labels = labelsOf(render({ defaultWeekday: 3 }));

    expect(nth(labels, 2).startsWith(PLANNING_MARKER_DEFAULT)).toBe(true);
    expect(
      labels.filter((label) => label.startsWith(PLANNING_MARKER_DEFAULT)),
    ).toHaveLength(1);
  });

  it("marks the day equal to the previous rehearsal's chat-local date", () => {
    const labels = labelsOf(
      render({ defaultWeekday: 1, previousRehearsalDate: "2026-08-27" }),
    );

    expect(nth(labels, 3).startsWith(PLANNING_MARKER_PREVIOUS)).toBe(true);
    expect(nth(labels, 0).startsWith(PLANNING_MARKER_DEFAULT)).toBe(true);
  });

  it("shows only the default marker when the two coincide", () => {
    // Wednesday is both the configured default and the last rehearsal's day.
    const labels = labelsOf(
      render({ defaultWeekday: 3, previousRehearsalDate: "2026-08-26" }),
    );

    expect(nth(labels, 2)).toContain(PLANNING_MARKER_DEFAULT);
    expect(nth(labels, 2)).not.toContain(PLANNING_MARKER_PREVIOUS);
    // And it does not reappear anywhere else on the card.
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
  });

  it("renders the full card with no previous marker when there is no previous rehearsal", () => {
    const card = render({ previousRehearsalDate: null });
    const labels = labelsOf(card);

    expect(labels).toHaveLength(7);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
    expect(card.text).not.toContain(PLANNING_DAY_LEGEND.previous);
  });

  it("gives every day at most one marker", () => {
    for (const overrides of Object.values(FIXTURES)) {
      for (const label of labelsOf(render(overrides))) {
        const glyphs = MARKERS.filter((glyph) => label.includes(glyph));
        expect(glyphs.length, label).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("the legend above the keyboard", () => {
  it("names every marker in use and none that is not", () => {
    const card = render({
      defaultWeekday: 3,
      previousRehearsalDate: "2026-08-27",
    });
    const lines = card.text.split("\n");
    const legend = lines.find((line) =>
      line.includes(PLANNING_DAY_LEGEND.default),
    );

    expect(legend).toBeDefined();
    expect(legend).toContain(PLANNING_DAY_LEGEND.previous);
    // Nothing is past in this fixture, so the unavailable marker is not
    // advertised — a legend for a marker that is not on the card is noise.
    expect(legend).not.toContain(PLANNING_DAY_LEGEND.past);
    // The legend is part of the card TEXT, which Telegram renders above the
    // inline keyboard.
    expect(lines.indexOf(legend as string)).toBeGreaterThan(0);
    for (const marker of markersUsed(card)) {
      expect(legend).toContain(marker);
    }
  });

  it("omits the legend entirely when no marker is in use", () => {
    const card = render({ defaultWeekday: null, previousRehearsalDate: null });

    expect(markersUsed(card)).toEqual([]);
    for (const entry of Object.values(PLANNING_DAY_LEGEND)) {
      expect(card.text).not.toContain(entry);
    }
  });
});

describe("rendering is not choosing", () => {
  it("pre-selects nothing and touches no durable state", () => {
    // A marker is a hint about what the band usually does, never a selection:
    // a rehearsal date exists only because a human pressed a button.
    const round = { selectedDate: null as string | null, step: "DAY" };
    const projection = project({
      defaultWeekday: 3,
      previousRehearsalDate: "2026-08-27",
    });

    const first = renderDayStep(projection, (isoDate) => `v1:token-${isoDate}`);
    const second = renderDayStep(
      projection,
      (isoDate) => `v1:token-${isoDate}`,
    );

    expect(round.selectedDate).toBeNull();
    expect(round.step).toBe("DAY");
    expect(first.text).toBe(second.text);
    expect(JSON.stringify(first.keyboard)).toBe(
      JSON.stringify(second.keyboard),
    );
    // Projection in, text out: two parameters, neither of them a client, a
    // repository, or a clock.
    expect(renderDayStep.length).toBe(2);
  });
});
