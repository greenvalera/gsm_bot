import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_BOOK_CONFIRM_LABEL,
  PLANNING_BOOK_KEEP_LABEL,
  PLANNING_BOOK_LABEL,
  PLANNING_CANNOT_ATTEND_LABEL,
  PLANNING_CAN_ATTEND_LABEL,
  PLANNING_CONFIRM_LABEL,
} from "../../src/telegram/keyboards.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { withPlanningRoundInterference } from "../helpers/racing-client.js";
import {
  PLANNING_REPLANNED_TEXT,
  PLANNING_ALREADY_CANCELLED,
} from "../../src/telegram/planning-handlers.js";
import { PLANNING_STALE_TEXT } from "../../src/telegram/callbacks.js";

/**
 * LIFE-01 and D-13 / D-14 / D-16 / D-19, against real PostgreSQL.
 *
 * Booking is the one irreversible transition Phase 3 ships, and every guarantee
 * it needs is a DATABASE guarantee: the token is consumed exactly once, the
 * round moves under a revision guard, unanimity is re-derived from the
 * participant rows inside the apply transaction, and every refusal is read-only
 * so a refused tap leaves the control spendable. None of that is observable
 * through a service double, so every assertion below reads the database back.
 *
 * The role gateway is a FUNCTION of the actor throughout, because "eligible
 * when the confirmation was opened, demoted when it was confirmed" is not
 * expressible any other way — and that demotion is exactly threat T-03-32.
 */

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

function labelsOf(call: ApiCall | undefined) {
  return keyboardButtons(call).map((button) => button.text);
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

describe("replan through Telegram", () => {
  it("leaves a terminal old card and posts a fresh anchored day selector", async () => {
    const chatId = -945001n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: AUTHOR_ID, firstName: "Ada" },
      { id: MEMBER_ID, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));
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
        tokenLabelled(
          harness.lastOf("editMessageText"),
          PLANNING_CONFIRM_LABEL,
        ),
      ),
    );
    const answer = tokenLabelled(
      harness.lastOf("editMessageText"),
      PLANNING_CANNOT_ATTEND_LABEL,
    );
    await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
    const old = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    const booking = await new PlanningService(prisma).mintBookingRequestAction(
      prisma,
      old,
      NOW,
    );
    const replan = tokenLabelled(
      harness.lastEditOf(old.anchorMessageId!),
      "↻ Replan",
    );
    await harness.send(callbackUpdate(chatId, MEMBER_ID, replan));
    expect(harness.lastOf("answerCallbackQuery")?.payload.text).toContain(
      "planning author",
    );
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, replan));
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    const terminal = harness.lastEditOf(old.anchorMessageId!);
    expect(terminal?.payload.text).toContain("was replanned");
    expect(terminal?.payload.reply_markup).toBeUndefined();
    const successor = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    expect(successor.anchorMessageId).not.toBe(old.anchorMessageId);
    expect(harness.lastOf("sendMessage")?.payload.text).toContain("Planned by");
    expect(
      keyboardButtons(harness.lastOf("sendMessage")).length,
    ).toBeGreaterThanOrEqual(7);
    // The pre-snapshot must not cause duplicate participants when confirmed.
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
        tokenLabelled(
          harness.lastOf("editMessageText"),
          PLANNING_CONFIRM_LABEL,
        ),
      ),
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: successor.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    expect(
      await prisma.planningParticipant.count({
        where: { roundId: successor.id },
      }),
    ).toBe(2);
    const successorParticipants = await prisma.planningParticipant.findMany({
      where: { roundId: successor.id },
      orderBy: { telegramUserId: "asc" },
    });
    for (const token of [answer, booking.token]) {
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
      expect(harness.countOf("answerCallbackQuery")).toBe(1);
      expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
        PLANNING_REPLANNED_TEXT,
      );
      expect(harness.countOf("editMessageText")).toBe(0);
    }
    await prisma.planningRound.update({
      where: { id: old.id },
      data: { status: "CANCELLED" },
    });
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
    expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
      PLANNING_ALREADY_CANCELLED,
    );
    await prisma.planningRound.update({
      where: { id: old.id },
      data: { status: "SUPERSEDED" },
    });
    await prisma.callbackAction.update({
      where: { token: answer },
      data: { expiresAt: NOW },
    });
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
      PLANNING_STALE_TEXT,
    );
    expect(
      await prisma.planningParticipant.findMany({
        where: { roundId: successor.id },
        orderBy: { telegramUserId: "asc" },
      }),
    ).toEqual(successorParticipants);
  });
});
