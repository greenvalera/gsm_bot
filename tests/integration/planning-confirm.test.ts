import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_BACK_LABEL,
  PLANNING_CONFIRM_LABEL,
  PLANNING_MARKER_CHOSEN,
} from "../../src/telegram/keyboards.js";
import {
  createChatConfiguration,
  transactionFailurePrisma,
} from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { withPlanningRoundInterference } from "../helpers/racing-client.js";

/**
 * D-04 / D-09 / D-10 / D-11 and PLAN-02 / PLAN-09, on real PostgreSQL.
 *
 * Confirm is the one irreversible action in the phase and the only place where
 * four decisions become a single durable fact, so every assertion below is made
 * against the database rather than against a return value: a promotion that
 * released the week but forgot the lineup — or snapshotted the lineup but kept
 * the week — would be invisible to a service-level double and catastrophic in
 * a group chat.
 */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

/** Wednesday 2026-08-26, 12:00 in Europe/Kyiv. */
const NOW = new Date("2026-08-26T09:00:00.000Z");
const CURRENT_WEEK = "2026-08-24";
const NEXT_WEEK = "2026-08-31";
/** Thursday of the target week, and the hour every fixture picks. */
const CHOSEN_DAY_LABEL = "Thu 27";
const CHOSEN_TIME_LABEL = "15:00";
const CHOSEN_DATE = "2026-08-27";
const CHOSEN_MINUTE = 15 * 60;
/** 2026-08-27 15:00 in Kyiv (UTC+3 in August) is 12:00Z. */
const EXPECTED_START = new Date("2026-08-27T12:00:00.000Z");
const DURATION_MINUTES = 120;

const AUTHOR_ID = 8301n;

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

let updateId = 5000;

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
      from: { id: Number(actorId), is_bot: false, first_name: "Author" },
      chat_instance: "planning-confirm",
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

async function configureChat(chatId: bigint, overrides = {}) {
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({
        planningAccessPolicy: "ANYONE_IN_CHAT",
        ...overrides,
      }),
    },
  });
}

type MemberSpec = Readonly<{
  id: bigint;
  firstName: string;
  active?: boolean;
}>;

/** Puts the given people on the chat's roster; `active: false` soft-removes. */
async function addMembers(chatId: bigint, members: readonly MemberSpec[]) {
  for (const member of members) {
    await prisma.telegramUser.upsert({
      where: { telegramUserId: member.id },
      create: { telegramUserId: member.id, firstName: member.firstName },
      update: { firstName: member.firstName },
    });
    const removed = member.active === false;
    await prisma.chatMembership.create({
      data: {
        chatId,
        telegramUserId: member.id,
        activeAt: removed ? null : NOW,
        deactivatedAt: removed ? NOW : null,
      },
    });
  }
}

const THREE_MEMBERS: readonly MemberSpec[] = [
  { id: 9101n, firstName: "Ada" },
  { id: 9102n, firstName: "Bo" },
  { id: 9103n, firstName: "Cy" },
];

/**
 * Drives a chat all the way to a live REVIEW card through the real dispatcher.
 *
 * Deliberately not a hand-written row: the confirm token under test has to be
 * one the wizard actually minted for the round's author, so that what the test
 * exercises is the path a band member can reach from a Telegram button.
 */
async function reachReview(
  chatId: bigint,
  harness: ReturnType<typeof createHarness>,
) {
  await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));
  const dayToken = tokenLabelled(
    harness.lastOf("sendMessage"),
    CHOSEN_DAY_LABEL,
  );
  await harness.send(callbackUpdate(chatId, AUTHOR_ID, dayToken));
  const timeCard = harness.lastOf("editMessageText");
  const slotToken = tokenLabelled(timeCard, CHOSEN_TIME_LABEL);
  await harness.send(callbackUpdate(chatId, AUTHOR_ID, slotToken));
  const reviewCard = harness.lastOf("editMessageText");
  const round = await prisma.planningRound.findFirstOrThrow({
    where: { chatId, status: "DRAFT" },
  });
  return {
    round,
    reviewCard,
    confirmToken: tokenLabelled(reviewCard, PLANNING_CONFIRM_LABEL),
    backToken: tokenLabelled(reviewCard, PLANNING_BACK_LABEL),
  };
}

const participantsOf = (roundId: string) =>
  prisma.planningParticipant.findMany({
    where: { roundId },
    orderBy: { telegramUserId: "asc" },
  });

describe("confirming the proposal", () => {
  it("promotes the round, snapshots the lineup and releases the week in one go", async () => {
    const chatId = -1008000000001n;
    await configureChat(chatId);
    await addMembers(chatId, THREE_MEMBERS);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken, reviewCard } = await reachReview(
      chatId,
      harness,
    );
    // The review card showed the author exactly the lineup about to be
    // committed — D-09's "the active roster IS the lineup", visible.
    expect(String(reviewCard?.payload.text)).toContain("Ada");
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("CONFIRMED");
    expect(after.confirmedAt).not.toBeNull();
    // PLAN-02: nulling the active key is what frees the unique slot, and it
    // happens in the SAME guarded update that sets the status — the two can
    // never be observed disagreeing.
    expect(after.activeWeekStart).toBeNull();
    expect(after.targetWeekStart).toBe(CURRENT_WEEK);
    expect(after.startsAt).toEqual(EXPECTED_START);
    expect(after.endsAt).not.toBeNull();
    // DST policy rule 4: duration is EXACT ELAPSED TIME, not wall-clock hours.
    expect(
      (after.endsAt as Date).getTime() - (after.startsAt as Date).getTime(),
    ).toBe(DURATION_MINUTES * 60_000);
    expect(after.revision).toBe(round.revision + 1);
    expect(after.selectedDate).toBe(CHOSEN_DATE);
    expect(after.selectedStartMinute).toBe(CHOSEN_MINUTE);

    // D-11: the snapshot Phase 3 reads, one row per active member, carrying
    // both identities so neither a renamed user nor a re-added membership can
    // orphan it.
    const participants = await participantsOf(round.id);
    expect(participants.map((row) => row.telegramUserId)).toEqual([
      9101n,
      9102n,
      9103n,
    ]);
    for (const row of participants) {
      expect(row.membershipId).toBeTruthy();
      expect(row.roundId).toBe(round.id);
    }

    // The anchor ends on a terminal card: the lineup, and what happens next.
    expect(harness.countOf("editMessageText")).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(0);
    const confirmed = harness.lastOf("editMessageText");
    expect(confirmed?.payload.message_id).toBe(round.anchorMessageId);
    expect(String(confirmed?.payload.text)).toContain("availability");
    expect(keyboardButtons(confirmed)).toHaveLength(0);
    expect(
      harness.lines().some((line) => line.outcome === "round-confirmed"),
    ).toBe(true);
  });

  it("releases the week so the chat can start planning the next one (PLAN-02)", async () => {
    const chatId = -1008000000002n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9201n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));
    harness.reset();

    await harness.send(messageUpdate(chatId, AUTHOR_ID, "/plan"));

    const next = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    // The confirmed round now CLAIMS the current week, so the new one targets
    // the following Monday — seven days on, asserted as an interval rather
    // than as a literal so a drift in the civil arithmetic fails loudly.
    expect(next.targetWeekStart).toBe(NEXT_WEEK);
    expect(
      Date.parse(`${next.targetWeekStart}T00:00:00Z`) -
        Date.parse(`${round.targetWeekStart}T00:00:00Z`),
    ).toBe(7 * 86_400_000);
    // And the two rows coexist under `@@unique([chatId, activeWeekStart])`
    // only because the confirmed one released its key to NULL.
    expect(next.activeWeekStart).toBe(NEXT_WEEK);
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).activeWeekStart,
    ).toBeNull();
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
  });

  it("confirms normally for a roster of exactly one (D-10)", async () => {
    const chatId = -1008000000003n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9301n, firstName: "Solo" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    expect(await participantsOf(round.id)).toHaveLength(1);
  });

  it("never snapshots a member who was removed from the roster", async () => {
    const chatId = -1008000000004n;
    await configureChat(chatId);
    await addMembers(chatId, [
      { id: 9401n, firstName: "Active" },
      { id: 9402n, firstName: "Departed", active: false },
    ]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken, reviewCard } = await reachReview(
      chatId,
      harness,
    );
    // The card the author read never offered them either.
    expect(String(reviewCard?.payload.text)).not.toContain("Departed");

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    expect(
      (await participantsOf(round.id)).map((row) => row.telegramUserId),
    ).toEqual([9401n]);
  });
});

describe("confirming with nobody on the roster (D-10)", () => {
  it("refuses, promotes nothing, and names the way to fix it", async () => {
    const chatId = -1008000000005n;
    await configureChat(chatId);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);
    const before = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    // An availability round with nobody in it can never complete, so nothing
    // is committed rather than a technically valid but useless record being.
    expect(
      await prisma.planningRound.findUniqueOrThrow({ where: { id: round.id } }),
    ).toEqual(before);
    expect(await participantsOf(round.id)).toHaveLength(0);
    expect(harness.countOf("editMessageText")).toBe(0);
    const alert = harness.lastOf("answerCallbackQuery");
    expect(alert?.payload.show_alert).toBe(true);
    expect(String(alert?.payload.text)).toContain("/roster_add");
    expect(
      harness.lines().some((line) => line.outcome === "empty-roster"),
    ).toBe(true);
  });

  it("leaves the SAME card usable once members are added", async () => {
    // The load-bearing half, and the reason the refusal happens before the
    // callback row is consumed: an actionable message the author cannot then
    // act on is not actionable. This mirrors the past-day and past-slot
    // refusals, which leave their rows spendable for exactly this reason.
    const chatId = -1008000000006n;
    await configureChat(chatId);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: confirmToken },
        })
      ).consumedAt,
      "a refusal the author is asked to fix must leave the row spendable",
    ).toBeNull();

    await addMembers(chatId, [{ id: 9601n, firstName: "Late" }]);
    harness.reset();
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("CONFIRMED");
    expect(after.activeWeekStart).toBeNull();
    expect(await participantsOf(round.id)).toHaveLength(1);
    expect(harness.countOf("editMessageText")).toBe(1);
  });
});

describe("a Confirm that arrives twice (PLAN-09)", () => {
  it("changes nothing the second time: no duplicate rows, no second revision", async () => {
    const chatId = -1008000000007n;
    await configureChat(chatId);
    await addMembers(
      chatId,
      THREE_MEMBERS.map((member) => ({
        ...member,
        id: member.id + 1000n,
      })),
    );
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));
    const afterFirst = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    harness.reset();

    // The exact same durable action, replayed. Telegram redelivers updates.
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    const afterSecond = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond.revision).toBe(round.revision + 1);
    expect(afterSecond.activeWeekStart).toBeNull();
    expect(afterSecond.confirmedAt).toEqual(afterFirst.confirmedAt);
    expect(await participantsOf(round.id)).toHaveLength(3);
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toBe(
      "Already applied.",
    );
  });

  it("resolves two concurrent Confirms to exactly one promotion", async () => {
    const chatId = -1008000000008n;
    await configureChat(chatId);
    await addMembers(
      chatId,
      THREE_MEMBERS.map((member) => ({
        ...member,
        id: member.id + 2000n,
      })),
    );
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    // Two independent database sessions, awaited together: the compare-and-set
    // that decides the winner has to be the database's, not the process's.
    const [left, right] = await Promise.all([
      new PlanningService(connect()).confirm(
        chatId,
        AUTHOR_ID,
        confirmToken,
        null,
        NOW,
      ),
      new PlanningService(connect()).confirm(
        chatId,
        AUTHOR_ID,
        confirmToken,
        null,
        NOW,
      ),
    ]);

    expect([left.kind, right.kind].sort()).toEqual(["confirmed", "duplicate"]);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("CONFIRMED");
    expect(after.revision).toBe(round.revision + 1);
    expect(after.activeWeekStart).toBeNull();
    // `@@unique([roundId, telegramUserId])` was never even approached: only the
    // winner reached `createMany`.
    expect(await participantsOf(round.id)).toHaveLength(3);
  });

  it("holds a RowShareLock on the chat memberships until confirm commits", async () => {
    const chatId = -1008000000015n;
    await configureChat(chatId);
    await addMembers(
      chatId,
      THREE_MEMBERS.map((member) => ({
        ...member,
        id: member.id + 4000n,
      })),
    );
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);
    const observer = connect();
    let observedLocks: Array<{ mode: string; granted: boolean }> = [];
    const confirmingClient = withPlanningRoundInterference(
      connect(),
      async () => {
        observedLocks = await observer.$queryRaw<
          Array<{ mode: string; granted: boolean }>
        >`
          SELECT locks.mode, locks.granted
          FROM pg_locks AS locks
          JOIN pg_class AS relations ON relations.oid = locks.relation
          WHERE relations.relname = 'chat_memberships'
            AND locks.granted = true
        `;
      },
    );

    const result = await new PlanningService(confirmingClient).confirm(
      chatId,
      AUTHOR_ID,
      confirmToken,
      null,
      NOW,
    );

    expect(observedLocks.length).toBeGreaterThan(0);
    expect(observedLocks.some(({ mode }) => mode === "RowShareLock")).toBe(
      true,
    );
    expect(result.kind).toBe("confirmed");
    expect(await participantsOf(round.id)).toHaveLength(3);
  });
});

describe("walking backwards and confirming anyway (D-03)", () => {
  it("returns to each selector with the earlier choice still applied, on the real card", async () => {
    // Added after a mutation check: making `back` clear `selectedDate` and
    // `selectedStartMinute` reddened three unit tests and left the WHOLE
    // integration suite green. D-03 is a promise about what the author sees on
    // the card in the chat, so it needs an assertion at that level — a service
    // column is not what a mis-tapping band member is looking at.
    const chatId = -1008000000014n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9903n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, backToken } = await reachReview(chatId, harness);

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, backToken));
    const timeCard = harness.lastOf("editMessageText");
    // Back from REVIEW lands on the hours with 15:00 still marked as chosen.
    const chosenSlot = keyboardButtons(timeCard).find((button) =>
      button.text.endsWith(CHOSEN_TIME_LABEL),
    );
    expect(chosenSlot?.text).toContain(PLANNING_MARKER_CHOSEN);
    expect(
      keyboardButtons(timeCard).filter((button) =>
        button.text.includes(PLANNING_MARKER_CHOSEN),
      ),
    ).toHaveLength(1);

    const secondBack = tokenLabelled(timeCard, PLANNING_BACK_LABEL);
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, secondBack));
    const dayCard = harness.lastOf("editMessageText");
    const chosenDay = keyboardButtons(dayCard).find((button) =>
      button.text.endsWith(CHOSEN_DAY_LABEL),
    );
    expect(chosenDay?.text).toContain(PLANNING_MARKER_CHOSEN);
    // The first step offers no way further back.
    expect(
      keyboardButtons(dayCard).some((button) =>
        button.text.includes(PLANNING_BACK_LABEL),
      ),
    ).toBe(false);

    const walked = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(walked.step).toBe("DAY");
    expect(walked.selectedDate).toBe(CHOSEN_DATE);
    expect(walked.selectedStartMinute).toBe(CHOSEN_MINUTE);

    // And walking forward again over the SAME choices confirms normally: Back
    // is a detour, not a reset.
    await harness.send(
      callbackUpdate(
        chatId,
        AUTHOR_ID,
        tokenLabelled(dayCard, CHOSEN_DAY_LABEL),
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

    const confirmed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.activeWeekStart).toBeNull();
    expect(confirmed.startsAt).toEqual(EXPECTED_START);
    expect(await participantsOf(round.id)).toHaveLength(1);
  });
});

describe("a Confirm the round has moved past", () => {
  it("refuses a Confirm token from a card the author has already left", async () => {
    // A REAL stale path rather than a simulated one: the author taps Back on
    // the review card, which bumps the round's revision and moves it to TIME,
    // then taps the Confirm button still sitting on their screen. The token is
    // unconsumed and unexpired — only the round says no.
    const chatId = -1008000000009n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9701n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken, backToken } = await reachReview(
      chatId,
      harness,
    );
    await harness.send(callbackUpdate(chatId, AUTHOR_ID, backToken));
    const afterBack = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterBack.step).toBe("TIME");
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    expect(
      await prisma.planningRound.findUniqueOrThrow({ where: { id: round.id } }),
    ).toEqual(afterBack);
    expect(await participantsOf(round.id)).toHaveLength(0);
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(String(harness.lastOf("answerCallbackQuery")?.payload.text)).toMatch(
      /no longer available/i,
    );
    expect(
      harness.lines().some((line) => line.outcome === "stale-action"),
    ).toBe(true);
  });

  it("refuses a Confirm whose expected revision no longer matches", async () => {
    const chatId = -1008000000010n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9801n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    const result = await new PlanningService(prisma).confirm(
      chatId,
      AUTHOR_ID,
      confirmToken,
      round.revision + 7,
      NOW,
    );

    expect(result.kind).toBe("stale");
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("DRAFT");
    expect(after.activeWeekStart).toBe(CURRENT_WEEK);
    expect(await participantsOf(round.id)).toHaveLength(0);
  });

  it("leaves the Confirm row spendable after a lost revision race", async () => {
    // WR-01. The lost race is the ONE refusal that cannot be ordered before the
    // consume, because the consume is what establishes it. If the row stayed
    // spent, the author would be left with a Confirm button that can never work
    // again and no way back except /plan_status — which may be inside its own
    // cooldown.
    const chatId = -1008000000021n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9901n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    const lost = await new PlanningService(prisma).confirm(
      chatId,
      AUTHOR_ID,
      confirmToken,
      round.revision + 7,
      NOW,
    );
    expect(lost.kind).toBe("stale");

    // The row the transaction spent was handed back in the same transaction,
    // so it is indistinguishable from one that was never consumed.
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: confirmToken },
        })
      ).consumedAt,
    ).toBeNull();

    // And the proof that matters: the SAME button still works.
    const retried = await new PlanningService(prisma).confirm(
      chatId,
      AUTHOR_ID,
      confirmToken,
      null,
      NOW,
    );
    expect(retried.kind).toBe("confirmed");
    const confirmed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.activeWeekStart).toBeNull();
    expect(await participantsOf(round.id)).toHaveLength(1);
  });
});

describe("the round is the authority for its own schedule (T-02-11)", () => {
  it("confirms against the round's snapshot even after /settings moved the window", async () => {
    const chatId = -1008000000011n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9901n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);

    // A mid-round settings edit that would exclude 15:00 from a FRESH window.
    await prisma.chatConfiguration.update({
      where: { chatId },
      data: { dailyStartMinute: 600, dailyEndMinute: 780 },
    });

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    // The round carries its own window snapshot, so the author's legitimate
    // choice is still promoted: a settings edit landing mid-round can neither
    // invalidate a valid confirm nor legitimise an invalid one.
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("CONFIRMED");
    expect(after.dailyEndMinute).toBe(1260);
    expect(after.startsAt).toEqual(EXPECTED_START);
  });

  it("refuses a selection the round's own snapshot never admitted", async () => {
    const chatId = -1008000000012n;
    await configureChat(chatId);
    await addMembers(chatId, [{ id: 9902n, firstName: "Ada" }]);
    const harness = createHarness({ prisma, chatId });
    const { round, confirmToken } = await reachReview(chatId, harness);
    // Written straight into the row, as a corrupted or hand-edited round would
    // be: 09:00 is an hour the round's own 10:00-21:00 window never offered.
    await prisma.planningRound.update({
      where: { id: round.id },
      data: { selectedStartMinute: 9 * 60 },
    });
    harness.reset();

    await harness.send(callbackUpdate(chatId, AUTHOR_ID, confirmToken));

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.status).toBe("DRAFT");
    expect(after.activeWeekStart).toBe(CURRENT_WEEK);
    expect(after.startsAt).toBeNull();
    expect(await participantsOf(round.id)).toHaveLength(0);
    expect(harness.countOf("editMessageText")).toBe(0);
  });
});

describe("when the database refuses the transaction", () => {
  it("returns the failure result rather than throwing at the surface", async () => {
    const service = new PlanningService(transactionFailurePrisma() as never);

    const result = await service.confirm(
      -1008000000013n,
      AUTHOR_ID,
      "v1:00000000-0000-4000-8000-000000000000",
      null,
      NOW,
    );

    expect(result.kind).toBe("failed");
    // The caught value travels with the result so the surface can log it bound
    // under `err` — the only key the redactor renders structurally.
    expect(result.kind === "failed" && result.error).toBeInstanceOf(Error);
  });
});
