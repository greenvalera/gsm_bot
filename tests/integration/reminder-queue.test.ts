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
  it("runtime start, wake and maintenance execute no DDL and reject mismatched queue versions", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const client = new Client({ connectionString: db.databaseUrl });
    const queue = createReminderQueue({ databaseUrl: db.databaseUrl, logger });
    try {
      await provision(db.databaseUrl);
      await client.connect();
      await client.query(`CREATE FUNCTION reject_runtime_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Runtime DDL forbidden'; END $$;
        CREATE EVENT TRIGGER reject_runtime_ddl ON ddl_command_start EXECUTE FUNCTION reject_runtime_ddl()`);
      await queue.start(async () => {});
      await queue.wake(-10022n);
      await queue.stop();
      await client.query(
        "UPDATE pgboss.queue SET retry_limit = 9 WHERE name = 'reminder-reconcile'",
      );
      await expect(queue.start(async () => {})).rejects.toThrow();
      await client.query(
        "UPDATE pgboss.queue SET retry_limit = 2 WHERE name = 'reminder-reconcile'",
      );
      await client.query("UPDATE pgboss.version SET version = 999");
      await expect(queue.start(async () => {})).rejects.toThrow();
      await client.query("UPDATE pgboss.version SET version = 37");
      await client.query(
        "DELETE FROM pgboss.job; DELETE FROM pgboss.queue WHERE name = 'reminder-reconcile'",
      );
      await expect(queue.start(async () => {})).rejects.toThrow();
    } finally {
      await queue.stop();
      await client.end();
      await db.stop();
    }
  });
  it("deploys a fresh database twice and rejects divergent ledger catalogs", async () => {
    const db = await startPostgresTestContainer({ mode: "none" });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await deploy(db.databaseUrl);
      await deploy(db.databaseUrl);
      expect(
        (
          await client.query(
            "SELECT to_regclass('reminder_occurrences') AS name",
          )
        ).rows[0].name,
      ).toBe("reminder_occurrences");
      await client.query(
        "ALTER TABLE reminder_occurrences DROP COLUMN retry_at",
      );
      await expect(deploy(db.databaseUrl)).rejects.toThrow();
    } finally {
      await client.end();
      await db.stop();
    }
  });
  it("upgrades Phase 4 once with activation state and no invented publication", async () => {
    const db = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: MIGRATION,
    });
    const client = new Client({ connectionString: db.databaseUrl });
    try {
      await client.connect();
      await client.query(
        `INSERT INTO chat_configurations (chat_id,timezone,default_weekday,default_start_minute,duration_minutes,daily_start_minute,daily_end_minute,reminder_minutes,updated_at) VALUES (-1001,'Europe/Kyiv',3,1080,120,600,1320,ARRAY[600],now())`,
      );
      const before = Date.now();
      await client.query(
        `INSERT INTO planning_rounds (id,chat_id,author_user_id,target_week_start,timezone,duration_minutes,daily_start_minute,daily_end_minute,last_activity_at,updated_at) VALUES ('legacy-round',-1001,12,'2026-09-07','Europe/Kyiv',120,600,1320,now(),now())`,
      );
      await deploy(db.databaseUrl);
      const state = (await client.query("SELECT * FROM chat_reminder_states"))
        .rows[0];
      expect(state.generation).toBe(1);
      expect(
        (
          await client.query(
            "SELECT first_availability_published_at, availability_anchor_acknowledged_at, reminder_grace_restart_at, last_reminder_attempt_at FROM planning_rounds WHERE id='legacy-round'",
          )
        ).rows[0],
      ).toEqual({
        first_availability_published_at: null,
        availability_anchor_acknowledged_at: null,
        reminder_grace_restart_at: null,
        last_reminder_attempt_at: null,
      });
      expect(state.effective_from.getTime()).toBeGreaterThanOrEqual(before);
      await deploy(db.databaseUrl);
      expect(
        (await client.query("SELECT effective_from FROM chat_reminder_states"))
          .rows[0].effective_from,
      ).toEqual(state.effective_from);
      expect(
        (await client.query("SELECT count(*) FROM reminder_occurrences"))
          .rows[0].count,
      ).toBe("0");
    } finally {
      await client.end();
      await db.stop();
    }
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
