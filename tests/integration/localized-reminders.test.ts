import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { GrammyError } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
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
  await prisma.chatReminderState.update({
    where: { chatId: reminderChat },
    data: { effectiveFrom: new Date(due.getTime() - 1) },
  });
});

it("scoped reminder reset clears its preference without deleting another chat's language", async () => {
  await prisma.chatLanguagePreference.createMany({
    data: [
      { chatId: reminderChat, locale: "uk" },
      { chatId: -99999n, locale: "uk" },
    ],
  });
  try {
    await resetReminders(prisma);
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: reminderChat },
      }),
    ).toBeNull();
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: -99999n },
      }),
    ).toMatchObject({ locale: "uk" });
  } finally {
    await prisma.chatLanguagePreference.deleteMany({
      where: { chatId: -99999n },
    });
  }
});

async function language(locale: "en" | "uk") {
  await prisma.chatLanguagePreference.upsert({
    where: { chatId: reminderChat },
    create: { chatId: reminderChat, locale, explicitlySelected: true },
    update: { locale, explicitlySelected: true },
  });
}
function planningService(
  at: Date,
  sendMessage: ReturnType<typeof planningSender>,
) {
  const logger = createLogger({ level: "silent" });
  return new ReminderService({
    prisma,
    botUserId: 9n,
    now: () => at,
    logger,
    transport: createPlanningReminderTransport({ sendMessage }, prisma, logger),
  });
}
function planningSender() {
  return vi.fn(async (_chat: number, _text: string) => ({ message_id: 904 }));
}
function planningRow(at = due) {
  return prisma.reminderOccurrence.create({
    data: {
      chatId: reminderChat,
      kind: "PLANNING_START",
      scope: at.toISOString().slice(0, 10),
      generation: 1,
      civilDate: at,
      minute: 600,
      dueAt: at,
    },
  });
}
const opposite = (locale: "en" | "uk") => (locale === "en" ? "uk" : "en");
const planningPrefix = (locale: "en" | "uk") =>
  locale === "uk" ? "Час запланувати" : "Plan rehearsal";

it.each(["en", "uk"] as const)(
  "minted reminder control survives switch to %s with fresh authorization and one acknowledgement",
  async (locale) => {
    await language(opposite(locale));
    const row = await planningRow();
    await planningService(due, planningSender()).dispatch(row.id);
    const action = await prisma.callbackAction.findFirstOrThrow({
      where: { chatId: reminderChat },
    });
    await language(locale);
    let role: CurrentTelegramRole = "member";
    const calls: string[] = [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9,
        is_bot: true,
        first_name: "Bot",
        username: "gsmbot",
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
      } as UserFromGetMe,
      prisma,
      logger: createLogger({ level: "silent" }),
      now: () => due,
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
                message_id: 906,
                date: 1,
                chat: { id: Number(reminderChat), type: "supergroup" },
                text: "card",
              }
            : true,
      } as never;
    });
    async function click(id: number) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: id,
        callback_query: {
          id: `cb-${id}`,
          from: { id: 8301, is_bot: false, first_name: "Actor" },
          chat_instance: "test",
          data: action.token,
          message: {
            message_id: 904,
            date: 1,
            chat: {
              id: Number(reminderChat),
              type: "supergroup",
              title: "Band",
            },
          },
        },
      });
      expect(
        calls.filter((method) => method === "answerCallbackQuery"),
      ).toHaveLength(1);
    }
    await click(1);
    expect(await prisma.planningRound.count()).toBe(0);
    expect(
      await prisma.callbackAction.findUnique({
        where: { token: action.token },
      }),
    ).toEqual(action);
    role = "administrator";
    await click(2);
    const rounds = await prisma.planningRound.findMany();
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({
      authorUserId: 8301n,
      status: "DRAFT",
      targetWeekStart: "2026-09-21",
    });
    const count = await prisma.callbackAction.count();
    await click(3);
    expect(await prisma.planningRound.findMany()).toEqual(rounds);
    expect(await prisma.callbackAction.count()).toBe(count);
  },
);

it.each(["en", "uk"] as const)(
  "planning recovery in %s preserves durable identity and round state",
  async (locale) => {
    await language(opposite(locale));
    const row = await planningRow();
    const state = await prisma.chatReminderState.findUnique({
      where: { chatId: reminderChat },
    });
    const rounds = await prisma.planningRound.findMany({
      where: { chatId: reminderChat },
    });
    await language(locale);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toEqual(row);
    expect(
      await prisma.chatReminderState.findUnique({
        where: { chatId: reminderChat },
      }),
    ).toEqual(state);
    expect(
      await prisma.planningRound.findMany({ where: { chatId: reminderChat } }),
    ).toEqual(rounds);
    const send = planningSender();
    await Promise.all([
      planningService(due, send).dispatch(row.id),
      planningService(due, send).dispatch(row.id),
    ]);
    await planningService(due, send).reconcile(reminderChat);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![1]).toContain(planningPrefix(locale));
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      id: row.id,
      generation: row.generation,
      dueAt: row.dueAt,
      scope: row.scope,
      disposition: "SENT",
    });
    expect(
      await prisma.planningRound.findMany({ where: { chatId: reminderChat } }),
    ).toEqual(rounds);
  },
);

it.each(["en", "uk"] as const)(
  "planning rejection retries in %s while unknown outcome stays consumed",
  async (locale) => {
    await language(opposite(locale));
    const row = await planningRow();
    const send = planningSender();
    send.mockRejectedValueOnce(
      new GrammyError(
        "flood",
        {
          ok: false,
          error_code: 429,
          description: "flood",
          parameters: { retry_after: 60 },
        },
        "sendMessage",
        {},
      ),
    );
    await planningService(due, send).dispatch(row.id);
    const rejected = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(rejected.disposition).toBe("REJECTED");
    await language(locale);
    await planningService(new Date(due.getTime() + 59999), send).dispatch(
      row.id,
    );
    expect(send).toHaveBeenCalledTimes(1);
    send.mockRejectedValueOnce(new Error("response lost"));
    await planningService(new Date(due.getTime() + 60000), send).reconcile(
      reminderChat,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![1]).toContain(planningPrefix(locale));
    const unknown = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(unknown).toMatchObject({
      disposition: "UNKNOWN",
      dueAt: row.dueAt,
      generation: 1,
    });
    expect(unknown.attemptId).not.toBe(rejected.attemptId);
    await language(opposite(locale));
    await planningService(new Date(due.getTime() + 120000), send).reconcile(
      reminderChat,
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toEqual(unknown);
  },
);

it.each(["en", "uk"] as const)(
  "in-flight %s planning payload retains ownership and next week uses new language",
  async (locale) => {
    await language(locale);
    const row = await planningRow();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const send = planningSender();
    send.mockImplementationOnce(async () => {
      entered();
      await gate;
      return { message_id: 905 };
    });
    const dispatch = planningService(due, send).dispatch(row.id);
    await waiting;
    try {
      const reserved = await prisma.reminderOccurrence.findUnique({
        where: { id: row.id },
      });
      await language(opposite(locale));
      await planningService(due, send).reconcile(reminderChat);
      expect(
        await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
      ).toEqual(reserved);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]![1]).toContain(planningPrefix(locale));
    } finally {
      release();
      await dispatch;
    }
    const next = new Date("2026-09-28T10:00Z");
    const nextRow = await planningRow(next);
    await planningService(next, send).dispatch(nextRow.id);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![1]).toContain(planningPrefix(opposite(locale)));
  },
);

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
    await prisma.planningRound.update({
      where: { id: round.id },
      data: {
        selectedDate: "2026-09-21",
        selectedStartMinute: 1140,
        timezone: "Europe/Kyiv",
        startsAt: new Date("2026-09-21T16:00Z"),
        endsAt: new Date("2026-09-21T18:00Z"),
      },
    });
    const row = await reminderRow(prisma, round.id, due);
    await prisma.chatLanguagePreference.create({
      data: {
        chatId: reminderChat,
        locale: locale === "uk" ? "en" : "uk",
        explicitlySelected: true,
      },
    });
    const send = vi.fn(async (_message: { text: string }) => ({
      messageId: 902,
    }));
    const app = new ReminderService({
      prisma,
      botUserId: 9n,
      now: () => due,
      logger: createLogger({ level: "silent" }),
      transport: vi.fn(async () => ({ messageId: 903 })),
      followups: {
        getChat: async () => {
          await prisma.chatLanguagePreference.update({
            where: { chatId: reminderChat },
            data: { locale },
          });
          return { id: reminderChat, type: "group" };
        },
        send,
      },
    });
    await app.dispatch(row.id);
    await app.dispatch(row.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].text.split("\n").slice(0, 2)).toEqual(
      locale === "uk"
        ? [
            "Репетиція — понеділок, 21 вересня, 19:00–21:00 (Europe/Kyiv).",
            'Нагадаймо про репетицію: <a href="tg://user?id=1">A</a> — дай знати, чи зможеш прийти.',
          ]
        : [
            "Rehearsal 2026-09-21 at 19:00 (Europe/Kyiv), 120 minutes.",
            'Still waiting for: <a href="tg://user?id=1">A</a>.',
          ],
    );
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "SENT", messageId: 902 });
  },
);

it.each([
  ["2026-09-21", 1380, "2026-09-21T20:00Z", "2026-09-21T22:00Z", "23:00–01:00"],
  ["2026-10-25", 180, "2026-10-25T00:00Z", "2026-10-25T02:00Z", "03:00–04:00"],
  ["2026-10-25", 180, "2026-10-25T00:00Z", null, "03:00–04:00"],
] as const)(
  "projects saved midnight/DST range %s %s",
  async (date, minute, start, end, range) => {
    const round = await reminderRound(prisma);
    await prisma.planningRound.update({
      where: { id: round.id },
      data: {
        selectedDate: date,
        selectedStartMinute: minute,
        timezone: "Europe/Kyiv",
        startsAt: new Date(start),
        endsAt: end ? new Date(end) : null,
      },
    });
    await prisma.chatLanguagePreference.create({
      data: { chatId: reminderChat, locale: "uk" },
    });
    const row = await reminderRow(prisma, round.id, due);
    const send = vi.fn(async (_message: { text: string }) => ({
      messageId: 902,
    }));
    const app = new ReminderService({
      prisma,
      botUserId: 9n,
      now: () => due,
      logger: createLogger({ level: "silent" }),
      transport: vi.fn(async () => ({ messageId: 903 })),
      followups: {
        getChat: async () => ({ id: reminderChat, type: "group" }),
        send,
      },
    });
    await app.dispatch(row.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].text).toContain(`${range} (Europe/Kyiv)`);
  },
);
