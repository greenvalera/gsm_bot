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
function session(
  chatId: bigint,
  clientLanguage = "en",
  clock = now,
  actorId = 8101,
) {
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
    id: actorId,
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
    now: () => clock,
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
    async click(data: string, actor = actorId) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        callback_query: {
          id: String(sequence),
          chat_instance: "planning",
          from: { ...from, id: actor },
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
  it.each(["en", "uk"] as const)(
    "planning workflow takeover keeps the selected slot in %s",
    async (locale) => {
      const chatId = locale === "uk" ? -71012n : -71013n;
      const actorId = locale === "uk" ? 840102 : 840202;
      await prisma.chatConfiguration.create({
        data: { chatId, ...createChatConfiguration() },
      });
      await prisma.chatLanguagePreference.create({
        data: { chatId, locale, explicitlySelected: true },
      });
      await prisma.telegramUser.create({
        data: { telegramUserId: BigInt(actorId), firstName: "Новий <&>" },
      });
      const h = session(chatId);
      await h.message("/plan");
      await h.click(h.token(locale === "uk" ? "Чт 27" : "Thu 27"));
      await h.click(h.token("19:00"));
      await prisma.planningRound.updateMany({
        where: { chatId },
        data: { lastActivityAt: new Date(now.getTime() - 31 * 60 * 1000) },
      });
      const admin = session(chatId, "en", now, actorId);
      await admin.message("/plan_status");
      const token = admin.token(
        locale === "uk" ? "Стати організатором" : "Take over this plan",
      );
      const before = (await snapshot(chatId)).rounds[0]!;
      await admin.click(token);
      const after = (await snapshot(chatId)).rounds[0]!;
      expect(after.authorUserId).toBe(BigInt(actorId));
      expect(after.selectedDate).toBe(before.selectedDate);
      expect(after.selectedStartMinute).toBe(before.selectedStartMinute);
      expect(after.participants).toEqual(before.participants);
      const payload = admin.calls.find(
        (c) => c.method === "editMessageText",
      )!.payload;
      expect(payload.text).toContain(
        locale === "uk"
          ? "Організатор: Новий &lt;&amp;&gt;"
          : "Planned by Новий &lt;&amp;&gt;.",
      );
      expect(
        payload.reply_markup.inline_keyboard.flat().map((b: any) => b.text),
      ).not.toContain(
        locale === "uk" ? "Стати організатором" : "Take over this plan",
      );
    },
  );
  it.each(["en", "uk"] as const)(
    "planning workflow preserves snapshots, identity safety and token authority in %s",
    async (locale) => {
      const chatId = locale === "uk" ? -71010n : -71011n;
      const ownerId = locale === "uk" ? 830101 : 830201;
      const ids = [ownerId, ownerId + 1, ownerId + 2, ownerId + 3];
      const names = ["𝄞".repeat(64) + " <&>", "ada", "Ada", null];
      await prisma.chatConfiguration.create({
        data: {
          chatId,
          ...createChatConfiguration({ timezone: "Europe/Kyiv" }),
        },
      });
      await prisma.chatLanguagePreference.create({
        data: { chatId, locale, explicitlySelected: true },
      });
      for (const [i, id] of ids.entries()) {
        await prisma.telegramUser.create({
          data: { telegramUserId: BigInt(id), firstName: names[i]! },
        });
        await prisma.chatMembership.create({
          data: { chatId, telegramUserId: BigInt(id), activeAt: now },
        });
      }
      const h = session(chatId, locale === "uk" ? "en" : "uk", now, ownerId);
      const card = () =>
        h.calls.find(
          (c) => c.method === "editMessageText" || c.method === "sendMessage",
        )!.payload;
      const labels = () =>
        card()
          .reply_markup.inline_keyboard.flat()
          .map((b: any) => b.text);
      await h.message("/plan");
      expect(card().text).toContain(
        locale === "uk" ? "Обери день." : "Choose a day.",
      );
      expect(card().text).toContain(
        locale === "uk" ? "Організатор:" : "Planned by",
      );
      expect(card().text).toContain("&lt;&amp;&gt;");
      const dayToken = h.token(locale === "uk" ? "Чт 27" : "Thu 27");
      const beforeDenial = await snapshot(chatId);
      await h.click(dayToken, ownerId + 1);
      expect(await snapshot(chatId)).toEqual(beforeDenial);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.payload.text.length).toBeLessThanOrEqual(200);
      expect(h.calls[0]!.payload.text.isWellFormed()).toBe(true);
      await h.click(dayToken);
      expect(card().text).toContain(
        locale === "uk" ? "Обери час початку." : "Choose a start time.",
      );
      expect(labels()).toContain(locale === "uk" ? "Назад" : "Back");
      await h.click(h.token("19:00"));
      expect(card().text).toContain(
        locale === "uk"
          ? "Учасників, яких запитаємо: 4"
          : "Asking these 4 band members",
      );
      expect(card().text).not.toContain("&amp;lt;");
      expect(card().text.length).toBeLessThanOrEqual(4096);
      await h.click(
        h.token(
          locale === "uk" ? "Підтвердити репетицію" : "Confirm rehearsal",
        ),
      );
      expect(card().text).toContain(
        locale === "uk" ? "Відповіли 0 з 4." : "Answered 0 of 4.",
      );
      expect(card().text).toContain(
        locale === "uk" ? "⬜ Очікуємо відповідь" : "⬜ no answer yet",
      );
      expect(card().text).toContain(
        (locale === "uk" ? "Користувач Telegram ••••" : "Telegram user ••••") +
          String(ownerId + 3).slice(-4),
      );
      expect(card().text).not.toContain(String(ownerId + 3));
      expect(labels().slice(0, 2)).toEqual(
        locale === "uk"
          ? ["👍 Можу", "👎 Не можу"]
          : ["👍 Can attend", "👎 Cannot attend"],
      );
      const confirmed = (await snapshot(chatId)).rounds[0]!;
      expect(confirmed).toMatchObject({
        status: "CONFIRMED",
        selectedDate: "2026-08-27",
        selectedStartMinute: 1140,
        authorUserId: BigInt(ownerId),
      });
      expect(
        confirmed.participants.map((p) => p.telegramUserId).sort(),
      ).toEqual(ids.map(BigInt).sort());
      const yes = h.token(locale === "uk" ? "Можу" : "Can attend");
      await h.click(yes);
      expect(card().text).toContain(
        locale === "uk" ? "Відповіли 1 з 4." : "Answered 1 of 4.",
      );
      expect(card().text).toContain(
        locale === "uk" ? "👍 Може" : "👍 can attend",
      );
      const after = (await snapshot(chatId)).rounds[0]!;
      expect(after.selectedDate).toBe(confirmed.selectedDate);
      expect(after.selectedStartMinute).toBe(confirmed.selectedStartMinute);
      expect(
        after.participants.find((p) => p.telegramUserId === BigInt(ownerId))
          ?.availability,
      ).toBe("AVAILABLE");
      const participantLines = card()
        .text.split("\n")
        .filter((line: string) => /^(⬜|👍|👎) /.test(line));
      await prisma.chatMembership.updateMany({
        where: { chatId, telegramUserId: BigInt(ownerId + 3) },
        data: { deactivatedAt: now },
      });
      await h.message("/plan_status");
      expect(
        card()
          .text.split("\n")
          .filter((line: string) => /^(⬜|👍|👎) /.test(line)),
      ).toEqual(participantLines);
      expect((await snapshot(chatId)).rounds[0]!.participants).toEqual(
        after.participants,
      );
    },
  );
  it.each(["en", "uk"] as const)(
    "authoritative range survives a chat timezone change in %s",
    async (locale) => {
      const chatId = locale === "uk" ? -71007n : -71008n;
      await prisma.chatConfiguration.create({
        data: {
          chatId,
          ...createChatConfiguration({ timezone: "Europe/Kyiv" }),
        },
      });
      await prisma.chatLanguagePreference.create({
        data: { chatId, locale, explicitlySelected: true },
      });
      await prisma.telegramUser.upsert({
        where: { telegramUserId: 8201n },
        create: { telegramUserId: 8201n, firstName: "Member" },
        update: {},
      });
      await prisma.chatMembership.create({
        data: { chatId, telegramUserId: 8201n, activeAt: now },
      });
      const h = session(chatId);
      await h.message("/plan");
      await h.click(h.token(locale === "uk" ? "Чт 27" : "Thu 27"));
      await h.click(h.token("19:00"));
      expect(
        h.calls.find((call) => call.method === "editMessageText")?.payload.text,
      ).toContain("19:00–21:00");
      await h.click(
        h.token(
          locale === "uk" ? "Підтвердити репетицію" : "Confirm rehearsal",
        ),
      );
      expect(
        h.calls
          .find((call) => call.method === "editMessageText")
          ?.payload.text.split("\n")[1],
      ).toBe("19:00–21:00");
      const before = (await snapshot(chatId)).rounds[0]!;
      await prisma.chatConfiguration.update({
        where: { chatId },
        data: { timezone: "America/Los_Angeles" },
      });
      await h.message("/plan_status");
      const card = h.calls.find((call) => call.method === "sendMessage")!;
      expect(card.payload.text).toContain(
        locale === "uk" ? "Четвер, 27 серпня" : "Thu 27 Aug",
      );
      expect(card.payload.text.split("\n")[1]).toBe("19:00–21:00");
      const after = (await snapshot(chatId)).rounds[0]!;
      for (const field of [
        "timezone",
        "selectedDate",
        "selectedStartMinute",
        "durationMinutes",
        "startsAt",
        "endsAt",
        "status",
        "participants",
      ] as const)
        expect(after[field]).toEqual(before[field]);
    },
  );

  it("resolves review and committed ranges across a DST clock change", async () => {
    const chatId = -71009n;
    await prisma.chatConfiguration.create({
      data: {
        chatId,
        ...createChatConfiguration({
          timezone: "Europe/Kyiv",
          dailyStartMinute: 120,
          dailyEndMinute: 600,
          defaultStartMinute: 120,
        }),
      },
    });
    await prisma.chatLanguagePreference.create({
      data: { chatId, locale: "uk", explicitlySelected: true },
    });
    await prisma.telegramUser.upsert({
      where: { telegramUserId: 8201n },
      create: { telegramUserId: 8201n, firstName: "Member" },
      update: {},
    });
    await prisma.chatMembership.create({
      data: { chatId, telegramUserId: 8201n, activeAt: now },
    });
    const h = session(chatId, "en", new Date("2026-10-21T09:00:00Z"));
    await h.message("/plan");
    await h.click(h.token("Нд 25"));
    await h.click(h.token("02:00"));
    expect(
      h.calls
        .find((call) => call.method === "editMessageText")
        ?.payload.text.split("\n")[1],
    ).toBe("02:00–03:00");
    await h.click(h.token("Підтвердити репетицію"));
    expect(
      h.calls
        .find((call) => call.method === "editMessageText")
        ?.payload.text.split("\n")[1],
    ).toBe("02:00–03:00");
    const round = (await snapshot(chatId)).rounds[0]!;
    expect(round.selectedDate).toBe("2026-10-25");
    expect(round.selectedStartMinute).toBe(120);
    expect(round.startsAt?.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(round.endsAt?.toISOString()).toBe("2026-10-25T01:00:00.000Z");
  });
  it("real day card uses the persisted locale and preserves token dates", async () => {
    const chatId = -71006n;
    await prisma.chatConfiguration.create({
      data: { chatId, ...createChatConfiguration() },
    });
    await prisma.chatLanguagePreference.create({
      data: { chatId, locale: "uk", explicitlySelected: true },
    });
    const h = session(chatId, "en");
    await h.message("/plan");
    const card = h.calls.find((call) => call.payload.reply_markup)!;
    expect(card.payload.text).toContain("Понеділок, 24 серпня");
    const token = h.token("Чт 27");
    const before = await snapshot(chatId);
    expect(before.rounds[0]?.selectedDate).toBeNull();
    await h.click(token);
    expect(
      h.calls.find((call) => call.method === "editMessageText")?.payload.text,
    ).toContain("Четвер, 27 серпня");
    expect((await snapshot(chatId)).rounds[0]?.selectedDate).toBe("2026-08-27");
  });
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
      const token = h.token(locale === "uk" ? "Чт 27" : "Thu 27");
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
    await h.click(h.token("Чт 27"));
    await h.click(h.token("15:00"));
    await h.click(h.token("Підтвердити репетицію"));
    const token = h.token("Можу");
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
