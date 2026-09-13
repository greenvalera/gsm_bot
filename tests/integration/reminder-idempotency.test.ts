import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/app/create-bot.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  createCallbackToken,
  createPlanningTarget,
  createReminderStartTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
import {
  reminderApp,
  reminderChat,
  reminderDue,
  reminderRound,
  reminderRow,
  resetReminders,
  type ReminderPrisma,
} from "../helpers/reminders.js";
let db: PostgresTestContainer, prisma: ReminderPrisma;
beforeAll(async () => {
  db = await startPostgresTestContainer();
  prisma = createPrismaClient(db.databaseUrl);
});
afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});
beforeEach(async () => resetReminders(prisma));
it.each(["same", "different"])(
  "competing independent clients claiming %s due rows send only once",
  async (kind) => {
    const round = await reminderRound(prisma),
      a = await reminderRow(prisma, round.id);
    const b =
      kind === "same"
        ? a
        : await reminderRow(prisma, round.id, new Date("2026-09-16T10:01Z"));
    const other = createPrismaClient(db.databaseUrl),
      at = new Date("2026-09-16T10:01Z"),
      f = reminderApp(prisma, at);
    try {
      await Promise.all([
        f.app.dispatch(a.id),
        reminderApp(other, at, f.send).app.dispatch(b.id),
      ]);
      await reminderApp(other, at, f.send).app.reconcile(reminderChat);
      expect(f.send).toHaveBeenCalledTimes(1);
      expect(
        await prisma.reminderOccurrence.count({
          where: { roundId: round.id, disposition: "SENT" },
        }),
      ).toBe(1);
      expect(
        await prisma.reminderOccurrence.count({
          where: { roundId: round.id, dueAt: { lte: at } },
        }),
      ).toBe(kind === "same" ? 1 : 2);
    } finally {
      await other.$disconnect();
    }
  },
);
function harness(client = prisma) {
  const methods: string[] = [];
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as UserFromGetMe,
    prisma: client,
    logger: createLogger({ level: "silent" }),
    now: () => reminderDue,
    membershipGateway: { getCurrentRole: async () => "administrator" },
  });
  bot.api.config.use(async (_prev, method) => {
    methods.push(method);
    return {
      ok: true,
      result:
        method === "sendMessage"
          ? {
              message_id: 901,
              date: 1,
              chat: { id: Number(reminderChat), type: "supergroup" },
              text: "card",
            }
          : true,
    } as never;
  });
  return {
    methods,
    click: async (token: string, id = 1) =>
      bot.handleUpdate({
        update_id: id,
        callback_query: {
          id: `cb-${id}`,
          from: { id: 1, is_bot: false, first_name: "A" },
          chat_instance: "test",
          data: token,
          message: {
            message_id: 77,
            date: 1,
            chat: {
              id: Number(reminderChat),
              type: "supergroup",
              title: "Band",
            },
          },
        },
      }),
  };
}
async function state(client = prisma) {
  return {
    rounds: await client.planningRound.findMany({ orderBy: { id: "asc" } }),
    participants: await client.planningParticipant.findMany({
      orderBy: { id: "asc" },
    }),
    actions: await client.callbackAction.count(),
    occurrences: await client.reminderOccurrence.findMany({
      orderBy: { id: "asc" },
    }),
  };
}
it("real planning-start update and callback replay after database reconnection preserves records and revisions", async () => {
  const row = await prisma.reminderOccurrence.create({
    data: {
      chatId: reminderChat,
      kind: "PLANNING_START",
      scope: "2026-09-14",
      generation: 1,
      civilDate: new Date("2026-09-16"),
      minute: 600,
      dueAt: reminderDue,
      disposition: "SENT",
    },
  });
  const token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      chatId: reminderChat,
      kind: "PLANNING",
      actorUserId: 9001n,
      targetId: createReminderStartTarget(row.id, row.scope),
      expiresAt: new Date("2026-09-21"),
    },
  });
  const h = harness();
  await h.click(token);
  expect(await prisma.planningRound.count()).toBe(1);
  const before = await state(),
    other = createPrismaClient(db.databaseUrl);
  try {
    await h.click(token);
    await harness(other).click(token, 2);
    expect(await state(other)).toEqual(before);
  } finally {
    await other.$disconnect();
  }
});
it("real vote and lifecycle callback replay cannot duplicate answers, transitions or reminder identities", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const vote = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token: vote,
      chatId: reminderChat,
      kind: "PLANNING",
      actorUserId: 1n,
      targetId: createPlanningTarget({
        action: "answer",
        roundId: round.id,
        answer: "UNAVAILABLE",
      }),
      expiresAt: new Date("2026-09-19"),
    },
  });
  const h = harness();
  await h.click(vote);
  expect(await prisma.planningParticipant.findFirst()).toMatchObject({
    availability: "UNAVAILABLE",
  });
  const answered = await state();
  await h.click(vote);
  await harness().click(vote, 2);
  expect(await state()).toEqual(answered);
  const service = new PlanningService(prisma),
    current = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
  const request = await service.mintCancelRequestAction(
    prisma,
    current,
    reminderDue,
  );
  const offer = await service.requestCancel(
    reminderChat,
    1n,
    request.token,
    reminderDue,
    async () => "administrator",
  );
  if (offer.kind !== "offered") throw new Error(offer.kind);
  const cancel = offer.actions.find(
    (a) => a.target.action === "cancel-apply",
  )!.token;
  await h.click(cancel, 3);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ status: "CANCELLED" });
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "OBSOLETE" });
  const cancelled = await state(),
    other = createPrismaClient(db.databaseUrl);
  try {
    await h.click(cancel, 3);
    await harness(other).click(cancel, 4);
    await reminderApp(other, reminderDue).app.reconcile(reminderChat);
    expect(await state(other)).toEqual(cancelled);
  } finally {
    await other.$disconnect();
  }
});
