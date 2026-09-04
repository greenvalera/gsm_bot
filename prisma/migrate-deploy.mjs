import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { Client } from "pg";

const LEGACY_ROUND_COUNT_SQL =
  "SELECT count(*) FROM planning_rounds WHERE status::text = 'ABANDONED';";
const MAX_CHILD_OUTPUT_BYTES = 64 * 1024;
const PLANNING_MIGRATION = "20260831100411_planning_rounds";
const COOLDOWN_MIGRATION = "20260901120000_chat_status_cooldowns";
const INTEGRITY_MIGRATION = "20260902152000_planning_participant_integrity";
const PLANNING_ROUND_COLUMNS = [
  "active_week_start",
  "anchor_message_id",
  "author_user_id",
  "chat_id",
  "confirmed_at",
  "created_at",
  "daily_end_minute",
  "daily_start_minute",
  "duration_minutes",
  "ends_at",
  "id",
  "last_activity_at",
  "last_status_posted_at",
  "revision",
  "selected_date",
  "selected_start_minute",
  "starts_at",
  "status",
  "step",
  "target_week_start",
  "timezone",
  "updated_at",
];
const BASE_PARTICIPANT_COLUMNS = [
  "id",
  "membership_id",
  "round_id",
  "telegram_user_id",
];
const BASE_PLANNING_INDEXES = [
  "planning_participants_pkey",
  "planning_participants_round_id_telegram_user_id_key",
  "planning_rounds_chat_id_active_week_start_key",
  "planning_rounds_chat_id_starts_at_idx",
  "planning_rounds_chat_id_status_target_week_start_idx",
  "planning_rounds_pkey",
];
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

function redactMigrationOutput(output) {
  return output
    .split(/(?<=\n)/u)
    .map((line) => {
      if (/^\s*Datasource\s+"[^"]+":.*\bat\s+"/iu.test(line)) {
        return "Datasource target: [redacted]\n";
      }
      return line
        .replace(/\bDETAIL:\s*.*$/iu, "DETAIL: [redacted]")
        .replace(
          /\bpostgres(?:ql)?:\/\/[^\s"'`]+/giu,
          "[redacted database URL]",
        )
        .replace(
          /\b(password|pass|user|username|host|port|dbname|database)=([^\s;]+)/giu,
          "$1=[redacted]",
        );
    })
    .join("");
}

function captureBoundedOutput(stream) {
  const chunks = [];
  let capturedBytes = 0;
  let truncated = false;

  stream.on("data", (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const remainingBytes = MAX_CHILD_OUTPUT_BYTES - capturedBytes;
    if (remainingBytes > 0) {
      const captured = chunk.subarray(0, remainingBytes);
      chunks.push(captured);
      capturedBytes += captured.length;
    }
    if (chunk.length > remainingBytes) {
      truncated = true;
    }
  });

  return () => ({
    output: redactMigrationOutput(Buffer.concat(chunks).toString("utf8")),
    truncated,
  });
}

function forwardCapturedOutput(capture, destination) {
  const { output, truncated } = capture();
  if (output.length > 0) {
    destination.write(output);
  }
  if (truncated) {
    if (output.length > 0 && !output.endsWith("\n")) {
      destination.write("\n");
    }
    destination.write("[migration output truncated]\n");
  }
}

async function committedMigrations() {
  const entries = await readdir(resolve("prisma/migrations"), {
    withFileTypes: true,
  });
  const names = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(
        resolve("prisma/migrations", name, "migration.sql"),
      );
      return {
        name,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function isApplicationSchemaEmpty(client) {
  const result = await client.query(`
    SELECT NOT EXISTS (
      SELECT 1
      FROM pg_depend AS dependency
      JOIN pg_namespace AS namespace
        ON namespace.oid = dependency.refobjid
      WHERE dependency.refclassid = 'pg_namespace'::regclass
        AND dependency.deptype = 'n'
        AND namespace.nspname = current_schema()
    ) AS empty
  `);
  return result.rows[0]?.empty === true;
}

async function migrationHistoryState(client) {
  const migrationTable = await client.query(
    "SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present",
  );
  if (migrationTable.rows[0]?.present !== true) {
    return { present: false, valid: false, names: [], planningIndex: -1 };
  }

  const migrationRows = await client.query(`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS finished,
           rolled_back_at IS NOT NULL AS rolled_back
    FROM _prisma_migrations
    ORDER BY started_at, id
  `);
  const activeRows = migrationRows.rows.filter(
    ({ rolled_back }) => !rolled_back,
  );
  const committed = await committedMigrations();
  const planningIndex = committed.findIndex(
    ({ name }) => name === PLANNING_MIGRATION,
  );
  const valid =
    planningIndex >= 0 &&
    activeRows.every(({ finished }) => finished) &&
    activeRows.length <= committed.length &&
    activeRows.every(
      ({ migration_name, checksum }, index) =>
        committed[index]?.name === migration_name &&
        committed[index]?.checksum === checksum,
    );
  return {
    present: true,
    valid,
    names: activeRows.map(({ migration_name }) => migration_name),
    planningIndex,
  };
}

function hasExactValues(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

async function hasRequiredPlanningCatalog(client, migrationNames) {
  const integrityApplied = migrationNames.includes(INTEGRITY_MIGRATION);
  const cooldownApplied = migrationNames.includes(COOLDOWN_MIGRATION);
  const result = await client.query(`
    SELECT
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'planning_rounds'
        ORDER BY column_name
      ) AS round_columns,
      ARRAY(
        SELECT column_name::text
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'planning_participants'
        ORDER BY column_name
      ) AS participant_columns,
      ARRAY(
        SELECT enum_value.enumlabel::text
        FROM pg_enum AS enum_value
        JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
        JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
        WHERE namespace.nspname = current_schema()
          AND enum_type.typname = 'PlanningRoundStatus'
        ORDER BY enum_value.enumsortorder
      ) AS status_labels,
      ARRAY(
        SELECT enum_value.enumlabel::text
        FROM pg_enum AS enum_value
        JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
        JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
        WHERE namespace.nspname = current_schema()
          AND enum_type.typname = 'PlanningStep'
        ORDER BY enum_value.enumsortorder
      ) AS step_labels,
      ARRAY(
        SELECT indexname::text
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename IN ('planning_rounds', 'planning_participants')
        ORDER BY indexname
      ) AS planning_indexes,
      ARRAY(
        SELECT constraint_name.conname::text
        FROM pg_constraint AS constraint_name
        JOIN pg_class AS relation ON relation.oid = constraint_name.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname IN ('planning_rounds', 'planning_participants')
          AND constraint_name.contype IN ('p', 'f')
        ORDER BY constraint_name.conname
      ) AS planning_constraints,
      to_regclass('chat_status_cooldowns') IS NOT NULL AS cooldown_table,
      to_regclass('callback_actions_expires_at_idx') IS NOT NULL AS callback_expiry_index,
      to_regclass('chat_memberships_id_chat_id_telegram_user_id_key') IS NOT NULL AS membership_identity_index
  `);
  const catalog = result.rows[0];
  const participantColumns = integrityApplied
    ? ["chat_id", ...BASE_PARTICIPANT_COLUMNS]
    : BASE_PARTICIPANT_COLUMNS;
  const planningIndexes = integrityApplied
    ? [
        "planning_participants_pkey",
        "planning_participants_round_id_telegram_user_id_key",
        "planning_participants_telegram_user_id_idx",
        "planning_rounds_chat_id_active_week_start_key",
        "planning_rounds_chat_id_starts_at_idx",
        "planning_rounds_chat_id_status_target_week_start_idx",
        "planning_rounds_id_chat_id_key",
        "planning_rounds_pkey",
      ]
    : BASE_PLANNING_INDEXES;
  const planningConstraints = integrityApplied
    ? [
        "planning_participants_membership_id_chat_id_telegram_user__fkey",
        "planning_participants_pkey",
        "planning_participants_round_id_chat_id_fkey",
        "planning_rounds_pkey",
      ]
    : [
        "planning_participants_pkey",
        "planning_participants_round_id_fkey",
        "planning_rounds_pkey",
      ];

  return (
    hasExactValues(catalog?.round_columns, PLANNING_ROUND_COLUMNS) &&
    hasExactValues(catalog?.participant_columns, participantColumns) &&
    hasExactValues(
      catalog?.status_labels,
      integrityApplied
        ? ["DRAFT", "CONFIRMED", "SUPERSEDED"]
        : ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"],
    ) &&
    hasExactValues(catalog?.step_labels, ["DAY", "TIME", "REVIEW"]) &&
    hasExactValues(catalog?.planning_indexes, planningIndexes) &&
    hasExactValues(catalog?.planning_constraints, planningConstraints) &&
    (!cooldownApplied || catalog?.cooldown_table === true) &&
    (!integrityApplied || catalog?.callback_expiry_index === true) &&
    (!integrityApplied || catalog?.membership_identity_index === true)
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
    const migrationHistory = await migrationHistoryState(client);

    if (
      tableState?.planning_rounds === false &&
      tableState?.planning_participants === false
    ) {
      const safeWithoutPlanningTables = migrationHistory.present
        ? migrationHistory.valid &&
          migrationHistory.names.length <= migrationHistory.planningIndex
        : await isApplicationSchemaEmpty(client);
      return safeWithoutPlanningTables
        ? { kind: "pre-planning" }
        : { kind: "inconsistent" };
    }
    if (!presence.every((present) => present === true)) {
      return { kind: "inconsistent" };
    }
    if (
      !migrationHistory.present ||
      !migrationHistory.valid ||
      migrationHistory.names.length <= migrationHistory.planningIndex ||
      !(await hasRequiredPlanningCatalog(client, migrationHistory.names))
    ) {
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
      stdio: ["ignore", "pipe", "pipe"],
    });
    const captureStdout = captureBoundedOutput(child.stdout);
    const captureStderr = captureBoundedOutput(child.stderr);
    let settled = false;

    const finish = (childResult) => {
      if (settled) {
        return;
      }
      settled = true;
      forwardCapturedOutput(captureStdout, process.stdout);
      forwardCapturedOutput(captureStderr, process.stderr);
      resolveResult(childResult);
    };

    child.once("error", () => {
      finish({ code: 1, signal: null, spawnFailed: true });
    });
    child.once("close", (code, signal) => {
      finish({ code, signal, spawnFailed: false });
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
      "Inconsistent planning schema baseline: required planning tables and migration history do not describe a safe pre-planning database. Migrations were not started.",
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
