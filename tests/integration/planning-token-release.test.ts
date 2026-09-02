import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PLANNING_INACTIVITY_MS,
  PlanningService,
  type MintedPlanningAction,
} from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { withPlanningRoundInterference } from "../helpers/racing-client.js";

/** Wednesday 2026-08-26, 12:00 in Europe/Kyiv. */
const NOW = new Date("2026-08-26T09:00:00.000Z");
const AUTHOR_ID = 8_501n;
const ADMIN_ID = 8_502n;
const MEMBER_ID = 8_503n;
const SELECTED_DATE = "2026-08-27";
const SELECTED_MINUTE = 15 * 60;

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

async function configureChat(chatId: bigint) {
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({ planningAccessPolicy: "ANYONE_IN_CHAT" }),
    },
  });
}

function actionOfKind(
  actions: readonly MintedPlanningAction[],
  kind: "back" | "confirm",
): MintedPlanningAction;
function actionOfKind(
  actions: readonly MintedPlanningAction[],
  kind: "day",
  value: string,
): MintedPlanningAction;
function actionOfKind(
  actions: readonly MintedPlanningAction[],
  kind: "time",
  value: number,
): MintedPlanningAction;
function actionOfKind(
  actions: readonly MintedPlanningAction[],
  kind: "back" | "confirm" | "day" | "time",
  value?: string | number,
) {
  const action = actions.find((candidate) => {
    switch (candidate.target.action) {
      case "day":
        return kind === "day" && candidate.target.date === value;
      case "time":
        return kind === "time" && candidate.target.startMinute === value;
      default:
        return candidate.target.action === kind;
    }
  });
  if (action === undefined) {
    throw new Error(`Expected the fixture to mint a ${kind} action.`);
  }
  return action;
}

async function startRound(chatId: bigint) {
  await configureChat(chatId);
  const started = await new PlanningService(prisma).startOrResume(
    chatId,
    AUTHOR_ID,
    NOW,
  );
  expect(started.kind).toBe("started");
  if (started.kind !== "started") {
    throw new Error(`Expected a started round, received ${started.kind}.`);
  }
  return started;
}

async function reachTimeStep(chatId: bigint) {
  const started = await startRound(chatId);
  const day = actionOfKind(started.actions, "day", SELECTED_DATE);
  const advanced = await new PlanningService(prisma).selectDay(
    chatId,
    AUTHOR_ID,
    day.token,
    NOW,
  );
  expect(advanced.kind).toBe("advanced");
  if (advanced.kind !== "advanced") {
    throw new Error(`Expected the time step, received ${advanced.kind}.`);
  }
  return advanced;
}

async function reachReviewStep(chatId: bigint) {
  const atTime = await reachTimeStep(chatId);
  const time = actionOfKind(atTime.actions, "time", SELECTED_MINUTE);
  const advanced = await new PlanningService(prisma).selectTime(
    chatId,
    AUTHOR_ID,
    time.token,
    NOW,
  );
  expect(advanced.kind).toBe("advanced");
  if (advanced.kind !== "advanced") {
    throw new Error(`Expected the review step, received ${advanced.kind}.`);
  }
  return advanced;
}

async function addRosterMember(chatId: bigint) {
  await prisma.telegramUser.upsert({
    where: { telegramUserId: MEMBER_ID },
    create: { telegramUserId: MEMBER_ID, firstName: "Ada" },
    update: { firstName: "Ada" },
  });
  await prisma.chatMembership.create({
    data: {
      chatId,
      telegramUserId: MEMBER_ID,
      activeAt: NOW,
    },
  });
}

async function eligibleTakeover(chatId: bigint) {
  const started = await startRound(chatId);
  const round = await prisma.planningRound.update({
    where: { id: started.round.id },
    data: {
      lastActivityAt: new Date(NOW.getTime() - PLANNING_INACTIVITY_MS - 1_000),
    },
  });
  const takeover = await new PlanningService(prisma).mintTakeoverAction(
    round,
    ADMIN_ID,
    "administrator",
    NOW,
  );
  expect(
    takeover,
    "an eligible abandoned round must mint one takeover action",
  ).toBeDefined();
  if (takeover === undefined) {
    throw new Error("Expected a takeover action for the administrator.");
  }
  await expectMintedAndSpendable(takeover.token);
  return { round, takeover };
}

async function expectMintedAndSpendable(token: string) {
  const action = await prisma.callbackAction.findUnique({ where: { token } });
  expect(
    action,
    "the fixture must have minted a reachable action row",
  ).not.toBeNull();
  expect(action?.consumedAt).toBeNull();
}

function racingService(roundId: string) {
  const competitor = connect();
  const raced = withPlanningRoundInterference(prisma, async () => {
    await competitor.planningRound.update({
      where: { id: roundId },
      data: { revision: { increment: 1 } },
    });
  });
  return new PlanningService(raced);
}

describe("callback token release after a lost revision race", () => {
  it("leaves the day token spendable and applies it on the next tap", async () => {
    const chatId = -1_008_100_000_001n;
    const started = await startRound(chatId);
    const day = actionOfKind(started.actions, "day", SELECTED_DATE);
    await expectMintedAndSpendable(day.token);

    const lost = await racingService(started.round.id).selectDay(
      chatId,
      AUTHOR_ID,
      day.token,
      NOW,
    );
    expect(lost.kind).toBe("stale");

    const afterRace = await prisma.planningRound.findUniqueOrThrow({
      where: { id: started.round.id },
    });
    expect(afterRace).toMatchObject({
      step: "DAY",
      selectedDate: null,
      selectedStartMinute: null,
      revision: started.round.revision + 1,
    });
    await expectMintedAndSpendable(day.token);

    const retried = await new PlanningService(prisma).selectDay(
      chatId,
      AUTHOR_ID,
      day.token,
      NOW,
    );
    expect(retried.kind).toBe("advanced");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: started.round.id },
    });
    expect(afterRetry).toMatchObject({
      step: "TIME",
      selectedDate: SELECTED_DATE,
      revision: started.round.revision + 2,
    });

    const spent = await prisma.callbackAction.findUniqueOrThrow({
      where: { token: day.token },
    });
    expect(spent.consumedAt).not.toBeNull();
    const duplicate = await new PlanningService(prisma).selectDay(
      chatId,
      AUTHOR_ID,
      day.token,
      NOW,
    );
    expect(duplicate.kind).toBe("duplicate");
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: started.round.id },
      }),
    ).toEqual(afterRetry);
  });

  it("leaves the time token spendable and applies it on the next tap", async () => {
    const chatId = -1_008_100_000_002n;
    const atTime = await reachTimeStep(chatId);
    const time = actionOfKind(atTime.actions, "time", SELECTED_MINUTE);
    await expectMintedAndSpendable(time.token);

    const lost = await racingService(atTime.round.id).selectTime(
      chatId,
      AUTHOR_ID,
      time.token,
      NOW,
    );
    expect(lost.kind).toBe("stale");

    const afterRace = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atTime.round.id },
    });
    expect(afterRace).toMatchObject({
      step: "TIME",
      selectedDate: SELECTED_DATE,
      selectedStartMinute: null,
      revision: atTime.round.revision + 1,
    });
    await expectMintedAndSpendable(time.token);

    const retried = await new PlanningService(prisma).selectTime(
      chatId,
      AUTHOR_ID,
      time.token,
      NOW,
    );
    expect(retried.kind).toBe("advanced");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atTime.round.id },
    });
    expect(afterRetry).toMatchObject({
      step: "REVIEW",
      selectedDate: SELECTED_DATE,
      selectedStartMinute: SELECTED_MINUTE,
      revision: atTime.round.revision + 2,
    });
  });

  it("leaves the single Back token spendable and applies it on the next tap", async () => {
    const chatId = -1_008_100_000_003n;
    const atTime = await reachTimeStep(chatId);
    const back = actionOfKind(atTime.actions, "back");
    await expectMintedAndSpendable(back.token);

    const lost = await racingService(atTime.round.id).back(
      chatId,
      AUTHOR_ID,
      back.token,
      NOW,
    );
    expect(lost.kind).toBe("stale");

    const afterRace = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atTime.round.id },
    });
    expect(afterRace).toMatchObject({
      step: "TIME",
      selectedDate: SELECTED_DATE,
      selectedStartMinute: null,
      revision: atTime.round.revision + 1,
    });
    await expectMintedAndSpendable(back.token);

    const retried = await new PlanningService(prisma).back(
      chatId,
      AUTHOR_ID,
      back.token,
      NOW,
    );
    expect(retried.kind).toBe("moved");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atTime.round.id },
    });
    expect(afterRetry).toMatchObject({
      step: "DAY",
      selectedDate: SELECTED_DATE,
      selectedStartMinute: null,
      revision: atTime.round.revision + 2,
    });
  });
});

describe("takeover and confirm token release", () => {
  it("leaves a takeover token spendable after a pinned revision loses", async () => {
    const chatId = -1_008_100_000_004n;
    const { round, takeover } = await eligibleTakeover(chatId);

    const lost = await new PlanningService(prisma).takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      round.revision + 7,
      NOW,
      async () => "administrator",
    );
    expect(lost.kind).toBe("stale");
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      }),
    ).toEqual(round);
    await expectMintedAndSpendable(takeover.token);

    const retried = await new PlanningService(prisma).takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(retried.kind).toBe("taken-over");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterRetry.authorUserId).toBe(ADMIN_ID);
    expect(afterRetry.revision).toBe(round.revision + 1);
  });

  it("leaves a takeover token spendable after a committed competitor wins", async () => {
    const chatId = -1_008_100_000_005n;
    const { round, takeover } = await eligibleTakeover(chatId);

    const lost = await racingService(round.id).takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(lost.kind).toBe("stale");
    const afterRace = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterRace.authorUserId).toBe(AUTHOR_ID);
    expect(afterRace.revision).toBe(round.revision + 1);
    await expectMintedAndSpendable(takeover.token);

    const retried = await new PlanningService(prisma).takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(retried.kind).toBe("taken-over");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterRetry.authorUserId).toBe(ADMIN_ID);
    expect(afterRetry.revision).toBe(round.revision + 2);
  });

  it("keeps a successful takeover spent and refuses its replay", async () => {
    const chatId = -1_008_100_000_006n;
    const { round, takeover } = await eligibleTakeover(chatId);
    const service = new PlanningService(prisma);

    const taken = await service.takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(taken.kind).toBe("taken-over");
    const afterTakeover = await prisma.planningRound.findUniqueOrThrow({
      where: { id: round.id },
    });
    expect(afterTakeover.authorUserId).toBe(ADMIN_ID);
    expect(afterTakeover.revision).toBe(round.revision + 1);
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: takeover.token },
        })
      ).consumedAt,
    ).not.toBeNull();

    const duplicate = await service.takeover(
      chatId,
      ADMIN_ID,
      takeover.token,
      null,
      NOW,
      async () => "administrator",
    );
    expect(duplicate.kind).toBe("duplicate");
    expect(
      await prisma.planningRound.findUniqueOrThrow({
        where: { id: round.id },
      }),
    ).toEqual(afterTakeover);
  });

  it("preserves confirm's lost-race release and same-token retry", async () => {
    const chatId = -1_008_100_000_007n;
    await addRosterMember(chatId);
    const atReview = await reachReviewStep(chatId);
    const confirm = actionOfKind(atReview.actions, "confirm");
    await expectMintedAndSpendable(confirm.token);

    const lost = await new PlanningService(prisma).confirm(
      chatId,
      AUTHOR_ID,
      confirm.token,
      atReview.round.revision + 7,
      NOW,
    );
    expect(lost.kind).toBe("stale");
    const afterRace = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atReview.round.id },
    });
    expect(afterRace.status).toBe("DRAFT");
    expect(afterRace.revision).toBe(atReview.round.revision);
    await expectMintedAndSpendable(confirm.token);

    const retried = await new PlanningService(prisma).confirm(
      chatId,
      AUTHOR_ID,
      confirm.token,
      null,
      NOW,
    );
    expect(retried.kind).toBe("confirmed");
    const afterRetry = await prisma.planningRound.findUniqueOrThrow({
      where: { id: atReview.round.id },
    });
    expect(afterRetry.status).toBe("CONFIRMED");
    expect(afterRetry.activeWeekStart).toBeNull();
    expect(afterRetry.revision).toBe(atReview.round.revision + 1);
  });
});
