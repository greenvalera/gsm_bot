import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PlanningService } from "../../src/domain/planning/planning-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLogger } from "../../src/shared/logger.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const ACTOR_ID = 88101n;

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
    data: { chatId, ...createChatConfiguration() },
  });
}

function expiry(millisecondsFromNow: number) {
  return new Date(NOW.getTime() + millisecondsFromNow);
}

async function seedAction(options: {
  token: string;
  chatId: bigint;
  expiresAt: Date;
  kind?: "PLANNING" | "START_SETUP";
  consumedAt?: Date;
}) {
  await prisma.callbackAction.create({
    data: {
      token: options.token,
      kind: options.kind ?? "PLANNING",
      chatId: options.chatId,
      actorUserId: ACTOR_ID,
      expiresAt: options.expiresAt,
      ...(options.consumedAt === undefined
        ? {}
        : { consumedAt: options.consumedAt }),
    },
  });
}

async function seededTokens() {
  const rows = await prisma.callbackAction.findMany({
    where: { token: { startsWith: "retention-" } },
    select: { token: true },
    orderBy: { token: "asc" },
  });
  return rows.map(({ token }) => token);
}

function withFailingRetentionSweep(client: PrismaClient): PrismaClient {
  return new Proxy(client, {
    get(target, property) {
      const member = Reflect.get(target, property, target) as unknown;
      if (property === "callbackAction") {
        return new Proxy(member as object, {
          get(delegate, method) {
            if (method === "deleteMany") {
              return async () => {
                throw new Error("retention sweep unavailable");
              };
            }
            const operation = Reflect.get(
              delegate,
              method,
              delegate,
            ) as unknown;
            return typeof operation === "function"
              ? operation.bind(delegate)
              : operation;
          },
        });
      }
      return typeof member === "function" ? member.bind(target) : member;
    },
  }) as PrismaClient;
}

function createCapturingLogger() {
  const written: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) written.push(line);
        }
      },
    },
  });
  return {
    logger,
    lines: () =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe("planning callback-action retention", () => {
  it("reaps only long-expired actions for the chat when planning starts", async () => {
    const chatId = -1009100000001n;
    const otherChatId = -1009100000002n;
    await configureChat(chatId);
    await Promise.all([
      seedAction({
        token: "retention-old-planning",
        chatId,
        expiresAt: expiry(-RETENTION_MS - 1),
      }),
      seedAction({
        token: "retention-recent-expired",
        chatId,
        expiresAt: expiry(-RETENTION_MS + 1),
      }),
      seedAction({
        token: "retention-live-consumed",
        chatId,
        expiresAt: expiry(60_000),
        consumedAt: NOW,
      }),
      seedAction({
        token: "retention-old-other-chat",
        chatId: otherChatId,
        expiresAt: expiry(-RETENTION_MS - 1),
      }),
      seedAction({
        token: "retention-old-setup",
        chatId,
        expiresAt: expiry(-RETENTION_MS - 1),
        kind: "START_SETUP",
      }),
      seedAction({
        token: "retention-live-setup",
        chatId,
        expiresAt: expiry(60_000),
        kind: "START_SETUP",
      }),
    ]);

    const result = await new PlanningService(prisma).startOrResume(
      chatId,
      ACTOR_ID,
      NOW,
    );

    expect(result.kind).toBe("started");
    expect(await seededTokens()).toEqual([
      "retention-live-consumed",
      "retention-live-setup",
      "retention-old-other-chat",
      "retention-recent-expired",
    ]);
  });

  it("uses the same retention boundary when planning status is read", async () => {
    const chatId = -1009100000003n;
    await configureChat(chatId);
    await seedAction({
      token: "retention-status-old",
      chatId,
      expiresAt: expiry(-RETENTION_MS - 1),
    });
    await seedAction({
      token: "retention-status-recent",
      chatId,
      expiresAt: expiry(-RETENTION_MS + 1),
    });

    const result = await new PlanningService(prisma).status(
      chatId,
      ACTOR_ID,
      NOW,
    );

    expect(result.kind).toBe("no-active-round");
    expect(await seededTokens()).toEqual([
      "retention-live-consumed",
      "retention-live-setup",
      "retention-old-other-chat",
      "retention-recent-expired",
      "retention-status-recent",
    ]);
  });

  it("still creates the round when the retention sweep fails", async () => {
    const chatId = -1009100000004n;
    await configureChat(chatId);
    await seedAction({
      token: "retention-failed-sweep-old",
      chatId,
      expiresAt: expiry(-RETENTION_MS - 1),
    });
    const capture = createCapturingLogger();
    const service = new PlanningService(
      withFailingRetentionSweep(connect()),
      capture.logger,
    );

    const result = await service.startOrResume(chatId, ACTOR_ID, NOW);

    expect(result.kind).toBe("started");
    expect(
      await prisma.planningRound.findMany({ where: { chatId } }),
    ).toHaveLength(1);
    expect(
      await prisma.callbackAction.findMany({
        where: { token: "retention-failed-sweep-old" },
      }),
    ).toHaveLength(1);
    expect(
      capture
        .lines()
        .filter((line) => Object.is(line.outcome, "retention-sweep-failed")),
    ).toEqual([
      expect.objectContaining({
        event: "planning.housekeeping.failure",
        reason: "start-or-resume-retention-sweep",
        chatId: chatId.toString(),
        err: expect.objectContaining({
          name: "Error",
          message: "retention sweep unavailable",
        }),
      }),
    ]);
  });

  it("still reports status and logs once when the retention sweep fails", async () => {
    const chatId = -1009100000005n;
    await configureChat(chatId);
    const capture = createCapturingLogger();
    const service = new PlanningService(
      withFailingRetentionSweep(connect()),
      capture.logger,
    );

    const result = await service.status(chatId, ACTOR_ID, NOW);

    expect(result.kind).toBe("no-active-round");
    expect(
      capture
        .lines()
        .filter((line) => Object.is(line.outcome, "retention-sweep-failed")),
    ).toEqual([
      expect.objectContaining({
        event: "planning.housekeeping.failure",
        reason: "status-retention-sweep",
        chatId: chatId.toString(),
        err: expect.objectContaining({
          name: "Error",
          message: "retention sweep unavailable",
        }),
      }),
    ]);
  });
});
