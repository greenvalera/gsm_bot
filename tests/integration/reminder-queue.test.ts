import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createReminderQueue } from "../../src/infrastructure/jobs/reminder-queue.js";
import { createLogger } from "../../src/shared/logger.js";
import { startPostgresTestContainer } from "../helpers/postgres.js";

const execFile = promisify(execFileCallback);
const MIGRATION = "20260913000000_reminder_ledger";
async function deploy(databaseUrl: string) {
  return execFile(process.execPath, ["prisma/migrate-deploy.mjs"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
const logger = createLogger({ level: "silent" });
async function provision(databaseUrl: string) {
  await execFile(process.execPath, ["prisma/provision-reminders.mjs"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
describe("migration-owned reminder queue", () => {
  it("deploys a fresh database twice and rejects divergent ledger catalogs", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await deploy(db.databaseUrl);
      await deploy(db.databaseUrl);
      expect((await client.query("SELECT to_regclass('reminder_occurrences') AS name")).rows[0].name).toBe("reminder_occurrences");
      await client.query("ALTER TABLE reminder_occurrences DROP COLUMN retry_at");
      await expect(deploy(db.databaseUrl)).rejects.toThrow();
    } finally { await client.end(); await db.stop(); }
  });
  it("upgrades Phase 4 once with activation state and no invented publication", async () => {
    const db = await startPostgresTestContainer({ mode: "before", exclusiveCutoff: MIGRATION });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await client.query(`INSERT INTO chat_configurations (chat_id,timezone,default_weekday,default_start_minute,duration_minutes,daily_start_minute,daily_end_minute,reminder_minutes,updated_at) VALUES (-1001,'Europe/Kyiv',3,1080,120,600,1320,ARRAY[600],now())`);
      const before = Date.now();
      await deploy(db.databaseUrl);
      const state = (await client.query("SELECT * FROM chat_reminder_states")).rows[0];
      expect(state.generation).toBe(1);
      expect(state.effective_from.getTime()).toBeGreaterThanOrEqual(before);
      await deploy(db.databaseUrl);
      expect((await client.query("SELECT effective_from FROM chat_reminder_states")).rows[0].effective_from).toEqual(state.effective_from);
      expect((await client.query("SELECT count(*) FROM reminder_occurrences")).rows[0].count).toBe("0");
    } finally { await client.end(); await db.stop(); }
  });
  it("refuses missing provisioning without creating schema", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await expect(queue.start(async () => {})).rejects.toThrow();
      expect(
        (await client.query("SELECT to_regnamespace('pgboss') AS schema"))
          .rows[0].schema,
      ).toBeNull();
    } finally {
      await queue.stop();
      await client.end();
      await db.stop();
    }
  });
  it("provisions twice and delivers bounded identities durably", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    const received: Array<bigint | undefined> = [];
    try {
      await provision(db.databaseUrl);
      await provision(db.databaseUrl);
      await queue.start(async (chatId) => {
        received.push(chatId);
      });
      await queue.wake(-100123n);
      await expect
        .poll(() => received.includes(-100123n), { timeout: 10000 })
        .toBe(true);
      await expect(queue.wake(0n)).rejects.toThrow();
    } finally {
      await queue.stop();
      await db.stop();
    }
  });
});
