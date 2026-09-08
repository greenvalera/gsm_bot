import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_CANNOT_ATTEND_LABEL,
  PLANNING_CAN_ATTEND_LABEL,
  PLANNING_CONFIRM_LABEL,
} from "../../src/telegram/keyboards.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

/** Cancellation message effects through the real update router and PostgreSQL. */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

/** Wednesday 2026-08-26, 12:00 in Europe/Kyiv. */
const NOW = new Date("2026-08-26T09:00:00.000Z");
/** Thursday of the target week, and the hour every fixture picks. */
const CHOSEN_DAY_LABEL = "Thu 27";
const CHOSEN_TIME_LABEL = "15:00";

const AUTHOR_ID = 8501n;
const MEMBER_ID = 8502n;
const ADMIN_ID = 8503n;

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

/** A logger at the DEFAULT level: a debug-only line is not one an operator sees. */
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
  /** Resolved fresh on every lookup, so a test can demote somebody mid-round. */
  role?: (chatId: bigint, actorId: bigint) => CurrentTelegramRole;
  failEdit?: (messageId: number) => boolean;
}>;

function createHarness(options: HarnessOptions) {
  const calls: ApiCall[] = [];
  const sentMessageIds: number[] = [];
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
        return options.role?.(chatId, actorId) ?? "member";
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
    if (
      method === "editMessageText" &&
      options.failEdit?.(Number(payload.message_id))
    ) {
      throw new Error("Simulated Telegram edit outage");
    }
    if (method === "sendMessage") {
      nextMessageId += 1;
      sentMessageIds.push(nextMessageId);
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
    calls,
    sentMessageIds,
    lines: capture.lines,
    countOf(method: string) {
      return calls.filter((call) => call.method === method).length;
    },
    allOf(method: string) {
      return calls.filter((call) => call.method === method);
    },
    lastOf(method: string) {
      return [...calls].reverse().find((call) => call.method === method);
    },
    /** The last edit addressed at one specific message id. */
    lastEditOf(messageId: number) {
      return [...calls]
        .reverse()
        .find(
          (call) =>
            call.method === "editMessageText" &&
            Number(call.payload.message_id) === messageId,
        );
    },
    reset() {
      calls.length = 0;
    },
    async send(update: unknown) {
      await bot.handleUpdate(update as never);
    },
  };
}

let updateId = 9000;

function messageUpdate(chatId: bigint, actorId: bigint, text: string) {
  updateId += 1;
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

function callbackUpdate(chatId: bigint, actorId: bigint, data: string) {
  updateId += 1;
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: Number(actorId), is_bot: false, first_name: "Member" },
      chat_instance: "planning-booking",
      data,
      message: {
        message_id: 777,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      },
    },
  };
}

function keyboardButtons(call: ApiCall | undefined) {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  return (markup?.inline_keyboard ?? []).flat();
}

function tokenLabelled(call: ApiCall | undefined, label: string) {
  const button = keyboardButtons(call).find((entry) =>
    entry.text.endsWith(label),
  );
  if (button === undefined) throw new Error(`Expected a "${label}" button.`);
  return button.callback_data;
}

async function configureChat(chatId: bigint) {
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({ planningAccessPolicy: "ANYONE_IN_CHAT" }),
    },
  });
}

type MemberSpec = Readonly<{ id: bigint; firstName: string }>;

async function addMembers(chatId: bigint, members: readonly MemberSpec[]) {
  for (const member of members) {
    await prisma.telegramUser.upsert({
      where: { telegramUserId: member.id },
      create: { telegramUserId: member.id, firstName: member.firstName },
      update: { firstName: member.firstName },
    });
    await prisma.chatMembership.create({
      data: { chatId, telegramUserId: member.id, activeAt: NOW },
    });
  }
}

async function actionToken(call: ApiCall | undefined, action: string) {
  for (const button of keyboardButtons(call)) {
    const row = await prisma.callbackAction.findUnique({
      where: { token: button.callback_data },
    });
    if (row?.targetId && JSON.parse(row.targetId).action === action)
      return button.callback_data;
  }
  throw new Error(`Expected a visible ${action} control`);
}

async function fixture(chatId: bigint, options: Partial<HarnessOptions> = {}) {
  await configureChat(chatId);
  await addMembers(chatId, [
    { id: AUTHOR_ID, firstName: "Ada" },
    { id: MEMBER_ID, firstName: "Bo" },
  ]);
  const harness = createHarness({ prisma, chatId, ...options });
  await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));
  const draft = await prisma.planningRound.findFirstOrThrow({
    where: { chatId },
  });
  return { harness, draft };
}

async function confirmed(
  chatId: bigint,
  options: Partial<HarnessOptions> = {},
) {
  const { harness, draft } = await fixture(chatId, options);
  await harness.send(
    callbackUpdate(
      chatId,
      AUTHOR_ID,
      tokenLabelled(harness.lastOf("sendMessage"), CHOSEN_DAY_LABEL),
    ),
  );
  await harness.send(
    callbackUpdate(
      chatId,
      AUTHOR_ID,
      tokenLabelled(harness.lastOf("editMessageText"), CHOSEN_TIME_LABEL),
    ),
  );
  await harness.send(
    callbackUpdate(
      chatId,
      AUTHOR_ID,
      tokenLabelled(harness.lastOf("editMessageText"), PLANNING_CONFIRM_LABEL),
    ),
  );
  const round = await prisma.planningRound.findUniqueOrThrow({
    where: { id: draft.id },
  });
  const answer = tokenLabelled(
    harness.lastEditOf(round.anchorMessageId!),
    PLANNING_CANNOT_ATTEND_LABEL,
  );
  return { harness, round, answer };
}

async function openCancel(
  harness: ReturnType<typeof createHarness>,
  chatId: bigint,
  actorId = AUTHOR_ID,
) {
  await harness.send(messageUpdate(chatId, actorId, "/plan_cancel"));
  const confirmation =
    harness.lastOf("editMessageText") ?? harness.lastOf("sendMessage");
  expect(String(confirmation?.payload.text)).toMatch(/cancel/i);
  expect(keyboardButtons(confirmation)).toHaveLength(2);
  return {
    apply: await actionToken(confirmation, "cancel-apply"),
    keep: await actionToken(confirmation, "cancel-keep"),
  };
}

function expectCancelled(call: ApiCall | undefined) {
  expect(call).toBeDefined();
  expect(String(call?.payload.text)).toMatch(/cancelled/i);
  expect(String(call?.payload.text)).not.toMatch(
    /ready to book|everyone.*make it|still collecting|undo|restore/i,
  );
  expect(keyboardButtons(call)).toHaveLength(0);
}

describe("cancellation through Telegram", () => {
  it.each(["blocked", "ready"] as const)(
    "restores the %s announcement controls after declining",
    async (outcome) => {
      const chatId = outcome === "blocked" ? -946009n : -946010n;
      const { harness, round, answer } = await confirmed(chatId);
      if (outcome === "blocked") {
        await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
      } else {
        const available = tokenLabelled(
          harness.lastEditOf(round.anchorMessageId!),
          PLANNING_CAN_ATTEND_LABEL,
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
        await harness.send(callbackUpdate(chatId, MEMBER_ID, available));
      }
      const announced = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      expect(announced.announcementMessageId).not.toBeNull();
      harness.reset();
      const { keep } = await openCancel(harness, chatId);
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
      const restored = harness.lastEditOf(announced.announcementMessageId!);
      await actionToken(
        restored,
        outcome === "blocked" ? "replan" : "book-request",
      );
      await actionToken(restored, "cancel-request");
      expect(harness.countOf("sendMessage")).toBe(0);
      if (outcome === "ready") {
        await harness.send(
          callbackUpdate(
            chatId,
            AUTHOR_ID,
            await actionToken(restored, "book-request"),
          ),
        );
        const keepBooking = await actionToken(
          harness.lastEditOf(announced.announcementMessageId!),
          "book-keep",
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, keepBooking));
        await actionToken(
          harness.lastEditOf(announced.announcementMessageId!),
          "cancel-request",
        );
      }
    },
  );

  it("cancels a draft through named confirmation without posting a new notice", async () => {
    const chatId = -946001n;
    const { harness, draft } = await fixture(chatId);
    harness.reset();
    const { apply } = await openCancel(harness, chatId);
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).status,
    ).toBe("DRAFT");
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(0);
    expectCancelled(harness.lastEditOf(draft.anchorMessageId!));
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).status,
    ).toBe("CANCELLED");
  });

  it("corrects both confirmed messages while preserving the lineup and sending no notice", async () => {
    const chatId = -946002n;
    const { harness, round, answer } = await confirmed(chatId);
    await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
    const blocked = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(blocked.announcementMessageId).not.toBeNull();
    // A member's answer must not hide the author's shared lifecycle control.
    await actionToken(
      harness.lastEditOf(blocked.announcementMessageId!) ??
        harness.lastOf("sendMessage"),
      "cancel-request",
    );
    await expect(
      actionToken(
        harness.lastEditOf(blocked.anchorMessageId!),
        "cancel-request",
      ),
    ).rejects.toThrow("Expected a visible");
    harness.reset();
    const { apply } = await openCancel(harness, chatId);
    expect(harness.lastOf("editMessageText")?.payload.message_id).toBe(
      blocked.announcementMessageId,
    );
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
    expect(harness.countOf("sendMessage")).toBe(0);
    for (const id of [
      blocked.anchorMessageId!,
      blocked.announcementMessageId!,
    ]) {
      expectCancelled(harness.lastEditOf(id));
      expect(String(harness.lastEditOf(id)?.payload.text)).toContain("Bo");
    }
    const cancelled = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(cancelled.anchorMessageId).toBe(blocked.anchorMessageId);
    expect(cancelled.announcementMessageId).toBe(blocked.announcementMessageId);
    expect(cancelled.activeWeekStart).toBeNull();
  });

  it("announces a booked cancellation and corrects both durable messages", async () => {
    const chatId = -946003n;
    const { harness, round, answer } = await confirmed(chatId);
    await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
    const booked = await prisma.planningRound.update({
      where: { id: round.id },
      data: { status: "BOOKED", bookedAt: NOW, bookedByUserId: AUTHOR_ID },
    });
    harness.reset();
    const { apply } = await openCancel(harness, chatId);
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
    expect(harness.countOf("sendMessage")).toBe(1);
    expectCancelled(harness.lastOf("sendMessage"));
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toContain(
      "15:00",
    );
    for (const id of [booked.anchorMessageId!, booked.announcementMessageId!])
      expectCancelled(harness.lastEditOf(id));
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
  });

  it("declines cancellation and restores an inline cancellation control", async () => {
    const chatId = -946004n;
    const { harness, round } = await confirmed(chatId);
    harness.reset();
    const { keep, apply } = await openCancel(harness, chatId);
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: apply },
        })
      ).expiresAt.getTime(),
    ).toBeLessThanOrEqual(NOW.getTime());
    const request = await actionToken(
      harness.lastEditOf(round.anchorMessageId!),
      "cancel-request",
    );
    expect(
      keyboardButtons(harness.lastEditOf(round.anchorMessageId!)),
    ).toHaveLength(3);
    await actionToken(harness.lastEditOf(round.anchorMessageId!), "answer");
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    await actionToken(harness.lastOf("editMessageText"), "cancel-apply");
  });

  it("refuses a non-author command and gives a plain response when no round exists", async () => {
    const chatId = -946005n;
    const { harness, round } = await confirmed(chatId);
    harness.reset();
    await harness.send(messageUpdate(chatId, MEMBER_ID, "/plan_cancel"));
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toMatch(
      /author|administrator/i,
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    const emptyChat = -946006n;
    await configureChat(emptyChat);
    const empty = createHarness({ prisma, chatId: emptyChat });
    await empty.send(messageUpdate(emptyChat, AUTHOR_ID, "/plan_cancel"));
    expect(empty.countOf("sendMessage")).toBe(1);
    expect(keyboardButtons(empty.lastOf("sendMessage"))).toHaveLength(0);
  });

  it("rechecks a demoted administrator at apply without spending the token", async () => {
    const chatId = -946007n;
    let admin = true;
    const { harness, round } = await confirmed(chatId, {
      role: (_chat, actor) =>
        actor === ADMIN_ID && admin ? "administrator" : "member",
    });
    harness.reset();
    const { apply } = await openCancel(harness, chatId, ADMIN_ID);
    admin = false;
    harness.reset();
    await harness.send(callbackUpdate(chatId, ADMIN_ID, apply));
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toMatch(
      /author|administrator/i,
    );
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: apply },
        })
      ).consumedAt,
    ).toBeNull();
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
  });

  it("still corrects the second message and commits cancellation when the first edit fails", async () => {
    const chatId = -946008n;
    let brokenId: number | null = null;
    const { harness, round, answer } = await confirmed(chatId, {
      failEdit: (id) => id === brokenId,
    });
    await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
    const blocked = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    harness.reset();
    const { apply } = await openCancel(harness, chatId);
    brokenId = blocked.anchorMessageId;
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
    expect(harness.lastEditOf(blocked.anchorMessageId!)).toBeDefined();
    expectCancelled(harness.lastEditOf(blocked.announcementMessageId!));
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CANCELLED");
    expect(harness.lines().some((line) => line.level === 50)).toBe(true);
  });
});
