import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserFromGetMe } from "grammy/types";

import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { CHAT_READINESS_ROUTES } from "../../src/telegram/handlers.js";
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

const NOW = new Date("2026-08-21T09:00:00.000Z");
const ADMIN_ID = 8101n;
const MEMBER_ID = 8102n;
const BAND_MEMBER_ID = 8103n;

/** Every Telegram method this phase is allowed to call (COVERAGE.md INTEGRATE rows). */
const DOCUMENTED_TELEGRAM_METHODS = new Set([
  "sendMessage",
  "editMessageText",
  "answerCallbackQuery",
]);

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const GENERIC_STALE =
  "This action is no longer available. Open /settings or /roster and try again.";
const SETUP_STALE =
  "This setup action is no longer available. Send /setup to start again.";
const ALREADY_APPLIED = "Already applied.";
const ROSTER_READ_FAILURE = "I couldn't load the roster. Please try again.";

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
}, 120_000);

afterAll(async () => {
  await Promise.all(openClients.map((client) => client.$disconnect()));
  await postgres?.stop();
}, 60_000);

type HarnessOptions = Readonly<{
  prisma: PrismaClient;
  chatId: bigint;
  now?: () => Date;
  role?: (chatId: bigint, actorId: bigint) => CurrentTelegramRole;
}>;

function createHarness(options: HarnessOptions) {
  const calls: ApiCall[] = [];
  const events: string[] = [];
  let nextMessageId = 500;

  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: BOT_INFO,
    prisma: options.prisma,
    now: options.now ?? (() => NOW),
    timezoneResolver: {
      async resolve() {
        return { kind: "resolved", candidate: "Europe/Kyiv" };
      },
    },
    membershipGateway: {
      async getCurrentRole(chatId, actorId) {
        events.push("membership");
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
    events.push(method);
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
    events,
    reset() {
      calls.length = 0;
      events.length = 0;
    },
    last() {
      return calls[calls.length - 1];
    },
    lastOf(method: string) {
      return [...calls].reverse().find((call) => call.method === method);
    },
    methods() {
      return calls.map((call) => call.method);
    },
    async send(update: unknown) {
      await this.bot.handleUpdate(update as never);
    },
  };
}

function messageUpdate(
  updateId: number,
  chatId: bigint,
  actorId: bigint,
  text: string,
  extra: Record<string, unknown> = {},
) {
  const command = text.startsWith("/");
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
      text,
      ...(command
        ? {
            entities: [
              {
                offset: 0,
                length: (text.split(" ")[0] ?? text).length,
                type: "bot_command",
              },
            ],
          }
        : {}),
      ...extra,
    },
  };
}

function locationUpdate(updateId: number, chatId: bigint, actorId: bigint) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
      location: { latitude: 50.45, longitude: 30.52 },
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
      from: { id: Number(actorId), is_bot: false, first_name: "Admin" },
      chat_instance: "chat-readiness-e2e",
      data,
      message: {
        message_id: 777,
        date: 1_784_000_000,
        chat: { id: Number(chatId), type: "supergroup", title: "Test band" },
      },
    },
  };
}

function keyboardOf(call: ApiCall | undefined): Keyboard {
  const markup = call?.payload.reply_markup as Keyboard | undefined;
  if (markup === undefined)
    throw new Error(`Expected an inline keyboard on ${call?.method}`);
  return markup;
}

function tokenAt(call: ApiCall | undefined, row: number, column = 0) {
  const token = keyboardOf(call).inline_keyboard[row]?.[column]?.callback_data;
  if (token === undefined)
    throw new Error(`Expected a callback token at row ${row}.`);
  return token;
}

function tokenLabelled(call: ApiCall | undefined, label: string) {
  for (const row of keyboardOf(call).inline_keyboard) {
    for (const button of row) {
      if (button.text === label) return button.callback_data;
    }
  }
  throw new Error(`Expected a "${label}" button.`);
}

function allTokens(calls: readonly ApiCall[]) {
  const tokens: string[] = [];
  for (const call of calls) {
    const markup = call.payload.reply_markup as Keyboard | undefined;
    if (markup === undefined) continue;
    for (const row of markup.inline_keyboard) {
      for (const button of row) tokens.push(button.callback_data);
    }
  }
  return tokens;
}

/**
 * Runs the whole migrated setup wizard for one chat and returns the harness
 * that drove it, so later assertions can reuse the same recorded calls.
 */
async function completeSetup(
  harness: ReturnType<typeof createHarness>,
  chatId: bigint,
  base: number,
) {
  await harness.send(messageUpdate(base + 1, chatId, ADMIN_ID, "/setup"));
  await harness.send(
    callbackUpdate(
      base + 2,
      chatId,
      ADMIN_ID,
      tokenLabelled(harness.lastOf("sendMessage"), "Start setup"),
    ),
  );
  await harness.send(locationUpdate(base + 3, chatId, ADMIN_ID));
  await harness.send(
    callbackUpdate(
      base + 4,
      chatId,
      ADMIN_ID,
      tokenLabelled(harness.lastOf("editMessageText"), "Use Europe/Kyiv"),
    ),
  );
  await harness.send(
    callbackUpdate(
      base + 5,
      chatId,
      ADMIN_ID,
      tokenLabelled(harness.lastOf("sendMessage"), "Wed"),
    ),
  );
  await harness.send(messageUpdate(base + 6, chatId, ADMIN_ID, "19:30"));
  await harness.send(messageUpdate(base + 7, chatId, ADMIN_ID, "120"));
  await harness.send(messageUpdate(base + 8, chatId, ADMIN_ID, "10:00"));
  await harness.send(messageUpdate(base + 9, chatId, ADMIN_ID, "22:00"));
  await harness.send(
    callbackUpdate(
      base + 10,
      chatId,
      ADMIN_ID,
      tokenLabelled(harness.lastOf("sendMessage"), "Use defaults"),
    ),
  );
  await harness.send(
    callbackUpdate(
      base + 11,
      chatId,
      ADMIN_ID,
      tokenLabelled(harness.lastOf("sendMessage"), "Admins only"),
    ),
  );
  const saveToken = tokenLabelled(
    harness.lastOf("sendMessage"),
    "Save configuration",
  );
  await harness.send(callbackUpdate(base + 12, chatId, ADMIN_ID, saveToken));
  return saveToken;
}

describe("Phase 1 route composition", () => {
  it("registers every Phase 1 route once and gates each protected route on the current administrator", async () => {
    const chatId = -1009000000001n;
    expect(CHAT_READINESS_ROUTES.map((route) => route.id).sort()).toStrictEqual(
      [
        "callback:ROSTER_REMOVE",
        "callback:SETTINGS_EDIT",
        "callback:START_SETUP",
        "command:roster",
        "command:roster_add",
        "command:settings",
        "command:setup",
        "update:message:location",
        "update:message:text",
      ].sort(),
    );
    expect(CHAT_READINESS_ROUTES.every((route) => route.protectedRoute)).toBe(
      true,
    );

    const harness = createHarness({
      prisma,
      chatId,
      role: (_chatId, actorId) =>
        actorId === ADMIN_ID ? "administrator" : "member",
    });

    const before = {
      setupDrafts: await prisma.setupDraft.count(),
      settingsDrafts: await prisma.settingsEditDraft.count(),
      memberships: await prisma.chatMembership.count(),
      configurations: await prisma.chatConfiguration.count(),
      actions: await prisma.callbackAction.count(),
    };

    const protectedUpdates: Array<[string, unknown]> = [
      ["command:setup", messageUpdate(1_001, chatId, MEMBER_ID, "/setup")],
      [
        "command:settings",
        messageUpdate(1_002, chatId, MEMBER_ID, "/settings"),
      ],
      ["command:roster", messageUpdate(1_003, chatId, MEMBER_ID, "/roster")],
      [
        "command:roster_add",
        messageUpdate(1_004, chatId, MEMBER_ID, "/roster_add", {
          reply_to_message: {
            message_id: 1,
            date: 1_784_000_000,
            chat: { id: Number(chatId), type: "supergroup" },
            from: {
              id: Number(BAND_MEMBER_ID),
              is_bot: false,
              first_name: "Ada",
            },
          },
        }),
      ],
      ["update:message:location", locationUpdate(1_005, chatId, MEMBER_ID)],
      ["update:message:text", messageUpdate(1_006, chatId, MEMBER_ID, "19:30")],
    ];

    for (const [id, update] of protectedUpdates) {
      harness.reset();
      await harness.send(update);
      expect(
        harness.events.filter((event) => event === "membership"),
        `${id} must consult the current role exactly once`,
      ).toHaveLength(1);
      expect(harness.events[0], `${id} must authorize first`).toBe(
        "membership",
      );
      expect(harness.last()?.payload.text, `${id} must deny`).toBe(
        COMMAND_DENIAL,
      );
    }

    expect({
      setupDrafts: await prisma.setupDraft.count(),
      settingsDrafts: await prisma.settingsEditDraft.count(),
      memberships: await prisma.chatMembership.count(),
      configurations: await prisma.chatConfiguration.count(),
      actions: await prisma.callbackAction.count(),
    }).toStrictEqual(before);
  });

  it("serializes concurrent updates for the same chat", async () => {
    const chatId = -1009000000002n;
    const order: string[] = [];
    const harness = createHarness({
      prisma,
      chatId,
      role: () => {
        order.push("enter");
        return "member";
      },
    });
    (
      harness.bot as unknown as {
        api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
      }
    ).api.config.use((async () => {
      order.push("exit");
      return { ok: true, result: true };
    }) as never);

    await Promise.all([
      harness.send(messageUpdate(1_101, chatId, MEMBER_ID, "/setup")),
      harness.send(messageUpdate(1_102, chatId, MEMBER_ID, "/setup")),
    ]);

    expect(order).toStrictEqual(["enter", "exit", "enter", "exit"]);
  });
});

describe("Phase 1 callback boundary", () => {
  it("acknowledges every callback before parsing, loading, authorizing, or reading durable state", async () => {
    const chatId = -1009000000003n;
    const harness = createHarness({ prisma, chatId });

    await harness.send(messageUpdate(2_001, chatId, ADMIN_ID, "/setup"));
    const startToken = tokenLabelled(
      harness.lastOf("sendMessage"),
      "Start setup",
    );

    harness.reset();
    await harness.send(callbackUpdate(2_002, chatId, ADMIN_ID, startToken));
    expect(harness.events.slice(0, 2)).toStrictEqual([
      "answerCallbackQuery",
      "membership",
    ]);

    harness.reset();
    await harness.send(
      callbackUpdate(2_003, chatId, ADMIN_ID, "not-an-opaque-token"),
    );
    expect(harness.events.slice(0, 2)).toStrictEqual([
      "answerCallbackQuery",
      "membership",
    ]);
    expect(harness.last()?.payload).toMatchObject({
      text: GENERIC_STALE,
      show_alert: true,
    });
  });

  it("issues only short opaque versioned tokens that carry no identity or claim", async () => {
    const chatId = -1009000000004n;
    const harness = createHarness({ prisma, chatId });
    await completeSetup(harness, chatId, 2_100);

    const tokens = allTokens(harness.calls);
    expect(tokens.length).toBeGreaterThan(5);
    for (const token of tokens) {
      expect(token).toMatch(/^v1:[0-9a-f-]{36}$/i);
      expect(Buffer.byteLength(token, "utf8")).toBeLessThanOrEqual(64);
      expect(token).not.toContain(String(ADMIN_ID));
      expect(token).not.toContain(String(chatId).replace("-", ""));
      expect(token.toLowerCase()).not.toContain("europe");
      expect(token.toLowerCase()).not.toContain("admin");
    }
  });

  it("rejects malformed, missing, expired, cross-chat, cross-actor, duplicate, and demoted callbacks without changing authoritative state", async () => {
    const chatId = -1009000000005n;
    const otherChatId = -1009000000006n;
    const harness = createHarness({ prisma, chatId });
    const saveToken = await completeSetup(harness, chatId, 2_200);

    const committed = await prisma.chatConfiguration.findUniqueOrThrow({
      where: { chatId },
    });
    expect(committed.durationMinutes).toBe(120);

    async function unchanged() {
      await expect(
        prisma.chatConfiguration.findUniqueOrThrow({ where: { chatId } }),
      ).resolves.toMatchObject({ revision: committed.revision });
    }

    // Duplicate tap on a consumed save action.
    harness.reset();
    await harness.send(callbackUpdate(2_210, chatId, ADMIN_ID, saveToken));
    expect(harness.last()?.payload).toMatchObject({
      text: ALREADY_APPLIED,
      show_alert: true,
    });
    await unchanged();

    // Unknown but well-formed token.
    harness.reset();
    await harness.send(
      callbackUpdate(2_211, chatId, ADMIN_ID, `v1:${crypto.randomUUID()}`),
    );
    expect(harness.last()?.payload).toMatchObject({
      text: GENERIC_STALE,
      show_alert: true,
    });
    await unchanged();

    // A live setup action bound to another actor and another chat.
    await harness.send(messageUpdate(2_212, chatId, ADMIN_ID, "/settings"));
    const editToken = tokenLabelled(
      harness.lastOf("sendMessage"),
      "Edit duration",
    );

    harness.reset();
    await harness.send(callbackUpdate(2_213, chatId, MEMBER_ID, editToken));
    expect(harness.last()?.payload).toMatchObject({
      text: GENERIC_STALE,
      show_alert: true,
    });

    harness.reset();
    await harness.send(callbackUpdate(2_214, otherChatId, ADMIN_ID, editToken));
    expect(harness.last()?.payload).toMatchObject({
      text: GENERIC_STALE,
      show_alert: true,
    });

    // The same action after it expired.
    const expired = createHarness({
      prisma,
      chatId,
      now: () => new Date(NOW.getTime() + 31 * 60 * 1000),
    });
    await expired.send(callbackUpdate(2_215, chatId, ADMIN_ID, editToken));
    expect(expired.last()?.payload).toMatchObject({
      text: GENERIC_STALE,
      show_alert: true,
    });

    // A demoted administrator is denied and loses every actor-bound draft.
    const demoted = createHarness({ prisma, chatId, role: () => "member" });
    await demoted.send(callbackUpdate(2_216, chatId, ADMIN_ID, editToken));
    expect(demoted.methods()).toStrictEqual([
      "answerCallbackQuery",
      "answerCallbackQuery",
    ]);
    expect(demoted.last()?.payload).toMatchObject({
      text: CALLBACK_DENIAL,
      show_alert: true,
    });
    expect(
      await prisma.settingsEditDraft.count({
        where: { chatId, actorUserId: ADMIN_ID },
      }),
    ).toBe(0);
    await unchanged();

    // A stale setup action keeps the setup-specific copy.
    const staleSetup = await prisma.callbackAction.findFirstOrThrow({
      where: { chatId, kind: "START_SETUP", consumedAt: { not: null } },
    });
    harness.reset();
    await harness.send(
      callbackUpdate(2_217, chatId, ADMIN_ID, staleSetup.token),
    );
    expect(harness.last()?.payload.text).toBe(SETUP_STALE);
    await unchanged();
  });

  it("keeps the roster projection authoritative when the durable read fails", async () => {
    const chatId = -1009000000007n;
    const failing = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property === "chatMembership") {
          return {
            async findMany() {
              throw new Error("simulated roster read failure");
            },
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as PrismaClient;
    const harness = createHarness({ prisma: failing, chatId });

    await harness.send(messageUpdate(2_301, chatId, ADMIN_ID, "/roster"));
    expect(harness.lastOf("sendMessage")?.payload.text).toBe(
      "<b>Band roster</b>\nLoading the roster…",
    );
    expect(harness.last()?.payload.text).toBe(ROSTER_READ_FAILURE);
    expect(tokenLabelled(harness.last(), "Retry")).toMatch(/^v1:/);
  });
});

describe("full migrated readiness workflow", () => {
  it("completes setup, survives a restart, edits settings, and manages the roster", async () => {
    const chatId = -1009000000010n;
    const first = createHarness({ prisma, chatId });
    await completeSetup(first, chatId, 3_000);

    expect(first.lastOf("sendMessage")?.payload.text).toContain(
      "<b>Chat configuration saved</b>",
    );
    const saved = await prisma.chatConfiguration.findUniqueOrThrow({
      where: { chatId },
    });
    expect(saved).toMatchObject({
      timezone: "Europe/Kyiv",
      defaultWeekday: 3,
      defaultStartMinute: 1170,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
      planningAccessPolicy: "ADMINS_ONLY",
    });
    expect(saved.reminderMinutes).toStrictEqual([600, 960]);

    // Restart: a new Prisma client and a new bot read the same migrated state.
    const restartedPrisma = connect();
    const second = createHarness({ prisma: restartedPrisma, chatId });

    await second.send(messageUpdate(3_100, chatId, ADMIN_ID, "/settings"));
    const dashboard = second.lastOf("sendMessage");
    expect(dashboard?.payload.text).toContain("<b>Chat settings</b>");
    expect(dashboard?.payload.text).toContain("Duration: 120 minutes");
    expect(dashboard?.payload.text).toContain(
      "Time zone: <code>Europe/Kyiv</code>",
    );

    // Settings edit reaches the settings surface, not the setup wizard.
    await second.send(
      callbackUpdate(
        3_101,
        chatId,
        ADMIN_ID,
        tokenLabelled(dashboard, "Edit duration"),
      ),
    );
    expect(second.lastOf("editMessageText")?.payload.text).toContain(
      "<b>Duration</b>",
    );

    await second.send(messageUpdate(3_102, chatId, ADMIN_ID, "90"));
    const review = second.lastOf("sendMessage");
    expect(review?.payload.text).toBe(
      "<b>Review change</b>\nCurrent: 120 minutes\nNew: 90 minutes",
    );

    await second.send(
      callbackUpdate(
        3_103,
        chatId,
        ADMIN_ID,
        tokenLabelled(review, "Save change"),
      ),
    );
    expect(second.lastOf("editMessageText")?.payload.text).toContain(
      "Duration: 90 minutes",
    );
    await expect(
      restartedPrisma.chatConfiguration.findUniqueOrThrow({
        where: { chatId },
      }),
    ).resolves.toMatchObject({
      durationMinutes: 90,
      revision: saved.revision + 1,
    });

    // Roster add, list, and removal on the same migrated database.
    second.reset();
    await second.send(
      messageUpdate(3_104, chatId, ADMIN_ID, "/roster_add", {
        reply_to_message: {
          message_id: 40,
          date: 1_784_000_000,
          chat: { id: Number(chatId), type: "supergroup" },
          from: {
            id: Number(BAND_MEMBER_ID),
            is_bot: false,
            first_name: "Ada",
            username: "ada",
          },
        },
      }),
    );
    expect(second.last()?.payload.text).toBe(
      "✅ Added Ada — @ada to the band roster.",
    );

    second.reset();
    await second.send(messageUpdate(3_105, chatId, ADMIN_ID, "/roster"));
    expect(second.events).toStrictEqual([
      "membership",
      "sendMessage",
      "editMessageText",
    ]);
    const page = second.lastOf("editMessageText");
    expect(page?.payload.text).toBe("<b>Band roster</b>\n• Ada — @ada");

    await second.send(
      callbackUpdate(
        3_106,
        chatId,
        ADMIN_ID,
        tokenLabelled(page, "Remove member"),
      ),
    );
    const confirmation = second.lastOf("editMessageText");
    expect(confirmation?.payload.text).toBe(
      "<b>Remove Ada — @ada?</b>\nThey will no longer be selected for future rehearsals.",
    );

    await second.send(
      callbackUpdate(
        3_107,
        chatId,
        ADMIN_ID,
        tokenLabelled(confirmation, "Remove member"),
      ),
    );
    expect(second.lastOf("editMessageText")?.payload.text).toBe(
      "<b>Roster updated</b>\nThey will no longer be selected for future rehearsals.",
    );

    // Restart again: the removal and the edited duration both survive.
    const thirdPrisma = connect();
    const third = createHarness({ prisma: thirdPrisma, chatId });
    await third.send(messageUpdate(3_200, chatId, ADMIN_ID, "/roster"));
    expect(third.lastOf("editMessageText")?.payload.text).toBe(
      "<b>No band members yet</b>\nReply to a member's message, then send /roster_add to add them.",
    );
    await third.send(messageUpdate(3_201, chatId, ADMIN_ID, "/settings"));
    expect(third.lastOf("sendMessage")?.payload.text).toContain(
      "Duration: 90 minutes",
    );

    // No undocumented Telegram surface was used anywhere in the workflow.
    const used = new Set(
      [...first.methods(), ...second.methods(), ...third.methods()].filter(
        (method) => method !== "membership",
      ),
    );
    for (const method of used) {
      expect(DOCUMENTED_TELEGRAM_METHODS.has(method), method).toBe(true);
    }
  }, 120_000);
});
