import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { civilNow } from "../../infrastructure/time/zoned-clock.js";
import {
  createCallbackToken,
  createPlanningTarget,
  parsePlanningTarget,
  type PlanningTargetAction,
} from "../../shared/callback-schema.js";
import { generateSlots } from "./slot-generator.js";
import { targetWeekStart, weekDates, weekIsClaimed } from "./target-week.js";

type PlanningPersistence = Pick<
  PrismaClient,
  | "$transaction"
  | "callbackAction"
  | "planningRound"
  | "planningParticipant"
  | "chatConfiguration"
  | "chatMembership"
>;

export type PlanningRound = NonNullable<
  Awaited<ReturnType<PrismaClient["planningRound"]["findUnique"]>>
>;

/** Every planning callback action (day, time, back, confirm) shares this lifetime. */
export const PLANNING_ACTION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * How long an author's silence makes a round eligible for administrator
 * takeover (AUTH-03). Mirrors the Phase 1 `DRAFT_LIFETIME_MS` /
 * `ROSTER_ACTION_LIFETIME_MS` constants. Declared here; consumed by the
 * takeover surface.
 */
export const PLANNING_INACTIVITY_MS = 30 * 60 * 1000;

/** One minted callback action: the opaque wire token and the target it stands for. */
export type MintedPlanningAction = Readonly<{
  token: string;
  target: PlanningTargetAction;
}>;

export type StartOrResumeResult =
  | Readonly<{
      kind: "started" | "resumed";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  | Readonly<{ kind: "unconfigured" | "week-taken" | "failed" }>;

export type SelectDayResult =
  | Readonly<{
      kind: "advanced";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  | Readonly<{ kind: "duplicate" | "stale" | "not-author" | "failed" }>;

export type SetAnchorResult = Readonly<{
  kind: "anchored" | "stale" | "failed";
}>;

/** PostgreSQL refused the insert because the chat already has a live round. */
function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function actionExpiresAt(now: Date) {
  return new Date(now.getTime() + PLANNING_ACTION_LIFETIME_MS);
}

/**
 * The durable rehearsal-planning process.
 *
 * Every method takes an injected `now` and returns a closed `kind` union rather
 * than throwing to the handler, so a Telegram surface never has to interpret an
 * exception to decide what to say. Nothing in this service reads `Date.now()`:
 * the week arithmetic and the DST behaviour are only deterministically testable
 * if the clock arrives from outside.
 */
export class PlanningService {
  constructor(private readonly prisma: PlanningPersistence) {}

  /**
   * The callback actions the round's CURRENT step needs, as a target list.
   *
   * Derived from the round's OWN target week and its OWN schedule snapshot —
   * never from the live `ChatConfiguration` — so a settings edit landing
   * mid-round cannot change the buttons on a card that is already on screen
   * (threat T-02-11).
   */
  private stepTargets(round: PlanningRound): readonly PlanningTargetAction[] {
    if (round.step === PlanningStep.DAY) {
      return weekDates(round.targetWeekStart).map((date) => ({
        action: "day" as const,
        roundId: round.id,
        date,
      }));
    }
    if (round.step === PlanningStep.TIME) {
      return generateSlots(round).map((slot) => ({
        action: "time" as const,
        roundId: round.id,
        startMinute: slot.startMinute,
      }));
    }
    return [];
  }

  /**
   * Mints this step's callback actions in ONE `createMany`, inside the same
   * transaction that wrote the step transition.
   *
   * Every row is bound to the chat, to the round's AUTHOR (not to whoever
   * happened to trigger the render) and to an expiry. The target carries the
   * date or minute; the wire token carries nothing.
   */
  async mintStepActions(
    tx: Prisma.TransactionClient,
    round: PlanningRound,
    now: Date,
  ): Promise<readonly MintedPlanningAction[]> {
    const minted = this.stepTargets(round).map((target) => ({
      token: createCallbackToken(),
      target,
    }));
    if (minted.length === 0) return minted;
    await tx.callbackAction.createMany({
      data: minted.map((action) => ({
        token: action.token,
        kind: CallbackActionKind.PLANNING,
        chatId: round.chatId,
        actorUserId: round.authorUserId,
        targetId: createPlanningTarget(action.target),
        expiresAt: actionExpiresAt(now),
      })),
    });
    return minted;
  }

  /**
   * Starts a round for the chat's target week, or resumes the author's own
   * live one.
   *
   * Resume comes FIRST and never recomputes the week (Pitfall 6): an author who
   * started on Sunday and returns on Monday must find the same card, not a card
   * for a different week. A live round belonging to SOMEONE ELSE is refused
   * rather than resumed — that is PLAN-02's "one active process per chat and
   * week", and the database enforces the same rule underneath via
   * `@@unique([chatId, activeWeekStart])`. `sequentialize` only narrows the
   * race window; the constraint is the guarantee.
   */
  async startOrResume(
    chatId: bigint,
    actorId: bigint,
    now: Date,
  ): Promise<StartOrResumeResult> {
    try {
      const configuration = await this.prisma.chatConfiguration.findUnique({
        where: { chatId },
      });
      if (configuration === null) return { kind: "unconfigured" };

      return await this.prisma.$transaction(async (tx) => {
        const live = await tx.planningRound.findFirst({
          where: { chatId, status: PlanningRoundStatus.DRAFT },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (live !== null) {
          if (live.authorUserId !== actorId) return { kind: "week-taken" };
          const actions = await this.mintStepActions(tx, live, now);
          return { kind: "resumed", round: live, actions };
        }

        const claiming = await tx.planningRound.findMany({
          where: { chatId, status: PlanningRoundStatus.CONFIRMED },
          select: { status: true, targetWeekStart: true },
        });
        const weekStart = targetWeekStart(
          civilNow(configuration.timezone, now),
          (candidate) => weekIsClaimed(claiming, candidate),
        );
        const round = await tx.planningRound.create({
          data: {
            chatId,
            authorUserId: actorId,
            targetWeekStart: weekStart,
            // Set together with `status` in this one transaction, and nulled
            // together with it on every later transition. The pair encodes
            // "active" in two places and must never disagree.
            activeWeekStart: weekStart,
            status: PlanningRoundStatus.DRAFT,
            step: PlanningStep.DAY,
            timezone: configuration.timezone,
            durationMinutes: configuration.durationMinutes,
            dailyStartMinute: configuration.dailyStartMinute,
            dailyEndMinute: configuration.dailyEndMinute,
            lastActivityAt: now,
          },
        });
        const actions = await this.mintStepActions(tx, round, now);
        return { kind: "started", round, actions };
      });
    } catch (error) {
      return isUniqueViolation(error)
        ? { kind: "week-taken" }
        : { kind: "failed" };
    }
  }

  /**
   * Consumes one day action exactly once and advances the round to the time
   * step.
   *
   * The ordering below is the Phase 1 exactly-once template and must be
   * preserved: re-validate the row's kind, chat and expiry, report `duplicate`
   * on an already-consumed row, parse the target, consume with
   * `updateMany ... consumedAt: null` asserting `count === 1`, and only then
   * mutate the round under an expected-revision guard asserting `count === 1`.
   *
   * The actor comparison the boundary deferred is resolved HERE, from
   * `PlanningRound.authorUserId` — a durable column, never a token claim.
   */
  async selectDay(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<SelectDayResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.PLANNING ||
          action.chatId !== chatId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parsePlanningTarget(action.targetId);
        if (!target.success || target.data.action !== "day")
          return { kind: "stale" };

        const round = await tx.planningRound.findUnique({
          where: { id: target.data.roundId },
        });
        if (
          round === null ||
          round.chatId !== chatId ||
          round.status !== PlanningRoundStatus.DRAFT ||
          round.step !== PlanningStep.DAY
        )
          return { kind: "stale" };
        if (round.authorUserId !== actorId) return { kind: "not-author" };
        // A syntactically valid date from outside this round's own target week
        // is refused, never applied: the round decides which week it is for.
        if (!weekDates(round.targetWeekStart).includes(target.data.date))
          return { kind: "stale" };

        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };

        const advanced = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            revision: round.revision,
            status: PlanningRoundStatus.DRAFT,
            step: PlanningStep.DAY,
          },
          data: {
            step: PlanningStep.TIME,
            selectedDate: target.data.date,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (advanced.count !== 1) return { kind: "stale" };

        const updated = await tx.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        const actions = await this.mintStepActions(tx, updated, now);
        return { kind: "advanced", round: updated, actions };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  /**
   * Records which message is the round's single anchor card (D-01).
   *
   * Guarded by `expectedRevision` like every other transition, so a delivery
   * that resolved after a concurrent step change cannot re-point the anchor at
   * a superseded message.
   */
  async setAnchor(
    roundId: string,
    messageId: number,
    expectedRevision: number,
    now: Date,
  ): Promise<SetAnchorResult> {
    try {
      const anchored = await this.prisma.planningRound.updateMany({
        where: { id: roundId, revision: expectedRevision },
        data: {
          anchorMessageId: messageId,
          lastActivityAt: now,
          revision: { increment: 1 },
        },
      });
      return anchored.count === 1 ? { kind: "anchored" } : { kind: "stale" };
    } catch {
      return { kind: "failed" };
    }
  }
}
