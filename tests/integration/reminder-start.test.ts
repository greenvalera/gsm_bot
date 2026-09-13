import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  createCallbackToken,
  createReminderStartTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
let db: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
let role: CurrentTelegramRole;
let at: Date;
let token: string;
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
  await prisma.reminderOccurrence.deleteMany();
  await prisma.planningRound.deleteMany();
  await prisma.chatConfiguration.deleteMany();
  at = new Date("2026-09-14T07:00Z");
  role = "administrator";
  await prisma.chatConfiguration.create({
    data: { chatId: -321n, ...createChatConfiguration() },
  });
  const occurrence = await prisma.reminderOccurrence.create({
    data: {
      chatId: -321n,
      kind: "PLANNING_START",
      scope: "2026-09-14",
      generation: 1,
      civilDate: new Date("2026-09-14"),
      minute: 600,
      dueAt: at,
      disposition: "SENT",
    },
  });
  token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      kind: "PLANNING",
      chatId: -321n,
      actorUserId: 9001n,
      targetId: createReminderStartTarget(occurrence.id, occurrence.scope),
      expiresAt: new Date("2026-09-20T21:00Z"),
    },
  });
});
function harness() {
  const calls: string[] = [];
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as UserFromGetMe,
    prisma,
    logger: createLogger({ level: "silent" }),
    now: () => at,
    membershipGateway: {
      async getCurrentRole() {
        return role;
      },
    },
  });
  bot.api.config.use(async (_prev, method) => {
    calls.push(method);
    return {
      ok: true,
      result:
        method === "sendMessage"
          ? {
              message_id: 901,
              date: 1,
              chat: { id: -321, type: "supergroup" },
              text: "card",
            }
          : true,
    } as never;
  });
  return {
    calls,
    async click(id = 1, chatId = -321) {
      await bot.handleUpdate({
        update_id: id,
        callback_query: {
          id: `cb-${id}`,
          from: { id: 8301, is_bot: false, first_name: "Actor" },
          chat_instance: "test",
          data: token,
          message: {
            message_id: 7,
            date: 1,
            chat: { id: chatId, type: "supergroup", title: "Band" },
          },
        },
      });
    },
  };
}
it("starts as the clicker and duplicate update/callback creates no more capabilities or transitions", async () => {
  const h = harness();
  await h.click();
  expect(await prisma.planningRound.findFirst()).toMatchObject({
    authorUserId: 8301n,
    targetWeekStart: "2026-09-14",
    status: "DRAFT",
  });
  const count = await prisma.callbackAction.count();
  await h.click();
  await h.click(2);
  expect(await prisma.planningRound.count()).toBe(1);
  expect(await prisma.callbackAction.count()).toBe(count);
  expect(h.calls.filter((m) => m === "answerCallbackQuery")).toHaveLength(3);
});
it.each(["member", "left", "kicked", "unknown"] as const)(
  "fails closed for %s under admin policy",
  async (value) => {
    role = value;
    const h = harness();
    await h.click();
    expect(await prisma.planningRound.count()).toBe(0);
    expect(h.calls).toEqual(["answerCallbackQuery"]);
  },
);
it("honors current anyone policy and a policy changed after publication", async () => {
  role = "member";
  await prisma.chatConfiguration.update({
    where: { chatId: -321n },
    data: { planningAccessPolicy: "ANYONE_IN_CHAT" },
  });
  const h = harness();
  await prisma.chatConfiguration.update({
    where: { chatId: -321n },
    data: { planningAccessPolicy: "ADMINS_ONLY" },
  });
  await h.click();
  expect(await prisma.planningRound.count()).toBe(0);
  await prisma.chatConfiguration.update({
    where: { chatId: -321n },
    data: { planningAccessPolicy: "ANYONE_IN_CHAT" },
  });
  await h.click(2);
  expect(await prisma.planningRound.count()).toBe(1);
});
it("requires previous participant standing", async () => {
  role = "member";
  await prisma.chatConfiguration.update({
    where: { chatId: -321n },
    data: { planningAccessPolicy: "PREVIOUS_PARTICIPANTS" },
  });
  const h = harness();
  await h.click();
  expect(await prisma.planningRound.count()).toBe(0);
});
it.each(["wrong-chat", "expired", "stale-week", "claimed-week"])(
  "acknowledges %s once without starting another week",
  async (scenario) => {
    if (scenario === "expired") at = new Date("2026-09-20T21:00Z");
    if (scenario === "stale-week") {
      at = new Date("2026-09-21T07:00Z");
      await prisma.callbackAction.update({
        where: { token },
        data: { expiresAt: new Date("2026-09-30") },
      });
    }
    if (scenario === "claimed-week")
      await prisma.planningRound.create({
        data: {
          chatId: -321n,
          authorUserId: 8301n,
          targetWeekStart: "2026-09-14",
          status: "CONFIRMED",
          step: "REVIEW",
          timezone: "Europe/Kyiv",
          durationMinutes: 120,
          dailyStartMinute: 600,
          dailyEndMinute: 1200,
          lastActivityAt: at,
        },
      });
    const before = await prisma.planningRound.count();
    const h = harness();
    await h.click(1, scenario === "wrong-chat" ? -999 : -321);
    expect(await prisma.planningRound.count()).toBe(before);
    expect(h.calls).toEqual(["answerCallbackQuery"]);
  },
);
