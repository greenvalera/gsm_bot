import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { createReminderQueue } from "../../src/infrastructure/jobs/reminder-queue.js";
import { createLogger } from "../../src/shared/logger.js";
import { startPostgresTestContainer } from "../helpers/postgres.js";

const execFile = promisify(execFileCallback);
const logger = createLogger({ level: "silent" });
async function provision(databaseUrl: string) {
  await execFile(process.execPath, ["prisma/provision-reminders.mjs"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
describe("migration-owned reminder queue", () => {
  it("refuses missing provisioning without creating schema", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await expect(queue.start(async () => {})).rejects.toThrow();
      expect((await client.query("SELECT to_regnamespace('pgboss') AS schema")).rows[0].schema).toBeNull();
    } finally { await queue.stop(); await client.end(); await db.stop(); }
  });
  it("provisions twice and delivers bounded identities durably", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    const received: Array<bigint | undefined> = [];
    try {
      await provision(db.databaseUrl);
      await provision(db.databaseUrl);
      await queue.start(async (chatId) => { received.push(chatId); });
      await queue.wake(-100123n);
      await expect.poll(() => received.includes(-100123n), { timeout: 10000 }).toBe(true);
      await expect(queue.wake(0n)).rejects.toThrow();
    } finally { await queue.stop(); await db.stop(); }
  });
});
