import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import {
  isoDate,
  isoWeekdayOf,
  parseCivilDate,
  weekdayOf,
  type CivilDate,
  type IsoWeekday,
} from "../../infrastructure/time/civil.js";
import { civilNow } from "../../infrastructure/time/zoned-clock.js";
import {
  createCallbackToken,
  createPlanningTarget,
  parsePlanningTarget,
  type PlanningTargetAction,
} from "../../shared/callback-schema.js";
import { WEEKDAY_LABELS } from "../chat/types.js";
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
  | Readonly<{
      kind: "duplicate" | "stale" | "not-author" | "past-day" | "failed";
    }>;

/**
 * What, if anything, one day of the target week is worth pointing out.
 *
 * A single value per day rather than a set of flags, so the D-08 tie rule
 * ("when the configured default and the previous rehearsal coincide, only the
 * default marker is shown") is structural: there is nowhere to put a second
 * marker even if a later edit wanted one.
 */
export type DayMarker = "past" | "default" | "previous" | "none";

/** One offerable day of the target week, ready to render. */
export type DayStepCell = Readonly<{
  date: CivilDate;
  isoDate: string;
  weekdayLabel: string;
  dayOfMonth: number;
  marker: DayMarker;
}>;

/** The seven days a day card shows, always seven and always Monday first. */
export type DayStepProjection = Readonly<{
  weekStart: string;
  days: readonly DayStepCell[];
}>;

export type DayStepInput = Readonly<{
  targetWeekStart: string;
  /** The chat-local civil date, from `civilNow(round.timezone, now)`. */
  today: CivilDate;
  /** `ChatConfiguration.defaultWeekday`: 1..7 with MON=1, or null if unknown. */
  defaultWeekday: number | null;
  /**
   * The previous rehearsal's CHAT-LOCAL date, or null when there is none.
   *
   * Its WEEKDAY is what reaches the card; the date itself only decides whether
   * the marker is suppressed. See `previousRehearsalWeekday`.
   */
  previousRehearsalDate: string | null;
}>;

/**
 * Whether a day of the target week is already behind the chat.
 *
 * A whole-day comparison in civil values: `"YYYY-MM-DD"` sorts
 * lexicographically exactly as it sorts chronologically, so no `Intl` DST
 * resolution is needed to answer it and none is performed.
 */
export function isPastDay(day: string, today: CivilDate): boolean {
  return day < isoDate(today);
}

/**
 * Which ISO weekday of the target week, if any, the previous-rehearsal marker
 * points at.
 *
 * WEEKDAY, not date. "You last played on a Thursday" is advice about a weekday,
 * so it marks the Thursday of the week being planned. Exact-date equality was
 * the original rule and it was effectively unreachable: a previous rehearsal is
 * by definition already behind the chat, so a date inside the target week is
 * caught by `past` first, and a date outside it matched no day at all. The
 * marker could only ever fire in the one case where the band had already
 * rehearsed earlier TODAY and was planning again inside the same week.
 *
 * SUPPRESSED when the previous rehearsal's own date falls INSIDE the target
 * week: flagging a day of the very week you are choosing from as "what you did
 * last time" reads as confusion rather than as advice.
 */
function previousRehearsalWeekday(
  previousRehearsalDate: string | null,
  week: readonly string[],
): IsoWeekday | null {
  if (previousRehearsalDate === null) return null;
  if (week.includes(previousRehearsalDate)) return null;
  return isoWeekdayOf(parseCivilDate(previousRehearsalDate));
}

/**
 * The ONE ordered decision that classifies a day.
 *
 * Order is load-bearing: past beats everything (a day nobody can pick should
 * not advertise itself as the usual one), and the configured default beats the
 * previous rehearsal, which is D-08's tie rule. Both hints are compared on the
 * same axis — the day's ISO weekday — so the tie is a genuine collision the
 * order resolves, not two rules that happen never to meet.
 */
function classifyDay(
  day: string,
  date: CivilDate,
  today: CivilDate,
  defaultWeekday: number | null,
  previousWeekday: IsoWeekday | null,
): DayMarker {
  if (isPastDay(day, today)) return "past";
  const weekday = isoWeekdayOf(date);
  if (defaultWeekday !== null && weekday === defaultWeekday) return "default";
  if (previousWeekday !== null && weekday === previousWeekday)
    return "previous";
  return "none";
}

/**
 * The day card's projection: pure, total, and always seven days long.
 *
 * There is no input under which this returns an empty or partial list. A week
 * entirely in the past still yields seven cells, every one of them `past` —
 * hiding them would make the card's shape change with the day of the week,
 * which is exactly what 02-CONTEXT.md rejects (D-05).
 */
export function buildDayStepProjection(input: DayStepInput): DayStepProjection {
  const week = weekDates(input.targetWeekStart);
  const previousWeekday = previousRehearsalWeekday(
    input.previousRehearsalDate,
    week,
  );
  const days = week.map((day) => {
    const date = parseCivilDate(day);
    return {
      date,
      isoDate: day,
      weekdayLabel: WEEKDAY_LABELS[weekdayOf(date)],
      dayOfMonth: date.day,
      marker: classifyDay(
        day,
        date,
        input.today,
        input.defaultWeekday,
        previousWeekday,
      ),
    };
  });
  return { weekStart: input.targetWeekStart, days };
}

/** The chat-local date a confirmed round's rehearsal actually started on. */
function rehearsalDate(round: PlanningRound | null): string | null {
  if (round === null || round.startsAt === null) return null;
  return isoDate(civilNow(round.timezone, round.startsAt));
}

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
   * The chat's previous rehearsal, as ONE named function.
   *
   * Phase 2 has no booked-rehearsal record yet, so "the previous rehearsal" is
   * the most recent CONFIRMED round whose start is already behind `now`
   * (assumption A1, confirmed at the 02-01 checkpoint). Phase 4's LIFE-05
   * narrows this to a booked rehearsal by changing THIS function and nothing
   * else: no call site restates the query, so there is exactly one definition
   * of "the previous rehearsal" to change.
   */
  async previousRehearsal(
    chatId: bigint,
    now: Date,
  ): Promise<PlanningRound | null> {
    return await this.prisma.planningRound.findFirst({
      where: {
        chatId,
        status: PlanningRoundStatus.CONFIRMED,
        startsAt: { lt: now },
      },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    });
  }

  /**
   * Whether an actor appears in the participant snapshot of ANY confirmed round
   * for the chat — the input to the `PREVIOUS_PARTICIPANTS` broadening policy.
   *
   * Deliberately BROADER than `previousRehearsal()`, and not built from it: the
   * policy admits anyone who has played with this band before, so narrowing it
   * to the single most recent rehearsal would lock out a member who happened to
   * miss that one. The two questions share a status filter and nothing else.
   */
  async wasPreviousParticipant(
    chatId: bigint,
    actorId: bigint,
  ): Promise<boolean> {
    const count = await this.prisma.planningParticipant.count({
      where: {
        telegramUserId: actorId,
        round: { chatId, status: PlanningRoundStatus.CONFIRMED },
      },
    });
    return count > 0;
  }

  /**
   * The seven marked days a round's day card should show.
   *
   * The week and the timezone come from the round's OWN snapshot, so a settings
   * edit landing mid-round cannot move the card (threat T-02-11). Only the
   * marker hints read the live `ChatConfiguration`, and deliberately so: a
   * marker is cosmetic advice about what the band usually does, it selects
   * nothing and is never read back as authority.
   */
  async dayStepProjection(
    round: PlanningRound,
    now: Date,
  ): Promise<DayStepProjection> {
    const configuration = await this.prisma.chatConfiguration.findUnique({
      where: { chatId: round.chatId },
    });
    const previous = await this.previousRehearsal(round.chatId, now);
    return buildDayStepProjection({
      targetWeekStart: round.targetWeekStart,
      today: civilNow(round.timezone, now),
      defaultWeekday: configuration?.defaultWeekday ?? null,
      previousRehearsalDate: rehearsalDate(previous),
    });
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
        // Availability is re-derived at TAP time from the round's own snapshot,
        // never trusted from the render: a card can sit in the chat across
        // midnight, so a day that was offerable when it was drawn may not be
        // offerable when it is pressed (threat T-02-17). The row is left
        // UNCONSUMED so the author can still tap a valid day on the same card.
        if (isPastDay(target.data.date, civilNow(round.timezone, now)))
          return { kind: "past-day" };

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
