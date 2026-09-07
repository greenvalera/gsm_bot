import { describe, expect, it } from "vitest";

import { PlanningService } from "../../src/domain/planning/planning-service.js";
import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
} from "../../src/generated/prisma/client.js";
import {
  createCallbackToken,
  createPlanningTarget,
  type PlanningTargetAction,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import type { CallbackActionRow } from "../../src/telegram/callbacks.js";
import { dispatchPlanningCallback } from "../../src/telegram/planning-handlers.js";
import { memberLabel } from "../../src/telegram/roster-renderers.js";

/**
 * D-02: any member may WATCH the card; only its author may MOVE it.
 *
 * The refusal has three separate promises and this file pins all three, because
 * failing any one of them turns a polite no-op into a defect:
 *
 *  1. it names the owner, so a bystander learns whose round it is rather than
 *     being told the button expired;
 *  2. it mutates NOTHING — no step, no revision, and the tapped `CallbackAction`
 *     row survives, because that row belongs to the author and a bystander's tap
 *     must not spend it; and
 *  3. it names the owner through `memberLabel`, the one identity function that
 *     carries the `Telegram user ••••NNNN` mask (threat T-01-21), so a full
 *     numeric Telegram id can never reach chat-visible text.
 *
 * The last case in the file is the guard the other cases need: an ownership
 * check eager enough to refuse the AUTHOR would pass every assertion above.
 */

const CHAT_ID = -1006000000001n;
const NOW = new Date("2026-08-26T09:00:00.000Z");

/** The author. A five-digit id, so the masked form can be told from the whole one. */
const AUTHOR_ID = 880155n;
const BYSTANDER_ID = 8802n;

const TARGET_WEEK = "2026-08-24";
/** Thursday of the target week — still ahead of `NOW`, so nothing is refused as past. */
const CHOSEN_DAY = "2026-08-27";

type Identity = Readonly<{
  telegramUserId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}>;

/** The ordinary case: the author is a roster member with a readable name. */
const NAMED_AUTHOR: Identity = {
  telegramUserId: AUTHOR_ID,
  firstName: "Ada",
  lastName: "Lovelace",
  username: "ada",
};

/**
 * An author with nothing readable stored. `memberLabel` answers the masked
 * `Telegram user ••••NNNN` form, which is the only shape allowed to stand in
 * for an identity in chat text.
 */
const MASKED_AUTHOR: Identity = {
  telegramUserId: AUTHOR_ID,
  firstName: null,
  lastName: null,
  username: null,
};

/** An author whose stored name would break the card if it reached text unescaped. */
const HOSTILE_AUTHOR: Identity = {
  telegramUserId: AUTHOR_ID,
  firstName: "Ben & <b>Jo</b>",
  lastName: null,
  username: null,
};

/** The exact plain-text callback-alert reproduction from UAT gap G-02-4. */
const AMPERSAND_AUTHOR: Identity = {
  telegramUserId: AUTHOR_ID,
  firstName: "Ben & Jo",
  lastName: null,
  username: null,
};

function createRound(overrides: Record<string, unknown> = {}) {
  return {
    id: "round-ownership-1",
    chatId: CHAT_ID,
    authorUserId: AUTHOR_ID,
    targetWeekStart: TARGET_WEEK,
    activeWeekStart: TARGET_WEEK,
    status: PlanningRoundStatus.DRAFT,
    step: PlanningStep.TIME,
    timezone: "Europe/Kyiv",
    durationMinutes: 120,
    dailyStartMinute: 600,
    dailyEndMinute: 1260,
    selectedDate: CHOSEN_DAY,
    selectedStartMinute: null,
    anchorMessageId: 4242,
    startsAt: null,
    endsAt: null,
    confirmedAt: null,
    lastActivityAt: NOW,
    lastStatusPostedAt: null,
    revision: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Record<string, unknown>;
}

/** One action row, minted for the AUTHOR exactly as `mintStepActions` mints it. */
function createAction(target: PlanningTargetAction) {
  return {
    token: createCallbackToken(),
    kind: CallbackActionKind.PLANNING,
    chatId: CHAT_ID,
    actorUserId: AUTHOR_ID,
    targetId: createPlanningTarget(target),
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    consumedAt: null as Date | null,
  } as Record<string, unknown>;
}

type Update = Readonly<{
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}>;

/**
 * A writable double over the exact reads the planning transitions perform.
 *
 * `roundUpdates` and `consumeAttempts` are recorded rather than merely
 * prevented: "the refusal did not write" is only meaningful if the double would
 * have accepted a write.
 */
function createPrismaDouble(
  round: Record<string, unknown>,
  action: Record<string, unknown>,
  identity: Identity | null,
) {
  const roundUpdates: Update[] = [];
  const consumeAttempts: Update[] = [];
  const client = {
    callbackAction: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === action.token ? { ...action } : null,
      updateMany: async ({ where, data }: Update) => {
        consumeAttempts.push({ where, data });
        if (where.token !== action.token || action.consumedAt !== null) {
          return { count: 0 };
        }
        action.consumedAt = NOW;
        return { count: 1 };
      },
      createMany: async () => ({ count: 0 }),
    },
    planningRound: {
      findUnique: async () => ({ ...round }),
      findUniqueOrThrow: async () => ({ ...round }),
      findFirst: async () => null,
      updateMany: async ({ where, data }: Update) => {
        roundUpdates.push({ where, data });
        if (where.revision !== round.revision) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (key === "revision") continue;
          round[key] = value;
        }
        round.revision = (round.revision as number) + 1;
        return { count: 1 };
      },
    },
    telegramUser: {
      findUnique: async ({ where }: { where: { telegramUserId: bigint } }) =>
        identity !== null && where.telegramUserId === identity.telegramUserId
          ? { ...identity }
          : null,
    },
    chatMembership: { findMany: async () => [] },
    chatConfiguration: { findUnique: async () => null },
    planningParticipant: {
      count: async () => 0,
      createMany: async () => ({ count: 0 }),
    },
  };
  return {
    roundUpdates,
    consumeAttempts,
    prisma: {
      ...client,
      $transaction: async (run: (tx: typeof client) => Promise<unknown>) =>
        await run(client),
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

function createTelegramDouble(options: { failAnswer?: Error } = {}) {
  const answers: { text?: string; show_alert?: boolean }[] = [];
  const edits: unknown[] = [];
  const sends: unknown[] = [];
  return {
    answers,
    edits,
    sends,
    ctx: {
      answerCallbackQuery: async (payload: {
        text?: string;
        show_alert?: boolean;
      }) => {
        // Recorded BEFORE the rejection: "the refusal was attempted" and "the
        // refusal was delivered" are different facts, and the absorbing branch
        // must not be able to pass by never having tried.
        answers.push(payload);
        if (options.failAnswer !== undefined) throw options.failAnswer;
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
    },
  };
}

/**
 * Dispatches one planning callback as `actorId`.
 *
 * The role gateway answers `administrator` for everyone on purpose. D-02 says
 * administrator status is not authority over an ACTIVE round — only the
 * inactivity-gated takeover path is — so every refusal in this file is proved
 * against the strongest role a bystander can hold.
 */
async function dispatch(
  prisma: unknown,
  action: Record<string, unknown>,
  actorId: bigint,
  logger = createCapturingLogger(),
  telegramOptions: { failAnswer?: Error } = {},
) {
  const telegram = createTelegramDouble(telegramOptions);
  await dispatchPlanningCallback(
    telegram.ctx as never,
    {
      logger: logger.logger,
      prisma: undefined as never,
      authorization: {
        currentRole: async () => "administrator" as const,
      } as never,
      planning: new PlanningService(prisma as never),
      now: () => NOW,
    },
    { chatId: CHAT_ID, actorId },
    action as unknown as CallbackActionRow,
    NOW,
  );
  return { ...telegram, logger };
}

/** Every planning control, so the refusal is proved once per control type. */
const CONTROLS = [
  {
    name: "a day button on the day step",
    step: PlanningStep.DAY,
    selectedDate: null,
    target: {
      action: "day",
      roundId: "round-ownership-1",
      date: CHOSEN_DAY,
    } satisfies PlanningTargetAction,
  },
  {
    name: "an hour button on the time step",
    step: PlanningStep.TIME,
    selectedDate: CHOSEN_DAY,
    target: {
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    } satisfies PlanningTargetAction,
  },
  {
    name: "the Back control on the time step",
    step: PlanningStep.TIME,
    selectedDate: CHOSEN_DAY,
    target: {
      action: "back",
      roundId: "round-ownership-1",
    } satisfies PlanningTargetAction,
  },
  {
    name: "the Back control on the review step",
    step: PlanningStep.REVIEW,
    selectedDate: CHOSEN_DAY,
    selectedStartMinute: 900,
    target: {
      action: "back",
      roundId: "round-ownership-1",
    } satisfies PlanningTargetAction,
  },
  {
    name: "the Confirm control on the review step",
    step: PlanningStep.REVIEW,
    selectedDate: CHOSEN_DAY,
    selectedStartMinute: 900,
    target: {
      action: "confirm",
      roundId: "round-ownership-1",
    } satisfies PlanningTargetAction,
  },
] as const;

describe("a bystander taps a control on someone else's card (D-02)", () => {
  for (const control of CONTROLS) {
    it(`refuses ${control.name} and names the owner`, async () => {
      const round = createRound({
        step: control.step,
        selectedDate: control.selectedDate,
        selectedStartMinute:
          "selectedStartMinute" in control ? control.selectedStartMinute : null,
      });
      const before = { ...round };
      const action = createAction(control.target);
      const double = createPrismaDouble(round, action, NAMED_AUTHOR);

      const run = await dispatch(double.prisma, action, BYSTANDER_ID);

      // 1. It says whose round it is, privately.
      expect(run.answers).toHaveLength(1);
      expect(run.answers[0]?.show_alert).toBe(true);
      expect(run.answers[0]?.text).toContain(memberLabel(NAMED_AUTHOR));
      expect(run.answers[0]?.text).toContain("can use this card's buttons");

      // 2. It changed nothing on screen and nothing in the round.
      expect(run.edits).toHaveLength(0);
      expect(run.sends).toHaveLength(0);
      expect(round).toEqual(before);
      expect(double.roundUpdates).toHaveLength(0);

      // 3. The author's own token survives a bystander's tap.
      expect(action.consumedAt).toBeNull();
      expect(double.consumeAttempts).toHaveLength(0);
    });
  }

  it("refuses a chat administrator too, while the round is still active", async () => {
    // The role gateway answers `administrator` for every actor in this file, so
    // this case is the explicit statement of what the others already assume:
    // holding the administrator role is not authority over a LIVE round. Only
    // the inactivity-gated takeover is, and this round was active a moment ago.
    const round = createRound({ lastActivityAt: NOW });
    const before = { ...round };
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, NAMED_AUTHOR);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    expect(run.answers[0]?.text).toContain(memberLabel(NAMED_AUTHOR));
    expect(round).toEqual(before);
    expect(action.consumedAt).toBeNull();
  });
});

describe("naming the owner without leaking their identity", () => {
  it("uses the masked label when nothing readable is stored, and never the whole id", async () => {
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, MASKED_AUTHOR);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    const text = run.answers[0]?.text ?? "";
    expect(text).toContain("Telegram user ••••");
    expect(text).toContain(AUTHOR_ID.toString().slice(-4));
    // The whole point of the mask: the complete numeric id is absent.
    expect(text).not.toContain(AUTHOR_ID.toString());
  });

  it("falls back to the masked label when the author has no stored identity at all", async () => {
    // An author who started a round but was never added to the roster has no
    // `telegram_users` row to read. The refusal must still name them safely
    // rather than throw or degrade into the generic stale alert.
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, null);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    const text = run.answers[0]?.text ?? "";
    expect(text).toContain("Telegram user ••••");
    expect(text).not.toContain(AUTHOR_ID.toString());
    expect(round.step).toBe(PlanningStep.TIME);
  });

  it("renders an author's HTML-significant name as plain callback text", async () => {
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, HOSTILE_AUTHOR);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    const text = run.answers[0]?.text ?? "";
    expect(text).toContain("Ben & <b>Jo</b>");
    expect(text).not.toMatch(/&(?:amp|lt|gt);/);
  });

  it("renders an ampersand-joined owner name without an HTML entity", async () => {
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, AMPERSAND_AUTHOR);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    const text = run.answers[0]?.text ?? "";
    expect(text).toContain("Only Ben & Jo can use this card's buttons");
    expect(text).not.toMatch(/&(?:amp|lt|gt);/);
  });
});

describe("a refusal Telegram would not deliver", () => {
  it("absorbs a rejected acknowledgement instead of escaping to the global handler", async () => {
    // WR-04's secondary consequence. `refuseNonAuthor` is reached by a
    // BYSTANDER, and the alert it carries is built from ANOTHER member's
    // stored display name. An unwrapped acknowledgement therefore lets one
    // member's name decide whether every other member's refusal is handled
    // here or thrown at the global bot error handler — where the tap is left
    // spinning and the line an operator gets names the boundary rather than
    // this branch.
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, NAMED_AUTHOR);
    const rejection = new Error("Bad Request: message text is too long");

    const run = await dispatch(
      double.prisma,
      action,
      BYSTANDER_ID,
      createCapturingLogger(),
      { failAnswer: rejection },
    );

    // The refusal was genuinely attempted, and exactly once — Telegram honours
    // only the first answer per `callback_query.id`, so an absorbing branch
    // must not retry.
    expect(run.answers).toHaveLength(1);
    expect(run.answers[0]?.text).toContain(memberLabel(NAMED_AUTHOR));

    const failures = run.logger
      .lines()
      .filter((line) => line.event === "telegram.handler.failure");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.outcome).toBe("telegram-delivery-failed");
    expect(failures[0]?.reason).toBe("telegram-rejected-the-ownership-alert");
    // `err` is reserved for a value that was THROWN, and this one was.
    expect(failures[0]?.err).toMatchObject({
      message: "Bad Request: message text is too long",
    });

    // The refusal's other two promises still hold: it is still logged as a
    // bystander's tap, and it still mutates nothing.
    const refusals = run.logger
      .lines()
      .filter((line) => line.outcome === "not-author");
    expect(refusals).toHaveLength(1);
    expect(round.step).toBe(PlanningStep.TIME);
    expect(round.revision).toBe(4);
    expect(action.consumedAt).toBeNull();
    expect(run.edits).toHaveLength(0);
    expect(run.sends).toHaveLength(0);
  });
});

describe("what the refusal leaves behind in the logs", () => {
  it("emits exactly one bounded line carrying the round, and no display name", async () => {
    const round = createRound();
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, NAMED_AUTHOR);

    const run = await dispatch(double.prisma, action, BYSTANDER_ID);

    const refusals = run.logger
      .lines()
      .filter((line) => line.outcome === "not-author");
    expect(refusals).toHaveLength(1);
    const line = refusals[0]!;
    expect(line.roundId).toBe("round-ownership-1");
    expect(typeof line.reason).toBe("string");
    expect((line.reason as string).length).toBeGreaterThan(0);
    expect(line.event).toBe("telegram.planning");
    // A refusal is about a round, never about a person's name.
    const serialized = JSON.stringify(run.logger.lines());
    expect(serialized).not.toContain("Ada");
    expect(serialized).not.toContain("Lovelace");
    expect(serialized).not.toContain("ada");
  });
});

describe("the guard against an over-eager ownership check", () => {
  it("still lets the author move their own card", async () => {
    // Without this case, an ownership check that refused EVERYONE would satisfy
    // every assertion above.
    const round = createRound({
      step: PlanningStep.TIME,
      selectedDate: CHOSEN_DAY,
    });
    const action = createAction({
      action: "time",
      roundId: "round-ownership-1",
      startMinute: 900,
    });
    const double = createPrismaDouble(round, action, NAMED_AUTHOR);

    const run = await dispatch(double.prisma, action, AUTHOR_ID);

    expect(run.edits).toHaveLength(1);
    expect(round.step).toBe(PlanningStep.REVIEW);
    expect(round.selectedStartMinute).toBe(900);
    expect(action.consumedAt).toBe(NOW);
    expect(
      run.logger.lines().some((line) => line.outcome === "time-selected"),
    ).toBe(true);
  });
});
