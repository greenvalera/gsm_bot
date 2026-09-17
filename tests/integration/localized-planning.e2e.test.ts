import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import { startPostgresTestContainer, type PostgresTestContainer } from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-08-26T09:00:00Z");
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => { await prisma?.$disconnect(); await database?.stop(); }, 60000);

type Call = { method: string; payload: any };
function session(chatId: bigint, clientLanguage = "en") {
  const calls: Call[] = [];
  let sequence = 0;
  let messageId = 500;
  const chat = { id: Number(chatId), type: "supergroup" as const, title: "Band" };
  const from = { id: 8101, is_bot: false, first_name: "Admin", language_code: clientLanguage };
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: { id: 9001, is_bot: true, first_name: "Bot", username: "gsmbot" } as never,
    prisma, now: () => now,
    membershipGateway: { getCurrentRole: async () => "administrator" },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: method === "answerCallbackQuery" ? true : {
      message_id: method === "sendMessage" ? ++messageId : messageId,
      date: 1, chat, text: (payload as any).text,
    } } as never;
  });
  return {
    calls,
    token(label: string) {
      const button = calls.findLast(c => c.payload.reply_markup)?.payload.reply_markup.inline_keyboard.flat()
        .find((b: any) => b.text.endsWith(label));
      expect(button, `Expected ${label}`).toBeDefined();
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
      return button.callback_data as string;
    },
    async message(text: string) {
      calls.length = 0;
      await bot.handleUpdate({ update_id: ++sequence, message: {
        message_id: sequence, date: 1, chat, from, text,
        entities: [{ type: "bot_command", offset: 0, length: text.length }],
      } });
    },
    async click(data: string) {
      calls.length = 0;
      await bot.handleUpdate({ update_id: ++sequence, callback_query: {
        id: String(sequence), chat_instance: "planning", from, data,
        message: { message_id: messageId, date: 1, chat },
      } });
      expect(calls.filter(c => c.method === "answerCallbackQuery")).toHaveLength(1);
    },
  };
}
async function snapshot(chatId: bigint) {
  return {
    rounds: await prisma.planningRound.findMany({ where: { chatId }, include: { participants: true }, orderBy: { id: "asc" } }),
    actions: await prisma.callbackAction.findMany({ where: { chatId }, orderBy: { token: "asc" } }),
  };
}
describe("localized planning through the composed bot", () => {
  it("duplicate feedback tracer uses durable language and preserves independent groups and consumed actions", async () => {
    for (const [chatId, locale] of [[-71001n, "uk"], [-71002n, "en"]] as const) {
      await prisma.chatConfiguration.create({ data: { chatId, ...createChatConfiguration() } });
      const h = session(chatId, locale === "uk" ? "en" : "uk");
      await h.message("/plan");
      const token = h.token("Thu 27");
      await h.click(token);
      expect(await prisma.callbackAction.findUnique({ where: { token } })).toMatchObject({ consumedAt: now });
      await prisma.chatLanguagePreference.create({ data: { chatId, locale, explicitlySelected: true } });
      const before = await snapshot(chatId);
      await h.click(token);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]?.payload).toMatchObject({
        text: locale === "uk" ? "Усе гаразд, цю дію вже виконано." : "Already applied.", show_alert: true,
      });
      expect(await snapshot(chatId)).toEqual(before);
    }
  });
});
