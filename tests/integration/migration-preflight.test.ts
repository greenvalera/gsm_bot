import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { startPostgresTestContainer } from "../helpers/postgres.js";

const execFile = promisify(execFileCallback);
const PLANNING_MIGRATION = "20260831100411_planning_rounds";
const COOLDOWN_MIGRATION = "20260901120000_chat_status_cooldowns";
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

async function appliedMigrationNames(databaseUrl: string) {
  return withClient(databaseUrl, async (client) => {
    const result = await client.query<{ migration_name: string }>(`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY started_at, id
    `);
    return result.rows.map(({ migration_name }) => migration_name);
  });
}

async function waitForIntegrityMigrationTableLock(databaseUrl: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const locked = await withClient(databaseUrl, async (client) => {
      const result = await client.query<{ locked: boolean }>(`
        SELECT EXISTS (
          SELECT 1
          FROM pg_locks AS relation_lock
          JOIN pg_class ON pg_class.oid = relation_lock.relation
          JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
          WHERE pg_namespace.nspname = 'public'
            AND pg_class.relname = 'planning_rounds'
            AND relation_lock.mode = 'ShareRowExclusiveLock'
            AND relation_lock.granted
        ) AS locked
      `);
      return result.rows[0]?.locked === true;
    });
    if (locked) {
      return;
    }
    await delay(50);
  }
  throw new Error("Timed out waiting for the integrity migration table lock");
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

  it("refuses a nonempty application schema without a Prisma migration ledger", async () => {
    const postgres = await startPostgresTestContainer({ mode: "none" });
    try {
      await withClient(postgres.databaseUrl, (client) =>
        client.query("CREATE TABLE unmanaged_state (id bigint PRIMARY KEY)"),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        "Safe pre-planning migration prefix detected",
      );

      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          unmanaged_state: string | null;
          migration_table: string | null;
        }>(`
          SELECT
            to_regclass('unmanaged_state')::text AS unmanaged_state,
            to_regclass('_prisma_migrations')::text AS migration_table
        `);
        expect(state.rows[0]).toEqual({
          unmanaged_state: "unmanaged_state",
          migration_table: null,
        });
      });
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

  it("refuses a future planning enum name occupied by a domain", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: PLANNING_MIGRATION,
    });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, (client) =>
        client.query('CREATE DOMAIN "PlanningRoundStatus" AS text'),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        `Applying migration \`${PLANNING_MIGRATION}\``,
      );
      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );

      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          type_kind: string;
          planning_rounds: string | null;
        }>(`
          SELECT
            (SELECT typtype FROM pg_type WHERE typname = 'PlanningRoundStatus') AS type_kind,
            to_regclass('planning_rounds')::text AS planning_rounds
        `);
        expect(state.rows[0]).toEqual({
          type_kind: "d",
          planning_rounds: null,
        });
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a Phase 1 ledger whose required membership catalog has drifted", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: PLANNING_MIGRATION,
    });
    try {
      const appliedBefore = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const migrations = await client.query<{ migration_name: string }>(`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY started_at, id
          `);
          await client.query("DROP TABLE chat_memberships");
          return migrations.rows.map(({ migration_name }) => migration_name);
        },
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("Applying migration");

      await withClient(postgres.databaseUrl, async (client) => {
        const catalog = await client.query<{
          planning_rounds: string | null;
          planning_participants: string | null;
          planning_status: string | null;
        }>(`
          SELECT
            to_regclass('planning_rounds')::text AS planning_rounds,
            to_regclass('planning_participants')::text AS planning_participants,
            to_regtype('"PlanningRoundStatus"')::text AS planning_status
        `);
        expect(catalog.rows[0]).toEqual({
          planning_rounds: null,
          planning_participants: null,
          planning_status: null,
        });
        const migrations = await client.query<{ migration_name: string }>(`
          SELECT migration_name
          FROM _prisma_migrations
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY started_at, id
        `);
        expect(
          migrations.rows.map(({ migration_name }) => migration_name),
        ).toEqual(appliedBefore);
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a Phase 1 ledger with a dropped required base column", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: PLANNING_MIGRATION,
    });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, (client) =>
        client.query("ALTER TABLE chat_configurations DROP COLUMN timezone"),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("Applying migration");

      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );
      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          timezone_column: string | null;
          planning_rounds: string | null;
          planning_status: string | null;
        }>(`
          SELECT
            (
              SELECT column_name
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'chat_configurations'
                AND column_name = 'timezone'
            ) AS timezone_column,
            to_regclass('planning_rounds')::text AS planning_rounds,
            to_regtype('"PlanningRoundStatus"')::text AS planning_status
        `);
        expect(state.rows[0]).toEqual({
          timezone_column: null,
          planning_rounds: null,
          planning_status: null,
        });
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it.each([
    {
      enumName: "PlanningRoundStatus",
      declaration:
        "CREATE TYPE \"PlanningRoundStatus\" AS ENUM ('DRAFT', 'CONFIRMED', 'ABANDONED', 'SUPERSEDED')",
    },
    {
      enumName: "PlanningStep",
      declaration:
        "CREATE TYPE \"PlanningStep\" AS ENUM ('DAY', 'TIME', 'REVIEW')",
    },
  ])(
    "refuses a Phase 1 ledger with premature $enumName enum",
    async ({ enumName, declaration }) => {
      const postgres = await startPostgresTestContainer({
        mode: "before",
        exclusiveCutoff: PLANNING_MIGRATION,
      });
      try {
        const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
        await withClient(postgres.databaseUrl, (client) =>
          client.query(declaration),
        );

        const result = await runMigrationDeploy(postgres.databaseUrl);
        expect(result.exitCode).not.toBe(0);
        const output = `${result.stdout}\n${result.stderr}`;
        expect(output).toContain("Inconsistent planning schema baseline");
        expect(output).toContain("Migrations were not started");
        expect(output).not.toContain("Applying migration");

        expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
          appliedBefore,
        );
        await withClient(postgres.databaseUrl, async (client) => {
          const state = await client.query<{
            premature_enum: string | null;
            planning_rounds: string | null;
          }>(
            `SELECT
               to_regtype(format('%I', $1::text))::text AS premature_enum,
               to_regclass('planning_rounds')::text AS planning_rounds`,
            [enumName],
          );
          expect(state.rows[0]).toEqual({
            premature_enum: `"${enumName}"`,
            planning_rounds: null,
          });
        });
      } finally {
        await postgres.stop();
      }
    },
    180_000,
  );

  it("refuses a post-planning migration ledger when both planning tables are missing", async () => {
    const postgres = await startPostgresTestContainer({ mode: "all" });
    try {
      const appliedBefore = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const migrations = await client.query<{ migration_name: string }>(`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY started_at, id
          `);
          await client.query(
            "DROP TABLE planning_participants, planning_rounds",
          );
          return migrations.rows.map(({ migration_name }) => migration_name);
        },
      );
      expect(appliedBefore).toContain(PLANNING_MIGRATION);
      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: null,
        planning_participants: null,
        chat_memberships: "chat_memberships",
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        "Safe pre-planning migration prefix detected",
      );

      expect(await planningTablePresence(postgres.databaseUrl)).toEqual({
        planning_rounds: null,
        planning_participants: null,
        chat_memberships: "chat_memberships",
      });
      const appliedAfter = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const migrations = await client.query<{ migration_name: string }>(`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY started_at, id
          `);
          return migrations.rows.map(({ migration_name }) => migration_name);
        },
      );
      expect(appliedAfter).toEqual(appliedBefore);
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses complete-looking planning tables without a Prisma migration ledger", async () => {
    const postgres = await startPostgresTestContainer({ mode: "none" });
    try {
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(
          "CREATE TABLE planning_rounds (id text PRIMARY KEY, chat_id bigint, status text)",
        );
        await client.query(
          "CREATE TABLE chat_memberships (id text PRIMARY KEY, chat_id bigint, telegram_user_id bigint)",
        );
        await client.query(
          "CREATE TABLE planning_participants (id text PRIMARY KEY, round_id text, membership_id text, telegram_user_id bigint)",
        );
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        "Safe pre-planning migration prefix detected",
      );

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

  it("refuses a committed ledger whose claimed planning catalog has drifted", async () => {
    const postgres = await startPostgresTestContainer({ mode: "all" });
    try {
      await withClient(postgres.databaseUrl, (client) =>
        client.query("DROP INDEX planning_rounds_chat_id_starts_at_idx"),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("No pending migrations to apply");
      await withClient(postgres.databaseUrl, async (client) => {
        const missingIndex = await client.query<{ index_name: string | null }>(
          "SELECT to_regclass('planning_rounds_chat_id_starts_at_idx')::text AS index_name",
        );
        expect(missingIndex.rows[0]?.index_name).toBeNull();
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a final ledger with an unexpected planning CHECK constraint", async () => {
    const postgres = await startPostgresTestContainer({ mode: "all" });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, (client) =>
        client.query(`
          ALTER TABLE planning_rounds
          ADD CONSTRAINT planning_rounds_no_confirmed_check
          CHECK (status <> 'CONFIRMED')
        `),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("No pending migrations to apply");
      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );

      await withClient(postgres.databaseUrl, async (client) => {
        const constraint = await client.query<{ definition: string }>(`
          SELECT pg_get_constraintdef(oid) AS definition
          FROM pg_constraint
          WHERE conrelid = 'planning_rounds'::regclass
            AND conname = 'planning_rounds_no_confirmed_check'
        `);
        expect(constraint.rows[0]?.definition).toContain(
          "status <> 'CONFIRMED'",
        );
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a same-named NULLS NOT DISTINCT active-week index", async () => {
    const postgres = await startPostgresTestContainer({ mode: "all" });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(
          "DROP INDEX planning_rounds_chat_id_active_week_start_key",
        );
        await client.query(`
          CREATE UNIQUE INDEX planning_rounds_chat_id_active_week_start_key
          ON planning_rounds (chat_id, active_week_start) NULLS NOT DISTINCT
        `);
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("No pending migrations to apply");
      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );

      await withClient(postgres.databaseUrl, async (client) => {
        const index = await client.query<{ nulls_not_distinct: boolean }>(`
          SELECT indnullsnotdistinct AS nulls_not_distinct
          FROM pg_index
          WHERE indexrelid =
            'planning_rounds_chat_id_active_week_start_key'::regclass
        `);
        expect(index.rows[0]?.nulls_not_distinct).toBe(true);
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a final prefix whose expected unique index is invalid", async () => {
    const postgres = await startPostgresTestContainer({ mode: "all" });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(
          "DROP INDEX planning_rounds_chat_id_active_week_start_key",
        );
        await client.query(`
          INSERT INTO planning_rounds (
            id, chat_id, author_user_id, target_week_start, active_week_start,
            status, step, timezone, duration_minutes, daily_start_minute,
            daily_end_minute, last_activity_at, updated_at
          ) VALUES
            ('invalid-index-round-a', -1009000000200, 99200, '2026-09-07',
             '2026-09-07', 'DRAFT', 'DAY', 'Europe/Kyiv', 120, 540, 1320,
             NOW(), NOW()),
            ('invalid-index-round-b', -1009000000200, 99201, '2026-09-07',
             '2026-09-07', 'DRAFT', 'DAY', 'Europe/Kyiv', 120, 540, 1320,
             NOW(), NOW())
        `);
        await expect(
          client.query(`
            CREATE UNIQUE INDEX CONCURRENTLY planning_rounds_chat_id_active_week_start_key
            ON planning_rounds (chat_id, active_week_start)
          `),
        ).rejects.toThrow();
      });

      const invalidState = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const result = await client.query<{
            valid: boolean;
            ready: boolean;
            live: boolean;
          }>(`
            SELECT indisvalid AS valid, indisready AS ready, indislive AS live
            FROM pg_index
            WHERE indexrelid =
              'planning_rounds_chat_id_active_week_start_key'::regclass
          `);
          return result.rows[0];
        },
      );
      expect(invalidState?.valid).toBe(false);

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("No pending migrations to apply");
      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );

      const afterState = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const result = await client.query<{
            valid: boolean;
            ready: boolean;
            live: boolean;
          }>(`
            SELECT indisvalid AS valid, indisready AS ready, indislive AS live
            FROM pg_index
            WHERE indexrelid =
              'planning_rounds_chat_id_active_week_start_key'::regclass
          `);
          return result.rows[0];
        },
      );
      expect(afterState).toEqual(invalidState);
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a premature cooldown table before its migration", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: COOLDOWN_MIGRATION,
    });
    try {
      const appliedBefore = await withClient(
        postgres.databaseUrl,
        async (client) => {
          const migrations = await client.query<{ migration_name: string }>(`
            SELECT migration_name
            FROM _prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            ORDER BY started_at, id
          `);
          await client.query(
            "CREATE TABLE chat_status_cooldowns (chat_id bigint PRIMARY KEY)",
          );
          return migrations.rows.map(({ migration_name }) => migration_name);
        },
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain("Applying migration");

      await withClient(postgres.databaseUrl, async (client) => {
        const migrations = await client.query<{ migration_name: string }>(`
          SELECT migration_name
          FROM _prisma_migrations
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY started_at, id
        `);
        expect(
          migrations.rows.map(({ migration_name }) => migration_name),
        ).toEqual(appliedBefore);
        expect(
          await client.query(
            "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_status_cooldowns' AND column_name = 'last_posted_at'",
          ),
        ).toHaveProperty("rowCount", 0);
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a future cooldown table name occupied by a view", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: COOLDOWN_MIGRATION,
    });
    try {
      const appliedBefore = await appliedMigrationNames(postgres.databaseUrl);
      await withClient(postgres.databaseUrl, (client) =>
        client.query(
          "CREATE VIEW chat_status_cooldowns AS SELECT 1::bigint AS chat_id",
        ),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        `Applying migration \`${COOLDOWN_MIGRATION}\``,
      );
      expect(await appliedMigrationNames(postgres.databaseUrl)).toEqual(
        appliedBefore,
      );

      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          relation_kind: string;
          last_posted_at: string | null;
        }>(`
          SELECT
            (SELECT relkind FROM pg_class WHERE oid = 'chat_status_cooldowns'::regclass) AS relation_kind,
            (
              SELECT column_name
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'chat_status_cooldowns'
                AND column_name = 'last_posted_at'
            ) AS last_posted_at
        `);
        expect(state.rows[0]).toEqual({
          relation_kind: "v",
          last_posted_at: null,
        });
      });
    } finally {
      await postgres.stop();
    }
  }, 180_000);

  it("refuses a cooldown prefix whose claimed table definition has drifted", async () => {
    const postgres = await startPostgresTestContainer({
      mode: "before",
      exclusiveCutoff: TARGET_MIGRATION,
    });
    try {
      await withClient(postgres.databaseUrl, (client) =>
        client.query(
          "ALTER TABLE chat_status_cooldowns DROP COLUMN updated_at",
        ),
      );

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);
      const output = `${result.stdout}\n${result.stderr}`;
      expect(output).toContain("Inconsistent planning schema baseline");
      expect(output).toContain("Migrations were not started");
      expect(output).not.toContain(
        `Applying migration \`${TARGET_MIGRATION}\``,
      );
      expect(await targetMigrationRecord(postgres.databaseUrl)).toHaveLength(0);

      await withClient(postgres.databaseUrl, async (client) => {
        const missingColumn = await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_status_cooldowns' AND column_name = 'updated_at'",
        );
        expect(missingColumn.rowCount).toBe(0);
      });
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
      await withClient(postgres.databaseUrl, async (client) => {
        await client.query(`
          CREATE FUNCTION reject_integrity_index() RETURNS event_trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            RAISE EXCEPTION 'forced late integrity migration failure';
          END
          $$
        `);
        await client.query(`
          CREATE EVENT TRIGGER reject_integrity_index
          ON ddl_command_start
          WHEN TAG IN ('CREATE INDEX')
          EXECUTE FUNCTION reject_integrity_index()
        `);
      });

      const result = await runMigrationDeploy(postgres.databaseUrl);
      expect(result.exitCode).not.toBe(0);

      await withClient(postgres.databaseUrl, async (client) => {
        const state = await client.query<{
          abandoned_label: boolean;
          chat_id_column: string | null;
          original_round_fk: boolean;
          callback_expiry_index: string | null;
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
            to_regclass('callback_actions_expires_at_idx')::text AS callback_expiry_index
        `);
        expect(state.rows[0]).toEqual({
          abandoned_label: true,
          chat_id_column: null,
          original_round_fk: true,
          callback_expiry_index: null,
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
            PERFORM pg_advisory_xact_lock(902021);
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

      const blocker = new Client({ connectionString: postgres.databaseUrl });
      await blocker.connect();
      await blocker.query("SELECT pg_advisory_lock(902021)");
      const migration = runMigrationDeploy(postgres.databaseUrl);
      await waitForIntegrityMigrationTableLock(postgres.databaseUrl);

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

      await blocker.query("SELECT pg_advisory_unlock(902021)");
      await blocker.end();
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
              MESSAGE = 'Migration ${TARGET_MIGRATION} failed with SQLSTATE 23503',
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
