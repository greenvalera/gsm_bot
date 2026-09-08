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
let nextChat = -940000n;
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

async function fixture() {
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
      status: "CONFIRMED",
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
  const replan = await service.mintReplanAction(
    prisma,
    round,
    AUTHOR,
    NOW,
    "member",
  );
  if (replan === null) throw new Error("Expected author replan control");
  return { chatId, round, token: replan.token, memberships, actions };
}

describe("blocked round replanning", () => {
  it("serializes answer reversal with supersession so only one state wins", async () => {
    const f = await fixture();
    const available = f.actions.find(
      (a) => a.target.action === "answer" && a.target.answer === "AVAILABLE",
    );
    if (available === undefined) throw new Error("Missing answer action");
    const [answer, replan] = await Promise.all([
      service.answerAvailability(f.chatId, AUTHOR, available.token, NOW),
      service.replanRound(
        f.chatId,
        AUTHOR,
        f.token,
        null,
        NOW,
        async () => "member",
      ),
    ]);
    if (replan.kind === "replanned") {
      expect(answer.kind).toBe("stale");
      expect(
        (
          await prisma.planningParticipant.findFirstOrThrow({
            where: { roundId: f.round.id, telegramUserId: AUTHOR },
          })
        ).availability,
      ).toBe("UNAVAILABLE");
    } else {
      expect(replan.kind).toBe("stale");
      expect(answer.kind).toBe("answered");
      expect(
        await prisma.planningRound.count({ where: { chatId: f.chatId } }),
      ).toBe(1);
    }
  });
  it("supersedes once and snapshots the live roster and settings with exact bigint identities", async () => {
    const f = await fixture();
    expect((await service.availabilityProjection(f.round)).outcome).toBe(
      "blocked",
    );
    await prisma.chatMembership.updateMany({
      where: { chatId: f.chatId, telegramUserId: MEMBER },
      data: { activeAt: null, deactivatedAt: NOW },
    });
    const added = await addMember(f.chatId, AUTHOR - 3n);
    await prisma.chatConfiguration.update({
      where: { chatId: f.chatId },
      data: { durationMinutes: 90 },
    });
    const result = await service.replanRound(
      f.chatId,
      AUTHOR,
      f.token,
      null,
      NOW,
      async () => "member",
    );
    expect(result.kind).toBe("replanned");
    if (result.kind !== "replanned") throw new Error(JSON.stringify(result));
    const old = await prisma.planningRound.findUniqueOrThrow({
      where: { id: f.round.id },
    });
    expect(old).toMatchObject({
      status: "SUPERSEDED",
      activeWeekStart: null,
      supersededByRoundId: result.round.id,
    });
    expect(result.round).toMatchObject({
      status: "DRAFT",
      step: "DAY",
      targetWeekStart: f.round.targetWeekStart,
      activeWeekStart: f.round.targetWeekStart,
      authorUserId: AUTHOR,
      durationMinutes: 90,
    });
    const participants = await prisma.planningParticipant.findMany({
      where: { roundId: result.round.id },
    });
    expect(participants.map((p) => p.telegramUserId).sort()).toEqual(
      [AUTHOR, ADMIN, added.telegramUserId].sort(),
    );
    expect(participants.every((p) => p.availability === null)).toBe(true);
    expect(
      await prisma.planningRound.count({
        where: { chatId: f.chatId, targetWeekStart: f.round.targetWeekStart },
      }),
    ).toBe(2);
    expect(
      await prisma.planningRound.count({
        where: { chatId: f.chatId, activeWeekStart: { not: null } },
      }),
    ).toBe(1);
    expect(
      (
        await service.replanRound(
          f.chatId,
          AUTHOR,
          f.token,
          null,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("duplicate");
    for (const action of f.actions)
      expect(
        (
          await prisma.callbackAction.findUniqueOrThrow({
            where: { token: action.token },
          })
        ).expiresAt.getTime(),
      ).toBeGreaterThan(NOW.getTime());
  });
  it("allows a current administrator and attributes the successor to that actor", async () => {
    const f = await fixture();
    const result = await service.replanRound(
      f.chatId,
      ADMIN,
      f.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(result.kind).toBe("replanned");
    if (result.kind === "replanned")
      expect(result.round.authorUserId).toBe(ADMIN);
  });
  it("refuses a non-author member without spending the token or changing the round", async () => {
    const f = await fixture();
    expect(
      (
        await service.replanRound(
          f.chatId,
          MEMBER,
          f.token,
          null,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("not-eligible");
    expect(
      await prisma.planningRound.findUnique({ where: { id: f.round.id } }),
    ).toEqual(f.round);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: f.token },
        })
      ).consumedAt,
    ).toBeNull();
    expect(
      await service.mintReplanAction(prisma, f.round, MEMBER, NOW, "member"),
    ).toBeNull();
  });
  it("refuses an empty roster before consume but accepts a single-member roster", async () => {
    const f = await fixture();
    await prisma.chatMembership.updateMany({
      where: { chatId: f.chatId },
      data: { activeAt: null, deactivatedAt: NOW },
    });
    expect(
      (
        await service.replanRound(
          f.chatId,
          AUTHOR,
          f.token,
          null,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("empty-roster");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: f.token },
        })
      ).consumedAt,
    ).toBeNull();
    await prisma.chatMembership.updateMany({
      where: { chatId: f.chatId, telegramUserId: AUTHOR },
      data: { activeAt: NOW, deactivatedAt: null },
    });
    const result = await service.replanRound(
      f.chatId,
      AUTHOR,
      f.token,
      null,
      NOW,
      async () => "member",
    );
    expect(result.kind).toBe("replanned");
    if (result.kind === "replanned")
      expect(
        await prisma.planningParticipant.count({
          where: { roundId: result.round.id },
        }),
      ).toBe(1);
  });
  it("rolls back token and supersession when another draft owns the week", async () => {
    const f = await fixture();
    const { id: _id, ...data } = f.round;
    await prisma.planningRound.create({
      data: {
        ...data,
        status: "DRAFT",
        activeWeekStart: f.round.targetWeekStart,
      },
    });
    expect(
      (
        await service.replanRound(
          f.chatId,
          AUTHOR,
          f.token,
          null,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("week-taken");
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: f.round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: f.token },
        })
      ).consumedAt,
    ).toBeNull();
  });
});
