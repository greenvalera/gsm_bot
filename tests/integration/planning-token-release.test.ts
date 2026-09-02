import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
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
  kind: "back",
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
  kind: "back" | "day" | "time",
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
