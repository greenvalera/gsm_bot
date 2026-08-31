import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import {
  PLANNING_INACTIVITY_MS,
  PLANNING_STATUS_COOLDOWN_MS,
  PlanningService,
  isTakeoverEligible,
} from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import { PLANNING_TAKEOVER_LABEL } from "../../src/telegram/keyboards.js";
import { memberLabel } from "../../src/telegram/roster-renderers.js";
import {
  createChatConfiguration,
  createClock,
} from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

/**
 * REQ-AUTH-03, against real PostgreSQL.
 *
 * Takeover is the single deliberate exception to author-only control (D-02), so
 * every case here is about the exception staying narrow. Two conditions must
 * BOTH hold and both are re-checked at tap time from freshly read state, never
 * from what the render saw: the round has been silent for the configured
 * threshold, and the person tapping is a current chat administrator.
 *
 * The other half is D-13: a takeover must be a hand-over, not a reset. Every
 * choice the previous author made survives it, the round is never deleted, and
 * the chat is told who owns it now.
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
const LAST_WEEK = "2026-08-17";

const AUTHOR_ID = 8401n;
const ADMIN_ID = 8402n;
const MEMBER_ID = 8403n;

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
}>;

/**
 * The role gateway is a FUNCTION of the actor, and every test that cares about
 * a role change closes over mutable state rather than fixing it up front —
 * "administrator when the card was drawn, member when the button was pressed"
 * is not expressible any other way.
 */
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
    lines: capture.lines,
    countOf(method: string) {
      return calls.filter((call) => call.method === method).length;
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
      from: { id: Number(actorId), is_bot: false, first_name: "Someone" },
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
      from: { id: Number(actorId), is_bot: false, first_name: "Someone" },
      chat_instance: "planning-takeover",
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

async function configureChat(chatId: bigint, overrides = {}) {
  await prisma.chatConfiguration.create({
    data: { chatId, ...createChatConfiguration(overrides) },
  });
}

async function nameUser(
  telegramUserId: bigint,
  firstName: string,
  lastName: string | null = null,
) {
  await prisma.telegramUser.upsert({
    where: { telegramUserId },
    create: { telegramUserId, firstName, lastName },
    update: { firstName, lastName },
  });
}

/** A DRAFT round in whatever state the case under test needs. */
async function seedRound(
  chatId: bigint,
  overrides: Record<string, unknown> = {},
) {
  return await prisma.planningRound.create({
    data: {
      chatId,
      authorUserId: AUTHOR_ID,
      targetWeekStart: CURRENT_WEEK,
      activeWeekStart: CURRENT_WEEK,
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      step: "TIME",
      selectedDate: "2026-08-27",
      anchorMessageId: 700,
      lastActivityAt: NOW,
      ...overrides,
    },
  });
}

/**
 * A Take over button that exists WITHOUT the render having decided it should.
 *
 * That is exactly the threat model: rendering is a convenience, the transaction
 * is the authority, so the refusals must be provable against a token the render
 * would never have produced.
 */
async function mintTakeoverToken(
  chatId: bigint,
  roundId: string,
  actorId: bigint,
  now: Date,
) {
  const token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      kind: CallbackActionKind.PLANNING,
      chatId,
      actorUserId: actorId,
      targetId: createPlanningTarget({ action: "takeover", roundId }),
      expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    },
  });
  return token;
}

const roleTable =
  (table: Record<string, CurrentTelegramRole>) =>
  (_chatId: bigint, actorId: bigint) =>
    table[actorId.toString()] ?? "member";

describe("the inactivity threshold (D-12)", () => {
  it("is a pure predicate over lastActivityAt", () => {
    const fresh = { lastActivityAt: new Date(NOW.getTime() - 1000) };
    const quiet = {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS),
    };
    expect(isTakeoverEligible(fresh, NOW)).toBe(false);
    // Exactly at the threshold counts: the boundary is `>=`, matching every
    // other lifetime comparison in the codebase.
    expect(isTakeoverEligible(quiet, NOW)).toBe(true);
  });

  it("refuses an administrator while the round is still active", async () => {
    const chatId = -1009000000001n;
    await configureChat(chatId);
    const round = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - 60 * 1000),
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });
    const token = await mintTakeoverToken(chatId, round.id, ADMIN_ID, NOW);

    await harness.send(callbackUpdate(4001, chatId, ADMIN_ID, token));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(AUTHOR_ID);
    expect(after.revision).toBe(round.revision);
    const answer = harness.lastOf("answerCallbackQuery");
    expect(answer?.payload.show_alert).toBe(true);
    expect(String(answer?.payload.text)).toContain("still active");
    expect(
      harness.lines().some((line) => line.outcome === "takeover-not-eligible"),
    ).toBe(true);
  });

  it("keeps the Take over control off a card whose round is still active", async () => {
    const chatId = -1009000000002n;
    await configureChat(chatId);
    await seedRound(chatId, { lastActivityAt: NOW });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });

    await harness.send(messageUpdate(4101, chatId, ADMIN_ID, "/plan_status"));

    expect(labelsOf(harness.lastOf("sendMessage"))).not.toContain(
      PLANNING_TAKEOVER_LABEL,
    );
  });
});

describe("taking over an abandoned round (AUTH-03)", () => {
  it("offers the control to an administrator once the round has gone quiet", async () => {
    const chatId = -1009000000003n;
    await configureChat(chatId);
    await nameUser(AUTHOR_ID, "Ada", "Lovelace");
    await nameUser(ADMIN_ID, "Grace", "Hopper");
    const round = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1000),
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });

    await harness.send(messageUpdate(4201, chatId, ADMIN_ID, "/plan_status"));
    const card = harness.lastOf("sendMessage");
    expect(labelsOf(card)).toContain(PLANNING_TAKEOVER_LABEL);
    // Before the hand-over the card names the ORIGINAL author.
    expect(String(card?.payload.text)).toContain(
      memberLabel({
        telegramUserId: AUTHOR_ID,
        firstName: "Ada",
        lastName: "Lovelace",
        username: null,
      }),
    );
    const token = tokenLabelled(card, PLANNING_TAKEOVER_LABEL);
    harness.reset();

    await harness.send(callbackUpdate(4202, chatId, ADMIN_ID, token));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(ADMIN_ID);
    expect(after.revision).toBe(round.revision + 1);
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(
      round.lastActivityAt.getTime(),
    );

    // D-13: every choice the previous author made survives the hand-over.
    expect(after.step).toBe(round.step);
    expect(after.selectedDate).toBe(round.selectedDate);
    expect(after.selectedStartMinute).toBe(round.selectedStartMinute);
    expect(after.targetWeekStart).toBe(round.targetWeekStart);
    expect(after.activeWeekStart).toBe(round.activeWeekStart);
    expect(after.durationMinutes).toBe(round.durationMinutes);
    expect(after.dailyStartMinute).toBe(round.dailyStartMinute);
    expect(after.dailyEndMinute).toBe(round.dailyEndMinute);
    expect(after.timezone).toBe(round.timezone);
    expect(after.status).toBe("DRAFT");

    // The chat is told who owns it now, so nobody is silently re-attributed.
    const edited = harness.lastOf("editMessageText");
    expect(String(edited?.payload.text)).toContain(
      memberLabel({
        telegramUserId: ADMIN_ID,
        firstName: "Grace",
        lastName: "Hopper",
        username: null,
      }),
    );
    expect(
      harness.lines().some((line) => line.outcome === "round-taken-over"),
    ).toBe(true);
  });

  it("refuses an ordinary member however long the round has been quiet", async () => {
    const chatId = -1009000000004n;
    await configureChat(chatId);
    const round = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS * 10),
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [MEMBER_ID.toString()]: "member" }),
    });
    const token = await mintTakeoverToken(chatId, round.id, MEMBER_ID, NOW);

    await harness.send(callbackUpdate(4301, chatId, MEMBER_ID, token));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(AUTHOR_ID);
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain("administrator");
    expect(
      harness.lines().some((line) => line.outcome === "takeover-not-admin"),
    ).toBe(true);
  });
});

describe("rendering is not authority (T-02-05)", () => {
  it("refuses a Take over the author invalidated between render and tap", async () => {
    const chatId = -1009000000005n;
    await configureChat(chatId);
    const clock = createClock(NOW);
    const round = await seedRound(chatId, {
      step: "DAY",
      selectedDate: null,
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1000),
    });
    const harness = createHarness({
      prisma,
      chatId,
      now: clock.now,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });

    // The button really was rendered: this is the eligible card.
    await harness.send(messageUpdate(4401, chatId, ADMIN_ID, "/plan_status"));
    const token = tokenLabelled(
      harness.lastOf("sendMessage"),
      PLANNING_TAKEOVER_LABEL,
    );

    // The author comes back and taps a day, which resets the silence.
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Thu 27");
    await harness.send(callbackUpdate(4402, chatId, AUTHOR_ID, dayToken));
    const revived = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(revived.step).toBe("TIME");
    harness.reset();

    // The administrator's button is still on their screen. It must not work.
    await harness.send(callbackUpdate(4403, chatId, ADMIN_ID, token));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(AUTHOR_ID);
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain("still active");
  });

  it("refuses an administrator who was demoted between render and tap", async () => {
    const chatId = -1009000000006n;
    await configureChat(chatId);
    const round = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1000),
    });
    let adminRole: CurrentTelegramRole = "administrator";
    const harness = createHarness({
      prisma,
      chatId,
      role: (_chatId, actorId) => (actorId === ADMIN_ID ? adminRole : "member"),
    });

    await harness.send(messageUpdate(4501, chatId, ADMIN_ID, "/plan_status"));
    const token = tokenLabelled(
      harness.lastOf("sendMessage"),
      PLANNING_TAKEOVER_LABEL,
    );
    harness.reset();

    adminRole = "member";
    await harness.send(callbackUpdate(4502, chatId, ADMIN_ID, token));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(AUTHOR_ID);
    expect(
      harness.lines().some((line) => line.outcome === "takeover-not-admin"),
    ).toBe(true);
  });

  it("refuses a takeover carrying a revision the round has moved past", async () => {
    const chatId = -1009000000007n;
    await configureChat(chatId);
    const round = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1000),
    });
    const token = await mintTakeoverToken(chatId, round.id, ADMIN_ID, NOW);

    const result = await new PlanningService(prisma).takeover(
      chatId,
      ADMIN_ID,
      token,
      round.revision + 5,
      NOW,
      async () => "administrator",
    );

    // A stale guard REPORTS; it never throws and never half-applies.
    expect(result.kind).toBe("stale");
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.authorUserId).toBe(AUTHOR_ID);
  });
});

describe("after the round changes hands (D-13)", () => {
  it("swaps who may act, cleanly and in both directions", async () => {
    const chatId = -1009000000008n;
    await configureChat(chatId);
    await nameUser(AUTHOR_ID, "Ada", "Lovelace");
    await nameUser(ADMIN_ID, "Grace", "Hopper");
    const round = await seedRound(chatId, {
      step: "DAY",
      selectedDate: null,
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1000),
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });

    await harness.send(messageUpdate(4601, chatId, ADMIN_ID, "/plan_status"));
    const posted = harness.lastOf("sendMessage");
    const takeoverToken = tokenLabelled(posted, PLANNING_TAKEOVER_LABEL);
    const dayToken = tokenLabelled(posted, "Thu 27");
    await harness.send(callbackUpdate(4602, chatId, ADMIN_ID, takeoverToken));
    harness.reset();

    // The ORIGINAL author is now the one refused, and the alert names the new
    // owner rather than pretending the button expired.
    await harness.send(callbackUpdate(4603, chatId, AUTHOR_ID, dayToken));
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain(
      memberLabel({
        telegramUserId: ADMIN_ID,
        firstName: "Grace",
        lastName: "Hopper",
        username: null,
      }),
    );
    const untouched = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(untouched.step).toBe("DAY");

    // The NEW owner moves it, and the card still names them a step later — the
    // attribution is a property of the round, not of the takeover's own render.
    harness.reset();
    const freshDayToken = tokenLabelled(
      harness.lastOf("editMessageText") ?? posted,
      "Thu 27",
    );
    await harness.send(callbackUpdate(4604, chatId, ADMIN_ID, freshDayToken));
    const advanced = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(advanced.step).toBe("TIME");
    expect(advanced.selectedDate).toBe("2026-08-27");
    expect(String(harness.lastOf("editMessageText")?.payload.text)).toContain(
      memberLabel({
        telegramUserId: ADMIN_ID,
        firstName: "Grace",
        lastName: "Hopper",
        username: null,
      }),
    );
  });
});

describe("last week's ghost cannot block this week", () => {
  it("supersedes a stale-week draft at read time, without deleting it", async () => {
    const chatId = -1009000000009n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const stale = await seedRound(chatId, {
      targetWeekStart: LAST_WEEK,
      activeWeekStart: LAST_WEEK,
      step: "REVIEW",
      selectedDate: "2026-08-20",
      selectedStartMinute: 900,
      lastActivityAt: new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000),
    });
    const before = await prisma.planningRound.count({ where: { chatId } });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [MEMBER_ID.toString()]: "member" }),
    });

    // A fresh /plan for the current week must succeed rather than collide with
    // last week's unreleased unique slot.
    await harness.send(messageUpdate(4701, chatId, MEMBER_ID, "/plan"));

    const reaped = await prisma.planningRound.findUniqueOrThrow({
      where: { id: stale.id },
    });
    expect(reaped.status).toBe("SUPERSEDED");
    expect(reaped.activeWeekStart).toBeNull();
    // Superseded, NOT deleted: the author and both selections survive.
    expect(reaped.authorUserId).toBe(AUTHOR_ID);
    expect(reaped.selectedDate).toBe("2026-08-20");
    expect(reaped.selectedStartMinute).toBe(900);
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(
      before + 1,
    );

    const fresh = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    expect(fresh.id).not.toBe(stale.id);
    expect(fresh.targetWeekStart).toBe(CURRENT_WEEK);
    expect(fresh.authorUserId).toBe(MEMBER_ID);
  });

  it("never reaps a current-week draft, however long it has been silent", async () => {
    // Inactivity enables TAKEOVER. Only the week boundary supersedes. Conflating
    // the two would quietly destroy the week of an author who stepped away for
    // an afternoon.
    const chatId = -1009000000010n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const silent = await seedRound(chatId, {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS * 100),
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [MEMBER_ID.toString()]: "member" }),
    });

    await harness.send(messageUpdate(4801, chatId, MEMBER_ID, "/plan_status"));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: silent.id },
    });
    expect(after.status).toBe("DRAFT");
    expect(after.activeWeekStart).toBe(CURRENT_WEEK);
  });

  it("releases the week so a superseded round no longer holds the unique slot", async () => {
    const chatId = -1009000000011n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    await seedRound(chatId, {
      targetWeekStart: LAST_WEEK,
      activeWeekStart: LAST_WEEK,
      lastActivityAt: NOW,
    });
    const clock = createClock(NOW);
    const harness = createHarness({
      prisma,
      chatId,
      now: clock.now,
      role: roleTable({ [MEMBER_ID.toString()]: "member" }),
    });

    await harness.send(messageUpdate(4901, chatId, MEMBER_ID, "/plan"));
    clock.advance(PLANNING_STATUS_COOLDOWN_MS + 1000);
    await harness.send(messageUpdate(4902, chatId, MEMBER_ID, "/plan_status"));

    // The reaping is idempotent: a second read does not re-supersede or throw.
    const drafts = await prisma.planningRound.findMany({
      where: { chatId, status: "DRAFT" },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.targetWeekStart).toBe(CURRENT_WEEK);
    const superseded = await prisma.planningRound.findMany({
      where: { chatId, status: "SUPERSEDED" },
    });
    expect(superseded).toHaveLength(1);
    expect(superseded[0]?.activeWeekStart).toBeNull();
  });
});

describe("nothing in the planning domain deletes a durable row", () => {
  it("keeps every round it has ever created", async () => {
    const chatId = -1009000000012n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    await seedRound(chatId, {
      targetWeekStart: LAST_WEEK,
      activeWeekStart: LAST_WEEK,
    });
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });

    await harness.send(messageUpdate(5001, chatId, ADMIN_ID, "/plan"));
    await harness.send(messageUpdate(5002, chatId, ADMIN_ID, "/plan_status"));

    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
  });
});
