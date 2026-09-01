import { describe, expect, it } from "vitest";

import {
  buildTimeStepProjection,
  PlanningService,
  type ReviewStepProjection,
  type TimeStepInput,
} from "../../src/domain/planning/planning-service.js";
import { formatLocalTime } from "../../src/domain/chat/schedule-validator.js";
import type { RosterMember } from "../../src/domain/roster/roster-service.js";
import { generateSlots } from "../../src/domain/planning/slot-generator.js";
import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
} from "../../src/generated/prisma/client.js";
import { resolveWallClock } from "../../src/infrastructure/time/zoned-clock.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import type { CallbackActionRow } from "../../src/telegram/callbacks.js";
import {
  PLANNING_BACK_LABEL,
  PLANNING_CONFIRM_LABEL,
  PLANNING_MARKER_CHOSEN,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
  PLANNING_TAKEOVER_LABEL,
  type PlanningControlAction,
} from "../../src/telegram/keyboards.js";
import { dispatchPlanningCallback } from "../../src/telegram/planning-handlers.js";
import {
  PLANNING_CHOSEN_LEGEND,
  PLANNING_TIME_LEGEND,
  renderReviewStep,
  renderTimeStep,
} from "../../src/telegram/planning-renderers.js";
import {
  memberLabel,
  sortRosterMembers,
} from "../../src/telegram/roster-renderers.js";

/**
 * REQ-PLAN-06 and REQ-PLAN-07: the time card's shape, its two hints, and the
 * hours it refuses.
 *
 * Deliberately written to read like `planning-day-card.test.ts`, because the
 * two selectors are supposed to BE the same rule seen twice: D-07 asks for one
 * consistent "in the past" treatment across both, and two test files that
 * disagreed about what that looks like would be the first sign the code had
 * grown two rules.
 */

const KYIV = "Europe/Kyiv";
/** Wednesday of the 2026-08-24 target week. */
const CHOSEN_DAY = "2026-08-26";

const hhmm = (hour: number, minute = 0) => hour * 60 + minute;

const DEFAULT_WINDOW = {
  dailyStartMinute: 600,
  dailyEndMinute: 1260,
  durationMinutes: 120,
};

const MARKERS = [
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
] as const;

function project(overrides: Partial<TimeStepInput> = {}) {
  return buildTimeStepProjection({
    timezone: KYIV,
    selectedDate: CHOSEN_DAY,
    window: DEFAULT_WINDOW,
    // The day before the chosen day: nothing is past unless a fixture says so.
    now: new Date("2026-08-25T09:00:00Z"),
    defaultStartMinute: hhmm(10),
    previousRehearsalStartMinute: null,
    // The first visit to the time step has no hour chosen yet; the Back
    // fixtures below are the ones that arrive carrying an earlier choice.
    selectedStartMinute: null,
    ...overrides,
  });
}

type RenderedCard = Readonly<{
  text: string;
  keyboard: { inline_keyboard: readonly (readonly { text: string }[])[] };
}>;

function render(overrides: Partial<TimeStepInput> = {}): RenderedCard {
  return renderTimeStep(
    project(overrides),
    (startMinute) => `v1:token-${startMinute}`,
  ) as unknown as RenderedCard;
}

function labelsOf(card: RenderedCard): string[] {
  return card.keyboard.inline_keyboard.flatMap((row) =>
    row.map((button) => button.text),
  );
}

function markerOf(label: string) {
  return MARKERS.find((glyph) => label.startsWith(glyph)) ?? null;
}

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

const unavailableLabels = (labels: readonly string[]) =>
  labels.filter((label) => markerOf(label) === PLANNING_MARKER_UNAVAILABLE);

describe("the shape of the time card", () => {
  it("offers one button per generated slot, in the declared 3/3/3/1 rows", () => {
    const card = render();

    expect(labelsOf(card)).toHaveLength(generateSlots(DEFAULT_WINDOW).length);
    expect(labelsOf(card)).toHaveLength(10);
    expect(card.keyboard.inline_keyboard.map((row) => row.length)).toEqual([
      3, 3, 3, 1,
    ]);
  });

  it("keeps slot positions identical whatever the markers are", () => {
    const plain = labelsOf(render({ defaultStartMinute: null })).map(
      stripMarker,
    );
    const marked = labelsOf(
      render({
        defaultStartMinute: hhmm(10),
        previousRehearsalStartMinute: hhmm(15),
      }),
    ).map(stripMarker);

    expect(marked).toEqual(plain);
    expect(plain).toEqual([
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

  it("never annotates a label with a word suffix, and stays inside the width", () => {
    for (const label of labelsOf(
      render({
        defaultStartMinute: hhmm(10),
        previousRehearsalStartMinute: hhmm(15),
        now: new Date("2026-08-26T10:30:00Z"),
      }),
    )) {
      expect(label, label).not.toContain("(");
      expect([...label].length, label).toBeLessThanOrEqual(24);
    }
  });

  it("names the chosen day so the author knows what they are timing", () => {
    // Rendered from the civil pair, not from any instant (DST policy rule 5).
    expect(render().text).toContain("Wed 26 Aug");
  });
});

describe("the usual time and the last one", () => {
  it("marks the slot matching the chat's configured default start", () => {
    const labels = labelsOf(render({ defaultStartMinute: hhmm(15) }));

    expect(labels[5]?.startsWith(PLANNING_MARKER_DEFAULT)).toBe(true);
    expect(stripMarker(labels[5] ?? "")).toBe("15:00");
    expect(
      labels.filter((label) => label.startsWith(PLANNING_MARKER_DEFAULT)),
    ).toHaveLength(1);
  });

  it("marks the slot matching the previous rehearsal's chat-local start", () => {
    const labels = labelsOf(
      render({
        defaultStartMinute: hhmm(10),
        previousRehearsalStartMinute: hhmm(18),
      }),
    );

    expect(labels[8]?.startsWith(PLANNING_MARKER_PREVIOUS)).toBe(true);
    expect(stripMarker(labels[8] ?? "")).toBe("18:00");
    expect(labels[0]?.startsWith(PLANNING_MARKER_DEFAULT)).toBe(true);
  });

  it("shows only the default marker when the two coincide", () => {
    // D-08's tie rule, mirroring the day card. The order in `classifySlot` is
    // what resolves it, so there is nowhere to put a second marker even if a
    // later edit wanted one.
    const labels = labelsOf(
      render({
        defaultStartMinute: hhmm(14),
        previousRehearsalStartMinute: hhmm(14),
      }),
    );

    expect(labels[4]).toContain(PLANNING_MARKER_DEFAULT);
    expect(labels[4]).not.toContain(PLANNING_MARKER_PREVIOUS);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
  });

  it("renders every slot and no previous marker when there is no previous rehearsal", () => {
    const card = render({ previousRehearsalStartMinute: null });
    const labels = labelsOf(card);

    expect(labels).toHaveLength(10);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_PREVIOUS)),
    ).toBe(false);
    expect(card.text).not.toContain(PLANNING_TIME_LEGEND.previous);
  });

  it("lets an unavailable hour beat both hints", () => {
    // A slot nobody can pick must not advertise itself as the usual one — the
    // same ordering the day card uses for a past day.
    const labels = labelsOf(
      render({
        now: new Date("2026-08-26T10:30:00Z"),
        defaultStartMinute: hhmm(10),
        previousRehearsalStartMinute: hhmm(11),
      }),
    );

    expect(labels[0]?.startsWith(PLANNING_MARKER_UNAVAILABLE)).toBe(true);
    expect(labels[1]?.startsWith(PLANNING_MARKER_UNAVAILABLE)).toBe(true);
    expect(
      labels.some((label) => label.includes(PLANNING_MARKER_DEFAULT)),
    ).toBe(false);
  });

  it("gives every slot at most one marker", () => {
    for (const label of labelsOf(
      render({
        now: new Date("2026-08-26T10:30:00Z"),
        defaultStartMinute: hhmm(15),
        previousRehearsalStartMinute: hhmm(16),
      }),
    )) {
      expect(
        MARKERS.filter((glyph) => label.includes(glyph)).length,
        label,
      ).toBeLessThanOrEqual(1);
    }
  });
});

describe("the legend above the keyboard", () => {
  it("names every marker in use and none that is not", () => {
    const card = render({
      defaultStartMinute: hhmm(10),
      previousRehearsalStartMinute: hhmm(15),
    });
    const lines = card.text.split("\n");
    const legend = lines.find((line) =>
      line.includes(PLANNING_TIME_LEGEND.default),
    );

    expect(legend).toBeDefined();
    expect(legend).toContain(PLANNING_TIME_LEGEND.previous);
    // Nothing is unavailable in this fixture, so that glyph is not advertised.
    expect(legend).not.toContain(PLANNING_TIME_LEGEND.unavailable);
    expect(lines.indexOf(legend as string)).toBeGreaterThan(0);
  });

  it("omits the legend entirely when no marker is in use", () => {
    const card = render({
      defaultStartMinute: null,
      previousRehearsalStartMinute: null,
    });

    for (const entry of Object.values(PLANNING_TIME_LEGEND)) {
      expect(card.text).not.toContain(entry);
    }
  });
});

describe("hours that have already gone on the chosen day", () => {
  it("marks the four hours behind a 13:30 chat clock and still shows ten", () => {
    // 10:30 UTC is 13:30 in Kyiv, so 10:00, 11:00, 12:00 and 13:00 are behind
    // the chat and 14:00 onwards is not. All ten stay on the card: visible,
    // marked, refused (D-07, D-05).
    const labels = labelsOf(
      render({
        selectedDate: CHOSEN_DAY,
        now: new Date("2026-08-26T10:30:00Z"),
      }),
    );

    expect(labels).toHaveLength(10);
    expect(unavailableLabels(labels)).toHaveLength(4);
    expect(
      labels.map((label) => markerOf(label) === PLANNING_MARKER_UNAVAILABLE),
    ).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("marks nothing unavailable on a day still ahead", () => {
    const labels = labelsOf(
      render({
        selectedDate: "2026-08-28",
        now: new Date("2026-08-26T10:30:00Z"),
      }),
    );

    expect(labels).toHaveLength(10);
    expect(unavailableLabels(labels)).toHaveLength(0);
  });
});

describe("an hour that does not exist on the chosen day", () => {
  /**
   * Kyiv springs forward at 03:00 on 2027-03-28, so that wall clock never
   * happens. The default 10:00-19:00 window never meets a transition — that is
   * the reassurance `zoned-clock.test.ts` asserts — so the window here is
   * constructed to straddle the gap deliberately.
   */
  const SPRING_FORWARD = "2027-03-28";
  const GAP_WINDOW = {
    dailyStartMinute: hhmm(1),
    dailyEndMinute: hhmm(6),
    durationMinutes: 60,
  };
  const BEFORE_THE_DAY = new Date("2027-03-01T00:00:00Z");

  const gapCard = () =>
    render({
      selectedDate: SPRING_FORWARD,
      window: GAP_WINDOW,
      now: BEFORE_THE_DAY,
      defaultStartMinute: hhmm(3),
      previousRehearsalStartMinute: null,
    });

  it("still renders the slot, and marks it with the unavailable glyph", () => {
    const labels = labelsOf(gapCard());

    expect(labels.map(stripMarker)).toEqual([
      "01:00",
      "02:00",
      "03:00",
      "04:00",
      "05:00",
    ]);
    expect(labels[2]?.startsWith(PLANNING_MARKER_UNAVAILABLE)).toBe(true);
    // Even though 03:00 is the configured default: unavailable wins.
    expect(labels[2]).not.toContain(PLANNING_MARKER_DEFAULT);
    expect(unavailableLabels(labels)).toHaveLength(1);
  });

  it("refuses it rather than relocating it to a neighbouring hour", () => {
    // The prohibition. A shifted slot would show 03:00 and mean 04:00, and the
    // band would arrive an hour after the rehearsal started. Asserted two ways:
    // the skipped wall clock yields no instant at all, and every slot that DOES
    // resolve lands on its own distinct instant, so nothing collapsed onto a
    // neighbour.
    const slots = project({
      selectedDate: SPRING_FORWARD,
      window: GAP_WINDOW,
      now: BEFORE_THE_DAY,
    }).slots;
    const resolved = slots.map((slot) =>
      resolveWallClock(KYIV, 2027, 3, 28, slot.startMinute),
    );

    expect(resolved[2]?.kind).toBe("skipped");
    const instants = resolved.flatMap((resolution) =>
      resolution.kind === "skipped" ? [] : [resolution.instantMs],
    );
    expect(instants).toHaveLength(4);
    expect(new Set(instants).size).toBe(4);
  });
});

/** Shared fixture for the tap tests below. */
const CHAT_ID = 4242n;
const AUTHOR_ID = 77n;
const ROUND_ID = "round-time-step";
/** 2026-08-26 13:30 in Kyiv. */
const NOW = new Date("2026-08-26T10:30:00Z");

function createRound(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUND_ID,
    chatId: CHAT_ID,
    authorUserId: AUTHOR_ID,
    targetWeekStart: "2026-08-24",
    activeWeekStart: "2026-08-24",
    status: PlanningRoundStatus.DRAFT,
    step: PlanningStep.TIME,
    timezone: KYIV,
    durationMinutes: 120,
    dailyStartMinute: 600,
    dailyEndMinute: 1260,
    selectedDate: CHOSEN_DAY as string | null,
    selectedStartMinute: null as number | null,
    anchorMessageId: 2001,
    startsAt: null as Date | null,
    endsAt: null as Date | null,
    confirmedAt: null as Date | null,
    lastActivityAt: NOW,
    lastStatusPostedAt: null as Date | null,
    revision: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createAction(startMinute: number) {
  return {
    token: createCallbackToken(),
    kind: CallbackActionKind.PLANNING,
    chatId: CHAT_ID,
    actorUserId: AUTHOR_ID,
    targetId: createPlanningTarget({
      action: "time",
      roundId: ROUND_ID,
      startMinute,
    }),
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null as Date | null,
  };
}

/** Answers the reads `selectTime` legitimately performs; THROWS on any write. */
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

/** A double that actually applies the two writes an advance is allowed to make. */
function createWritablePrisma(
  round: Record<string, unknown>,
  action: Record<string, unknown>,
) {
  const created: unknown[] = [];
  const tx = {
    callbackAction: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === action.token ? { ...action } : null,
      updateMany: async ({ where }: { where: { token: string } }) => {
        if (where.token !== action.token || action.consumedAt !== null) {
          return { count: 0 };
        }
        action.consumedAt = NOW;
        return { count: 1 };
      },
      createMany: async ({ data }: { data: unknown }) => {
        created.push(data);
        return { count: Array.isArray(data) ? data.length : 0 };
      },
    },
    planningRound: {
      findUnique: async () => ({ ...round }),
      findUniqueOrThrow: async () => ({ ...round }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { revision?: number };
        data: Record<string, unknown>;
      }) => {
        if (where.revision !== round.revision) return { count: 0 };
        round.step = data.step;
        round.selectedStartMinute = data.selectedStartMinute;
        round.lastActivityAt = data.lastActivityAt;
        round.revision = (round.revision as number) + 1;
        return { count: 1 };
      },
    },
  };
  return {
    created,
    prisma: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
        await run(tx),
      // The review card the advance lands on reads the chat's active roster as
      // its lineup (D-09), so the double has to answer that read too.
      chatMembership: { findMany: async () => [] },
      // Every card names its current owner (D-02/D-13), so every render reads
      // the author's stored identity. Answering null here is the masked-label
      // case, which is what an author with no `telegram_users` row produces.
      telegramUser: { findUnique: async () => null },
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

function createTelegramDouble() {
  const answers: { text?: string; show_alert?: boolean }[] = [];
  const edits: unknown[] = [];
  const sends: unknown[] = [];
  const ctx = {
    answerCallbackQuery: async (payload: {
      text?: string;
      show_alert?: boolean;
    }) => {
      answers.push(payload);
    },
    reply: async (...args: unknown[]) => {
      sends.push(args);
    },
    api: {
      editMessageText: async (...args: unknown[]) => {
        edits.push(args);
      },
      sendMessage: async (...args: unknown[]) => {
        sends.push(args);
      },
    },
  };
  return { ctx, answers, edits, sends };
}

async function dispatch(
  prisma: unknown,
  action: Record<string, unknown>,
  logger = createCapturingLogger(),
) {
  const telegram = createTelegramDouble();
  await dispatchPlanningCallback(
    telegram.ctx as never,
    {
      logger: logger.logger,
      prisma: undefined as never,
      authorization: undefined as never,
      planning: new PlanningService(prisma as never),
      now: () => NOW,
    },
    { chatId: CHAT_ID, actorId: AUTHOR_ID },
    action as unknown as CallbackActionRow,
    NOW,
  );
  return { ...telegram, logger };
}

describe("picking a valid hour", () => {
  it("persists the minute, advances to review, and edits the one anchor card", async () => {
    const round = createRound();
    const action = createAction(hhmm(15));
    const double = createWritablePrisma(round, action);

    const result = await new PlanningService(double.prisma as never).selectTime(
      CHAT_ID,
      AUTHOR_ID,
      action.token as string,
      NOW,
    );

    expect(result.kind).toBe("advanced");
    expect(round.selectedStartMinute).toBe(hhmm(15));
    expect(round.step).toBe(PlanningStep.REVIEW);
    expect(round.revision).toBe(5);
    expect(action.consumedAt).toBe(NOW);
  });

  it("issues exactly one editMessageText and no second message (D-01)", async () => {
    const round = createRound({ anchorMessageId: 2011 });
    const action = createAction(hhmm(16));
    const double = createWritablePrisma(round, action);

    const run = await dispatch(double.prisma, action);

    expect(run.edits).toHaveLength(1);
    expect(run.sends).toHaveLength(0);
    expect(
      run.logger.lines().some((line) => line.outcome === "time-selected"),
    ).toBe(true);
  });
});

describe("tapping an hour that cannot be picked", () => {
  const refusals = [
    {
      name: "an hour already behind the chat's clock",
      startMinute: hhmm(11),
      round: () => createRound(),
      kind: "past-slot",
      outcome: "past-slot",
    },
    {
      name: "an hour that does not exist because the clocks changed",
      startMinute: hhmm(3),
      round: () =>
        createRound({
          selectedDate: "2027-03-28",
          dailyStartMinute: hhmm(1),
          dailyEndMinute: hhmm(6),
          durationMinutes: 60,
        }),
      kind: "nonexistent-slot",
      outcome: "nonexistent-slot",
    },
  ] as const;

  it("refuses without consuming the action row or touching the round", async () => {
    for (const refusal of refusals) {
      const round = refusal.round();
      const before = structuredClone(round);
      const action = createAction(refusal.startMinute);
      const double = createReadOnlyPrisma(round, action);

      const result = await new PlanningService(
        double.prisma as never,
      ).selectTime(CHAT_ID, AUTHOR_ID, action.token, NOW);

      expect(result.kind, refusal.name).toBe(refusal.kind);
      expect(double.attempted, refusal.name).toEqual([]);
      // Still spendable, so the author can pick a valid hour on the SAME card.
      expect(action.consumedAt, refusal.name).toBeNull();
      expect(round, refusal.name).toEqual(before);
    }
  });

  it("answers a private alert, edits nothing, and logs one bounded line", async () => {
    for (const refusal of refusals) {
      const round = refusal.round();
      const action = createAction(refusal.startMinute);
      const double = createReadOnlyPrisma(round, action);

      const run = await dispatch(double.prisma, action);

      expect(run.edits, refusal.name).toEqual([]);
      expect(run.answers, refusal.name).toHaveLength(1);
      expect(run.answers[0]?.show_alert, refusal.name).toBe(true);
      expect(run.answers[0]?.text ?? "", refusal.name).not.toBe("");

      const line = run.logger
        .lines()
        .find((entry) => entry.outcome === refusal.outcome);
      expect(line, refusal.name).toBeDefined();
      expect(line?.roundId, refusal.name).toBe(ROUND_ID);
      expect(typeof line?.reason, refusal.name).toBe("string");
      // The chosen minute, the date and the chat's timezone are not on the
      // redactor's allow list, so no field may carry them — `timezone` in
      // particular is a location proxy excluded by threat T-01-21-03.
      for (const forbidden of [
        "minute",
        "startMinute",
        "date",
        "selectedDate",
        "timezone",
        "weekStart",
      ]) {
        expect(Object.keys(line ?? {}), refusal.name).not.toContain(forbidden);
      }
      expect(Object.values(line ?? {}), refusal.name).not.toContain(
        refusal.startMinute,
      );
    }
  });

  it("tells the two refusals apart in the logs and in what it says", async () => {
    // "This hour has passed" and "this hour does not exist in this chat's time
    // zone" are different facts. They share a glyph on the card by design
    // (D-07), but an operator reading the logs must still be able to tell which
    // one happened.
    const [past, gap] = await Promise.all(
      refusals.map(async (refusal) => {
        const action = createAction(refusal.startMinute);
        const double = createReadOnlyPrisma(refusal.round(), action);
        const run = await dispatch(double.prisma, action);
        return {
          reason: run.logger
            .lines()
            .find((entry) => entry.outcome === refusal.outcome)?.reason,
          text: run.answers[0]?.text,
        };
      }),
    );

    expect(past?.reason).toBeDefined();
    expect(gap?.reason).toBeDefined();
    expect(past?.reason).not.toBe(gap?.reason);
    expect(past?.text).not.toBe(gap?.text);
  });

  it("refuses a minute the round's own window does not admit", async () => {
    // T-02-18: rendering is not authority. A syntactically valid minute that
    // the window never offered must be refused, never applied — even though it
    // is neither past nor nonexistent.
    const round = createRound();
    const before = structuredClone(round);
    const action = createAction(hhmm(9));
    const double = createReadOnlyPrisma(round, action);

    const result = await new PlanningService(double.prisma as never).selectTime(
      CHAT_ID,
      AUTHOR_ID,
      action.token,
      NOW,
    );

    expect(result.kind).toBe("stale");
    expect(double.attempted).toEqual([]);
    expect(round).toEqual(before);
  });
});

describe("rendering is not choosing", () => {
  it("pre-selects nothing, writes nothing, and mints no shortcut", () => {
    // A marker is a hint about what the band usually does, never a selection.
    const round = createRound();
    const projection = project({
      defaultStartMinute: hhmm(10),
      previousRehearsalStartMinute: hhmm(15),
    });

    const first = renderTimeStep(projection, (m) => `v1:token-${m}`);
    const second = renderTimeStep(projection, (m) => `v1:token-${m}`);

    expect(round.selectedStartMinute).toBeNull();
    expect(round.step).toBe(PlanningStep.TIME);
    expect(first.text).toBe(second.text);
    expect(JSON.stringify(first.keyboard)).toBe(
      JSON.stringify(second.keyboard),
    );
    // Projection in, card out: two parameters, neither a client, a repository,
    // nor a clock.
    expect(renderTimeStep.length).toBe(2);
    // And there is exactly one button per generated slot — no extra "use the
    // usual time" one-tap shortcut hiding among them.
    expect(labelsOf(first as unknown as RenderedCard)).toHaveLength(
      projection.slots.length,
    );
  });
});

/* ------------------------------------------------------------------------ *
 * D-03: Back on every step after the first, and the review card it returns to
 * ------------------------------------------------------------------------ */

/**
 * The time card as the wizard actually ships it: slots plus a Back control.
 *
 * `minted` names exactly which controls have a token behind them, for the same
 * reason `reviewCard` does: the ordinary time step mints Back and nothing else,
 * and a stub that answered every control would put a Take over button on a card
 * no administrator ever asked for.
 */
function renderWithBack(
  overrides: Partial<TimeStepInput> = {},
  minted: readonly PlanningControlAction[] = ["back"],
): RenderedCard {
  return renderTimeStep(
    project(overrides),
    (startMinute) => `v1:token-${startMinute}`,
    (control) => (minted.includes(control) ? `v1:token-${control}` : undefined),
  ) as unknown as RenderedCard;
}

function rowsOf(card: RenderedCard) {
  return card.keyboard.inline_keyboard.map((row) =>
    row.map((button) => button.text),
  );
}

describe("the Back control on the time step", () => {
  it("carries Back on its own trailing row, after every slot", () => {
    const rows = rowsOf(renderWithBack());

    expect(rows.map((row) => row.length)).toEqual([3, 3, 3, 1, 1]);
    expect(rows.at(-1)).toEqual([PLANNING_BACK_LABEL]);
    // The slots themselves are untouched by the added row.
    expect(rows.slice(0, 4).flat()).toEqual(
      labelsOf(render()).map((label) => label),
    );
  });

  it("adds the Take over control on its own trailing row when one is minted", () => {
    // The one control whose presence depends on who the card is drawn for. It
    // goes through the same declared-row mechanism as Back — one control per
    // row, never sharing — because it carries the widest label on the card and
    // sharing a row is what truncated a label in Phase 1 (F-9).
    const rows = rowsOf(renderWithBack({}, ["back", "takeover"]));

    expect(rows.map((row) => row.length)).toEqual([3, 3, 3, 1, 1, 1]);
    expect(rows.at(-2)).toEqual([PLANNING_BACK_LABEL]);
    expect(rows.at(-1)).toEqual([PLANNING_TAKEOVER_LABEL]);
  });

  it("omits the row entirely when no Back action was minted", () => {
    // `tokenFor` answering `undefined` is how an unminted control disappears;
    // an unbacked button would be a control with nothing behind it.
    const rows = rowsOf(
      renderTimeStep(
        project(),
        (startMinute) => `v1:token-${startMinute}`,
        () => undefined,
      ) as unknown as RenderedCard,
    );

    expect(rows.map((row) => row.length)).toEqual([3, 3, 3, 1]);
    expect(rows.flat()).not.toContain(PLANNING_BACK_LABEL);
  });

  it("marks the hour the author already chose, without clearing it", () => {
    const chosen = render({ selectedStartMinute: hhmm(15) });
    const labels = labelsOf(chosen);

    expect(labels[5]?.startsWith(PLANNING_MARKER_CHOSEN)).toBe(true);
    expect(stripChoice(labels[5] ?? "")).toBe("15:00");
    expect(
      labels.filter((label) => label.startsWith(PLANNING_MARKER_CHOSEN)),
    ).toHaveLength(1);
    // Chosen and "the usual time" are separate facts, and 10:00 is both here.
    const both = labelsOf(
      render({ selectedStartMinute: hhmm(10), defaultStartMinute: hhmm(10) }),
    );
    expect(both[0]).toContain(PLANNING_MARKER_CHOSEN);
    expect(both[0]).toContain(PLANNING_MARKER_DEFAULT);
    expect([...(both[0] ?? "")].length).toBeLessThanOrEqual(24);
    expect(chosen.text).toContain(PLANNING_CHOSEN_LEGEND);
    expect(render().text).not.toContain(PLANNING_CHOSEN_LEGEND);
  });
});

/** A double that applies the writes a `back` transition is allowed to make. */
function createBackPrisma(
  round: Record<string, unknown>,
  action: Record<string, unknown>,
) {
  const minted: Record<string, unknown>[] = [];
  const tx = {
    callbackAction: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === action.token ? { ...action } : null,
      updateMany: async ({ where }: { where: { token: string } }) => {
        if (where.token !== action.token || action.consumedAt !== null) {
          return { count: 0 };
        }
        action.consumedAt = NOW;
        return { count: 1 };
      },
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        minted.push(...data);
        return { count: data.length };
      },
    },
    planningRound: {
      findUnique: async () => ({ ...round }),
      findUniqueOrThrow: async () => ({ ...round }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { revision?: number; step?: string };
        data: Record<string, unknown>;
      }) => {
        if (where.revision !== round.revision) return { count: 0 };
        if (where.step !== undefined && where.step !== round.step) {
          return { count: 0 };
        }
        for (const [key, value] of Object.entries(data)) {
          if (key === "revision") {
            round.revision = (round.revision as number) + 1;
          } else {
            round[key] = value;
          }
        }
        return { count: 1 };
      },
    },
    // The D-02 refusal names the owner, so it reads the author's stored
    // identity. An author with no `telegram_users` row answers null here and
    // `memberLabel` falls back to the masked form — the case this double pins.
    telegramUser: { findUnique: async () => null },
  };
  return {
    minted,
    targets: () =>
      minted.map(
        (row) =>
          JSON.parse(String(row.targetId)) as Record<string, unknown> & {
            action: string;
          },
      ),
    prisma: {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
        await run(tx),
    },
  };
}

function createBackAction(overrides: Record<string, unknown> = {}) {
  return {
    token: createCallbackToken(),
    kind: CallbackActionKind.PLANNING,
    chatId: CHAT_ID,
    actorUserId: AUTHOR_ID,
    targetId: createPlanningTarget({ action: "back", roundId: ROUND_ID }),
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null as Date | null,
    ...overrides,
  };
}

describe("walking backwards through the wizard (D-03)", () => {
  it("returns from the time step to the day step with the day still chosen", async () => {
    const round = createRound({
      step: PlanningStep.TIME,
      selectedDate: "2026-08-27",
    });
    const action = createBackAction();
    const double = createBackPrisma(round, action);

    const result = await new PlanningService(double.prisma as never).back(
      CHAT_ID,
      AUTHOR_ID,
      action.token,
      NOW,
    );

    expect(result.kind).toBe("moved");
    expect(round.step).toBe(PlanningStep.DAY);
    // The load-bearing assertion: the earlier choice is APPLIED, not cleared.
    // Clearing it is exactly the cancel-and-restart behaviour D-03 forbids.
    expect(round.selectedDate).toBe("2026-08-27");
    expect(round.revision).toBe(5);
    expect(action.consumedAt).toBe(NOW);
    // The destination step's actions are minted in the same transaction, and
    // the day step is the first one — so no Back target is among them.
    expect(double.targets().map((target) => target.action)).toEqual(
      Array.from({ length: 7 }, () => "day"),
    );
  });

  it("returns from the review step to the time step with the hour still chosen", async () => {
    const round = createRound({
      step: PlanningStep.REVIEW,
      selectedDate: "2026-08-27",
      selectedStartMinute: hhmm(15),
    });
    const action = createBackAction();
    const double = createBackPrisma(round, action);

    const result = await new PlanningService(double.prisma as never).back(
      CHAT_ID,
      AUTHOR_ID,
      action.token,
      NOW,
    );

    expect(result.kind).toBe("moved");
    expect(round.step).toBe(PlanningStep.TIME);
    expect(round.selectedStartMinute).toBe(hhmm(15));
    expect(round.selectedDate).toBe("2026-08-27");
    // The time step is not the first, so it mints its own Back alongside the
    // ten hours: the author can keep walking backwards.
    const actions = double.targets().map((target) => target.action);
    expect(actions.filter((entry) => entry === "time")).toHaveLength(10);
    expect(actions.filter((entry) => entry === "back")).toHaveLength(1);
  });

  it("lands on the day step after two Backs, never on an error", async () => {
    const round = createRound({
      step: PlanningStep.REVIEW,
      selectedDate: "2026-08-27",
      selectedStartMinute: hhmm(15),
    });

    for (const expected of [PlanningStep.TIME, PlanningStep.DAY]) {
      const action = createBackAction();
      const result = await new PlanningService(
        createBackPrisma(round, action).prisma as never,
      ).back(CHAT_ID, AUTHOR_ID, action.token, NOW);

      expect(result.kind).toBe("moved");
      expect(round.step).toBe(expected);
    }
    expect(round.selectedDate).toBe("2026-08-27");
    expect(round.selectedStartMinute).toBe(hhmm(15));
  });

  it("refuses a Back that would move the round below the first step", async () => {
    // There is no step under DAY. The parser accepts the target — it is a
    // legitimate planning action shape — so the refusal has to be a decision
    // the service makes about the round, not one the schema makes for it.
    const round = createRound({ step: PlanningStep.DAY, selectedDate: null });
    const before = structuredClone(round);
    const action = createBackAction();
    const double = createBackPrisma(round, action);

    const result = await new PlanningService(double.prisma as never).back(
      CHAT_ID,
      AUTHOR_ID,
      action.token,
      NOW,
    );

    expect(result.kind).toBe("stale");
    expect(round).toEqual(before);
    expect(action.consumedAt).toBeNull();
    expect(double.minted).toEqual([]);
  });

  it("refuses a replayed Back and a Back from anyone but the author", async () => {
    const spent = createRound({
      step: PlanningStep.TIME,
      selectedDate: "2026-08-27",
    });
    const spentAction = createBackAction({ consumedAt: NOW });
    expect(
      (
        await new PlanningService(
          createBackPrisma(spent, spentAction).prisma as never,
        ).back(CHAT_ID, AUTHOR_ID, spentAction.token, NOW)
      ).kind,
    ).toBe("duplicate");

    const owned = createRound({
      step: PlanningStep.TIME,
      selectedDate: "2026-08-27",
    });
    const otherAction = createBackAction();
    expect(
      (
        await new PlanningService(
          createBackPrisma(owned, otherAction).prisma as never,
        ).back(CHAT_ID, 999n, otherAction.token, NOW)
      ).kind,
    ).toBe("not-author");
    expect(owned.step).toBe(PlanningStep.TIME);
  });
});

/* ------------------------------------------------------------------------ *
 * The review card: exactly what Confirm is about to commit (D-04/D-09/D-11)
 * ------------------------------------------------------------------------ */

const LINEUP: readonly RosterMember[] = [
  {
    membershipId: "m-zoe",
    telegramUserId: 31n,
    firstName: "Zoe",
    lastName: null,
    username: "zoe",
  },
  {
    membershipId: "m-ada",
    telegramUserId: 32n,
    firstName: "Ada",
    lastName: "Byron",
    username: null,
  },
  {
    membershipId: "m-anon",
    telegramUserId: 9876543210n,
    firstName: null,
    lastName: null,
    username: null,
  },
];

function reviewProjection(
  overrides: Partial<ReviewStepProjection> = {},
): ReviewStepProjection {
  return {
    selectedDate: "2026-08-27",
    startMinute: hhmm(15),
    durationMinutes: 120,
    members: LINEUP,
    ...overrides,
  };
}

/**
 * The review card as the wizard actually ships it.
 *
 * The control lookup answers a token for exactly the controls the review step
 * MINTS and `undefined` for everything else. A stub that answered a token for
 * any control asked of it would render every control the renderer knows about,
 * so the card under test would stop being the card the wizard produces — and
 * the "no dead control" guarantee below would be asserted against a fiction.
 */
function reviewCard(
  overrides: Partial<ReviewStepProjection> = {},
  minted: readonly PlanningControlAction[] = ["confirm", "back"],
): RenderedCard {
  return renderReviewStep(reviewProjection(overrides), (control) =>
    minted.includes(control) ? `v1:token-${control}` : undefined,
  ) as unknown as RenderedCard;
}

describe("the review card", () => {
  it("names the day, the time and the duration it is about to commit", () => {
    const text = reviewCard().text;

    // Rendered from the CIVIL pair, never from an instant (DST policy rule 5),
    // so a later timezone change still shows the day the band agreed on.
    expect(text).toContain("Thu 27 Aug");
    expect(text).toContain(formatLocalTime(hhmm(15)));
    expect(text).toContain("120");
  });

  it("lists the active roster as the lineup, ordered and safely labelled", () => {
    // D-09: there is no participant-selection step. The active roster IS the
    // lineup, so the card shows exactly the rows Confirm will snapshot.
    const text = reviewCard().text;
    const ordered = sortRosterMembers(LINEUP).map((member) =>
      memberLabel(member),
    );

    for (const label of ordered) expect(text).toContain(label);
    const positions = ordered.map((label) => text.indexOf(label));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // T-01-21: a complete numeric Telegram id never reaches chat text.
    expect(text).not.toContain("9876543210");
    expect(text).toContain("••••3210");
  });

  it("escapes a member's display name in the rendered card, exactly once", () => {
    // The assertion drives the RENDERED STRING, not the label helper in
    // isolation: a second escaper introduced in the renderer would double-encode
    // and this is the fixture that would notice.
    const text = reviewCard({
      members: [
        {
          membershipId: "m-x",
          telegramUserId: 41n,
          firstName: "<b>Rock</b>",
          lastName: "& Roll",
          username: null,
        },
      ],
    }).text;
    const body = text.split("\n").slice(1).join("\n");

    expect(body).not.toContain("<b>Rock");
    expect(body).toContain("&lt;b&gt;Rock&lt;/b&gt;");
    expect(body).toContain("&amp; Roll");
    expect(body).not.toContain("&amp;amp;");
    expect(body).not.toContain("&amp;lt;");
  });

  it("carries Confirm and Back in declared rows, one control per row", () => {
    const rows = rowsOf(reviewCard());

    expect(rows).toEqual([[PLANNING_CONFIRM_LABEL], [PLANNING_BACK_LABEL]]);
  });

  it("says the availability round is next and ships no dead control", () => {
    // D-04: the phase ends at a durably confirmed proposal. No placeholder and
    // no disabled publish button.
    const card = reviewCard();

    expect(card.text.toLowerCase()).toContain("availability");
    for (const forbidden of [
      "coming soon",
      "placeholder",
      "not yet",
      "disabled",
      "todo",
    ]) {
      expect(card.text.toLowerCase(), forbidden).not.toContain(forbidden);
    }
    expect(rowsOf(card).flat()).toHaveLength(2);
  });

  it("stays a projection-in, card-out function", () => {
    const projection = reviewProjection();
    const first = renderReviewStep(projection, () => "v1:token");
    const second = renderReviewStep(projection, () => "v1:token");

    expect(first.text).toBe(second.text);
    expect(JSON.stringify(first.keyboard)).toBe(
      JSON.stringify(second.keyboard),
    );
    expect(renderReviewStep.length).toBe(2);
  });
});
