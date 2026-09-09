import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
      expect(answer.kind).toBe("replanned");
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

describe("confirmed same-week changes", () => {
  async function offer(
    f: Awaited<ReturnType<typeof fixture>>,
    actor = AUTHOR,
    role: "member" | "administrator" = "member",
    now = NOW,
  ) {
    const request = await service.changeAction(
      f.round.id,
      AUTHOR,
      now,
      "member",
    );
    if (!request) throw new Error("Missing change request");
    const result = await service.requestChange(
      f.chatId,
      actor,
      request.token,
      now,
      async () => role,
    );
    if (result.kind !== "offered") throw new Error(JSON.stringify(result));
    const apply = result.actions.find(
      (a) => a.target.action === "change-apply",
    )!;
    const keep = result.actions.find((a) => a.target.action === "change-keep")!;
    expect(result.actions).toHaveLength(2);
    return { request, apply, keep };
  }
  it("expires prior pairs and keeps without changing the round", async () => {
    const f = await fixture();
    const first = await offer(f);
    const second = await offer(f);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: first.apply.token },
        })
      ).expiresAt,
    ).toEqual(NOW);
    expect(
      (
        await service.keepChange(
          f.chatId,
          AUTHOR,
          second.keep.token,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("kept");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: second.keep.token },
        })
      ).consumedAt,
    ).toEqual(NOW);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: second.apply.token },
        })
      ).expiresAt,
    ).toEqual(NOW);
    expect(
      await prisma.planningRound.findUnique({ where: { id: f.round.id } }),
    ).toEqual(f.round);
  });
  it("shares live settings, roster, cleared answers and same-week successor semantics with replan", async () => {
    const change = await fixture(),
      replan = await fixture();
    for (const f of [change, replan]) {
      await prisma.chatConfiguration.update({
        where: { chatId: f.chatId },
        data: {
          timezone: "Europe/London",
          durationMinutes: 75,
          dailyStartMinute: 601,
          dailyEndMinute: 1301,
        },
      });
      await prisma.chatMembership.updateMany({
        where: { chatId: f.chatId, telegramUserId: MEMBER },
        data: { activeAt: null, deactivatedAt: NOW },
      });
    }
    const pair = await offer(change);
    // Intercept the actual shared seam: an observable modification must affect both doors.
    const shared = service as unknown as {
      supersedeAndCreate: (
        ...args: unknown[]
      ) => Promise<{ kind: string; round?: { durationMinutes: number } }>;
    };
    const original = shared.supersedeAndCreate.bind(service);
    const seam = vi
      .spyOn(shared, "supersedeAndCreate")
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (result.round) result.round.durationMinutes += 1;
        return result;
      });
    const changed = await service.applyChange(
      change.chatId,
      AUTHOR,
      pair.apply.token,
      NOW,
      async () => "member",
    );
    const replanned = await service.replanRound(
      replan.chatId,
      AUTHOR,
      replan.token,
      null,
      NOW,
      async () => "member",
    );
    expect(seam).toHaveBeenCalledTimes(2);
    seam.mockRestore();
    if (changed.kind !== "changed" || replanned.kind !== "replanned")
      throw Error(JSON.stringify([changed, replanned]));
    const fields = (r: typeof changed.round) => ({
      status: r.status,
      step: r.step,
      targetWeekStart: r.targetWeekStart,
      activeWeekStart: r.activeWeekStart,
      timezone: r.timezone,
      durationMinutes: r.durationMinutes,
      dailyStartMinute: r.dailyStartMinute,
      dailyEndMinute: r.dailyEndMinute,
      selectedDate: r.selectedDate,
      selectedStartMinute: r.selectedStartMinute,
      authorUserId: r.authorUserId,
    });
    expect(fields(changed.round)).toEqual(fields(replanned.round));
    expect(fields(changed.round)).toMatchObject({
      status: "DRAFT",
      step: "DAY",
      targetWeekStart: change.round.targetWeekStart,
      timezone: "Europe/London",
      durationMinutes: 76,
      dailyStartMinute: 601,
      dailyEndMinute: 1301,
    });
    for (const result of [changed, replanned]) {
      expect(result.oldRound.status).toBe("SUPERSEDED");
      expect(result.oldRound.supersededByRoundId).toBe(result.round.id);
      const rows = await prisma.planningParticipant.findMany({
        where: { roundId: result.round.id },
        orderBy: { telegramUserId: "asc" },
      });
      expect(rows.map((r) => [r.telegramUserId, r.availability])).toEqual([
        [ADMIN, null],
        [AUTHOR, null],
      ]);
    }
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pair.apply.token },
        })
      ).consumedAt,
    ).toEqual(NOW);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: change.token },
        })
      ).consumedAt,
    ).toBeNull();
    expect(
      (
        await service.applyChange(
          change.chatId,
          AUTHOR,
          pair.apply.token,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("duplicate");
    expect(
      await prisma.planningRound.count({ where: { chatId: change.chatId } }),
    ).toBe(2);
  });
  it("refuses members and demoted admins without spending the eligible actor's token", async () => {
    const f = await fixture(),
      pair = await offer(f, ADMIN, "administrator");
    for (const actor of [MEMBER, ADMIN])
      expect(
        (
          await service.applyChange(
            f.chatId,
            actor,
            pair.apply.token,
            NOW,
            async () => "member",
          )
        ).kind,
      ).toBe("not-eligible");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pair.apply.token },
        })
      ).consumedAt,
    ).toBeNull();
    const changed = await service.applyChange(
      f.chatId,
      ADMIN,
      pair.apply.token,
      NOW,
      async () => "administrator",
    );
    expect(changed.kind).toBe("changed");
    if (changed.kind === "changed")
      expect(changed.round.authorUserId).toBe(ADMIN);
  });
  it.each(["DRAFT", "BOOKED"] as const)(
    "changes %s in its original week after the civil week has advanced",
    async (status) => {
      const f = await fixture();
      await prisma.planningRound.update({
        where: { id: f.round.id },
        data: { status },
      });
      const later = new Date("2026-09-09T09:00:00Z"),
        pair = await offer(f, AUTHOR, "member", later);
      const result = await service.applyChange(
        f.chatId,
        AUTHOR,
        pair.apply.token,
        later,
        async () => "member",
      );
      expect(result.kind).toBe("changed");
      if (result.kind === "changed")
        expect(result.round.targetWeekStart).toBe(f.round.targetWeekStart);
    },
  );
  it.each([
    ["CANCELLED", "already-cancelled"],
    ["SUPERSEDED", "replanned"],
  ] as const)("refuses terminal %s without consuming", async (status, kind) => {
    const f = await fixture(),
      pair = await offer(f);
    await prisma.planningRound.update({
      where: { id: f.round.id },
      data: { status },
    });
    expect(
      (
        await service.applyChange(
          f.chatId,
          AUTHOR,
          pair.apply.token,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe(kind);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pair.apply.token },
        })
      ).consumedAt,
    ).toBeNull();
  });
  it("refuses an empty live roster without consuming or superseding", async () => {
    const f = await fixture(),
      pair = await offer(f);
    await prisma.chatMembership.updateMany({
      where: { chatId: f.chatId },
      data: { activeAt: null, deactivatedAt: NOW },
    });
    expect(
      (
        await service.applyChange(
          f.chatId,
          AUTHOR,
          pair.apply.token,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("empty-roster");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pair.apply.token },
        })
      ).consumedAt,
    ).toBeNull();
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: f.round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
  });
  it("rolls back a colliding week claim and returns a spendable refusal", async () => {
    const f = await fixture(),
      pair = await offer(f);
    await prisma.planningRound.create({
      data: {
        chatId: f.chatId,
        authorUserId: AUTHOR,
        targetWeekStart: f.round.targetWeekStart,
        activeWeekStart: f.round.targetWeekStart,
        timezone: f.round.timezone,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
        lastActivityAt: NOW,
      },
    });
    expect(
      (
        await service.applyChange(
          f.chatId,
          AUTHOR,
          pair.apply.token,
          NOW,
          async () => "member",
        )
      ).kind,
    ).toBe("week-taken");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: pair.apply.token },
        })
      ).consumedAt,
    ).toBeNull();
    expect(
      (
        await prisma.planningRound.findUniqueOrThrow({
          where: { id: f.round.id },
        })
      ).status,
    ).toBe("CONFIRMED");
  });
});
