import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createReminderQueue } from "../../src/infrastructure/jobs/reminder-queue.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import { startPostgresTestContainer, type PostgresTestContainer } from "../helpers/postgres.js";

const now = () => new Date("2026-09-14T07:00:00Z");
const logger = createLogger({ level: "silent" });
describe("durable reminder tracer", () => {
  let db: PostgresTestContainer;
  let prisma: ReturnType<typeof createPrismaClient>;
  beforeAll(async () => { db = await startPostgresTestContainer(); prisma = createPrismaClient(db.databaseUrl); });
  afterAll(async () => { await prisma?.$disconnect(); await db?.stop(); });
  beforeEach(async () => {
    await prisma.reminderOccurrence.deleteMany();
    await prisma.chatReminderState.deleteMany();
    await prisma.chatConfiguration.deleteMany();
    await prisma.chatConfiguration.create({ data: { chatId: -1001n, ...createChatConfiguration() } });
    await prisma.chatReminderState.create({ data: { chatId: -1001n, effectiveFrom: new Date("2026-09-13T00:00:00Z") } });
  });
  async function occurrence() {
    return prisma.reminderOccurrence.create({ data: { chatId: -1001n, kind: "PLANNING_START", scope: "2026-09-14", generation: 1, civilDate: new Date("2026-09-14"), minute: 600, dueAt: now() } });
  }
  it("runs real queue through reservation and SENT, duplicate jobs and recreated service cannot resend", async () => {
    const row = await occurrence();
    const transport = vi.fn(async () => ({ messageId: 91 }));
    const service = new ReminderService({ prisma, now, logger, transport });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    try {
      await queue.start((chatId) => service.reconcile(chatId));
      await expect.poll(async () => (await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: row.id } })).disposition, { timeout: 10000 }).toBe("SENT");
      await Promise.all([service.dispatch(row.id), new ReminderService({ prisma, now, logger, transport }).dispatch(row.id)]);
      expect(transport).toHaveBeenCalledTimes(1);
      expect(await prisma.reminderOccurrence.count()).toBe(1);
      expect(await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ messageId: 91, attemptId: expect.any(String), reservedAt: now() });
    } finally { await queue.stop(); await service.stop(); }
  });
  it("consumes uncertain transport outcomes and never replays RESERVED after restart", async () => {
    const row = await occurrence();
    const transport = vi.fn(async () => { throw new Error("timeout secret participant payload"); });
    const service = new ReminderService({ prisma, now, logger, transport });
    await service.dispatch(row.id);
    expect(await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ disposition: "UNKNOWN" });
    await prisma.reminderOccurrence.update({ where: { id: row.id }, data: { disposition: "RESERVED" } });
    await new ReminderService({ prisma, now, logger, transport }).reconcile();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("keeps reservation consumed if accepted outcome persistence fails", async () => {
    const row = await occurrence();
    const transport = vi.fn(async () => {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.disposition = 'SENT' THEN RAISE EXCEPTION 'outcome unavailable'; END IF; RETURN NEW; END $$`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_outcome BEFORE UPDATE ON reminder_occurrences FOR EACH ROW EXECUTE FUNCTION fail_outcome()`);
      return { messageId: 92 };
    });
    try {
      await new ReminderService({ prisma, now, logger, transport }).dispatch(row.id);
      await new ReminderService({ prisma, now, logger, transport }).dispatch(row.id);
      expect(transport).toHaveBeenCalledTimes(1);
      expect((await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: row.id } })).disposition).toBe("RESERVED");
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER IF EXISTS fail_outcome ON reminder_occurrences");
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_outcome()");
    }
  });
  it("reloads generation and suppresses obsolete work before transport", async () => {
    const row = await occurrence();
    await prisma.chatReminderState.update({ where: { chatId: -1001n }, data: { generation: 2 } });
    const transport = vi.fn(async () => ({ messageId: 1 }));
    await new ReminderService({ prisma, now, logger, transport }).dispatch(row.id);
    expect(transport).not.toHaveBeenCalled();
    expect((await prisma.reminderOccurrence.findUniqueOrThrow({ where: { id: row.id } })).disposition).toBe("OBSOLETE");
  });
});
