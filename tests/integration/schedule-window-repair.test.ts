import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { validateSchedule } from "../../src/domain/chat/schedule-validator.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const INCOHERENT_CHAT_ID = -1009000000001n;
const COHERENT_CHAT_ID = -1009000000002n;

const MIGRATION_SQL = new URL(
  "../../prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql",
  import.meta.url,
);

let postgres: PostgresTestContainer;
let prisma: PrismaClient;

async function insertConfiguration(
  chatId: bigint,
  values: Readonly<{
    defaultStartMinute: number;
    durationMinutes: number;
    dailyStartMinute: number;
    dailyEndMinute: number;
  }>,
) {
  // Raw SQL on purpose: the application layer would reject the very row this
  // repair exists to fix, so it cannot be used to reproduce the defect.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "chat_configurations"
       ("chat_id", "timezone", "default_weekday", "default_start_minute",
        "duration_minutes", "daily_start_minute", "daily_end_minute",
        "reminder_minutes", "revision", "created_at", "updated_at")
     VALUES ($1, 'Europe/Kyiv', 3, $2, $3, $4, $5, ARRAY[600, 960], 4, $6, $6)`,
    chatId,
    values.defaultStartMinute,
    values.durationMinutes,
    values.dailyStartMinute,
    values.dailyEndMinute,
    NOW,
  );
}

async function readConfiguration(chatId: bigint) {
  const row = await prisma.chatConfiguration.findUnique({ where: { chatId } });
  if (row === null) throw new Error(`Expected a configuration for ${chatId}.`);
  return row;
}

/**
 * Runs the committed repair statement itself, read from disk, rather than a
 * paraphrase of it — a hand-written equivalent could pass while the migration
 * that actually ships against production does something else.
 */
async function applyRepairMigration() {
  const sql = await readFile(MIGRATION_SQL, "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  expect(statements).toHaveLength(1);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

describe("schedule window floor repair", () => {
  it("makes an already-committed incoherent row satisfy every schedule rule, and leaves a coherent row untouched", async () => {
    // The live row recorded in the runbook: the rehearsal begins at 18:00, an
    // hour before the 19:00 daily window opens, and the validator that let it
    // through is about to start rejecting it.
    await insertConfiguration(INCOHERENT_CHAT_ID, {
      defaultStartMinute: 1080,
      durationMinutes: 120,
      dailyStartMinute: 1140,
      dailyEndMinute: 1320,
    });
    await insertConfiguration(COHERENT_CHAT_ID, {
      defaultStartMinute: 1140,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
    });
    const coherentBefore = await readConfiguration(COHERENT_CHAT_ID);

    await applyRepairMigration();

    const repaired = await readConfiguration(INCOHERENT_CHAT_ID);
    expect(validateSchedule(repaired)).toEqual({ valid: true });
    expect(repaired.dailyStartMinute).toBe(1080);
    // The repair must not invalidate a live draft's expected revision.
    expect(repaired.revision).toBe(4);
    // Nor may it move the rehearsal itself.
    expect(repaired.defaultStartMinute).toBe(1080);
    expect(repaired.dailyEndMinute).toBe(1320);

    expect(await readConfiguration(COHERENT_CHAT_ID)).toEqual(coherentBefore);
  });
});
