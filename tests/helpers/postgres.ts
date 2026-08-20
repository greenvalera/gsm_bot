import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { GenericContainer, Wait } from "testcontainers";

const execFile = promisify(execFileCallback);

export type PostgresTestContainer = Readonly<{
  databaseUrl: string;
  stop: () => Promise<void>;
}>;

async function runPrisma(args: string[], databaseUrl: string) {
  await execFile("./node_modules/.bin/prisma", args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

/** Applies the reviewed migration history; never uses schema push or implicit DDL. */
export async function applyCommittedMigrations(databaseUrl: string) {
  await runPrisma(["migrate", "deploy"], databaseUrl);
}

/** Starts a disposable PostgreSQL 18 database and migrates it before use. */
export async function startPostgresTestContainer(): Promise<PostgresTestContainer> {
  const container = await new GenericContainer("postgres:18.4")
    .withEnvironment({
      POSTGRES_DB: "gsmbot",
      POSTGRES_USER: "gsmbot",
      POSTGRES_PASSWORD: "gsmbot",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(
      Wait.forLogMessage("database system is ready to accept connections"),
    )
    .start();
  const databaseUrl = `postgresql://gsmbot:gsmbot@${container.getHost()}:${container.getMappedPort(5432)}/gsmbot`;

  try {
    await applyCommittedMigrations(databaseUrl);
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
