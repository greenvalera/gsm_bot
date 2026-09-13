import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { parseReminderStartTarget } from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
let db: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
beforeAll(async () => {
  db = await startPostgresTestContainer();
  prisma = createPrismaClient(db.databaseUrl);
});
afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});
it("commits one public capability before transport and reuses it across retries/restarts", async () => {
  const now = () => new Date("2026-09-14T07:00Z");
  await prisma.chatConfiguration.create({
    data: {
      chatId: -321n,
      ...createChatConfiguration(),
      reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
    },
  });
  const row = await prisma.reminderOccurrence.create({
    data: {
      chatId: -321n,
      kind: "PLANNING_START",
      scope: "2026-09-14",
      generation: 1,
      civilDate: new Date("2026-09-14"),
      minute: 600,
      dueAt: now(),
    },
  });
  const transport = vi.fn(async (message: { callbackData: string }) => {
    const action = await prisma.callbackAction.findUniqueOrThrow({
      where: { token: message.callbackData },
    });
    expect(action.actorUserId).toBe(9001n);
    expect(action.expiresAt).toEqual(new Date("2026-09-20T21:00Z"));
    expect(parseReminderStartTarget(action.targetId)).toMatchObject({
      success: true,
      data: { occurrenceId: row.id, targetWeek: row.scope },
    });
    expect(Buffer.byteLength(action.token)).toBeLessThanOrEqual(64);
    return { messageId: 7 };
  });
  const service = () =>
    new ReminderService({
      prisma,
      now,
      botUserId: 9001n,
      logger: createLogger({ level: "silent" }),
      transport,
    });
  await Promise.all([service().dispatch(row.id), service().dispatch(row.id)]);
  expect(transport).toHaveBeenCalledTimes(1);
  // Simulate the known-rejection policy returning an occurrence to PENDING.
  await prisma.reminderOccurrence.update({
    where: { id: row.id },
    data: { disposition: "PENDING" },
  });
  await service().dispatch(row.id);
  expect(transport.mock.calls[1]![0].callbackData).toBe(
    transport.mock.calls[0]![0].callbackData,
  );
  expect(await prisma.callbackAction.count()).toBe(1);
});
