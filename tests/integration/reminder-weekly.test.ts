import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

describe("weekly reconciliation", () => {
  let db: PostgresTestContainer;
  let prisma: ReturnType<typeof createPrismaClient>;
  let at: Date;
  const chatId = -123n;
  const transport = vi.fn(async () => ({ messageId: 7 }));
  const service = () =>
    new ReminderService({
      botUserId: 9001n,
      prisma,
      now: () => at,
      logger: createLogger({ level: "silent" }),
      transport,
    });
  beforeAll(async () => {
    db = await startPostgresTestContainer();
    prisma = createPrismaClient(db.databaseUrl);
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await db?.stop();
  });
  beforeEach(async () => {
    await prisma.reminderOccurrence.deleteMany();
    await prisma.planningRound.deleteMany();
    await prisma.chatConfiguration.deleteMany();
    at = new Date("2026-09-16T07:00Z");
    transport.mockClear();
    await prisma.chatConfiguration.create({
      data: {
        chatId,
        ...createChatConfiguration(),
        reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
      },
    });
  });
  async function round(
    status: "DRAFT" | "CONFIRMED" | "BOOKED",
    week = "2026-09-14",
  ) {
    return prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: 1n,
        targetWeekStart: week,
        activeWeekStart: status === "DRAFT" ? week : null,
        status,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: at,
      },
    });
  }
  it("rebuilds bounded work from persisted activation, sends once and keeps tomorrow", async () => {
    await Promise.all([service().reconcile(), service().reconcile()]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await prisma.reminderOccurrence.count()).toBe(2);
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
    at = new Date("2026-09-17T07:00Z");
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each(["DRAFT", "CONFIRMED", "BOOKED"] as const)(
    "suppresses %s current week, does not chase next week before Monday",
    async (status) => {
      await round(status);
      await service().reconcile();
      expect(transport).not.toHaveBeenCalled();
      expect(await prisma.reminderOccurrence.count()).toBe(0);
      at = new Date("2026-09-20T07:00Z");
      await service().reconcile();
      expect(transport).not.toHaveBeenCalled();
      at = new Date("2026-09-21T07:00Z");
      await service().reconcile();
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({ targetWeek: "2026-09-21" }),
      );
    },
  );
  it("setup exactly at 10:00 waits for tomorrow", async () => {
    await prisma.chatReminderState.update({
      where: { chatId },
      data: { effectiveFrom: at },
    });
    await service().reconcile();
    expect(transport).not.toHaveBeenCalled();
    expect(await prisma.reminderOccurrence.count()).toBe(1);
    at = new Date("2026-09-17T07:00Z");
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rechecks draft after generation, independently from week claim", async () => {
    at = new Date("2026-09-16T06:59Z");
    await service().reconcile();
    await round("DRAFT");
    at = new Date("2026-09-16T07:00Z");
    await service().reconcile();
    expect(transport).not.toHaveBeenCalled();
    expect(
      await prisma.reminderOccurrence.count({
        where: { disposition: "OBSOLETE" },
      }),
    ).toBe(1);
  });
  it("does not backfill old dates after months offline and includes exactly two hours", async () => {
    at = new Date("2026-12-30T10:00Z");
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await prisma.reminderOccurrence.count()).toBe(2);
  });
  it("ignores future manually planned weeks and quiet state is authoritative", async () => {
    await round("BOOKED", "2026-09-21");
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
    await prisma.chatReminderState.update({
      where: { chatId },
      data: { quietUntil: new Date("2026-09-21T00:00Z") },
    });
    at = new Date("2026-09-17T07:00Z");
    await service().reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
