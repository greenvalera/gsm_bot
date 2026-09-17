import { describe, expect, it, vi } from "vitest";
import { dispatchPlanningCallback, handlePlanCommand } from "../../src/telegram/planning-handlers.js";
import { createPlanningTarget } from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";

const now = new Date("2026-09-21T09:00:00Z");
const context = { chatId: -75001n, actorId: 12345n, updateId: 1 };
function fixture(locale: "en" | "uk", result: object) {
  const action = { token: "abcdefgh12345678", targetId: createPlanningTarget({ action: "day", roundId: "round", date: "2026-09-22" }) };
  const ctx = { answerCallbackQuery: vi.fn(), reply: vi.fn() };
  const deps = {
    logger: createLogger({ level: "silent" }),
    prisma: { chatLanguagePreference: { findUnique: async () => ({ locale }) } },
    now: () => now,
    planning: { selectDay: vi.fn(async () => result), startOrResume: vi.fn(async () => result) },
  };
  return { action, ctx, deps };
}

describe("localized planning feedback", () => {
  it.each([
    ["replanned", "Планування вже змінилося. Поточний стан — /plan_status."],
    ["already-cancelled", "Цю репетицію скасовано."],
    ["past-day", "Цей день уже минув. Обери один із наступних днів."],
    ["stale", "Ця дія планування вже недоступна. Надішли /plan, щоб почати знову."],
  ])("delivers truthful Ukrainian %s feedback", async (kind, text) => {
    const { ctx, deps, action } = fixture("uk", { kind });
    await dispatchPlanningCallback(ctx as never, deps as never, context, action as never, now);
    expect(ctx.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({ text, show_alert: true });
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(deps.planning.selectDay).toHaveBeenCalledOnce();
  });
});
