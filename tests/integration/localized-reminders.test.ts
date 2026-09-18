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
    data: { effectiveFrom: due },
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
