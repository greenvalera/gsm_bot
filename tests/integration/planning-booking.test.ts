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

/** The roster every ready-to-book fixture uses: the author and one other member. */
const BAND: readonly MemberSpec[] = [
  { id: AUTHOR_ID, firstName: "Ada" },
  { id: MEMBER_ID, firstName: "Bo" },
];

/** `administrator` for the given ids, `member` for everyone else. */
const roleTable =
  (roles: Readonly<Record<string, CurrentTelegramRole>>) =>
  (_chatId: bigint, actorId: bigint): CurrentTelegramRole =>
    roles[actorId.toString()] ?? "member";

/**
 * Drives a chat through the real wizard, Confirm and both answers, so the
 * announcement under test is the one the product actually posted.
 *
 * Deliberately never a hand-seeded round: the booking token has to be the one
 * the announcement claim minted, and the unanimity the apply transaction
 * re-derives has to come from participant rows a real answer wrote.
 */
async function reachReadyToBook(
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
  await harness.send(
    callbackUpdate(
      chatId,
      AUTHOR_ID,
      tokenLabelled(harness.lastOf("editMessageText"), PLANNING_CONFIRM_LABEL),
    ),
  );
  const availabilityCard = harness.lastOf("editMessageText");
  const canAttendToken = tokenLabelled(
    availabilityCard,
    PLANNING_CAN_ATTEND_LABEL,
  );
  const cannotAttendToken = tokenLabelled(
    availabilityCard,
    PLANNING_CANNOT_ATTEND_LABEL,
  );
  for (const member of BAND) {
    await harness.send(callbackUpdate(chatId, member.id, canAttendToken));
  }

  const round = await prisma.planningRound.findFirstOrThrow({
    where: { chatId },
  });
  const announcement = harness.lastOf("sendMessage");
  return {
    round,
    announcement,
    announcementMessageId: round.announcementMessageId ?? 0,
    canAttendToken,
    cannotAttendToken,
    bookToken: tokenLabelled(announcement, PLANNING_BOOK_LABEL),
  };
}

const roundOf = (id: string) =>
  prisma.planningRound.findUniqueOrThrow({ where: { id } });

const actionOf = (token: string) =>
  prisma.callbackAction.findUniqueOrThrow({ where: { token } });

/**
 * Drives a chat to ready-to-book and then opens the named confirmation on it.
 *
 * The confirm and keep tokens are read off the message the request tap actually
 * produced, never minted by the test: what LIFE-01 needs proved is that the pair
 * a person can really see is the pair the apply transaction accepts.
 */
async function openConfirmation(
  chatId: bigint,
  harness: ReturnType<typeof createHarness>,
  requesterId: bigint = AUTHOR_ID,
) {
  const ready = await reachReadyToBook(chatId, harness);
  await harness.send(callbackUpdate(chatId, requesterId, ready.bookToken));
  const confirmation = harness.lastEditOf(ready.announcementMessageId);
  return {
    ...ready,
    applyToken: tokenLabelled(confirmation, PLANNING_BOOK_CONFIRM_LABEL),
    keepToken: tokenLabelled(confirmation, PLANNING_BOOK_KEEP_LABEL),
  };
}

describe("the ready-to-book announcement carries the booking control", () => {
  it("offers the named confirm/keep pair and books nothing (D-14)", async () => {
    const chatId = -1012000000001n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcement, announcementMessageId, bookToken } =
      await reachReadyToBook(chatId, harness);

    // The announcement really did arrive with exactly one control.
    expect(labelsOf(announcement)).toEqual([PLANNING_BOOK_LABEL]);
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));

    const confirmation = harness.lastEditOf(announcementMessageId);
    expect(confirmation).toBeDefined();
    expect(labelsOf(confirmation)).toEqual([
      PLANNING_BOOK_CONFIRM_LABEL,
      PLANNING_BOOK_KEEP_LABEL,
    ]);
    // Nothing durable moved: the request opens a confirmation, it does not book.
    const after = await roundOf(round.id);
    expect(after.status).toBe("CONFIRMED");
    expect(after.bookedAt).toBeNull();
    expect(after.bookedByUserId).toBeNull();
    // And the request row is a STANDING capability: somebody who opens a
    // confirmation and walks away must be able to open another.
    expect((await actionOf(bookToken)).consumedAt).toBeNull();
  });

  it("accepts a current administrator who is not the author (D-13)", async () => {
    const chatId = -1012000000002n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    harness.reset();

    await harness.send(callbackUpdate(chatId, ADMIN_ID, bookToken));

    expect(labelsOf(harness.lastEditOf(announcementMessageId))).toEqual([
      PLANNING_BOOK_CONFIRM_LABEL,
      PLANNING_BOOK_KEEP_LABEL,
    ]);
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
  });

  it("refuses a snapshot participant who is neither, privately and without an edit", async () => {
    const chatId = -1012000000003n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { bookToken } = await reachReadyToBook(chatId, harness);
    harness.reset();

    await harness.send(callbackUpdate(chatId, MEMBER_ID, bookToken));

    const answer = harness.lastOf("answerCallbackQuery");
    expect(String(answer?.payload.text)).toContain("administrator");
    expect(answer?.payload.show_alert).toBe(true);
    // T-03-38: the refusal is read-only and precedes the consume, so the only
    // control the band has for recording a booking is still spendable.
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(harness.countOf("sendMessage")).toBe(0);
    expect((await actionOf(bookToken)).consumedAt).toBeNull();
  });

  it("refuses an actor whose role lookup cannot be resolved", async () => {
    // Driven at the SERVICE seam rather than through a callback update: the
    // boundary already denies an `unknown` role as a non-member, which would
    // prove only that the boundary works. What LIFE-01 needs is that the
    // eligibility check itself fails CLOSED on an unanswerable lookup.
    const chatId = -1012000000004n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, bookToken } = await reachReadyToBook(chatId, harness);

    const planning = new PlanningService(prisma);
    const result = await planning.requestBooking(
      chatId,
      ADMIN_ID,
      bookToken,
      NOW,
      async () => "unknown",
    );

    expect(result.kind).toBe("not-eligible");
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
    expect((await actionOf(bookToken)).consumedAt).toBeNull();
  });

  it("refuses a request once unanimity has been lost", async () => {
    const chatId = -1012000000005n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, bookToken, cannotAttendToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    // Somebody changes their mind after the announcement (D-04).
    await harness.send(callbackUpdate(chatId, MEMBER_ID, cannotAttendToken));
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));

    const answer = harness.lastOf("answerCallbackQuery");
    expect(String(answer?.payload.text).toLowerCase()).toContain(
      "no longer make",
    );
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
    expect((await actionOf(bookToken)).consumedAt).toBeNull();
  });
});

describe("the confirmation is not bound to whoever opened it (D-19)", () => {
  it("lets a second eligible person complete a confirmation the author opened", async () => {
    const chatId = -1012000000006n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));
    const keepToken = tokenLabelled(
      harness.lastEditOf(announcementMessageId),
      PLANNING_BOOK_KEEP_LABEL,
    );
    harness.reset();

    // The ADMINISTRATOR completes the pair the AUTHOR opened. Phase 1's
    // roster-removal precedent binds its pair to the requester; this one
    // deliberately does not, because D-13 exists so no single person is a point
    // of failure for recording a fact that is already true.
    await harness.send(callbackUpdate(chatId, ADMIN_ID, keepToken));

    const restored = harness.lastEditOf(announcementMessageId);
    expect(labelsOf(restored)).toEqual([PLANNING_BOOK_LABEL]);
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
    expect((await actionOf(keepToken)).consumedAt).not.toBeNull();
  });

  it("restores the ready announcement on keep and answers a replay as applied", async () => {
    const chatId = -1012000000007n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));
    const keepToken = tokenLabelled(
      harness.lastEditOf(announcementMessageId),
      PLANNING_BOOK_KEEP_LABEL,
    );

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, keepToken));
    const restored = harness.lastEditOf(announcementMessageId);
    expect(String(restored?.payload.text)).toContain("Ready to book");
    // The restored announcement carries a LIVE control, not a picture of one.
    const restoredBookToken = tokenLabelled(restored, PLANNING_BOOK_LABEL);
    expect((await actionOf(restoredBookToken)).consumedAt).toBeNull();
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");

    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, keepToken));

    // A replay affects zero rows and gets the established already-applied text.
    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toBe(
      "Already applied.",
    );
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
  });
});

describe("confirming books the round under a revision guard (LIFE-01)", () => {
  it("moves confirmed to booked and records who did it", async () => {
    const chatId = -1012000000008n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken } = await openConfirmation(chatId, harness);
    const before = await roundOf(round.id);
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));

    const after = await roundOf(round.id);
    // D-15: the STATUS is the lifecycle position. `bookedAt` and
    // `bookedByUserId` are its detail, recorded for Phase 4 and for forensics,
    // and no call site anywhere reads either to decide whether a round is booked.
    expect(after.status).toBe("BOOKED");
    expect(after.bookedAt).not.toBeNull();
    expect(after.bookedByUserId).toBe(AUTHOR_ID);
    // Exactly one, from the guarded update — not two from a second write.
    expect(after.revision).toBe(before.revision + 1);
    expect((await actionOf(applyToken)).consumedAt).not.toBeNull();
  });

  it("lets a current administrator book, and records the administrator", async () => {
    const chatId = -1012000000009n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({
      prisma,
      chatId,
      role: roleTable({ [ADMIN_ID.toString()]: "administrator" }),
    });
    // The AUTHOR opens the pair, the ADMINISTRATOR completes it (D-19).
    const { round, applyToken } = await openConfirmation(chatId, harness);
    harness.reset();

    await harness.send(callbackUpdate(chatId, ADMIN_ID, applyToken));

    const after = await roundOf(round.id);
    expect(after.status).toBe("BOOKED");
    expect(after.bookedByUserId).toBe(ADMIN_ID);
  });

  it("refuses an administrator demoted between the request and the confirm", async () => {
    // T-03-32, and the whole reason the role is resolved a SECOND time on the
    // apply path: rendering is never authority, and the person who opened the
    // confirmation may no longer be allowed to finish it.
    const chatId = -1012000000010n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    let demoted = false;
    const harness = createHarness({
      prisma,
      chatId,
      role: (_chatId, actorId) =>
        actorId === ADMIN_ID && !demoted ? "administrator" : "member",
    });
    const { round, applyToken } = await openConfirmation(
      chatId,
      harness,
      ADMIN_ID,
    );
    demoted = true;
    harness.reset();

    await harness.send(callbackUpdate(chatId, ADMIN_ID, applyToken));

    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain("administrator");
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
    // T-03-38: the refusal is read-only and precedes the consume, so the author
    // can still complete the same confirmation.
    expect((await actionOf(applyToken)).consumedAt).toBeNull();
  });

  it("refuses a confirm whose slot died after the confirmation was opened", async () => {
    const chatId = -1012000000011n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken, cannotAttendToken } = await openConfirmation(
      chatId,
      harness,
    );
    // D-04 keeps answers changeable right up until booking closes the round.
    await harness.send(callbackUpdate(chatId, MEMBER_ID, cannotAttendToken));
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));

    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text).toLowerCase(),
    ).toContain("no longer make");
    expect((await roundOf(round.id)).status).toBe("CONFIRMED");
    expect((await actionOf(applyToken)).consumedAt).toBeNull();
  });

  it("answers a replayed confirm as applied and does not move the round twice", async () => {
    const chatId = -1012000000012n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken } = await openConfirmation(chatId, harness);

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));
    const booked = await roundOf(round.id);
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));

    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toBe(
      "Already applied.",
    );
    const afterReplay = await roundOf(round.id);
    expect(afterReplay.revision).toBe(booked.revision);
    expect(afterReplay.bookedAt).toEqual(booked.bookedAt);
  });

  it("refuses a second live confirmation once the round is booked", async () => {
    const chatId = -1012000000013n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken, applyToken } =
      await openConfirmation(chatId, harness);
    // The request row is a STANDING capability, so a second tap opens a second
    // pair — and that pair's confirm token is unconsumed when the round books.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));
    const secondApplyToken = tokenLabelled(
      harness.lastEditOf(announcementMessageId),
      PLANNING_BOOK_CONFIRM_LABEL,
    );
    expect(secondApplyToken).not.toBe(applyToken);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));
    expect((await roundOf(round.id)).status).toBe("BOOKED");
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, secondApplyToken));

    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text).toLowerCase(),
    ).toContain("already booked");
    expect((await actionOf(secondApplyToken)).consumedAt).toBeNull();
  });

  it("releases the confirm token when the guarded round update loses its race", async () => {
    // RELI-02. The consume and the guarded transition are one transaction: if
    // the transition loses, the consume must not survive it, or the band is
    // left holding a spent control for a booking that never happened.
    const chatId = -1012000000014n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken } = await openConfirmation(chatId, harness);

    const competitor = connect();
    const raced = withPlanningRoundInterference(prisma, async () => {
      await competitor.planningRound.update({
        where: { id: round.id },
        data: { revision: { increment: 1 } },
      });
    });
    const result = await new PlanningService(raced).applyBooking(
      chatId,
      AUTHOR_ID,
      applyToken,
      null,
      NOW,
      async () => "member",
    );

    expect(result.kind).toBe("stale");
    const afterRace = await roundOf(round.id);
    expect(afterRace.status).toBe("CONFIRMED");
    expect(afterRace.bookedAt).toBeNull();
    // Indistinguishable from never having consumed it: the release committed in
    // the same transaction as the consume.
    expect((await actionOf(applyToken)).consumedAt).toBeNull();

    // And the released token is genuinely spendable again.
    const retried = await new PlanningService(prisma).applyBooking(
      chatId,
      AUTHOR_ID,
      applyToken,
      null,
      NOW,
      async () => "member",
    );
    expect(retried.kind).toBe("booked");
    expect((await roundOf(round.id)).status).toBe("BOOKED");
  });
});
