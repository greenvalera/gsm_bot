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

  it("consumes one initiator-bound confirmation and soft-deactivates the exact membership once", async () => {
    const roster = new RosterService(prisma);
    const chatId = -1006543210003n;
    const actorId = 3301n;
    const otherActorId = 3302n;
    const target = { id: 3303n, isBot: false, firstName: "Mina" };
    const now = new Date("2026-08-20T12:00:00.000Z");
    const added = await roster.addFromRepliedUser(chatId, actorId, target);

    const request = await roster.createRemovalAction(
      chatId,
      actorId,
      added.member.membershipId,
      now,
    );
    expect(request).toMatch(/^v1:/);
    expect(request).not.toContain(target.id.toString());
    const persistedRequest = await prisma.callbackAction.findUnique({
      where: { token: request! },
    });
    expect(persistedRequest).toMatchObject({
      chatId,
      actorUserId: actorId,
      consumedAt: null,
    });
    expect(persistedRequest?.targetId).not.toContain(target.id.toString());

    await expect(
      roster.beginRemoval(chatId, otherActorId, request!, now),
    ).resolves.toEqual({ kind: "stale" });
    const confirmation = await roster.beginRemoval(
      chatId,
      actorId,
      request!,
      now,
    );
    expect(confirmation.kind).toBe("confirmation");
    if (confirmation.kind !== "confirmation")
      throw new Error("missing confirmation");

    const results = await Promise.all([
      roster.removeConfirmed(chatId, actorId, confirmation.removeToken, now),
      roster.removeConfirmed(chatId, actorId, confirmation.removeToken, now),
    ]);
    expect(results.map((result) => result.kind).sort()).toEqual([
      "duplicate",
      "removed",
    ]);
    const membership = await prisma.chatMembership.findUnique({
      where: { id: added.member.membershipId },
    });
    expect(membership).toMatchObject({ activeAt: null, deactivatedAt: now });
    const deactivatedAt = membership?.deactivatedAt;
    await expect(
      roster.removeConfirmed(chatId, actorId, confirmation.removeToken, now),
    ).resolves.toEqual({ kind: "duplicate" });
    expect(
      (
        await prisma.chatMembership.findUnique({
          where: { id: added.member.membershipId },
        })
      )?.deactivatedAt,
    ).toEqual(deactivatedAt);
  });

  it("rejects expired and stale targets before changing membership", async () => {
    const roster = new RosterService(prisma);
    const chatId = -1006543210004n;
    const actorId = 3401n;
    const target = { id: 3402n, isBot: false, firstName: "Noor" };
    const now = new Date("2026-08-20T12:00:00.000Z");
    const added = await roster.addFromRepliedUser(chatId, actorId, target);
    const request = await roster.createRemovalAction(
      chatId,
      actorId,
      added.member.membershipId,
      now,
    );
    await expect(
      roster.beginRemoval(
        chatId,
        actorId,
        request!,
        new Date(now.getTime() + 31 * 60 * 1000),
      ),
    ).resolves.toEqual({ kind: "stale" });
    expect(
      await prisma.chatMembership.findUnique({
        where: { id: added.member.membershipId },
      }),
    ).toMatchObject({ activeAt: expect.any(Date), deactivatedAt: null });
  });

  it("renders the named second confirmation and rechecks the administrator before removal", async () => {
    const chatId = -1006543210005n;
    const actorId = 3501n;
    const targetId = 3502n;
    const roster = new RosterService(prisma);
    await roster.addFromRepliedUser(chatId, actorId, {
      id: targetId,
      isBot: false,
      firstName: "Ada",
      username: "ada",
    });
    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    let role: "administrator" | "member" = "administrator";
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
          return role;
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
      update_id: 120_005,
      message: {
        message_id: 7,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
        text: "/roster",
        entities: [{ offset: 0, length: 7, type: "bot_command" }],
      },
    } as never);
    const list = calls.at(-1)?.payload;
    const requestToken = (
      list?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0]![0]!.callback_data;
    expect(requestToken).toMatch(/^v1:/);
    expect(requestToken).not.toContain(targetId.toString());

    calls.length = 0;
    await bot.handleUpdate({
      update_id: 120_006,
      callback_query: {
        id: "remove-request",
        from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
        chat_instance: "test-chat-instance",
        data: requestToken,
        message: {
          message_id: 8,
          date: 1_784_000_000,
          chat: { id: Number(chatId), type: "supergroup" },
          text: "<b>Band roster</b>",
        },
      },
    } as never);
    const confirmation = calls.find(
      (call) => call.method === "editMessageText",
    )?.payload;
    expect(confirmation?.text).toBe(
      "<b>Remove Ada — @ada?</b>\nThey will no longer be selected for future rehearsals.",
    );
    const removeToken = (
      confirmation?.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0]![0]!.callback_data;

    role = "member";
    calls.length = 0;
    await bot.handleUpdate({
      update_id: 120_007,
      callback_query: {
        id: "remove-confirm-demoted",
        from: { id: Number(actorId), is_bot: false, first_name: "Demoted" },
        chat_instance: "test-chat-instance",
        data: removeToken,
        message: {
          message_id: 8,
          date: 1_784_000_000,
          chat: { id: Number(chatId), type: "supergroup" },
          text: "<b>Remove Ada — @ada?</b>",
        },
      },
    } as never);
    expect(calls.at(-1)?.payload).toMatchObject({
      text: "Only current chat administrators can do that.",
      show_alert: true,
    });
    expect(await roster.listActive(chatId)).toMatchObject([
      { telegramUserId: targetId },
    ]);
  });
});
