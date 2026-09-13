import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createReminderQueue } from "../../src/infrastructure/jobs/reminder-queue.js";
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
it("coalesces 10/11/12 atomically to the latest due row across real queue and service recreation", async () => {
  const round = await reminderRound(prisma);
  for (const hour of [10, 11, 12])
    await reminderRow(prisma, round.id, new Date(`2026-09-16T${hour}:00Z`));
  const f = reminderApp(prisma, new Date("2026-09-16T12:00Z"));
  for (let restart = 0; restart < 2; restart++) {
    const queue = createReminderQueue({
      databaseUrl: db.databaseUrl,
      logger: createLogger({ level: "silent" }),
    });
    const app = restart
      ? reminderApp(prisma, new Date("2026-09-16T12:00Z"), f.send).app
      : f.app;
    try {
      await queue.start((id) => app.reconcile(id));
      await expect
        .poll(
          async () =>
            (
              await prisma.reminderOccurrence.findMany({
                where: {
                  roundId: round.id,
                  dueAt: { lte: new Date("2026-09-16T12:00Z") },
                },
                orderBy: { dueAt: "asc" },
              })
            ).map((r) => r.disposition),
          { timeout: 10000 },
        )
        .toEqual(["COALESCED", "COALESCED", "SENT"]);
    } finally {
      await queue.stop();
      await app.stop();
    }
  }
  expect(f.send).toHaveBeenCalledTimes(1);
});
it.each([0, 1])(
  "two-hour recovery boundary +%s ms is durable",
  async (extra) => {
    const round = await reminderRound(prisma),
      row = await reminderRow(prisma, round.id);
    const at = new Date(reminderDue.getTime() + 7200000 + extra),
      f = reminderApp(prisma, at);
    await f.app.dispatch(row.id);
    await reminderApp(prisma, at, f.send).app.dispatch(row.id);
    expect(f.send).toHaveBeenCalledTimes(extra ? 0 : 1);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: extra ? "SKIPPED" : "SENT" });
  },
);
it("15:50 catch-up consumes 16:00 as skipped even on 16:30 recovery; exactly 30 remains eligible", async () => {
  const round = await reminderRound(prisma);
  const missed = await reminderRow(
    prisma,
    round.id,
    new Date("2026-09-16T14:00Z"),
  );
  const near = await reminderRow(
    prisma,
    round.id,
    new Date("2026-09-16T16:00Z"),
  );
  const exact = await reminderRow(
    prisma,
    round.id,
    new Date("2026-09-16T16:20Z"),
  );
  const f = reminderApp(prisma, new Date("2026-09-16T15:50Z"));
  await f.app.dispatch(missed.id);
  await reminderApp(prisma, new Date("2026-09-16T16:30Z"), f.send).app.dispatch(
    near.id,
  );
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: near.id } }),
  ).toMatchObject({ disposition: "SKIPPED" });
  await reminderApp(prisma, new Date("2026-09-16T16:30Z"), f.send).app.dispatch(
    exact.id,
  );
  expect(f.send).toHaveBeenCalledTimes(2);
});
it("consumes prior-process reservations as UNKNOWN without releasing spacing", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  await prisma.reminderOccurrence.update({
    where: { id: row.id },
    data: {
      disposition: "RESERVED",
      attemptId: "prior-process",
      reservedAt: reminderDue,
    },
  });
  await prisma.planningRound.update({
    where: { id: round.id },
    data: { lastReminderAttemptAt: reminderDue },
  });
  const f = reminderApp(prisma, new Date("2026-09-16T10:01Z"));
  await f.app.reconcile(reminderChat);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "UNKNOWN" });
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ lastReminderAttemptAt: reminderDue });
  expect(f.send).not.toHaveBeenCalled();
});
it("grace-blocked and old-generation rows are never coalesced into eligible catch-up", async () => {
  const round = await reminderRound(prisma);
  await prisma.planningRound.update({
    where: { id: round.id },
    data: { firstAvailabilityPublishedAt: new Date("2026-09-16T09:59Z") },
  });
  const blocked = await reminderRow(prisma, round.id);
  const old = await reminderRow(
    prisma,
    round.id,
    new Date("2026-09-16T11:00Z"),
  );
  await prisma.reminderOccurrence.update({
    where: { id: old.id },
    data: { generation: 2 },
  });
  const f = reminderApp(prisma, new Date("2026-09-16T12:00Z"));
  await f.app.reconcile(reminderChat);
  expect(f.send).toHaveBeenCalledTimes(1);
  for (const row of [blocked, old])
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "OBSOLETE" });
});
