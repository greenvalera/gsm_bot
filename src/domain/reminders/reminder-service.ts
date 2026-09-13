import { randomUUID } from "node:crypto";
import { ChatCoordinator } from "../../shared/chat-coordinator.js";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { SafeLogger } from "../../shared/logger.js";
import { civilNow } from "../../infrastructure/time/zoned-clock.js";
import { isoDate, mondayOf } from "../../infrastructure/time/civil.js";

export type ReminderMessage = Readonly<{ chatId: bigint; targetWeek: string }>;
export type ReminderTransport = (
  message: ReminderMessage,
) => Promise<{ messageId: number }>;
type Dependencies = {
  prisma: PrismaClient;
  now: () => Date;
  logger: SafeLogger;
  transport: ReminderTransport;
  coordinator?: ChatCoordinator;
};

/** The committed reservation is consumed even when the HTTP result is unknowable. */
export class ReminderService {
  private readonly coordinator: ChatCoordinator;
  private stopped = false;
  private readonly active = new Set<Promise<void>>();
  constructor(private readonly deps: Dependencies) {
    this.coordinator = deps.coordinator ?? new ChatCoordinator();
  }

  async reconcile(chatId?: bigint): Promise<void> {
    if (this.stopped) return;
    // A bounded ledger scan is restart recovery. Calendar generation follows in
    // Plan 04; the queue carries no schedule or recipient authority.
    const rows = await this.deps.prisma.reminderOccurrence.findMany({
      where: {
        ...(chatId === undefined ? {} : { chatId }),
        disposition: "PENDING",
        kind: "PLANNING_START",
        dueAt: { lte: this.deps.now() },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true },
    });
    for (const row of rows) await this.dispatch(row.id);
  }

  async dispatch(occurrenceId: string): Promise<void> {
    if (this.stopped) return;
    const work = this.performDispatch(occurrenceId);
    this.active.add(work);
    try {
      await work;
    } finally {
      this.active.delete(work);
    }
  }

  private async performDispatch(id: string): Promise<void> {
    const { prisma, now, transport, logger } = this.deps;
    const identity = await prisma.reminderOccurrence.findUnique({
      where: { id },
      select: { chatId: true },
    });
    if (!identity || this.stopped) return;
    await this.coordinator.run([`chat:${identity.chatId}`], async () => {
      if (this.stopped) return;
      const reservation = await prisma.$transaction(async (tx) => {
        // Chat state precedes every round lock, including different occurrences.
        await tx.$queryRaw`SELECT chat_id FROM chat_reminder_states WHERE chat_id = ${identity.chatId} FOR UPDATE`;
        const row = await tx.reminderOccurrence.findUnique({ where: { id } });
        if (
          !row ||
          row.disposition !== "PENDING" ||
          row.kind !== "PLANNING_START"
        )
          return null;
        const at = now();
        if (row.dueAt > at) return null;
        const config = await tx.chatConfiguration.findUnique({
          where: { chatId: row.chatId },
          include: { reminderState: true },
        });
        const migration = await tx.chatMigration.findUnique({
          where: { oldChatId: row.chatId },
        });
        const state = config?.reminderState;
        const week = config
          ? isoDate(mondayOf(civilNow(config.timezone, at)))
          : null;
        const activeRound = await tx.planningRound.findFirst({
          where: {
            chatId: row.chatId,
            targetWeekStart: row.scope,
            status: { in: ["DRAFT", "CONFIRMED", "BOOKED"] },
          },
        });
        const obsolete =
          migration ||
          !state ||
          state.generation !== row.generation ||
          row.dueAt <= state.effectiveFrom ||
          row.scope !== week ||
          activeRound ||
          (state.quietUntil && at < state.quietUntil);
        if (obsolete) {
          await tx.reminderOccurrence.update({
            where: { id },
            data: {
              disposition: "OBSOLETE",
              reason: "current-state",
              finishedAt: at,
            },
          });
          return null;
        }
        // Follow-up dispatch is introduced with its authoritative projection in
        // Plan 05. Leave those rows unclaimed until that policy is installed.
        if (row.kind !== "PLANNING_START") return null;
        if (at.getTime() - row.dueAt.getTime() > 2 * 60 * 60 * 1000) {
          await tx.reminderOccurrence.update({
            where: { id },
            data: {
              disposition: "SKIPPED",
              reason: "too-late",
              finishedAt: at,
            },
          });
          return null;
        }
        const attemptId = randomUUID();
        const claimed = await tx.reminderOccurrence.updateMany({
          where: { id, disposition: "PENDING" },
          data: { disposition: "RESERVED", reservedAt: at, attemptId },
        });
        if (!claimed.count) return null;
        await tx.chatReminderState.update({
          where: { chatId: row.chatId },
          data: { lastPlanningAttemptAt: at },
        });
        return { chatId: row.chatId, targetWeek: row.scope, attemptId };
      });
      if (!reservation) return;
      let messageId: number;
      try {
        messageId = (await transport(reservation)).messageId;
      } catch {
        try {
          await prisma.reminderOccurrence.updateMany({
            where: {
              id,
              attemptId: reservation.attemptId,
              disposition: "RESERVED",
            },
            data: {
              disposition: "UNKNOWN",
              finishedAt: now(),
              reason: "transport-unknown",
            },
          });
        } catch {
          /* A consumed RESERVED row is equally non-replayable. */
        }
        logger.warn(
          {
            chatId: reservation.chatId,
            jobId: id,
            reason: "transport-unknown",
          },
          "Reminder delivery uncertain",
        );
        return;
      }
      try {
        await prisma.reminderOccurrence.updateMany({
          where: {
            id,
            attemptId: reservation.attemptId,
            disposition: "RESERVED",
          },
          data: {
            disposition: "SENT",
            messageId,
            finishedAt: now(),
            reason: "accepted",
          },
        });
      } catch {
        logger.error(
          {
            chatId: reservation.chatId,
            jobId: id,
            reason: "outcome-write-failed",
          },
          "Reminder reservation remains consumed",
        );
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    await Promise.allSettled([...this.active]);
  }
}
