import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

let postgres: PostgresTestContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

async function createRound(id: string, chatId: bigint) {
  return prisma.planningRound.create({
    data: {
      id,
      chatId,
      authorUserId: -chatId,
      targetWeekStart: "2026-08-31",
      activeWeekStart: null,
      status: "CONFIRMED",
      step: "REVIEW",
      timezone: "Europe/Kyiv",
      durationMinutes: 120,
      dailyStartMinute: 9 * 60,
      dailyEndMinute: 22 * 60,
      lastActivityAt: new Date("2026-08-31T09:00:00.000Z"),
      confirmedAt: new Date("2026-08-31T09:00:00.000Z"),
    },
  });
}

async function createMembership(options: {
  id: string;
  chatId: bigint;
  telegramUserId: bigint;
  active?: boolean;
}) {
  await prisma.telegramUser.create({
    data: {
      telegramUserId: options.telegramUserId,
      firstName: `Member ${options.telegramUserId}`,
    },
  });

  return prisma.chatMembership.create({
    data: {
      id: options.id,
      chatId: options.chatId,
      telegramUserId: options.telegramUserId,
      ...(options.active === false ? { activeAt: null } : {}),
      deactivatedAt:
        options.active === false ? new Date("2026-08-30T09:00:00.000Z") : null,
    },
  });
}

describe("planning participant referential integrity", () => {
  it("rejects a participant whose membership does not exist", async () => {
    const round = await createRound(
      "integrity-dangling-round",
      -1009000000001n,
    );
    const before = await prisma.planningParticipant.findMany({
      where: { roundId: round.id },
    });
    expect(before).toHaveLength(0);

    await expect(
      prisma.planningParticipant.create({
        data: {
          id: "integrity-dangling-participant",
          roundId: round.id,
          chatId: round.chatId,
          telegramUserId: 99001n,
          membershipId: "membership-that-does-not-exist",
        },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.planningParticipant.findMany({
        where: { roundId: round.id },
      }),
    ).toHaveLength(before.length);
  });

  it("accepts an existing membership even when it is soft-deactivated", async () => {
    const round = await createRound("integrity-soft-round", -1009000000002n);
    const membership = await createMembership({
      id: "integrity-soft-membership",
      chatId: round.chatId,
      telegramUserId: 99002n,
      active: false,
    });

    await prisma.planningParticipant.create({
      data: {
        id: "integrity-soft-participant",
        roundId: round.id,
        chatId: round.chatId,
        telegramUserId: membership.telegramUserId,
        membershipId: membership.id,
      },
    });

    expect(
      await prisma.planningParticipant.findMany({
        where: { roundId: round.id },
      }),
    ).toHaveLength(1);
  });

  it("refuses to delete a membership referenced by a snapshot", async () => {
    const round = await createRound(
      "integrity-restrict-round",
      -1009000000003n,
    );
    const membership = await createMembership({
      id: "integrity-restrict-membership",
      chatId: round.chatId,
      telegramUserId: 99003n,
    });
    await prisma.planningParticipant.create({
      data: {
        id: "integrity-restrict-participant",
        roundId: round.id,
        chatId: round.chatId,
        telegramUserId: membership.telegramUserId,
        membershipId: membership.id,
      },
    });

    const participantsBefore = await prisma.planningParticipant.findMany({
      where: { membershipId: membership.id },
    });
    expect(participantsBefore).toHaveLength(1);

    await expect(
      prisma.chatMembership.delete({ where: { id: membership.id } }),
    ).rejects.toThrow();

    expect(
      await prisma.chatMembership.findMany({ where: { id: membership.id } }),
    ).toHaveLength(1);
    expect(
      await prisma.planningParticipant.findMany({
        where: { membershipId: membership.id },
      }),
    ).toHaveLength(participantsBefore.length);
  });

  it("keeps the existing round-side cascade policy", async () => {
    const round = await createRound("integrity-cascade-round", -1009000000004n);
    const membership = await createMembership({
      id: "integrity-cascade-membership",
      chatId: round.chatId,
      telegramUserId: 99004n,
    });
    await prisma.planningParticipant.create({
      data: {
        id: "integrity-cascade-participant",
        roundId: round.id,
        chatId: round.chatId,
        telegramUserId: membership.telegramUserId,
        membershipId: membership.id,
      },
    });
    expect(
      await prisma.planningParticipant.findMany({
        where: { roundId: round.id },
      }),
    ).toHaveLength(1);

    await prisma.planningRound.delete({ where: { id: round.id } });

    expect(
      await prisma.planningParticipant.findMany({
        where: { roundId: round.id },
      }),
    ).toHaveLength(0);
  });

  it("rejects a participant whose user differs from its membership", async () => {
    const round = await createRound("integrity-user-round", -1009000000005n);
    const membership = await createMembership({
      id: "integrity-user-membership",
      chatId: round.chatId,
      telegramUserId: 99005n,
    });
    await prisma.telegramUser.create({
      data: { telegramUserId: 99006n, firstName: "Different member" },
    });

    await expect(
      prisma.planningParticipant.create({
        data: {
          id: "integrity-user-participant",
          roundId: round.id,
          chatId: round.chatId,
          telegramUserId: 99006n,
          membershipId: membership.id,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a participant whose membership belongs to another chat", async () => {
    const round = await createRound("integrity-chat-round", -1009000000006n);
    const membership = await createMembership({
      id: "integrity-chat-membership",
      chatId: -1009000000007n,
      telegramUserId: 99007n,
    });

    await expect(
      prisma.planningParticipant.create({
        data: {
          id: "integrity-chat-participant",
          roundId: round.id,
          chatId: round.chatId,
          telegramUserId: membership.telegramUserId,
          membershipId: membership.id,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("planning integrity catalog objects", () => {
  it("has indexes led by participant user id and callback expiry", async () => {
    const indexes = await prisma.$queryRaw<
      Array<{ tablename: string; indexdef: string }>
    >`
      SELECT tablename, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('planning_participants', 'callback_actions')
    `;
    expect(indexes.length).toBeGreaterThan(0);

    expect(
      indexes.some(
        ({ tablename, indexdef }) =>
          tablename === "planning_participants" &&
          /\((?:"telegram_user_id"|telegram_user_id)(?:\s|,|\))/.test(indexdef),
      ),
    ).toBe(true);
    expect(
      indexes.some(
        ({ tablename, indexdef }) =>
          tablename === "callback_actions" &&
          /\((?:"expires_at"|expires_at)(?:\s|,|\))/.test(indexdef),
      ),
    ).toBe(true);
  });

  it("offers exactly the three reachable planning round statuses", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT enumlabel AS label
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'PlanningRoundStatus'
      ORDER BY pg_enum.enumsortorder
    `;
    expect(labels.map(({ label }) => label)).toEqual([
      "DRAFT",
      "CONFIRMED",
      "SUPERSEDED",
    ]);
  });
});
