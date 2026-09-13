import { randomUUID } from "node:crypto";
import { GrammyError } from "grammy";
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
import {
  enumerateReminderOccurrences,
  coalesceDueOccurrences,
} from "./reminder-occurrences.js";
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

// One polling process is the deployment contract. Share live ownership across
// service instances so recovery never consumes an HTTP call still in flight.
const activeAttempts = new Set<string>();

/** Only an explicit Bot API rejection proves non-delivery. HTTP failures and
 * server failures remain ambiguous; never classify by free-form error text. */
export function classifyReminderDelivery(
  error: unknown,
  at: Date,
): { kind: "unknown" } | { kind: "rejected"; retryAt: Date | null } {
  if (
    !(error instanceof GrammyError) ||
    error.method !== "sendMessage" ||
    !Number.isInteger(error.error_code) ||
    error.error_code < 400 ||
    error.error_code >= 500
  )
    return { kind: "unknown" };
  const seconds = error.parameters.retry_after;
  const retryMs =
    typeof seconds === "number" ? at.getTime() + seconds * 1000 : NaN;
  return {
    kind: "rejected",
    retryAt:
      error.error_code === 429 &&
      Number.isSafeInteger(seconds) &&
      seconds! > 0 &&
      Number.isSafeInteger(retryMs) &&
      retryMs <= 8640000000000000
        ? new Date(retryMs)
        : null,
  };
}

function dueWork(at: Date): Prisma.ReminderOccurrenceWhereInput {
  return {
    OR: [
      { disposition: "PENDING" },
      {
        disposition: "REJECTED",
        retryAt: { not: null },
        OR: [
          { retryAt: { lte: at } },
          { dueAt: { lt: new Date(at.getTime() - 7200000) } },
        ],
      },
    ],
  };
}

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
    if (chatId !== undefined) {
      const migration = await this.deps.prisma.chatMigration.findUnique({
        where: { oldChatId: chatId },
      });
      chatId = migration?.newChatId ?? chatId;
    }
    await this.recoverAbandonedReservations(chatId);
    await this.generateWeekly(chatId);
    if (this.deps.followups) await this.generateFollowups(chatId);
    // The queue carries no schedule or recipient authority.
    const rows = await this.deps.prisma.reminderOccurrence.findMany({
      where: {
        ...(chatId === undefined ? {} : { chatId }),
        ...dueWork(this.deps.now()),
        ...(this.deps.followups ? {} : { kind: "PLANNING_START" as const }),
        dueAt: { lte: this.deps.now() },
      },
      orderBy: [{ dueAt: "desc" }, { id: "desc" }],
      take: 100,
      select: { id: true },
    });
    for (const row of rows) await this.dispatch(row.id);
  }

  async recoverAbandonedReservations(chatId?: bigint): Promise<void> {
    const observed = await this.deps.prisma.reminderOccurrence.findMany({
      where: {
        ...(chatId === undefined ? {} : { chatId }),
        disposition: "RESERVED",
        OR: [
          { attemptId: null },
          { attemptId: { notIn: [...activeAttempts] } },
        ],
      },
      select: { id: true, attemptId: true },
      orderBy: { id: "asc" },
      take: 100,
    });
    const abandoned = observed.filter(
      (row) => !row.attemptId || !activeAttempts.has(row.attemptId),
    );
    if (!abandoned.length) return;
    await this.deps.prisma.reminderOccurrence.updateMany({
      where: { disposition: "RESERVED", OR: abandoned },
      data: {
        disposition: "UNKNOWN",
        finishedAt: this.deps.now(),
        reason: "abandoned-reservation",
      },
    });
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
    const attemptId = randomUUID();
    activeAttempts.add(attemptId);
    const work = this.performDispatch(occurrenceId, attemptId);
    this.active.add(work);
    try {
      await work;
    } finally {
      this.active.delete(work);
      activeAttempts.delete(attemptId);
    }
  }

  private async performDispatch(id: string, attemptId: string): Promise<void> {
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
        if (
          !row ||
          (row.disposition !== "PENDING" && row.disposition !== "REJECTED")
        )
          return null;
        const at = now();
        if (row.dueAt > at) return null;
        if (
          row.disposition === "REJECTED" &&
          (!row.retryAt ||
            (row.retryAt > at && at.getTime() - row.dueAt.getTime() <= 7200000))
        )
          return null;
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
        const eligible = (candidate: typeof row) =>
          !(
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
              dueAt: candidate.dueAt,
              timezone: config.timezone,
              scope: row.scope,
              effectiveFrom: state.effectiveFrom,
              generation: candidate.generation,
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
                    participants: projection.participants,
                  }
                : {}),
            })
          );
        const siblings = await tx.reminderOccurrence.findMany({
          where: {
            chatId: row.chatId,
            kind: row.kind,
            scope: row.scope,
            ...dueWork(at),
            dueAt: { lte: at },
          },
        });
        // Original scheduled spacing must remain suppressed even if this scan
        // happens much later; actual-now spacing also protects competing claims.
        const spacingBlocked = siblings.filter(
          (c) =>
            eligible(c) &&
            round?.lastReminderAttemptAt &&
            (c.dueAt.getTime() - round.lastReminderAttemptAt.getTime() <
              1800000 ||
              at.getTime() - round.lastReminderAttemptAt.getTime() < 1800000),
        );
        const blockedIds = new Set(spacingBlocked.map((c) => c.id));
        const selection = coalesceDueOccurrences(
          siblings
            .filter((c) => !blockedIds.has(c.id))
            .map((c) => ({
              id: c.id,
              dueAt: c.dueAt,
              eligible: eligible(c),
            })),
          at,
        );
        for (const [ids, disposition, reason] of [
          [selection.obsoleteIds, "OBSOLETE", "current-state"],
          [selection.skippedIds, "SKIPPED", "too-late"],
          [[...blockedIds], "SKIPPED", "spacing"],
          [selection.coalescedIds, "COALESCED", "latest-eligible"],
        ] as const) {
          if (ids.length)
            await tx.reminderOccurrence.updateMany({
              where: { id: { in: [...ids] }, ...dueWork(at) },
              data: { disposition, reason, finishedAt: at },
            });
        }
        if (selection.selectedId !== id) return null;
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
          where: { id, disposition: row.disposition, attemptId: row.attemptId },
          data: {
            disposition: "RESERVED",
            reservedAt: at,
            attemptId,
            retryAt: null,
            finishedAt: null,
            reason: null,
            previousSpacingAt: round
              ? round.lastReminderAttemptAt
              : state!.lastPlanningAttemptAt,
          },
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
        if (!Number.isSafeInteger(messageId) || messageId <= 0)
          throw new Error("Invalid message acknowledgment");
      } catch (error) {
        const outcome = classifyReminderDelivery(error, now());
        try {
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT chat_id FROM chat_reminder_states WHERE chat_id = ${reservation.chatId} FOR UPDATE`;
            const row = await tx.reminderOccurrence.findUnique({
              where: { id },
            });
            if (
              !row ||
              row.disposition !== "RESERVED" ||
              row.attemptId !== reservation.attemptId
            )
              return;
            if (row.roundId) {
              await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${row.roundId}, 0))`;
              await tx.$queryRaw`SELECT id FROM planning_rounds WHERE id = ${row.roundId} FOR UPDATE`;
            }
            await tx.reminderOccurrence.update({
              where: { id },
              data: {
                disposition:
                  outcome.kind === "rejected" ? "REJECTED" : "UNKNOWN",
                finishedAt: now(),
                reason:
                  outcome.kind === "rejected"
                    ? "telegram-rejected"
                    : "transport-unknown",
                retryAt: outcome.kind === "rejected" ? outcome.retryAt : null,
              },
            });
            if (outcome.kind !== "rejected" || !row.reservedAt) return;
            // A delayed result must not roll back a newer possibly delivered
            // attempt, even when its clock timestamp equals this reservation.
            const newer = await tx.reminderOccurrence.findFirst({
              where: {
                id: { not: id },
                chatId: row.chatId,
                kind: row.kind,
                scope: row.scope,
                disposition: { in: ["RESERVED", "SENT", "UNKNOWN"] },
                reservedAt: { gte: row.reservedAt },
              },
            });
            if (newer) return;
            if (row.roundId)
              await tx.planningRound.updateMany({
                where: {
                  id: row.roundId,
                  lastReminderAttemptAt: row.reservedAt,
                },
                data: { lastReminderAttemptAt: row.previousSpacingAt },
              });
            else
              await tx.chatReminderState.updateMany({
                where: {
                  chatId: row.chatId,
                  lastPlanningAttemptAt: row.reservedAt,
                },
                data: { lastPlanningAttemptAt: row.previousSpacingAt },
              });
          });
        } catch {
          /* A consumed RESERVED row is equally non-replayable. */
        }
        logger.warn(
          {
            chatId: reservation.chatId,
            jobId: id,
            reason:
              outcome.kind === "rejected"
                ? "telegram-rejected"
                : "transport-unknown",
          },
          "Reminder delivery failed",
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
