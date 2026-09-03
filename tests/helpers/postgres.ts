import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { GenericContainer, Wait } from "testcontainers";

const execFile = promisify(execFileCallback);

export type PostgresTestContainer = Readonly<{
  databaseUrl: string;
  stop: () => Promise<void>;
}>;

export type PostgresMigrationSetup =
  | Readonly<{ mode: "all" }>
  | Readonly<{ mode: "none" }>
  | Readonly<{ mode: "before"; exclusiveCutoff: string }>;

async function runPrisma(args: string[], databaseUrl: string) {
  await execFile("./node_modules/.bin/prisma", args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

/** Applies the reviewed migration history; never uses schema push or implicit DDL. */
export async function applyCommittedMigrations(databaseUrl: string) {
  await runPrisma(["migrate", "deploy"], databaseUrl);
  await runPrisma(["migrate", "status"], databaseUrl);
}

async function applyCommittedMigrationsBefore(
  databaseUrl: string,
  exclusiveCutoff: string,
) {
  const sourceMigrations = resolve("prisma/migrations");
  const entries = await readdir(sourceMigrations, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (!migrationNames.includes(exclusiveCutoff)) {
    throw new Error(`Unknown migration cutoff: ${exclusiveCutoff}`);
  }

  const selectedMigrations = migrationNames.filter(
    (name) => name < exclusiveCutoff,
  );
  if (selectedMigrations.length === 0) {
    throw new Error(
      `Migration cutoff has no committed predecessor: ${exclusiveCutoff}`,
    );
  }

  const cacheRoot = resolve("node_modules/.cache");
  await mkdir(cacheRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(join(cacheRoot, "migration-prefix-"));
  const temporaryMigrations = join(temporaryRoot, "migrations");
  const temporaryConfig = join(temporaryRoot, "prisma.config.ts");

  try {
    await mkdir(temporaryMigrations);
    await cp(
      join(sourceMigrations, "migration_lock.toml"),
      join(temporaryMigrations, "migration_lock.toml"),
    );
    for (const migrationName of selectedMigrations) {
      await cp(
        join(sourceMigrations, migrationName),
        join(temporaryMigrations, migrationName),
        { recursive: true },
      );
    }

    await writeFile(
      temporaryConfig,
      [
        'import { defineConfig, env } from "prisma/config";',
        "",
        "export default defineConfig({",
        `  schema: ${JSON.stringify(resolve("prisma/schema.prisma"))},`,
        "  migrations: {",
        `    path: ${JSON.stringify(temporaryMigrations)},`,
        "  },",
        '  datasource: { url: env("DATABASE_URL") },',
        "});",
        "",
      ].join("\n"),
      "utf8",
    );

    const configArgs = ["--config", temporaryConfig];
    await runPrisma(["migrate", "deploy", ...configArgs], databaseUrl);
    await runPrisma(["migrate", "status", ...configArgs], databaseUrl);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

/** Starts a disposable PostgreSQL 18 database and migrates it before use. */
export async function startPostgresTestContainer(
  setup: PostgresMigrationSetup = { mode: "all" },
): Promise<PostgresTestContainer> {
  const container = await new GenericContainer("postgres:18.4")
    .withEnvironment({
      POSTGRES_DB: "gsmbot",
      POSTGRES_USER: "gsmbot",
      POSTGRES_PASSWORD: "gsmbot",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections", 2),
    )
    .start();
  const databaseUrl = `postgresql://gsmbot:gsmbot@${container.getHost()}:${container.getMappedPort(5432)}/gsmbot`;

  try {
    if (setup.mode === "all") {
      await applyCommittedMigrations(databaseUrl);
    } else if (setup.mode === "before") {
      await applyCommittedMigrationsBefore(databaseUrl, setup.exclusiveCutoff);
    }
  } catch (error) {
    await container.stop();
    throw error;
  }

  return {
    databaseUrl,
    stop: async () => {
      await container.stop();
    },
  };
}
