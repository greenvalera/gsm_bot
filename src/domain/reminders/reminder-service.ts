import { randomUUID } from "node:crypto";
import {
  createCallbackToken,
  createReminderStartTarget,
} from "../../shared/callback-schema.js";
import { addDays, parseCivilDate } from "../../infrastructure/time/civil.js";
import { resolveWallClock } from "../../infrastructure/time/zoned-clock.js";
import { ChatCoordinator } from "../../shared/chat-coordinator.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";
import type { SafeLogger } from "../../shared/logger.js";
import { civilNow } from "../../infrastructure/time/zoned-clock.js";
import { isoDate, mondayOf } from "../../infrastructure/time/civil.js";
import { enumerateReminderOccurrences } from "./reminder-occurrences.js";
import { evaluateReminderEligibility } from "./reminder-policy.js";

type ScheduleTransaction = Pick<
  Prisma.TransactionClient,
  "chatReminderState" | "chatConfiguration" | "reminderOccurrence"
>;

/** Setup/save own the enclosing transaction and callback consumption. */
export async function activateReminderSchedule(
  tx: ScheduleTransaction,
  chatId: bigint,
  now: Date,
) {
  await tx.chatReminderState.upsert({
    where: { chatId },
    create: { chatId, effectiveFrom: now },
    update: {},
  });
}

/** First valid wall minute after a civil week boundary, including midnight gaps. */
function quietBoundary(timezone: string, week: string): Date {
  const monday = addDays(parseCivilDate(week)!, 7);
  for (let day = 0; day < 2; day++) {
    const date = addDays(monday, day);
    for (let minute = 0; minute < 1440; minute++) {
      const resolved = resolveWallClock(
        timezone,
        date.year,
        date.month,
        date.day,
        minute,
      );
      if (resolved.kind !== "skipped") return new Date(resolved.instantMs);
    }
  }
  throw new Error("Cannot resolve reminder quiet boundary");
}

export async function changeReminderSchedule(
  tx: ScheduleTransaction,
  chatId: bigint,
  now: Date,
) {
  const state = await tx.chatReminderState.findUnique({ where: { chatId } });
  if (!state) return activateReminderSchedule(tx, chatId, now);
  const config = await tx.chatConfiguration.findUniqueOrThrow({
    where: { chatId },
  });
  // Keep the original cancelled civil week and never shorten its instant boundary.
  const boundary =
    state.quietWeekStart === null
      ? null
      : quietBoundary(
          config.timezone,
          state.quietWeekStart.toISOString().slice(0, 10),
        );
  await tx.chatReminderState.update({
    where: { chatId },
    data: {
      generation: { increment: 1 },
      effectiveFrom: now,
      ...(boundary && (!state.quietUntil || boundary > state.quietUntil)
        ? { quietUntil: boundary }
        : {}),
    },
  });
  await tx.reminderOccurrence.updateMany({
    where: {
      chatId,
      generation: { lte: state.generation },
      disposition: { in: ["PENDING", "REJECTED"] },
    },
    data: {
      disposition: "OBSOLETE",
      finishedAt: now,
      reason: "schedule-changed",
    },
  });
}

export type ReminderMessage = Readonly<{
  chatId: bigint;
  targetWeek: string;
  callbackData: string;
}>;
export type ReminderTransport = (
  message: ReminderMessage,
) => Promise<{ messageId: number }>;
type Dependencies = {
  prisma: PrismaClient;
  botUserId: bigint;
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
    await this.generateWeekly(chatId);
    // The queue carries no schedule or recipient authority.
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

  private async generateWeekly(chatId?: bigint): Promise<void> {
    const { prisma, now } = this.deps;
    const at = now();
    let cursor: bigint | undefined;
    // Keyset pages bound memory and do not starve chats beyond the first batch.
    while (!this.stopped) {
      const configs = await prisma.chatConfiguration.findMany({
        where: {
          ...(chatId === undefined ? {} : { chatId }),
          ...(cursor === undefined ? {} : { chatId: { gt: cursor } }),
          reminderState: { isNot: null },
        },
        orderBy: { chatId: "asc" },
        take: 100,
        include: { reminderState: true },
      });
      for (const config of configs) {
        const state = config.reminderState!;
        const week = isoDate(mondayOf(civilNow(config.timezone, at)));
        const [migration, rounds] = await Promise.all([
          prisma.chatMigration.findUnique({
            where: { oldChatId: config.chatId },
          }),
          prisma.planningRound.findMany({
            where: {
              chatId: config.chatId,
              targetWeekStart: week,
              status: { in: ["DRAFT", "CONFIRMED", "BOOKED"] },
            },
            select: { status: true },
          }),
        ]);
        const candidates = enumerateReminderOccurrences({
          chatId: config.chatId,
          kind: "PLANNING_START",
          generation: state.generation,
          timezone: config.timezone,
          effectiveFrom: state.effectiveFrom,
          now: at,
        });
        for (const candidate of candidates) {
          if (
            !evaluateReminderEligibility({
              ...candidate,
              now: candidate.dueAt > at ? candidate.dueAt : at,
              timezone: config.timezone,
              effectiveFrom: state.effectiveFrom,
              currentGeneration: state.generation,
              migrated: !!migration,
              activeDraft: rounds.some((r) => r.status === "DRAFT"),
              claimedWeek: rounds.some((r) => r.status !== "DRAFT"),
              quietUntil: state.quietUntil,
            })
          )
            continue;
          // The exact unique civil identity is immutable; rebuilding wakeups never
          // resets a consumed occurrence. Reservation reloads any concurrent edit.
          const identity = {
            ...candidate,
            civilDate: new Date(candidate.civilDate),
          };
          await prisma.reminderOccurrence.createMany({
            data: [identity],
            skipDuplicates: true,
          });
        }
      }
      if (chatId !== undefined || configs.length < 100) return;
      cursor = configs.at(-1)!.chatId;
    }
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
        const activeRound = await tx.planningRound.findFirst({
          where: {
            chatId: row.chatId,
            targetWeekStart: row.scope,
            status: { in: ["DRAFT", "CONFIRMED", "BOOKED"] },
          },
        });
        const obsolete =
          !config ||
          !state ||
          !evaluateReminderEligibility({
            kind: row.kind,
            now: at,
            dueAt: row.dueAt,
            timezone: config.timezone,
            scope: row.scope,
            effectiveFrom: state.effectiveFrom,
            generation: row.generation,
            currentGeneration: state.generation,
            migrated: !!migration,
            activeDraft: activeRound?.status === "DRAFT",
            claimedWeek: !!activeRound && activeRound.status !== "DRAFT",
            quietUntil: state.quietUntil,
          });
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
        const targetId = createReminderStartTarget(id, row.scope);
        let capability = await tx.callbackAction.findFirst({
          where: { chatId: row.chatId, kind: "PLANNING", targetId },
        });
        if (!capability) {
          const end = addDays(parseCivilDate(row.scope), 7);
          const boundary = resolveWallClock(
            config!.timezone,
            end.year,
            end.month,
            end.day,
            0,
          );
          // A midnight gap expires conservatively before the boundary, never into next week.
          const expiresAt = new Date(
            boundary.kind === "skipped"
              ? Date.UTC(end.year, end.month - 1, end.day) - 24 * 3600000
              : boundary.instantMs,
          );
          capability = await tx.callbackAction.create({
            data: {
              token: createCallbackToken(),
              kind: "PLANNING",
              chatId: row.chatId,
              actorUserId: this.deps.botUserId,
              targetId,
              expiresAt,
            },
          });
        }
        return {
          chatId: row.chatId,
          targetWeek: row.scope,
          callbackData: capability.token,
          attemptId,
        };
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
