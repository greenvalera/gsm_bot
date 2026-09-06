import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { MAX_WEEK_LOOKAHEAD } from "../../src/domain/planning/target-week.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  addDays,
  isoDate,
  parseCivilDate,
} from "../../src/infrastructure/time/civil.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  PLANNING_BACK_LABEL,
  PLANNING_CONFIRM_LABEL,
  PLANNING_MARKER_DEFAULT,
  PLANNING_MARKER_PREVIOUS,
  PLANNING_MARKER_UNAVAILABLE,
} from "../../src/telegram/keyboards.js";
import { PLANNING_DENIAL } from "../../src/telegram/planning-handlers.js";
import { PLANNING_DAY_LEGEND } from "../../src/telegram/planning-renderers.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

/**
 * Wednesday 2026-08-26, 12:00 in Europe/Kyiv. The chat-local Monday of that week
 * is 2026-08-24 and the following Monday is 2026-08-31 — both asserted below
 * rather than recomputed, so a drift in the civil arithmetic fails loudly.
 */
const NOW = new Date("2026-08-26T09:00:00.000Z");
const CURRENT_WEEK = "2026-08-24";
const NEXT_WEEK = "2026-08-31";

const AUTHOR_ID = 8201n;
const OTHER_ID = 8202n;

/** Every Telegram method this slice is allowed to call. */
const DOCUMENTED_TELEGRAM_METHODS = new Set([
  "sendMessage",
  "editMessageText",
  "answerCallbackQuery",
]);

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

/**
 * A logger at the DEFAULT level, so a line only visible at `debug` cannot pass
 * for one an operator would actually see (Phase 1 finding F-4).
 */
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
}>;

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
    lastOf(method: string) {
      return [...calls].reverse().find((call) => call.method === method);
    },
    methods() {
      return calls.map((call) => call.method);
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
      chat_instance: "planning-round-e2e",
      data,
      message: {
        message_id: 777,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      },
    },
  };
}

function keyboardRows(call: ApiCall | undefined) {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  return (markup?.inline_keyboard ?? []).map((row) =>
    row.map((button) => button.text),
  );
}

function keyboardButtons(call: ApiCall | undefined) {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  return (markup?.inline_keyboard ?? []).flat();
}

/**
 * Finds a button by the label BEHIND its marker.
 *
 * Day labels carry a leading marker glyph (D-08), which is presentation the
 * tracer path does not care about: the token behind "Wednesday" is the same
 * token whether or not Wednesday happens to be the chat's usual day.
 */
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

describe("planning round vertical slice", () => {
  it("starts a durable week-aware round and anchors the day card for a non-admin author", async () => {
    const chatId = -1007000000001n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({
      prisma,
      chatId,
      role: () => "member",
    });

    await harness.send(messageUpdate(1001, chatId, AUTHOR_ID, "/plan"));

    expect(harness.countOf("sendMessage")).toBe(1);
    const sent = harness.lastOf("sendMessage");
    expect(keyboardButtons(sent)).toHaveLength(7);
    expect(keyboardRows(sent).map((row) => row.length)).toEqual([4, 3]);
    // The clock is Wednesday 2026-08-26 in Kyiv and the chat's configured
    // default weekday is 3 (Wednesday), so Monday and Tuesday are already past
    // — rendered and marked, never hidden (D-05) — and today carries the
    // "usual day" marker. There is no confirmed round yet, so no day carries
    // the previous-rehearsal marker.
    expect(keyboardRows(sent).flat()).toEqual([
      `${PLANNING_MARKER_UNAVAILABLE} Mon 24`,
      `${PLANNING_MARKER_UNAVAILABLE} Tue 25`,
      `${PLANNING_MARKER_DEFAULT} Wed 26`,
      "Thu 27",
      "Fri 28",
      "Sat 29",
      "Sun 30",
    ]);
    expect(sent?.payload.text).toContain(PLANNING_DAY_LEGEND.default);
    expect(sent?.payload.text).toContain(PLANNING_DAY_LEGEND.past);
    expect(sent?.payload.text).not.toContain(PLANNING_DAY_LEGEND.previous);

    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    expect(round).toMatchObject({
      status: "DRAFT",
      step: "DAY",
      authorUserId: AUTHOR_ID,
      targetWeekStart: CURRENT_WEEK,
      activeWeekStart: CURRENT_WEEK,
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      selectedDate: null,
    });
    expect(round.anchorMessageId).toBe(901);
    expect(
      harness.methods().every((m) => DOCUMENTED_TELEGRAM_METHODS.has(m)),
    ).toBe(true);
  });

  it("replaces the same anchor card in place when the author taps a day", async () => {
    const chatId = -1007000000002n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1101, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Wed 26");
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(callbackUpdate(1102, chatId, AUTHOR_ID, dayToken));

    expect(harness.countOf("editMessageText")).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(0);
    const edited = harness.lastOf("editMessageText");
    expect(edited?.payload.message_id).toBe(before.anchorMessageId);
    // The chosen day is Wednesday 2026-08-26 and the clock is 09:00Z, which is
    // 12:00 in Kyiv — so 10:00, 11:00 and 12:00 are already behind the chat and
    // carry the unavailable glyph, while all ten stay on the card (D-07/D-05:
    // visible, marked, refused, exactly as a past day is on the day card). The
    // configured default start is 10:00 and it shows NO star, because an hour
    // nobody can pick must not advertise itself as the usual one.
    //
    // The trailing "Back" row arrives with plan 02-05: the time step is not the
    // first step, so D-03 requires a way out of it that is not cancel-and-
    // restart. It is asserted as its OWN row rather than appended to the last
    // slot row, because sharing a row is what truncated a label in Phase 1 (F-9).
    expect(keyboardRows(edited).flat()).toEqual([
      "🚫 10:00",
      "🚫 11:00",
      "🚫 12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
      "19:00",
      PLANNING_BACK_LABEL,
    ]);
    expect(keyboardRows(edited).map((row) => row.length)).toEqual([
      3, 3, 3, 1, 1,
    ]);
    expect(keyboardRows(edited).at(-1)).toEqual([PLANNING_BACK_LABEL]);

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-26");
    expect(after.revision).toBe(before.revision + 1);

    // T-02-11: a mid-round settings edit must not retroactively rewrite the
    // round's own snapshot, which is what every later step reads.
    await prisma.chatConfiguration.update({
      where: { chatId },
      data: { dailyEndMinute: 1320, durationMinutes: 60 },
    });
    const unchanged = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(unchanged.dailyEndMinute).toBe(1260);
    expect(unchanged.durationMinutes).toBe(120);
  });

  it("carries the same anchor from a slot tap to the review step", async () => {
    // Closes the bounded stub 02-02 left behind: a slot button rendered and was
    // tappable, but the dispatcher had no `selectTime` to route it to and
    // refused it with the stale alert. This is the whole path, on real
    // PostgreSQL — /plan, a day, an hour — ending at REVIEW.
    const chatId = -1007000000011n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1201, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Thu 27");
    await harness.send(callbackUpdate(1202, chatId, AUTHOR_ID, dayToken));
    const timeCard = harness.lastOf("editMessageText");
    // Thursday is still ahead, so no hour on it is marked unavailable and the
    // configured 10:00 default keeps its star.
    expect(keyboardRows(timeCard).flat()[0]).toBe("⭐ 10:00");
    const slotToken = tokenLabelled(timeCard, "15:00");
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(callbackUpdate(1203, chatId, AUTHOR_ID, slotToken));

    expect(harness.countOf("editMessageText")).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(0);
    const reviewed = harness.lastOf("editMessageText");
    expect(reviewed?.payload.message_id).toBe(before.anchorMessageId);
    // The time buttons do not survive the step they belonged to (D-01) — and,
    // since plan 02-05, they are REPLACED rather than merely dropped. 02-04
    // left the review step reachable but not actionable (broken window 19): an
    // author who picked a time landed on a card with no buttons at all. The
    // assertion that used to read `toEqual([])` pinned exactly that defect, so
    // it is tightened here rather than relaxed: no slot label survives, and the
    // two controls the phase ends on are present, one per row (D-04).
    expect(keyboardRows(reviewed).flat()).not.toContain("15:00");
    expect(keyboardRows(reviewed)).toEqual([
      [PLANNING_CONFIRM_LABEL],
      [PLANNING_BACK_LABEL],
    ]);

    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.step).toBe("REVIEW");
    expect(after.selectedStartMinute).toBe(900);
    expect(after.selectedDate).toBe("2026-08-27");
    expect(after.revision).toBe(before.revision + 1);
    // startsAt/endsAt stay null: they are written inside the Confirm
    // transaction, from the civil pair plus the timezone snapshot.
    expect(after.startsAt).toBeNull();
    expect(after.endsAt).toBeNull();
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: slotToken },
        })
      ).consumedAt,
      "the spent tap must not be spendable twice",
    ).not.toBeNull();
  });

  it("refuses an hour already behind the chat's clock, leaving the card usable", async () => {
    // D-07's other half, end to end: the clock is 12:00 in Kyiv and the chosen
    // day is today, so 10:00 has gone. Nothing durable moves, the row stays
    // spendable, and a valid hour on the SAME card still works.
    const chatId = -1007000000012n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1301, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Wed 26");
    await harness.send(callbackUpdate(1302, chatId, AUTHOR_ID, dayToken));
    const timeCard = harness.lastOf("editMessageText");
    const pastToken = tokenLabelled(timeCard, "10:00");
    const validToken = tokenLabelled(timeCard, "16:00");
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(callbackUpdate(1303, chatId, AUTHOR_ID, pastToken));

    expect(harness.countOf("editMessageText")).toBe(0);
    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.lastOf("answerCallbackQuery")?.payload.show_alert).toBe(
      true,
    );
    expect(
      harness.lines().some((line) => line.outcome === "past-slot"),
      "a deliberate no-op that logs nothing is a swallowed failure (F-4)",
    ).toBe(true);
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pastToken },
        })
      ).consumedAt,
      "the refused tap must leave the row spendable",
    ).toBeNull();

    // The load-bearing half: the author is not left holding a dead card.
    harness.reset();
    await harness.send(callbackUpdate(1304, chatId, AUTHOR_ID, validToken));

    expect(harness.countOf("editMessageText")).toBe(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.step).toBe("REVIEW");
    expect(after.selectedStartMinute).toBe(960);
  });

  it("refuses a past day without spending the card, and the same card still works", async () => {
    const chatId = -1007000000010n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1901, chatId, AUTHOR_ID, "/plan"));
    const card = harness.lastOf("sendMessage");
    // Monday is behind the Wednesday clock; Wednesday itself is not.
    const pastToken = tokenLabelled(card, "Mon 24");
    const validToken = tokenLabelled(card, "Wed 26");
    const before = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });
    harness.reset();

    await harness.send(callbackUpdate(1902, chatId, AUTHOR_ID, pastToken));

    // Nothing to change, so nothing is edited — and nothing durable moved.
    expect(harness.countOf("editMessageText")).toBe(0);
    expect(harness.countOf("sendMessage")).toBe(0);
    expect(harness.countOf("answerCallbackQuery")).toBe(1);
    expect(harness.lastOf("answerCallbackQuery")?.payload.show_alert).toBe(
      true,
    );
    expect(
      harness.lines().some((line) => line.outcome === "past-day"),
      "a deliberate no-op that logs nothing is a swallowed failure (F-4)",
    ).toBe(true);
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: before.id },
      }),
    ).toEqual(before);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pastToken },
        })
      ).consumedAt,
      "the refused tap must leave the row spendable",
    ).toBeNull();

    // The load-bearing half: the author is not left holding a dead card.
    harness.reset();
    await harness.send(callbackUpdate(1903, chatId, AUTHOR_ID, validToken));

    expect(harness.countOf("editMessageText")).toBe(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-26");
  });

  it("refuses a second start for the same chat and week, in the application and at the database", async () => {
    const chatId = -1007000000003n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });

    await harness.send(messageUpdate(1201, chatId, AUTHOR_ID, "/plan"));
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    harness.reset();

    await harness.send(messageUpdate(1202, chatId, OTHER_ID, "/plan"));

    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toMatch(
      /already planning/i,
    );

    await expect(
      prisma.planningRound.create({
        data: {
          chatId,
          authorUserId: OTHER_ID,
          targetWeekStart: CURRENT_WEEK,
          activeWeekStart: CURRENT_WEEK,
          timezone: "Europe/Kyiv",
          durationMinutes: 120,
          dailyStartMinute: 600,
          dailyEndMinute: 1260,
          lastActivityAt: NOW,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("targets the current week when unclaimed, the next week when confirmed, and resumes a draft", async () => {
    const unclaimed = -1007000000004n;
    await configureChat(unclaimed);
    const first = createHarness({ prisma, chatId: unclaimed });
    await first.send(messageUpdate(1301, unclaimed, AUTHOR_ID, "/plan"));
    expect(
      (
        await prisma.planningRound.findFirstOrThrow({
          where: { chatId: unclaimed },
        })
      ).targetWeekStart,
    ).toBe(CURRENT_WEEK);

    const claimed = -1007000000005n;
    await configureChat(claimed);
    await prisma.planningRound.create({
      data: {
        chatId: claimed,
        authorUserId: OTHER_ID,
        targetWeekStart: CURRENT_WEEK,
        activeWeekStart: null,
        status: "CONFIRMED",
        step: "REVIEW",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      },
    });
    const second = createHarness({ prisma, chatId: claimed });
    await second.send(messageUpdate(1302, claimed, AUTHOR_ID, "/plan"));
    const draft = await prisma.planningRound.findFirstOrThrow({
      where: { chatId: claimed, status: "DRAFT" },
    });
    expect(draft.targetWeekStart).toBe(NEXT_WEEK);

    // A DRAFT round does NOT claim its week (Pitfall 6): the author's repeat
    // resumes the same row rather than computing a different target week.
    second.reset();
    await second.send(messageUpdate(1303, claimed, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({
        where: { chatId: claimed, status: "DRAFT" },
      }),
    ).toBe(1);
    const resumed = await prisma.planningRound.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(resumed.targetWeekStart).toBe(NEXT_WEEK);
    expect(second.countOf("sendMessage")).toBe(1);
  });

  it("rolls past EVERY confirmed week, not just the first one", async () => {
    // CR-01. Three commands inside one week: the current week is confirmed, the
    // next week is confirmed, and the third /plan must land on the week after
    // both. Asking the claim predicate only about the current week returns
    // NEXT_WEEK a second time, and nothing downstream catches it — a confirmed
    // round has already released `activeWeekStart` to NULL, so
    // `@@unique([chatId, activeWeekStart])` has no live row to collide with and
    // the chat ends up with two confirmed rounds for one week.
    const chatId = -1007000000021n;
    await configureChat(chatId);
    for (const week of [CURRENT_WEEK, NEXT_WEEK]) {
      await prisma.planningRound.create({
        data: {
          chatId,
          authorUserId: OTHER_ID,
          targetWeekStart: week,
          activeWeekStart: null,
          status: "CONFIRMED",
          step: "REVIEW",
          timezone: "Europe/Kyiv",
          durationMinutes: 120,
          dailyStartMinute: 600,
          dailyEndMinute: 1260,
          lastActivityAt: NOW,
        },
      });
    }

    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(1501, chatId, AUTHOR_ID, "/plan"));

    const draft = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    expect(draft.targetWeekStart).toBe("2026-09-07");
    // And the week already spoken for did not gain a second round.
    expect(
      await prisma.planningRound.count({
        where: { chatId, targetWeekStart: NEXT_WEEK },
      }),
    ).toBe(1);
  });

  it("refuses /plan rather than planning a week that is already confirmed", async () => {
    // The bound is total: with every week in the lookahead window claimed there
    // is no honest answer, so the command refuses out loud instead of forcing a
    // round onto the last candidate it looked at.
    const chatId = -1007000000022n;
    await configureChat(chatId);
    const weeks: string[] = [];
    for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
      weeks.push(isoDate(addDays(parseCivilDate(CURRENT_WEEK), ahead * 7)));
    }
    await prisma.planningRound.createMany({
      data: weeks.map((week) => ({
        chatId,
        authorUserId: OTHER_ID,
        targetWeekStart: week,
        activeWeekStart: null,
        status: "CONFIRMED" as const,
        step: "REVIEW" as const,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      })),
    });

    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(1601, chatId, AUTHOR_ID, "/plan"));

    expect(
      await prisma.planningRound.count({ where: { chatId, status: "DRAFT" } }),
    ).toBe(0);
    expect(harness.countOf("sendMessage")).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).toMatch(
      /every week ahead/i,
    );
    expect(harness.lines().map((line) => line.outcome as string)).toContain(
      "no-free-week",
    );
  });

  it("refuses /plan without a configuration, for a departed member, and for an unavailable lookup", async () => {
    const unconfigured = -1007000000006n;
    const admin = createHarness({ prisma, chatId: unconfigured });
    await admin.send(messageUpdate(1401, unconfigured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: unconfigured } }),
    ).toBe(0);
    expect(String(admin.lastOf("sendMessage")?.payload.text)).toMatch(
      /\/setup/,
    );

    const configured = -1007000000007n;
    await configureChat(configured, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const departed = createHarness({
      prisma,
      chatId: configured,
      role: () => "left",
    });
    await departed.send(messageUpdate(1402, configured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: configured } }),
    ).toBe(0);
    expect(departed.countOf("sendMessage")).toBe(1);

    const unavailable = createHarness({
      prisma,
      chatId: configured,
      roleThrows: true,
    });
    await unavailable.send(messageUpdate(1403, configured, AUTHOR_ID, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId: configured } }),
    ).toBe(0);
    expect(unavailable.countOf("sendMessage")).toBe(1);
    const failure = unavailable
      .lines()
      .find((line) => line.outcome === "membership-lookup-unavailable");
    expect(failure).toBeDefined();
    expect(failure?.err).toMatchObject({ name: "Error" });
  });

  it("resumes the exact step and selection from a fresh composition root", async () => {
    const chatId = -1007000000008n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const firstClient = connect();
    const first = createHarness({
      prisma: firstClient,
      chatId,
      role: () => "member",
    });
    await first.send(messageUpdate(1501, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(first.lastOf("sendMessage"), "Thu 27");
    const round = await prisma.planningRound.findFirstOrThrow({
      where: { chatId },
    });

    // Dispose the composition root that minted the token entirely: nothing it
    // held in process memory may be required to finish the round.
    await firstClient.$disconnect();
    const secondClient = connect();
    const second = createHarness({
      prisma: secondClient,
      chatId,
      role: () => "member",
    });

    await second.send(callbackUpdate(1502, chatId, AUTHOR_ID, dayToken));

    expect(second.countOf("editMessageText")).toBe(1);
    const after = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(after.step).toBe("TIME");
    expect(after.selectedDate).toBe("2026-08-27");
  });

  it("never destroys the acting user's setup draft when they tap a planning button", async () => {
    const chatId = -1007000000009n;
    await configureChat(chatId, { planningAccessPolicy: "ANYONE_IN_CHAT" });
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(1601, chatId, AUTHOR_ID, "/plan"));
    const dayToken = tokenLabelled(harness.lastOf("sendMessage"), "Fri 28");

    await prisma.setupDraft.create({
      data: {
        chatId,
        actorUserId: AUTHOR_ID,
        expectedRevision: 0,
        reminderMinutes: [],
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
    });

    await harness.send(callbackUpdate(1602, chatId, AUTHOR_ID, dayToken));

    expect(
      await prisma.setupDraft.count({
        where: { chatId, actorUserId: AUTHOR_ID },
      }),
    ).toBe(1);
  });
});

/**
 * D-15 carried through the three queries that hand `WEEK_CLAIMING_STATUSES` a
 * set they have ALREADY narrowed with a hard-coded status literal.
 *
 * The constant on its own is dead code at each of these sites: the row set never
 * contains a booked round for `weekIsClaimed` to match, `previousRehearsal`
 * never returns one, and the `PREVIOUS_PARTICIPANTS` policy never sees one. Each
 * site therefore gets its OWN assertion here — a shared one would leave two of
 * the three regressions silently shippable (03-RESEARCH.md Pattern 7).
 *
 * Every booked round below is seeded directly through Prisma: nothing in the
 * codebase writes `BOOKED` until plan 03-05, so a round driven through the real
 * wizard could not reach the state under test.
 */
describe("a booked round carries the same weight as a confirmed one (D-15)", () => {
  /** A finished round for `week`, in whatever lifecycle position the case needs. */
  async function seedFinishedRound(
    chatId: bigint,
    week: string,
    status: "CONFIRMED" | "BOOKED" | "SUPERSEDED",
    overrides: Record<string, unknown> = {},
  ) {
    return await prisma.planningRound.create({
      data: {
        chatId,
        authorUserId: OTHER_ID,
        targetWeekStart: week,
        // Every non-draft round has already released the week's unique slot, so
        // NOTHING at the database level stops a second round for the same week.
        // `weekIsClaimed` is the only guard, which is why :949 matters.
        activeWeekStart: null,
        status,
        step: "REVIEW",
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
        ...overrides,
      },
    });
  }

  /** One roster member, and their snapshot row on `round`. */
  async function seedParticipant(
    chatId: bigint,
    roundId: string,
    telegramUserId: bigint,
  ) {
    await prisma.telegramUser.upsert({
      where: { telegramUserId },
      create: { telegramUserId, firstName: "Member" },
      update: {},
    });
    const membership = await prisma.chatMembership.create({
      data: { chatId, telegramUserId, activeAt: NOW },
    });
    await prisma.planningParticipant.create({
      data: {
        roundId,
        chatId,
        telegramUserId,
        membershipId: membership.id,
      },
    });
  }

  it("SITE :949 — offers a different week rather than re-opening a booked one", async () => {
    const chatId = -1007000000031n;
    await configureChat(chatId);
    await seedFinishedRound(chatId, CURRENT_WEEK, "BOOKED");

    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(1701, chatId, AUTHOR_ID, "/plan"));

    const draft = await prisma.planningRound.findFirstOrThrow({
      where: { chatId, status: "DRAFT" },
    });
    // Left narrow, this is NEXT_WEEK's silent twin: the chat runs a second
    // availability round for a rehearsal it has already booked.
    expect(draft.targetWeekStart).toBe(NEXT_WEEK);
    expect(
      await prisma.planningRound.count({
        where: { chatId, targetWeekStart: CURRENT_WEEK },
      }),
    ).toBe(1);
  });

  it("SITE :949 — refuses when every candidate week is claimed by a booked round", async () => {
    const chatId = -1007000000032n;
    await configureChat(chatId);
    const weeks: string[] = [];
    for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
      weeks.push(isoDate(addDays(parseCivilDate(CURRENT_WEEK), ahead * 7)));
    }
    await prisma.planningRound.createMany({
      data: weeks.map((week) => ({
        chatId,
        authorUserId: OTHER_ID,
        targetWeekStart: week,
        activeWeekStart: null,
        status: "BOOKED" as const,
        step: "REVIEW" as const,
        timezone: "Europe/Kyiv",
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1260,
        lastActivityAt: NOW,
      })),
    });

    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(1702, chatId, AUTHOR_ID, "/plan"));

    expect(
      await prisma.planningRound.count({ where: { chatId, status: "DRAFT" } }),
    ).toBe(0);
    expect(harness.lines().map((line) => line.outcome as string)).toContain(
      "no-free-week",
    );
  });

  it("SITE :786 — a booked round is still the chat's previous rehearsal", async () => {
    const chatId = -1007000000033n;
    await configureChat(chatId);
    // Thursday of the week BEFORE the clock's week, so the marker is not
    // suppressed for landing inside the week the card is drawn for.
    const booked = await seedFinishedRound(chatId, "2026-08-17", "BOOKED", {
      selectedDate: "2026-08-20",
      startsAt: new Date("2026-08-20T15:00:00.000Z"),
      endsAt: new Date("2026-08-20T17:00:00.000Z"),
      confirmedAt: new Date("2026-08-18T09:00:00.000Z"),
      selectedStartMinute: 1080,
    });

    const previous = await new PlanningService(prisma).previousRehearsal(
      chatId,
      NOW,
    );
    expect(previous?.id).toBe(booked.id);

    // …and the PLAN-05/PLAN-07 markers the query feeds do not regress: the day
    // card advertises last rehearsal's weekday the moment a chat starts booking.
    const harness = createHarness({ prisma, chatId });
    await harness.send(messageUpdate(1703, chatId, AUTHOR_ID, "/plan"));
    const sent = harness.lastOf("sendMessage");
    expect(sent?.payload.text).toContain(PLANNING_DAY_LEGEND.previous);
    expect(
      keyboardRows(sent)
        .flat()
        .some((label) => label.startsWith(PLANNING_MARKER_PREVIOUS)),
    ).toBe(true);
  });

  it("SITE :786 — still prefers the most recent qualifying round", async () => {
    const chatId = -1007000000034n;
    await configureChat(chatId);
    await seedFinishedRound(chatId, "2026-08-10", "CONFIRMED", {
      startsAt: new Date("2026-08-13T15:00:00.000Z"),
    });
    const newer = await seedFinishedRound(chatId, "2026-08-17", "BOOKED", {
      startsAt: new Date("2026-08-20T15:00:00.000Z"),
    });
    // Ahead of the clock, so it is not "previous" however booked it is.
    await seedFinishedRound(chatId, NEXT_WEEK, "BOOKED", {
      startsAt: new Date("2026-09-03T15:00:00.000Z"),
    });

    expect(
      (await new PlanningService(prisma).previousRehearsal(chatId, NOW))?.id,
    ).toBe(newer.id);
  });

  it("SITE :809 — still admits a member who appears only in a booked round", async () => {
    // AUTH-01, and the one widening on this plan that is an AUTHORIZATION
    // change: left narrow, a member admitted to planning yesterday is denied
    // today, silently, the moment the band books its first rehearsal.
    const chatId = -1007000000035n;
    await configureChat(chatId, {
      planningAccessPolicy: "PREVIOUS_PARTICIPANTS",
    });
    const booked = await seedFinishedRound(chatId, "2026-08-17", "BOOKED");
    const veteran = 8251n;
    await seedParticipant(chatId, booked.id, veteran);

    const service = new PlanningService(prisma);
    expect(await service.wasPreviousParticipant(chatId, veteran)).toBe(true);

    // …and the policy that consumes it admits them end to end, as a plain
    // member with no administrator rights to fall back on.
    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(1704, chatId, veteran, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId, status: "DRAFT" } }),
    ).toBe(1);
    expect(String(harness.lastOf("sendMessage")?.payload.text)).not.toContain(
      PLANNING_DENIAL,
    );
  });

  it("SITE :809 — a superseded round still claims nothing and admits nobody", async () => {
    // The negative half. Widening the filter to "any status at all" would pass
    // every assertion above while handing an abandoned draft's lineup the same
    // standing as a real rehearsal's.
    const chatId = -1007000000036n;
    await configureChat(chatId, {
      planningAccessPolicy: "PREVIOUS_PARTICIPANTS",
    });
    const superseded = await seedFinishedRound(
      chatId,
      CURRENT_WEEK,
      "SUPERSEDED",
      { startsAt: new Date("2026-08-25T15:00:00.000Z") },
    );
    const stranger = 8252n;
    await seedParticipant(chatId, superseded.id, stranger);

    const service = new PlanningService(prisma);
    expect(await service.wasPreviousParticipant(chatId, stranger)).toBe(false);
    expect(await service.previousRehearsal(chatId, NOW)).toBeNull();

    const harness = createHarness({ prisma, chatId, role: () => "member" });
    await harness.send(messageUpdate(1705, chatId, stranger, "/plan"));
    expect(
      await prisma.planningRound.count({ where: { chatId, status: "DRAFT" } }),
    ).toBe(0);
    expect(harness.lastOf("sendMessage")?.payload.text).toBe(PLANNING_DENIAL);

    // A superseded round does not hold its week either, so the chat can still
    // plan it.
    const admin = createHarness({ prisma, chatId });
    await admin.send(messageUpdate(1706, chatId, AUTHOR_ID, "/plan"));
    expect(
      (
        await prisma.planningRound.findFirstOrThrow({
          where: { chatId, status: "DRAFT" },
        })
      ).targetWeekStart,
    ).toBe(CURRENT_WEEK);
  });

  it("mints no wizard controls for a round that has left the wizard", async () => {
    // `stepTargets` falls through its day and time branches into the REVIEW
    // branch for any other input, so a non-draft round reaching it mints a
    // confirm/back pair for a round that has neither control. The guard is on
    // STATUS, above the step, because a confirmed round's step is still REVIEW.
    const chatId = -1007000000037n;
    await configureChat(chatId);
    const service = new PlanningService(prisma);

    for (const status of ["CONFIRMED", "BOOKED", "SUPERSEDED"] as const) {
      const round = await seedFinishedRound(chatId, CURRENT_WEEK, status, {
        selectedDate: "2026-08-26",
        selectedStartMinute: 900,
      });
      const before = await prisma.callbackAction.count({ where: { chatId } });
      const minted = await prisma.$transaction((tx) =>
        service.mintStepActions(tx, round, NOW),
      );

      expect(minted, status).toEqual([]);
      expect(
        await prisma.callbackAction.count({ where: { chatId } }),
        status,
      ).toBe(before);
    }
  });
});
