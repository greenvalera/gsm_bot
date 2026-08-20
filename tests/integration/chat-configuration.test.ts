import {
  CallbackActionKind,
  PlanningAccessPolicy,
  type PrismaClient,
} from "../../src/generated/prisma/client.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createSetupTarget } from "../../src/shared/callback-schema.js";
import { renderSetupReview } from "../../src/telegram/renderers.js";
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
    expect(await prisma.setupDraft.findUnique({ where: { id: draft.id } })).toBeNull();
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
    const draft = await createCompleteDraft(9001n);
    const token = await createSaveAction(draft.id, 9001n);
    const setup = new SetupService(prisma);
    await expect(
      setup.saveConfiguration(CHAT_ID, 9001n, token, NOW),
    ).resolves.toMatchObject({ kind: "saved" });
    await expect(
      setup.saveConfiguration(CHAT_ID, 9001n, token, NOW),
    ).resolves.toEqual({ kind: "duplicate" });
    await expect(
      prisma.chatConfiguration.findUnique({ where: { chatId: CHAT_ID } }),
    ).resolves.toMatchObject({ revision: 1 });
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
      new SetupService(prisma).cancelSetup(
        CHAT_ID,
        OTHER_ACTOR_ID,
        token,
        NOW,
      ),
    ).resolves.toEqual({ kind: "cancelled" });
    await expect(prisma.setupDraft.findUnique({ where: { id: owner.id } })).resolves.toBeNull();
    await expect(prisma.setupDraft.findUnique({ where: { id: other.id } })).resolves.not.toBeNull();
  });
});
