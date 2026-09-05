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
const AVAILABILITY_MIGRATION = "20260905120000_availability_and_booking";
const CORE_MIGRATION = "20260819000000_chat_readiness_core";
const SETTINGS_MIGRATION = "20260819010000_settings_edits";
const ROSTER_MIGRATION = "20260819020000_roster";
const ROSTER_REMOVAL_MIGRATION = "20260820030000_roster_removal";
const COMPLETE_SETTINGS_MIGRATION = "20260820090000_complete_settings_edits";
const CHAT_CONFIGURATION_COLUMNS = [
  ["chat_id", "bigint", true, null],
  ["timezone", "text", true, null],
  ["default_weekday", "integer", true, null],
  ["default_start_minute", "integer", true, null],
  ["duration_minutes", "integer", true, null],
  ["daily_start_minute", "integer", true, null],
  ["daily_end_minute", "integer", true, null],
  ["reminder_minutes", "integer[]", true, null],
  [
    "planning_access_policy",
    '"PlanningAccessPolicy"',
    true,
    `'ADMINS_ONLY'::"PlanningAccessPolicy"`,
  ],
  ["revision", "integer", true, "1"],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const SETUP_DRAFT_COLUMNS = [
  ["id", "text", true, null],
  ["chat_id", "bigint", true, null],
  ["actor_user_id", "bigint", true, null],
  ["step", '"SetupStep"', true, `'READINESS'::"SetupStep"`],
  ["candidate_timezone", "text", false, null],
  ["timezone", "text", false, null],
  ["default_weekday", "integer", false, null],
  ["default_start_minute", "integer", false, null],
  ["duration_minutes", "integer", false, null],
  ["daily_start_minute", "integer", false, null],
  ["daily_end_minute", "integer", false, null],
  ["reminder_minutes", "integer[]", true, null],
  ["planning_access_policy", '"PlanningAccessPolicy"', false, null],
  ["expected_revision", "integer", true, "0"],
  ["expires_at", "timestamp(3) with time zone", true, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const CALLBACK_ACTION_COLUMNS = [
  ["token", "text", true, null],
  ["kind", '"CallbackActionKind"', true, null],
  ["chat_id", "bigint", true, null],
  ["actor_user_id", "bigint", true, null],
  ["target_id", "text", false, null],
  ["expires_at", "timestamp(3) with time zone", true, null],
  ["consumed_at", "timestamp(3) with time zone", false, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
];
const SETTINGS_EDIT_DRAFT_COLUMNS = [
  ["id", "text", true, null],
  ["chat_id", "bigint", true, null],
  ["actor_user_id", "bigint", true, null],
  ["field", '"SettingsField"', true, null],
  ["replacement_payload", "jsonb", false, null],
  ["expected_revision", "integer", true, null],
  ["expires_at", "timestamp(3) with time zone", true, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const TELEGRAM_USER_COLUMNS = [
  ["telegram_user_id", "bigint", true, null],
  ["first_name", "text", false, null],
  ["last_name", "text", false, null],
  ["username", "text", false, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const CHAT_MEMBERSHIP_COLUMNS = [
  ["id", "text", true, null],
  ["chat_id", "bigint", true, null],
  ["telegram_user_id", "bigint", true, null],
  ["active_at", "timestamp(3) with time zone", false, "CURRENT_TIMESTAMP"],
  ["deactivated_at", "timestamp(3) with time zone", false, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const PLANNING_ROUND_COLUMNS = [
  ["id", "text", true, null],
  ["chat_id", "bigint", true, null],
  ["author_user_id", "bigint", true, null],
  ["target_week_start", "text", true, null],
  ["active_week_start", "text", false, null],
  ["status", '"PlanningRoundStatus"', true, `'DRAFT'::"PlanningRoundStatus"`],
  ["step", '"PlanningStep"', true, `'DAY'::"PlanningStep"`],
  ["timezone", "text", true, null],
  ["duration_minutes", "integer", true, null],
  ["daily_start_minute", "integer", true, null],
  ["daily_end_minute", "integer", true, null],
  ["selected_date", "text", false, null],
  ["selected_start_minute", "integer", false, null],
  ["anchor_message_id", "integer", false, null],
  ["starts_at", "timestamp(3) with time zone", false, null],
  ["ends_at", "timestamp(3) with time zone", false, null],
  ["confirmed_at", "timestamp(3) with time zone", false, null],
  ["last_activity_at", "timestamp(3) with time zone", true, null],
  ["last_status_posted_at", "timestamp(3) with time zone", false, null],
  ["revision", "integer", true, "1"],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
];
const BASE_PARTICIPANT_COLUMNS = [
  ["id", "text", true, null],
  ["round_id", "text", true, null],
  ["telegram_user_id", "bigint", true, null],
  ["membership_id", "text", true, null],
];
const COOLDOWN_COLUMNS = [
  ["chat_id", "bigint", true, null],
  ["last_posted_at", "timestamp(3) with time zone", true, null],
  ["created_at", "timestamp(3) with time zone", true, "CURRENT_TIMESTAMP"],
  ["updated_at", "timestamp(3) with time zone", true, null],
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

async function loadApplicationCatalog(client) {
  const result = await client.query(`
    SELECT
      COALESCE((
        SELECT jsonb_object_agg(relation.relname, relation.relkind)
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname NOT LIKE '\_prisma\_migrations%' ESCAPE '\'
      ), '{}'::jsonb) AS relations,
      COALESCE((
        SELECT jsonb_object_agg(type_row.typname, type_row.typtype)
        FROM pg_type AS type_row
        JOIN pg_namespace AS namespace ON namespace.oid = type_row.typnamespace
        WHERE namespace.nspname = current_schema()
          AND type_row.typrelid = 0
          AND type_row.typelem = 0
      ), '{}'::jsonb) AS types,
      COALESCE((
        SELECT jsonb_object_agg(enum_name, labels)
        FROM (
          SELECT enum_type.typname AS enum_name,
                 jsonb_agg(enum_value.enumlabel ORDER BY enum_value.enumsortorder) AS labels
          FROM pg_type AS enum_type
          JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
          JOIN pg_enum AS enum_value ON enum_value.enumtypid = enum_type.oid
          WHERE namespace.nspname = current_schema()
          GROUP BY enum_type.typname
        ) AS enum_catalog
      ), '{}'::jsonb) AS enums,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'table', relation.relname,
            'name', attribute.attname,
            'type', format_type(attribute.atttypid, attribute.atttypmod),
            'notNull', attribute.attnotnull,
            'default', pg_get_expr(column_default.adbin, column_default.adrelid)
          ) ORDER BY relation.relname, attribute.attnum
        )
        FROM pg_attribute AS attribute
        JOIN pg_class AS relation ON relation.oid = attribute.attrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        LEFT JOIN pg_attrdef AS column_default
          ON column_default.adrelid = relation.oid
         AND column_default.adnum = attribute.attnum
        WHERE namespace.nspname = current_schema()
          AND relation.relkind IN ('r', 'p')
          AND relation.relname <> '_prisma_migrations'
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      ), '[]'::jsonb) AS columns,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'table', relation.relname,
            'name', constraint_row.conname,
            'type', constraint_row.contype,
            'definition', pg_get_constraintdef(constraint_row.oid, false)
          ) ORDER BY relation.relname, constraint_row.conname
        )
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname <> '_prisma_migrations'
      ), '[]'::jsonb) AS constraints,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'table', relation.relname,
            'name', index_relation.relname,
            'definition', pg_get_indexdef(index_row.indexrelid, 0, false),
            'valid', index_row.indisvalid,
            'ready', index_row.indisready,
            'live', index_row.indislive
          ) ORDER BY relation.relname, index_relation.relname
        )
        FROM pg_index AS index_row
        JOIN pg_class AS relation ON relation.oid = index_row.indrelid
        JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname <> '_prisma_migrations'
      ), '[]'::jsonb) AS indexes
  `);
  return result.rows[0];
}

function hasExactColumns(catalog, table, expected) {
  const actual = catalog?.columns?.filter((column) => column.table === table);
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (column, index) =>
        column.name === expected[index]?.[0] &&
        column.type === expected[index]?.[1] &&
        column.notNull === expected[index]?.[2] &&
        column.default === expected[index]?.[3],
    )
  );
}

function normalizeDefinition(definition) {
  return typeof definition === "string"
    ? definition.replace(/\s+/gu, " ").trim()
    : definition;
}

function normalizeIndexDefinition(definition) {
  const normalized = normalizeDefinition(definition);
  return typeof normalized === "string"
    ? normalized.replace(/ ON (?:"(?:[^"]|"")+"|[^\s.]+)\./u, " ON ")
    : normalized;
}

function notNullConstraints(table, columns) {
  return columns
    .filter(([, , notNull]) => notNull)
    .map(([name]) => [`${table}_${name}_not_null`, "n", `NOT NULL ${name}`]);
}

function primaryKey(table, columns) {
  return [`${table}_pkey`, "p", `PRIMARY KEY (${columns.join(", ")})`];
}

function btreeIndex(table, name, columns, unique = false) {
  return [
    name,
    `CREATE ${unique ? "UNIQUE " : ""}INDEX ${name} ON ${table} USING btree (${columns.join(", ")})`,
  ];
}

function tableCatalog(columns, constraints, indexes) {
  return { columns, constraints, indexes };
}

function expectedApplicationCatalog(migrationNames) {
  if (!migrationNames.includes(CORE_MIGRATION)) return null;

  const settingsApplied = migrationNames.includes(SETTINGS_MIGRATION);
  const rosterApplied = migrationNames.includes(ROSTER_MIGRATION);
  const rosterRemovalApplied = migrationNames.includes(
    ROSTER_REMOVAL_MIGRATION,
  );
  const completeSettingsApplied = migrationNames.includes(
    COMPLETE_SETTINGS_MIGRATION,
  );
  const planningApplied = migrationNames.includes(PLANNING_MIGRATION);
  const integrityApplied = migrationNames.includes(INTEGRITY_MIGRATION);
  const availabilityApplied = migrationNames.includes(AVAILABILITY_MIGRATION);
  const cooldownApplied = migrationNames.includes(COOLDOWN_MIGRATION);
  // Both lists are ordered by PHYSICAL column position (`attnum`), because
  // `hasExactColumns` compares index by index. An `ADD COLUMN` lands after every
  // existing column, and PostgreSQL orders the statements of one `ALTER TABLE`
  // alphabetically in Prisma's generated SQL — so the appended tuples follow the
  // migration's own order, not the Prisma model's.
  const participantColumns = [
    ...BASE_PARTICIPANT_COLUMNS,
    ...(integrityApplied ? [["chat_id", "bigint", true, null]] : []),
    ...(availabilityApplied
      ? [
          ["answered_at", "timestamp(3) with time zone", false, null],
          ["availability", '"ParticipantAvailability"', false, null],
        ]
      : []),
  ];
  const roundColumns = [
    ...PLANNING_ROUND_COLUMNS,
    ...(availabilityApplied
      ? [
          ["announcement_message_id", "integer", false, null],
          ["booked_at", "timestamp(3) with time zone", false, null],
          ["booked_by_user_id", "bigint", false, null],
          ["ready_announced_at", "timestamp(3) with time zone", false, null],
        ]
      : []),
  ];
  const tables = {
    chat_configurations: tableCatalog(
      CHAT_CONFIGURATION_COLUMNS,
      [
        ...notNullConstraints(
          "chat_configurations",
          CHAT_CONFIGURATION_COLUMNS,
        ),
        primaryKey("chat_configurations", ["chat_id"]),
      ],
      [
        btreeIndex(
          "chat_configurations",
          "chat_configurations_pkey",
          ["chat_id"],
          true,
        ),
      ],
    ),
    setup_drafts: tableCatalog(
      SETUP_DRAFT_COLUMNS,
      [
        ...notNullConstraints("setup_drafts", SETUP_DRAFT_COLUMNS),
        primaryKey("setup_drafts", ["id"]),
      ],
      [
        btreeIndex("setup_drafts", "setup_drafts_pkey", ["id"], true),
        btreeIndex(
          "setup_drafts",
          "setup_drafts_chat_id_actor_user_id_key",
          ["chat_id", "actor_user_id"],
          true,
        ),
        btreeIndex("setup_drafts", "setup_drafts_expires_at_idx", [
          "expires_at",
        ]),
      ],
    ),
    callback_actions: tableCatalog(
      CALLBACK_ACTION_COLUMNS,
      [
        ...notNullConstraints("callback_actions", CALLBACK_ACTION_COLUMNS),
        primaryKey("callback_actions", ["token"]),
      ],
      [
        btreeIndex(
          "callback_actions",
          "callback_actions_pkey",
          ["token"],
          true,
        ),
        btreeIndex(
          "callback_actions",
          "callback_actions_chat_id_actor_user_id_expires_at_idx",
          ["chat_id", "actor_user_id", "expires_at"],
        ),
        ...(integrityApplied
          ? [
              btreeIndex(
                "callback_actions",
                "callback_actions_expires_at_idx",
                ["expires_at"],
              ),
            ]
          : []),
      ],
    ),
  };

  if (settingsApplied) {
    tables.settings_edit_drafts = tableCatalog(
      SETTINGS_EDIT_DRAFT_COLUMNS,
      [
        ...notNullConstraints(
          "settings_edit_drafts",
          SETTINGS_EDIT_DRAFT_COLUMNS,
        ),
        primaryKey("settings_edit_drafts", ["id"]),
      ],
      [
        btreeIndex(
          "settings_edit_drafts",
          "settings_edit_drafts_pkey",
          ["id"],
          true,
        ),
        btreeIndex(
          "settings_edit_drafts",
          "settings_edit_drafts_chat_id_actor_user_id_key",
          ["chat_id", "actor_user_id"],
          true,
        ),
        btreeIndex(
          "settings_edit_drafts",
          "settings_edit_drafts_expires_at_idx",
          ["expires_at"],
        ),
      ],
    );
  }

  if (rosterApplied) {
    tables.telegram_users = tableCatalog(
      TELEGRAM_USER_COLUMNS,
      [
        ...notNullConstraints("telegram_users", TELEGRAM_USER_COLUMNS),
        primaryKey("telegram_users", ["telegram_user_id"]),
      ],
      [
        btreeIndex(
          "telegram_users",
          "telegram_users_pkey",
          ["telegram_user_id"],
          true,
        ),
      ],
    );
    tables.chat_memberships = tableCatalog(
      CHAT_MEMBERSHIP_COLUMNS,
      [
        ...notNullConstraints("chat_memberships", CHAT_MEMBERSHIP_COLUMNS),
        [
          "chat_memberships_telegram_user_id_fkey",
          "f",
          "FOREIGN KEY (telegram_user_id) REFERENCES telegram_users(telegram_user_id) ON UPDATE CASCADE ON DELETE RESTRICT",
        ],
        primaryKey("chat_memberships", ["id"]),
      ],
      [
        btreeIndex("chat_memberships", "chat_memberships_pkey", ["id"], true),
        btreeIndex(
          "chat_memberships",
          "chat_memberships_chat_id_telegram_user_id_key",
          ["chat_id", "telegram_user_id"],
          true,
        ),
        btreeIndex(
          "chat_memberships",
          "chat_memberships_chat_id_active_at_idx",
          ["chat_id", "active_at"],
        ),
        ...(integrityApplied
          ? [
              btreeIndex(
                "chat_memberships",
                "chat_memberships_id_chat_id_telegram_user_id_key",
                ["id", "chat_id", "telegram_user_id"],
                true,
              ),
            ]
          : []),
      ],
    );
  }

  if (planningApplied) {
    tables.planning_rounds = tableCatalog(
      roundColumns,
      [
        ...notNullConstraints("planning_rounds", roundColumns),
        primaryKey("planning_rounds", ["id"]),
      ],
      [
        btreeIndex("planning_rounds", "planning_rounds_pkey", ["id"], true),
        btreeIndex(
          "planning_rounds",
          "planning_rounds_chat_id_status_target_week_start_idx",
          ["chat_id", "status", "target_week_start"],
        ),
        btreeIndex("planning_rounds", "planning_rounds_chat_id_starts_at_idx", [
          "chat_id",
          "starts_at",
        ]),
        btreeIndex(
          "planning_rounds",
          "planning_rounds_chat_id_active_week_start_key",
          ["chat_id", "active_week_start"],
          true,
        ),
        ...(integrityApplied
          ? [
              btreeIndex(
                "planning_rounds",
                "planning_rounds_id_chat_id_key",
                ["id", "chat_id"],
                true,
              ),
            ]
          : []),
      ],
    );
    tables.planning_participants = tableCatalog(
      participantColumns,
      [
        ...notNullConstraints("planning_participants", participantColumns),
        ...(integrityApplied
          ? [
              [
                "planning_participants_membership_id_chat_id_telegram_user__fkey",
                "f",
                "FOREIGN KEY (membership_id, chat_id, telegram_user_id) REFERENCES chat_memberships(id, chat_id, telegram_user_id) ON UPDATE CASCADE ON DELETE RESTRICT",
              ],
              [
                "planning_participants_round_id_chat_id_fkey",
                "f",
                "FOREIGN KEY (round_id, chat_id) REFERENCES planning_rounds(id, chat_id) ON UPDATE CASCADE ON DELETE CASCADE",
              ],
            ]
          : [
              [
                "planning_participants_round_id_fkey",
                "f",
                "FOREIGN KEY (round_id) REFERENCES planning_rounds(id) ON UPDATE CASCADE ON DELETE CASCADE",
              ],
            ]),
        primaryKey("planning_participants", ["id"]),
      ],
      [
        btreeIndex(
          "planning_participants",
          "planning_participants_pkey",
          ["id"],
          true,
        ),
        btreeIndex(
          "planning_participants",
          "planning_participants_round_id_telegram_user_id_key",
          ["round_id", "telegram_user_id"],
          true,
        ),
        ...(integrityApplied
          ? [
              btreeIndex(
                "planning_participants",
                "planning_participants_telegram_user_id_idx",
                ["telegram_user_id"],
              ),
            ]
          : []),
      ],
    );
  }

  if (cooldownApplied) {
    tables.chat_status_cooldowns = tableCatalog(
      COOLDOWN_COLUMNS,
      [
        ...notNullConstraints("chat_status_cooldowns", COOLDOWN_COLUMNS),
        primaryKey("chat_status_cooldowns", ["chat_id"]),
      ],
      [
        btreeIndex(
          "chat_status_cooldowns",
          "chat_status_cooldowns_pkey",
          ["chat_id"],
          true,
        ),
      ],
    );
  }

  const enums = {
    PlanningAccessPolicy: [
      "ADMINS_ONLY",
      "PREVIOUS_PARTICIPANTS",
      "ANYONE_IN_CHAT",
    ],
    SetupStep: ["READINESS"],
    CallbackActionKind: [
      "START_SETUP",
      ...(settingsApplied ? ["SETTINGS_EDIT"] : []),
      ...(rosterRemovalApplied ? ["ROSTER_REMOVE"] : []),
      ...(planningApplied ? ["PLANNING"] : []),
    ],
    ...(settingsApplied
      ? {
          SettingsField: completeSettingsApplied
            ? [
                "PLANNING_ACCESS_POLICY",
                "TIMEZONE",
                "DEFAULT_WEEKDAY",
                "DEFAULT_START_MINUTE",
                "DURATION_MINUTES",
                "DAILY_START_MINUTE",
                "DAILY_END_MINUTE",
                "REMINDER_MINUTES",
              ]
            : ["PLANNING_ACCESS_POLICY"],
        }
      : {}),
    ...(planningApplied
      ? {
          // Label ORDER is the assertion: PostgreSQL appends a new value at the
          // end of `enumsortorder`, so `BOOKED` may only ever appear last.
          PlanningRoundStatus: integrityApplied
            ? availabilityApplied
              ? ["DRAFT", "CONFIRMED", "SUPERSEDED", "BOOKED"]
              : ["DRAFT", "CONFIRMED", "SUPERSEDED"]
            : ["DRAFT", "CONFIRMED", "ABANDONED", "SUPERSEDED"],
          PlanningStep: ["DAY", "TIME", "REVIEW"],
        }
      : {}),
    ...(availabilityApplied
      ? { ParticipantAvailability: ["AVAILABLE", "UNAVAILABLE"] }
      : {}),
  };

  const relations = Object.fromEntries([
    ...Object.keys(tables).map((name) => [name, "r"]),
    ...Object.values(tables).flatMap(({ indexes }) =>
      indexes.map(([name]) => [name, "i"]),
    ),
  ]);
  const types = Object.fromEntries(
    Object.keys(enums).map((name) => [name, "e"]),
  );

  return { tables, enums, relations, types };
}

function hasExactDefinitions(actual, expected, normalize) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every(([name, typeOrDefinition, maybeDefinition]) =>
      actual.some((entry) => {
        const expectedDefinition = maybeDefinition ?? typeOrDefinition;
        return (
          entry.name === name &&
          (maybeDefinition === undefined || entry.type === typeOrDefinition) &&
          normalize(entry.definition) === normalize(expectedDefinition)
        );
      }),
    )
  );
}

function hasExactIndexes(actual, expected) {
  return (
    hasExactDefinitions(actual, expected, normalizeIndexDefinition) &&
    actual.every(
      (entry) =>
        entry.valid === true && entry.ready === true && entry.live === true,
    )
  );
}

function hasExactApplicationCatalog(catalog, migrationNames) {
  const expected = expectedApplicationCatalog(migrationNames);
  if (!expected) return false;

  const expectedTableNames = Object.keys(expected.tables).sort();
  const expectedRelationNames = Object.keys(expected.relations).sort();
  const actualRelationNames = Object.keys(catalog?.relations ?? {}).sort();
  const expectedTypeNames = Object.keys(expected.types).sort();
  const actualTypeNames = Object.keys(catalog?.types ?? {}).sort();
  const expectedEnumNames = Object.keys(expected.enums).sort();
  const actualEnumNames = Object.keys(catalog?.enums ?? {}).sort();

  return (
    hasExactValues(actualRelationNames, expectedRelationNames) &&
    expectedRelationNames.every(
      (name) => catalog.relations[name] === expected.relations[name],
    ) &&
    hasExactValues(actualTypeNames, expectedTypeNames) &&
    expectedTypeNames.every(
      (name) => catalog.types[name] === expected.types[name],
    ) &&
    hasExactValues(actualEnumNames, expectedEnumNames) &&
    expectedEnumNames.every((name) =>
      hasExactValues(catalog.enums[name], expected.enums[name]),
    ) &&
    expectedTableNames.every((table) => {
      const expectedTable = expected.tables[table];
      return (
        hasExactColumns(catalog, table, expectedTable.columns) &&
        hasExactDefinitions(
          catalog.constraints.filter((entry) => entry.table === table),
          expectedTable.constraints,
          normalizeDefinition,
        ) &&
        hasExactIndexes(
          catalog.indexes.filter((entry) => entry.table === table),
          expectedTable.indexes,
        )
      );
    })
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
    const catalog = await loadApplicationCatalog(client);

    if (
      tableState?.planning_rounds === false &&
      tableState?.planning_participants === false
    ) {
      const safeWithoutPlanningTables = migrationHistory.present
        ? migrationHistory.valid &&
          migrationHistory.names.length <= migrationHistory.planningIndex &&
          hasExactApplicationCatalog(catalog, migrationHistory.names)
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
      !hasExactApplicationCatalog(catalog, migrationHistory.names)
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
