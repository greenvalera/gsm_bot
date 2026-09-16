import type { PrismaClient } from "../../generated/prisma/client.js";
import { PlanningService } from "../planning/planning-service.js";

export class ChatMigrationConflictError extends Error {
  constructor() {
    super(
      "Chat migration conflicts with existing chat state; operator review required.",
    );
  }
}

/** One basic-group -> supergroup transition; never infer identities from Web IDs. */
export async function migrateChat(
  prisma: PrismaClient,
  oldChatId: bigint,
  newChatId: bigint,
  now: Date,
): Promise<"migrated" | "already-migrated"> {
  if (oldChatId >= 0n || newChatId >= 0n || oldChatId === newChatId) {
    throw new ChatMigrationConflictError();
  }
  return prisma.$transaction(
    async (tx) => {
      // Match LanguageService's transaction lock before taking table locks.
      // Numeric ordering also makes overlapping identity pairs deadlock-safe.
      const identities = [oldChatId, newChatId].sort((a, b) =>
        a < b ? -1 : 1,
      );
      for (const chatId of identities)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${chatId})`;
      // Rare administrative transition. Lock all affected tables in one order so
      // concurrent setup/roster/recovery cannot create target state mid-transfer.
      await tx.$executeRaw`LOCK TABLE chat_migrations, chat_language_preferences, chat_configurations,
      chat_memberships, planning_rounds, planning_participants, setup_drafts,
      settings_edit_drafts, callback_actions, chat_status_cooldowns,
      chat_reminder_states, reminder_occurrences
      IN SHARE ROW EXCLUSIVE MODE`;
      const related = await tx.chatMigration.findMany({
        where: {
          OR: [
            { oldChatId: { in: [oldChatId, newChatId] } },
            { newChatId: { in: [oldChatId, newChatId] } },
          ],
        },
      });
      if (related.length > 0) {
        if (
          related.length === 1 &&
          related[0]?.oldChatId === oldChatId &&
          related[0].newChatId === newChatId
        )
          return "already-migrated";
        throw new ChatMigrationConflictError();
      }
      const where = { chatId: newChatId };
      const counts = await Promise.all([
        tx.chatLanguagePreference.count({ where }),
        tx.chatMembership.count({ where }),
        tx.planningRound.count({ where }),
        tx.setupDraft.count({ where }),
        tx.settingsEditDraft.count({ where }),
        tx.callbackAction.count({ where }),
      ]);
      if (counts.some((count) => count !== 0))
        throw new ChatMigrationConflictError();
      const destinationConfig = await tx.chatConfiguration.findUnique({
        where: { chatId: newChatId },
        include: { reminderState: true },
      });
      if (
        destinationConfig &&
        (!destinationConfig.reminderState ||
          !(await tx.chatConfiguration.count({ where: { chatId: oldChatId } })))
      )
        throw new ChatMigrationConflictError();

      // Identity changes do not constitute a new language selection. Raw SQL
      // deliberately preserves Prisma's @updatedAt value along with the marker.
      await tx.$executeRaw`
        UPDATE chat_language_preferences SET chat_id = ${newChatId}
        WHERE chat_id = ${oldChatId}
      `;

      // Both composite participant FKs share chat_id. Stage and restore the exact
      // snapshots inside this transaction; either parent-first update alone would
      // cascade chat_id and immediately violate the other FK.
      const participants = await tx.planningParticipant.findMany({
        where: { chatId: oldChatId },
      });
      // Occurrences also share chat_id across two immediate parent FKs.
      const states = await tx.chatReminderState.findMany({
        where: { chatId: { in: [oldChatId, newChatId] } },
      });
      const occurrences = await tx.reminderOccurrence.findMany({
        where: { chatId: { in: [oldChatId, newChatId] } },
        orderBy: { id: "asc" },
      });
      await tx.reminderOccurrence.deleteMany({
        where: { chatId: { in: [oldChatId, newChatId] } },
      });
      await tx.chatConfiguration.deleteMany({ where: { chatId: newChatId } });
      await tx.planningParticipant.deleteMany({ where: { chatId: oldChatId } });
      await tx.chatConfiguration.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: newChatId },
      });
      await tx.chatMembership.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: newChatId },
      });
      await tx.planningRound.updateMany({
        where: { chatId: oldChatId },
        data: {
          chatId: newChatId,
          anchorMessageId: null,
          announcementMessageId: null,
          lastStatusPostedAt: null,
          availabilityAnchorAcknowledgedAt: null,
          reminderGraceRestartAt: now,
          revision: { increment: 1 },
        },
      });
      const merged = new Map<string, (typeof occurrences)[number]>();
      const priority = {
        SENT: 8,
        UNKNOWN: 7,
        RESERVED: 6,
        REJECTED: 5,
        SUPPRESSED: 4,
        SKIPPED: 3,
        COALESCED: 2,
        OBSOLETE: 1,
        PENDING: 0,
      };
      for (const row of occurrences) {
        const key = JSON.stringify([
          row.kind,
          row.scope,
          row.generation,
          row.civilDate,
          row.minute,
        ]);
        const previous = merged.get(key);
        if (
          !previous ||
          priority[row.disposition] > priority[previous.disposition]
        )
          merged.set(key, row);
      }
      if (merged.size)
        await tx.reminderOccurrence.createMany({
          data: [...merged.values()].map((row) => ({
            ...row,
            chatId: newChatId,
            ...(row.disposition === "PENDING" ||
            (row.disposition === "REJECTED" && row.retryAt)
              ? {
                  disposition: "OBSOLETE" as const,
                  retryAt: null,
                  finishedAt: now,
                  reason: "chat-migrated",
                }
              : {}),
          })),
        });
      if (states.length) {
        const maximum = (values: (Date | null)[]) =>
          values.reduce<Date | null>(
            (a, b) => (b && (!a || b > a) ? b : a),
            null,
          );
        const data = {
          generation: Math.max(...states.map((s) => s.generation)) + 1,
          effectiveFrom: maximum([now, ...states.map((s) => s.effectiveFrom)])!,
          quietUntil: maximum(states.map((s) => s.quietUntil)),
          quietWeekStart: maximum(states.map((s) => s.quietWeekStart)),
          lastPlanningAttemptAt: maximum(
            states.map((s) => s.lastPlanningAttemptAt),
          ),
        };
        await tx.chatReminderState.upsert({
          where: { chatId: newChatId },
          create: { chatId: newChatId, ...data },
          update: data,
        });
      }
      if (participants.length)
        await tx.planningParticipant.createMany({
          data: participants.map((participant) => ({
            ...participant,
            chatId: newChatId,
          })),
        });
      await tx.setupDraft.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: newChatId },
      });
      await tx.settingsEditDraft.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: newChatId },
      });
      // Old tokens may embed old message IDs, including lifecycle confirmations.
      await tx.callbackAction.updateMany({
        where: { chatId: oldChatId },
        data: { chatId: newChatId, consumedAt: now, expiresAt: now },
      });
      // Availability recovery deliberately only LOADS standing capabilities.
      // Rotate those once in this identity transition, never on each status read.
      const planning = new PlanningService(prisma);
      const collecting = await tx.planningRound.findMany({
        where: { chatId: newChatId, status: "CONFIRMED" },
      });
      for (const round of collecting) {
        await planning.mintAvailabilityActions(tx, round, now);
        await planning.mintBookingRequestAction(tx, round, now);
      }
      // A /plan_status arriving before the service update is benign target state.
      // Clear both cooldowns so the first recovery command can render immediately.
      await tx.chatStatusCooldown.deleteMany({
        where: { chatId: { in: [oldChatId, newChatId] } },
      });
      await tx.chatMigration.create({
        data: { oldChatId, newChatId, createdAt: now },
      });
      return "migrated";
    },
    { timeout: 30_000 },
  );
}
