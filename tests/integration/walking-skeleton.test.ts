import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const CHAT_ID = -1001234567890n;
const ADMIN_ID = 1001n;
const NON_ADMIN_ID = 2002n;
const UNAVAILABLE_MEMBERSHIP_ID = 3003n;
const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
};

type ApiCall = {
  method: string;
  payload: Record<string, unknown>;
};

let container: Awaited<ReturnType<GenericContainer["start"]>>;
let prisma: {
  setupDraft: {
    count: (args?: unknown) => Promise<number>;
    findMany: (args?: unknown) => Promise<Array<{ actorUserId: bigint }>>;
  };
  callbackAction: {
    findUnique: (args: unknown) => Promise<{ consumedAt: Date | null } | null>;
  };
  $disconnect: () => Promise<void>;
};
let bot: {
  handleUpdate: (update: Record<string, unknown>) => Promise<void>;
};
let apiCalls: ApiCall[] = [];
let events: string[] = [];

function messageUpdate(updateId: number, actorId: bigint, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
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

async function runPrisma(args: string[], databaseUrl: string) {
  return execFile("./node_modules/.bin/prisma", args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

beforeAll(async () => {
  container = await new GenericContainer("postgres:18.4")
    .withEnvironment({
      POSTGRES_DB: "gsmbot",
      POSTGRES_USER: "gsmbot",
      POSTGRES_PASSWORD: "gsmbot",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections"),
    )
    .start();

  const databaseUrl = `postgresql://gsmbot:gsmbot@${container.getHost()}:${container.getMappedPort(5432)}/gsmbot`;
  process.env.DATABASE_URL = databaseUrl;

  await runPrisma(["migrate", "deploy"], databaseUrl);
  await runPrisma(["migrate", "status"], databaseUrl);
  await runPrisma(["generate"], databaseUrl);

  const [{ PrismaPg }, { PrismaClient }, application] = await Promise.all([
    import("@prisma/adapter-pg"),
    import("../../src/generated/prisma/client.js"),
    import("../../src/app/create-bot.js"),
  ]);
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

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
  await container?.stop();
}, 60_000);

describe("walking-skeleton", () => {
  it("creates then resumes one actor-bound draft and sends the readiness prompt", async () => {
    apiCalls = [];
    events = [];

    await bot.handleUpdate(messageUpdate(1, ADMIN_ID, "/setup"));
    await bot.handleUpdate(messageUpdate(2, ADMIN_ID, "/setup"));

    expect(events.filter((event) => event === "membership")).toHaveLength(2);
    expect(await prisma.setupDraft.count()).toBe(1);
    expect(await prisma.setupDraft.findMany()).toMatchObject([
      { actorUserId: ADMIN_ID },
    ]);

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
  });

  it("denies non-administrators without creating a draft", async () => {
    apiCalls = [];
    events = [];

    await bot.handleUpdate(messageUpdate(3, NON_ADMIN_ID, "/setup"));

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
      messageUpdate(8, UNAVAILABLE_MEMBERSHIP_ID, "/setup"),
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

  it("acknowledges an approved callback before its durable action", async () => {
    apiCalls = [];
    events = [];
    await bot.handleUpdate(messageUpdate(4, ADMIN_ID, "/setup"));
    const prompt = apiCalls.find((call) => call.method === "sendMessage");
    const callbackData = (
      prompt?.payload.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0][0].callback_data;

    apiCalls = [];
    events = [];
    await bot.handleUpdate(callbackUpdate(5, ADMIN_ID, callbackData));

    expect(events.slice(0, 2)).toEqual(["answerCallbackQuery", "membership"]);
    expect(
      await prisma.callbackAction.findUnique({
        where: { token: callbackData },
      }),
    ).toMatchObject({ consumedAt: expect.any(Date) });
  });

  it("acknowledges a denied callback before checking its current role or mutating a draft", async () => {
    apiCalls = [];
    events = [];
    await bot.handleUpdate(messageUpdate(6, ADMIN_ID, "/setup"));
    const prompt = apiCalls.find((call) => call.method === "sendMessage");
    const callbackData = (
      prompt?.payload.reply_markup as {
        inline_keyboard: Array<Array<{ callback_data: string }>>;
      }
    ).inline_keyboard[0][0].callback_data;
    const draftCountBefore = await prisma.setupDraft.count();

    apiCalls = [];
    events = [];
    await bot.handleUpdate(callbackUpdate(7, NON_ADMIN_ID, callbackData));

    expect(events.slice(0, 3)).toEqual([
      "answerCallbackQuery",
      "membership",
      "answerCallbackQuery",
    ]);
    expect(apiCalls[0]).toMatchObject({
      method: "answerCallbackQuery",
    });
    expect(apiCalls[1]).toMatchObject({
      method: "answerCallbackQuery",
      payload: {
        text: "Only current chat administrators can do that.",
        show_alert: true,
      },
    });
    expect(await prisma.setupDraft.count()).toBe(draftCountBefore);
  });
});
