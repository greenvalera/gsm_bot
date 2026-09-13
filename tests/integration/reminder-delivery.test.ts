import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { GrammyError, HttpError } from "grammy";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
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
function rejection(code: number, retryAfter?: number) {
  return new GrammyError(
    "failed",
    {
      ok: false,
      error_code: code,
      description: "test rejection",
      ...(retryAfter === undefined
        ? {}
        : { parameters: { retry_after: retryAfter } }),
    },
    "sendMessage",
    {},
  );
}
it.each([0, 1])(
  "known-rejection retry at original deadline +%s ms never extends eligibility",
  async (extra) => {
    const round = await reminderRound(prisma),
      row = await reminderRow(prisma, round.id);
    const send = vi.fn(async (_message: { text: string }) => ({
      messageId: 58,
    }));
    send.mockRejectedValueOnce(rejection(429, 7200));
    await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
    await reminderApp(
      prisma,
      new Date(reminderDue.getTime() + 7200000 + extra),
      send,
    ).app.dispatch(row.id);
    expect(send).toHaveBeenCalledTimes(extra ? 1 : 2);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: extra ? "SKIPPED" : "SENT" });
  },
);
it("a malformed success acknowledgment remains unknown and keeps spacing", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const send = vi.fn(async (_message: { text: string }) => ({
    messageId: NaN,
  }));
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "UNKNOWN" });
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ lastReminderAttemptAt: reminderDue });
});
it.each([400, 401, 403, 404, 429])(
  "explicit %s rejection without a retry interval is terminal and restores prior spacing",
  async (code) => {
    const round = await reminderRound(prisma),
      row = await reminderRow(prisma, round.id);
    const previous = new Date("2026-09-16T09:00Z");
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { lastReminderAttemptAt: previous },
    });
    const send = vi.fn(async (_message: { text: string }) => {
      throw rejection(code);
    });
    await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
    await reminderApp(prisma, reminderDue, send).app.reconcile(reminderChat);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      disposition: "REJECTED",
      retryAt: null,
      previousSpacingAt: previous,
    });
    expect(
      await prisma.planningRound.findUnique({ where: { id: round.id } }),
    ).toMatchObject({ lastReminderAttemptAt: previous });
  },
);
it("flood rejection retries the same identity with new ownership only after retryAt", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const send = vi.fn(async (_message: { text: string }) => ({ messageId: 42 }));
  send.mockRejectedValueOnce(rejection(429, 60));
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  const rejected = await prisma.reminderOccurrence.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(rejected).toMatchObject({
    disposition: "REJECTED",
    retryAt: new Date("2026-09-16T10:01Z"),
  });
  await reminderApp(
    prisma,
    new Date("2026-09-16T10:00:59.999Z"),
    send,
  ).app.reconcile(reminderChat);
  expect(send).toHaveBeenCalledTimes(1);
  await reminderApp(prisma, new Date("2026-09-16T10:01Z"), send).app.reconcile(
    reminderChat,
  );
  const sent = await prisma.reminderOccurrence.findUniqueOrThrow({
    where: { id: row.id },
  });
  expect(sent).toMatchObject({
    disposition: "SENT",
    messageId: 42,
    retryAt: null,
  });
  expect(sent.attemptId).not.toBe(rejected.attemptId);
  expect(send).toHaveBeenCalledTimes(2);
  expect(
    await prisma.reminderOccurrence.count({
      where: { roundId: round.id, dueAt: reminderDue },
    }),
  ).toBe(1);
});
it.each([
  "deadline",
  "generation",
  "publication",
  "cancelled",
  "newer-spacing",
])("retry reloads %s and cannot extend original eligibility", async (state) => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const send = vi.fn(async (_message: { text: string }) => {
    throw rejection(429, 60);
  });
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  if (state === "generation")
    await prisma.chatReminderState.update({
      where: { chatId: reminderChat },
      data: { generation: 2 },
    });
  if (state === "publication")
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { availabilityAnchorAcknowledgedAt: null },
    });
  if (state === "cancelled")
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { status: "CANCELLED" },
    });
  if (state === "newer-spacing")
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { lastReminderAttemptAt: new Date("2026-09-16T10:00:30Z") },
    });
  const at = new Date(
    state === "deadline" ? "2026-09-16T12:00:00.001Z" : "2026-09-16T10:01Z",
  );
  await reminderApp(prisma, at, send).app.dispatch(row.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({
    disposition: ["deadline", "newer-spacing"].includes(state)
      ? "SKIPPED"
      : "OBSOLETE",
  });
});
it.each([
  new HttpError("timeout", new Error("reset")),
  rejection(500),
  new Error("unknown"),
  rejection(NaN),
  { error_code: 429, parameters: { retry_after: 1 } },
])("ambiguous failure remains UNKNOWN and retains spacing", async (error) => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const send = vi.fn(async (_message: { text: string }) => {
    throw error;
  });
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  await reminderApp(prisma, new Date("2026-09-16T10:01Z"), send).app.dispatch(
    row.id,
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "UNKNOWN", retryAt: null });
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ lastReminderAttemptAt: reminderDue });
});
it("accepted HTTP followed by outcome-write failure recovers as UNKNOWN without resend", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  await prisma.$executeRawUnsafe(
    `CREATE FUNCTION reject_sent() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.disposition = 'SENT' THEN RAISE EXCEPTION 'failed'; END IF; RETURN NEW; END $$`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER reject_sent BEFORE UPDATE ON reminder_occurrences FOR EACH ROW EXECUTE FUNCTION reject_sent()`,
  );
  const f = reminderApp(prisma, reminderDue);
  try {
    await f.app.dispatch(row.id);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "RESERVED" });
    await reminderApp(prisma, reminderDue, f.send).app.reconcile(reminderChat);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "UNKNOWN" });
    expect(f.send).toHaveBeenCalledTimes(1);
  } finally {
    await prisma.$executeRawUnsafe(
      "DROP TRIGGER reject_sent ON reminder_occurrences",
    );
    await prisma.$executeRawUnsafe("DROP FUNCTION reject_sent()");
  }
});
it("late proven rejection cannot release a newer attempt's spacing", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  let release!: () => void, enter!: () => void;
  const entered = new Promise<void>((r) => {
      enter = r;
    }),
    gate = new Promise<void>((r) => {
      release = r;
    });
  const send = vi.fn(async (_message: { text: string }) => {
    enter();
    await gate;
    throw rejection(429, 60);
  });
  const first = reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  await entered;
  const laterAt = new Date("2026-09-16T10:30Z"),
    later = await reminderRow(prisma, round.id, laterAt);
  const next = reminderApp(prisma, laterAt);
  await next.app.dispatch(later.id);
  release();
  await first;
  expect(next.send).toHaveBeenCalledTimes(1);
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toMatchObject({ lastReminderAttemptAt: laterAt });
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "REJECTED" });
});
it("recovery during an active HTTP call preserves ownership across service instances", async () => {
  const round = await reminderRound(prisma),
    row = await reminderRow(prisma, round.id);
  const send = vi.fn(async (_message: { text: string }) => {
    await reminderApp(prisma, reminderDue).app.reconcile(reminderChat);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "RESERVED" });
    return { messageId: 55 };
  });
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "SENT", messageId: 55 });
});
it("a paused recovery write cannot consume a reservation created after its scan", async () => {
  const round = await reminderRound(prisma),
    abandoned = await reminderRow(
      prisma,
      round.id,
      new Date("2026-09-16T09:30Z"),
    );
  await prisma.reminderOccurrence.update({
    where: { id: abandoned.id },
    data: {
      disposition: "RESERVED",
      attemptId: "prior-process",
      reservedAt: new Date("2026-09-16T09:30Z"),
    },
  });
  const row = await reminderRow(prisma, round.id);
  let release!: () => void, enter!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    entered = new Promise<void>((r) => {
      enter = r;
    });
  const intercepted = new Proxy(prisma, {
    get(target, property) {
      if (property !== "reminderOccurrence")
        return Reflect.get(target, property, target);
      return new Proxy(target.reminderOccurrence, {
        get(delegate, method) {
          if (method !== "updateMany")
            return Reflect.get(delegate, method, delegate);
          return async (args: Parameters<typeof delegate.updateMany>[0]) => {
            if (args?.data.reason === "abandoned-reservation") {
              enter();
              await gate;
            }
            return delegate.updateMany(args);
          };
        },
      });
    },
  });
  const recovery = reminderApp(
    intercepted,
    reminderDue,
  ).app.recoverAbandonedReservations(reminderChat);
  await entered;
  const send = vi.fn(async (_message: { text: string }) => {
    release();
    await recovery;
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "RESERVED" });
    return { messageId: 56 };
  });
  await reminderApp(prisma, reminderDue, send).app.dispatch(row.id);
  expect(
    await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
  ).toMatchObject({ disposition: "SENT", messageId: 56 });
});
