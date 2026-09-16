import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/app/create-bot.js";
import { migrateChat } from "../../src/domain/chat/migration-service.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let postgres: PostgresTestContainer;
let prisma: PrismaClient;
const now = new Date("2026-09-11T09:00:00Z");
beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 180_000);
afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

async function fixture(oldChatId: bigint) {
  await prisma.chatLanguagePreference.create({
    data: {
      chatId: oldChatId,
      locale: "uk",
      explicitlySelected: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  await prisma.chatConfiguration.create({
    data: {
      chatId: oldChatId,
      timezone: "Europe/Kyiv",
      defaultWeekday: 5,
      defaultStartMinute: 1020,
      durationMinutes: 120,
      dailyStartMinute: 540,
      dailyEndMinute: 1320,
      reminderMinutes: [60],
      planningAccessPolicy: "PREVIOUS_PARTICIPANTS",
    },
  });
  const member = await prisma.chatMembership.create({
    data: {
      chatId: oldChatId,
      telegramUser: {
        connectOrCreate: {
          where: { telegramUserId: 123n },
          create: { telegramUserId: 123n, firstName: "Band member" },
        },
      },
    },
  });
  const round = await prisma.planningRound.create({
    data: {
      chatId: oldChatId,
      authorUserId: 123n,
      targetWeekStart: "2026-09-07",
      activeWeekStart: "2026-09-07",
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 540,
      dailyEndMinute: 1320,
      lastActivityAt: now,
      anchorMessageId: 358,
      announcementMessageId: 359,
      readyAnnouncedAt: now,
      participants: {
        create: {
          telegramUserId: 123n,
          membershipId: member.id,
          availability: "AVAILABLE",
          answeredAt: now,
        },
      },
    },
    include: { participants: true },
  });
  await prisma.callbackAction.create({
    data: {
      token: `old-token:${oldChatId}`,
      kind: "PLANNING",
      chatId: oldChatId,
      actorUserId: 123n,
      targetId: round.id,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  await prisma.setupDraft.create({
    data: {
      chatId: oldChatId,
      actorUserId: 123n,
      timezone: "Europe/Kyiv",
      reminderMinutes: [],
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  await prisma.settingsEditDraft.create({
    data: {
      chatId: oldChatId,
      actorUserId: 123n,
      field: "DURATION_MINUTES",
      replacementPayload: 180,
      expectedRevision: 1,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  return round;
}

describe("Telegram group migration continuity", () => {
  it("moves configuration, roster, answers and prompts atomically while retiring old message capabilities", async () => {
    const oldId = -501n,
      newId = -100501n;
    const before = await fixture(oldId);
    await prisma.chatStatusCooldown.create({
      data: { chatId: newId, lastPostedAt: now },
    });
    expect(await migrateChat(prisma, oldId, newId, now)).toBe("migrated");
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: newId },
      }),
    ).toEqual({
      chatId: newId,
      locale: "uk",
      explicitlySelected: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId: oldId } }),
    ).toBeNull();
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId: newId } }),
    ).toMatchObject({
      timezone: "Europe/Kyiv",
      planningAccessPolicy: "PREVIOUS_PARTICIPANTS",
      revision: 1,
    });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
      include: { participants: true },
    });
    expect(after).toMatchObject({
      chatId: newId,
      status: before.status,
      activeWeekStart: before.activeWeekStart,
      revision: before.revision + 1,
      anchorMessageId: null,
      announcementMessageId: null,
      readyAnnouncedAt: now,
    });
    expect(after.participants).toEqual(
      before.participants.map((p) => ({ ...p, chatId: newId })),
    );
    expect(
      await prisma.chatMembership.count({ where: { chatId: newId } }),
    ).toBe(1);
    expect(
      await prisma.setupDraft.findFirst({ where: { chatId: newId } }),
    ).toMatchObject({ timezone: "Europe/Kyiv" });
    expect(
      await prisma.settingsEditDraft.findFirst({ where: { chatId: newId } }),
    ).toMatchObject({ replacementPayload: 180 });
    expect(
      await prisma.callbackAction.findFirst({ where: { chatId: newId } }),
    ).toMatchObject({ consumedAt: now, expiresAt: now });
    expect(
      await prisma.chatStatusCooldown.count({
        where: { chatId: { in: [oldId, newId] } },
      }),
    ).toBe(0);
    expect(await migrateChat(prisma, oldId, newId, now)).toBe(
      "already-migrated",
    );
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: before.id },
        include: { participants: true },
      }),
    ).toEqual(after);
  });

  it("rejects conflicting destination data and alternate/reversed migration identities without changing source", async () => {
    const oldId = -502n,
      newId = -100502n;
    const before = await fixture(oldId);
    await fixture(newId);
    await expect(migrateChat(prisma, oldId, newId, now)).rejects.toThrow(
      "conflicts",
    );
    expect(
      await prisma.planningRound.findUnique({ where: { id: before.id } }),
    ).toMatchObject({ chatId: oldId, anchorMessageId: 358, revision: 1 });
    expect(
      await prisma.chatMigration.count({ where: { oldChatId: oldId } }),
    ).toBe(0);
    await expect(migrateChat(prisma, -100501n, -501n, now)).rejects.toThrow(
      "conflicts",
    );
    await expect(migrateChat(prisma, -501n, -900n, now)).rejects.toThrow(
      "conflicts",
    );
  });

  it("serializes concurrent duplicates and supports empty/unconfigured chats", async () => {
    const results = await Promise.all([
      migrateChat(prisma, -503n, -100503n, now),
      migrateChat(prisma, -503n, -100503n, now),
    ]);
    expect(results.sort()).toEqual(["already-migrated", "migrated"]);
    await expect(migrateChat(prisma, -504n, -504n, now)).rejects.toThrow();
    await expect(migrateChat(prisma, 504n, -100504n, now)).rejects.toThrow();
  });

  it("restores exactly two live answer capabilities for collecting rounds and retains terminal history", async () => {
    const oldId = -506n,
      newId = -100506n;
    const before = await fixture(oldId);
    await prisma.planningRound.update({
      where: { id: before.id },
      data: {
        status: "CONFIRMED",
        activeWeekStart: null,
        confirmedAt: now,
        startsAt: new Date("2026-09-12T12:00:00Z"),
        endsAt: new Date("2026-09-12T14:00:00Z"),
      },
    });
    const history = await prisma.planningRound.create({
      data: {
        chatId: oldId,
        authorUserId: 123n,
        targetWeekStart: "2026-08-31",
        status: "CANCELLED",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 540,
        dailyEndMinute: 1320,
        lastActivityAt: now,
        cancelledAt: now,
        cancelledByUserId: 123n,
        anchorMessageId: 400,
      },
    });
    await migrateChat(prisma, oldId, newId, now);
    const service = new PlanningService(prisma);
    const status = await service.status(newId, 123n, now);
    expect(status.kind).toBe("live");
    if (status.kind !== "live")
      throw new Error("Expected recovered collecting card");
    expect(
      status.actions
        .filter((action) => action.target.action === "answer")
        .map((action) => action.target),
    ).toEqual(
      expect.arrayContaining([
        { action: "answer", roundId: before.id, answer: "AVAILABLE" },
        { action: "answer", roundId: before.id, answer: "UNAVAILABLE" },
      ]),
    );
    const tokens = await prisma.callbackAction.findMany({
      where: { chatId: newId, consumedAt: null },
    });
    expect(tokens).toHaveLength(3);
    await migrateChat(prisma, oldId, newId, now);
    expect(
      await prisma.callbackAction.findMany({
        where: { chatId: newId, consumedAt: null },
      }),
    ).toEqual(tokens);
    expect(
      await prisma.planningRound.findUnique({ where: { id: history.id } }),
    ).toMatchObject({
      chatId: newId,
      status: "CANCELLED",
      cancelledAt: now,
      cancelledByUserId: 123n,
      anchorMessageId: null,
    });
  });

  it("rolls back the entire transfer if the final ledger write fails", async () => {
    const oldId = -507n,
      newId = -100507n;
    const before = await fixture(oldId);
    const failing = prisma.$extends({
      query: {
        chatMigration: {
          async create() {
            throw new Error("injected failure");
          },
        },
      },
    });
    await expect(
      migrateChat(failing as unknown as PrismaClient, oldId, newId, now),
    ).rejects.toThrow("injected failure");
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: oldId },
      }),
    ).toMatchObject({ locale: "uk", updatedAt: now });
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: newId },
      }),
    ).toBeNull();
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: before.id },
        include: { participants: true },
      }),
    ).toEqual(before);
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId: newId } }),
    ).toBeNull();
    expect(
      await prisma.callbackAction.findFirst({ where: { chatId: oldId } }),
    ).toMatchObject({ consumedAt: null });
  });

  it("handles migrate_from before migrate_to and ignores delayed old-chat commands", async () => {
    const oldId = -505n,
      newId = -100505n;
    const before = await fixture(oldId);
    const calls: string[] = [];
    const bot = createBot({
      botToken: "123456:TEST",
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
    bot.api.config.use(async (_previous, method, payload) => {
      calls.push(method);
      return {
        ok: true,
        result: {
          message_id: 800,
          date: 1,
          chat: { id: Number(newId), type: "supergroup" },
          text: "text" in payload ? payload.text : "",
        },
      } as never;
    });
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1,
        from: { id: 123, is_bot: false, first_name: "Member" },
        chat: { id: Number(newId), type: "supergroup", title: "Band" },
        migrate_from_chat_id: Number(oldId),
      },
    });
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 2,
        date: 1,
        from: { id: 123, is_bot: false, first_name: "Member" },
        chat: { id: Number(oldId), type: "group", title: "Band" },
        migrate_to_chat_id: Number(newId),
      },
    });
    await bot.handleUpdate({
      update_id: 3,
      message: {
        message_id: 3,
        date: 1,
        chat: { id: Number(oldId), type: "group", title: "Band" },
        from: { id: 123, is_bot: false, first_name: "Member" },
        text: "/setup",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    });
    expect(calls).toEqual([]);
    expect(
      await prisma.chatConfiguration.findUnique({ where: { chatId: oldId } }),
    ).toBeNull();
    expect(
      await prisma.planningRound.findUnique({ where: { id: before.id } }),
    ).toMatchObject({ chatId: newId, revision: 2 });
    await bot.handleUpdate({
      update_id: 4,
      message: {
        message_id: 4,
        date: 1,
        chat: { id: Number(newId), type: "supergroup", title: "Band" },
        from: { id: 123, is_bot: false, first_name: "Member" },
        text: "/plan_status",
        entities: [{ type: "bot_command", offset: 0, length: 12 }],
      },
    });
    expect(calls).toContain("sendMessage");
    expect(calls).not.toContain("editMessageText");
    expect(
      await prisma.planningRound.findUnique({ where: { id: before.id } }),
    ).toMatchObject({ anchorMessageId: 800, chatId: newId });
  });
});
