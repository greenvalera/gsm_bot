import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_CAN_ATTEND_LABEL,
  PLANNING_CANNOT_ATTEND_LABEL,
  PLANNING_CONFIRM_LABEL,
  PLANNING_MARKER_CANNOT_ATTEND,
  PLANNING_MARKER_CAN_ATTEND,
  PLANNING_MARKER_PENDING,
} from "../../src/telegram/keyboards.js";
import {
  createChatConfiguration,
  createClock,
} from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

/**
 * The Phase 3 tracer: Confirm publishes the availability card onto the round's
 * EXISTING anchor (D-01/D-02), one snapshot participant answers, and the card
 * re-renders with their marker and an updated count (AVAIL-02/AVAIL-04/D-11).
 *
 * Every assertion is made against real PostgreSQL rather than a service double,
 * because the three properties this path actually depends on are all database
 * properties: the answer tokens are never consumed, the per-participant
 * compare-and-set writes exactly one row, and the tokens outlive the
 * thirty-minute wizard action lifetime.
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

const AUTHOR_ID = 8401n;

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

function createHarness(options: {
  prisma: PrismaClient;
  chatId: bigint;
  now?: () => Date;
}) {
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
      async getCurrentRole() {
        return "member";
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

let updateId = 7000;

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
      chat_instance: "planning-availability",
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

/**
 * Drives a chat through the real wizard and presses Confirm, which is what
 * publishes the availability card (D-01). Deliberately not a hand-written row:
 * the answer tokens under test have to be the ones the confirm transaction
 * actually minted.
 */
async function reachAvailability(
  chatId: bigint,
  harness: ReturnType<typeof createHarness>,
) {
  await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));
  const dayToken = tokenLabelled(
    harness.lastOf("sendMessage"),
    CHOSEN_DAY_LABEL,
  );
  await harness.send(callbackUpdate(chatId, AUTHOR_ID, dayToken));
  const slotToken = tokenLabelled(
    harness.lastOf("editMessageText"),
    CHOSEN_TIME_LABEL,
  );
  await harness.send(callbackUpdate(chatId, AUTHOR_ID, slotToken));
  const reviewCard = harness.lastOf("editMessageText");
  const draft = await prisma.planningRound.findFirstOrThrow({
    where: { chatId, status: "DRAFT" },
  });
  await harness.send(
    callbackUpdate(
      chatId,
      AUTHOR_ID,
      tokenLabelled(reviewCard, PLANNING_CONFIRM_LABEL),
    ),
  );
  const availabilityCard = harness.lastOf("editMessageText");
  return {
    draft,
    availabilityCard,
    canAttendToken: tokenLabelled(availabilityCard, PLANNING_CAN_ATTEND_LABEL),
    cannotAttendToken: tokenLabelled(
      availabilityCard,
      PLANNING_CANNOT_ATTEND_LABEL,
    ),
  };
}

const answerActionsOf = (roundId: string) =>
  prisma.callbackAction.findMany({
    where: { targetId: { contains: `"roundId":"${roundId}"` } },
  });

const participantsOf = (roundId: string) =>
  prisma.planningParticipant.findMany({
    where: { roundId },
    orderBy: { telegramUserId: "asc" },
  });

describe("Confirm publishes the availability card (D-01 / D-02)", () => {
  it("edits the round's existing anchor and leaves two unconsumed answer tokens", async () => {
    const chatId = -1011000000001n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7101n, firstName: "Ada" },
      { id: 7102n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });

    const { draft, availabilityCard } = await reachAvailability(
      chatId,
      harness,
    );

    const confirmed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    // D-02: publication is a TRANSITION of the one card, not a second message.
    expect(confirmed.anchorMessageId).toBe(draft.anchorMessageId);
    expect(availabilityCard?.payload.message_id).toBe(draft.anchorMessageId);
    expect(harness.countOf("sendMessage")).toBe(1);

    const answers = (await answerActionsOf(confirmed.id)).filter((row) =>
      String(row.targetId).includes('"action":"answer"'),
    );
    expect(answers).toHaveLength(2);
    for (const row of answers) {
      expect(row.consumedAt).toBeNull();
      // Pitfall 6: NOT the thirty-minute wizard lifetime.
      expect(row.expiresAt.getTime()).toBeGreaterThan(
        NOW.getTime() + 30 * 60 * 1000,
      );
    }

    // AVAIL-04: everybody is named, and nobody has answered yet.
    const text = String(availabilityCard?.payload.text);
    expect(text).toContain("Ada");
    expect(text).toContain("Bo");
    expect(text).toContain("0 of 2");
    expect(
      text
        .split("\n")
        .filter((line) => line.startsWith(PLANNING_MARKER_PENDING)),
    ).toHaveLength(2);
    // D-10: a plain safe label, never a Telegram mention.
    expect(text).not.toContain("tg://user");
    expect(keyboardButtons(availabilityCard)).toHaveLength(2);
  });
});

describe("a snapshot participant answers (AVAIL-02 / AVAIL-04)", () => {
  it("records exactly one row, keeps the token live and re-renders the card", async () => {
    const chatId = -1011000000002n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7201n, firstName: "Ada" },
      { id: 7202n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);
    harness.reset();

    await harness.send(callbackUpdate(chatId, 7201n, canAttendToken));

    const participants = await participantsOf(draft.id);
    expect(participants.map((row) => row.availability)).toEqual([
      "AVAILABLE",
      null,
    ]);
    expect(participants[0]?.answeredAt).not.toBeNull();
    // No other row was touched: the compare-and-set names one participant.
    expect(participants[1]?.answeredAt).toBeNull();

    // The shared capability survives its own use — one keyboard serves N people.
    const stillLive = await prisma.callbackAction.findUniqueOrThrow({
      where: { token: canAttendToken },
    });
    expect(stillLive.consumedAt).toBeNull();

    const card = harness.lastOf("editMessageText");
    expect(card?.payload.message_id).toBe(draft.anchorMessageId);
    const text = String(card?.payload.text);
    expect(text).toContain("1 of 2");
    expect(text).toContain(`${PLANNING_MARKER_CAN_ATTEND} Ada`);
    expect(text).toContain(`${PLANNING_MARKER_PENDING} Bo`);
    // A first answer from a NULL column is NOT a duplicate (Pitfall 5).
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).not.toBe("Already applied.");
    expect(
      harness.lines().some((line) => line.outcome === "availability-answered"),
    ).toBe(true);
  });

  it("answers the SAME token for a second participant", async () => {
    const chatId = -1011000000003n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7301n, firstName: "Ada" },
      { id: 7302n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);

    await harness.send(callbackUpdate(chatId, 7301n, canAttendToken));
    await harness.send(callbackUpdate(chatId, 7302n, canAttendToken));

    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(String(harness.lastOf("editMessageText")?.payload.text)).toContain(
      "2 of 2",
    );
  });

  it("still accepts a tap more than thirty minutes after Confirm", async () => {
    // Pitfall 6: the wizard's thirty-minute action lifetime would have killed
    // these buttons at the callback boundary, before the dispatcher could even
    // improve the copy.
    const chatId = -1011000000004n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 7401n, firstName: "Ada" }]);
    const clock = createClock(NOW);
    const harness = createHarness({ prisma, chatId, now: clock.now });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);

    clock.advance(31 * 60 * 1000);
    harness.reset();
    await harness.send(callbackUpdate(chatId, 7401n, canAttendToken));

    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual(["AVAILABLE"]);
    expect(harness.countOf("editMessageText")).toBe(1);
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).not.toMatch(/no longer available/i);
  });
});

describe("answers stay changeable until the round closes (D-04)", () => {
  it("overwrites a participant's previous answer and moves answeredAt forward", async () => {
    const chatId = -1011000000005n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7501n, firstName: "Ada" },
      { id: 7502n, firstName: "Bo" },
    ]);
    const clock = createClock(NOW);
    const harness = createHarness({ prisma, chatId, now: clock.now });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, harness);

    await harness.send(callbackUpdate(chatId, 7501n, canAttendToken));
    const first = (await participantsOf(draft.id))[0];
    expect(first?.availability).toBe("AVAILABLE");

    clock.advance(60 * 1000);
    harness.reset();
    await harness.send(callbackUpdate(chatId, 7501n, cannotAttendToken));

    const changed = (await participantsOf(draft.id))[0];
    expect(changed?.availability).toBe("UNAVAILABLE");
    // The change is a real transition, not a silent no-op: its timestamp moved.
    expect(changed?.answeredAt?.getTime()).toBeGreaterThan(
      first?.answeredAt?.getTime() ?? 0,
    );
    // And the card was re-rendered for the whole group (D-11).
    expect(harness.countOf("editMessageText")).toBe(1);
    expect(String(harness.lastOf("editMessageText")?.payload.text)).toContain(
      `${PLANNING_MARKER_CANNOT_ATTEND} Ada`,
    );
  });

  it("treats re-tapping the same control as an idempotent no-op", async () => {
    const chatId = -1011000000006n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7601n, firstName: "Ada" },
      { id: 7602n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);

    await harness.send(callbackUpdate(chatId, 7601n, canAttendToken));
    const afterFirst = (await participantsOf(draft.id))[0];
    harness.reset();

    await harness.send(callbackUpdate(chatId, 7601n, canAttendToken));

    const afterSecond = (await participantsOf(draft.id))[0];
    // Zero rows affected: same answer, same timestamp, no second transition.
    expect(afterSecond?.availability).toBe("AVAILABLE");
    expect(afterSecond?.answeredAt?.getTime()).toBe(
      afterFirst?.answeredAt?.getTime(),
    );
    // No anchor edit: nothing durable changed, so the card is not spent.
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toBe(
      "Already applied.",
    );
  });
});

describe("the confirm-time snapshot is the permission (AVAIL-03 / D-06 / D-07)", () => {
  it("refuses a current chat member who is not in the snapshot, privately and without an edit", async () => {
    const chatId = -1011000000007n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7701n, firstName: "Ada" },
      { id: 7702n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, harness);
    // Joined the CHAT after the lineup was fixed, so the callback boundary
    // admits them and only the snapshot read can refuse.
    await addMembers(chatId, [{ id: 7799n, firstName: "Cy" }]);
    harness.reset();

    await harness.send(callbackUpdate(chatId, 7799n, canAttendToken));

    // Nothing was written, for them or for anybody else.
    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual([null, null]);
    // The round's card was not spent on a stranger's mistake.
    expect(harness.countOf("editMessageText")).toBe(0);
    // Both shared capabilities are still live for the people who were asked.
    const live = await prisma.callbackAction.findMany({
      where: { token: { in: [canAttendToken, cannotAttendToken] } },
    });
    expect(live).toHaveLength(2);
    for (const row of live) expect(row.consumedAt).toBeNull();

    const alert = harness.lastOf("answerCallbackQuery");
    expect(alert?.payload.show_alert).toBe(true);
    const text = String(alert?.payload.text);
    // T-03-10: names the reason, never the lineup.
    expect(text).not.toContain("Ada");
    expect(text).not.toContain("Bo");
    expect(text).not.toContain("7701");
    expect([...text].length).toBeLessThanOrEqual(200);
    expect(
      harness.lines().some((line) => line.outcome === "not-a-participant"),
    ).toBe(true);
  });

  it("lets a participant removed from the roster mid-round still answer and still count", async () => {
    const chatId = -1011000000008n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7801n, firstName: "Ada" },
      { id: 7802n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);

    // D-06: the roster change takes effect on the NEXT round. This one already
    // asked them, so the completion denominator cannot shift underneath it.
    await prisma.chatMembership.update({
      where: { chatId_telegramUserId: { chatId, telegramUserId: 7802n } },
      data: { activeAt: null, deactivatedAt: NOW },
    });
    harness.reset();

    await harness.send(callbackUpdate(chatId, 7802n, canAttendToken));

    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual([null, "AVAILABLE"]);
    const text = String(harness.lastOf("editMessageText")?.payload.text);
    // Still one OF TWO: the denominator is the snapshot, not the live roster.
    expect(text).toContain("1 of 2");
    expect(text).toContain(`${PLANNING_MARKER_CAN_ATTEND} Bo`);
  });
});

describe("a cannot-attend answer keeps the round open (D-05)", () => {
  it("records the refusal, leaves the round collecting and still names the author", async () => {
    const chatId = -1011000000009n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 7901n, firstName: "Ada" },
      { id: 7902n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, harness);

    await harness.send(callbackUpdate(chatId, 7901n, cannotAttendToken));

    const stillOpen = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(stillOpen.status).toBe("CONFIRMED");
    const collecting = String(harness.lastOf("editMessageText")?.payload.text);
    expect(collecting).toContain("Answers are still coming in.");
    // D-13: the card still says whose round it is, on EVERY render — a line
    // that vanished at the first answer would silently re-attribute the round.
    expect(collecting).toContain("Planned by");

    // The remaining participant can still answer, which is what "keeps the
    // round open" means.
    await harness.send(callbackUpdate(chatId, 7902n, canAttendToken));
    const blocked = String(harness.lastOf("editMessageText")?.payload.text);
    expect(blocked).toContain("2 of 2");
    expect(blocked).toContain("This slot doesn't work for the whole band.");
    // Phase 3 ships no replan action, and the card must not imply one.
    expect(blocked.toLowerCase()).not.toContain("replan");
    // Both answers stay live: a mis-tap must never cost the group a round.
    expect(keyboardButtons(harness.lastOf("editMessageText"))).toHaveLength(2);
  });
});
