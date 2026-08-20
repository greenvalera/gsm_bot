import {
  CallbackActionKind,
  PlanningAccessPolicy,
  type PrismaClient,
} from "../../src/generated/prisma/client.js";
import { createBot } from "../../src/app/create-bot.js";
import type { UserFromGetMe } from "grammy/types";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import { SettingsService } from "../../src/domain/chat/settings-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createSetupTarget } from "../../src/shared/callback-schema.js";
import {
  renderSettingsDashboard,
  renderSetupReview,
} from "../../src/telegram/renderers.js";
import { transactionFailurePrisma } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const CHAT_ID = -1007654321000n;
const ACTOR_ID = 7001n;
const OTHER_ACTOR_ID = 7002n;

let postgres: PostgresTestContainer;
let prisma: PrismaClient;

async function createCompleteDraft(
  actorId = ACTOR_ID,
  expectedRevision = 0,
  expiresAt = new Date(NOW.getTime() + 30 * 60 * 1000),
) {
  return prisma.setupDraft.create({
    data: {
      chatId: CHAT_ID,
      actorUserId: actorId,
      timezone: "Europe/Kyiv",
      candidateTimezone: "Europe/Kyiv",
      defaultWeekday: 3,
      defaultStartMinute: 1140,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
      reminderMinutes: [600, 960],
      planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
      expectedRevision,
      expiresAt,
    },
  });
}

async function createSaveAction(draftId: string, actorId = ACTOR_ID) {
  const token = `save-${crypto.randomUUID()}`;
  await prisma.callbackAction.create({
    data: {
      token,
      kind: CallbackActionKind.START_SETUP,
      chatId: CHAT_ID,
      actorUserId: actorId,
      targetId: createSetupTarget({ draftId, action: "save" }),
      expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    },
  });
  return token;
}

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

describe("chat configuration promotion", () => {
  it("renders committed settings in fixed order and changes planning access only after review", async () => {
    const configuration = await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID - 3n,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
      },
    });
    const rendered = renderSettingsDashboard(configuration);
    expect(rendered.text.indexOf("<b>Schedule</b>")).toBeLessThan(
      rendered.text.indexOf("<b>Availability reminders</b>"),
    );
    expect(rendered.text.indexOf("<b>Availability reminders</b>")).toBeLessThan(
      rendered.text.indexOf("<b>Planning access</b>"),
    );

    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
        username: "gsmbot",
      } as UserFromGetMe,
      prisma,
      now: () => NOW,
      membershipGateway: {
        async getCurrentRole() {
          return "administrator";
        },
      },
    });
    (
      bot as unknown as { api: { config: { use: (fn: Function) => void } } }
    ).api.config.use(
      async (
        _previous: unknown,
        method: string,
        payload: Record<string, unknown>,
      ) => {
        calls.push({ method, payload });
        return { ok: true, result: true };
      },
    );

    await bot.handleUpdate({
      update_id: 99_100,
      message: {
        message_id: 778,
        date: 1_784_000_000,
        chat: { id: Number(configuration.chatId), type: "supergroup" },
        from: { id: Number(ACTOR_ID), is_bot: false, first_name: "Admin" },
        text: "/settings",
        entities: [{ offset: 0, length: 9, type: "bot_command" }],
      },
    } as never);
    const dashboardCall = calls.find((call) => call.method === "sendMessage");
    expect(dashboardCall, JSON.stringify(calls)).toBeDefined();
    expect(dashboardCall?.payload.text).toContain("<b>Chat settings</b>");
    const dashboardKeyboard = dashboardCall?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    const beginToken = dashboardKeyboard.inline_keyboard[0]?.[0]?.callback_data;
    if (beginToken === undefined)
      throw new Error("Expected dashboard edit token.");

    async function callback(updateId: number, id: string, data: string) {
      await bot.handleUpdate({
        update_id: updateId,
        callback_query: {
          id,
          from: { id: Number(ACTOR_ID), is_bot: false, first_name: "Admin" },
          chat_instance: "settings-test",
          data,
          message: {
            message_id: 778,
            date: 1_784_000_000,
            chat: { id: Number(configuration.chatId), type: "supergroup" },
          },
        },
      } as never);
    }

    await callback(99_101, "settings-begin", beginToken);
    const selectionCall = calls.at(-1);
    expect(selectionCall?.method).toBe("editMessageText");
    expect(selectionCall?.payload.text).toContain("Choose who can start");
    const selectionKeyboard = selectionCall?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    const anyoneToken =
      selectionKeyboard.inline_keyboard[2]?.[0]?.callback_data;
    if (anyoneToken === undefined) throw new Error("Expected policy token.");

    await callback(99_102, "settings-select", anyoneToken);
    const reviewCall = calls.at(-1);
    expect(reviewCall?.payload.text).toContain("Current: Admins only");
    expect(reviewCall?.payload.text).toContain("New: Anyone in chat");
    const reviewKeyboard = reviewCall?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ callback_data: string }>>;
    };
    const saveToken = reviewKeyboard.inline_keyboard[0]?.[0]?.callback_data;
    if (saveToken === undefined) throw new Error("Expected save token.");

    await callback(99_103, "settings-save", saveToken);
    expect(calls.at(-1)?.payload.text).toContain("<b>Chat settings</b>");
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: configuration.chatId },
      }),
    ).resolves.toMatchObject({
      planningAccessPolicy: PlanningAccessPolicy.ANYONE_IN_CHAT,
      revision: configuration.revision + 1,
    });
  });

  it("keeps committed settings unchanged until an actor-bound planning-access review is saved", async () => {
    const initial = await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID - 1n,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
      },
    });
    const settings = new SettingsService(prisma);

    const draft = await settings.beginPlanningAccessEdit(
      initial.chatId,
      ACTOR_ID,
      NOW,
    );
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: initial.chatId },
      }),
    ).resolves.toMatchObject({
      planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
      revision: initial.revision,
    });

    const review = await settings.selectPlanningAccessPolicy(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      PlanningAccessPolicy.ANYONE_IN_CHAT,
      NOW,
    );
    expect(review).toMatchObject({
      current: PlanningAccessPolicy.ADMINS_ONLY,
      replacement: PlanningAccessPolicy.ANYONE_IN_CHAT,
    });

    const saved = await settings.saveChange(
      initial.chatId,
      ACTOR_ID,
      await settings.createSaveAction(initial.chatId, ACTOR_ID, draft.id, NOW),
      NOW,
    );
    expect(saved).toMatchObject({ kind: "saved" });
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: initial.chatId },
      }),
    ).resolves.toMatchObject({
      planningAccessPolicy: PlanningAccessPolicy.ANYONE_IN_CHAT,
      revision: initial.revision + 1,
    });
  });

  it("rejects stale, expired, duplicate, and invalid planning-access saves without revision changes", async () => {
    const initial = await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID - 2n,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
      },
    });
    const settings = new SettingsService(prisma);
    const draft = await settings.beginPlanningAccessEdit(
      initial.chatId,
      ACTOR_ID,
      NOW,
    );
    await expect(
      settings.selectPlanningAccessPolicy(
        initial.chatId,
        ACTOR_ID,
        draft.id,
        "INVALID" as never,
        NOW,
      ),
    ).rejects.toThrow("Unsupported planning access policy");
    const expired = await settings.createSaveAction(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      NOW,
    );
    await prisma.callbackAction.update({
      where: { token: expired },
      data: { expiresAt: new Date(NOW.getTime() - 1) },
    });
    await expect(
      settings.saveChange(initial.chatId, ACTOR_ID, expired, NOW),
    ).resolves.toEqual({ kind: "stale" });
    const save = await settings.createSaveAction(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      NOW,
    );
    await settings.selectPlanningAccessPolicy(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      PlanningAccessPolicy.PREVIOUS_PARTICIPANTS,
      NOW,
    );
    await expect(
      settings.saveChange(initial.chatId, ACTOR_ID, save, NOW),
    ).resolves.toMatchObject({ kind: "saved" });
    await expect(
      settings.saveChange(initial.chatId, ACTOR_ID, save, NOW),
    ).resolves.toEqual({ kind: "duplicate" });
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: initial.chatId },
      }),
    ).resolves.toMatchObject({ revision: initial.revision + 1 });
  });

  it("keeps the committed policy when a reviewed settings edit is discarded", async () => {
    const initial = await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID - 4n,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
      },
    });
    const settings = new SettingsService(prisma);
    const draft = await settings.beginPlanningAccessEdit(
      initial.chatId,
      ACTOR_ID,
      NOW,
    );
    await settings.selectPlanningAccessPolicy(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      PlanningAccessPolicy.ANYONE_IN_CHAT,
      NOW,
    );
    const keep = await settings.createAction(
      initial.chatId,
      ACTOR_ID,
      { draftId: draft.id, action: "keep" },
      NOW,
    );
    await expect(
      settings.keepCurrent(initial.chatId, ACTOR_ID, keep, NOW),
    ).resolves.toEqual({ kind: "saved" });
    await expect(
      settings.keepCurrent(initial.chatId, ACTOR_ID, keep, NOW),
    ).resolves.toEqual({ kind: "duplicate" });
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: initial.chatId },
      }),
    ).resolves.toMatchObject({
      planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
      revision: initial.revision,
    });
  });

  it("reauthorizes settings saves and removes a demoted actor's edit draft", async () => {
    const initial = await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID - 5n,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
      },
    });
    const settings = new SettingsService(prisma);
    const draft = await settings.beginPlanningAccessEdit(
      initial.chatId,
      ACTOR_ID,
      NOW,
    );
    await settings.selectPlanningAccessPolicy(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      PlanningAccessPolicy.ANYONE_IN_CHAT,
      NOW,
    );
    const save = await settings.createSaveAction(
      initial.chatId,
      ACTOR_ID,
      draft.id,
      NOW,
    );
    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
      } as UserFromGetMe,
      prisma,
      now: () => NOW,
      membershipGateway: {
        async getCurrentRole() {
          return "member";
        },
      },
    });
    (
      bot as unknown as { api: { config: { use: (fn: Function) => void } } }
    ).api.config.use(
      async (
        _previous: unknown,
        method: string,
        payload: Record<string, unknown>,
      ) => {
        calls.push({ method, payload });
        return { ok: true, result: true };
      },
    );

    await bot.handleUpdate({
      update_id: 99_104,
      callback_query: {
        id: "demoted-settings-save",
        from: { id: Number(ACTOR_ID), is_bot: false, first_name: "Demoted" },
        chat_instance: "settings-test",
        data: save,
        message: {
          message_id: 779,
          date: 1_784_000_000,
          chat: { id: Number(initial.chatId), type: "supergroup" },
        },
      },
    } as never);

    expect(calls.map((call) => call.method)).toEqual([
      "answerCallbackQuery",
      "answerCallbackQuery",
    ]);
    expect(calls.at(-1)?.payload).toMatchObject({
      text: "Only current chat administrators can do that.",
      show_alert: true,
    });
    await expect(
      prisma.settingsEditDraft.findUnique({ where: { id: draft.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.chatConfiguration.findUnique({
        where: { chatId: initial.chatId },
      }),
    ).resolves.toMatchObject({ revision: initial.revision });
  });

  it("renders every review value in the fixed order with Save configuration as the only promotion control", () => {
    const projection = renderSetupReview({
      timezone: "Europe/Kyiv",
      defaultWeekday: 3,
      defaultStartMinute: 1140,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
      reminderMinutes: [600, 960],
      planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
    });

    expect(projection.text).toMatch(
      /Time zone:[\s\S]*Default day:[\s\S]*Default start:[\s\S]*Duration:[\s\S]*Daily start:[\s\S]*Daily end:[\s\S]*Reminder times:[\s\S]*Planning access:/,
    );
    expect(projection.buttons?.flat().map((button) => button.text)).toEqual([
      "Save configuration",
      "Cancel setup",
    ]);
  });

  it("promotes all fields, consumes the callback, and survives a new Prisma client read", async () => {
    const draft = await createCompleteDraft();
    const token = await createSaveAction(draft.id);
    const result = await new SetupService(prisma).saveConfiguration(
      CHAT_ID,
      ACTOR_ID,
      token,
      NOW,
    );

    expect(result).toMatchObject({ kind: "saved" });
    expect(
      await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).toBeNull();
    expect(
      await prisma.callbackAction.findUnique({ where: { token } }),
    ).toMatchObject({ consumedAt: NOW });

    const restarted = createPrismaClient(postgres.databaseUrl);
    try {
      await expect(
        restarted.chatConfiguration.findUnique({ where: { chatId: CHAT_ID } }),
      ).resolves.toMatchObject({
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
        revision: 1,
      });
    } finally {
      await restarted.$disconnect();
    }
  });

  it("makes a duplicate save a non-mutating Already applied result", async () => {
    const draft = await createCompleteDraft(9001n, 1);
    const token = await createSaveAction(draft.id, 9001n);
    const setup = new SetupService(prisma);
    await expect(
      setup.saveConfiguration(CHAT_ID, 9001n, token, NOW),
    ).resolves.toMatchObject({ kind: "saved" });
    const beforeDuplicate = await prisma.chatConfiguration.findUnique({
      where: { chatId: CHAT_ID },
    });
    if (beforeDuplicate === null) {
      throw new Error("Expected the first save to create a configuration.");
    }
    await expect(
      setup.saveConfiguration(CHAT_ID, 9001n, token, NOW),
    ).resolves.toEqual({ kind: "duplicate" });
    await expect(
      prisma.chatConfiguration.findUnique({ where: { chatId: CHAT_ID } }),
    ).resolves.toMatchObject({ revision: beforeDuplicate.revision });
  });

  it("preserves the authoritative record for expired, conflicting, and failed saves", async () => {
    await prisma.chatConfiguration.create({
      data: {
        chatId: CHAT_ID + 1n,
        timezone: "Europe/Warsaw",
        defaultWeekday: 1,
        defaultStartMinute: 1080,
        durationMinutes: 90,
        dailyStartMinute: 540,
        dailyEndMinute: 1260,
        reminderMinutes: [600, 960],
      },
    });
    const expired = await prisma.setupDraft.create({
      data: {
        chatId: CHAT_ID + 1n,
        actorUserId: ACTOR_ID,
        timezone: "Europe/Kyiv",
        defaultWeekday: 3,
        defaultStartMinute: 1140,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
        expectedRevision: 1,
        expiresAt: new Date(NOW.getTime() - 1),
      },
    });
    const token = `expired-${crypto.randomUUID()}`;
    await prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.START_SETUP,
        chatId: CHAT_ID + 1n,
        actorUserId: ACTOR_ID,
        targetId: createSetupTarget({ draftId: expired.id, action: "save" }),
        expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      },
    });
    await expect(
      new SetupService(prisma).saveConfiguration(
        CHAT_ID + 1n,
        ACTOR_ID,
        token,
        NOW,
      ),
    ).resolves.toEqual({ kind: "expired" });
    await expect(
      prisma.setupDraft.findUnique({ where: { id: expired.id } }),
    ).resolves.toBeNull();

    const conflict = await createCompleteDraft(8001n, 99);
    const conflictToken = await createSaveAction(conflict.id, 8001n);
    await expect(
      new SetupService(prisma).saveConfiguration(
        CHAT_ID,
        8001n,
        conflictToken,
        NOW,
      ),
    ).resolves.toEqual({ kind: "conflict" });

    await expect(
      new SetupService(transactionFailurePrisma() as never).saveConfiguration(
        CHAT_ID,
        ACTOR_ID,
        "persistence-failure",
        NOW,
      ),
    ).resolves.toEqual({ kind: "failed" });
    await expect(
      prisma.chatConfiguration.findUnique({ where: { chatId: CHAT_ID + 1n } }),
    ).resolves.toMatchObject({ timezone: "Europe/Warsaw", revision: 1 });
  });

  it("rejects incomplete and stale saves without consuming their actions or overwriting active settings", async () => {
    const activeBefore = await prisma.chatConfiguration.findUnique({
      where: { chatId: CHAT_ID },
    });
    if (activeBefore === null)
      throw new Error("Expected an active configuration.");
    const incomplete = await createCompleteDraft(8101n, activeBefore.revision);
    await prisma.setupDraft.update({
      where: { id: incomplete.id },
      data: { planningAccessPolicy: null },
    });
    const incompleteToken = await createSaveAction(incomplete.id, 8101n);
    const staleToken = `stale-${crypto.randomUUID()}`;
    await prisma.callbackAction.create({
      data: {
        token: staleToken,
        kind: CallbackActionKind.START_SETUP,
        chatId: CHAT_ID,
        actorUserId: 8101n,
        targetId: createSetupTarget({ draftId: incomplete.id, action: "save" }),
        expiresAt: new Date(NOW.getTime() - 1),
      },
    });

    await expect(
      new SetupService(prisma).saveConfiguration(
        CHAT_ID,
        8101n,
        incompleteToken,
        NOW,
      ),
    ).resolves.toEqual({ kind: "failed" });
    await expect(
      new SetupService(prisma).saveConfiguration(
        CHAT_ID,
        8101n,
        staleToken,
        NOW,
      ),
    ).resolves.toEqual({ kind: "stale" });
    await expect(
      prisma.callbackAction.findUnique({ where: { token: incompleteToken } }),
    ).resolves.toMatchObject({ consumedAt: null });
    await expect(
      prisma.chatConfiguration.findUnique({ where: { chatId: CHAT_ID } }),
    ).resolves.toMatchObject({ revision: activeBefore.revision });
  });

  it("reauthorizes a save callback and deletes a demoted actor's draft before it can promote", async () => {
    const actorId = 8201n;
    const active = await prisma.chatConfiguration.findUnique({
      where: { chatId: CHAT_ID },
    });
    if (active === null) throw new Error("Expected an active configuration.");
    const draft = await createCompleteDraft(actorId, active.revision);
    const token = await createSaveAction(draft.id, actorId);
    const calls: Array<{ method: string; payload: Record<string, unknown> }> =
      [];
    const bot = createBot({
      botToken: "123456:TEST_TOKEN",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
      } as UserFromGetMe,
      prisma,
      now: () => NOW,
      membershipGateway: {
        async getCurrentRole() {
          return "member";
        },
      },
    });
    (
      bot as unknown as { api: { config: { use: (fn: Function) => void } } }
    ).api.config.use(
      async (
        _previous: unknown,
        method: string,
        payload: Record<string, unknown>,
      ) => {
        calls.push({ method, payload });
        return { ok: true, result: true };
      },
    );

    await bot.handleUpdate({
      update_id: 99_001,
      callback_query: {
        id: "demoted-save",
        from: { id: Number(actorId), is_bot: false, first_name: "Demoted" },
        chat_instance: "test-chat-instance",
        data: token,
        message: {
          message_id: 777,
          date: 1_784_000_000,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
        },
      },
    } as never);

    expect(calls.map((call) => call.method)).toEqual([
      "answerCallbackQuery",
      "answerCallbackQuery",
    ]);
    expect(calls.at(-1)?.payload).toMatchObject({
      text: "Only current chat administrators can do that.",
      show_alert: true,
    });
    await expect(
      prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.chatConfiguration.findUnique({ where: { chatId: CHAT_ID } }),
    ).resolves.toMatchObject({ revision: active.revision });
  });

  it("cancels only the initiating administrator's draft", async () => {
    const owner = await createCompleteDraft(OTHER_ACTOR_ID);
    const other = await createCompleteDraft(OTHER_ACTOR_ID + 1n);
    const token = `cancel-${crypto.randomUUID()}`;
    await prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.START_SETUP,
        chatId: CHAT_ID,
        actorUserId: OTHER_ACTOR_ID,
        targetId: createSetupTarget({ draftId: owner.id, action: "cancel" }),
        expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      },
    });

    await expect(
      new SetupService(prisma).cancelSetup(CHAT_ID, OTHER_ACTOR_ID, token, NOW),
    ).resolves.toEqual({ kind: "cancelled" });
    await expect(
      prisma.setupDraft.findUnique({ where: { id: owner.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.setupDraft.findUnique({ where: { id: other.id } }),
    ).resolves.not.toBeNull();
  });
});
