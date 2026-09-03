import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { startPostgresTestContainer } from "../helpers/postgres.js";

const execFile = promisify(execFileCallback);
const PLANNING_MIGRATION = "20260831100411_planning_rounds";
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

async function waitForPausedIntegrityMigration(databaseUrl: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const paused = await withClient(databaseUrl, async (client) => {
      const result = await client.query<{ paused: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_stat_activity
          WHERE wait_event = 'PgSleep'
            AND query LIKE '%PlanningRoundStatus_new%'
        ) AS paused
      `);
      return result.rows[0]?.paused === true;
    });
    if (paused) {
      return;
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for the integrity migration test pause");
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
      expect(result.stdout).toContain(
        "Safe pre-planning migration prefix detected",
      );

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

  it("deploys the complete remaining history from a valid Phase 1 prefix", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: PLANNING_MIGRATION,
    });
    try {
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: null,
        planning_participants: null,
        chat_memberships: "chat_memberships",
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        "Safe pre-planning migration prefix detected",
      );

      const committedMigrations = (
        await readdir("prisma/migrations", { withFileTypes: true })
      ).filter((entry) => entry.isDirectory());
      const appliedMigrations = await withClient(
        postgres.databaseUrl,
        (client) =>
          client.query<{ migration_name: string }>(`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          `),
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
      const invalidBindingCountPosition = result.stdout.indexOf(
        "invalid participant bindings: 0",
      );
      const prismaPosition = result.stdout.indexOf(
        `Applying migration \`${TARGET_MIGRATION}\``,
      );
      expect(legacyCountPosition).toBeGreaterThanOrEqual(0);
      expect(invalidBindingCountPosition).toBeGreaterThan(legacyCountPosition);
      expect(prismaPosition).toBeGreaterThan(invalidBindingCountPosition);

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
          invalid_binding_count: string;
        }>(`
            SELECT
              (SELECT count(*) FROM planning_rounds WHERE status::text = 'ABANDONED') AS abandoned_count,
              (SELECT count(*) FROM planning_participants p LEFT JOIN chat_memberships m ON m.id = p.membership_id WHERE m.id IS NULL) AS invalid_binding_count
          `);
        expect(anomalies.rows[0]).toEqual({
          abandoned_count: "1",
          invalid_binding_count: "1",
        });
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("legacy ABANDONED rounds: 1");
      expect(output).toContain("invalid participant bindings: 1");
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

  it.each([
    { label: "mismatched user", membershipChatId: -1009000000100n },
    { label: "cross-chat membership", membershipChatId: -1009000000101n },
  ])(
    "refuses a $label binding without changing schema, data, or migration history",
    async ({ label, membershipChatId }) => {
      const postgres = await startPostgresTestContainer({
        mode: "before",
        exclusiveCutoff: TARGET_MIGRATION,
      });
      try {
        const roundChatId = -1009000000100n;
        const participantUserId = 99100n;
        const membershipUserId =
          label === "mismatched user" ? 99101n : participantUserId;
        await withClient(postgres.databaseUrl, async (client) => {
          await client.query(
            `INSERT INTO telegram_users (telegram_user_id, updated_at)
             VALUES ($1, NOW())`,
            [membershipUserId.toString()],
          );
          await client.query(
            `INSERT INTO chat_memberships (
               id, chat_id, telegram_user_id, updated_at
             ) VALUES ('integrity-membership', $1, $2, NOW())`,
            [membershipChatId.toString(), membershipUserId.toString()],
          );
          await client.query(
            `INSERT INTO planning_rounds (
               id, chat_id, author_user_id, target_week_start,
               status, step, timezone, duration_minutes, daily_start_minute,
               daily_end_minute, last_activity_at, updated_at
             ) VALUES (
               'integrity-round', $1, 99199, '2026-09-07',
               'DRAFT', 'REVIEW', 'Europe/Kyiv', 120, 540,
               1320, NOW(), NOW()
             )`,
            [roundChatId.toString()],
          );
          await client.query(
            `INSERT INTO planning_participants (
               id, round_id, telegram_user_id, membership_id
             ) VALUES (
               'integrity-participant', 'integrity-round', $1,
               'integrity-membership'
             )`,
            [participantUserId.toString()],
          );
        });

        const result = await runMigrationDeploy(postgres.databaseUrl);
        expect(result.exitCode).not.toBe(0);
        const output = `${result.stdout}\n${result.stderr}`;
        expect(output).toContain("invalid participant bindings: 1");
        expect(output).toContain("Migrations were not started");
        expect(output).not.toContain("integrity-participant");
        expect(output).not.toContain("integrity-membership");
        expect(output).not.toContain(roundChatId.toString());
        expect(output).not.toContain(participantUserId.toString());

        expect(await targetMigrationRecord(postgres.databaseUrl)).toHaveLength(
          0,
        );
        await withClient(postgres.databaseUrl, async (client) => {
          const state = await client.query<{
            participant_rows: string;
            abandoned_label: boolean;
            chat_id_column: string | null;
            original_round_fk: boolean;
            composite_membership_fk: boolean;
          }>(`
            SELECT
              (SELECT count(*) FROM planning_participants WHERE id = 'integrity-participant') AS participant_rows,
              EXISTS (
                SELECT 1 FROM pg_enum
                JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
                WHERE pg_type.typname = 'PlanningRoundStatus'
                  AND pg_enum.enumlabel = 'ABANDONED'
              ) AS abandoned_label,
              (
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'planning_participants'
                  AND column_name = 'chat_id'
              ) AS chat_id_column,
              EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'planning_participants_round_id_fkey'
              ) AS original_round_fk,
              EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'planning_participants_membership_id_chat_id_telegram_user_id_fkey'
              ) AS composite_membership_fk
          `);
          expect(state.rows[0]).toEqual({
            participant_rows: "1",
            abandoned_label: true,
            chat_id_column: null,
            original_round_fk: true,
            composite_membership_fk: false,
          });
        });
      } finally {
        await postgres.stop();
      }
    },
    180_000,
  );

  it("rolls back every schema change when a later migration statement fails", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      await withClient(postgres.databaseUrl, (client) =>
        client.query(
          `CREATE INDEX callback_actions_expires_at_idx
           ON callback_actions (created_at)`,
        ),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);

      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          abandoned_label: boolean;
          chat_id_column: string | null;
          original_round_fk: boolean;
          conflicting_index_definition: string;
        }>(`
          SELECT
            EXISTS (
              SELECT 1 FROM pg_enum
              JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
              WHERE pg_type.typname = 'PlanningRoundStatus'
                AND pg_enum.enumlabel = 'ABANDONED'
            ) AS abandoned_label,
            (
              SELECT column_name FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'planning_participants'
                AND column_name = 'chat_id'
            ) AS chat_id_column,
            EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conname = 'planning_participants_round_id_fkey'
            ) AS original_round_fk,
            pg_get_indexdef('callback_actions_expires_at_idx'::regclass) AS conflicting_index_definition
        `);
        expect(state.rows[0]).toEqual({
          abandoned_label: true,
          chat_id_column: null,
          original_round_fk: true,
          conflicting_index_definition: expect.stringContaining("created_at"),
        });
      });

      expect(await targetMigrationRecord(postgres.databaseUrl)).toEqual([
        { finished_at: null, rolled_back_at: null },
      ]);
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("holds write-blocking locks from authoritative checks through constraint creation", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(`
          CREATE FUNCTION pause_integrity_migration() RETURNS event_trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            PERFORM pg_sleep(3);
          END
          $$
        `);
        await client.query(`
          CREATE EVENT TRIGGER pause_integrity_migration
          ON ddl_command_start
          WHEN TAG IN ('CREATE TYPE')
          EXECUTE FUNCTION pause_integrity_migration()
        `);
      });

      const migration = runMigrationDeploy(postgres.databaseUrl);
      await waitForPausedIntegrityMigration(postgres.databaseUrl);

      const writerError = await withClient(
        postgres.databaseUrl,
        async (client) => {
          await client.query("SET lock_timeout = '500ms'");
          try {
            await client.query(`
              INSERT INTO planning_rounds (
                id, chat_id, author_user_id, target_week_start,
                status, step, timezone, duration_minutes, daily_start_minute,
                daily_end_minute, last_activity_at, updated_at
              ) VALUES (
                'concurrent-unsafe-round', -1009000000200, 99200,
                '2026-09-07', 'ABANDONED', 'REVIEW', 'Europe/Kyiv',
                120, 540, 1320, NOW(), NOW()
              )
            `);
            return null;
          } catch (error) {
            return error as { code?: string };
          }
        },
      );
      expect(writerError?.code).toBe("55P03");

      const result = await migration;
      expect(result.exitCode).toBe(0);
      expect(await targetMigrationRecord(postgres.databaseUrl)).toEqual([
        expect.objectContaining({
          finished_at: expect.any(Date),
          rolled_back_at: null,
        }),
      ]);
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("bounds and redacts Prisma diagnostics without hiding migration recovery metadata", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      const fakeMembershipId = "redaction-membership-7fd9a";
      const fakeChatId = "-1009000000300";
      const fakeUserId = "99300";
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(`
          CREATE FUNCTION reject_integrity_migration() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION USING
              ERRCODE = '23503',
              MESSAGE = 'forced migration failure',
              DETAIL = 'Key (membership_id, chat_id, telegram_user_id)=(${fakeMembershipId}, ${fakeChatId}, ${fakeUserId}) is not present';
          END
          $$
        `);
        await client.query(`
          CREATE TRIGGER reject_integrity_migration
          BEFORE INSERT ON _prisma_migrations
          FOR EACH ROW
          EXECUTE FUNCTION reject_integrity_migration()
        `);
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      const databaseTarget = new URL(postgres.databaseUrl);
      expect(output).toContain(TARGET_MIGRATION);
      expect(output).toContain("23503");
      expect(output).toContain("DETAIL: [redacted]");
      expect(output).not.toContain(fakeMembershipId);
      expect(output).not.toContain(fakeChatId);
      expect(output).not.toContain(fakeUserId);
      expect(output).not.toContain(databaseTarget.host);
      expect(output).not.toContain(postgres.databaseUrl);
      expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(70 * 1024);
      expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(70 * 1024);
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
      await withClient(postgres.databaseUrl, async (client) => {
        const migrationTable = await client.query<{
          table_name: string | null;
        }>("SELECT to_regclass('_prisma_migrations')::text AS table_name");
        expect(migrationTable.rows[0]?.table_name).toBeNull();
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
