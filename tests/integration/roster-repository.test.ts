import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RosterService } from "../../src/domain/roster/roster-service.js";
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
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

describe("roster repository migration", () => {
  it("enforces one chat membership per Telegram user and lists active identities only", async () => {
    const roster = new RosterService(prisma);
    const chatId = -1006543210000n;
    const actorId = 3001n;
    const target = { id: 3002n, isBot: false, firstName: "Ada" };

    await roster.addFromRepliedUser(chatId, actorId, target);
    await roster.addFromRepliedUser(chatId, actorId, target);
    expect(await prisma.chatMembership.count({ where: { chatId } })).toBe(1);
    expect(await roster.listActive(chatId)).toMatchObject([
      { telegramUserId: target.id, firstName: "Ada" },
    ]);
  });
});
