import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let postgres: PostgresTestContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

async function settings(chatId: bigint, clientLanguage = "uk") {
  const texts: string[] = [];
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "GSMBot",
      username: "gsmbot",
    } as UserFromGetMe,
    prisma,
    now: () => new Date("2026-09-16T12:00:00Z"),
    membershipGateway: {
      async getCurrentRole() {
        return "administrator";
      },
    },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    if (method !== "sendMessage") {
      throw new Error(`Unexpected Telegram API method: ${method}`);
    }
    const text = (payload as { text: string }).text;
    texts.push(text);
    return {
      ok: true,
      result: {
        message_id: 500,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        text,
      },
    } as never;
  });
  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_784_000_000,
      chat: { id: Number(chatId), type: "supergroup", title: "Band" },
      from: {
        id: 8101,
        is_bot: false,
        first_name: "Admin",
        language_code: clientLanguage,
      },
      text: "/settings",
      entities: [{ type: "bot_command", offset: 0, length: 9 }],
    },
  });
  return texts.join("\n");
}

describe("persisted locale through composed /settings", () => {
  it("defaults an unconfigured chat to English regardless of client language", async () => {
    const chatId = -1006001000001n;
    expect(await settings(chatId)).toContain("Language: English");
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId } }),
    ).toBeNull();
  });

  it("reads Ukrainian before configuration and after bot reconstruction without borrowing another chat's preference", async () => {
    const chatId = -1006001000002n;
    await prisma.$executeRaw`
      INSERT INTO chat_language_preferences (chat_id, locale, explicitly_selected, updated_at)
      VALUES (${chatId}, 'uk', true, CURRENT_TIMESTAMP)
    `;
    expect(await settings(chatId, "en")).toContain("Мова: Українська");
    expect(await settings(chatId, "en")).toContain("Мова: Українська");
    expect(await settings(-1006001000003n)).toContain("Language: English");
    expect(await prisma.chatConfiguration.count()).toBe(0);
  });

  it("keeps identical explicit English preferences owned by separate bigint chats", async () => {
    for (const chatId of [-1006001000004n, -1006001000005n]) {
      await prisma.$executeRaw`
        INSERT INTO chat_language_preferences (chat_id, locale, explicitly_selected, updated_at)
        VALUES (${chatId}, 'en', true, CURRENT_TIMESTAMP)
      `;
      expect(await settings(chatId)).toContain("Language: English");
    }
    const rows = await prisma.$queryRaw<
      Array<{ chat_id: bigint; explicitly_selected: boolean }>
    >`
      SELECT chat_id, explicitly_selected FROM chat_language_preferences WHERE locale = 'en' ORDER BY chat_id
    `;
    expect(rows).toEqual([
      { chat_id: -1006001000005n, explicitly_selected: true },
      { chat_id: -1006001000004n, explicitly_selected: true },
    ]);
  });
});

function navigation(chatId: bigint, actorId = 8101) {
  const calls: Array<{ method: string; payload: any }> = [];
  let now = new Date("2026-09-16T12:00:00Z");
  let updateId = 100;
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "GSMBot",
      username: "gsmbot",
    } as UserFromGetMe,
    prisma,
    now: () => now,
    membershipGateway: {
      async getCurrentRole() {
        return "administrator";
      },
    },
  });
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
  };
  const from = {
    id: actorId,
    is_bot: false,
    first_name: "Admin",
    language_code: "en",
  };
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    if (method === "answerCallbackQuery")
      return { ok: true, result: true } as never;
    if (method !== "sendMessage" && method !== "editMessageText")
      throw Error(`Unexpected API ${method}`);
    return {
      ok: true,
      result: {
        message_id: 500,
        date: 1784000000,
        chat,
        text: (payload as any).text,
      },
    } as never;
  });
  return {
    calls,
    advance() {
      now = new Date(now.getTime() + 31 * 60000);
    },
    async command(command: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: updateId++,
        message: {
          message_id: 1,
          date: 1,
          chat,
          from,
          text: command,
          entities: [
            { type: "bot_command", offset: 0, length: command.length },
          ],
        },
      });
    },
    token(label: string) {
      const card = calls.findLast((c) => c.payload.reply_markup);
      const buttons = card?.payload.reply_markup.inline_keyboard.flat();
      const button = buttons?.find((b: any) => b.text === label);
      expect(button, `button ${label}`).toBeDefined();
      return button.callback_data as string;
    },
    async click(token: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: updateId++,
        callback_query: {
          id: String(updateId),
          chat_instance: "c",
          from,
          data: token,
          message: { message_id: 500, date: 1, chat },
        },
      });
      expect(
        calls.filter((c) => c.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
    text() {
      return calls
        .filter((c) => c.payload.text)
        .map((c) => c.payload.text)
        .join("\n");
    },
  };
}

it("keeps the selected language after cancelling persisted setup and reconstructing the bot", async () => {
  const chatId = -1006002000004n;
  const h = navigation(chatId);
  await h.command("/setup");
  await h.click(h.token("Українська"));
  const preference = await prisma.chatLanguagePreference.findUniqueOrThrow({
    where: { chatId },
  });
  const draft = await prisma.setupDraft.findFirstOrThrow({ where: { chatId } });
  await prisma.setupDraft.update({
    where: { id: draft.id },
    data: {
      timezone: "Europe/Kyiv",
      defaultWeekday: 3,
      defaultStartMinute: 1170,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
      reminderMinutes: [600, 960],
      planningAccessPolicy: "ADMINS_ONLY",
    },
  });
  await h.command("/setup");
  expect(h.text()).toContain("Мова: Українська");
  await h.click(h.token("Скасувати налаштування"));
  expect(h.text()).toContain("Налаштування скасовано.");
  expect(
    await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
  ).toBeNull();
  expect(
    await prisma.chatConfiguration.findUnique({ where: { chatId } }),
  ).toBeNull();
  expect(
    await prisma.chatLanguagePreference.findUnique({ where: { chatId } }),
  ).toEqual(preference);

  const restarted = navigation(chatId);
  await restarted.command("/setup");
  expect(restarted.text()).toContain("Надішли геолокацію");
  expect(restarted.text()).not.toContain("Choose this chat's language.");
  expect(
    await prisma.chatLanguagePreference.findUnique({ where: { chatId } }),
  ).toEqual(preference);
  expect(
    await prisma.setupDraft.findFirst({ where: { chatId } }),
  ).toMatchObject({
    actorUserId: 8101n,
    timezone: null,
  });
  expect(
    await prisma.chatConfiguration.findUnique({ where: { chatId } }),
  ).toBeNull();
});

describe("composed durable language navigation", () => {
  it("selects Ukrainian through real minted callbacks then resumes after service/bot reconstruction", async () => {
    const chatId = -1006002000001n;
    const h = navigation(chatId);
    await h.command("/setup");
    expect(h.text()).toBe("Choose this chat's language.");
    expect(await prisma.setupDraft.count({ where: { chatId } })).toBe(0);
    await h.click(h.token("Українська"));
    expect(h.text()).toContain("Надішли геолокацію");
    expect(h.token("Мова / Language")).toMatch(/^v1:/);
    expect(await new LanguageService(prisma).resolve(chatId)).toEqual({
      locale: "uk",
      explicitlySelected: true,
    });
    const draft = await prisma.setupDraft.findFirstOrThrow({
      where: { chatId },
    });
    const reconstructed = navigation(chatId);
    await reconstructed.command("/setup");
    expect(reconstructed.text()).toContain("Надішли геолокацію");
    expect(
      (await prisma.setupDraft.findFirstOrThrow({ where: { chatId } })).id,
    ).toBe(draft.id);
    await reconstructed.command("/settings");
    expect(reconstructed.text()).toBe("Мова: Українська");
    await reconstructed.click(reconstructed.token("Мова / Language"));
    const same = reconstructed.token("Українська");
    const before = await prisma.chatLanguagePreference.findUnique({
      where: { chatId },
    });
    await reconstructed.click(same);
    expect(
      reconstructed.calls.find((c) => c.method === "answerCallbackQuery")
        ?.payload.text,
    ).toBeUndefined();
    expect(
      await prisma.chatLanguagePreference.findUnique({ where: { chatId } }),
    ).toEqual(before);
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId } }),
    ).toBeNull();
  });

  it("keeps actor drafts when continuing and restarts expired drafts in saved language", async () => {
    const chatId = -1006002000002n;
    const h = navigation(chatId);
    await h.command("/setup");
    await h.click(h.token("Українська"));
    const draft = await prisma.setupDraft.findFirstOrThrow({
      where: { chatId },
    });
    await prisma.setupDraft.update({
      where: { id: draft.id },
      data: { timezone: "Europe/Kyiv", defaultWeekday: 4 },
    });
    await h.command("/settings");
    await h.click(h.token("Продовжити налаштування"));
    expect(
      await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({ timezone: "Europe/Kyiv", defaultWeekday: 4 });
    const other = navigation(chatId, 8102);
    await other.command("/settings");
    await other.click(other.token("Продовжити налаштування"));
    expect(await prisma.setupDraft.count({ where: { chatId } })).toBe(2);
    expect(
      await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({ actorUserId: 8101n, timezone: "Europe/Kyiv" });
    h.advance();
    await h.command("/settings");
    await h.click(h.token("Продовжити налаштування"));
    expect(h.text()).toContain("Надішли геолокацію");
    expect(
      await prisma.setupDraft.findFirst({
        where: { chatId, actorUserId: 8101n },
      }),
    ).toMatchObject({ timezone: null, defaultWeekday: null });
  });

  it("records English once without change confirmation and accepts independent administrators' valid screens", async () => {
    const chatId = -1006002000003n;
    const a = navigation(chatId);
    const b = navigation(chatId, 8102);
    await a.command("/setup");
    await a.click(a.token("English"));
    expect(
      a.calls.find((c) => c.method === "answerCallbackQuery")?.payload.text,
    ).toBeUndefined();
    await a.command("/settings");
    await a.click(a.token("Мова / Language"));
    const uk = a.token("Українська");
    await b.command("/settings");
    await b.click(b.token("Мова / Language"));
    const en = b.token("English");
    await a.click(uk);
    expect(a.text()).toContain("Мову змінено на українську.");
    await b.click(en);
    expect(b.text()).toContain("Language changed to English.");
    expect(await new LanguageService(prisma).resolve(chatId)).toEqual({
      locale: "en",
      explicitlySelected: true,
    });
  });
});
