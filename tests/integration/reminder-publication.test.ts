import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { GrammyError } from "grammy";
import { createBot } from "../../src/app/create-bot.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let db: PostgresTestContainer, prisma: ReturnType<typeof createPrismaClient>;
const chatId = -707n,
  actor = 707n,
  at = new Date("2026-09-16T06:00Z");
beforeAll(async () => {
  db = await startPostgresTestContainer();
  prisma = createPrismaClient(db.databaseUrl);
});
afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});
beforeEach(async () => {
  await prisma.callbackAction.deleteMany();
  await prisma.planningParticipant.deleteMany();
  await prisma.planningRound.deleteMany();
  await prisma.chatMembership.deleteMany();
  await prisma.chatConfiguration.deleteMany();
  await prisma.telegramUser.upsert({
    where: { telegramUserId: actor },
    create: { telegramUserId: actor, firstName: "Member" },
    update: {},
  });
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({ planningAccessPolicy: "ANYONE_IN_CHAT" }),
    },
  });
  await prisma.chatMembership.create({
    data: { chatId, telegramUserId: actor, activeAt: at },
  });
});
async function fixture(draft = false) {
  return prisma.planningRound.create({
    data: {
      chatId,
      authorUserId: actor,
      status: draft ? "DRAFT" : "CONFIRMED",
      step: "REVIEW",
      targetWeekStart: "2026-09-14",
      activeWeekStart: draft ? "2026-09-14" : null,
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      lastActivityAt: at,
      selectedDate: "2026-09-18",
      selectedStartMinute: 1080,
      startsAt: new Date("2026-09-18T15:00Z"),
      endsAt: new Date("2026-09-18T17:00Z"),
      anchorMessageId: 70,
    },
  });
}
function harness(now = at, onCall?: (method: string) => Promise<void>) {
  const bot = createBot({
    botToken: "707:test",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "GSMBot",
      username: "gsmbot",
    } as never,
    prisma,
    now: () => now,
    logger: createLogger({ level: "silent" }),
    membershipGateway: { getCurrentRole: async () => "administrator" },
  });
  bot.api.config.use(async (_previous, method) => {
    await onCall?.(method);
    return {
      ok: true,
      result:
        method === "sendMessage"
          ? {
              message_id: 71,
              date: 1,
              chat: { id: Number(chatId), type: "supergroup" },
            }
          : true,
    } as never;
  });
  return bot;
}
function statusUpdate() {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      chat: { id: Number(chatId), type: "supergroup", title: "Band" },
      from: { id: Number(actor), is_bot: false, first_name: "Member" },
      text: "/plan_status",
      entities: [{ offset: 0, length: 12, type: "bot_command" }],
    },
  } as never;
}
it("guards exact chat/current anchor and preserves first publication over ordinary reanchors", async () => {
  const round = await fixture();
  const service = new PlanningService(prisma);
  await service.recordAvailabilityPublication(round.id, chatId, 69, at);
  await service.recordAvailabilityPublication(round.id, -708n, 70, at);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ firstAvailabilityPublishedAt: null });
  await service.recordAvailabilityPublication(round.id, chatId, 70, at);
  const later = new Date(at.getTime() + 3600000);
  await service.reanchor(round.id, 71, 1, later, false);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ availabilityAnchorAcknowledgedAt: null });
  await service.recordAvailabilityPublication(round.id, chatId, 70, later);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ availabilityAnchorAcknowledgedAt: null });
  await service.recordAvailabilityPublication(round.id, chatId, 71, later);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({
    firstAvailabilityPublishedAt: at,
    availabilityAnchorAcknowledgedAt: later,
  });
});
it("legacy status recovery establishes publication and migration recovery restarts grace at acknowledgement", async () => {
  const round = await fixture();
  await harness().handleUpdate(statusUpdate());
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({
    anchorMessageId: 71,
    firstAvailabilityPublishedAt: at,
    availabilityAnchorAcknowledgedAt: at,
  });
  const migrationAt = new Date(at.getTime() + 3600000),
    recoveryAt = new Date(at.getTime() + 7200000);
  await prisma.planningRound.update({
    where: { id: round.id },
    data: {
      anchorMessageId: null,
      availabilityAnchorAcknowledgedAt: null,
      reminderGraceRestartAt: migrationAt,
      lastStatusPostedAt: null,
    },
  });
  await harness(recoveryAt).handleUpdate(statusUpdate());
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({
    firstAvailabilityPublishedAt: at,
    reminderGraceRestartAt: recoveryAt,
    availabilityAnchorAcknowledgedAt: recoveryAt,
  });
  const ordinary = new Date(recoveryAt.getTime() + 3600000);
  await harness(ordinary).handleUpdate(statusUpdate());
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({
    firstAvailabilityPublishedAt: at,
    reminderGraceRestartAt: recoveryAt,
    availabilityAnchorAcknowledgedAt: ordinary,
  });
});
it("failed status send and lost reanchor persistence cannot acknowledge a card", async () => {
  const round = await fixture();
  await harness(at, async (method) => {
    if (method === "sendMessage") throw new Error("failed send");
  }).handleUpdate(statusUpdate());
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ firstAvailabilityPublishedAt: null });
  await harness(at, async (method) => {
    if (method === "sendMessage")
      await prisma.planningRound.update({
        where: { id: round.id },
        data: { revision: { increment: 1 } },
      });
  }).handleUpdate(statusUpdate());
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ anchorMessageId: 70, firstAvailabilityPublishedAt: null });
});
it.each(["success", "failure", "unchanged"])(
  "confirmation acknowledges only successful availability edits (%s)",
  async (outcome) => {
    const round = await fixture(true);
    const token = createCallbackToken();
    await prisma.callbackAction.create({
      data: {
        token,
        kind: "PLANNING",
        chatId,
        actorUserId: actor,
        targetId: createPlanningTarget({
          action: "confirm",
          roundId: round.id,
        }),
        expiresAt: new Date(at.getTime() + 60000),
      },
    });
    await harness(at, async (method) => {
      if (method === "editMessageText" && outcome === "failure")
        throw new Error("failed edit");
      if (method === "editMessageText" && outcome === "unchanged")
        throw new GrammyError(
          "not modified",
          {
            ok: false,
            error_code: 400,
            description: "Bad Request: message is not modified",
          },
          "editMessageText",
          {},
        );
    }).handleUpdate({
      update_id: 2,
      callback_query: {
        id: "c",
        from: { id: Number(actor), is_bot: false, first_name: "Member" },
        chat_instance: "a",
        data: token,
        message: {
          message_id: 70,
          date: 1,
          chat: { id: Number(chatId), type: "supergroup", title: "Band" },
        },
      },
    } as never);
    expect(
      await prisma.planningRound.findUnique({ where: { id: round.id } }),
    ).toMatchObject({
      status: "CONFIRMED",
      firstAvailabilityPublishedAt: outcome === "failure" ? null : at,
    });
  },
);
it("announcement pointer is never accepted as availability publication", async () => {
  const round = await fixture();
  await new PlanningService(prisma).reanchorAnnouncement(round.id, 90, 1, at);
  await new PlanningService(prisma).recordAvailabilityPublication(
    round.id,
    chatId,
    90,
    at,
  );
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ firstAvailabilityPublishedAt: null });
});
