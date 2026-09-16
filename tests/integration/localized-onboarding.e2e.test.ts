import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import { RosterService } from "../../src/domain/roster/roster-service.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-09-16T12:00:00Z");
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => {
  await prisma?.$disconnect();
  await database?.stop();
}, 60000);
type Call = { method: string; payload: any };
function session(chatId: bigint, actorId = 8101, clientLanguage = "en") {
  const calls: Call[] = [];
  let sequence = 0;
  let role: "administrator" | "member" = "administrator";
  let clock = now;
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
  };
  const from = {
    id: actorId,
    is_bot: false,
    first_name: "Admin",
    language_code: clientLanguage,
  };
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as never,
    prisma,
    now: () => clock,
    membershipGateway: { getCurrentRole: async () => role },
    timezoneResolver: {
      resolve: async () => ({ kind: "resolved", candidate: "Europe/Kyiv" }),
    },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    expect(["sendMessage", "editMessageText", "answerCallbackQuery"]).toContain(
      method,
    );
    return {
      ok: true,
      result:
        method === "answerCallbackQuery"
          ? true
          : { message_id: 500, date: 1, chat, text: (payload as any).text },
    } as never;
  });
  return {
    calls,
    demote() {
      role = "member";
    },
    expire() {
      clock = new Date(now.getTime() + 31 * 60000);
    },
    text() {
      return calls.map((c) => c.payload.text ?? "").join("\n");
    },
    answer() {
      return calls.find((c) => c.method === "answerCallbackQuery")?.payload;
    },
    token(label: string) {
      const button = calls
        .findLast((c) => c.payload.reply_markup)
        ?.payload.reply_markup.inline_keyboard.flat()
        .find((b: any) => b.text === label);
      expect(
        button,
        `Expected ${label} in ${JSON.stringify(calls)}`,
      ).toBeDefined();
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
      return button.callback_data as string;
    },
    async message(text: string, extra: Record<string, unknown> = {}) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          from,
          text,
          ...(text.startsWith("/")
            ? {
                entities: [
                  {
                    type: "bot_command" as const,
                    offset: 0,
                    length: text.length,
                  },
                ],
              }
            : {}),
          ...extra,
        },
      } as never);
    },
    async location() {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          from,
          location: { latitude: 50, longitude: 30 },
        },
      });
    },
    async click(token: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        callback_query: {
          id: String(sequence),
          chat_instance: "c",
          from,
          data: token,
          message: { message_id: 500, date: 1, chat },
        },
      });
      expect(
        calls.filter((c) => c.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
  };
}
type Session = ReturnType<typeof session>;
const phrase = (locale: Locale, key: Parameters<typeof renderMessage>[1]) =>
  renderMessage(locale, key, undefined as never);
async function language(h: Session, locale: Locale) {
  await h.message("/settings");
  await h.click(h.token("Мова / Language"));
  await h.click(h.token(locale === "uk" ? "Українська" : "English"));
}
async function configure(h: Session, locale: Locale) {
  await h.message("/setup");
  expect(h.text()).toBe("Choose this chat's language.");
  await h.click(h.token(locale === "uk" ? "Українська" : "English"));
  await h.location();
  await h.click(
    h.token(renderMessage(locale, "timezone.use", { timezone: "Europe/Kyiv" })),
  );
  await h.click(h.token(phrase(locale, "weekday.WED")));
  for (const value of ["19:30", "120", "10:00", "22:00"])
    await h.message(value);
  await h.click(h.token(phrase(locale, "button.defaults")));
  await h.click(h.token(phrase(locale, "policy.ADMINS_ONLY")));
  expect(h.text()).toContain(phrase(locale, "language.row"));
  await h.click(h.token(phrase(locale, "button.saveConfiguration")));
  expect(h.text()).toContain(phrase(locale, "setup.saved"));
}
async function snapshot(chatId: bigint) {
  return {
    configuration: await prisma.chatConfiguration.findUnique({
      where: { chatId },
      include: { reminderState: true },
    }),
    drafts: await prisma.setupDraft.findMany({
      where: { chatId },
      orderBy: { id: "asc" },
    }),
    edits: await prisma.settingsEditDraft.findMany({
      where: { chatId },
      orderBy: { id: "asc" },
    }),
    roster: await prisma.chatMembership.findMany({
      where: { chatId },
      orderBy: { id: "asc" },
    }),
    rounds: await prisma.planningRound.findMany({
      where: { chatId },
      include: { participants: true },
      orderBy: { id: "asc" },
    }),
    occurrences: await prisma.reminderOccurrence.findMany({
      where: { chatId },
      orderBy: { id: "asc" },
    }),
  };
}
describe("composed bilingual onboarding on migrated PostgreSQL", () => {
  it.each(["en", "uk"] as const)(
    "completes %s setup, edits settings and adds/pages/removes roster",
    async (locale) => {
      const chatId = locale === "uk" ? -67001n : -67002n;
      const h = session(chatId, 8101, locale === "uk" ? "en" : "uk");
      await configure(h, locale);
      const config = await prisma.chatConfiguration.findUniqueOrThrow({
        where: { chatId },
      });
      expect(config).toMatchObject({
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1170,
        durationMinutes: 120,
      });
      await h.message("/settings");
      expect(h.text()).toContain(phrase(locale, "settings.title"));
      await h.click(h.token(phrase(locale, "edit.DURATION_MINUTES")));
      await h.message("150");
      await h.click(h.token(phrase(locale, "button.saveChange")));
      expect(
        await prisma.chatConfiguration.findUnique({ where: { chatId } }),
      ).toMatchObject({ durationMinutes: 150, revision: config.revision + 1 });
      await h.message("/roster_add", {
        reply_to_message: {
          message_id: 8,
          date: 1,
          chat: { id: Number(chatId), type: "supergroup" },
          from: {
            id: Number(-chatId),
            is_bot: false,
            first_name: "Оля <&> 🎸",
          },
          text: "Hi",
        },
      });
      expect(h.text()).toContain("Оля");
      const roster = new RosterService(prisma);
      for (let index = 0; index < 20; index++)
        await roster.addFromRepliedUser(chatId, 8101n, {
          id: BigInt(Number(-chatId) + 100 + index),
          isBot: false,
          firstName: `Member ${index}`,
        });
      await h.message("/roster");
      expect(h.text()).toContain(phrase(locale, "roster.title"));
      await h.click(h.token(phrase(locale, "button.next")));
      await h.click(h.token(phrase(locale, "button.previous")));
      await h.click(h.token(phrase(locale, "roster.remove")));
      await h.click(h.token(phrase(locale, "roster.remove")));
      expect(h.text()).toContain(phrase(locale, "roster.updated"));
      expect(
        await prisma.chatMembership.count({
          where: { chatId, deactivatedAt: null },
        }),
      ).toBe(20);
    },
  );

  it("preserves revisions, open drafts/confirmations, planning answers and reminder due times across switching and restart", async () => {
    const chatId = -67003n;
    const h = session(chatId);
    await configure(h, "en");
    await h.message("/roster_add", {
      reply_to_message: {
        message_id: 8,
        date: 1,
        chat: { id: Number(chatId), type: "supergroup" },
        from: { id: 99991, is_bot: false, first_name: "Оля" },
        text: "Hi",
      },
    });
    const member = await prisma.chatMembership.findFirstOrThrow({
      where: { chatId },
    });
    await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: 8101n,
        targetWeekStart: "2026-09-14",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        lastActivityAt: now,
        participants: {
          create: {
            telegramUserId: member.telegramUserId,
            membershipId: member.id,
            availability: "AVAILABLE",
            answeredAt: now,
          },
        },
      },
    });
    await prisma.reminderOccurrence.create({
      data: {
        chatId,
        kind: "PLANNING_START",
        scope: "2026-09-14",
        generation: 1,
        civilDate: new Date("2026-09-17"),
        minute: 600,
        dueAt: new Date("2026-09-17T07:00Z"),
      },
    });
    await new SetupService(prisma).beginOrResume(chatId, 8102n, now);
    await h.message("/settings");
    await h.click(h.token(phrase("en", "edit.DURATION_MINUTES")));
    const beforePrompt = await snapshot(chatId);
    await language(h, "uk");
    expect(await snapshot(chatId)).toEqual(beforePrompt);
    await h.message("150");
    expect(h.text()).toContain(phrase("uk", "settings.review"));
    const save = h.token(phrase("uk", "button.saveChange"));
    await h.message("/roster");
    await h.click(h.token(phrase("uk", "roster.remove")));
    const remove = h.token(phrase("uk", "roster.remove"));
    const before = await snapshot(chatId);
    await language(h, "en");
    expect(await snapshot(chatId)).toEqual(before);
    const restarted = session(chatId, 8101, "uk");
    await restarted.message("/settings");
    expect(restarted.text()).toContain("Language: English");
    await restarted.click(save);
    expect(restarted.text()).toContain("Chat settings");
    await restarted.click(remove);
    expect(restarted.text()).toContain(phrase("en", "roster.updated"));
    const after = await snapshot(chatId);
    expect(after.configuration?.durationMinutes).toBe(150);
    expect(after.rounds).toEqual(before.rounds);
    expect(after.occurrences).toEqual(before.occurrences);
    expect(after.configuration?.reminderState).toEqual(
      before.configuration?.reminderState,
    );
  });

  it("rejects expired, consumed, foreign and unauthorized screens and isolates client languages", async () => {
    const chatId = -67004n;
    const a = session(chatId);
    const b = session(chatId, 8102, "uk");
    await a.message("/settings");
    await a.click(a.token("Мова / Language"));
    const uk = a.token("Українська");
    await b.message("/settings");
    await b.click(b.token("Мова / Language"));
    const en = b.token("English");
    await a.click(uk);
    expect(a.answer()?.text).toBe(phrase("uk", "language.changed"));
    await b.click(en);
    expect(b.answer()?.text).toBe(phrase("en", "language.changed"));
    const before = await prisma.chatLanguagePreference.findUniqueOrThrow({
      where: { chatId },
    });
    await language(a, "en");
    expect(a.answer()?.text).toBeUndefined();
    expect(
      await prisma.chatLanguagePreference.findUniqueOrThrow({
        where: { chatId },
      }),
    ).toEqual(before);
    await a.click(uk);
    expect(a.answer()?.text).toBe(
      "This action is no longer available. Open /settings or /setup and try again.",
    );
    await a.message("/settings");
    await a.click(a.token("Мова / Language"));
    const valid = a.token("Українська");
    await b.click(valid);
    expect(b.answer()?.text).toBe(phrase("en", "common.stale"));
    const foreign = session(-67005n, 8101, "uk");
    await foreign.click(valid);
    expect(foreign.answer()?.text).toBe(phrase("en", "common.stale"));
    await foreign.message("/settings");
    expect(foreign.text()).toBe("Language: English");
    const expired = session(chatId);
    expired.expire();
    await expired.click(valid);
    expect(expired.answer()?.text).toBe(phrase("en", "common.stale"));
    a.demote();
    await a.click(valid);
    expect(a.answer()?.text).toBe(phrase("en", "callback.denied"));
    expect(
      await prisma.chatLanguagePreference.findUniqueOrThrow({
        where: { chatId },
      }),
    ).toEqual(before);
    expect(await prisma.chatConfiguration.count({ where: { chatId } })).toBe(0);
    expect(
      await prisma.callbackAction.findUnique({ where: { token: valid } }),
    ).toMatchObject({ consumedAt: null });
  });
});
