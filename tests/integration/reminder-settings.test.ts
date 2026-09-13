import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { SettingsService } from "../../src/domain/chat/settings-service.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  createCallbackToken,
  createSettingsTarget,
} from "../../src/shared/callback-schema.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
import type { SettingsField } from "../../src/generated/prisma/client.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import { createSetupTarget } from "../../src/shared/callback-schema.js";
import { enumerateReminderOccurrences } from "../../src/domain/reminders/reminder-occurrences.js";

let db: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const chatId = -606n,
  actor = 1n;
const at = new Date("2026-09-16T12:00Z");
beforeAll(async () => {
  db = await startPostgresTestContainer();
  prisma = createPrismaClient(db.databaseUrl);
});
afterAll(async () => {
  await prisma?.$disconnect();
  await db?.stop();
});
beforeEach(async () => {
  await prisma.callbackAction.deleteMany();
  await prisma.settingsEditDraft.deleteMany();
  await prisma.reminderOccurrence.deleteMany();
  await prisma.planningRound.deleteMany();
  await prisma.chatConfiguration.deleteMany();
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration(),
      reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
    },
  });
});
async function edit(field: SettingsField, value: unknown) {
  const service = new SettingsService(prisma);
  const draft = await service.beginEdit(chatId, actor, field, at);
  if (!draft) throw new Error("missing draft");
  await service.selectValue(chatId, actor, draft.id, value, at);
  const token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      chatId,
      actorUserId: actor,
      kind: "SETTINGS_EDIT",
      targetId: createSettingsTarget({ draftId: draft.id, action: "save" }),
      expiresAt: new Date(at.getTime() + 60000),
    },
  });
  return { service, token };
}
it("save and duplicate preserve one generation boundary and obsolete old work", async () => {
  await prisma.reminderOccurrence.create({
    data: {
      chatId,
      kind: "PLANNING_START",
      scope: "2026-09-14",
      generation: 1,
      civilDate: new Date("2026-09-17"),
      minute: 600,
      dueAt: new Date("2026-09-17T07:00Z"),
    },
  });
  const { service, token } = await edit("REMINDER_MINUTES", [840, 960]);
  expect(await service.saveChange(chatId, actor, token, at)).toEqual({
    kind: "saved",
  });
  expect(await service.saveChange(chatId, actor, token, at)).toEqual({
    kind: "duplicate",
  });
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toMatchObject({ generation: 2, effectiveFrom: at });
  expect(await prisma.reminderOccurrence.findFirst()).toMatchObject({
    disposition: "OBSOLETE",
  });
});
it("unrelated settings retain actual missed work and activation", async () => {
  const before = await prisma.chatReminderState.findUnique({
    where: { chatId },
  });
  const { service, token } = await edit("DEFAULT_WEEKDAY", 5);
  expect(await service.saveChange(chatId, actor, token, at)).toEqual({
    kind: "saved",
  });
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toEqual(before);
});
it("timezone change preserves rehearsal instant and protective timestamps", async () => {
  const round = await prisma.planningRound.create({
    data: {
      chatId,
      authorUserId: actor,
      targetWeekStart: "2026-09-14",
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      lastActivityAt: at,
      startsAt: new Date("2026-09-18T15:00Z"),
      endsAt: new Date("2026-09-18T17:00Z"),
      firstAvailabilityPublishedAt: new Date("2026-09-16T11:55Z"),
      lastReminderAttemptAt: new Date("2026-09-16T11:50Z"),
    },
  });
  await prisma.chatReminderState.update({
    where: { chatId },
    data: {
      quietWeekStart: new Date("2026-09-14"),
      quietUntil: new Date("2026-09-20T21:00Z"),
    },
  });
  const { service, token } = await edit("TIMEZONE", "America/Los_Angeles");
  expect(await service.saveChange(chatId, actor, token, at)).toEqual({
    kind: "saved",
  });
  expect(
    await prisma.planningRound.findUnique({ where: { id: round.id } }),
  ).toEqual(round);
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toMatchObject({ quietUntil: new Date("2026-09-21T07:00Z"), generation: 2 });
});
it("recreated reconciler never invents an exact-save or past reminder", async () => {
  const { service, token } = await edit("TIMEZONE", "UTC");
  expect(await service.saveChange(chatId, actor, token, at)).toEqual({
    kind: "saved",
  });
  const transport = vi.fn(async () => ({ messageId: 1 }));
  await new ReminderService({
    prisma,
    botUserId: 9n,
    now: () => at,
    transport,
    logger: createLogger({ level: "silent" }),
  }).reconcile(chatId);
  expect(transport).not.toHaveBeenCalled();
  const rows = await prisma.reminderOccurrence.findMany();
  expect(rows.every((r) => r.dueAt > at && r.generation === 2)).toBe(true);
});
it("failure after generation write rolls back settings, callback and boundary", async () => {
  const before = await prisma.chatReminderState.findUnique({
    where: { chatId },
  });
  const { token } = await edit("REMINDER_MINUTES", [840, 900]);
  const failing = prisma.$extends({
    query: {
      settingsEditDraft: {
        async delete() {
          throw new Error("delete failed");
        },
      },
    },
  });
  expect(
    await new SettingsService(failing as unknown as typeof prisma).saveChange(
      chatId,
      actor,
      token,
      at,
    ),
  ).toEqual({ kind: "failed" });
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toEqual(before);
  expect(
    await prisma.chatConfiguration.findUnique({ where: { chatId } }),
  ).toMatchObject({ reminderMinutes: [600, 960], revision: 1 });
  expect(
    await prisma.callbackAction.findUnique({ where: { token } }),
  ).toMatchObject({ consumedAt: null });
});
it("initial setup activation and callback consumption commit together exactly once", async () => {
  await prisma.chatConfiguration.delete({ where: { chatId } });
  const { revision: _revision, ...config } = createChatConfiguration();
  const draft = await prisma.setupDraft.create({
    data: {
      chatId,
      actorUserId: actor,
      ...config,
      expiresAt: new Date(at.getTime() + 60000),
    },
  });
  const token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      chatId,
      actorUserId: actor,
      kind: "START_SETUP",
      targetId: createSetupTarget({ draftId: draft.id, action: "save" }),
      expiresAt: new Date(at.getTime() + 60000),
    },
  });
  const failing = prisma.$extends({
    query: {
      setupDraft: {
        async delete() {
          throw new Error("delete failed");
        },
      },
    },
  });
  expect(
    await new SetupService(
      failing as unknown as typeof prisma,
    ).saveConfiguration(chatId, actor, token, at),
  ).toEqual({ kind: "failed" });
  expect(await prisma.chatReminderState.count()).toBe(0);
  expect(await prisma.chatConfiguration.count()).toBe(0);
  const setup = new SetupService(prisma);
  expect((await setup.saveConfiguration(chatId, actor, token, at)).kind).toBe(
    "saved",
  );
  expect((await setup.saveConfiguration(chatId, actor, token, at)).kind).toBe(
    "duplicate",
  );
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toMatchObject({ generation: 1, effectiveFrom: at });
});
it("past-time insertion and exact-save equality generate only future follow-ups", async () => {
  const { service, token } = await edit("REMINDER_MINUTES", [840, 900]);
  expect((await service.saveChange(chatId, actor, token, at)).kind).toBe(
    "saved",
  );
  const state = await prisma.chatReminderState.findUniqueOrThrow({
    where: { chatId },
  });
  const candidates = enumerateReminderOccurrences({
    chatId,
    kind: "FOLLOW_UP",
    roundId: "round",
    generation: state.generation,
    timezone: "Europe/Kyiv",
    minutes: [840, 900],
    effectiveFrom: state.effectiveFrom,
    now: at,
  });
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every((r) => r.dueAt > at)).toBe(true);
});
