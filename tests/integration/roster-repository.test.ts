import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RosterService } from "../../src/domain/roster/roster-service.js";
import { createBot } from "../../src/app/create-bot.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import type { UserFromGetMe } from "grammy/types";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

let postgres: PostgresTestContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

describe("roster repository migration", () => {
  it("enforces one chat membership per Telegram user and lists active identities only", async () => {
    const roster = new RosterService(prisma);
    const chatId = -1006543210000n;
    const actorId = 3001n;
    const target = { id: 3002n, isBot: false, firstName: "Ada" };

    await roster.addFromRepliedUser(chatId, actorId, target);
    await roster.addFromRepliedUser(chatId, actorId, target);
    expect(await prisma.chatMembership.count({ where: { chatId } })).toBe(1);
    await expect(
      prisma.chatMembership.create({
        data: { chatId, telegramUserId: target.id },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(await roster.listActive(chatId)).toMatchObject([
      { telegramUserId: target.id, firstName: "Ada" },
    ]);
  });

  it("adds only a replied non-bot user and renders the exact add confirmation", async () => {
    const chatId = -1006543210001n;
    const actorId = 3101n;
    const targetId = 3102n;
    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
      } as UserFromGetMe,
      prisma,
      now: () => new Date("2026-08-20T12:00:00.000Z"),
      membershipGateway: {
        async getCurrentRole() {
          return "administrator";
        },
      },
    });
    (
      bot as unknown as { api: { config: { use: (fn: Function) => void } } }
    ).api.config.use(
      async (
        _previous: unknown,
        method: string,
        payload: Record<string, unknown>,
      ) => {
        calls.push({ method, payload });
        return { ok: true, result: true };
      },
    );

    await bot.handleUpdate({
      update_id: 120_001,
      message: {
        message_id: 1,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
        text: "/roster_add",
        entities: [{ offset: 0, length: 11, type: "bot_command" }],
        reply_to_message: {
          message_id: 2,
          date: 1_784_000_000,
          chat: { id: Number(chatId), type: "supergroup" },
          from: {
            id: Number(targetId),
            is_bot: false,
            first_name: "Ada",
            username: "ada",
          },
        },
      },
    } as never);

    expect(calls.at(-1)?.payload.text).toBe(
      "✅ Added Ada — @ada to the band roster.",
    );
    expect(await prisma.chatMembership.count({ where: { chatId } })).toBe(1);

    calls.length = 0;
    await bot.handleUpdate({
      update_id: 120_002,
      message: {
        message_id: 3,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
        text: "/roster_add",
        entities: [{ offset: 0, length: 11, type: "bot_command" }],
      },
    } as never);
    expect(calls.at(-1)?.payload.text).toBe(
      "Reply to a band member's message, then send /roster_add to add them.",
    );
    expect(await prisma.chatMembership.count({ where: { chatId } })).toBe(1);

    calls.length = 0;
    await bot.handleUpdate({
      update_id: 120_003,
      message: {
        message_id: 4,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
        text: "/roster_add",
        entities: [{ offset: 0, length: 11, type: "bot_command" }],
        reply_to_message: {
          message_id: 5,
          date: 1_784_000_000,
          chat: { id: Number(chatId), type: "supergroup" },
          from: { id: 9001, is_bot: true, first_name: "GSMBot" },
        },
      },
    } as never);
    expect(calls.at(-1)?.payload.text).toBe(
      "Reply to a band member's message, then send /roster_add to add them.",
    );
    expect(await prisma.chatMembership.count({ where: { chatId } })).toBe(1);
  });

  it("revalidates the current administrator before roster reads and deletes their draft on demotion", async () => {
    const chatId = -1006543210002n;
    const actorId = 3201n;
    await prisma.setupDraft.create({
      data: {
        chatId,
        actorUserId: actorId,
        expiresAt: new Date("2026-08-20T12:30:00.000Z"),
        reminderMinutes: [],
      },
    });
    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
      } as UserFromGetMe,
      prisma,
      now: () => new Date("2026-08-20T12:00:00.000Z"),
      membershipGateway: {
        async getCurrentRole() {
          return "member";
        },
      },
    });
    (
      bot as unknown as { api: { config: { use: (fn: Function) => void } } }
    ).api.config.use(
      async (
        _previous: unknown,
        method: string,
        payload: Record<string, unknown>,
      ) => {
        calls.push({ method, payload });
        return { ok: true, result: true };
      },
    );

    await bot.handleUpdate({
      update_id: 120_004,
      message: {
        message_id: 6,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: Number(actorId), is_bot: false, first_name: "Demoted" },
        text: "/roster",
        entities: [{ offset: 0, length: 7, type: "bot_command" }],
      },
    } as never);

    expect(calls.at(-1)?.payload.text).toBe(
      "Only current chat administrators can change chat setup, roster, or planning access.",
    );
    expect(
      await prisma.setupDraft.findUnique({
        where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
      }),
    ).toBeNull();
  });
});
