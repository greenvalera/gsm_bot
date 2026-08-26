import type { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

const CHAT_ID = -1001234567890n;
/**
 * One chat per durable entry state. `/setup` branches on chat-scoped rows, so
 * sharing a chat between the states would make each case depend on the order
 * the ones before it happened to leave the database in.
 */
const CONFIGURED_CHAT_ID = -1001234567891n;
const RESUME_CHAT_ID = -1001234567892n;
const EXPIRED_CHAT_ID = -1001234567893n;
const ADMIN_ID = 1001n;
const NON_ADMIN_ID = 2002n;
const UNAVAILABLE_MEMBERSHIP_ID = 3003n;
const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

type ApiCall = {
  method: string;
  payload: Record<string, unknown>;
};

type KeyboardButton = { text: string; callback_data: string };

/**
 * The rendered keyboard as rows, or none at all. Reading the shape positively
 * is what lets a test say which buttons a card owns rather than only that some
 * particular label is absent.
 */
function keyboardRows(call: ApiCall | undefined): KeyboardButton[][] {
  const markup = call?.payload.reply_markup as
    { inline_keyboard: KeyboardButton[][] } | undefined;
  return markup?.inline_keyboard ?? [];
}

let postgres: PostgresTestContainer;
let prisma: PrismaClient;
let bot: Bot;
let apiCalls: ApiCall[] = [];
let events: string[] = [];

function messageUpdate(
  updateId: number,
  actorId: bigint,
  text: string,
  chatId: bigint = CHAT_ID,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      from: {
        id: Number(actorId),
        is_bot: false,
        first_name: actorId === ADMIN_ID ? "Admin" : "Member",
      },
      text,
      entities: [{ offset: 0, length: 6, type: "bot_command" }],
    },
  };
}

function callbackUpdate(updateId: number, actorId: bigint, data: string) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: {
        id: Number(actorId),
        is_bot: false,
        first_name: actorId === ADMIN_ID ? "Admin" : "Member",
      },
      chat_instance: "test-chat-instance",
      data,
      message: {
        message_id: 777,
        date: 1_784_000_000,
        chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
      },
    },
  };
}

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  const application = await import("../../src/app/create-bot.js");
  prisma = createPrismaClient(postgres.databaseUrl);

  bot = application.createBot({
    botToken: "123456:TEST_TOKEN",
    prisma,
    now: () => new Date("2026-08-20T09:00:00.000Z"),
    membershipGateway: {
      async getCurrentRole(_chatId: bigint, actorId: bigint) {
        events.push("membership");
        if (actorId === UNAVAILABLE_MEMBERSHIP_ID) {
          throw new Error("membership lookup unavailable");
        }
        return actorId === ADMIN_ID ? "administrator" : "member";
      },
    },
    botInfo: BOT_INFO,
  });

  (
    bot as unknown as { api: { config: { use: (fn: Function) => void } } }
  ).api.config.use(
    async (
      _prev: unknown,
      method: string,
      payload: Record<string, unknown>,
    ) => {
      apiCalls.push({ method, payload });
      events.push(method);
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: apiCalls.length,
            date: 1_784_000_000,
            chat: { id: Number(CHAT_ID), type: "supergroup" },
          },
        };
      }
      return { ok: true, result: true };
    },
  );
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

describe("walking-skeleton", () => {
  it("creates one actor-bound draft and sends the readiness prompt on first entry", async () => {
    apiCalls = [];
    events = [];

    await bot.handleUpdate(messageUpdate(1, ADMIN_ID, "/setup") as Update);

    expect(events.filter((event) => event === "membership")).toHaveLength(1);
    expect(await prisma.setupDraft.count({ where: { chatId: CHAT_ID } })).toBe(
      1,
    );
    expect(
      await prisma.setupDraft.findMany({ where: { chatId: CHAT_ID } }),
    ).toMatchObject([{ actorUserId: ADMIN_ID }]);

    const readinessPrompt = apiCalls.find(
      (call) => call.method === "sendMessage",
    );
    expect(readinessPrompt?.payload).toMatchObject({
      chat_id: Number(CHAT_ID),
      text: "<b>Set up rehearsal planning</b>\nThis chat is not configured yet.",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "Start setup" }]],
      },
    });
    // Exactly one action, so the focal point of the unconfigured card stays
    // single: the tap that opens the wizard.
    expect(
      keyboardRows(readinessPrompt)
        .flat()
        .map((button) => button.text),
    ).toStrictEqual(["Start setup"]);
  });

  it("opens a revision-bound wizard directly when the chat is already configured", async () => {
    apiCalls = [];
    events = [];
    const committed = await prisma.chatConfiguration.create({
      data: {
        chatId: CONFIGURED_CHAT_ID,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: "ADMINS_ONLY",
      },
    });

    await bot.handleUpdate(
      messageUpdate(9, ADMIN_ID, "/setup", CONFIGURED_CHAT_ID) as Update,
    );

    const sent = apiCalls.filter((call) => call.method === "sendMessage");
    expect(sent).toHaveLength(1);
    const text = String(sent[0]?.payload.text);
    expect(text.split("\n")[0]).toBe("Setup in progress");
    expect(text).toContain("Step 1 of 8");
    expect(text).not.toContain("This chat is not configured yet.");
    // Step 1 collects a location, so it owns no buttons — a Start action here
    // would mean the unconfigured readiness card leaked onto this branch.
    expect(sent[0]?.payload).not.toHaveProperty("reply_markup");
    expect(
      await prisma.callbackAction.count({
        where: { chatId: CONFIGURED_CHAT_ID },
      }),
    ).toBe(0);

    // The draft must expect the revision it will actually be saved against,
    // or the eight steps end at saveConfiguration's conflict branch.
    expect(
      await prisma.setupDraft.findMany({
        where: { chatId: CONFIGURED_CHAT_ID },
      }),
    ).toMatchObject([
      { actorUserId: ADMIN_ID, expectedRevision: committed.revision },
    ]);
  });

  it("resumes a live draft at its exact current step without resetting it", async () => {
    await bot.handleUpdate(
      messageUpdate(10, ADMIN_ID, "/setup", RESUME_CHAT_ID) as Update,
    );
    // Advance the draft the way the wizard would, so the resume has a step
    // beyond the first to be wrong about.
    const opened = await prisma.setupDraft.update({
      where: {
        chatId_actorUserId: {
          chatId: RESUME_CHAT_ID,
          actorUserId: ADMIN_ID,
        },
      },
      data: { timezone: "Europe/Kyiv", candidateTimezone: "Europe/Kyiv" },
    });
    const actionsBefore = await prisma.callbackAction.count({
      where: { chatId: RESUME_CHAT_ID },
    });

    apiCalls = [];
    events = [];
    await bot.handleUpdate(
      messageUpdate(11, ADMIN_ID, "/setup", RESUME_CHAT_ID) as Update,
    );

    const sent = apiCalls.filter((call) => call.method === "sendMessage");
    expect(sent).toHaveLength(1);
    const text = String(sent[0]?.payload.text);
    expect(text.split("\n")[0]).toBe("Setup in progress");
    expect(text).toContain("Step 2 of 8");
    expect(text).not.toContain("This chat is not configured yet.");
    // The buttons are step 2's own weekday choices — positive proof the card
    // came from the draft's current step and not from a restarted wizard.
    expect(
      keyboardRows(sent[0]).map((row) => row.map((button) => button.text)),
    ).toStrictEqual([
      ["Mon", "Tue", "Wed", "Thu"],
      ["Fri", "Sat", "Sun"],
    ]);

    const resumed = await prisma.setupDraft.findMany({
      where: { chatId: RESUME_CHAT_ID },
    });
    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({
      id: opened.id,
      timezone: "Europe/Kyiv",
      expectedRevision: opened.expectedRevision,
    });
    // Step 2 mints its own weekday actions; what it must not mint is a second
    // Start action, which is the only action the first card ever owned.
    expect(
      await prisma.callbackAction.count({
        where: { chatId: RESUME_CHAT_ID, targetId: opened.id },
      }),
    ).toBe(actionsBefore);
  });

  it("reports the setup expiry and starts no mutation once the draft lapses", async () => {
    await bot.handleUpdate(
      messageUpdate(12, ADMIN_ID, "/setup", EXPIRED_CHAT_ID) as Update,
    );
    await prisma.setupDraft.update({
      where: {
        chatId_actorUserId: {
          chatId: EXPIRED_CHAT_ID,
          actorUserId: ADMIN_ID,
        },
      },
      data: { expiresAt: new Date("2026-08-20T08:00:00.000Z") },
    });
    const actionsBefore = await prisma.callbackAction.count({
      where: { chatId: EXPIRED_CHAT_ID },
    });

    apiCalls = [];
    events = [];
    await bot.handleUpdate(
      messageUpdate(13, ADMIN_ID, "/setup", EXPIRED_CHAT_ID) as Update,
    );

    const sent = apiCalls.filter((call) => call.method === "sendMessage");
    expect(sent).toHaveLength(1);
    expect(sent[0]?.payload.text).toBe(
      "This setup expired after 30 minutes of inactivity. Send /setup to start again.",
    );
    expect(sent[0]?.payload).not.toHaveProperty("reply_markup");
    // The lapsed row is gone and nothing replaced it in the same update — a
    // replacement here would silently discard what the actor had collected.
    expect(
      await prisma.setupDraft.count({ where: { chatId: EXPIRED_CHAT_ID } }),
    ).toBe(0);
    expect(
      await prisma.callbackAction.count({ where: { chatId: EXPIRED_CHAT_ID } }),
    ).toBe(actionsBefore);
  });

  it("denies non-administrators without creating a draft", async () => {
    apiCalls = [];
    events = [];

    await bot.handleUpdate(messageUpdate(3, NON_ADMIN_ID, "/setup") as Update);

    expect(events).toEqual(["membership", "sendMessage"]);
    expect(
      await prisma.setupDraft.count({ where: { actorUserId: NON_ADMIN_ID } }),
    ).toBe(0);
    expect(apiCalls.at(-1)?.payload).toMatchObject({
      text: "Only current chat administrators can change chat setup, roster, or planning access.",
    });
  });

  it("fails closed when current membership evidence is unavailable", async () => {
    apiCalls = [];
    events = [];

    await bot.handleUpdate(
      messageUpdate(8, UNAVAILABLE_MEMBERSHIP_ID, "/setup") as Update,
    );

    expect(events).toEqual(["membership", "sendMessage"]);
    expect(
      await prisma.setupDraft.count({
        where: { actorUserId: UNAVAILABLE_MEMBERSHIP_ID },
      }),
    ).toBe(0);
    expect(apiCalls.at(-1)?.payload).toMatchObject({
      text: "Only current chat administrators can change chat setup, roster, or planning access.",
    });
  });

  it("answers an approved callback exactly once, after the current role lookup", async () => {
    // The Start action belongs to the FIRST-entry card only, so this case has
    // to actually be a first entry: a leftover draft would resume instead.
    await prisma.setupDraft.deleteMany({ where: { chatId: CHAT_ID } });
    apiCalls = [];
    events = [];
    await bot.handleUpdate(messageUpdate(4, ADMIN_ID, "/setup") as Update);
    const prompt = apiCalls.find((call) => call.method === "sendMessage");
    const callbackData = (
      prompt?.payload.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0]?.[0]?.callback_data;
    expect(callbackData).toBeDefined();
    if (callbackData === undefined) {
      throw new Error("Expected the setup prompt to include callback data.");
    }

    apiCalls = [];
    events = [];
    await bot.handleUpdate(callbackUpdate(5, ADMIN_ID, callbackData) as Update);

    // Telegram honours only the first answer per callback_query.id, so the
    // boundary spends it once — here on a bare acknowledgement, because no
    // branch chose an outcome text.
    expect(events[0]).toBe("membership");
    expect(
      events.filter((event) => event === "answerCallbackQuery"),
    ).toHaveLength(1);
    expect(
      await prisma.callbackAction.findUnique({
        where: { token: callbackData },
      }),
    ).toMatchObject({ consumedAt: expect.any(Date) });
  });

  it("denies a callback with a single alert-bearing answer, after its current role check and without mutating a draft", async () => {
    // Same reason as above: only a first entry mints a Start action.
    await prisma.setupDraft.deleteMany({ where: { chatId: CHAT_ID } });
    apiCalls = [];
    events = [];
    await bot.handleUpdate(messageUpdate(6, ADMIN_ID, "/setup") as Update);
    const prompt = apiCalls.find((call) => call.method === "sendMessage");
    const callbackData = (
      prompt?.payload.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0]?.[0]?.callback_data;
    expect(callbackData).toBeDefined();
    if (callbackData === undefined) {
      throw new Error("Expected the setup prompt to include callback data.");
    }
    const draftCountBefore = await prisma.setupDraft.count();

    apiCalls = [];
    events = [];
    await bot.handleUpdate(
      callbackUpdate(7, NON_ADMIN_ID, callbackData) as Update,
    );

    // The role check runs first, and the one answer Telegram honours is the
    // denial alert itself — not a bare acknowledgement issued ahead of it.
    expect(events).toEqual(["membership", "answerCallbackQuery"]);
    const answers = apiCalls.filter(
      (call) => call.method === "answerCallbackQuery",
    );
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      method: "answerCallbackQuery",
      payload: {
        text: "Only current chat administrators can do that.",
        show_alert: true,
      },
    });
    expect(await prisma.setupDraft.count()).toBe(draftCountBefore);
  });
});
