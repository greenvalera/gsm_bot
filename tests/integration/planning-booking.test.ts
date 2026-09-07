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

/** The serialized target of the round's ONE standing booking capability. */
const bookRequestTarget = (roundId: string) =>
  JSON.stringify({ action: "book-request", roundId });

/**
 * How many LIVE standing booking rows the round has, at the database (G-02).
 *
 * Matched on the exact serialized target rather than on a `contains` of the
 * round id, for the reason the answer-row counter in `planning-recovery.test.ts`
 * gives: the wizard mints a token per day, per hour and per trailing control
 * against the same round, so a substring count answers twenty-odd and would
 * report "unchanged" just as happily if a keep had minted a second booking row.
 * The number under test is how many buttons can open a booking confirmation for
 * this round, and after D-23 that number is one, at every instant.
 */
const liveBookingRequestsFor = (roundId: string) =>
  prisma.callbackAction.count({
    where: {
      kind: "PLANNING",
      targetId: bookRequestTarget(roundId),
      consumedAt: null,
      expiresAt: { gt: NOW },
    },
  });

/** Every standing booking row for the round, live or not — the insert counter. */
const allBookingRequestsFor = (roundId: string) =>
  prisma.callbackAction.count({
    where: { targetId: bookRequestTarget(roundId) },
  });

type ConfirmationAction = "book-apply" | "book-keep";

const confirmationTarget = (roundId: string, action: ConfirmationAction) =>
  JSON.stringify({ action, roundId });

/**
 * How many LIVE rows of one confirmation control the round has (WR-06).
 *
 * "Live" is the boundary's own definition — unconsumed and not yet expired —
 * because that is exactly the set of tokens that can still act on the round. A
 * superseded pair stays in the table by design (D-25) and must not be counted
 * here, which is what makes this the number the review asked to be bounded.
 */
const liveConfirmationsFor = (roundId: string, action: ConfirmationAction) =>
  prisma.callbackAction.count({
    where: {
      kind: "PLANNING",
      targetId: confirmationTarget(roundId, action),
      consumedAt: null,
      expiresAt: { gt: NOW },
    },
  });

/** Every confirmation row of one kind, live or not — the not-deleted counter. */
const allConfirmationsFor = (roundId: string, action: ConfirmationAction) =>
  prisma.callbackAction.count({
    where: { targetId: confirmationTarget(roundId, action) },
  });

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

describe("the standing booking capability is ensured, never re-minted (G-02)", () => {
  it("leaves exactly one live standing row across five request/keep cycles", async () => {
    // T-03-45. `keepBooking` used to mint a FRESH booking row on every keep, so
    // a band that opened a confirmation and backed out repeatedly accumulated
    // one live write capability per cycle — all of them unconsumed, unexpired
    // and invisible, because only the newest was ever rendered. D-23 makes the
    // count answerable rather than merely eventually-small: at most one, at
    // every instant, whatever the round has been through.
    const chatId = -1012000000019n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    expect(await liveBookingRequestsFor(round.id)).toBe(1);

    let currentBookToken = bookToken;
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, currentBookToken));
      const keepToken = tokenLabelled(
        harness.lastEditOf(announcementMessageId),
        PLANNING_BOOK_KEEP_LABEL,
      );
      await harness.send(callbackUpdate(chatId, AUTHOR_ID, keepToken));

      const restored = harness.lastEditOf(announcementMessageId);
      expect(String(restored?.payload.text)).toContain("Ready to book");
      // The SAME token every time: the restored announcement still needs a live
      // control, but it does not need a NEW one.
      currentBookToken = tokenLabelled(restored, PLANNING_BOOK_LABEL);
      expect(currentBookToken).toBe(bookToken);
      expect(await liveBookingRequestsFor(round.id)).toBe(1);
    }

    // And the one surviving row is still spendable — ensured, not consumed.
    expect((await actionOf(bookToken)).consumedAt).toBeNull();
  });

  it("performs no CallbackAction insert for the standing capability on a keep", async () => {
    const chatId = -1012000000020n;
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
    // Counted across ALL rows for the target, live or not: an insert followed by
    // an expiry would still be an insert, and G-02 is about the writes.
    const before = await allBookingRequestsFor(round.id);
    expect(before).toBe(1);

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, keepToken));

    expect(await allBookingRequestsFor(round.id)).toBe(before);
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

  it("refuses a live control from the booking pair once the round is booked", async () => {
    const chatId = -1012000000013n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken, applyToken } =
      await openConfirmation(chatId, harness);
    // The request row is a STANDING capability, so a second tap opens a second
    // pair. Since WR-06 that tap also SUPERSEDES the first pair, so the confirm
    // token that still works is the one on screen — not the earlier one.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, bookToken));
    const secondConfirmation = harness.lastEditOf(announcementMessageId);
    const secondApplyToken = tokenLabelled(
      secondConfirmation,
      PLANNING_BOOK_CONFIRM_LABEL,
    );
    const secondKeepToken = tokenLabelled(
      secondConfirmation,
      PLANNING_BOOK_KEEP_LABEL,
    );
    expect(secondApplyToken).not.toBe(applyToken);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, secondApplyToken));
    expect((await roundOf(round.id)).status).toBe("BOOKED");
    harness.reset();

    // Its own sibling keep control was live and unconsumed when the round
    // booked, and D-16 closes the round to everything.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, secondKeepToken));

    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text).toLowerCase(),
    ).toContain("already booked");
    expect((await actionOf(secondKeepToken)).consumedAt).toBeNull();
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

describe("one live booking confirmation pair per round (WR-06)", () => {
  /** Opens a confirmation on an existing ready announcement and reads its pair. */
  async function requestAgain(
    chatId: bigint,
    harness: ReturnType<typeof createHarness>,
    announcementMessageId: number,
    bookToken: string,
    actorId: bigint = AUTHOR_ID,
  ) {
    await harness.send(callbackUpdate(chatId, actorId, bookToken));
    const confirmation = harness.lastEditOf(announcementMessageId);
    return {
      applyToken: tokenLabelled(confirmation, PLANNING_BOOK_CONFIRM_LABEL),
      keepToken: tokenLabelled(confirmation, PLANNING_BOOK_KEEP_LABEL),
    };
  }

  it("leaves one live pair after a second request, and the visible token is the one that works", async () => {
    // The request row is standing by design, so a double tap on an
    // irreversible-looking button was writing a second pair while the first
    // stayed valid — a booking token that works but is reachable from no screen.
    const chatId = -1012000000021n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    const first = await requestAgain(
      chatId,
      harness,
      announcementMessageId,
      bookToken,
    );
    const second = await requestAgain(
      chatId,
      harness,
      announcementMessageId,
      bookToken,
    );
    expect(second.applyToken).not.toBe(first.applyToken);

    expect(await liveConfirmationsFor(round.id, "book-apply")).toBe(1);
    expect(await liveConfirmationsFor(round.id, "book-keep")).toBe(1);
    harness.reset();

    // The superseded confirm token is refused at the CALLBACK BOUNDARY, before
    // the dispatcher runs, because the boundary already refuses an expired row.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, first.applyToken));
    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain("no longer available");
    const afterStale = await roundOf(round.id);
    expect(afterStale.status).toBe("CONFIRMED");
    expect(afterStale.bookedAt).toBeNull();
    // Refused, not spent: expiring a row is not consuming it.
    expect((await actionOf(first.applyToken)).consumedAt).toBeNull();

    // And the pair the requester can actually see books the round.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, second.applyToken));
    expect((await roundOf(round.id)).status).toBe("BOOKED");
  });

  it("expires the superseded pair rather than deleting it (D-25)", async () => {
    const chatId = -1012000000022n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    const first = await requestAgain(
      chatId,
      harness,
      announcementMessageId,
      bookToken,
    );
    await requestAgain(chatId, harness, announcementMessageId, bookToken);

    // Both superseded rows are STILL THERE, with an expiry at or before the
    // second request's clock. Deleting them would erase the audit trail the
    // token-release tests read and would race `reapExpiredActions`, which
    // measures retention FROM expiry and therefore still reaps them on its own
    // schedule.
    for (const token of [first.applyToken, first.keepToken]) {
      const row = await actionOf(token);
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(row.consumedAt).toBeNull();
    }
    expect(await allConfirmationsFor(round.id, "book-apply")).toBe(2);
    expect(await allConfirmationsFor(round.id, "book-keep")).toBe(2);
  });

  it("leaves two live rows after ten consecutive requests, not twenty", async () => {
    const chatId = -1012000000023n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );

    for (let tap = 1; tap <= 10; tap += 1) {
      await requestAgain(chatId, harness, announcementMessageId, bookToken);
      expect(await liveConfirmationsFor(round.id, "book-apply")).toBe(1);
      expect(await liveConfirmationsFor(round.id, "book-keep")).toBe(1);
    }

    // Two rows written per tap, two live at the end — the writes are the cost of
    // the tap, the LIVE COUNT is the property (T-03-50).
    expect(await allConfirmationsFor(round.id, "book-apply")).toBe(10);
    expect(await allConfirmationsFor(round.id, "book-keep")).toBe(10);
  });

  it("expires nothing when the gate refuses the request", async () => {
    // Every refusal the gate can produce is a READ and precedes every write, so
    // a request from somebody who may not book leaves the live pair somebody
    // else opened exactly as it was (T-03-38).
    const chatId = -1012000000024n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, bookToken } = await reachReadyToBook(
      chatId,
      harness,
    );
    const live = await requestAgain(
      chatId,
      harness,
      announcementMessageId,
      bookToken,
    );
    const before = await actionOf(live.applyToken);
    harness.reset();

    // A snapshot participant who is neither the author nor an administrator.
    await harness.send(callbackUpdate(chatId, MEMBER_ID, bookToken));

    expect(
      String(harness.lastOf("answerCallbackQuery")?.payload.text),
    ).toContain("administrator");
    const after = await actionOf(live.applyToken);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
    expect(after.consumedAt).toBeNull();
    expect(await liveConfirmationsFor(round.id, "book-apply")).toBe(1);
    expect(await liveConfirmationsFor(round.id, "book-keep")).toBe(1);
    // No second pair was written either: the refusal precedes the mint too.
    expect(await allConfirmationsFor(round.id, "book-apply")).toBe(1);
  });

  it("still lets a second eligible person complete the MOST RECENT confirmation (D-19)", async () => {
    // The pair stays unbound to whoever opened it. Bounding the pair must not
    // become binding it: eligibility is still decided entirely by the
    // apply-time re-check, and D-13 exists so no single person is a point of
    // failure for recording a fact that is already true.
    const chatId = -1012000000025n;
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
    await requestAgain(chatId, harness, announcementMessageId, bookToken);
    // The AUTHOR opens the most recent pair, superseding their own first one.
    const current = await requestAgain(
      chatId,
      harness,
      announcementMessageId,
      bookToken,
    );
    harness.reset();

    // The ADMINISTRATOR completes it.
    await harness.send(callbackUpdate(chatId, ADMIN_ID, current.applyToken));

    const booked = await roundOf(round.id);
    expect(booked.status).toBe("BOOKED");
    expect(booked.bookedByUserId).toBe(ADMIN_ID);
  });
});

describe("booking closes the round (D-16)", () => {
  /** Every edit this run addressed at one message id. */
  const editsOf = (
    harness: ReturnType<typeof createHarness>,
    messageId: number,
  ) =>
    harness
      .allOf("editMessageText")
      .filter((call) => Number(call.payload.message_id) === messageId);

  it("leaves nothing to press on either of the round's two messages", async () => {
    const chatId = -1012000000015n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, announcementMessageId, applyToken } = await openConfirmation(
      chatId,
      harness,
    );
    const anchorMessageId = round.anchorMessageId ?? 0;
    expect(anchorMessageId).toBeGreaterThan(0);
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));

    // ONE edit per message, both built from the SAME projection: a second read
    // could disagree with the first about who was on the list.
    expect(editsOf(harness, anchorMessageId)).toHaveLength(1);
    expect(editsOf(harness, announcementMessageId)).toHaveLength(1);

    const card = harness.lastEditOf(anchorMessageId);
    const closed = harness.lastEditOf(announcementMessageId);
    // Not an empty keyboard — no keyboard at all. An empty grammY
    // InlineKeyboard serializes as `[[]]`, which still claims a markup and
    // paints an empty control strip under the message.
    expect(card?.payload.reply_markup).toBeUndefined();
    expect(closed?.payload.reply_markup).toBeUndefined();
    expect(labelsOf(card)).toEqual([]);
    expect(labelsOf(closed)).toEqual([]);
    expect(String(card?.payload.text).toLowerCase()).toContain("booked");
    expect(String(closed?.payload.text).toLowerCase()).toContain("booked");
  });

  it("refuses a late answer tap, changes nothing, and edits nothing", async () => {
    const chatId = -1012000000016n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken, cannotAttendToken } = await openConfirmation(
      chatId,
      harness,
    );
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));
    expect((await roundOf(round.id)).status).toBe("BOOKED");
    harness.reset();

    // A participant tapping a buried copy of the card afterwards (D-16).
    await harness.send(callbackUpdate(chatId, MEMBER_ID, cannotAttendToken));

    const answer = harness.lastOf("answerCallbackQuery");
    expect(String(answer?.payload.text).toLowerCase()).toContain(
      "already booked",
    );
    expect(answer?.payload.show_alert).toBe(true);
    expect(
      (
        await prisma.planningParticipant.findFirstOrThrow({
          where: { roundId: round.id, telegramUserId: MEMBER_ID },
        })
      ).availability,
    ).toBe("AVAILABLE");
    // Nothing durable changed, so the round's card is not spent on the tap.
    expect((await actionOf(cannotAttendToken)).consumedAt).toBeNull();
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(harness.countOf("sendMessage")).toBe(0);
  });

  it("re-posts a booked round as a control-free summary with no booking control", async () => {
    const chatId = -1012000000017n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken } = await openConfirmation(chatId, harness);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));
    harness.reset();

    await harness.send(messageUpdate(chatId, MEMBER_ID, "/plan_status"));

    const posted = harness.lastOf("sendMessage");
    expect(posted).toBeDefined();
    expect(posted?.payload.reply_markup).toBeUndefined();
    expect(labelsOf(posted)).toEqual([]);
    // And specifically NOT the Mark-as-booked control: `loadAvailabilityActions`
    // keeps the request row for a re-post, and a booked round must not get one.
    expect(String(posted?.payload.text)).not.toContain(PLANNING_BOOK_LABEL);
    expect((await roundOf(round.id)).status).toBe("BOOKED");
  });

  it("still claims its target week and is the chat's previous rehearsal", async () => {
    // Plan 03-03 widened `WEEK_CLAIMING_STATUSES` and `previousRehearsal` to
    // admit BOOKED. Both are exercised here against a round the PRODUCT booked,
    // rather than one seeded straight into the position (D-15).
    const chatId = -1012000000018n;
    await configureChat(chatId);
    await addMembers(chatId, BAND);
    const harness = createHarness({ prisma, chatId });
    const { round, applyToken } = await openConfirmation(chatId, harness);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, applyToken));
    const booked = await roundOf(round.id);
    expect(booked.status).toBe("BOOKED");
    harness.reset();

    // The week is claimed: a fresh /plan lands on a DIFFERENT week rather than
    // re-opening an availability round for a rehearsal already booked.
    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));
    const next = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    expect(next.targetWeekStart).not.toBe(booked.targetWeekStart);

    // And it is the chat's previous rehearsal, from a clock after its start.
    const afterTheRehearsal = new Date(
      (booked.startsAt ?? NOW).getTime() + 60 * 60 * 1000,
    );
    const previous = await new PlanningService(prisma).previousRehearsal(
      chatId,
      afterTheRehearsal,
    );
    expect(previous?.id).toBe(booked.id);
  });
});
