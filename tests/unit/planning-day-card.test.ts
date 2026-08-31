import { describe, expect, it } from "vitest";

import {
  buildDayStepProjection,
  PlanningService,
  type DayStepInput,
} from "../../src/domain/planning/planning-service.js";
import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
} from "../../src/generated/prisma/client.js";
import { civilNow } from "../../src/infrastructure/time/zoned-clock.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import type { CallbackActionRow } from "../../src/telegram/callbacks.js";
import { dispatchPlanningCallback } from "../../src/telegram/planning-handlers.js";
import {
  PLANNING_BACK_LABEL,
  PLANNING_MARKER_CHOSEN,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
} from "../../src/telegram/keyboards.js";
import {
  PLANNING_CHOSEN_LEGEND,
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

/**
 * Previous-rehearsal dates from the week BEFORE the target week.
 *
 * The marker matches on WEEKDAY, so what a fixture needs to state is "the band
 * last played on a Thursday", not a date inside the week being planned. A date
 * inside the target week is the SUPPRESSED case and has its own fixture.
 */
const LAST_THURSDAY = "2026-08-13";
const LAST_TUESDAY = "2026-08-18";
const LAST_WEDNESDAY = "2026-08-19";

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
    // The first visit to the day step has nothing chosen yet; the Back fixtures
    // below are the ones that arrive carrying an earlier choice (D-03).
    selectedDate: null,
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

/** The label with its leading "you chose this" glyph removed, if it has one. */
function stripChoice(label: string) {
  return label.startsWith(PLANNING_MARKER_CHOSEN)
    ? label.slice(PLANNING_MARKER_CHOSEN.length).trimStart()
    : label;
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
  "previous rehearsal in an earlier week": {
    previousRehearsalDate: LAST_THURSDAY,
  },
  "previous rehearsal inside the target week": {
    previousRehearsalDate: "2026-08-27",
  },
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

  it("marks the target week's day sharing the previous rehearsal's weekday", () => {
    // The band last played on Thursday 2026-08-13, a week BEFORE the week being
    // planned. "You last played on a Thursday" marks this week's Thursday,
    // 2026-08-27 — index 3. Under exact-date matching nothing was marked at
    // all, which made the marker unreachable for every realistic rehearsal.
    const labels = labelsOf(
      render({ defaultWeekday: 1, previousRehearsalDate: LAST_THURSDAY }),
    );

    expect(nth(labels, 3).startsWith(PLANNING_MARKER_PREVIOUS)).toBe(true);
    expect(
      labels.filter((label) => label.startsWith(PLANNING_MARKER_PREVIOUS)),
    ).toHaveLength(1);
    expect(nth(labels, 0).startsWith(PLANNING_MARKER_DEFAULT)).toBe(true);
  });

  it("suppresses the marker when the previous rehearsal is inside the target week", () => {
    // Thursday 2026-08-27 is a day of the very week being chosen from. Calling
    // it "what you did last time" reads as confusion, so nothing is marked and
    // the legend does not advertise a glyph the reader cannot see.
    const card = render({
      defaultWeekday: 1,
      previousRehearsalDate: "2026-08-27",
    });
    const labels = labelsOf(card);

    expect(labels).toHaveLength(7);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
    expect(card.text).not.toContain(PLANNING_DAY_LEGEND.previous);
  });

  it("shows only the default marker when the two coincide", () => {
    // Wednesday is both the configured default and the last rehearsal's
    // weekday, so the two hints genuinely collide on 2026-08-26 — index 2.
    const labels = labelsOf(
      render({ defaultWeekday: 3, previousRehearsalDate: LAST_WEDNESDAY }),
    );

    expect(nth(labels, 2)).toContain(PLANNING_MARKER_DEFAULT);
    expect(nth(labels, 2)).not.toContain(PLANNING_MARKER_PREVIOUS);
    // And it does not reappear anywhere else on the card.
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
  });

  it("still lets a past day beat the previous-rehearsal weekday", () => {
    // The band last played on a Tuesday, but by Thursday this week's Tuesday
    // is gone. A day nobody can pick must not advertise itself as the one the
    // band usually plays — and with the only matching weekday behind us, the
    // legend must not offer to explain a glyph that is nowhere on the card.
    const card = render({
      today: chatToday("2026-08-27T09:00:00Z"),
      defaultWeekday: 5,
      previousRehearsalDate: LAST_TUESDAY,
    });
    const labels = labelsOf(card);

    expect(nth(labels, 1).startsWith(PLANNING_MARKER_UNAVAILABLE)).toBe(true);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
    expect(card.text).not.toContain(PLANNING_DAY_LEGEND.previous);
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
      previousRehearsalDate: LAST_THURSDAY,
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

describe("days that have already gone", () => {
  const unavailable = (labels: readonly string[]) =>
    labels.filter((label) => markerOf(label) === PLANNING_MARKER_UNAVAILABLE);

  it("marks Monday to Wednesday unavailable on a Thursday, and still shows seven", () => {
    const labels = labelsOf(
      render({ today: chatToday("2026-08-27T09:00:00Z") }),
    );

    expect(labels).toHaveLength(7);
    expect(
      labels.map((label) => markerOf(label) === PLANNING_MARKER_UNAVAILABLE),
    ).toEqual([true, true, true, false, false, false, false]);
  });

  it("leaves the card's shape unchanged on the Sunday that closes the week", () => {
    const labels = labelsOf(
      render({ today: chatToday("2026-08-30T09:00:00Z") }),
    );

    expect(labels).toHaveLength(7);
    expect(unavailable(labels)).toHaveLength(6);
  });

  it("renders all seven, every one unavailable, once the week is entirely gone", () => {
    // The "empty" edge: the answer is never an empty or a partial list.
    const card = render({ today: chatToday("2026-09-10T09:00:00Z") });
    const labels = labelsOf(card);

    expect(labels).toHaveLength(7);
    expect(unavailable(labels)).toHaveLength(7);
    expect(card.text).toContain(PLANNING_DAY_LEGEND.past);
  });

  it("classifies by the chat's calendar day, not the process's", () => {
    // 21:30Z on Wednesday 2026-08-26 is already Thursday 00:30 in Kyiv, so the
    // chat has lost a day that UTC still has.
    const instant = "2026-08-26T21:30:00Z";

    expect(
      unavailable(labelsOf(render({ today: chatToday(instant) }))),
    ).toHaveLength(3);
    expect(
      unavailable(labelsOf(render({ today: chatToday(instant, "UTC") }))),
    ).toHaveLength(2);
  });
});

describe("tapping a day that has already gone", () => {
  const NOW = new Date("2026-08-27T09:00:00Z");
  const PAST_DAY = "2026-08-25";
  const CHAT_ID = 42n;
  const AUTHOR_ID = 7n;
  const ROUND_ID = "round-past-day";

  function fixture() {
    const round = {
      id: ROUND_ID,
      chatId: CHAT_ID,
      authorUserId: AUTHOR_ID,
      targetWeekStart: MONDAY,
      activeWeekStart: MONDAY,
      status: PlanningRoundStatus.DRAFT,
      step: PlanningStep.DAY,
      timezone: KYIV,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      selectedDate: null as string | null,
      selectedStartMinute: null as number | null,
      anchorMessageId: 1001,
      startsAt: null as Date | null,
      endsAt: null as Date | null,
      confirmedAt: null as Date | null,
      lastActivityAt: NOW,
      lastStatusPostedAt: null as Date | null,
      revision: 3,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const action = {
      token: createCallbackToken(),
      kind: CallbackActionKind.PLANNING,
      chatId: CHAT_ID,
      actorUserId: AUTHOR_ID,
      targetId: createPlanningTarget({
        action: "day",
        roundId: ROUND_ID,
        date: PAST_DAY,
      }),
      expiresAt: new Date(NOW.getTime() + 60_000),
      consumedAt: null as Date | null,
    };
    return { round, action };
  }

  /**
   * A persistence double that answers the two reads `selectDay` legitimately
   * performs and THROWS on every write. A refusal that quietly consumed the
   * action row would leave the author holding a card whose valid buttons no
   * longer work, so "changes nothing" is asserted by making a change impossible.
   */
  function createReadOnlyPrisma(
    round: Record<string, unknown>,
    action: Record<string, unknown>,
  ) {
    const attempted: string[] = [];
    const forbid = (name: string) => async () => {
      attempted.push(name);
      throw new Error(`unexpected durable write: ${name}`);
    };
    const tx = {
      callbackAction: {
        findUnique: async ({ where }: { where: { token: string } }) =>
          where.token === action.token ? { ...action } : null,
        updateMany: forbid("callbackAction.updateMany"),
        createMany: forbid("callbackAction.createMany"),
      },
      planningRound: {
        findUnique: async () => ({ ...round }),
        findUniqueOrThrow: forbid("planningRound.findUniqueOrThrow"),
        updateMany: forbid("planningRound.updateMany"),
      },
    };
    return {
      attempted,
      prisma: {
        $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
          await run(tx),
      },
    };
  }

  function createCapturingLogger() {
    const written: string[] = [];
    const logger = createLogger({
      destination: {
        write(chunk: string) {
          for (const line of chunk.split("\n")) {
            if (line.trim().length > 0) written.push(line);
          }
        },
      },
    });
    return {
      logger,
      lines: () =>
        written.map((line) => JSON.parse(line) as Record<string, unknown>),
    };
  }

  it("refuses the tap without consuming the action row or touching the round", async () => {
    const { round, action } = fixture();
    const before = structuredClone(round);
    const double = createReadOnlyPrisma(round, action);
    const planning = new PlanningService(double.prisma as never);

    const result = await planning.selectDay(
      CHAT_ID,
      AUTHOR_ID,
      action.token,
      NOW,
    );

    expect(result.kind).toBe("past-day");
    expect(double.attempted).toEqual([]);
    // The row is still spendable, so the author can tap a valid day on the
    // SAME card rather than having to start over.
    expect(action.consumedAt).toBeNull();
    expect(round).toEqual(before);
  });

  it("answers with a private alert, edits nothing, and records one bounded line", async () => {
    const { round, action } = fixture();
    const double = createReadOnlyPrisma(round, action);
    const capture = createCapturingLogger();
    const answers: { text?: string; show_alert?: boolean }[] = [];
    const edits: unknown[] = [];
    const ctx = {
      answerCallbackQuery: async (payload: {
        text?: string;
        show_alert?: boolean;
      }) => {
        answers.push(payload);
      },
      api: {
        editMessageText: async (...args: unknown[]) => {
          edits.push(args);
        },
      },
    };

    await dispatchPlanningCallback(
      ctx as never,
      {
        logger: capture.logger,
        prisma: undefined as never,
        authorization: undefined as never,
        planning: new PlanningService(double.prisma as never),
        now: () => NOW,
      },
      { chatId: CHAT_ID, actorId: AUTHOR_ID },
      action as unknown as CallbackActionRow,
      NOW,
    );

    expect(edits).toEqual([]);
    expect(answers).toHaveLength(1);
    expect(answers[0]?.show_alert).toBe(true);
    expect(answers[0]?.text ?? "").not.toBe("");

    const line = capture.lines().find((entry) => entry.outcome === "past-day");
    expect(
      line,
      "a deliberate no-op that logs nothing is a swallowed failure",
    ).toBeDefined();
    expect(line?.roundId).toBe(ROUND_ID);
    // The tapped date is not on the redactor's allow list and must not appear.
    expect(JSON.stringify(line)).not.toContain(PAST_DAY);
  });
});

describe("rendering is not choosing", () => {
  it("pre-selects nothing and touches no durable state", () => {
    // A marker is a hint about what the band usually does, never a selection:
    // a rehearsal date exists only because a human pressed a button.
    const round = { selectedDate: null as string | null, step: "DAY" };
    const projection = project({
      defaultWeekday: 3,
      previousRehearsalDate: LAST_THURSDAY,
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

describe("the day the author already chose, seen again after Back (D-03)", () => {
  it("marks it as chosen without clearing it and without moving anything", () => {
    // The whole point of D-03: Back returns the author to the previous selector
    // with the earlier choice STILL APPLIED. A day step reached by Back that
    // rendered exactly like a first visit would be cancel-and-restart wearing a
    // different name.
    const chosen = render({ selectedDate: "2026-08-27" });
    const fresh = render({ selectedDate: null });

    expect(labelsOf(chosen).map(stripChoice)).toEqual(labelsOf(fresh));
    expect(nth(labelsOf(chosen), 3).startsWith(PLANNING_MARKER_CHOSEN)).toBe(
      true,
    );
    expect(
      labelsOf(chosen).filter((label) =>
        label.startsWith(PLANNING_MARKER_CHOSEN),
      ),
    ).toHaveLength(1);
  });

  it("keeps the chosen marker and the default marker on the same day", () => {
    // Chosen-ness and the configured default are different facts about a day
    // and a day can be both, so they are separate fields rather than two
    // members of one bounded value. Collapsing them would make this case
    // unrepresentable.
    const projection = project({
      selectedDate: "2026-08-26",
      defaultWeekday: 3,
    });
    const wednesday = projection.days[2];

    expect(wednesday?.isoDate).toBe("2026-08-26");
    expect(wednesday?.chosen).toBe(true);
    expect(wednesday?.marker).toBe("default");

    const label = nth(labelsOf(render({ selectedDate: "2026-08-26" })), 2);
    expect(label).toContain(PLANNING_MARKER_CHOSEN);
    expect(label).toContain(PLANNING_MARKER_DEFAULT);
    expect(visibleLength(label)).toBeLessThanOrEqual(24);
  });

  it("explains the chosen glyph in the legend only when one is in use", () => {
    expect(render({ selectedDate: "2026-08-27" }).text).toContain(
      PLANNING_CHOSEN_LEGEND,
    );
    expect(render({ selectedDate: null }).text).not.toContain(
      PLANNING_CHOSEN_LEGEND,
    );
  });

  it("is still the first step: the day card carries no Back control", () => {
    // There is no step below DAY, so there is nothing for Back to return to.
    for (const label of labelsOf(render({ selectedDate: "2026-08-27" }))) {
      expect(label).not.toContain(PLANNING_BACK_LABEL);
    }
  });
});
