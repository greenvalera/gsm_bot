import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";

const LEGACY_ROUND_COUNT_SQL =
  "SELECT count(*) FROM planning_rounds WHERE status::text = 'ABANDONED';";
const INVALID_PARTICIPANT_BINDING_COUNT_SQL = `
  SELECT count(*)
  FROM planning_participants AS participant
  LEFT JOIN planning_rounds AS round ON round.id = participant.round_id
  LEFT JOIN chat_memberships AS membership ON membership.id = participant.membership_id
  WHERE round.id IS NULL
     OR membership.id IS NULL
     OR membership.chat_id IS DISTINCT FROM round.chat_id
     OR membership.telegram_user_id IS DISTINCT FROM participant.telegram_user_id
`;

function parseCount(value, condition) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`Invalid ${condition} count returned by PostgreSQL`);
  }
  return BigInt(value);
}

async function committedMigrationNames() {
  const entries = await readdir(resolve("prisma/migrations"), {
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function hasValidMigrationPrefix(client) {
  const migrationTable = await client.query(
    "SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present",
  );
  if (migrationTable.rows[0]?.present !== true) {
    return true;
  }

  const migrationRows = await client.query(`
    SELECT migration_name, finished_at IS NOT NULL AS finished,
           rolled_back_at IS NOT NULL AS rolled_back
    FROM _prisma_migrations
    ORDER BY started_at, id
  `);
  const activeRows = migrationRows.rows.filter(
    ({ rolled_back }) => !rolled_back,
  );
  if (activeRows.some(({ finished }) => !finished)) {
    return false;
  }

  const committed = await committedMigrationNames();
  return activeRows.every(
    ({ migration_name }, index) => committed[index] === migration_name,
  );
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

    if (
      tableState?.planning_rounds === false &&
      tableState?.planning_participants === false
    ) {
      return (await hasValidMigrationPrefix(client))
        ? { kind: "pre-planning" }
        : { kind: "inconsistent" };
    }
    if (!presence.every((present) => present === true)) {
      return { kind: "inconsistent" };
    }

    const legacyResult = await client.query(LEGACY_ROUND_COUNT_SQL);
    const invalidBindingResult = await client.query(
      INVALID_PARTICIPANT_BINDING_COUNT_SQL,
    );
    return {
      kind: "inherited",
      legacyRounds: parseCount(
        legacyResult.rows[0]?.count,
        "legacy ABANDONED rounds",
      ),
      invalidParticipantBindings: parseCount(
        invalidBindingResult.rows[0]?.count,
        "invalid participant bindings",
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

  if (databaseState.kind === "pre-planning") {
    console.log(
      "Safe pre-planning migration prefix detected; the remaining committed migration history will be applied.",
    );
    await deployWithLocalPrisma();
    return;
  }

  console.log(`legacy ABANDONED rounds: ${databaseState.legacyRounds}`);
  console.log(
    `invalid participant bindings: ${databaseState.invalidParticipantBindings}`,
  );

  if (
    databaseState.legacyRounds !== 0n ||
    databaseState.invalidParticipantBindings !== 0n
  ) {
    console.error(
      `Migration preflight blocked: legacy ABANDONED rounds: ${databaseState.legacyRounds}; invalid participant bindings: ${databaseState.invalidParticipantBindings}. Migrations were not started and existing rows were preserved. Inspect and repair the data through a reviewed backup-aware data migration before retrying.`,
    );
    process.exitCode = 1;
    return;
  }

  await deployWithLocalPrisma();
}

await main();
