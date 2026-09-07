import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import {
  PLANNING_STATUS_COOLDOWN_MS,
  PlanningService,
  READY_ANNOUNCE_COOLDOWN_MS,
} from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_BOOK_LABEL,
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
import {
  withParticipantAnswerInterference,
  withPlanningRoundInterference,
} from "../helpers/racing-client.js";

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
  /**
   * Runs while a Telegram call is in flight, before its result is handed back.
   *
   * The seam a delivery failure is injected through: a hook that throws during
   * `sendMessage` fails the announcement send for real, rather than by stubbing
   * the handler into reporting that it did.
   */
  onCall?: (call: ApiCall) => Promise<void>;
}) {
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
    await options.onCall?.({ method, payload });
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
    /** The id the mock assigned to the most recent successful `sendMessage`. */
    lastSentMessageId() {
      return sentMessageIds.at(-1);
    },
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

/**
 * How many LIVE standing booking rows the round has, at the database (G-02).
 *
 * The exact serialized target, not a `contains` of the round id: the wizard
 * mints a token per day and per hour against the same round, so a substring
 * count would answer twenty-odd and could not tell one booking capability from
 * two. After D-23 the answer is one, at every instant.
 */
const liveBookingRequestsFor = (roundId: string, at: Date) =>
  prisma.callbackAction.count({
    where: {
      kind: "PLANNING",
      targetId: JSON.stringify({ action: "book-request", roundId }),
      consumedAt: null,
      expiresAt: { gt: at },
    },
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

describe("the ready-to-book announcement (AVAIL-07 / D-12 / D-18)", () => {
  it("posts one new message when the last pending participant can attend", async () => {
    const chatId = -1011000000010n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 8101n, firstName: "Ada" },
      { id: 8102n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);

    // The first answer leaves the round collecting: nothing is announced.
    await harness.send(callbackUpdate(chatId, 8101n, canAttendToken));
    expect(harness.countOf("sendMessage")).toBe(1); // the /plan card, and only it
    harness.reset();

    await harness.send(callbackUpdate(chatId, 8102n, canAttendToken));

    // D-12: a NEW message, not only an edit. An in-place edit notifies nobody.
    expect(harness.countOf("sendMessage")).toBe(1);
    const announcement = harness.lastOf("sendMessage");
    const text = String(announcement?.payload.text);
    expect(text).toContain("Ready to book");
    expect(text).toContain("Ada");
    expect(text).toContain("Bo");
    // D-10: a plain safe label, never a Telegram mention.
    expect(text).not.toContain("tg://user");
    // LIFE-01: the announcement carries exactly ONE control, minted inside the
    // same transaction that claimed the right to announce — so the message is
    // never posted with a button whose durable row does not exist yet.
    expect(keyboardButtons(announcement).map((button) => button.text)).toEqual([
      PLANNING_BOOK_LABEL,
    ]);
    expect(
      await prisma.callbackAction.findUniqueOrThrow({
        where: { token: tokenLabelled(announcement, PLANNING_BOOK_LABEL) },
      }),
    ).toMatchObject({ consumedAt: null });

    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.readyAnnouncedAt).not.toBeNull();
    expect(round.announcementMessageId).toBe(harness.lastSentMessageId());
    // D-17: the two columns never hold each other's message id. The
    // availability card stays where it is and stays editable.
    expect(round.anchorMessageId).toBe(draft.anchorMessageId);

    // The card was updated to its all-clear state in the same act...
    const card = harness.lastOf("editMessageText");
    expect(card?.payload.message_id).toBe(draft.anchorMessageId);
    expect(String(card?.payload.text)).toContain("Everyone can make it.");
    // ...and Pitfall 7: the card keeps BOTH answer controls. They address
    // different durable rows from the announcement's, so they cannot race.
    expect(keyboardButtons(card)).toHaveLength(2);
    // A round's FIRST announcement clears no superseded copy: exactly one
    // message-affecting edit accompanies the post, and it is the card's.
    expect(harness.countOf("editMessageText")).toBe(1);
  });

  it("announces the moment a one-participant round's only member can attend", async () => {
    // AVAIL-07 empty. A band of one is the smallest lineup Confirm will accept,
    // and the first answer is also the last.
    const chatId = -1011000000011n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 8201n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);
    harness.reset();

    await harness.send(callbackUpdate(chatId, 8201n, canAttendToken));

    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toContain(
      "Ready to book",
    );
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).readyAnnouncedAt,
    ).not.toBeNull();
  });

  it("announces nothing when the last pending participant cannot attend", async () => {
    // AVAIL-07 empty, the other half: a COMPLETE set of answers containing a
    // "cannot attend" is not unanimity, and the claim is never attempted.
    const chatId = -1011000000012n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 8301n, firstName: "Ada" },
      { id: 8302n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, harness);
    await harness.send(callbackUpdate(chatId, 8301n, canAttendToken));
    harness.reset();

    await harness.send(callbackUpdate(chatId, 8302n, cannotAttendToken));

    expect(harness.countOf("sendMessage")).toBe(0);
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.readyAnnouncedAt).toBeNull();
    expect(round.announcementMessageId).toBeNull();
  });

  it("sends no second announcement when a participant re-taps afterwards", async () => {
    const chatId = -1011000000013n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 8401n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);
    await harness.send(callbackUpdate(chatId, 8401n, canAttendToken));
    const announced = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    harness.reset();

    await harness.send(callbackUpdate(chatId, 8401n, canAttendToken));

    // The participant compare-and-set refuses the repeat before unanimity is
    // ever re-derived, so nothing reaches the claim at all.
    expect(harness.countOf("sendMessage")).toBe(0);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(after.readyAnnouncedAt?.getTime()).toBe(
      announced.readyAnnouncedAt?.getTime(),
    );
    expect(after.announcementMessageId).toBe(announced.announcementMessageId);
  });

  it("posts exactly one announcement when a concurrent claim commits first", async () => {
    // AVAIL-07 adjacency, and T-03-23. The interference commits, immediately
    // before this transaction's guarded round update, exactly what a concurrent
    // final-answer transaction commits: the winning `readyAnnouncedAt` claim.
    //
    // It is written as the raw guarded statement rather than as a second
    // dispatch on purpose. Under READ COMMITTED the loser's participant re-read
    // cannot see a concurrent answer's uncommitted row, so the reachable race is
    // on the ROUND row alone — which is precisely the row the compare-and-set
    // guards. `sequentialize` narrows the window; this statement is the
    // guarantee (Pitfall 3).
    const chatId = -1011000000014n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 8501n, firstName: "Ada" },
      { id: 8502n, firstName: "Bo" },
    ]);
    const setup = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, setup);
    // Ada answers first; the round is still collecting, so nothing is claimed.
    await setup.send(callbackUpdate(chatId, 8501n, canAttendToken));

    const concurrent = connect();
    const WINNER_MESSAGE_ID = 4242;
    let interferedCount = 0;
    const racing = withPlanningRoundInterference(prisma, async () => {
      const claimed = await concurrent.planningRound.updateMany({
        where: {
          id: draft.id,
          status: "CONFIRMED",
          OR: [
            { readyAnnouncedAt: null },
            {
              readyAnnouncedAt: {
                lte: new Date(NOW.getTime() - READY_ANNOUNCE_COOLDOWN_MS),
              },
            },
          ],
        },
        data: {
          readyAnnouncedAt: NOW,
          announcementMessageId: WINNER_MESSAGE_ID,
        },
      });
      interferedCount = claimed.count;
    });
    const harness = createHarness({ prisma: racing, chatId });

    await harness.send(callbackUpdate(chatId, 8502n, canAttendToken));

    // The interference did win a row, so the loser below really did lose one.
    expect(interferedCount).toBe(1);
    // The loser posts NOTHING.
    expect(harness.countOf("sendMessage")).toBe(0);
    // But its own participant's answer is recorded, and it still re-renders the
    // availability card from its own committed snapshot.
    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual(["AVAILABLE", "AVAILABLE"]);
    expect(harness.countOf("editMessageText")).toBe(1);
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    // One claim, one announcement pointer — the winner's, untouched.
    expect(round.announcementMessageId).toBe(WINNER_MESSAGE_ID);
    expect(round.readyAnnouncedAt?.getTime()).toBe(NOW.getTime());
  });

  it("keeps the claim when the announcement send fails", async () => {
    // T-03-25. The claim is durable BEFORE the send, so a Telegram outage
    // cannot be replayed into a second notification inside the window. Nothing
    // is rolled back and no compensating message is posted (D-03).
    const chatId = -1011000000015n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 8601n, firstName: "Ada" }]);
    let failSend = false;
    const harness = createHarness({
      prisma,
      chatId,
      onCall: async (call) => {
        if (failSend && call.method === "sendMessage") {
          throw new Error("Telegram rejected the announcement");
        }
      },
    });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);
    harness.reset();
    failSend = true;

    await harness.send(callbackUpdate(chatId, 8601n, canAttendToken));

    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.readyAnnouncedAt).not.toBeNull();
    // The message never landed, so the round has no pointer to one.
    expect(round.announcementMessageId).toBeNull();
    // The answer stands regardless of what Telegram did.
    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual(["AVAILABLE"]);
    // Exactly one failure line, at the announcement's own catch site, and no
    // second message attempted in its place.
    const failures = harness
      .lines()
      .filter((line) => line.outcome === "announce-failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe("telegram-rejected-the-announcement");
    expect(harness.countOf("sendMessage")).toBe(1);
  });
});

describe("keeping the announcement honest (D-18 / T-03-27)", () => {
  /** Every edit this harness aimed at one particular message id. */
  function editsTo(
    harness: ReturnType<typeof createHarness>,
    messageId: number | null,
  ) {
    return harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === messageId);
  }

  /** Drives a two-member chat all the way to a live announcement. */
  async function reachAnnouncement(
    chatId: bigint,
    members: readonly MemberSpec[],
    options: {
      now?: () => Date;
      onCall?: (call: ApiCall) => Promise<void>;
    } = {},
  ) {
    await configureChat(chatId);
    await addMembers(chatId, members);
    const harness = createHarness({
      prisma,
      chatId,
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.onCall === undefined ? {} : { onCall: options.onCall }),
    });
    const reached = await reachAvailability(chatId, harness);
    for (const member of members) {
      await harness.send(
        callbackUpdate(chatId, member.id, reached.canAttendToken),
      );
    }
    const announced = await prisma.planningRound.findUniqueOrThrow({
      where: { id: reached.draft.id },
    });
    expect(announced.announcementMessageId).not.toBeNull();
    return { harness, ...reached, announced };
  }

  it("retracts the announcement when a participant changes their mind", async () => {
    const chatId = -1011000000016n;
    const { harness, draft, announced, cannotAttendToken } =
      await reachAnnouncement(chatId, [
        { id: 8701n, firstName: "Ada" },
        { id: 8702n, firstName: "Bo" },
      ]);
    harness.reset();

    await harness.send(callbackUpdate(chatId, 8701n, cannotAttendToken));

    // The announcement no longer claims the slot works, and carries no control.
    const retraction = editsTo(harness, announced.announcementMessageId).at(-1);
    expect(retraction).toBeDefined();
    const text = String(retraction?.payload.text);
    expect(text).toContain("no longer works");
    expect(text).not.toContain("Ready to book");
    expect(retraction?.payload.reply_markup).toBeUndefined();
    // Phase 3 ships no replan action, and the message must not imply one.
    expect(text.toLowerCase()).not.toContain("replan");

    // Pitfall 7: the availability card is NOT stripped. Answers stay changeable
    // until booking closes the round (D-04).
    const card = editsTo(harness, draft.anchorMessageId).at(-1);
    expect(keyboardButtons(card)).toHaveLength(2);

    // No compensating message, and the claim is not released by the retraction
    // — the cooldown is what releases it (D-18).
    expect(harness.countOf("sendMessage")).toBe(0);
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.readyAnnouncedAt?.getTime()).toBe(
      announced.readyAnnouncedAt?.getTime(),
    );
    expect(round.announcementMessageId).toBe(announced.announcementMessageId);
    expect(
      harness
        .lines()
        .filter(
          (line) => line.reason === "unanimity-lost-announcement-retracted",
        ),
    ).toHaveLength(1);
  });

  it("edits the announcement back inside the cooldown and notifies nobody", async () => {
    const chatId = -1011000000017n;
    const clock = createClock(NOW);
    const { harness, draft, announced, canAttendToken, cannotAttendToken } =
      await reachAnnouncement(
        chatId,
        [
          { id: 8801n, firstName: "Ada" },
          { id: 8802n, firstName: "Bo" },
        ],
        { now: clock.now },
      );
    await harness.send(callbackUpdate(chatId, 8801n, cannotAttendToken));
    harness.reset();

    // Well inside `READY_ANNOUNCE_COOLDOWN_MS`.
    clock.advance(60 * 1000);
    await harness.send(callbackUpdate(chatId, 8801n, canAttendToken));

    // No second notification: the message on screen is made truthful instead.
    expect(harness.countOf("sendMessage")).toBe(0);
    const edits = editsTo(harness, announced.announcementMessageId);
    expect(edits).toHaveLength(1);
    expect(String(edits[0]?.payload.text)).toContain("Ready to book");
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.announcementMessageId).toBe(announced.announcementMessageId);
    expect(round.readyAnnouncedAt?.getTime()).toBe(
      announced.readyAnnouncedAt?.getTime(),
    );
    expect(
      harness
        .lines()
        .filter((line) => line.reason === "unanimity-inside-announce-cooldown"),
    ).toHaveLength(1);
  });

  it("posts a fresh announcement after the cooldown and clears the old copy", async () => {
    const chatId = -1011000000018n;
    const clock = createClock(NOW);
    const { harness, draft, announced, canAttendToken, cannotAttendToken } =
      await reachAnnouncement(
        chatId,
        [
          { id: 8901n, firstName: "Ada" },
          { id: 8902n, firstName: "Bo" },
        ],
        { now: clock.now },
      );
    // The control the FIRST announcement carried, read off the message the bot
    // actually sent — the token the re-announcement must render again (G-02).
    const firstBookToken = tokenLabelled(
      harness.lastOf("sendMessage"),
      PLANNING_BOOK_LABEL,
    );
    await harness.send(callbackUpdate(chatId, 8901n, cannotAttendToken));
    harness.reset();

    clock.advance(READY_ANNOUNCE_COOLDOWN_MS + 60 * 1000);
    await harness.send(callbackUpdate(chatId, 8901n, canAttendToken));

    // A slot that becomes workable again later in the day still breaks through.
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toContain(
      "Ready to book",
    );
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.announcementMessageId).toBe(harness.lastSentMessageId());
    expect(round.announcementMessageId).not.toBe(
      announced.announcementMessageId,
    );
    // The round never has two live announcements: the superseded copy has its
    // keyboard cleared in the same act, so every later retraction and closing
    // edit — all of which address `announcementMessageId` alone — reaches the
    // only announcement still on screen (T-03-27).
    const cleared = editsTo(harness, announced.announcementMessageId);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]?.payload.reply_markup).toBeUndefined();
    // And the availability card is still the anchor, still with both controls.
    expect(round.anchorMessageId).toBe(draft.anchorMessageId);
    expect(
      keyboardButtons(editsTo(harness, draft.anchorMessageId).at(-1)),
    ).toHaveLength(2);

    // G-02. The claim is no longer a minting site: it guarantees a live control
    // exists before the announcement is posted, and this round already had one.
    // The fresh announcement therefore carries the round's EXISTING booking
    // token, and the live standing count is still exactly one.
    expect(
      tokenLabelled(harness.lastOf("sendMessage"), PLANNING_BOOK_LABEL),
    ).toBe(firstBookToken);
    expect(await liveBookingRequestsFor(draft.id, clock.now())).toBe(1);
  });

  it("edits and sends nothing for a round that never announced", async () => {
    const chatId = -1011000000019n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 9001n, firstName: "Ada" },
      { id: 9002n, firstName: "Bo" },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, harness);
    await harness.send(callbackUpdate(chatId, 9001n, canAttendToken));
    harness.reset();

    // The round reaches `blocked` without ever having been unanimous.
    await harness.send(callbackUpdate(chatId, 9002n, cannotAttendToken));

    expect(harness.countOf("sendMessage")).toBe(0);
    // Exactly one edit, and it is the availability card's.
    expect(harness.countOf("editMessageText")).toBe(1);
    expect(harness.lastOf("editMessageText")?.payload.message_id).toBe(
      draft.anchorMessageId,
    );
    const round = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(round.readyAnnouncedAt).toBeNull();
    expect(round.announcementMessageId).toBeNull();
  });

  it("edits the announcement once for a repeat that leaves the outcome unchanged", async () => {
    const chatId = -1011000000020n;
    const { harness, announced, cannotAttendToken } = await reachAnnouncement(
      chatId,
      [
        { id: 9101n, firstName: "Ada" },
        { id: 9102n, firstName: "Bo" },
        { id: 9103n, firstName: "Cy" },
      ],
    );
    await harness.send(callbackUpdate(chatId, 9101n, cannotAttendToken));
    harness.reset();

    // A SECOND participant says no. The outcome is still `blocked`, so the
    // retraction renders byte-identically and the fingerprint absorbs it.
    await harness.send(callbackUpdate(chatId, 9102n, cannotAttendToken));

    expect(editsTo(harness, announced.announcementMessageId)).toHaveLength(0);
    // The card itself still changed — the second marker moved.
    expect(harness.countOf("editMessageText")).toBe(1);
  });

  it("absorbs a retraction edit Telegram rejects without touching the answer", async () => {
    const chatId = -1011000000021n;
    let failEditOf: number | null = null;
    const { harness, draft, announced, cannotAttendToken } =
      await reachAnnouncement(
        chatId,
        [
          { id: 9201n, firstName: "Ada" },
          { id: 9202n, firstName: "Bo" },
        ],
        {
          onCall: async (call) => {
            if (
              call.method === "editMessageText" &&
              call.payload.message_id === failEditOf
            ) {
              throw new Error("Telegram rejected the retraction");
            }
          },
        },
      );
    failEditOf = announced.announcementMessageId;
    harness.reset();

    await harness.send(callbackUpdate(chatId, 9201n, cannotAttendToken));

    // The answer is committed regardless of what Telegram did to the message.
    expect(
      (await participantsOf(draft.id)).map((row) => row.availability),
    ).toEqual(["UNAVAILABLE", "AVAILABLE"]);
    const failures = harness
      .lines()
      .filter((line) => line.outcome === "announce-failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toBe("telegram-rejected-the-announcement");
    // Absorbed: no compensating message, and the claim still stands.
    expect(harness.countOf("sendMessage")).toBe(0);
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: draft.id },
        })
      ).readyAnnouncedAt,
    ).not.toBeNull();
  });
});

/**
 * AVAIL-04 / AVAIL-07 `ordering`, one level below the rendered lines (G-02).
 *
 * The ten-item ledger resolved the ordering edge as "line order is fixed at
 * every render and never reshuffles as answers arrive", and `sortRosterMembers`
 * makes that true of the TEXT. It was never true of the KEYBOARD: the tokens
 * behind the controls came from an unordered `findMany`, and `controlTokens`
 * collapses the rows into a map keyed by control with the LAST row winning — so
 * which token a button carried depended on physical row order. Two renders of an
 * unchanged round could then differ, which falsifies the edit path's render
 * fingerprint and leaves the ordering guarantee true of the lines and false of
 * the buttons.
 *
 * The duplicate is SEEDED rather than produced, and deliberately so: once D-23
 * bounds the standing booking capability at one row, and with the two answer
 * rows carrying distinct targets, the product path no longer produces a
 * duplicate at all — a case that merely rendered twice would pass vacuously and
 * the one probe edge this plan re-opens would be asserted by nothing.
 */
describe("the keyboard does not depend on physical row order (D-24)", () => {
  it("renders the NEWEST row for a duplicated control, twice identically", async () => {
    // Its own chat id: every case in this file shares one container and one
    // `chatConfiguration` row per chat, so reusing an id fails the unique key
    // before the assertion is ever reached.
    const chatId = -1011000000022n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 9201n, firstName: "Ada" },
      { id: 9202n, firstName: "Bo" },
    ]);
    const clock = createClock(NOW);
    const harness = createHarness({ prisma, chatId, now: clock.now });
    const { draft } = await reachAvailability(chatId, harness);

    // A second live row for the SAME answer target as one the confirm
    // transaction minted: same chat, same kind, same target string, a fresh
    // token, unconsumed, and an expiry in the future. Its `createdAt` is
    // deliberately EARLIER than the original's, so the row PostgreSQL returns
    // last in heap order is the OLDER of the two — which is what makes this case
    // go red without the ascending order instead of passing by accident.
    const original = await prisma.callbackAction.findFirstOrThrow({
      where: {
        targetId: JSON.stringify({
          action: "answer",
          roundId: draft.id,
          answer: "AVAILABLE",
        }),
      },
    });
    await prisma.callbackAction.create({
      data: {
        token: `seeded-duplicate-${draft.id}`,
        kind: "PLANNING",
        chatId,
        actorUserId: AUTHOR_ID,
        targetId: original.targetId,
        expiresAt: original.expiresAt,
        consumedAt: null,
        createdAt: new Date(original.createdAt.getTime() - 1000),
      },
    });
    harness.reset();

    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_status"));
    const first = keyboardButtons(harness.lastOf("sendMessage"));
    clock.advance(PLANNING_STATUS_COOLDOWN_MS + 1000);
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan_status"));
    const second = keyboardButtons(harness.lastOf("sendMessage"));

    // Byte-identical keyboards, tokens included.
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
    // D-24: ascending order means the NEWEST row is the one the last-row-wins
    // collapse keeps, which is the behaviour a reader of that loop expects.
    expect(
      first.find((button) => button.text.endsWith(PLANNING_CAN_ATTEND_LABEL))
        ?.callback_data,
    ).toBe(original.token);
    // AVAIL-02 / D-04: both answer controls are still there, and rendering
    // consumes neither row — not even the duplicate it did not choose.
    expect(
      first.map((button) => button.text.endsWith(PLANNING_CANNOT_ATTEND_LABEL)),
    ).toEqual([false, true]);
    const rows = await prisma.callbackAction.findMany({
      where: { targetId: original.targetId },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.consumedAt === null)).toBe(true);
  });
});

/**
 * Gap G-03, half one: the claim a failed pointer write leaves behind (D-26).
 *
 * `recordAnnouncement` is a post-send write with no compensation. When it
 * fails, the message is live in the chat carrying a Mark-as-booked control
 * while `announcementMessageId` stays null — and every correction path in the
 * phase is guarded on that column being non-null, so the orphan goes on
 * asserting that the rehearsal is ready to book after unanimity is lost and
 * after the round is booked.
 *
 * `releaseAnnouncementClaim` is the compensation, and its guard is what keeps
 * it from becoming the flood amplifier the claim exists to prevent: it fires
 * only while the round still carries the exact instant this dispatch claimed
 * AND still has no addressable announcement.
 */
describe("handing back a claim whose message could not be addressed (D-26)", () => {
  /**
   * A round left carrying a claim with a null announcement pointer.
   *
   * Produced by failing the real send rather than by seeding the columns: the
   * state under test is one the production path actually reaches (T-03-25), and
   * a seeded row would not prove that.
   */
  async function reachStrandedClaim(chatId: bigint, member: bigint) {
    await configureChat(chatId);
    await addMembers(chatId, [{ id: member, firstName: "Ada" }]);
    let failSend = false;
    const harness = createHarness({
      prisma,
      chatId,
      onCall: async (call) => {
        if (failSend && call.method === "sendMessage") {
          throw new Error("Telegram rejected the announcement");
        }
      },
    });
    const reached = await reachAvailability(chatId, harness);
    failSend = true;
    await harness.send(callbackUpdate(chatId, member, reached.canAttendToken));
    const stranded = await prisma.planningRound.findUniqueOrThrow({
      where: { id: reached.draft.id },
    });
    expect(stranded.readyAnnouncedAt).not.toBeNull();
    expect(stranded.announcementMessageId).toBeNull();
    return { harness, stranded, ...reached };
  }

  it("restores the value the claim replaced and answers released", async () => {
    const chatId = -1011000000023n;
    const { stranded } = await reachStrandedClaim(chatId, 9301n);
    const service = new PlanningService(prisma);

    const released = await service.releaseAnnouncementClaim(
      stranded.id,
      stranded.readyAnnouncedAt as Date,
      // The pre-claim value for a round's FIRST announcement.
      null,
    );

    expect(released).toEqual({ kind: "released" });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(after.readyAnnouncedAt).toBeNull();
    // Nothing else moved: the release is not a step transition (D-26).
    expect(after.revision).toBe(stranded.revision);
    expect(after.announcementMessageId).toBeNull();
  });

  it("restores a previous timestamp rather than nulling the column", async () => {
    // D-18 says `readyAnnouncedAt` is never nulled, and D-26 is deliberately
    // narrower than a repeal of it: the restore value is what the claim
    // REPLACED, which for a re-announce is the previous announcement's instant.
    const chatId = -1011000000024n;
    const { stranded } = await reachStrandedClaim(chatId, 9401n);
    const previous = new Date(
      (stranded.readyAnnouncedAt as Date).getTime() -
        READY_ANNOUNCE_COOLDOWN_MS -
        60 * 1000,
    );
    const service = new PlanningService(prisma);

    const released = await service.releaseAnnouncementClaim(
      stranded.id,
      stranded.readyAnnouncedAt as Date,
      previous,
    );

    expect(released).toEqual({ kind: "released" });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(after.readyAnnouncedAt?.getTime()).toBe(previous.getTime());
  });

  it("writes nothing when the claim has already moved on", async () => {
    // T-03-53: a claim won by somebody else in the meantime is never released
    // by us. The compare-and-set is guarded on the exact instant we claimed.
    const chatId = -1011000000025n;
    const { stranded } = await reachStrandedClaim(chatId, 9501n);
    const service = new PlanningService(prisma);

    const refused = await service.releaseAnnouncementClaim(
      stranded.id,
      new Date((stranded.readyAnnouncedAt as Date).getTime() + 1000),
      null,
    );

    expect(refused).toEqual({ kind: "refused" });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(after.readyAnnouncedAt?.getTime()).toBe(
      (stranded.readyAnnouncedAt as Date).getTime(),
    );
  });

  it("writes nothing for a round that still points at an announcement", async () => {
    // D-33's discriminator, at the statement. A round with an addressable
    // announcement is not compensated: every correction path still reaches that
    // copy, and handing the window back would permit a second notification for
    // nothing. This is also why the `/plan_status` re-announce path — reachable
    // only for a round whose pointer is non-null — is excluded by construction.
    const chatId = -1011000000026n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9601n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { draft, canAttendToken } = await reachAvailability(chatId, harness);
    await harness.send(callbackUpdate(chatId, 9601n, canAttendToken));
    const announced = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(announced.announcementMessageId).not.toBeNull();
    const service = new PlanningService(prisma);

    const refused = await service.releaseAnnouncementClaim(
      announced.id,
      announced.readyAnnouncedAt as Date,
      null,
    );

    expect(refused).toEqual({ kind: "refused" });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: announced.id },
    });
    expect(after.readyAnnouncedAt?.getTime()).toBe(
      (announced.readyAnnouncedAt as Date).getTime(),
    );
    expect(after.announcementMessageId).toBe(announced.announcementMessageId);
  });

  it("writes nothing for a round that is no longer confirmed", async () => {
    const chatId = -1011000000027n;
    const { stranded } = await reachStrandedClaim(chatId, 9701n);
    await prisma.planningRound.update({
      where: { id: stranded.id },
      data: {
        status: "BOOKED",
        bookedAt: NOW,
        bookedByUserId: 9701n,
        activeWeekStart: null,
      },
    });
    const service = new PlanningService(prisma);

    const refused = await service.releaseAnnouncementClaim(
      stranded.id,
      stranded.readyAnnouncedAt as Date,
      null,
    );

    expect(refused).toEqual({ kind: "refused" });
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: stranded.id },
    });
    expect(after.readyAnnouncedAt?.getTime()).toBe(
      (stranded.readyAnnouncedAt as Date).getTime(),
    );
  });

  it("answers a failure rather than throwing", async () => {
    // The shape every sibling announcement write uses: a closed `kind` union,
    // so the Telegram surface never has to interpret an exception.
    const broken = {
      planningRound: {
        updateMany: async () => {
          throw new Error("connection lost while releasing the claim");
        },
      },
    } as unknown as ConstructorParameters<typeof PlanningService>[0];

    const failed = await new PlanningService(broken).releaseAnnouncementClaim(
      "round-that-cannot-be-written",
      NOW,
      null,
    );

    expect(failed.kind).toBe("failed");
    expect((failed as { kind: "failed"; error: unknown }).error).toBeInstanceOf(
      Error,
    );
  });
});

/**
 * Gap G-03, half two: the retract-or-edit decision is read, not remembered.
 *
 * `answerAvailability` reads the round at the TOP of its transaction, and the
 * announcement decision is made at the bottom — after the participant write.
 * A concurrent dispatch that points the round at an announcement in between
 * leaves the caller's snapshot describing a round with no announcement, and a
 * decision derived from it skips a correction the chat can see is needed.
 *
 * The interference is interposed immediately before the participant answer
 * write, which is exactly the window: after the snapshot, before the decision.
 */
describe("the announcement decision reads the round inside the transaction", () => {
  const CONCURRENT_ANNOUNCEMENT_ID = 4343;

  function editsTo(
    harness: ReturnType<typeof createHarness>,
    messageId: number,
  ) {
    return harness
      .allOf("editMessageText")
      .filter((call) => call.payload.message_id === messageId);
  }

  /**
   * Drives a two-member round to its final answer with one committed round-row
   * write interposed after the answer transaction's snapshot.
   */
  async function answerWithConcurrentAnnouncement(
    chatId: bigint,
    members: readonly MemberSpec[],
    finalAnswer: "can" | "cannot",
  ) {
    await configureChat(chatId);
    await addMembers(chatId, members);
    const setup = createHarness({ prisma, chatId });
    const { draft, canAttendToken, cannotAttendToken } =
      await reachAvailability(chatId, setup);
    // The first member answers normally; the round is still collecting.
    await setup.send(callbackUpdate(chatId, members[0]!.id, canAttendToken));

    const concurrent = connect();
    const racing = withParticipantAnswerInterference(prisma, async () => {
      // What a concurrent dispatch commits once its announcement has landed:
      // the claim, and the pointer to the message carrying it.
      await concurrent.planningRound.update({
        where: { id: draft.id },
        data: {
          readyAnnouncedAt: NOW,
          announcementMessageId: CONCURRENT_ANNOUNCEMENT_ID,
        },
      });
    });
    const harness = createHarness({ prisma: racing, chatId });
    await harness.send(
      callbackUpdate(
        chatId,
        members[1]!.id,
        finalAnswer === "can" ? canAttendToken : cannotAttendToken,
      ),
    );
    return { harness, draft };
  }

  it("edits the announcement a refused claim can now see", async () => {
    const chatId = -1011000000028n;
    const { harness } = await answerWithConcurrentAnnouncement(
      chatId,
      [
        { id: 9801n, firstName: "Ada" },
        { id: 9802n, firstName: "Bo" },
      ],
      "can",
    );

    // The claim is refused — the concurrent dispatch already spent the window —
    // so this answer must not notify anybody.
    expect(harness.countOf("sendMessage")).toBe(0);
    // But the message it can now see IS corrected, so the announcement lists
    // the participant whose answer just committed.
    const corrections = editsTo(harness, CONCURRENT_ANNOUNCEMENT_ID);
    expect(corrections).toHaveLength(1);
    expect(String(corrections[0]?.payload.text)).toContain("Ready to book");
    expect(
      harness
        .lines()
        .filter((line) => line.reason === "unanimity-inside-announce-cooldown"),
    ).toHaveLength(1);
  });

  it("retracts the announcement a lost unanimity can now see", async () => {
    const chatId = -1011000000029n;
    const { harness } = await answerWithConcurrentAnnouncement(
      chatId,
      [
        { id: 9901n, firstName: "Ada" },
        { id: 9902n, firstName: "Bo" },
      ],
      "cannot",
    );

    expect(harness.countOf("sendMessage")).toBe(0);
    const retraction = editsTo(harness, CONCURRENT_ANNOUNCEMENT_ID);
    expect(retraction).toHaveLength(1);
    const text = String(retraction[0]?.payload.text);
    expect(text).toContain("no longer works");
    expect(retraction[0]?.payload.reply_markup).toBeUndefined();
    expect(
      harness
        .lines()
        .filter(
          (line) => line.reason === "unanimity-lost-announcement-retracted",
        ),
    ).toHaveLength(1);
  });
});
