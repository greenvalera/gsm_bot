import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const author = 87601;
const member = 87602;
let nextChat = -76000n;
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => {
  await prisma?.$disconnect();
  await database?.stop();
}, 60000);

type Call = { method: string; payload: any };
function session(chatId: bigint) {
  const calls: Call[] = [];
  const history: Call[] = [];
  let sequence = 0;
  let messageId = 500;
  let clock = now;
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
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
    history.push({ method, payload });
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
  const from = (id: number) => ({
    id,
    is_bot: false,
    first_name: "Оля <&>",
    language_code: "de",
  });
  return {
    calls,
    history,
    advance() {
      clock = new Date(clock.getTime() + 61000);
    },
    token(label: string) {
      for (const call of [...history].reverse()) {
        const button = call.payload.reply_markup?.inline_keyboard
          .flat()
          .find((b: any) => b.text.endsWith(label));
        if (button) return button.callback_data as string;
      }
      throw new Error(`Missing visible label ${label}`);
    },
    async message(text: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          from: from(author),
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
        },
      });
    },
    async click(data: string, actor = author) {
      calls.length = 0;
      const id = String(++sequence);
      await bot.handleUpdate({
        update_id: sequence,
        callback_query: {
          id,
          chat_instance: "switch",
          from: from(actor),
          data,
          message: { message_id: messageId, date: 1, chat },
        },
      });
      expect(
        calls.filter(
          (c) =>
            c.method === "answerCallbackQuery" &&
            c.payload.callback_query_id === id,
        ),
      ).toHaveLength(1);
    },
  };
}
async function fixture() {
  const chatId = nextChat--;
  await prisma.chatConfiguration.create({
    data: { chatId, ...createChatConfiguration() },
  });
  await prisma.chatLanguagePreference.create({
    data: { chatId, locale: "en", explicitlySelected: true },
  });
  for (const id of [author, member]) {
    await prisma.telegramUser.upsert({
      where: { telegramUserId: BigInt(id) },
      create: { telegramUserId: BigInt(id), firstName: "Оля <&>" },
      update: {},
    });
    await prisma.chatMembership.create({
      data: { chatId, telegramUserId: BigInt(id), activeAt: now },
    });
  }
  const h = session(chatId);
  await h.message("/plan");
  const read = () =>
    prisma.planningRound.findFirstOrThrow({
      where: { chatId },
      include: { participants: { orderBy: { telegramUserId: "asc" } } },
    });
  return { h, chatId, read };
}
async function durable(chatId: bigint) {
  return {
    rounds: await prisma.planningRound.findMany({
      where: { chatId },
      include: { participants: { orderBy: { telegramUserId: "asc" } } },
    }),
    config: await prisma.chatConfiguration.findUnique({ where: { chatId } }),
    reminders: await prisma.reminderOccurrence.findMany({ where: { chatId } }),
    reminderState: await prisma.chatReminderState.findUnique({
      where: { chatId },
    }),
    actions: await prisma.callbackAction.findMany({
      where: { chatId, kind: "PLANNING" },
      orderBy: { token: "asc" },
    }),
  };
}
async function switchLanguage(
  h: ReturnType<typeof session>,
  chatId: bigint,
  locale: "en" | "uk",
) {
  const before = await durable(chatId);
  await h.message("/settings");
  await h.click(h.token("Мова / Language"));
  await h.click(h.token(locale === "uk" ? "Українська" : "English"));
  expect(
    (
      await prisma.chatLanguagePreference.findUniqueOrThrow({
        where: { chatId },
      })
    ).locale,
  ).toBe(locale);
  expect(await durable(chatId)).toEqual(before);
  expect(h.calls.filter((c) => c.method === "editMessageText")).toHaveLength(1);
  const anchor = before.rounds[0]!.anchorMessageId;
  expect(
    h.calls.some(
      (c) => c.method === "editMessageText" && c.payload.message_id === anchor,
    ),
  ).toBe(false);
}
function assertCard(
  h: ReturnType<typeof session>,
  locale: "en" | "uk",
  text: string,
  button: string,
) {
  const card = h.calls.find(
    (c) => c.method === "editMessageText" || c.method === "sendMessage",
  )?.payload;
  expect(card, "ordinary update must render a card").toBeDefined();
  expect(card.text).toContain(text);
  expect(card.text).toContain(locale === "uk" ? "Організатор:" : "Planned by");
  expect(
    card.reply_markup.inline_keyboard
      .flat()
      .some((b: any) => b.text.endsWith(button)),
  ).toBe(true);
  return card;
}

describe("ordinary update after changing language", () => {
  it("refreshes repeated day/time selections with stable revision and controls in both directions", async () => {
    const { h, chatId } = await fixture();
    const day = h.token("Thu 27");
    await h.click(day);
    const time = h.token("19:00");
    for (const locale of ["uk", "en"] as const) {
      await switchLanguage(h, chatId, locale);
      const before = await durable(chatId);
      await h.click(day);
      assertCard(
        h,
        locale,
        locale === "uk" ? "Обери час початку." : "Choose a start time.",
        locale === "uk" ? "Назад" : "Back",
      );
      expect(await durable(chatId)).toEqual(before);
      await h.click(day);
      expect(
        h.calls.filter((c) => c.method === "editMessageText"),
      ).toHaveLength(0);
    }
    await h.click(time);
    const confirm = h.token("Confirm rehearsal");
    for (const locale of ["uk", "en"] as const) {
      await switchLanguage(h, chatId, locale);
      const before = await durable(chatId);
      await h.click(time);
      assertCard(
        h,
        locale,
        "19:00–21:00",
        locale === "uk" ? "Підтвердити репетицію" : "Confirm rehearsal",
      );
      expect(await durable(chatId)).toEqual(before);
    }
    await h.click(confirm);
    expect((await durable(chatId)).rounds[0]!.status).toBe("CONFIRMED");
  });

  it("refreshes repeated availability answers without another mutation or notification", async () => {
    const { h, chatId } = await fixture();
    await h.click(h.token("Thu 27"));
    await h.click(h.token("19:00"));
    await h.click(h.token("Confirm rehearsal"));
    const yes = h.token("Can attend");
    await h.click(yes);
    for (const locale of ["uk", "en"] as const) {
      await switchLanguage(h, chatId, locale);
      const before = await durable(chatId);
      await h.click(yes);
      assertCard(
        h,
        locale,
        locale === "uk" ? "Відповіли 1 з 2." : "Answered 1 of 2.",
        locale === "uk" ? "Можу" : "Can attend",
      );
      expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
      expect(await durable(chatId)).toEqual(before);
      await h.click(yes);
      expect(
        h.calls.filter((c) => c.method === "editMessageText"),
      ).toHaveLength(0);
    }
  });

  it.each(["DAY", "TIME", "REVIEW", "CONFIRMED"])(
    "uses the current language for /plan_status at %s",
    async (step) => {
      const { h, chatId, read } = await fixture();
      if (step !== "DAY") await h.click(h.token("Thu 27"));
      if (["REVIEW", "CONFIRMED"].includes(step))
        await h.click(h.token("19:00"));
      if (step === "CONFIRMED") await h.click(h.token("Confirm rehearsal"));
      for (const locale of ["uk", "en"] as const) {
        await switchLanguage(h, chatId, locale);
        const before = await read();
        h.advance();
        await h.message("/plan_status");
        const card = h.calls.find((c) => c.method === "sendMessage")!.payload;
        expect(card.text).toContain(
          locale === "uk" ? "Організатор:" : "Planned by",
        );
        const after = await read();
        // Status recovery deliberately reanchors and increments revision; locale
        // switching itself above must not do either.
        expect(after.revision).toBe(before.revision + 1);
        for (const field of [
          "status",
          "step",
          "authorUserId",
          "selectedDate",
          "selectedStartMinute",
          "startsAt",
          "endsAt",
          "timezone",
          "participants",
          "readyAnnouncedAt",
        ] as const)
          expect(after[field]).toEqual(before[field]);
      }
    },
  );
});
