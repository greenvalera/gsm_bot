import { afterAll, beforeAll, beforeEach, it, expect, vi } from "vitest";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  createCallbackToken,
  createPlanningTarget,
} from "../../src/shared/callback-schema.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";
let db: PostgresTestContainer, prisma: ReturnType<typeof createPrismaClient>;
const at = new Date("2026-09-16T06:00Z"),
  chatId = -607n,
  actor = 1n;
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
  await prisma.reminderOccurrence.deleteMany();
  await prisma.planningParticipant.deleteMany();
  await prisma.planningRound.deleteMany();
  await prisma.chatMembership.deleteMany();
  await prisma.chatConfiguration.deleteMany();
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({ planningAccessPolicy: "ANYONE_IN_CHAT" }),
      reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
    },
  });
});
async function fixture(
  status: "DRAFT" | "CONFIRMED" | "BOOKED" = "CONFIRMED",
  week = "2026-09-14",
) {
  await prisma.telegramUser.upsert({
    where: { telegramUserId: actor },
    create: { telegramUserId: actor, firstName: "Member" },
    update: {},
  });
  const membership = await prisma.chatMembership.create({
    data: { chatId, telegramUserId: actor, activeAt: at },
  });
  const round = await prisma.planningRound.create({
    data: {
      chatId,
      authorUserId: actor,
      status,
      step: "REVIEW",
      targetWeekStart: week,
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      lastActivityAt: at,
      startsAt: new Date("2026-09-18T15:00Z"),
      endsAt: new Date("2026-09-18T17:00Z"),
      selectedDate: "2026-09-18",
      selectedStartMinute: 1080,
    },
  });
  await prisma.planningParticipant.create({
    data: {
      roundId: round.id,
      chatId,
      telegramUserId: actor,
      membershipId: membership.id,
      availability: "UNAVAILABLE",
    },
  });
  const occurrence = await prisma.reminderOccurrence.create({
    data: {
      chatId,
      kind: "FOLLOW_UP",
      scope: round.id,
      roundId: round.id,
      generation: 1,
      civilDate: new Date("2026-09-17"),
      minute: 600,
      dueAt: new Date("2026-09-17T07:00Z"),
    },
  });
  const service = new PlanningService(prisma);
  const request = await service.mintCancelRequestAction(prisma, round, at);
  const offer = await service.requestCancel(
    chatId,
    actor,
    request.token,
    at,
    async () => "member",
  );
  if (offer.kind !== "offered") throw new Error(offer.kind);
  const token = offer.actions.find(
    (a) => a.target.action === "cancel-apply",
  )!.token;
  return { round, occurrence, service, token };
}
it.each(["DRAFT", "CONFIRMED", "BOOKED"] as const)(
  "cancelling %s persists quiet week and invalidates once",
  async (status) => {
    const f = await fixture(status);
    expect(
      (
        await f.service.applyCancel(
          chatId,
          actor,
          f.token,
          null,
          at,
          async () => "member",
        )
      ).kind,
    ).toBe("cancelled");
    const state = await prisma.chatReminderState.findUnique({
      where: { chatId },
    });
    expect(state).toMatchObject({
      quietWeekStart: new Date("2026-09-14"),
      quietUntil: new Date("2026-09-20T21:00Z"),
    });
    expect(
      await prisma.reminderOccurrence.findUnique({
        where: { id: f.occurrence.id },
      }),
    ).toMatchObject({ disposition: "OBSOLETE" });
    await f.service.applyCancel(
      chatId,
      actor,
      f.token,
      null,
      at,
      async () => "member",
    );
    expect(
      await prisma.chatReminderState.findUnique({ where: { chatId } }),
    ).toEqual(state);
    const transport = vi.fn(async () => ({ messageId: 7 }));
    const restart = (now: Date) =>
      new ReminderService({
        prisma,
        botUserId: 9n,
        now: () => now,
        transport,
        logger: createLogger({ level: "silent" }),
      });
    await restart(new Date("2026-09-17T07:00Z")).reconcile(chatId);
    expect(transport).not.toHaveBeenCalled();
    await restart(new Date("2026-09-21T07:00Z")).reconcile(chatId);
    expect(transport).toHaveBeenCalledTimes(1);
  },
);
it("cancellation permits immediate manual planning", async () => {
  const f = await fixture();
  await f.service.applyCancel(
    chatId,
    actor,
    f.token,
    null,
    at,
    async () => "member",
  );
  const result = await new PlanningService(prisma).startOrResume(
    chatId,
    actor,
    at,
  );
  expect(result.kind).toBe("started");
});
it("failed invalidation rolls back cancellation and consumption", async () => {
  const f = await fixture();
  const broken = prisma.$extends({
    query: {
      reminderOccurrence: {
        async updateMany() {
          throw new Error("ledger failed");
        },
      },
    },
  });
  expect(
    (
      await new PlanningService(broken as unknown as typeof prisma).applyCancel(
        chatId,
        actor,
        f.token,
        null,
        at,
        async () => "member",
      )
    ).kind,
  ).toBe("failed");
  expect(
    await prisma.planningRound.findUnique({ where: { id: f.round.id } }),
  ).toMatchObject({ status: "CONFIRMED" });
  expect(
    await prisma.callbackAction.findUnique({ where: { token: f.token } }),
  ).toMatchObject({ consumedAt: null });
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toMatchObject({ quietUntil: null });
});
it("past/future week cancellation does not silence current week", async () => {
  const f = await fixture("CONFIRMED", "2026-09-21");
  await f.service.applyCancel(
    chatId,
    actor,
    f.token,
    null,
    at,
    async () => "member",
  );
  expect(
    await prisma.chatReminderState.findUnique({ where: { chatId } }),
  ).toMatchObject({ quietUntil: null });
});
it("replan invalidates immutable old-round identity without affecting successor", async () => {
  const f = await fixture();
  const token = await f.service.mintReplanAction(
    prisma,
    f.round,
    actor,
    at,
    "member",
  );
  expect(token).not.toBeNull();
  const result = await f.service.replanRound(
    chatId,
    actor,
    token!.token,
    null,
    at,
    async () => "member",
  );
  expect(result.kind).toBe("replanned");
  expect(
    await prisma.reminderOccurrence.findUnique({
      where: { id: f.occurrence.id },
    }),
  ).toMatchObject({ disposition: "OBSOLETE", roundId: f.round.id });
});

it.each(["book-apply", "change-apply"] as const)(
  "%s atomically invalidates pending and rejected old work",
  async (action) => {
    const f = await fixture();
    await prisma.planningParticipant.updateMany({
      where: { roundId: f.round.id },
      data: { availability: "AVAILABLE" },
    });
    await prisma.reminderOccurrence.update({
      where: { id: f.occurrence.id },
      data: { disposition: "REJECTED" },
    });
    const token = createCallbackToken();
    await prisma.callbackAction.create({
      data: {
        token,
        chatId,
        actorUserId: actor,
        kind: "PLANNING",
        targetId: createPlanningTarget({ action, roundId: f.round.id }),
        expiresAt: new Date(at.getTime() + 60000),
      },
    });
    const result =
      action === "book-apply"
        ? await f.service.applyBooking(
            chatId,
            actor,
            token,
            null,
            at,
            async () => "member",
          )
        : await f.service.applyChange(
            chatId,
            actor,
            token,
            at,
            async () => "member",
          );
    expect(result.kind).toBe(action === "book-apply" ? "booked" : "changed");
    expect(
      await prisma.reminderOccurrence.findUnique({
        where: { id: f.occurrence.id },
      }),
    ).toMatchObject({ disposition: "OBSOLETE", roundId: f.round.id });
  },
);
it("stale draft reaping commits its invalidation with supersession", async () => {
  const f = await fixture("DRAFT", "2026-09-07");
  expect(await f.service.supersedeStaleRounds(chatId, at)).toBe(1);
  expect(
    await prisma.reminderOccurrence.findUnique({
      where: { id: f.occurrence.id },
    }),
  ).toMatchObject({ disposition: "OBSOLETE" });
});
