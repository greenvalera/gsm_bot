import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { startPostgresTestContainer } from "../helpers/postgres.js";
import {
  reminderChat,
  reminderRound,
  reminderRow,
  resetReminders,
} from "../helpers/reminders.js";

const execFile = promisify(execFileCallback);
const MIGRATION = "20260916180000_chat_language_preferences";

async function deploy(databaseUrl: string) {
  return execFile(process.execPath, ["prisma/migrate-deploy.mjs"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

describe("committed chat language migration", () => {
  it.each(["before", "all"] as const)(
    "preserves existing domain rows and supports repeat deploy from %s",
    async (mode) => {
      const db = await startPostgresTestContainer(
        mode === "before" ? { mode, exclusiveCutoff: MIGRATION } : { mode },
      );
      const prisma = createPrismaClient(db.databaseUrl);
      try {
        await resetReminders(prisma);
        const round = await reminderRound(prisma);
        await reminderRow(prisma, round.id);
        await prisma.setupDraft.create({
          data: {
            chatId: reminderChat,
            actorUserId: 1n,
            timezone: "UTC",
            reminderMinutes: [600],
            expiresAt: new Date("2026-09-20"),
          },
        });
        await prisma.settingsEditDraft.create({
          data: {
            chatId: reminderChat,
            actorUserId: 1n,
            field: "DURATION_MINUTES",
            expectedRevision: 1,
            replacementPayload: 90,
            expiresAt: new Date("2026-09-20"),
          },
        });
        const snapshot = () =>
          Promise.all([
            prisma.chatConfiguration.findMany(),
            prisma.chatMembership.findMany(),
            prisma.setupDraft.findMany(),
            prisma.settingsEditDraft.findMany(),
            prisma.planningRound.findMany(),
            prisma.planningParticipant.findMany(),
            prisma.chatReminderState.findMany(),
            prisma.reminderOccurrence.findMany(),
          ]);
        const before = await snapshot();
        await deploy(db.databaseUrl);
        await deploy(db.databaseUrl);
        await execFile(
          process.execPath,
          ["node_modules/prisma/build/index.js", "migrate", "status"],
          {
            env: { ...process.env, DATABASE_URL: db.databaseUrl },
          },
        );
        expect(await snapshot()).toEqual(before);
        expect(
          await prisma.chatLanguagePreference.findUnique({
            where: { chatId: reminderChat },
          }),
        ).toBeNull();
        const implicit = await prisma.chatLanguagePreference.create({
          data: { chatId: -1006001000099n },
        });
        expect(implicit).toMatchObject({
          locale: "en",
          explicitlySelected: false,
        });
        expect(
          await prisma.chatConfiguration.findUnique({
            where: { chatId: implicit.chatId },
          }),
        ).toBeNull();
        await expect(
          prisma.chatLanguagePreference.create({
            data: { chatId: -1006001000098n, locale: "unsupported" },
          }),
        ).rejects.toThrow();
        const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'chat_language_preferences' ORDER BY ordinal_position
      `;
        expect(columns.map((column) => column.column_name)).toEqual([
          "chat_id",
          "locale",
          "explicitly_selected",
          "created_at",
          "updated_at",
        ]);
        const ledger = await prisma.$queryRaw<
          Array<{ migration_name: string }>
        >`
        SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at, id
      `;
        expect(ledger.at(-1)?.migration_name).toBe(MIGRATION);
        expect(
          ledger.filter((entry) => entry.migration_name === MIGRATION),
        ).toHaveLength(1);
      } finally {
        await prisma.$disconnect();
        await db.stop();
      }
    },
    120_000,
  );
});
