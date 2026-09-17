import { describe, expect, it, vi } from "vitest";
import {
  dispatchPlanningCallback,
  handlePlanCommand,
  planningNotAuthorText,
} from "../../src/telegram/planning-handlers.js";
import { planningCallbackRoute } from "../../src/telegram/callbacks.js";
import { createPlanningTarget } from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";

const now = new Date("2026-09-21T09:00:00Z");
const context = { chatId: -75001n, actorId: 12345n, updateId: 1 };
function fixture(locale: "en" | "uk", result: object) {
  const action = {
    token: "abcdefgh12345678",
    targetId: createPlanningTarget({
      action: "day",
      roundId: "round",
      date: "2026-09-22",
    }),
  };
  const ctx = { answerCallbackQuery: vi.fn(), reply: vi.fn() };
  const deps = {
    logger: createLogger({ level: "silent" }),
    prisma: {
      chatLanguagePreference: { findUnique: async () => ({ locale }) },
    },
    now: () => now,
    planning: {
      selectDay: vi.fn(async () => result),
      startOrResume: vi.fn(async () => result),
    },
  };
  return { action, ctx, deps };
}

describe("localized planning feedback", () => {
  it("resolves planning boundary feedback by semantic key", () => {
    const { deps } = fixture("uk", {});
    const route = planningCallbackRoute(deps as never);
    expect(route.staleText).toEqual({ key: "planning.feedback.stale" });
    expect(route.nonMemberText).toEqual({ key: "planning.feedback.nonMember" });
    expect(route.actorBinding).toBe("route-resolved");
    expect(route.authority).toBe("route-resolved");
  });
  it.each([null, "Ben & <b>Jo</b>", "🎸".repeat(150)])(
    "bounds localized plain owner alert %s",
    (firstName) => {
      const text = planningNotAuthorText(
        {
          telegramUserId: 123456789n,
          firstName,
          lastName: null,
          username: null,
        },
        "uk",
      );
      expect(text).toMatch(/^Цими кнопками може користуватися лише /);
      expect(text.length).toBeLessThanOrEqual(200);
      expect(text.isWellFormed()).toBe(true);
      expect(text).not.toContain("&amp;");
      expect(text).not.toContain("123456789");
      if (firstName === null)
        expect(text).toContain("Користувач Telegram ••••6789");
      if (firstName?.startsWith("Ben")) expect(text).toContain(firstName);
    },
  );
  it.each([
    ["replanned", "Планування вже змінилося. Поточний стан — /plan_status."],
    ["already-cancelled", "Цю репетицію скасовано."],
    ["past-day", "Цей день уже минув. Обери один із наступних днів."],
    [
      "stale",
      "Ця дія планування вже недоступна. Надішли /plan, щоб почати знову.",
    ],
  ])("delivers truthful Ukrainian %s feedback", async (kind, text) => {
    const { ctx, deps, action } = fixture("uk", { kind });
    await dispatchPlanningCallback(
      ctx as never,
      deps as never,
      context,
      action as never,
      now,
    );
    expect(ctx.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
      text,
      show_alert: true,
    });
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(deps.planning.selectDay).toHaveBeenCalledOnce();
  });
});
