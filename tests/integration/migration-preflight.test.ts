import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { promisify } from "node:util";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { startPostgresTestContainer } from "../helpers/postgres.js";

const execFile = promisify(execFileCallback);
const TARGET_MIGRATION = "20260902152000_planning_participant_integrity";

type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

async function runMigrationDeploy(databaseUrl: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFile(
      "npm",
      ["run", "db:migrate:deploy"],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: databaseUrl },
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const result = error as NodeJS.ErrnoException & {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: typeof result.code === "number" ? result.code : 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}

async function withClient<T>(
  databaseUrl: string,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function planningTablePresence(databaseUrl: string) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query<{
      planning_rounds: string | null;
      planning_participants: string | null;
      chat_memberships: string | null;
    }>(`
      SELECT
        to_regclass('planning_rounds')::text AS planning_rounds,
        to_regclass('planning_participants')::text AS planning_participants,
        to_regclass('chat_memberships')::text AS chat_memberships
    `);
    return result.rows[0];
  });
}

async function targetMigrationRecord(databaseUrl: string) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query<{
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }>(
      `SELECT finished_at, rolled_back_at
       FROM _prisma_migrations
       WHERE migration_name = $1`,
      [TARGET_MIGRATION],
    );
    return result.rows;
  });
}

describe("guarded migration deployment", () => {
  it("replays every committed migration for a fresh database", async () => {
    const postgres = await startPostgresTestContainer({ mode: "none" });
    try {
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: null,
        planning_participants: null,
        chat_memberships: null,
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Fresh database detected");

      const committedMigrations = (
        await readdir("prisma/migrations", { withFileTypes: true })
      ).filter((entry) => entry.isDirectory());
      const appliedMigrations = await withClient(
        postgres.databaseUrl,
        async (client) =>
          client.query<{ migration_name: string }>(
            `SELECT migration_name
               FROM _prisma_migrations
               WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
          ),
      );
      expect(appliedMigrations.rows).toHaveLength(committedMigrations.length);
      expect(
        appliedMigrations.rows.map(({ migration_name }) => migration_name),
      ).toContain(TARGET_MIGRATION);
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("checks a clean inherited database before applying the pending integrity migration", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: "planning_rounds",
        planning_participants: "planning_participants",
        chat_memberships: "chat_memberships",
      });
      expect(await targetMigrationRecord(postgres.databaseUrl)).toHaveLength(0);

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).toBe(0);
      const legacyCountPosition = result.stdout.indexOf(
        "legacy ABANDONED rounds: 0",
      );
      const danglingCountPosition = result.stdout.indexOf(
        "dangling participant memberships: 0",
      );
      const prismaPosition = result.stdout.indexOf("Prisma schema loaded");
      expect(legacyCountPosition).toBeGreaterThanOrEqual(0);
      expect(danglingCountPosition).toBeGreaterThan(legacyCountPosition);
      expect(prismaPosition).toBeGreaterThan(danglingCountPosition);

      expect(await targetMigrationRecord(postgres.databaseUrl)).toEqual([
        expect.objectContaining({
          finished_at: expect.any(Date),
          rolled_back_at: null,
        }),
      ]);
      await withClient(postgres.databaseUrl, async (client) => {
        const labels = await client.query<{ enumlabel: string }>(`
            SELECT enumlabel
            FROM pg_enum
            JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
            WHERE pg_type.typname = 'PlanningRoundStatus'
          `);
        expect(labels.rows.map(({ enumlabel }) => enumlabel)).not.toContain(
          "ABANDONED",
        );

        const constraints = await client.query<{ definition: string }>(`
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'planning_participants'::regclass
              AND contype = 'f'
          `);
        expect(
          constraints.rows.some(
            ({ definition }) =>
              definition.includes(
                "FOREIGN KEY (membership_id, chat_id, telegram_user_id)",
              ) &&
              definition.includes(
                "REFERENCES chat_memberships(id, chat_id, telegram_user_id)",
              ),
          ),
        ).toBe(true);
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses blocked inherited data without starting the integrity migration", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: "planning_rounds",
        planning_participants: "planning_participants",
        chat_memberships: "chat_memberships",
      });
      expect(await targetMigrationRecord(postgres.databaseUrl)).toHaveLength(0);

      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(`
            INSERT INTO planning_rounds (
              id, chat_id, author_user_id, target_week_start, active_week_start,
              status, step, timezone, duration_minutes, daily_start_minute,
              daily_end_minute, last_activity_at, updated_at
            ) VALUES (
              'blocked-round', -1009000000099, 99099, '2026-09-07', NULL,
              'ABANDONED', 'REVIEW', 'Europe/Kyiv', 120, 540,
              1320, '2026-09-03T09:00:00.000Z', '2026-09-03T09:00:00.000Z'
            )
          `);
        await client.query(`
            INSERT INTO planning_participants (
              id, round_id, telegram_user_id, membership_id
            ) VALUES (
              'blocked-participant', 'blocked-round', 99099,
              'missing-membership'
            )
          `);

        const anomalies = await client.query<{
          abandoned_count: string;
          dangling_count: string;
        }>(`
            SELECT
              (SELECT count(*) FROM planning_rounds WHERE status::text = 'ABANDONED') AS abandoned_count,
              (SELECT count(*) FROM planning_participants p LEFT JOIN chat_memberships m ON m.id = p.membership_id WHERE m.id IS NULL) AS dangling_count
          `);
        expect(anomalies.rows[0]).toEqual({
          abandoned_count: "1",
          dangling_count: "1",
        });
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("legacy ABANDONED rounds: 1");
      expect(output).toContain("dangling participant memberships: 1");
      expect(output).toContain("Migrations were not started");
      expect(output).toContain("existing rows were preserved");
      expect(output).toContain("reviewed backup-aware data migration");

      expect(await targetMigrationRecord(postgres.databaseUrl)).toHaveLength(0);
      await withClient(postgres.databaseUrl, async (client) => {
        expect(
          (
            await client.query(
              "SELECT 1 FROM planning_rounds WHERE id = 'blocked-round' AND status::text = 'ABANDONED'",
            )
          ).rowCount,
        ).toBe(1);
        expect(
          (
            await client.query(
              "SELECT 1 FROM planning_participants WHERE id = 'blocked-participant' AND membership_id = 'missing-membership'",
            )
          ).rowCount,
        ).toBe(1);

        const labels = await client.query<{ enumlabel: string }>(`
            SELECT enumlabel
            FROM pg_enum
            JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
            WHERE pg_type.typname = 'PlanningRoundStatus'
          `);
        expect(labels.rows.map(({ enumlabel }) => enumlabel)).toContain(
          "ABANDONED",
        );
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("fails closed for a partial inherited schema", async () => {
    const postgres = await startPostgresTestContainer({ mode: "none" });
    try {
      await withClient(postgres.databaseUrl, (client) =>
        client.query("CREATE TABLE planning_rounds (id text PRIMARY KEY)"),
      );
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: "planning_rounds",
        planning_participants: null,
        chat_memberships: null,
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain(
        "Inconsistent planning schema baseline",
      );
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: "planning_rounds",
        planning_participants: null,
        chat_memberships: null,
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("routes CI and Compose through only the guarded package command", async () => {
    const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const ci = await readFile(".github/workflows/ci.yml", "utf8");
    const compose = await readFile("compose.yaml", "utf8");

    expect(packageJson.scripts["db:migrate:deploy"]).toBe(
      "node prisma/migrate-deploy.mjs",
    );
    expect(
      Object.entries(packageJson.scripts).filter(([, command]) =>
        command.includes("prisma migrate deploy"),
      ),
    ).toEqual([]);
    expect(ci).toContain("run: npm run db:migrate:deploy");
    expect(compose).toContain('command: ["npm", "run", "db:migrate:deploy"]');
  });
});
