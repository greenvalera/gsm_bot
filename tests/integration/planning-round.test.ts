import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

/**
 * Wednesday 2026-08-26, 12:00 in Europe/Kyiv. The chat-local Monday of that week
 * is 2026-08-24 and the following Monday is 2026-08-31 — both asserted below
 * rather than recomputed, so a drift in the civil arithmetic fails loudly.
 */
const NOW = new Date("2026-08-26T09:00:00.000Z");
const CURRENT_WEEK = "2026-08-24";
const NEXT_WEEK = "2026-08-31";

const AUTHOR_ID = 8201n;
const OTHER_ID = 8202n;

/** Every Telegram method this slice is allowed to call. */
const DOCUMENTED_TELEGRAM_METHODS = new Set([
  "sendMessage",
  "editMessageText",
  "answerCallbackQuery",
]);

type ApiCall = Readonly<{ method: string; payload: Record<string, unknown> }>;

type Keyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

let postgres: PostgresTestContainer;
let prisma: PrismaClient;
const openClients: PrismaClient[] = [];

function connect() {
  const client = createPrismaClient(postgres.databaseUrl);
  openClients.push(client);
  return client;
}

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = connect();
}, 180_000);

afterAll(async () => {
  await Promise.all(
    openClients.map((client) => client.$disconnect().catch(() => undefined)),
  );
  await postgres?.stop();
}, 60_000);

/**
 * A logger at the DEFAULT level, so a line only visible at `debug` cannot pass
 * for one an operator would actually see (Phase 1 finding F-4).
 */
function createCapturingLogger() {
  const written: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) written.push(line);
        }
      },
    },
  });
  return {
    logger,
    lines: () =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

type HarnessOptions = Readonly<{
  prisma: PrismaClient;
  chatId: bigint;
  now?: () => Date;
  role?: (chatId: bigint, actorId: bigint) => CurrentTelegramRole;
  roleThrows?: boolean;
}>;

function createHarness(options: HarnessOptions) {
  const calls: ApiCall[] = [];
  const capture = createCapturingLogger();
  let nextMessageId = 900;

  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: BOT_INFO,
    prisma: options.prisma,
    logger: capture.logger,
    now: options.now ?? (() => NOW),
    membershipGateway: {
      async getCurrentRole(chatId, actorId) {
        if (options.roleThrows === true) {
          throw new Error("Telegram membership lookup unavailable");
        }
        return options.role?.(chatId, actorId) ?? "administrator";
      },
    },
  });

  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    method: string,
    payload: Record<string, unknown>,
  ) => {
    calls.push({ method, payload });
    if (method === "sendMessage") {
      nextMessageId += 1;
      return {
        ok: true,
        result: {
          message_id: nextMessageId,
          date: 1_784_000_000,
          chat: { id: Number(options.chatId), type: "supergroup" },
          text: payload.text ?? "",
        },
      };
    }
    return { ok: true, result: true };
  }) as never);

  return {
    bot,
    calls,
    lines: capture.lines,
    countOf(method: string) {
      return calls.filter((call) => call.method === method).length;
    },
    lastOf(method: string) {
      return [...calls].reverse().find((call) => call.method === method);
    },
    methods() {
      return calls.map((call) => call.method);
    },
    reset() {
      calls.length = 0;
    },
    async send(update: unknown) {
      await bot.handleUpdate(update as never);
    },
  };
}

function messageUpdate(
  updateId: number,
  chatId: bigint,
  actorId: bigint,
  text: string,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      from: { id: Number(actorId), is_bot: false, first_name: "Author" },
      text,
      entities: [
        {
          offset: 0,
          length: (text.split(" ")[0] ?? text).length,
          type: "bot_command",
        },
      ],
    },
  };
}

function callbackUpdate(
  updateId: number,
  chatId: bigint,
  actorId: bigint,
  data: string,
) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: Number(actorId), is_bot: false, first_name: "Author" },
      chat_instance: "planning-round-e2e",
      data,
      message: {
        message_id: 777,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      },
    },
  };
}

function keyboardRows(call: ApiCall | undefined) {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  return (markup?.inline_keyboard ?? []).map((row) =>
    row.map((button) => button.text),
  );
}

function keyboardButtons(call: ApiCall | undefined) {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  return (markup?.inline_keyboard ?? []).flat();
}

function tokenLabelled(call: ApiCall | undefined, label: string) {
  const button = keyboardButtons(call).find((entry) => entry.text === label);
  if (button === undefined) throw new Error(`Expected a "${label}" button.`);
  return button.callback_data;
}

async function configureChat(chatId: bigint, overrides = {}) {
  await prisma.chatConfiguration.create({
    data: { chatId, ...createChatConfiguration(overrides) },
  });
}

describe("planning round vertical slice", () => {
  it("starts a durable week-aware round and anchors the day card for a non-admin author", async () => {
    const chatId = -1007000000001n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
    });

    await harness.send(messageUpdate(1001, chatId, AUTHOR_ID, "/plan"));

    expect(harness.countOf("sendMessage")).toBe(1);
    const sent = harness.lastOf("sendMessage");
    expect(keyboardButtons(sent)).toHaveLength(7);
    expect(keyboardRows(sent).map((row) => row.length)).toEqual([4, 3]);
    expect(keyboardRows(sent).flat()).toEqual([
      "Mon 24",
      "Tue 25",
      "Wed 26",
      "Thu 27",
      "Fri 28",
      "Sat 29",
      "Sun 30",
    ]);

    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(round).toMatchObject({
      status: "DRAFT",
      step: "DAY",
      authorUserId: AUTHOR_ID,
      targetWeekStart: CURRENT_WEEK,
      activeWeekStart: CURRENT_WEEK,
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      selectedDate: null,
    });
    expect(round.anchorMessageId).toBe(901);
    expect(
      harness.methods().every((m) => DOCUMENTED_TELEGRAM_METHODS.has(m)),
    ).toBe(true);
  });

  it("replaces the same anchor card in place when the author taps a day", async () => {
    const chatId = -1007000000002n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1101, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Wed 26");
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(callbackUpdate(1102, chatId, AUTHOR_ID, dayToken));

    expect(harness.countOf("editMessageText")).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(0);
    const edited = harness.lastOf("editMessageText");
    expect(edited?.payload.message_id).toBe(before.anchorMessageId);
    expect(keyboardRows(edited).flat()).toEqual([
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
    ]);
    expect(keyboardRows(edited).map((row) => row.length)).toEqual([3, 3, 3, 1]);

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-26");
    expect(after.revision).toBe(before.revision + 1);

    // T-02-11: a mid-round settings edit must not retroactively rewrite the
    // round's own snapshot, which is what every later step reads.
    await prisma.chatConfiguration.update({
      where: { chatId },
      data: { dailyEndMinute: 1320, durationMinutes: 60 },
    });
    const unchanged = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(unchanged.dailyEndMinute).toBe(1260);
    expect(unchanged.durationMinutes).toBe(120);
  });

  it("refuses a second start for the same chat and week, in the application and at the database", async () => {
    const chatId = -1007000000003n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1201, chatId, AUTHOR_ID, "/plan"));
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    harness.reset();

    await harness.send(messageUpdate(1202, chatId, OTHER_ID, "/plan"));

    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toMatch(
      /already planning/i,
    );

    await expect(
      prisma.planningRound.create({
        data: {
          chatId,
          authorUserId: OTHER_ID,
          targetWeekStart: CURRENT_WEEK,
          activeWeekStart: CURRENT_WEEK,
          timezone: "Europe/Kyiv",
          durationMinutes: 120,
          dailyStartMinute: 600,
          dailyEndMinute: 1260,
          lastActivityAt: NOW,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("targets the current week when unclaimed, the next week when confirmed, and resumes a draft", async () => {
    const unclaimed = -1007000000004n;
    await configureChat(unclaimed);
    const first = createHarness({ prisma, chatId: unclaimed });
    await first.send(messageUpdate(1301, unclaimed, AUTHOR_ID, "/plan"));
    expect(
      (
        await prisma.planningRound.findFirstOrThrow({
          where: { chatId: unclaimed },
        })
      ).targetWeekStart,
    ).toBe(CURRENT_WEEK);

    const claimed = -1007000000005n;
    await configureChat(claimed);
    await prisma.planningRound.create({
      data: {
        chatId: claimed,
        authorUserId: OTHER_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: null,
        status: "CONFIRMED",
        step: "REVIEW",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      },
    });
    const second = createHarness({ prisma, chatId: claimed });
    await second.send(messageUpdate(1302, claimed, AUTHOR_ID, "/plan"));
    const draft = await prisma.planningRound.findFirstOrThrow({
      where: { chatId: claimed, status: "DRAFT" },
    });
    expect(draft.targetWeekStart).toBe(NEXT_WEEK);

    // A DRAFT round does NOT claim its week (Pitfall 6): the author's repeat
    // resumes the same row rather than computing a different target week.
    second.reset();
    await second.send(messageUpdate(1303, claimed, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({
        where: { chatId: claimed, status: "DRAFT" },
      }),
    ).toBe(1);
    const resumed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(resumed.targetWeekStart).toBe(NEXT_WEEK);
    expect(second.countOf("sendMessage")).toBe(1);
  });

  it("refuses /plan without a configuration, for a departed member, and for an unavailable lookup", async () => {
    const unconfigured = -1007000000006n;
    const admin = createHarness({ prisma, chatId: unconfigured });
    await admin.send(messageUpdate(1401, unconfigured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: unconfigured } }),
    ).toBe(0);
    expect(String(admin.lastOf("sendMessage")?.payload.text)).toMatch(
      /\/setup/,
    );

    const configured = -1007000000007n;
    await configureChat(configured, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const departed = createHarness({
      prisma,
      chatId: configured,
      role: () => "left",
    });
    await departed.send(messageUpdate(1402, configured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: configured } }),
    ).toBe(0);
    expect(departed.countOf("sendMessage")).toBe(1);

    const unavailable = createHarness({
      prisma,
      chatId: configured,
      roleThrows: true,
    });
    await unavailable.send(messageUpdate(1403, configured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: configured } }),
    ).toBe(0);
    expect(unavailable.countOf("sendMessage")).toBe(1);
    const failure = unavailable
      .lines()
      .find((line) => line.outcome === "membership-lookup-unavailable");
    expect(failure).toBeDefined();
    expect(failure?.err).toMatchObject({ name: "Error" });
  });

  it("resumes the exact step and selection from a fresh composition root", async () => {
    const chatId = -1007000000008n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const firstClient = connect();
    const first = createHarness({
      prisma: firstClient,
      chatId,
      role: () => "member",
    });
    await first.send(messageUpdate(1501, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(first.lastOf("sendMessage"), "Thu 27");
    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });

    // Dispose the composition root that minted the token entirely: nothing it
    // held in process memory may be required to finish the round.
    await firstClient.$disconnect();
    const secondClient = connect();
    const second = createHarness({
      prisma: secondClient,
      chatId,
      role: () => "member",
    });

    await second.send(callbackUpdate(1502, chatId, AUTHOR_ID, dayToken));

    expect(second.countOf("editMessageText")).toBe(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-27");
  });

  it("never destroys the acting user's setup draft when they tap a planning button", async () => {
    const chatId = -1007000000009n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(1601, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Fri 28");

    await prisma.setupDraft.create({
      data: {
        chatId,
        actorUserId: AUTHOR_ID,
        expectedRevision: 0,
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });

    await harness.send(callbackUpdate(1602, chatId, AUTHOR_ID, dayToken));

    expect(
      await prisma.setupDraft.count({
        where: { chatId, actorUserId: AUTHOR_ID },
      }),
    ).toBe(1);
  });
});
