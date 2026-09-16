import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
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
