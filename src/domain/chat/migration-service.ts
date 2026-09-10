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
      // Rare administrative transition. Lock all affected tables in one order so
      // concurrent setup/roster/recovery cannot create target state mid-transfer.
      await tx.$executeRaw`LOCK TABLE chat_migrations, chat_configurations,
      chat_memberships, planning_rounds, planning_participants, setup_drafts,
      settings_edit_drafts, callback_actions, chat_status_cooldowns
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
        tx.chatConfiguration.count({ where }),
        tx.chatMembership.count({ where }),
        tx.planningRound.count({ where }),
        tx.setupDraft.count({ where }),
        tx.settingsEditDraft.count({ where }),
        tx.callbackAction.count({ where }),
      ]);
      if (counts.some((count) => count !== 0))
        throw new ChatMigrationConflictError();

      // Both composite participant FKs share chat_id. Stage and restore the exact
      // snapshots inside this transaction; either parent-first update alone would
      // cascade chat_id and immediately violate the other FK.
      const participants = await tx.planningParticipant.findMany({
        where: { chatId: oldChatId },
      });
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
          revision: { increment: 1 },
        },
      });
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
