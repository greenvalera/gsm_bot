import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { PlanningService } from "../../src/domain/planning/planning-service.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import {
  PLANNING_REPLANNED_TEXT,
  PLANNING_ALREADY_CANCELLED,
} from "../../src/telegram/planning-handlers.js";
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
  beforeDelivery?: () => Promise<void>;
  failSend?: () => boolean;
}>;

function createHarness(options: HarnessOptions) {
  const calls: ApiCall[] = [];
  const messages = new Map<number, ApiCall>();
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
    if (method === "editMessageText" || method === "sendMessage")
      await options.beforeDelivery?.();
    if (method === "sendMessage" && options.failSend?.())
      throw Error("send failed");
    if (
      method === "editMessageText" &&
      options.failEdit?.(Number(payload.message_id))
    ) {
      throw new Error("Simulated Telegram edit outage");
    }
    if (method === "sendMessage") {
      nextMessageId += 1;
      sentMessageIds.push(nextMessageId);
      messages.set(nextMessageId, { method, payload });
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
    if (method === "editMessageText")
      messages.set(Number(payload.message_id), { method, payload });
    return { ok: true, result: true };
  }) as never);

  return {
    calls,
    messages,
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

let reviewChat = -950000n;
function expectRetired(message: ApiCall | undefined) {
  expect(message).toBeDefined();
  expect(String(message?.payload.text)).toContain("Earlier message");
  expect(String(message?.payload.text)).toContain("/plan_status");
  expect(String(message?.payload.text)).not.toMatch(
    /Ready to book|Everyone who was asked|This rehearsal is booked|This slot does not work/,
  );
  expect(keyboardButtons(message)).toHaveLength(0);
}

describe("displaced message history", () => {
  it("retires the ready announcement through command Keep and later blocking", async () => {
    const chatId = reviewChat--;
    const { harness, round, answer } = await confirmed(chatId);
    const available = tokenLabelled(
      harness.lastEditOf(round.anchorMessageId!),
      PLANNING_CAN_ATTEND_LABEL,
    );
    // Two participants: reversal first retracts to collecting, then reaches ready.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
    await harness.send(callbackUpdate(chatId, MEMBER_ID, available));
    // A status request beyond the cooldown recovers the announcement slot.
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { readyAnnouncedAt: new Date(NOW.getTime() - 31 * 60_000) },
    });
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_status"));
    const before = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(before.announcementMessageId).not.toBeNull();
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_cancel"));
    const keep = await actionToken(
      harness.lastOf("sendMessage"),
      "cancel-keep",
    );
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expectRetired(harness.messages.get(before.announcementMessageId!));
    expect(
      String(harness.messages.get(after.announcementMessageId!)?.payload.text),
    ).toContain("This slot does not work");
    expect(
      keyboardButtons(harness.messages.get(after.anchorMessageId!)).map(
        (b) => b.text,
      ),
    ).toEqual(
      expect.arrayContaining([
        PLANNING_CAN_ATTEND_LABEL,
        PLANNING_CANNOT_ATTEND_LABEL,
      ]),
    );
  });

  it.each(["change", "cancel"] as const)(
    "retires every displaced booked claim after command %s Apply",
    async (kind) => {
      const chatId = reviewChat--;
      const { harness, round } = await confirmed(chatId);
      const available = tokenLabelled(
        harness.lastEditOf(round.anchorMessageId!),
        PLANNING_CAN_ATTEND_LABEL,
      );
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
      await harness.send(callbackUpdate(chatId, MEMBER_ID, available));
      await harness.send(
        callbackUpdate(
          chatId,
          AUTHOR_ID,
          await actionToken(harness.lastOf("sendMessage"), "book-request"),
        ),
      );
      await harness.send(
        callbackUpdate(
          chatId,
          AUTHOR_ID,
          await actionToken(harness.lastOf("editMessageText"), "book-apply"),
        ),
      );
      const before = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      expect(before.status).toBe("BOOKED");
      await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_" + kind));
      const apply = await actionToken(
        harness.lastOf("sendMessage"),
        kind + "-apply",
      );
      const sends = harness.sentMessageIds.length;
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, apply));
      const after = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      expect(after.status).toBe(kind === "change" ? "SUPERSEDED" : "CANCELLED");
      expectRetired(harness.messages.get(before.announcementMessageId!));
      for (const id of [after.anchorMessageId!, after.announcementMessageId!]) {
        expect(String(harness.messages.get(id)?.payload.text)).toContain(
          kind === "change" ? "was replanned" : "was cancelled",
        );
        expect(keyboardButtons(harness.messages.get(id))).toHaveLength(0);
      }
      expect(harness.sentMessageIds.length).toBe(sends + 1);
      for (const message of harness.messages.values())
        expect(String(message.payload.text)).not.toContain(
          "This rehearsal is booked",
        );
      if (kind === "change") {
        const successor = await prisma.planningRound.findFirstOrThrow({
          where: { chatId, status: "DRAFT" },
        });
        expect(successor.targetWeekStart).toBe(before.targetWeekStart);
        expect(successor.bookedAt).toBeNull();
        expect(
          await prisma.planningParticipant.count({
            where: { roundId: successor.id, availability: { not: null } },
          }),
        ).toBe(0);
      }
    },
  );
});

describe("review lifecycle regressions", () => {
  it.each(["cancel", "change"] as const)(
    "preserves anchor answers after %s decline through cooldown recovery",
    async (kind) => {
      for (const outcome of ["ready", "blocked"] as const) {
        const chatId = reviewChat--,
          { harness, round, answer } = await confirmed(chatId);
        const available = tokenLabelled(
          harness.lastEditOf(round.anchorMessageId!),
          PLANNING_CAN_ATTEND_LABEL,
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
        await harness.send(
          callbackUpdate(
            chatId,
            MEMBER_ID,
            outcome === "ready" ? available : answer,
          ),
        );
        const current = await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        expect(current.announcementMessageId).toBeNull();
        expect(current.readyAnnouncedAt).not.toBeNull();
        const request = await actionToken(
          harness.lastEditOf(round.anchorMessageId!),
          kind + "-request",
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
        const keep = await actionToken(
          harness.lastEditOf(round.anchorMessageId!),
          kind + "-keep",
        );
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
        const labels = keyboardButtons(
          harness.lastEditOf(round.anchorMessageId!),
        ).map((b) => b.text);
        expect(labels).toContain(PLANNING_CAN_ATTEND_LABEL);
        expect(labels).toContain(PLANNING_CANNOT_ATTEND_LABEL);
      }
    },
  );
  it.each(["cancel", "change"] as const)(
    "explains every retained draft control after %s",
    async (kind) => {
      for (const target of [
        { action: "day", date: "2026-08-27" },
        { action: "time", startMinute: 900 },
        { action: "back" },
        { action: "confirm" },
      ] as const) {
        const chatId = reviewChat--,
          { harness, draft } = await fixture(chatId),
          token = createCallbackToken();
        await prisma.callbackAction.create({
          data: {
            token,
            kind: "PLANNING",
            chatId,
            actorUserId: AUTHOR_ID,
            targetId: createPlanningTarget({ ...target, roundId: draft.id }),
            expiresAt: new Date(NOW.getTime() + 600000),
          },
        });
        const service = new PlanningService(prisma);
        const request = await (kind === "cancel"
          ? service.cancelAction(draft.id, AUTHOR_ID, NOW, "member")
          : service.changeAction(draft.id, AUTHOR_ID, NOW, "member"));
        const offer = await (kind === "cancel"
          ? service.requestCancel(
              chatId,
              AUTHOR_ID,
              request!.token,
              NOW,
              async () => "member",
            )
          : service.requestChange(
              chatId,
              AUTHOR_ID,
              request!.token,
              NOW,
              async () => "member",
            ));
        if (offer.kind !== "offered") throw Error("offer");
        const apply = offer.actions.find(
          (a) => a.target.action === kind + "-apply",
        )!;
        await (kind === "cancel"
          ? service.applyCancel(
              chatId,
              AUTHOR_ID,
              apply.token,
              null,
              NOW,
              async () => "member",
            )
          : service.applyChange(
              chatId,
              AUTHOR_ID,
              apply.token,
              NOW,
              async () => "member",
            ));
        const before = await prisma.planningRound.findMany({
          where: { chatId },
          orderBy: { id: "asc" },
        });
        harness.reset();
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
        expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
          kind === "change"
            ? PLANNING_REPLANNED_TEXT
            : PLANNING_ALREADY_CANCELLED,
        );
        expect(
          await prisma.planningRound.findMany({
            where: { chatId },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
        expect(
          (await prisma.callbackAction.findUniqueOrThrow({ where: { token } }))
            .consumedAt,
        ).toBeNull();
        await prisma.callbackAction.update({
          where: { token },
          data: { consumedAt: NOW },
        });
        harness.reset();
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
        expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
          "Already applied.",
        );
        await prisma.callbackAction.update({
          where: { token },
          data: { consumedAt: null, expiresAt: NOW },
        });
        harness.reset();
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
        expect(harness.lastOf("answerCallbackQuery")?.payload.text).toBe(
          "This planning action is no longer available. Send /plan to start again.",
        );
        expect(harness.countOf("sendMessage")).toBe(0);
        expect(harness.countOf("editMessageText")).toBe(0);
        expect(
          await prisma.planningRound.findMany({
            where: { chatId },
            orderBy: { id: "asc" },
          }),
        ).toEqual(before);
      }
    },
  );
});

describe("reachable lifecycle confirmation and immediate acknowledgements", () => {
  it.each(["CONFIRMED", "BOOKED"] as const)(
    "keeps and applies a recovered inline change for %s after edit failure",
    async (status) => {
      for (const decision of ["keep", "apply"] as const) {
        let missingId: number | null = null;
        const chatId = reviewChat--;
        const { harness, round } = await confirmed(chatId, {
          failEdit: (id) => id === missingId,
        });
        if (status === "BOOKED") {
          const available = tokenLabelled(
            harness.lastEditOf(round.anchorMessageId!),
            PLANNING_CAN_ATTEND_LABEL,
          );
          await harness.send(callbackUpdate(chatId, AUTHOR_ID, available));
          await harness.send(callbackUpdate(chatId, MEMBER_ID, available));
          await prisma.planningRound.update({
            where: { id: round.id },
            data: {
              status: "BOOKED",
              bookedAt: NOW,
              bookedByUserId: AUTHOR_ID,
            },
          });
        }
        const before = await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        const participants = await prisma.planningParticipant.findMany({
          where: { roundId: round.id },
          orderBy: { id: "asc" },
        });
        missingId = before.announcementMessageId ?? before.anchorMessageId!;
        const request = await actionToken(
          harness.messages.get(missingId),
          "change-request",
        );
        harness.reset();
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
        expect(harness.calls[0]?.method).toBe("answerCallbackQuery");
        expect(harness.countOf("sendMessage")).toBe(1);
        const fresh = harness.lastOf("sendMessage");
        const recovered = await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        const newId =
          recovered.announcementMessageId ?? recovered.anchorMessageId!;
        expect(newId).not.toBe(missingId);
        expect(recovered.status).toBe(status);
        const token = await actionToken(fresh, "change-" + decision);
        harness.reset();
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
        const after = await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        if (decision === "keep") {
          expect(after.status).toBe(status);
          expect(after.bookedAt).toEqual(before.bookedAt);
          expect(
            await prisma.planningParticipant.findMany({
              where: { roundId: round.id },
              orderBy: { id: "asc" },
            }),
          ).toEqual(participants);
          await actionToken(harness.messages.get(newId), "change-request");
          expect(await prisma.planningRound.count({ where: { chatId } })).toBe(
            1,
          );
        } else {
          expect(after.status).toBe("SUPERSEDED");
          const successor = await prisma.planningRound.findFirstOrThrow({
            where: { chatId, status: "DRAFT" },
          });
          expect(successor.targetWeekStart).toBe(before.targetWeekStart);
          expect(successor.bookedAt).toBeNull();
          const lineup = await prisma.planningParticipant.findMany({
            where: { roundId: successor.id },
          });
          expect(lineup).toHaveLength(2);
          expect(lineup.every((p) => p.availability === null)).toBe(true);
          expect(keyboardButtons(harness.messages.get(newId))).toHaveLength(0);
          harness.reset();
          await harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
          expect(await prisma.planningRound.count({ where: { chatId } })).toBe(
            2,
          );
          expect(harness.countOf("sendMessage")).toBe(0);
        }
      }
    },
  );
  it.each(["cancel", "change"] as const)(
    "posts a tracked %s command confirmation at the bottom in both message slots",
    async (kind) => {
      for (const announcement of [false, true]) {
        const chatId = reviewChat--,
          { harness, round, answer } = await confirmed(chatId);
        if (announcement) {
          await harness.send(callbackUpdate(chatId, AUTHOR_ID, answer));
          await prisma.planningRound.update({
            where: { id: round.id },
            data: { status: "BOOKED" },
          });
        }
        const before = await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        harness.reset();
        await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_" + kind));
        const fresh = harness.lastOf("sendMessage");
        expect(fresh).toBeDefined();
        await actionToken(fresh, kind + "-apply");
        const current = await prisma.planningRound.findUniqueOrThrow({
            where: { id: round.id },
          }),
          oldId = before.announcementMessageId ?? before.anchorMessageId!;
        expect(
          announcement
            ? current.announcementMessageId
            : current.anchorMessageId,
        ).not.toBe(oldId);
        expect(
          announcement
            ? current.anchorMessageId
            : current.announcementMessageId,
        ).toBe(
          announcement ? before.anchorMessageId : before.announcementMessageId,
        );
        expect(keyboardButtons(harness.lastEditOf(oldId))).toHaveLength(0);
        const keep = await actionToken(fresh, kind + "-keep");
        await harness.send(callbackUpdate(chatId, AUTHOR_ID, keep));
        const restored = harness.lastEditOf(
          current.announcementMessageId ?? current.anchorMessageId!,
        );
        await actionToken(restored, kind + "-request");
      }
    },
  );
  it.each(["cancel", "change"] as const)(
    "recovers a deleted inline %s control with tracked fresh confirmation",
    async (kind) => {
      let missing = false;
      const chatId = reviewChat--,
        { harness, round } = await confirmed(chatId, {
          failEdit: () => missing,
        });
      const request = await actionToken(
        harness.lastEditOf(round.anchorMessageId!),
        kind + "-request",
      );
      missing = true;
      harness.reset();
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
      const fresh = harness.lastOf("sendMessage");
      await actionToken(fresh, kind + "-apply");
      expect(
        (
          await prisma.planningRound.findUniqueOrThrow({
            where: { id: round.id },
          })
        ).anchorMessageId,
      ).not.toBe(round.anchorMessageId);
    },
  );
  it.each(["cancel", "change"] as const)(
    "acknowledges every successful %s branch before deferred delivery",
    async (kind) => {
      let paused = false,
        release = () => {},
        entered = () => {};
      let waiting = Promise.resolve();
      const chatId = reviewChat--,
        { harness, round } = await confirmed(chatId, {
          beforeDelivery: async () => {
            if (paused) {
              entered();
              await waiting;
            }
          },
        });
      const run = async (token: string) => {
        let seen!: () => void;
        const started = new Promise<void>((r) => {
          seen = r;
        });
        entered = seen;
        waiting = new Promise<void>((r) => {
          release = r;
        });
        paused = true;
        harness.reset();
        const work = harness.send(callbackUpdate(chatId, AUTHOR_ID, token));
        await started;
        try {
          expect(harness.countOf("answerCallbackQuery")).toBe(1);
        } finally {
          paused = false;
          release();
          await work;
        }
        expect(harness.countOf("answerCallbackQuery")).toBe(1);
      };
      const request = await actionToken(
        harness.lastEditOf(round.anchorMessageId!),
        kind + "-request",
      );
      await run(request);
      const keep = await actionToken(
        harness.lastEditOf(round.anchorMessageId!),
        kind + "-keep",
      );
      await run(keep);
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, request));
      const apply = await actionToken(
        harness.lastEditOf(round.anchorMessageId!),
        kind + "-apply",
      );
      await run(apply);
    },
  );
});

describe("confirmation delivery compensation", () => {
  it.each(["cancel", "change"] as const)(
    "clears an untracked %s confirmation and gives recovery advice",
    async (kind) => {
      const chatId = reviewChat--,
        { harness, draft } = await fixture(chatId);
      harness.reset();
      const original = PlanningService.prototype.reanchorLifecycleConfirmation;
      const tracking = vi
        .spyOn(PlanningService.prototype, "reanchorLifecycleConfirmation")
        .mockImplementationOnce(async function (
          this: PlanningService,
          round,
          id,
        ) {
          await prisma.planningRound.update({
            where: { id: round.id },
            data: { revision: { increment: 1 } },
          });
          return original.call(this, round, id);
        });
      try {
        await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_" + kind));
      } finally {
        tracking.mockRestore();
      }
      expect(
        (
          await prisma.planningRound.findUniqueOrThrow({
            where: { id: draft.id },
          })
        ).anchorMessageId,
      ).toBe(draft.anchorMessageId);
      expect(String(harness.lastOf("sendMessage")?.payload.text)).toContain(
        "/plan_status",
      );
      const cleared = harness.lastOf("editMessageText");
      expect(String(cleared?.payload.text)).toContain("could not be opened");
      expect(keyboardButtons(cleared)).toHaveLength(0);
    },
  );
  it("reports failed delivery without moving the durable slot", async () => {
    let fail = false;
    const chatId = reviewChat--,
      { harness, draft } = await fixture(chatId, {
        failSend: () => {
          if (fail) {
            fail = false;
            return true;
          }
          return false;
        },
      });
    fail = true;
    harness.reset();
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_cancel"));
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).anchorMessageId,
    ).toBe(draft.anchorMessageId);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toContain(
      "/plan_status",
    );
    expect(keyboardButtons(harness.lastOf("sendMessage"))).toHaveLength(0);
  });
  it("guards lifecycle tracking by status, revision and both prior pointers", async () => {
    const chatId = reviewChat--,
      { draft } = await fixture(chatId),
      service = new PlanningService(prisma);
    for (const data of [
      { revision: { increment: 1 } },
      { anchorMessageId: 12345 },
      { status: "CANCELLED" as const },
    ]) {
      const before = await prisma.planningRound.findUniqueOrThrow({
        where: { id: draft.id },
      });
      await prisma.planningRound.update({ where: { id: draft.id }, data });
      expect(
        (await service.reanchorLifecycleConfirmation(before, 98765)).kind,
      ).toBe("stale");
    }
  });
});
