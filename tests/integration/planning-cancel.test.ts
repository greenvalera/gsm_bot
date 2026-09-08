import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlanningService } from "../../src/domain/planning/planning-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

const NOW = new Date("2026-08-26T09:00:00Z");
const AUTHOR = 9007199254740991n;
const MEMBER = AUTHOR - 1n;
const ADMIN = AUTHOR - 2n;
let postgres: PostgresTestContainer;
let prisma: PrismaClient;
let service: PlanningService;
let nextChat = -946000n;
beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
  service = new PlanningService(prisma);
}, 180_000);
afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
});

async function addMember(chatId: bigint, userId: bigint) {
  await prisma.telegramUser.upsert({
    where: { telegramUserId: userId },
    create: { telegramUserId: userId, firstName: "Same" },
    update: {},
  });
  return prisma.chatMembership.create({
    data: { chatId, telegramUserId: userId, activeAt: NOW },
  });
}

async function fixture(status: "DRAFT" | "CONFIRMED" | "BOOKED" = "CONFIRMED") {
  const chatId = nextChat--;
  const config = createChatConfiguration({
    planningAccessPolicy: "ANYONE_IN_CHAT",
  });
  await prisma.chatConfiguration.create({ data: { chatId, ...config } });
  const memberships = await Promise.all(
    [AUTHOR, MEMBER, ADMIN].map((id) => addMember(chatId, id)),
  );
  const round = await prisma.planningRound.create({
    data: {
      chatId,
      authorUserId: AUTHOR,
      status,
      step: "REVIEW",
      targetWeekStart: "2026-08-24",
      activeWeekStart: null,
      timezone: config.timezone,
      durationMinutes: config.durationMinutes,
      dailyStartMinute: config.dailyStartMinute,
      dailyEndMinute: config.dailyEndMinute,
      selectedDate: "2026-08-27",
      selectedStartMinute: 900,
      startsAt: new Date("2026-08-27T12:00:00Z"),
      endsAt: new Date("2026-08-27T14:00:00Z"),
      confirmedAt: NOW,
      lastActivityAt: NOW,
    },
  });
  await prisma.planningParticipant.createMany({
    data: memberships.map((m) => ({
      roundId: round.id,
      chatId,
      telegramUserId: m.telegramUserId,
      membershipId: m.id,
      availability: m.telegramUserId === AUTHOR ? "UNAVAILABLE" : null,
    })),
  });
  const actions = await service.mintAvailabilityActions(prisma, round, NOW);
  const replan = await service.mintCancelRequestAction(prisma, round, NOW);
  if (replan === null) throw new Error("Expected author replan control");
  return { chatId, round, token: replan.token, memberships, actions };
}

async function offer(f: Awaited<ReturnType<typeof fixture>>, actor = AUTHOR, role: "member" | "administrator" = "member") {
  const result = await service.requestCancel(f.chatId, actor, f.token, NOW, async () => role);
  if (result.kind !== "offered") throw new Error(JSON.stringify(result));
  return { result, apply: result.actions.find(a => a.target.action === "cancel-apply")!.token, keep: result.actions.find(a => a.target.action === "cancel-keep")!.token };
}

describe("cancellation transactions and standing", () => {
  it.each(["DRAFT", "CONFIRMED", "BOOKED"] as const)("cancels %s once while preserving the asked lineup and releasing recovery", async status => {
    const f = await fixture(status);
    const before = await prisma.planningParticipant.findMany({ where: { roundId: f.round.id } });
    const o = await offer(f);
    expect(o.result.actions).toHaveLength(2);
    expect((await prisma.planningRound.findUniqueOrThrow({ where: { id: f.round.id } })).status).toBe(status);
    const result = await service.applyCancel(f.chatId, AUTHOR, o.apply, null, NOW, async () => "member");
    expect(result.kind).toBe("cancelled");
    if (result.kind !== "cancelled") throw new Error("Expected cancellation");
    expect(result.previousStatus).toBe(status);
    expect(result.round).toMatchObject({ status: "CANCELLED", cancelledAt: NOW, cancelledByUserId: AUTHOR, activeWeekStart: null, revision: f.round.revision + 1 });
    expect(await prisma.planningParticipant.findMany({ where: { roundId: f.round.id } })).toEqual(before);
    expect(await service.wasPreviousParticipant(f.chatId, MEMBER)).toBe(true);
    expect(await service.wasPreviousParticipant(f.chatId, 17n)).toBe(false);
    expect((await service.status(f.chatId, MEMBER, NOW)).kind).toBe("no-active-round");
    expect((await service.applyCancel(f.chatId, AUTHOR, o.apply, null, NOW, async () => "member")).kind).toBe("duplicate");
    expect((await service.requestCancel(f.chatId, AUTHOR, f.token, NOW, async () => "member")).kind).toBe("already-cancelled");
  });
  it("rechecks demotion, preserves refused tokens, and admits a fresh administrator", async () => {
    const f = await fixture(); const o = await offer(f, ADMIN, "administrator");
    expect((await service.applyCancel(f.chatId, ADMIN, o.apply, null, NOW, async () => "member")).kind).toBe("not-eligible");
    expect((await prisma.callbackAction.findUniqueOrThrow({ where: { token: o.apply } })).consumedAt).toBeNull();
    expect((await service.applyCancel(f.chatId, ADMIN, o.apply, null, NOW, async () => "administrator")).kind).toBe("cancelled");
  });
  it("expires prior pairs, declines safely, releases a stale consume, and refuses superseded attempts", async () => {
    const f = await fixture(); const first = await offer(f); const second = await offer(f);
    expect((await service.applyCancel(f.chatId, AUTHOR, first.apply, null, NOW, async () => "member")).kind).toBe("stale");
    expect((await service.applyCancel(f.chatId, AUTHOR, second.apply, f.round.revision + 1, NOW, async () => "member")).kind).toBe("stale");
    expect((await prisma.callbackAction.findUniqueOrThrow({ where: { token: second.apply } })).consumedAt).toBeNull();
    expect((await service.keepCancel(f.chatId, AUTHOR, second.keep, NOW, async () => "member")).kind).toBe("kept");
    expect((await prisma.callbackAction.findUniqueOrThrow({ where: { token: second.apply } })).expiresAt).toEqual(NOW);
    await prisma.planningRound.update({ where: { id: f.round.id }, data: { status: "SUPERSEDED" } });
    expect((await service.requestCancel(f.chatId, AUTHOR, f.token, NOW, async () => "member")).kind).toBe("replanned");
    expect(await service.wasPreviousParticipant(f.chatId, MEMBER)).toBe(true);
  });
});
