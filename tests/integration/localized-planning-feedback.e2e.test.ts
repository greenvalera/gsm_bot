import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import { createCallbackToken, createPlanningTarget } from "../../src/shared/callback-schema.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import { startPostgresTestContainer, type PostgresTestContainer } from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-08-26T09:00:00Z");
let chatSequence = -75000n;
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => { await prisma?.$disconnect(); await database?.stop(); }, 60000);

async function session(locale: Locale, configured = true) {
  const chatId = --chatSequence;
  const actorId = 8101;
  if (configured) await prisma.chatConfiguration.create({ data: { chatId, ...createChatConfiguration() } });
  await prisma.chatLanguagePreference.create({ data: { chatId, locale, explicitlySelected: true } });
  let role: CurrentTelegramRole | "outage" = "administrator";
  let clock = now;
  let sequence = 0;
  let messageId = 500;
  const calls: { method: string; payload: any }[] = [];
  const chat = { id: Number(chatId), type: "supergroup" as const, title: "Band" };
  const from = { id: actorId, is_bot: false, first_name: "Admin", language_code: locale === "uk" ? "en" : "uk" };
  const bot = createBot({
    botToken: "123456:TEST_TOKEN", botInfo: { id: 9001, is_bot: true, first_name: "Bot", username: "gsmbot" } as never,
    prisma, now: () => clock,
    membershipGateway: { getCurrentRole: async () => { if (role === "outage") throw Error("membership unavailable"); return role; } },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: method === "answerCallbackQuery" ? true : { message_id: method === "sendMessage" ? ++messageId : messageId, date: 1, chat, text: (payload as any).text } } as never;
  });
  return {
    chatId, actorId, calls,
    role(value: typeof role) { role = value; },
    clock(value: Date) { clock = value; },
    answer() { return calls.find(c => c.method === "answerCallbackQuery")?.payload; },
    text() { return calls.map(c => c.payload.text ?? "").join("\n"); },
    token(label: string) {
      const button = calls.findLast(c => c.payload.reply_markup)?.payload.reply_markup.inline_keyboard.flat().find((b: any) => b.text.endsWith(label));
      expect(button, label).toBeDefined(); return button.callback_data as string;
    },
    async message(text: string, extra: Record<string, unknown> = {}) {
      calls.length = 0;
      await bot.handleUpdate({ update_id: ++sequence, message: { message_id: sequence, date: 1, chat, from, text, entities: [{ type: "bot_command", offset: 0, length: text.length }], ...extra } } as never);
    },
    async click(data: string, actor = actorId, extra: Record<string, unknown> = {}) {
      calls.length = 0;
      await bot.handleUpdate({ update_id: ++sequence, callback_query: { id: String(sequence), chat_instance: "feedback", from: { ...from, id: actor }, data, message: { message_id: messageId, date: 1, chat }, ...extra } } as never);
      const answers = calls.filter(c => c.method === "answerCallbackQuery");
      expect(answers).toHaveLength(1);
      expect(answers[0]?.payload.callback_query_id).toBe(String(sequence));
    },
    async row(overrides: Record<string, unknown> = {}) {
      return prisma.callbackAction.create({ data: { token: createCallbackToken(), kind: CallbackActionKind.PLANNING, chatId, actorUserId: BigInt(actorId), targetId: createPlanningTarget({ action: "day", roundId: "missing-round", date: "2026-08-27" }), expiresAt: new Date(now.getTime() + 60000), ...overrides } as never });
    },
  };
}
async function snapshot(chatId: bigint) {
  return {
    rounds: await prisma.planningRound.findMany({ where: { chatId }, include: { participants: true }, orderBy: { id: "asc" } }),
    tokens: await prisma.callbackAction.findMany({ where: { chatId }, orderBy: { token: "asc" } }),
    setup: await prisma.setupDraft.findMany({ where: { chatId } }),
    settings: await prisma.settingsEditDraft.findMany({ where: { chatId } }),
  };
}

describe.each(["en", "uk"] as const)("%s real planning feedback boundaries", (locale) => {
  const text = (key: Parameters<typeof renderMessage>[1]) => renderMessage(locale, key, undefined as never);
  it.each([
    ["not-eligible", "Only the planning author or a current chat administrator can replan this slot.", "Заново спланувати цей час може лише організатор або поточний адміністратор чату."],
    ["empty-roster", "Add someone to the band roster before replanning.", "Перш ніж планувати знову, додай когось до складу гурту."],
  ])("replan %s feedback crosses the composed route", async (kind, en, uk) => {
    const s = await session(locale);
    const row = await s.row({ targetId: createPlanningTarget({ action: "replan", roundId: "round" }) });
    const before = await snapshot(s.chatId);
    const spy = vi.spyOn(PlanningService.prototype, "replanRound").mockResolvedValue({ kind } as never);
    try {
      await s.click(row.token);
      expect(s.answer().text).toBe(locale === "uk" ? uk : en);
      expect(spy).toHaveBeenCalledOnce();
      expect(await snapshot(s.chatId)).toEqual(before);
    } finally { spy.mockRestore(); }
  });
  it.each(["left", "member", "outage"] as const)("command denial for %s preserves state and drafts", async (role) => {
    const s = await session(locale);
    await s.message("/setup");
    s.role(role);
    const before = await snapshot(s.chatId);
    for (const command of ["/plan", "/plan_status", "/plan_cancel", "/plan_change"]) {
      // Current members may read status/cancel/change; outsiders may not.
      if (role === "member" && command !== "/plan") continue;
      await s.message(command);
      expect(s.text()).toBe(text(command === "/plan" ? "planning.feedback.denied" : "planning.feedback.statusDenied"));
      expect(s.calls.every(c => c.method === "sendMessage")).toBe(true);
      expect(await snapshot(s.chatId)).toEqual(before);
    }
  });
  it("localizes reachable commands without an actor and keeps missing-chat callbacks silent", async () => {
    const s = await session(locale);
    await s.message("/plan", { from: undefined });
    expect(s.text()).toBe(text("planning.feedback.denied"));
    const before = await snapshot(s.chatId);
    await s.click("invalid", 8101, { message: undefined });
    expect(s.answer().text).toBeUndefined();
    await s.click("invalid", 8101, { from: undefined });
    expect(s.answer().text).toBeUndefined();
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it.each(["malformed", "unknown"])("retains %s role-first denial precedence", async (kind) => {
    const s = await session(locale);
    const token = kind === "malformed" ? "broken" : createCallbackToken();
    const before = await snapshot(s.chatId);
    s.role("member");
    await s.click(token);
    expect(s.answer().text).toBe(text("callback.denied"));
    s.role("administrator");
    await s.click(token);
    expect(s.answer().text).toBe(text("common.stale"));
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it.each([-1, 0, 1])("expiry offset %i has stable stale versus duplicate precedence", async (offset) => {
    const s = await session(locale);
    await s.message("/plan");
    const token = s.token(locale === "uk" ? "Чт 27" : "Thu 27");
    await s.click(token);
    const expiresAt = new Date(now.getTime() + 60000);
    await prisma.callbackAction.update({ where: { token }, data: { expiresAt } });
    const before = await snapshot(s.chatId);
    s.clock(new Date(expiresAt.getTime() + offset));
    await s.click(token);
    expect(s.answer().text).toBe(text(offset < 0 ? "planning.applied" : "planning.feedback.stale"));
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it.each(["left", "outage"] as const)("%s membership beats wrong-chat expiry and consumed predicates", async (role) => {
    const s = await session(locale);
    await s.message("/setup");
    const row = await s.row({ chatId: s.chatId - 100000n, consumedAt: now, expiresAt: now });
    s.role(role);
    const before = await snapshot(s.chatId);
    await s.click(row.token);
    expect(s.answer().text).toBe(text("planning.feedback.nonMember"));
    expect(await snapshot(s.chatId)).toEqual(before);
    expect((await prisma.callbackAction.findUniqueOrThrow({ where: { token: row.token } }))).toEqual(row);
  });
  it.each([null, "not-json", "missing-round", "wrong-chat"])("rejects invalid target %s without writes", async (target) => {
    const s = await session(locale);
    const row = await s.row(target === "wrong-chat" ? { chatId: s.chatId - 100000n } : target === "missing-round" ? {} : { targetId: target });
    const before = await snapshot(s.chatId);
    await s.click(row.token);
    expect(s.answer().text).toBe(text("planning.feedback.stale"));
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it("wrong actor gets the plain bounded owner message and leaves the token spendable", async () => {
    const s = await session(locale);
    await s.message("/plan");
    const token = s.token(locale === "uk" ? "Чт 27" : "Thu 27");
    const before = await snapshot(s.chatId);
    s.role("member");
    await s.click(token, 8199);
    expect(s.answer().text).toContain(locale === "uk" ? "Цими кнопками" : "Only ");
    expect(s.answer().text.length).toBeLessThanOrEqual(200);
    expect(s.answer().text).not.toContain("8199");
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it("distinguishes no configuration, no round and empty roster", async () => {
    const unconfigured = await session(locale, false);
    await unconfigured.message("/plan");
    expect(unconfigured.text()).toBe(text("planning.feedback.notConfigured"));
    const s = await session(locale);
    await s.message("/plan_status");
    expect(s.text()).toBe(text("planning.feedback.noRound"));
    await s.message("/plan_cancel");
    expect(s.text()).toBe(text("planning.feedback.noCancel"));
    await s.message("/plan_change");
    expect(s.text()).toBe(text("planning.feedback.noChange"));
    await s.message("/plan");
    await s.click(s.token(locale === "uk" ? "Чт 27" : "Thu 27"));
    await s.click(s.token("19:00"));
    const token = s.token(locale === "uk" ? "Підтвердити репетицію" : "Confirm rehearsal");
    const before = await snapshot(s.chatId);
    await s.click(token);
    expect(s.answer().text).toBe(text("planning.feedback.emptyRoster"));
    expect(await snapshot(s.chatId)).toEqual(before);
  });
  it.each(["SUPERSEDED", "CANCELLED", "BOOKED"] as const)("reports %s from the authoritative round", async (status) => {
    const s = await session(locale);
    await s.message("/plan");
    const round = await prisma.planningRound.findFirstOrThrow({ where: { chatId: s.chatId } });
    await prisma.planningRound.update({ where: { id: round.id }, data: { status, activeWeekStart: null } });
    const row = await s.row({ targetId: createPlanningTarget({ action: "answer", roundId: round.id, answer: "AVAILABLE" }) });
    const before = await snapshot(s.chatId);
    await s.click(row.token);
    expect(s.answer().text).toBe(text(status === "SUPERSEDED" ? "planning.feedback.replanned" : status === "CANCELLED" ? "planning.feedback.cancelled" : "planning.feedback.booked"));
    expect(await snapshot(s.chatId)).toEqual(before);
  });
});
