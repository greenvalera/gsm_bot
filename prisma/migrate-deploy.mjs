import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { Client } from "pg";

const LEGACY_ROUND_COUNT_SQL =
  "SELECT count(*) FROM planning_rounds WHERE status::text = 'ABANDONED';";
const DANGLING_MEMBERSHIP_COUNT_SQL =
  "SELECT count(*) FROM planning_participants p LEFT JOIN chat_memberships m ON m.id = p.membership_id WHERE m.id IS NULL;";

function parseCount(value, condition) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${condition} count returned by PostgreSQL`);
  }
  return BigInt(value);
}

async function inspectDatabase(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  let connected = false;

  try {
    await client.connect();
    connected = true;

    const tableResult = await client.query(`
      SELECT
        to_regclass('planning_rounds') IS NOT NULL AS planning_rounds,
        to_regclass('planning_participants') IS NOT NULL AS planning_participants,
        to_regclass('chat_memberships') IS NOT NULL AS chat_memberships
    `);
    const tableState = tableResult.rows[0];
    const presence = [
      tableState?.planning_rounds,
      tableState?.planning_participants,
      tableState?.chat_memberships,
    ];

    if (presence.every((present) => present === false)) {
      return { kind: "fresh" };
    }
    if (!presence.every((present) => present === true)) {
      return { kind: "inconsistent" };
    }

    const legacyResult = await client.query(LEGACY_ROUND_COUNT_SQL);
    const danglingResult = await client.query(DANGLING_MEMBERSHIP_COUNT_SQL);
    return {
      kind: "inherited",
      legacyRounds: parseCount(
        legacyResult.rows[0]?.count,
        "legacy ABANDONED rounds",
      ),
      danglingMemberships: parseCount(
        danglingResult.rows[0]?.count,
        "dangling participant memberships",
      ),
    };
  } finally {
    if (connected) {
      await client.end();
    }
  }
}

async function deployWithLocalPrisma() {
  const prismaExecutable = resolve("node_modules/.bin/prisma");
  const result = await new Promise((resolveResult) => {
    const child = spawn(prismaExecutable, ["migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", () => {
      resolveResult({ code: 1, signal: null, spawnFailed: true });
    });
    child.once("exit", (code, signal) => {
      resolveResult({ code, signal, spawnFailed: false });
    });
  });

  if (result.spawnFailed) {
    console.error(
      "Migration deployment failed: the repository-local Prisma executable could not be started.",
    );
    process.exitCode = 1;
    return;
  }
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return;
  }
  process.exitCode = result.code ?? 1;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "Migration preflight failed: DATABASE_URL is required. Migrations were not started.",
    );
    process.exitCode = 1;
    return;
  }

  let databaseState;
  try {
    databaseState = await inspectDatabase(databaseUrl);
  } catch {
    console.error(
      "Migration preflight failed while inspecting the database. Migrations were not started.",
    );
    process.exitCode = 1;
    return;
  }

  if (databaseState.kind === "inconsistent") {
    console.error(
      "Inconsistent planning schema baseline: required planning tables are only partially present. Migrations were not started.",
    );
    process.exitCode = 1;
    return;
  }

  if (databaseState.kind === "fresh") {
    console.log(
      "Fresh database detected; the complete committed migration history will be applied.",
    );
    await deployWithLocalPrisma();
    return;
  }

  console.log(`legacy ABANDONED rounds: ${databaseState.legacyRounds}`);
  console.log(
    `dangling participant memberships: ${databaseState.danglingMemberships}`,
  );

  if (
    databaseState.legacyRounds !== 0n ||
    databaseState.danglingMemberships !== 0n
  ) {
    console.error(
      `Migration preflight blocked: legacy ABANDONED rounds: ${databaseState.legacyRounds}; dangling participant memberships: ${databaseState.danglingMemberships}. Migrations were not started and existing rows were preserved. Inspect and repair the data through a reviewed backup-aware data migration before retrying.`,
    );
    process.exitCode = 1;
    return;
  }

  await deployWithLocalPrisma();
}

await main();
