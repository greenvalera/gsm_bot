import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { PgBoss, getConstructionPlans } from "pg-boss";

/** Deploy-only: runtime never invokes construction or createQueue. */
export async function provisionReminders(databaseUrl) {
  const sql = await readFile(
    new URL("./queue/pg-boss-12.27.0.sql", import.meta.url),
    "utf8",
  );
  if (
    sql.replaceAll("\r\n", "\n") !==
    getConstructionPlans("pgboss").replaceAll("\r\n", "\n")
  ) {
    throw new Error("Reviewed queue construction does not match installed pin");
  }
  const client = new Client({ connectionString: databaseUrl });
  const boss = new PgBoss({
    db: { executeSql: (text, values) => client.query(text, values) },
    schema: "pgboss",
    migrate: false,
    schedule: false,
    supervise: false,
  });
  boss.on("error", () => {});
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock(502002)");
    const exists = await client.query(
      "SELECT to_regnamespace('pgboss') AS schema",
    );
    if (exists.rows[0].schema === null) await client.query(sql);
    await boss.start();
    if (
      (await boss.schemaVersion()) !== 37 ||
      !(await boss.detectSchemaDrift()).ok
    ) {
      throw new Error("Queue schema does not match reviewed provisioning");
    }
    await boss.createQueue("reminder-reconcile", {
      policy: "short",
      retryLimit: 2,
      retryDelay: 30,
      expireInSeconds: 60,
      retentionSeconds: 3600,
      deleteAfterSeconds: 3600,
    });
  } finally {
    await boss.stop();
    await client.end(); // Releases the session deploy lock, including on failure.
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (!process.env.DATABASE_URL)
      throw new Error("Missing database configuration");
    await provisionReminders(process.env.DATABASE_URL);
    console.log("Reminder queue provisioning verified.");
  } catch {
    console.error(
      "Reminder queue provisioning failed; inspect the reviewed schema and dependency pin.",
    );
    process.exitCode = 1;
  }
}
