import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import {
  PLANNING_STATUS_COOLDOWN_MS,
  PlanningService,
  RECOVERABLE_ROUND_STATUSES,
} from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_CANNOT_ATTEND_LABEL,
  PLANNING_CAN_ATTEND_LABEL,
  PLANNING_CONFIRM_LABEL,
} from "../../src/telegram/keyboards.js";
import {
  PLANNING_NOT_CONFIGURED,
  PLANNING_NO_ACTIVE_ROUND,
  PLANNING_STATUS_DENIAL,
} from "../../src/telegram/planning-handlers.js";
import {
  createChatConfiguration,
  createClock,
} from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { withDirectPlanningRoundInterference } from "../helpers/racing-client.js";

/**
 * REQ-PLAN-10 and REQ-RELI-01, against real PostgreSQL.
 *
 * Both requirements are claims about DURABILITY, so every assertion is made
 * against the database or against a second composition root reading it — never
 * against an in-memory service object, which would pass whether or not a single
 * byte had been persisted.
 *
 * D-14 (the re-post) and D-15 (anyone may ask) are the two halves of "recover
 * the active interaction": the card comes back to the bottom of the chat where
 * people are actually looking, and it comes back for whoever asked, while its
 * buttons still answer only to the author.
 */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

/** Wednesday 2026-08-26, 12:00 in Europe/Kyiv; the chat-local Monday is 2026-08-24. */
const NOW = new Date("2026-08-26T09:00:00.000Z");
const CURRENT_WEEK = "2026-08-24";

const AUTHOR_ID = 8301n;
const OTHER_ID = 8302n;

type ApiCall = Readonly<{ method: string; payload: Record<string, unknown> }>;

type Keyboard = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

let postgres: PostgresTestContainer;
let prisma: PrismaClient;
const openClients: PrismaClient[] = [];

/** A fresh composition root's client. RELI-01 is only provable across two. */
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
  firstMessageId?: number;
  /**
   * Runs while a Telegram call is in flight, before its result is handed back.
   *
   * The seam for a CONCURRENT writer: a hook that commits during `sendMessage`
   * lands between the post and the re-anchor exactly as a second process would,
   * so the revision race can be lost for real rather than by stubbing the
   * service into reporting that it was.
   */
  onCall?: (call: ApiCall) => Promise<void>;
}>;

function createHarness(options: HarnessOptions) {
  const calls: ApiCall[] = [];
  const capture = createCapturingLogger();
  let nextMessageId = options.firstMessageId ?? 900;

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
    await options.onCall?.({ method, payload });
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
    allOf(method: string) {
      return calls.filter((call) => call.method === method);
    },
    lastOf(method: string) {
      return [...calls].reverse().find((call) => call.method === method);
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
      chat_instance: "planning-recovery",
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

async function configureChat(
  client: PrismaClient,
  chatId: bigint,
  overrides = {},
) {
  await client.chatConfiguration.create({
    data: { chatId, ...createChatConfiguration(overrides) },
  });
}

/** One active roster member, so the review card and Confirm have a lineup. */
async function addMember(
  client: PrismaClient,
  chatId: bigint,
  telegramUserId: bigint,
) {
  await client.telegramUser.upsert({
    where: { telegramUserId },
    create: { telegramUserId, firstName: "Member" },
    update: {},
  });
  await client.chatMembership.create({
    data: { chatId, telegramUserId, activeAt: NOW, deactivatedAt: null },
  });
}

describe("bringing the live card back to the bottom of the chat (D-14)", () => {
  it("posts a new card, re-anchors to it, and stops the old one being live", async () => {
    const chatId = -1008000000001n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(2001, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Thu 27");
    await harness.send(callbackUpdate(2002, chatId, AUTHOR_ID, dayToken));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(before.step).toBe("TIME");
    expect(before.lastStatusPostedAt).toBeNull();
    const previousAnchor = before.anchorMessageId;
    expect(previousAnchor).not.toBeNull();
    harness.reset();

    await harness.send(messageUpdate(2003, chatId, AUTHOR_ID, "/plan_status"));

    // Exactly one NEW message at the bottom of the chat.
    expect(harness.countOf("sendMessage")).toBe(1);
    const posted = harness.lastOf("sendMessage");

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.anchorMessageId).not.toBe(previousAnchor);
    expect(after.lastStatusPostedAt).not.toBeNull();
    expect(after.status).toBe("DRAFT");

    // The superseded card is edited to drop its keyboard, which is what makes
    // its still-unconsumed tokens unreachable from any on-screen surface.
    const cleared = harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === previousAnchor);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.payload.reply_markup).toBeUndefined();

    // The re-posted card is the LIVE state: still the time step, still the day
    // the author chose.
    expect(posted?.payload.text).toContain("Thu 27 Aug");
    expect(labelsOf(posted)).toContain("Back");
    expect(labelsOf(posted).some((label) => label.endsWith("15:00"))).toBe(
      true,
    );
  });

  it("leaves ONE live card when the re-anchor loses its revision race", async () => {
    // WR-02. The post committed, the anchor write did not. Returning here left
    // two pressable keyboards in the chat with `anchorMessageId` still naming
    // the OLD message, so a tap on the new card edited a message far up the
    // chat and the card the author was looking at never changed.
    const chatId = -1008000000021n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    let armed = false;
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      // A concurrent writer landing between the post and the re-anchor, which
      // is precisely what makes the guard fail. Nothing is stubbed: the real
      // `updateMany` runs and matches no row.
      onCall: async (call) => {
        if (!armed || call.method !== "sendMessage") return;
        armed = false;
        await prisma.planningRound.updateMany({
          where: { chatId, status: "DRAFT" },
          data: { revision: { increment: 1 } },
        });
      },
    });

    await harness.send(messageUpdate(2601, chatId, AUTHOR_ID, "/plan"));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    const previousAnchor = before.anchorMessageId;
    expect(previousAnchor).not.toBeNull();
    armed = true;
    harness.reset();

    await harness.send(messageUpdate(2602, chatId, AUTHOR_ID, "/plan_status"));

    // The anchor did NOT move: the old card is still the round's card.
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.anchorMessageId).toBe(previousAnchor);
    expect(
      harness.lines().some((line) => line.outcome === "anchor-not-recorded"),
    ).toBe(true);

    // And the card that was just posted is no longer pressable, so the chat is
    // left with exactly one live keyboard rather than two.
    const stripped = harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id !== previousAnchor);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.payload.reply_markup).toBeUndefined();
    // The old card is untouched — it is still the anchor and still current.
    expect(
      harness
        .allOf("editMessageText")
        .filter((call) => call.payload.message_id === previousAnchor),
    ).toHaveLength(0);
  });

  it("strips a repost superseded between delivery and re-anchoring", async () => {
    const chatId = -1008000000034n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const round = await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: AUTHOR_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: CURRENT_WEEK,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        anchorMessageId: null,
        lastActivityAt: NOW,
      },
    });
    const service = new PlanningService(prisma);
    let armed = true;
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      firstMessageId: 9100,
      onCall: async (call) => {
        if (!armed || call.method !== "sendMessage") return;
        armed = false;
        expect(
          await service.supersedeStaleRounds(
            chatId,
            new Date("2026-08-31T00:00:00.000Z"),
          ),
        ).toBe(1);
      },
    });

    await harness.send(messageUpdate(3401, chatId, OTHER_ID, "/plan_status"));

    const superseded = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.revision).toBe(round.revision + 1);
    expect(superseded.anchorMessageId).toBeNull();
    expect(
      harness.lines().some((line) => line.outcome === "anchor-not-recorded"),
    ).toBe(true);

    const posted = harness.lastOf("sendMessage");
    expect(keyboardButtons(posted).length).toBeGreaterThan(0);
    const stripped = harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === 9101);
    expect(stripped).toHaveLength(1);
    expect(stripped[0]?.payload.reply_markup).toBeUndefined();
  });

  it("writes the new anchor and the cooldown stamp or neither", async () => {
    // The atomicity that keeps the flood vector closed: an anchor persisted
    // without its cooldown stamp would let the next request re-post instantly.
    const chatId = -1008000000002n;
    await configureChat(prisma, chatId);
    const round = await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: AUTHOR_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: CURRENT_WEEK,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        anchorMessageId: 100,
        lastActivityAt: NOW,
      },
    });

    const failing = new PlanningService({
      planningRound: {
        updateMany: async () => {
          throw new Error("connection lost mid-transaction");
        },
      },
    } as never);
    const result = await failing.reanchor(
      round.id,
      555,
      round.revision,
      NOW,
      true,
    );

    expect(result.kind).toBe("failed");
    const unchanged = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(unchanged.anchorMessageId).toBe(100);
    expect(unchanged.lastStatusPostedAt).toBeNull();
    expect(unchanged.revision).toBe(round.revision);
  });
});

describe("anyone may ask, only the author may act (D-15 + D-02)", () => {
  it("re-anchors for a non-author, whose tap on that same card is then refused", async () => {
    const chatId = -1008000000003n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(2101, chatId, AUTHOR_ID, "/plan"));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(messageUpdate(2102, chatId, OTHER_ID, "/plan_status"));

    expect(harness.countOf("sendMessage")).toBe(1);
    const posted = harness.lastOf("sendMessage");
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.anchorMessageId).not.toBe(before.anchorMessageId);
    // Visibility for all — the round still belongs to its author.
    expect(after.authorUserId).toBe(AUTHOR_ID);

    const dayToken = tokenLabelled(posted, "Thu 27");
    harness.reset();
    await harness.send(callbackUpdate(2103, chatId, OTHER_ID, dayToken));

    // Control for one.
    const answer = harness.lastOf("answerCallbackQuery");
    expect(answer?.payload.show_alert).toBe(true);
    expect(String(answer?.payload.text)).toContain(
      "can use this card's buttons",
    );
    const untouched = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(untouched.step).toBe("DAY");
    expect(untouched.selectedDate).toBeNull();
  });

  it("does not postpone takeover when the requester is not the author", async () => {
    // D-15 opens the status request to everyone, and AUTH-03 measures
    // abandonment by the AUTHOR's silence. If a bystander's request refreshed
    // `lastActivityAt`, any member could hold an abandoned round open forever
    // and administrator takeover would be unreachable.
    const chatId = -1008000000004n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await harness.send(messageUpdate(2201, chatId, AUTHOR_ID, "/plan"));
    const started = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    const authorLastActive = started.lastActivityAt;

    clock.advance(20 * 60 * 1000);
    await harness.send(messageUpdate(2202, chatId, OTHER_ID, "/plan_status"));

    const afterBystander = await prisma.planningRound.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect(afterBystander.lastActivityAt.getTime()).toBe(
      authorLastActive.getTime(),
    );

    // The author's own request DOES refresh it — they are demonstrably present.
    clock.advance(PLANNING_STATUS_COOLDOWN_MS + 1000);
    await harness.send(messageUpdate(2203, chatId, AUTHOR_ID, "/plan_status"));
    const afterAuthor = await prisma.planningRound.findUniqueOrThrow({
      where: { id: started.id },
    });
    expect(afterAuthor.lastActivityAt.getTime()).toBeGreaterThan(
      authorLastActive.getTime(),
    );
  });
});

describe("the status re-post cooldown (PLAN-10)", () => {
  it("refuses a second request inside the window and allows the next one after it", async () => {
    const chatId = -1008000000005n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await harness.send(messageUpdate(2301, chatId, AUTHOR_ID, "/plan"));
    await harness.send(messageUpdate(2302, chatId, OTHER_ID, "/plan_status"));
    const afterFirst = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    clock.advance(PLANNING_STATUS_COOLDOWN_MS - 1);
    await harness.send(messageUpdate(2303, chatId, OTHER_ID, "/plan_status"));

    // NOTHING reaches the chat — not a card, and not a "please wait" reply
    // either. A refusal that posted its own message would be the very flood it
    // exists to stop, and the card the requester asked for is already at the
    // bottom of the chat, seconds old.
    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.calls).toHaveLength(0);
    const refused = await prisma.planningRound.findUniqueOrThrow({
      where: { id: afterFirst.id },
    });
    expect(refused.anchorMessageId).toBe(afterFirst.anchorMessageId);
    expect(refused.lastStatusPostedAt?.getTime()).toBe(
      afterFirst.lastStatusPostedAt?.getTime(),
    );
    // Silent in the chat by design; NEVER silent in the logs (finding F-4).
    const cooling = harness
      .lines()
      .filter((line) => line.outcome === "status-cooling-down");
    expect(cooling).toHaveLength(1);
    expect(typeof cooling[0]?.reason).toBe("string");
    expect((cooling[0]?.reason as string).length).toBeGreaterThan(0);
    expect(cooling[0]?.roundId).toBe(afterFirst.id);

    harness.reset();
    clock.advance(1);
    await harness.send(messageUpdate(2304, chatId, OTHER_ID, "/plan_status"));
    expect(harness.countOf("sendMessage")).toBe(1);
    const allowed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: afterFirst.id },
    });
    expect(allowed.anchorMessageId).not.toBe(afterFirst.anchorMessageId);
  });

  it("resolves two concurrent requests to exactly one new anchor", async () => {
    const chatId = -1008000000006n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(2401, chatId, AUTHOR_ID, "/plan"));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    // The durable guarantee, proved WITHOUT relying on update ordering: two
    // independent composition roots race the same cooldown against the same
    // row, so nothing in one process's memory can be what decides it.
    const left = new PlanningService(connect());
    const right = new PlanningService(connect());
    const outcomes = await Promise.all([
      left.status(chatId, AUTHOR_ID, NOW),
      right.status(chatId, OTHER_ID, NOW),
    ]);
    const kinds = outcomes.map((outcome) => outcome.kind).sort();
    expect(kinds).toEqual(["cooling-down", "live"]);

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.lastStatusPostedAt).not.toBeNull();
    // And exactly one message names the anchor afterwards.
    expect(after.anchorMessageId).toBe(before.anchorMessageId);
  });

  it("produces at most one new card when two updates arrive together", async () => {
    const chatId = -1008000000007n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(2501, chatId, AUTHOR_ID, "/plan"));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await Promise.all([
      harness.send(messageUpdate(2502, chatId, AUTHOR_ID, "/plan_status")),
      harness.send(messageUpdate(2503, chatId, OTHER_ID, "/plan_status")),
    ]);

    expect(harness.countOf("sendMessage")).toBeLessThanOrEqual(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    // Exactly one live anchor at all times.
    const anchors = new Set([after.anchorMessageId]);
    expect(anchors.size).toBe(1);
    expect(after.anchorMessageId).not.toBeNull();
  });
});

describe("surviving a redeploy mid-wizard (RELI-01)", () => {
  it("keeps a draft current until Monday in its snapshotted timezone", async () => {
    const chatId = -1008000000025n;
    const sundayInHonolulu = new Date("2026-08-31T09:30:00.000Z");
    await configureChat(prisma, chatId, {
      timezone: "Pacific/Honolulu",
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const service = new PlanningService(prisma);
    const started = await service.startOrResume(
      chatId,
      AUTHOR_ID,
      sundayInHonolulu,
    );
    expect(started.kind).toBe("started");
    if (started.kind !== "started") throw new Error("Expected a new round");
    expect(started.round.targetWeekStart).toBe("2026-08-24");

    await prisma.chatConfiguration.update({
      where: { chatId },
      data: { timezone: "Pacific/Kiritimati" },
    });

    expect(await service.supersedeStaleRounds(chatId, sundayInHonolulu)).toBe(
      0,
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: started.round.id },
        })
      ).status,
    ).toBe("DRAFT");

    const mondayInHonolulu = new Date("2026-08-31T10:00:00.000Z");
    expect(await service.supersedeStaleRounds(chatId, mondayInHonolulu)).toBe(
      1,
    );
    const superseded = await prisma.planningRound.findUniqueOrThrow({
      where: { id: started.round.id },
    });
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.revision).toBe(started.round.revision + 1);
  });

  it("still supersedes when a concurrent revision update wins after the stale read", async () => {
    const chatId = -1008000000038n;
    const round = await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: AUTHOR_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: CURRENT_WEEK,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        anchorMessageId: 100,
        lastActivityAt: NOW,
      },
    });
    const competingClient = connect();
    const reapingClient = withDirectPlanningRoundInterference(
      connect(),
      async () => {
        // This independent session commits after the reaper's findMany and
        // before its updateMany, reproducing the revision-only race exactly.
        await competingClient.planningRound.update({
          where: { id: round.id },
          data: { anchorMessageId: 101, revision: { increment: 1 } },
        });
      },
    );

    const supersededCount = await new PlanningService(
      reapingClient,
    ).supersedeStaleRounds(chatId, new Date("2026-08-31T00:00:00.000Z"));

    expect(supersededCount).toBe(1);
    const superseded = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(superseded.status).toBe("SUPERSEDED");
    expect(superseded.activeWeekStart).toBeNull();
    expect(superseded.anchorMessageId).toBe(101);
    // One increment from the winning concurrent write, one from supersession
    // to invalidate any other operation that observed either draft revision.
    expect(superseded.revision).toBe(round.revision + 2);
  });

  it("resumes the exact step and both selections from a fresh composition root", async () => {
    const chatId = -1008000000008n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const clock = createClock(NOW);
    const first = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await first.send(messageUpdate(2601, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(first.lastOf("sendMessage"), "Thu 27");
    await first.send(callbackUpdate(2602, chatId, AUTHOR_ID, dayToken));
    const slotToken = tokenLabelled(first.lastOf("editMessageText"), "15:00");
    await first.send(callbackUpdate(2603, chatId, AUTHOR_ID, slotToken));

    const persisted = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(persisted.step).toBe("REVIEW");
    expect(persisted.selectedDate).toBe("2026-08-27");
    expect(persisted.selectedStartMinute).toBe(900);

    // The redeploy: a brand-new client, a brand-new bot, nothing shared but the
    // database.
    clock.advance(PLANNING_STATUS_COOLDOWN_MS + 1000);
    const second = createHarness({
      prisma: connect(),
      chatId,
      role: () => "member",
      now: clock.now,
      firstMessageId: 5000,
    });
    await second.send(messageUpdate(2604, chatId, AUTHOR_ID, "/plan_status"));

    const resumed = second.lastOf("sendMessage");
    expect(resumed).toBeDefined();
    // The exact step: a review card, showing the exact day and the exact hour.
    expect(resumed?.payload.text).toContain("Thu 27 Aug");
    expect(resumed?.payload.text).toContain("15:00");
    expect(labelsOf(resumed)).toContain("Confirm rehearsal");

    // And the resumed card is live: Back on it moves the SAME round.
    const backToken = tokenLabelled(resumed, "Back");
    await second.send(callbackUpdate(2605, chatId, AUTHOR_ID, backToken));
    const moved = await prisma.planningRound.findUniqueOrThrow({
      where: { id: persisted.id },
    });
    expect(moved.step).toBe("TIME");
    expect(moved.selectedStartMinute).toBe(900);
  });

  it("resumes and re-anchors on /plan rather than starting a second round", async () => {
    const chatId = -1008000000009n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await harness.send(messageUpdate(2701, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Thu 27");
    await harness.send(callbackUpdate(2702, chatId, AUTHOR_ID, dayToken));
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    clock.advance(60 * 1000);
    await harness.send(messageUpdate(2703, chatId, AUTHOR_ID, "/plan"));

    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    // Pitfall 6: the target week is never recomputed for a live round.
    expect(after.targetWeekStart).toBe(before.targetWeekStart);
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-27");
    // D-14: it came back at the bottom, and the old card stopped being live.
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(after.anchorMessageId).not.toBe(before.anchorMessageId);
    const cleared = harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === before.anchorMessageId);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.payload.reply_markup).toBeUndefined();
  });
});

describe("asking when there is nothing to show", () => {
  it("says so and writes nothing when the chat has no live round", async () => {
    const chatId = -1008000000010n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(2801, chatId, OTHER_ID, "/plan_status"));

    expect(harness.countOf("sendMessage")).toBe(1);
    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NO_ACTIVE_ROUND,
    );
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(0);
    expect(
      harness.lines().some((line) => line.outcome === "no-active-round"),
    ).toBe(true);
  });

  it("points an unconfigured chat at the setup flow", async () => {
    const chatId = -1008000000011n;
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(2901, chatId, OTHER_ID, "/plan_status"));

    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NOT_CONFIGURED,
    );
    expect(
      harness.lines().some((line) => line.outcome === "chat-not-configured"),
    ).toBe(true);
  });

  it("rate-limits the no-round reply, which no round can hold a cooldown for", async () => {
    // WR-04. `PlanningRound.lastStatusPostedAt` can only cover a chat that HAS
    // a round, so the common state — no draft open, D-15 admitting every member
    // — posted one message per request with nothing rating it. Telegram answers
    // that with a 429 against the whole bot.
    const chatId = -1008000000022n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await harness.send(messageUpdate(3201, chatId, OTHER_ID, "/plan_status"));
    clock.advance(PLANNING_STATUS_COOLDOWN_MS - 1);
    await harness.send(messageUpdate(3202, chatId, AUTHOR_ID, "/plan_status"));

    // One message in the chat for two requests — and BOTH requests are in the
    // logs, because the reply is what floods, not the line (finding F-4).
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NO_ACTIVE_ROUND,
    );
    expect(
      harness.lines().filter((line) => line.outcome === "no-active-round"),
    ).toHaveLength(2);

    // The window is a window, not a mute: it reopens.
    clock.advance(1);
    await harness.send(messageUpdate(3203, chatId, OTHER_ID, "/plan_status"));
    expect(harness.countOf("sendMessage")).toBe(2);
  });

  it("rate-limits the unconfigured reply too, with no configuration row to hang it on", async () => {
    // The hardest branch: there is no `ChatConfiguration` at all, so the
    // cooldown cannot live beside the settings either.
    const chatId = -1008000000023n;
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
      now: clock.now,
    });

    await harness.send(messageUpdate(3301, chatId, OTHER_ID, "/plan_status"));
    clock.advance(1000);
    await harness.send(messageUpdate(3302, chatId, AUTHOR_ID, "/plan_status"));

    expect(harness.countOf("sendMessage")).toBe(1);
    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NOT_CONFIGURED,
    );
    expect(
      harness.lines().filter((line) => line.outcome === "chat-not-configured"),
    ).toHaveLength(2);
  });

  it("claims the roundless window durably, across composition roots", async () => {
    // The claim is a compare-and-set at the database, not a value in one
    // process's memory: two independent services race the same row and exactly
    // one of them may speak.
    const chatId = -1008000000024n;
    const outcomes = await Promise.all([
      new PlanningService(connect()).claimRoundlessStatusReply(chatId, NOW),
      new PlanningService(connect()).claimRoundlessStatusReply(chatId, NOW),
    ]);

    expect([...outcomes].sort()).toEqual([false, true]);
    expect(
      (
        await prisma.chatStatusCooldown.findUniqueOrThrow({
          where: { chatId },
        })
      ).lastPostedAt.getTime(),
    ).toBe(NOW.getTime());
  });

  it("fails closed when the membership lookup cannot be answered", async () => {
    const chatId = -1008000000012n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, roleThrows: true });

    await harness.send(messageUpdate(3001, chatId, OTHER_ID, "/plan_status"));

    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_STATUS_DENIAL,
    );
    const denied = harness
      .lines()
      .filter(
        (line) =>
          line.route === "command:plan_status" && line.outcome === "denied",
      );
    expect(denied).toHaveLength(1);
    // The caught value is bound under `err`, the only key the redactor renders.
    const failure = harness
      .lines()
      .find((line) => line.outcome === "membership-lookup-unavailable");
    expect(failure).toBeDefined();
    expect(failure?.err).toBeDefined();
  });
});

describe("the status command does not collide with /plan", () => {
  it("routes /plan_status to the status surface, never to /plan", async () => {
    // grammY matches a command by its whole token, but the two commands share a
    // prefix and are registered on the same bot, so the separation is asserted
    // rather than assumed: `/plan_status` on a chat with NO round must answer
    // the status copy, not start one.
    const chatId = -1008000000013n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(3101, chatId, AUTHOR_ID, "/plan_status"));

    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NO_ACTIVE_ROUND,
    );
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(0);
    expect(harness.lines().some((line) => line.route === "command:plan")).toBe(
      false,
    );
  });
});

/**
 * D-03: the status re-post is the recovery path for a round that has LEFT the
 * wizard, and it was unreachable while `status()` and `reanchor()` both admitted
 * DRAFT rounds only. Both had to widen — either one alone leaves the path dead,
 * so both are asserted separately here.
 */
describe("recovering a round that has left the wizard (D-03)", () => {
  /** Drives the real wizard to Confirm, which publishes the availability card. */
  async function reachAvailability(chatId: bigint, actorId: bigint) {
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(4001, chatId, actorId, "/plan"));
    await harness.send(
      callbackUpdate(
        4002,
        chatId,
        actorId,
        tokenLabelled(harness.lastOf("sendMessage"), "Thu 27"),
      ),
    );
    await harness.send(
      callbackUpdate(
        4003,
        chatId,
        actorId,
        tokenLabelled(harness.lastOf("editMessageText"), "15:00"),
      ),
    );
    await harness.send(
      callbackUpdate(
        4004,
        chatId,
        actorId,
        tokenLabelled(
          harness.lastOf("editMessageText"),
          PLANNING_CONFIRM_LABEL,
        ),
      ),
    );
    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(round.status).toBe("CONFIRMED");
    return { harness, round };
  }

  /**
   * The round's LIVE answer capabilities, counted at the database.
   *
   * Matched on the two exact serialized targets `mintAvailabilityActions`
   * writes, rather than on a `contains` of the round id: the wizard mints a
   * token per day, per hour, and per trailing control against the same round, so
   * a substring count answers twenty-two and would report "unchanged" just as
   * happily if the re-post had minted a third ANSWER row and consumed nothing.
   * The number under test is how many buttons can write to this round (T-03-18),
   * and that number is two.
   */
  const actionsFor = (roundId: string) =>
    prisma.callbackAction.count({
      where: {
        consumedAt: null,
        targetId: {
          in: (["AVAILABLE", "UNAVAILABLE"] as const).map((answer) =>
            JSON.stringify({ action: "answer", roundId, answer }),
          ),
        },
      },
    });

  it("SITE :1774 — re-posts the live availability card with both answer controls", async () => {
    const chatId = -1008000000031n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    await addMember(prisma, chatId, OTHER_ID);
    const { harness, round } = await reachAvailability(chatId, AUTHOR_ID);
    harness.reset();

    await harness.send(messageUpdate(4005, chatId, OTHER_ID, "/plan_status"));

    // Not the no-active-round reply, and not the wizard's review card: the card
    // the band is actually looking at.
    const posted = harness.lastOf("sendMessage");
    expect(posted?.payload.text).not.toBe(PLANNING_NO_ACTIVE_ROUND);
    expect(posted?.payload.text).toContain("Answered 0 of 2");
    expect(labelsOf(posted)).toEqual([
      PLANNING_CAN_ATTEND_LABEL,
      PLANNING_CANNOT_ATTEND_LABEL,
    ]);
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).anchorMessageId,
    ).not.toBe(round.anchorMessageId);
  });

  it("SITE :1774 — reuses the round's existing answer tokens rather than minting more", async () => {
    // T-03-18. `/plan_status` is open to every member of the chat, so a re-post
    // that MINTED would let anyone inflate the number of live write
    // capabilities for one round without limit. Load, never mint.
    const chatId = -1008000000032n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round } = await reachAvailability(chatId, AUTHOR_ID);
    const before = await actionsFor(round.id);
    expect(before).toBe(2);
    harness.reset();

    await harness.send(messageUpdate(4006, chatId, AUTHOR_ID, "/plan_status"));

    expect(await actionsFor(round.id)).toBe(before);

    // And the token on the RE-POSTED keyboard still answers — proving the
    // keyboard carries a live capability rather than a freshly minted one.
    const reposted = tokenLabelled(
      harness.lastOf("sendMessage"),
      PLANNING_CAN_ATTEND_LABEL,
    );
    await harness.send(callbackUpdate(4007, chatId, AUTHOR_ID, reposted));

    expect(
      await prisma.planningParticipant.findFirstOrThrow({
        where: { roundId: round.id, telegramUserId: AUTHOR_ID },
      }),
    ).toMatchObject({ availability: "AVAILABLE" });
    expect(await actionsFor(round.id)).toBe(before);
  });

  it("SITE :1774 — re-posts a booked round as a control-free summary (D-16)", async () => {
    const chatId = -1008000000033n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round } = await reachAvailability(chatId, AUTHOR_ID);
    // Nothing in the codebase writes BOOKED until plan 03-05, so the position is
    // seeded directly.
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { status: "BOOKED", bookedAt: NOW, bookedByUserId: AUTHOR_ID },
    });
    harness.reset();

    await harness.send(messageUpdate(4008, chatId, AUTHOR_ID, "/plan_status"));

    const posted = harness.lastOf("sendMessage");
    expect(posted).toBeDefined();
    expect(posted?.payload.text).not.toBe(PLANNING_NO_ACTIVE_ROUND);
    // Not an empty keyboard — no keyboard at all. An empty grammY
    // InlineKeyboard serializes as `[[]]`, which still claims a markup.
    expect(posted?.payload.reply_markup).toBeUndefined();
    expect(labelsOf(posted)).toEqual([]);
  });

  it("still answers no-active-round when the newest round is superseded", async () => {
    // The negative half of the widening: a SUPERSEDED round has no live card,
    // and the chat-level cooldown for the roundless reply is still claimed.
    // Its own chat id: every case in this file shares one container and one
    // `chatConfiguration` row per chat, so reusing an id another case configured
    // fails the unique key before the assertion is ever reached.
    const chatId = -1008000000036n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: AUTHOR_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: null,
        status: "SUPERSEDED",
        step: "REVIEW",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      },
    });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(4009, chatId, AUTHOR_ID, "/plan_status"));

    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      PLANNING_NO_ACTIVE_ROUND,
    );
    expect(await prisma.chatStatusCooldown.count({ where: { chatId } })).toBe(
      1,
    );
  });

  it("rate-limits a second status request for a confirmed round", async () => {
    // T-03-20. The cooldown claim widened together with the round read, so the
    // newly reachable state is rate-limited from its FIRST request rather than
    // after the fact.
    const chatId = -1008000000035n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round } = await reachAvailability(chatId, AUTHOR_ID);
    await harness.send(messageUpdate(4010, chatId, AUTHOR_ID, "/plan_status"));
    const anchored = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    harness.reset();

    await harness.send(messageUpdate(4011, chatId, OTHER_ID, "/plan_status"));

    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.lines().map((line) => line.outcome as string)).toContain(
      "status-cooling-down",
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).anchorMessageId,
    ).toBe(anchored.anchorMessageId);
  });
});

describe("which lifecycle positions may acquire a fresh anchor (SITE :1887)", () => {
  async function seedRound(
    chatId: bigint,
    status: "DRAFT" | "CONFIRMED" | "SUPERSEDED" | "BOOKED",
  ) {
    return await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: AUTHOR_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: status === "DRAFT" ? CURRENT_WEEK : null,
        status,
        step: "REVIEW",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      },
    });
  }

  it("admits the draft, confirmed and booked positions at the expected revision", async () => {
    const service = new PlanningService(prisma);
    let chatId = -1008000000041n;
    for (const status of ["DRAFT", "CONFIRMED", "BOOKED"] as const) {
      chatId -= 1n;
      await configureChat(prisma, chatId);
      const round = await seedRound(chatId, status);

      expect(
        await service.reanchor(round.id, 7777, round.revision, NOW, false),
        status,
      ).toEqual({ kind: "reanchored" });

      const after = await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      });
      expect(after.anchorMessageId, status).toBe(7777);
      // The anchor and the cooldown stamp still move together, and the
      // revision still advances — only the ADMITTED label set widened.
      expect(after.lastStatusPostedAt, status).not.toBeNull();
      expect(after.revision, status).toBe(round.revision + 1);
    }
  });

  it("still refuses a superseded round and a mismatched revision", async () => {
    const service = new PlanningService(prisma);
    const chatId = -1008000000045n;
    await configureChat(prisma, chatId);
    const superseded = await seedRound(chatId, "SUPERSEDED");
    const confirmed = await seedRound(chatId, "CONFIRMED");

    // A terminal round must never acquire a fresh anchor, however current its
    // revision is.
    expect(
      await service.reanchor(
        superseded.id,
        7777,
        superseded.revision,
        NOW,
        false,
      ),
    ).toEqual({ kind: "stale" });
    // Status widened; the revision half of the compare-and-set did not.
    expect(
      await service.reanchor(
        confirmed.id,
        7777,
        confirmed.revision + 1,
        NOW,
        false,
      ),
    ).toEqual({ kind: "stale" });

    for (const round of [superseded, confirmed]) {
      expect(
        (
          await prisma.planningRound.findUniqueOrThrow({
            where: { id: round.id },
          })
        ).anchorMessageId,
      ).toBeNull();
    }
  });

  it("lists exactly the three recoverable positions, superseded excluded", async () => {
    // The constant is a separate question from WEEK_CLAIMING_STATUSES: a DRAFT
    // round is recoverable and claims no week, a BOOKED round does both, and
    // sharing one list would make a Phase 4 edit to either question silently
    // change the other.
    expect([...RECOVERABLE_ROUND_STATUSES]).toEqual([
      "DRAFT",
      "CONFIRMED",
      "BOOKED",
    ]);
  });
});

describe("recovering a round that is ready to book (Open Question 2)", () => {
  /**
   * Drives the real wizard to Confirm and then to a live announcement.
   *
   * One roster member, so the first can-attend answer is also the last and the
   * round genuinely reaches unanimity through the production path rather than
   * by a seeded column.
   */
  async function reachAnnouncement(chatId: bigint, actorId: bigint) {
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(4101, chatId, actorId, "/plan"));
    await harness.send(
      callbackUpdate(
        4102,
        chatId,
        actorId,
        tokenLabelled(harness.lastOf("sendMessage"), "Thu 27"),
      ),
    );
    await harness.send(
      callbackUpdate(
        4103,
        chatId,
        actorId,
        tokenLabelled(harness.lastOf("editMessageText"), "15:00"),
      ),
    );
    await harness.send(
      callbackUpdate(
        4104,
        chatId,
        actorId,
        tokenLabelled(
          harness.lastOf("editMessageText"),
          PLANNING_CONFIRM_LABEL,
        ),
      ),
    );
    const card = harness.lastOf("editMessageText");
    const canAttend = tokenLabelled(card, PLANNING_CAN_ATTEND_LABEL);
    const cannotAttend = tokenLabelled(card, PLANNING_CANNOT_ATTEND_LABEL);
    await harness.send(callbackUpdate(4105, chatId, actorId, canAttend));
    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(round.status).toBe("CONFIRMED");
    expect(round.readyAnnouncedAt).not.toBeNull();
    expect(round.announcementMessageId).not.toBeNull();
    return { harness, round, canAttend, cannotAttend };
  }

  /** Every edit this harness aimed at one particular message id. */
  function editsTo(
    harness: ReturnType<typeof createHarness>,
    messageId: number | null,
  ) {
    return harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === messageId);
  }

  it("re-posts the announcement and moves only its own message id", async () => {
    const chatId = -1008000000051n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round } = await reachAnnouncement(chatId, AUTHOR_ID);
    harness.reset();

    await harness.send(messageUpdate(4106, chatId, OTHER_ID, "/plan_status"));

    // The message the round's current state makes actionable, and only it.
    const posted = harness.lastOf("sendMessage");
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(posted?.payload.text)).toContain("Ready to book");
    expect(String(posted?.payload.text)).not.toContain("Answered 1 of 1");

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.announcementMessageId).not.toBe(round.announcementMessageId);
    // D-17: the availability card keeps its anchor, so every subsequent answer
    // still edits the card the band is answering on.
    expect(after.anchorMessageId).toBe(round.anchorMessageId);

    // The previous announcement copy is cleared; the card is not touched.
    const cleared = editsTo(harness, round.announcementMessageId);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.payload.reply_markup).toBeUndefined();
    expect(editsTo(harness, round.anchorMessageId)).toHaveLength(0);

    expect(
      harness.lines().filter((line) => line.reason === "announcement-reposted"),
    ).toHaveLength(1);
  });

  it("re-posts the availability card once unanimity has been lost", async () => {
    const chatId = -1008000000052n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round, cannotAttend } = await reachAnnouncement(
      chatId,
      AUTHOR_ID,
    );
    // The round is collecting again, so the card — not the announcement — is
    // what a re-post has to bring back.
    await harness.send(callbackUpdate(4107, chatId, AUTHOR_ID, cannotAttend));
    harness.reset();

    await harness.send(messageUpdate(4108, chatId, AUTHOR_ID, "/plan_status"));

    const posted = harness.lastOf("sendMessage");
    expect(String(posted?.payload.text)).toContain("Answered 1 of 1");
    expect(labelsOf(posted)).toEqual([
      PLANNING_CAN_ATTEND_LABEL,
      PLANNING_CANNOT_ATTEND_LABEL,
    ]);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    // The ANCHOR moved this time, and the announcement pointer stayed put.
    expect(after.anchorMessageId).not.toBe(round.anchorMessageId);
    expect(after.announcementMessageId).toBe(round.announcementMessageId);
    expect(
      harness
        .lines()
        .filter((line) => line.reason === "availability-card-reposted"),
    ).toHaveLength(1);
  });

  it("rate-limits a second request for a ready-to-book round", async () => {
    const chatId = -1008000000053n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const { harness, round } = await reachAnnouncement(chatId, AUTHOR_ID);
    await harness.send(messageUpdate(4109, chatId, AUTHOR_ID, "/plan_status"));
    const reposted = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    harness.reset();

    await harness.send(messageUpdate(4110, chatId, OTHER_ID, "/plan_status"));

    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.lines().map((line) => line.outcome as string)).toContain(
      "status-cooling-down",
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).announcementMessageId,
    ).toBe(reposted.announcementMessageId);
  });

  it("reads the availability projection at most once per request", async () => {
    // The slot decision, the log reason and the rendered message all come from
    // ONE read. Two independent reads would leave a window in which a concurrent
    // answer commits between them, and `/plan_status` could then re-point
    // `announcementMessageId` at a posted availability card.
    const chatId = -1008000000054n;
    await configureChat(prisma, chatId, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });
    await addMember(prisma, chatId, AUTHOR_ID);
    const draftChat = -1008000000055n;
    await configureChat(prisma, draftChat, {
      planningAccessPolicy: "ANYONE_IN_CHAT",
    });

    const reads = vi.spyOn(PlanningService.prototype, "availabilityProjection");
    try {
      // A DRAFT round reads it ZERO times: there is no availability state yet.
      const draftHarness = createHarness({
        prisma,
        chatId: draftChat,
        role: () => "member",
      });
      await draftHarness.send(
        messageUpdate(4111, draftChat, AUTHOR_ID, "/plan"),
      );
      reads.mockClear();
      await draftHarness.send(
        messageUpdate(4112, draftChat, AUTHOR_ID, "/plan_status"),
      );
      expect(reads).toHaveBeenCalledTimes(0);

      // Ready to book: exactly one read, shared by the slot and the render.
      const { harness, round, cannotAttend } = await reachAnnouncement(
        chatId,
        AUTHOR_ID,
      );
      reads.mockClear();
      await harness.send(
        messageUpdate(4113, chatId, AUTHOR_ID, "/plan_status"),
      );
      expect(reads).toHaveBeenCalledTimes(1);

      // Collecting again, after unanimity is lost. The cooldown stamp is
      // cleared directly so the request is answered rather than refused — the
      // cooldown has its own case above.
      await harness.send(callbackUpdate(4114, chatId, AUTHOR_ID, cannotAttend));
      await prisma.planningRound.update({
        where: { id: round.id },
        data: { lastStatusPostedAt: null },
      });
      reads.mockClear();
      await harness.send(
        messageUpdate(4115, chatId, AUTHOR_ID, "/plan_status"),
      );
      expect(reads).toHaveBeenCalledTimes(1);

      // And booked, which renders the control-free summary from the same read.
      await prisma.planningRound.update({
        where: { id: round.id },
        data: {
          status: "BOOKED",
          bookedAt: NOW,
          bookedByUserId: AUTHOR_ID,
          lastStatusPostedAt: null,
        },
      });
      reads.mockClear();
      await harness.send(
        messageUpdate(4116, chatId, AUTHOR_ID, "/plan_status"),
      );
      expect(reads).toHaveBeenCalledTimes(1);
    } finally {
      reads.mockRestore();
    }
  });
});
