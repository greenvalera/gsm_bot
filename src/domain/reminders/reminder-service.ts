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
import { availabilityStepProjection } from "../planning/planning-service.js";
import {
  renderFollowupReminder,
  type FollowupChat,
  type FollowupRendered,
} from "../../telegram/reminder-renderers.js";

type ScheduleTransaction = Pick<
  Prisma.TransactionClient,
  "chatReminderState" | "chatConfiguration" | "reminderOccurrence"
>;

/** An unblock resumes future scheduled work, including when no worker observed
 * the blocked due time. Materialize the bounded recovery window as suppressed.
 * Caller holds chat state then round coordination in its answer transaction.
 */
export async function suppressPastRoundReminders(
  tx: ScheduleTransaction,
  chatId: bigint,
  roundId: string,
  now: Date,
) {
  const config = await tx.chatConfiguration.findUnique({ where: { chatId } });
  const state = await tx.chatReminderState.findUnique({ where: { chatId } });
  if (!config || !state) return;
  const due = enumerateReminderOccurrences({
    chatId,
    kind: "FOLLOW_UP",
    roundId,
    generation: state.generation,
    timezone: config.timezone,
    effectiveFrom: state.effectiveFrom,
    now,
    minutes: config.reminderMinutes,
  }).filter((c) => c.dueAt <= now);
  await tx.reminderOccurrence.createMany({
    data: due.map((c) => ({
      ...c,
      civilDate: new Date(c.civilDate),
      disposition: "OBSOLETE" as const,
      finishedAt: now,
      reason: "blocked-before-resume",
    })),
    skipDuplicates: true,
  });
  await tx.reminderOccurrence.updateMany({
    where: {
      roundId,
      dueAt: { lte: now },
      disposition: { in: ["PENDING", "REJECTED"] },
    },
    data: {
      disposition: "OBSOLETE",
      finishedAt: now,
      reason: "blocked-before-resume",
    },
  });
}

export async function invalidateRoundReminders(
  tx: ScheduleTransaction,
  roundId: string,
  now: Date,
) {
  await tx.reminderOccurrence.updateMany({
    where: { roundId, disposition: { in: ["PENDING", "REJECTED"] } },
    data: {
      disposition: "OBSOLETE",
      finishedAt: now,
      reason: "round-terminal",
    },
  });
}

export async function silenceCancelledWeek(
  tx: ScheduleTransaction,
  chatId: bigint,
  targetWeek: string,
  now: Date,
) {
  const config = await tx.chatConfiguration.findUniqueOrThrow({
    where: { chatId },
  });
  const week = isoDate(mondayOf(civilNow(config.timezone, now)));
  if (targetWeek !== week) return;
  await activateReminderSchedule(tx, chatId, now);
  const state = await tx.chatReminderState.findUniqueOrThrow({
    where: { chatId },
  });
  const boundary = quietBoundary(config.timezone, week);
  await tx.chatReminderState.update({
    where: { chatId },
    data: {
      quietWeekStart: new Date(week),
      quietUntil:
        state.quietUntil && state.quietUntil > boundary
          ? state.quietUntil
          : boundary,
    },
  });
  await tx.reminderOccurrence.updateMany({
    where: {
      chatId,
      kind: "PLANNING_START",
      scope: week,
      disposition: { in: ["PENDING", "REJECTED"] },
    },
    data: {
      disposition: "OBSOLETE",
      finishedAt: now,
      reason: "cancelled-week",
    },
  });
}

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
  followups?: {
    getChat: (chatId: bigint) => Promise<FollowupChat>;
    send: (
      message: FollowupRendered & { chatId: bigint },
    ) => Promise<{ messageId: number }>;
  };
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
    if (this.deps.followups) await this.generateFollowups(chatId);
    // The queue carries no schedule or recipient authority.
    const rows = await this.deps.prisma.reminderOccurrence.findMany({
      where: {
        ...(chatId === undefined ? {} : { chatId }),
        disposition: "PENDING",
        ...(this.deps.followups ? {} : { kind: "PLANNING_START" as const }),
        dueAt: { lte: this.deps.now() },
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true },
    });
    for (const row of rows) await this.dispatch(row.id);
  }

  private async generateFollowups(chatId?: bigint): Promise<void> {
    const { prisma, now } = this.deps;
    const at = now();
    let cursor: string | undefined;
    while (!this.stopped) {
      const rounds = await prisma.planningRound.findMany({
        where: {
          ...(chatId === undefined ? {} : { chatId }),
          ...(cursor === undefined ? {} : { id: { gt: cursor } }),
          status: "CONFIRMED",
          startsAt: { gt: at },
        },
        orderBy: { id: "asc" },
        take: 100,
      });
      for (const round of rounds) {
        const config = await prisma.chatConfiguration.findUnique({
          where: { chatId: round.chatId },
          include: { reminderState: true },
        });
        const state = config?.reminderState;
        if (!config || !state) continue;
        const candidates = enumerateReminderOccurrences({
          chatId: round.chatId,
          kind: "FOLLOW_UP",
          generation: state.generation,
          timezone: config.timezone,
          effectiveFrom: state.effectiveFrom,
          now: at,
          minutes: config.reminderMinutes,
          roundId: round.id,
          startsAt: round.startsAt!,
        });
        // Persist even currently blocked due times. Dispatch consumes suppression,
        // so unblocking cannot reconstruct a historically suppressed occurrence.
        await prisma.reminderOccurrence.createMany({
          data: candidates.map((c) => ({
            ...c,
            civilDate: new Date(c.civilDate),
          })),
          skipDuplicates: true,
        });
      }
      if (rounds.length < 100) return;
      cursor = rounds.at(-1)!.id;
    }
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
      select: { chatId: true, kind: true },
    });
    if (!identity || this.stopped) return;
    await this.coordinator.run([`chat:${identity.chatId}`], async () => {
      if (this.stopped) return;
      if (identity.kind === "FOLLOW_UP" && !this.deps.followups) return;
      const chat =
        identity.kind === "FOLLOW_UP"
          ? await this.deps.followups!.getChat(identity.chatId)
          : null;
      const reservation = await prisma.$transaction(async (tx) => {
        // Chat state precedes every round lock, including different occurrences.
        await tx.$queryRaw`SELECT chat_id FROM chat_reminder_states WHERE chat_id = ${identity.chatId} FOR UPDATE`;
        const row = await tx.reminderOccurrence.findUnique({ where: { id } });
        if (!row || row.disposition !== "PENDING") return null;
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
        if (row.roundId) {
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${row.roundId}, 0))`;
          await tx.$queryRaw`SELECT id FROM planning_rounds WHERE id = ${row.roundId} FOR UPDATE`;
        }
        const round =
          row.kind === "FOLLOW_UP" && row.roundId
            ? await tx.planningRound.findUnique({
                where: { id: row.roundId },
                include: {
                  participants: {
                    include: {
                      membership: { include: { telegramUser: true } },
                    },
                  },
                },
              })
            : null;
        const projection = round
          ? availabilityStepProjection(
              round,
              round.participants.map((p) => ({
                telegramUserId: p.telegramUserId,
                firstName: p.membership.telegramUser.firstName,
                lastName: p.membership.telegramUser.lastName,
                username: p.membership.telegramUser.username,
                availability: p.availability,
              })),
            )
          : null;
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
          (row.kind === "FOLLOW_UP" &&
            (!round ||
              round.chatId !== row.chatId ||
              round.id !== row.scope ||
              !round.anchorMessageId ||
              !round.availabilityAnchorAcknowledgedAt ||
              chat?.id !== row.chatId)) ||
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
            ...(round && projection
              ? {
                  status: round.status,
                  startsAt: round.startsAt,
                  firstPublishedAt: round.firstAvailabilityPublishedAt,
                  graceRestartAt: round.reminderGraceRestartAt,
                  lastAttemptAt: round.lastReminderAttemptAt,
                  participants: projection.participants,
                }
              : {}),
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
        const rendered =
          round && projection && chat
            ? renderFollowupReminder({
                ...projection,
                timezone: round.timezone,
                chat,
                anchorMessageId: round.anchorMessageId!,
              })
            : null;
        if (rendered && rendered.kind !== "ready") {
          await tx.reminderOccurrence.update({
            where: { id },
            data: {
              disposition: "SKIPPED",
              finishedAt: at,
              reason: rendered.kind,
            },
          });
          logger.warn(
            { chatId: row.chatId, jobId: id, reason: rendered.kind },
            "Reminder cannot be rendered",
          );
          return null;
        }
        const claimed = await tx.reminderOccurrence.updateMany({
          where: { id, disposition: "PENDING" },
          data: { disposition: "RESERVED", reservedAt: at, attemptId },
        });
        if (!claimed.count) return null;
        if (round && rendered?.kind === "ready") {
          await tx.planningRound.update({
            where: { id: round.id },
            data: { lastReminderAttemptAt: at },
          });
          return {
            kind: "FOLLOW_UP" as const,
            rendered,
            chatId: row.chatId,
            attemptId,
          };
        }
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
          kind: "PLANNING_START" as const,
          chatId: row.chatId,
          targetWeek: row.scope,
          callbackData: capability.token,
          attemptId,
        };
      });
      if (!reservation) return;
      let messageId: number;
      try {
        messageId = (
          await (reservation.kind === "FOLLOW_UP"
            ? this.deps.followups!.send({
                ...reservation.rendered,
                chatId: reservation.chatId,
              })
            : transport(reservation))
        ).messageId;
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
