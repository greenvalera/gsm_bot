import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createPlanningReminderTransport } from "../../src/app/main.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
import {
  reminderChat,
  resetReminders,
  reminderRound,
  reminderRow,
  type ReminderPrisma,
} from "../helpers/reminders.js";

let db: PostgresTestContainer, prisma: ReminderPrisma;
const due = new Date("2026-09-21T10:00:00Z");
beforeAll(async () => {
  db = await startPostgresTestContainer();
  prisma = createPrismaClient(db.databaseUrl);
}, 120_000);
afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});
beforeEach(async () => {
  await resetReminders(prisma);
  await prisma.chatLanguagePreference.deleteMany();
  await prisma.chatReminderState.update({
    where: { chatId: reminderChat },
    data: { effectiveFrom: new Date(due.getTime() - 1) },
  });
});

it.each(["uk", "en", null] as const)(
  "renders saved planning work using current %s preference exactly once",
  async (locale) => {
    if (locale)
      await prisma.chatLanguagePreference.create({
        data: {
          chatId: reminderChat,
          locale: locale === "uk" ? "en" : "uk",
          explicitlySelected: true,
        },
      });
    const row = await prisma.reminderOccurrence.create({
      data: {
        chatId: reminderChat,
        kind: "PLANNING_START",
        scope: "2026-09-21",
        generation: 1,
        civilDate: new Date("2026-09-21"),
        minute: 600,
        dueAt: due,
      },
    });
    const sendMessage = vi.fn(
      async (
        _chat: number,
        _text: string,
        _options: {
          reply_markup: {
            inline_keyboard: { text: string; callback_data: string }[][];
          };
        },
      ) => ({ message_id: 901 }),
    );
    const logger = createLogger({ level: "silent" });
    const transport = createPlanningReminderTransport(
      { sendMessage },
      prisma,
      logger,
    );
    expect(sendMessage).not.toHaveBeenCalled();
    if (locale)
      await prisma.chatLanguagePreference.update({
        where: { chatId: reminderChat },
        data: { locale },
      });
    const app = new ReminderService({
      prisma,
      botUserId: 9n,
      now: () => due,
      logger,
      transport,
    });
    await app.reconcile(reminderChat);
    await Promise.all([app.dispatch(row.id), app.dispatch(row.id)]);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chat, text, options] = sendMessage.mock.calls[0]!;
    expect(chat).toBe(Number(reminderChat));
    expect(text).toBe(
      locale === "uk"
        ? "Час запланувати репетицію на 21–27 вересня."
        : "Plan rehearsal for 2026-09-21 – 2026-09-27.",
    );
    expect(text).not.toMatch(/@|tg:\/\/|\n/);
    const saved = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(saved).toMatchObject({
      disposition: "SENT",
      messageId: 901,
      scope: row.scope,
      dueAt: due,
      generation: 1,
    });
    const capability = await prisma.callbackAction.findFirstOrThrow({
      where: { chatId: reminderChat },
    });
    expect(options.reply_markup.inline_keyboard).toEqual([
      [
        {
          text: locale === "uk" ? "Почати планування" : "Start planning",
          callback_data: capability.token,
        },
      ],
    ]);
    expect(
      await prisma.reminderOccurrence.count({
        where: { chatId: reminderChat, dueAt: due },
      }),
    ).toBe(1);
  },
);

it.each(["uk", "en"] as const)(
  "sends follow-ups in current %s after metadata await, retaining round timezone",
  async (locale) => {
    const round = await reminderRound(prisma);
    await prisma.planningRound.update({ where: { id: round.id }, data: {
      selectedDate: "2026-09-21", selectedStartMinute: 1140,
      timezone: "Europe/Kyiv", startsAt: new Date("2026-09-21T16:00Z"),
      endsAt: new Date("2026-09-21T18:00Z"),
    } });
    const row = await reminderRow(prisma, round.id, due);
    await prisma.chatLanguagePreference.create({ data: {
      chatId: reminderChat, locale: locale === "uk" ? "en" : "uk",
      explicitlySelected: true,
    } });
    const send = vi.fn(async (_message: { text: string }) => ({ messageId: 902 }));
    const app = new ReminderService({
      prisma, botUserId: 9n, now: () => due, logger: createLogger({ level: "silent" }),
      transport: vi.fn(async () => ({ messageId: 903 })),
      followups: {
        getChat: async () => {
          await prisma.chatLanguagePreference.update({ where: { chatId: reminderChat }, data: { locale } });
          return { id: reminderChat, type: "group" };
        }, send,
      },
    });
    await app.dispatch(row.id);
    await app.dispatch(row.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].text.split("\n").slice(0, 2)).toEqual(locale === "uk" ? [
      "Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv).",
      'Нагадаймо про репетицію: <a href="tg://user?id=1">A</a> — дай знати, чи зможеш прийти.',
    ] : [
      "Rehearsal 2026-09-21 at 19:00 (Europe/Kyiv), 120 minutes.",
      'Still waiting for: <a href="tg://user?id=1">A</a>.',
    ]);
    expect(await prisma.reminderOccurrence.findUnique({ where: { id: row.id } })).toMatchObject({ disposition: "SENT", messageId: 902 });
  },
);

it.each([
  ["2026-09-21", 1380, "2026-09-21T20:00Z", "2026-09-21T22:00Z", "23:00–01:00"],
  ["2026-10-25", 180, "2026-10-25T00:00Z", "2026-10-25T02:00Z", "03:00–04:00"],
  ["2026-10-25", 180, "2026-10-25T00:00Z", null, "03:00–04:00"],
] as const)("projects saved midnight/DST range %s %s", async (date, minute, start, end, range) => {
  const round = await reminderRound(prisma);
  await prisma.planningRound.update({ where: { id: round.id }, data: {
    selectedDate: date, selectedStartMinute: minute, timezone: "Europe/Kyiv",
    startsAt: new Date(start), endsAt: end ? new Date(end) : null,
  } });
  await prisma.chatLanguagePreference.create({ data: { chatId: reminderChat, locale: "uk" } });
  const row = await reminderRow(prisma, round.id, due);
  const send = vi.fn(async (_message: { text: string }) => ({ messageId: 902 }));
  const app = new ReminderService({ prisma, botUserId: 9n, now: () => due,
    logger: createLogger({ level: "silent" }), transport: vi.fn(async () => ({ messageId: 903 })),
    followups: { getChat: async () => ({ id: reminderChat, type: "group" }), send },
  });
  await app.dispatch(row.id);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]![0].text).toContain(`${range} (Europe/Kyiv)`);
});
