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

/** Rehearsal change message effects through the real update router and PostgreSQL. */

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

async function openChange(
  harness: ReturnType<typeof createHarness>,
  chatId: bigint,
  actorId = AUTHOR_ID,
) {
  await harness.send(messageUpdate(chatId, actorId, "/plan_change"));
  const confirmation =
    harness.lastOf("editMessageText") ?? harness.lastOf("sendMessage");
  expect(String(confirmation?.payload.text)).toMatch(/change/i);
  expect(keyboardButtons(confirmation)).toHaveLength(2);
  return {
    apply: await actionToken(confirmation, "change-apply"),
    keep: await actionToken(confirmation, "change-keep"),
  };
}

describe("same-week changes through Telegram", () => {
  it("produces the same replacement messages as replan on equivalent blocked rounds", async () => {
    const effects: unknown[] = [];
    for (const path of ["replan", "change"] as const) {
      const chatId = path === "replan" ? -947009n : -947010n;
      const { harness, round, answer } = await confirmed(chatId);
      await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
      const current = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      let token: string;
      if (path === "change") {
        harness.reset();
        token = (await openChange(harness, chatId)).apply;
      } else {
        token = await actionToken(
          harness.lastEditOf(current.announcementMessageId!) ??
            harness.lastOf("sendMessage"),
          "replan",
        );
      }
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
      effects.push(
        harness.calls
          .filter((call) =>
            ["editMessageText", "sendMessage"].includes(call.method),
          )
          .map((call) => ({
            method: call.method,
            messageId: call.payload.message_id,
            text: call.payload.text,
            labels: keyboardButtons(call).map((button) => button.text),
          })),
      );
      expect(
        (
          await prisma.planningRound.findUniqueOrThrow({
            where: { id: round.id },
          })
        ).status,
      ).toBe("SUPERSEDED");
    }
    expect(effects[0]).toEqual(effects[1]);
  });

  it.each(["DRAFT", "CONFIRMED", "BOOKED"] as const)(
    "replaces a %s attempt with a fresh same-week day selector",
    async (status) => {
      const chatId =
        status === "DRAFT"
          ? -947001n
          : status === "CONFIRMED"
            ? -947002n
            : -947003n;
      const base =
        status === "DRAFT" ? await fixture(chatId) : await confirmed(chatId);
      const { harness } = base;
      let old = await prisma.planningRound.findFirstOrThrow({
        where: { chatId },
      });
      if (status !== "DRAFT") {
        const cannot = tokenLabelled(
          harness.lastEditOf(old.anchorMessageId!),
          PLANNING_CANNOT_ATTEND_LABEL,
        );
        await harness.send(callbackUpdate(chatId, MEMBER_ID, cannot));
        old = await prisma.planningRound.findUniqueOrThrow({
          where: { id: old.id },
        });
        if (status === "BOOKED")
          old = await prisma.planningRound.update({
            where: { id: old.id },
            data: {
              status: "BOOKED",
              bookedAt: NOW,
              bookedByUserId: AUTHOR_ID,
            },
          });
      }
      harness.reset();
      const { apply } = await openChange(harness, chatId);
      expect(
        (
          await prisma.planningRound.findUniqueOrThrow({
            where: { id: old.id },
          })
        ).status,
      ).toBe(status);
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
      expect(harness.countOf("answerCallbackQuery")).toBe(1);
      expect(harness.countOf("sendMessage")).toBe(1);
      const successor = await prisma.planningRound.findFirstOrThrow({
        where: { chatId, status: "DRAFT" },
      });
      expect(successor.id).not.toBe(old.id);
      expect(successor.targetWeekStart).toBe(old.targetWeekStart);
      expect(successor.step).toBe("DAY");
      expect(successor.bookedAt).toBeNull();
      expect(successor.anchorMessageId).not.toBe(old.anchorMessageId);
      const prior = await prisma.planningRound.findUniqueOrThrow({
        where: { id: old.id },
      });
      expect(prior.status).toBe("SUPERSEDED");
      expect(prior.supersededByRoundId).toBe(successor.id);
      for (const id of [old.anchorMessageId, old.announcementMessageId])
        if (id !== null) {
          const terminal = harness.lastEditOf(id);
          expect(terminal).toBeDefined();
          expect(keyboardButtons(terminal)).toHaveLength(0);
          expect(String(terminal?.payload.text)).toMatch(
            /replanned|changed|replaced/i,
          );
        }
      const participants = await prisma.planningParticipant.findMany({
        where: { roundId: successor.id },
      });
      expect(participants).toHaveLength(2);
      expect(participants.every((p) => p.availability === null)).toBe(true);
      expect(
        keyboardButtons(harness.lastOf("sendMessage")).length,
      ).toBeGreaterThanOrEqual(7);
      await actionToken(harness.lastOf("sendMessage"), "change-request");
      await actionToken(harness.lastOf("sendMessage"), "cancel-request");
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
      expect(harness.countOf("sendMessage")).toBe(0);
      expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
    },
  );

  it.each(["blocked", "ready"] as const)(
    "declines change and restores both lifecycle controls plus the %s action",
    async (outcome) => {
      const chatId = outcome === "blocked" ? -947004n : -947005n;
      const { harness, round, answer } = await confirmed(chatId);
      if (outcome === "blocked")
        await harness.send(callbackUpdate(chatId, MEMBER_ID, answer));
      else {
        const available = tokenLabelled(
          harness.lastEditOf(round.anchorMessageId!),
          PLANNING_CAN_ATTEND_LABEL,
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
        await harness.send(callbackUpdate(chatId, MEMBER_ID, available));
      }
      const current = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      const visible =
        harness.lastEditOf(current.announcementMessageId!) ??
        harness.lastOf("sendMessage");
      const request = await actionToken(visible, "change-request");
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
      const apply = await actionToken(
        harness.lastEditOf(current.announcementMessageId!),
        "change-apply",
      );
      const keep = await actionToken(
        harness.lastEditOf(current.announcementMessageId!),
        "change-keep",
      );
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
      const restored = harness.lastEditOf(current.announcementMessageId!);
      for (const action of [
        "change-request",
        "cancel-request",
        outcome === "blocked" ? "replan" : "book-request",
      ])
        await actionToken(restored, action);
      expect(
        (
          await prisma.callbackAction.findUniqueOrThrow({
            where: { token: apply },
          })
        ).expiresAt.getTime(),
      ).toBeLessThanOrEqual(NOW.getTime());
      expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
      expect(harness.countOf("sendMessage")).toBe(0);
    },
  );

  it("refuses a non-author command and handles a chat with no changeable round", async () => {
    const chatId = -947006n;
    const { harness, round } = await confirmed(chatId);
    harness.reset();
    await harness.send(messageUpdate(chatId, MEMBER_ID, "/plan_change"));
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toMatch(
      /author|administrator/i,
    );
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    const emptyChat = -947007n;
    await configureChat(emptyChat);
    const empty = createHarness({ prisma, chatId: emptyChat });
    await empty.send(messageUpdate(emptyChat, AUTHOR_ID, "/plan_change"));
    expect(empty.countOf("sendMessage")).toBe(1);
    expect(keyboardButtons(empty.lastOf("sendMessage"))).toHaveLength(0);
  });

  it("refuses a demoted administrator's apply without consuming it", async () => {
    const chatId = -947008n;
    let admin = true;
    const { harness, round } = await confirmed(chatId, {
      role: (_chat, actor) =>
        actor === ADMIN_ID && admin ? "administrator" : "member",
    });
    harness.reset();
    const { apply } = await openChange(harness, chatId, ADMIN_ID);
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
});
