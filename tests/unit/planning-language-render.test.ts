import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlanningTarget } from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";

const now = new Date("2026-08-26T09:00:00Z");
const context = { chatId: -76999n, actorId: 87601n, updateId: 1 };
beforeEach(() => vi.resetModules());

async function fixture() {
  const { dispatchPlanningCallback } =
    await import("../../src/telegram/planning-handlers.js");
  const { buildDayStepProjection } =
    await import("../../src/domain/planning/planning-service.js");
  let locale: "en" | "uk" = "en";
  const target = {
    action: "day" as const,
    roundId: "round",
    date: "2026-08-27",
  };
  const rows = [
    {
      token: "visible-token",
      targetId: createPlanningTarget(target),
      actorUserId: context.actorId,
    },
  ];
  const round = {
    id: "round",
    chatId: context.chatId,
    authorUserId: context.actorId,
    status: "DRAFT",
    step: "DAY",
    anchorMessageId: 501,
    announcementMessageId: null,
  };
  const ctx = {
    api: {
      editMessageText: vi.fn<(...args: any[]) => Promise<any>>(
        async () => ({}),
      ),
    },
    answerCallbackQuery: vi.fn<(answer: any) => void>(),
  };
  const prisma = {
    planningRound: { findFirst: vi.fn(async () => round) },
    callbackAction: { findMany: vi.fn(async () => rows) },
    chatLanguagePreference: { findUnique: vi.fn(async () => ({ locale })) },
  };
  const deps = {
    prisma,
    now: () => now,
    logger: createLogger({ level: "silent" }),
    planning: {
      selectDay: vi.fn(async () => ({ kind: "duplicate" })),
      dayStepProjection: async () =>
        buildDayStepProjection({
          targetWeekStart: "2026-08-24",
          today: { year: 2026, month: 8, day: 26 },
          defaultWeekday: 3,
          previousRehearsalDate: null,
          selectedDate: null,
        }),
    },
  };
  const dispatch = (run = dispatchPlanningCallback) =>
    run(
      ctx as never,
      deps as never,
      context,
      {
        token: "consumed-token",
        targetId: createPlanningTarget(target),
      } as never,
      now,
    );
  return {
    ctx,
    prisma,
    rows,
    round,
    dispatch,
    language(value: "en" | "uk") {
      locale = value;
    },
  };
}

describe("planning language render cache", () => {
  it("compares complete text and keyboard and forgets cache across module reconstruction", async () => {
    const f = await fixture();
    await f.dispatch();
    await f.dispatch();
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(1);
    // Same text, new durable capability: the keyboard alone must force an edit.
    f.rows[0]!.token = "replacement-token";
    await f.dispatch();
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(2);
    f.language("uk");
    await f.dispatch();
    expect(f.ctx.api.editMessageText.mock.calls.at(-1)![2]).toContain(
      "Обери день.",
    );
    expect(
      JSON.stringify(f.ctx.api.editMessageText.mock.calls.at(-1)![3]),
    ).toContain("Чт 27");
    vi.resetModules();
    const fresh = await import("../../src/telegram/planning-handlers.js");
    await f.dispatch(fresh.dispatchPlanningCallback);
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(4);
  });

  it("remembers Telegram not-modified responses even with a cold cache", async () => {
    const f = await fixture();
    const { GrammyError } = await import("grammy");
    f.ctx.api.editMessageText.mockRejectedValueOnce(
      new GrammyError(
        "editMessageText",
        {
          ok: false,
          error_code: 400,
          description: "Bad Request: message is not modified",
        },
        {},
      ),
    );
    await f.dispatch();
    await f.dispatch();
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(1);
    expect(f.ctx.answerCallbackQuery.mock.lastCall?.[0].text).toBe(
      "Already applied.",
    );
  });

  it("does not cache a rejected translation and retries the current preference", async () => {
    const f = await fixture();
    await f.dispatch();
    f.language("uk");
    f.ctx.api.editMessageText.mockRejectedValueOnce(
      new Error("Known rejection"),
    );
    await f.dispatch();
    expect(f.ctx.answerCallbackQuery.mock.lastCall?.[0].text).toContain(
      "Зміну збережено",
    );
    await f.dispatch();
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(3);
    await f.dispatch();
    expect(f.ctx.api.editMessageText).toHaveBeenCalledTimes(3);
  });

  it("retains the captured payload while an edit is in flight and reads the next preference", async () => {
    const f = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.ctx.api.editMessageText.mockImplementationOnce(async () => {
      entered();
      await gate;
      return {};
    });
    const pending = f.dispatch();
    await started;
    f.language("uk");
    release();
    await pending;
    expect(f.ctx.api.editMessageText.mock.calls[0]![2]).toContain(
      "Choose a day.",
    );
    expect(
      JSON.stringify(f.ctx.api.editMessageText.mock.calls[0]![3]),
    ).toContain("Thu 27");
    await f.dispatch();
    expect(f.ctx.api.editMessageText.mock.calls[1]![2]).toContain(
      "Обери день.",
    );
  });

  it("reports recovery when current durable state cannot be loaded", async () => {
    const f = await fixture();
    f.language("uk");
    f.prisma.planningRound.findFirst.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    await f.dispatch();
    expect(f.ctx.answerCallbackQuery.mock.lastCall?.[0].text).toContain(
      "Зміну збережено",
    );
    expect(f.ctx.api.editMessageText).not.toHaveBeenCalled();
  });

  it("requires current round ownership before repainting a consumed selection", async () => {
    const f = await fixture();
    f.prisma.planningRound.findFirst.mockResolvedValueOnce(null as never);
    await f.dispatch();
    expect(f.prisma.planningRound.findFirst).toHaveBeenCalledWith({
      where: {
        id: "round",
        chatId: context.chatId,
        status: "DRAFT",
        authorUserId: context.actorId,
      },
    });
    expect(f.ctx.api.editMessageText).not.toHaveBeenCalled();
    expect(f.prisma.callbackAction.findMany).not.toHaveBeenCalled();
  });
});
