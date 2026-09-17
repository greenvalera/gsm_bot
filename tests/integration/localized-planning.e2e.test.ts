import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-08-26T09:00:00Z");
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => {
  await prisma?.$disconnect();
  await database?.stop();
}, 60000);

type Call = { method: string; payload: any };
function session(chatId: bigint, clientLanguage = "en") {
  const calls: Call[] = [];
  let sequence = 0;
  let messageId = 500;
  let failMethod: string | undefined;
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
  };
  const from = {
    id: 8101,
    is_bot: false,
    first_name: "Admin",
    language_code: clientLanguage,
  };
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as never,
    prisma,
    now: () => now,
    membershipGateway: { getCurrentRole: async () => "administrator" },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    if (method === failMethod) throw new Error("Injected transport failure");
    return {
      ok: true,
      result:
        method === "answerCallbackQuery"
          ? true
          : {
              message_id: method === "sendMessage" ? ++messageId : messageId,
              date: 1,
              chat,
              text: (payload as any).text,
            },
    } as never;
  });
  return {
    calls,
    fail(method?: string) {
      failMethod = method;
    },
    token(label: string) {
      const button = calls
        .findLast((c) => c.payload.reply_markup)
        ?.payload.reply_markup.inline_keyboard.flat()
        .find((b: any) => b.text.endsWith(label));
      expect(button, `Expected ${label}`).toBeDefined();
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
      return button.callback_data as string;
    },
    async message(text: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          from,
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
        },
      });
    },
    async click(data: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        callback_query: {
          id: String(sequence),
          chat_instance: "planning",
          from,
          data,
          message: { message_id: messageId, date: 1, chat },
        },
      });
      expect(
        calls.filter((c) => c.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
  };
}
async function snapshot(chatId: bigint) {
  return {
    rounds: await prisma.planningRound.findMany({
      where: { chatId },
      include: { participants: true },
      orderBy: { id: "asc" },
    }),
    actions: await prisma.callbackAction.findMany({
      where: { chatId },
      orderBy: { token: "asc" },
    }),
  };
}
describe("localized planning through the composed bot", () => {
  it.each(["uk", "en"] as const)(
    "retry classification distinguishes rollback and committed edit failure in %s",
    async (locale) => {
      const chatId = locale === "uk" ? -71003n : -71004n;
      await prisma.chatConfiguration.create({
        data: { chatId, ...createChatConfiguration() },
      });
      await prisma.chatLanguagePreference.create({
        data: { chatId, locale, explicitlySelected: true },
      });
      const h = session(chatId);
      await h.message("/plan");
      const token = h.token("Thu 27");
      const before = await snapshot(chatId);
      const transaction = vi
        .spyOn(prisma, "$transaction")
        .mockRejectedValueOnce(
          new Error("Transaction rejected before execution"),
        );
      try {
        await h.click(token);
      } finally {
        transaction.mockRestore();
      }
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]?.payload.text).toBe(
        locale === "uk"
          ? "Ой, щось пішло не так. Спробуй ще раз трохи пізніше."
          : "I couldn't save that change. Please try again.",
      );
      expect(await snapshot(chatId)).toEqual(before);
      h.fail("editMessageText");
      await h.click(token);
      const after = await snapshot(chatId);
      expect(after.rounds[0]?.step).toBe("TIME");
      expect(after.rounds[0]?.revision).toBe(before.rounds[0]!.revision + 1);
      expect(after.rounds[0]?.participants).toEqual(
        before.rounds[0]?.participants,
      );
      expect(after.actions.find((a) => a.token === token)?.consumedAt).toEqual(
        now,
      );
      expect(h.calls.map((c) => c.method)).toEqual([
        "editMessageText",
        "answerCallbackQuery",
      ]);
      expect(h.calls[1]?.payload.text).toBe(
        locale === "uk"
          ? "Зміну збережено, але картку не вдалося оновити. Поточний стан — /plan_status."
          : "The change was saved, but the card could not be updated. Use /plan_status to recover the current plan.",
      );
    },
  );

  it("retry classification preserves the durable claim and silence after an uncertain announcement send", async () => {
    const chatId = -71005n;
    await prisma.chatConfiguration.create({
      data: { chatId, ...createChatConfiguration() },
    });
    await prisma.chatLanguagePreference.create({
      data: { chatId, locale: "uk", explicitlySelected: true },
    });
    await prisma.telegramUser.create({
      data: { telegramUserId: 8101n, firstName: "Admin" },
    });
    await prisma.chatMembership.create({
      data: { chatId, telegramUserId: 8101n, activeAt: now },
    });
    const h = session(chatId);
    await h.message("/plan");
    await h.click(h.token("Thu 27"));
    await h.click(h.token("15:00"));
    await h.click(h.token("Confirm rehearsal"));
    const token = h.token("Can attend");
    h.fail("sendMessage");
    await h.click(token);
    const state = await snapshot(chatId);
    expect(state.rounds[0]?.participants[0]?.availability).toBe("AVAILABLE");
    expect(state.rounds[0]?.readyAnnouncedAt).toEqual(now);
    expect(state.rounds[0]?.announcementMessageId).toBeNull();
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
    expect(
      h.calls.find((c) => c.method === "answerCallbackQuery")?.payload.text,
    ).toBeUndefined();
    expect(
      h.calls.every((c) => !String(c.payload.text).includes("Спробуй ще раз")),
    ).toBe(true);
  });
  it("duplicate feedback tracer uses durable language and preserves independent groups and consumed actions", async () => {
    for (const [chatId, locale] of [
      [-71001n, "uk"],
      [-71002n, "en"],
    ] as const) {
      await prisma.chatConfiguration.create({
        data: { chatId, ...createChatConfiguration() },
      });
      const h = session(chatId, locale === "uk" ? "en" : "uk");
      await h.message("/plan");
      const token = h.token("Thu 27");
      await h.click(token);
      expect(
        await prisma.callbackAction.findUnique({ where: { token } }),
      ).toMatchObject({ consumedAt: now });
      await prisma.chatLanguagePreference.create({
        data: { chatId, locale, explicitlySelected: true },
      });
      const before = await snapshot(chatId);
      await h.click(token);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]?.payload).toMatchObject({
        text:
          locale === "uk"
            ? "Усе гаразд, цю дію вже виконано."
            : "Already applied.",
        show_alert: true,
      });
      expect(await snapshot(chatId)).toEqual(before);
    }
  });
});
