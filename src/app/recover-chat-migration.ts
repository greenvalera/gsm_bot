import { createPrismaClient } from "../infrastructure/db/prisma.js";
import { migrateChat } from "../domain/chat/migration-service.js";

// Run against an explicitly selected database with the polling worker stopped.
// No API-ID inference, environment-file loading, reset, or target-state merging.
async function main() {
  const [oldId, newId, confirmation] = process.argv.slice(2);
  if (
    !oldId ||
    !newId ||
    !/^-[1-9]\d*$/.test(oldId) ||
    !/^-[1-9]\d*$/.test(newId) ||
    confirmation !== "--apply"
  ) {
    throw new Error(
      "Usage: recover-chat-migration <old Bot API ID> <new Bot API ID> --apply",
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error(
      "DATABASE_URL must explicitly select the database to recover.",
    );
  const prisma = createPrismaClient(databaseUrl);
  try {
    const result = await migrateChat(
      prisma,
      BigInt(oldId),
      BigInt(newId),
      new Date(),
    );
    process.stdout.write(`${result}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(() => {
  // Do not print connection strings or driver diagnostics containing secrets.
  process.stderr.write(
    "Migration recovery refused or failed. Verify IDs, database, migration deployment and target-state conflicts. No partial transfer committed.\n",
  );
  process.exitCode = 1;
});
