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
  mondayOf,
  parseCivilDate,
  weekdayOf,
  type CivilDate,
  type IsoWeekday,
} from "../../infrastructure/time/civil.js";
import type { CurrentTelegramRole } from "../auth/authorization-service.js";
import {
  civilNow,
  resolveWallClock,
} from "../../infrastructure/time/zoned-clock.js";
import {
  createCallbackToken,
  createPlanningTarget,
  parsePlanningTarget,
  type PlanningTargetAction,
} from "../../shared/callback-schema.js";
import type { SafeLogger } from "../../shared/logger.js";
import { WEEKDAY_LABELS, type MinuteOfDay } from "../chat/types.js";
import {
  listActiveMemberships,
  resolveTelegramIdentity,
  type RosterMember,
  type TelegramIdentity,
} from "../roster/roster-service.js";
import {
  generateSlots,
  slotAvailability,
  type SlotWindow,
} from "./slot-generator.js";
import { targetWeekStart, weekDates, weekIsClaimed } from "./target-week.js";

type PlanningPersistence = Pick<
  PrismaClient,
  | "$transaction"
  | "callbackAction"
  | "planningRound"
  | "planningParticipant"
  | "chatConfiguration"
  | "chatStatusCooldown"
  | "chatMembership"
  | "telegramUser"
>;

export type PlanningRound = NonNullable<
  Awaited<ReturnType<PrismaClient["planningRound"]["findUnique"]>>
>;

/** Every planning callback action (day, time, back, confirm) shares this lifetime. */
export const PLANNING_ACTION_LIFETIME_MS = 30 * 60 * 1000;

/**
 * How long an expired callback capability remains available for diagnostics.
 *
 * Measured from EXPIRY, not creation or consumption. Seven days is far beyond
 * the thirty-minute live lifetime, so housekeeping can never remove a button
 * that is still valid or plausibly present on an actionable card.
 */
export const PLANNING_ACTION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How long an author's silence makes a round eligible for administrator
 * takeover (AUTH-03). Mirrors the Phase 1 `DRAFT_LIFETIME_MS` /
 * `ROSTER_ACTION_LIFETIME_MS` constants. Declared here; consumed by the
 * takeover surface.
 */
export const PLANNING_INACTIVITY_MS = 30 * 60 * 1000;

/**
 * How long a chat must wait between status re-posts (assumption A7).
 *
 * D-15 opens `/plan_status` to everyone in the chat, which makes it the only
 * side-effecting command in the phase that no role gates. Without a cooldown it
 * is an unrated flood vector: every request posts a message AND invalidates the
 * card everyone else is looking at (02-RESEARCH.md Pitfall 8). One minute is
 * long enough that a repeat is always a mistake or an attack — the card the
 * requester asked for is still seconds old and still at the bottom of the chat
 * — and short enough that a genuine second burial is answerable.
 */
export const PLANNING_STATUS_COOLDOWN_MS = 60 * 1000;

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
  | Readonly<{
      kind: "unconfigured" | "week-taken" | "no-free-week" | "failed";
    }>;

/**
 * The ONE shape every non-author refusal answers with (D-02).
 *
 * It carries the OWNER's identity rather than a pre-rendered string, because
 * the domain has no business deciding how a person is displayed: the surface
 * runs it through `memberLabel`, the same function the roster card uses, which
 * is what keeps a complete numeric Telegram id out of chat text (threat
 * T-01-21) without planning code ever assembling a name of its own.
 *
 * Shared by every transition, so a new transition cannot invent a weaker
 * refusal: it either returns this or it does not refuse at all.
 */
export type NotAuthorResult = Readonly<{
  kind: "not-author";
  owner: TelegramIdentity;
}>;

export type SelectDayResult =
  | Readonly<{
      kind: "advanced";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  | NotAuthorResult
  | Readonly<{
      kind: "duplicate" | "stale" | "past-day" | "failed";
    }>;

export type SelectTimeResult =
  | Readonly<{
      kind: "advanced";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  | NotAuthorResult
  | Readonly<{
      kind: "duplicate" | "stale" | "past-slot" | "nonexistent-slot" | "failed";
    }>;

export type BackResult =
  | Readonly<{
      kind: "moved";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  | NotAuthorResult
  | Readonly<{ kind: "duplicate" | "stale" | "failed" }>;

/**
 * The closed set of answers Confirm can give.
 *
 * `failed` carries the caught value rather than discarding it: the surface is
 * the only layer with a logger, and a caught value bound under any key but `err`
 * is unloggable, so a `failed` that lost its cause would be an operator staring
 * at a generic apology with nothing behind it (finding F-4).
 */
export type ConfirmResult =
  | Readonly<{
      kind: "confirmed";
      round: PlanningRound;
      members: readonly RosterMember[];
      /**
       * Whose round this was, resolved from `authorUserId` inside the confirm
       * transaction (D-13).
       *
       * The confirmed card is the ONE card that stays in chat history forever,
       * so it is the last card that may drop the attribution: a line that
       * appeared at the hand-over and vanished on the terminal render would
       * quietly stop being true to anyone scrolling back. Carried on the result
       * rather than looked up by the surface, for the same reason `takeover`
       * carries it — no planning surface reads the identity columns itself.
       */
      owner: TelegramIdentity;
    }>
  | NotAuthorResult
  | Readonly<{
      kind: "empty-roster" | "duplicate" | "stale";
    }>
  | Readonly<{ kind: "failed"; error: unknown }>;

/**
 * The ONE ordered wizard, read backwards.
 *
 * `undefined` for `DAY` is the whole statement that the day step is first:
 * there is no value to move to, so no Back action is minted there and none is
 * accepted. Adding a step means adding one entry here, and the compiler will
 * not let a new `PlanningStep` member be forgotten.
 */
const PREVIOUS_STEP: Readonly<Record<PlanningStep, PlanningStep | undefined>> =
  {
    [PlanningStep.DAY]: undefined,
    [PlanningStep.TIME]: PlanningStep.DAY,
    [PlanningStep.REVIEW]: PlanningStep.TIME,
  };

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
  /**
   * Whether this is the day the author has ALREADY chosen — the field Back
   * needs (D-03).
   *
   * Deliberately separate from `marker`. A day can simultaneously be the chosen
   * one and the chat's configured default, and folding chosen-ness into the
   * bounded classification would make that pair unrepresentable — the marker
   * value exists precisely so exactly one of default/previous/past can win.
   */
  chosen: boolean;
}>;

/** The seven days a day card shows, always seven and always Monday first. */
export type DayStepProjection = Readonly<{
  weekStart: string;
  days: readonly DayStepCell[];
  /**
   * Who owns the round right now, for the card's attribution line (D-02/D-13).
   *
   * Optional on the projection TYPE only so a focused unit fixture can build a
   * projection without an identity read; every production path populates it
   * from `PlanningRound.authorUserId`, the same durable column the ownership
   * refusal reads, so the card and the refusal cannot disagree about whose
   * round it is.
   */
  owner?: TelegramIdentity;
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
  /**
   * `PlanningRound.selectedDate`, or null on the first visit to this step.
   *
   * Populated only when the author walked BACK here, which is exactly when
   * D-03 requires the earlier choice to still be applied and still visible.
   */
  selectedDate: string | null;
  /**
   * Who owns the round, carried straight through to the projection so the card
   * can name them (D-02/D-13). Optional so a focused fixture can omit it.
   */
  owner?: TelegramIdentity;
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
      chosen: day === input.selectedDate,
    };
  });
  return {
    weekStart: input.targetWeekStart,
    days,
    ...(input.owner === undefined ? {} : { owner: input.owner }),
  };
}

/**
 * What, if anything, one hour of the chosen day is worth pointing out.
 *
 * The exact sibling of `DayMarker`, and one value rather than a set of flags for
 * the same reason: D-08's tie rule is then structural. `unavailable` covers BOTH
 * an hour already behind the chat and an hour that does not exist because the
 * clocks changed — D-07 asks for one consistent "you cannot pick this" rule
 * across both selectors, so the two facts share a marker even though they keep
 * separate reasons underneath (see `slotAvailability`).
 */
export type SlotMarker = "unavailable" | "default" | "previous" | "none";

/** One offerable hour of the chosen day, ready to render. */
export type TimeStepCell = Readonly<{
  startMinute: MinuteOfDay;
  label: string;
  marker: SlotMarker;
  /** The exact sibling of `DayStepCell.chosen`, and separate for the same reason. */
  chosen: boolean;
}>;

/** The hours a time card shows: exactly the set the window admits, marked. */
export type TimeStepProjection = Readonly<{
  selectedDate: string;
  slots: readonly TimeStepCell[];
  /**
   * Who owns the round right now, for the card's attribution line (D-02/D-13).
   *
   * Optional on the projection TYPE only so a focused unit fixture can build a
   * projection without an identity read; every production path populates it
   * from `PlanningRound.authorUserId`, the same durable column the ownership
   * refusal reads, so the card and the refusal cannot disagree about whose
   * round it is.
   */
  owner?: TelegramIdentity;
}>;

export type TimeStepInput = Readonly<{
  /** The ROUND's timezone snapshot, never a fresh configuration read. */
  timezone: string;
  selectedDate: string;
  /** The ROUND's window snapshot: a mid-round /settings edit cannot move it. */
  window: SlotWindow;
  now: Date;
  /** `ChatConfiguration.defaultStartMinute`, or null if unknown. */
  defaultStartMinute: number | null;
  /** The previous rehearsal's CHAT-LOCAL start minute, or null when none. */
  previousRehearsalStartMinute: number | null;
  /** `PlanningRound.selectedStartMinute`, populated only after a Back (D-03). */
  selectedStartMinute: number | null;
  /**
   * Who owns the round, carried straight through to the projection so the card
   * can name them (D-02/D-13). Optional so a focused fixture can omit it.
   */
  owner?: TelegramIdentity;
}>;

/**
 * The ONE ordered decision that classifies an hour.
 *
 * Same order as `classifyDay`, and load-bearing for the same reason:
 * unavailable beats everything, because an hour nobody can pick must not
 * advertise itself as the one the band usually plays, and the configured
 * default beats the previous rehearsal, which is D-08's tie rule. Both hints
 * are compared on the same axis — the slot's start minute — so the tie is a
 * genuine collision this order resolves.
 */
function classifySlot(
  startMinute: MinuteOfDay,
  available: boolean,
  defaultStartMinute: number | null,
  previousStartMinute: number | null,
): SlotMarker {
  if (!available) return "unavailable";
  if (defaultStartMinute !== null && startMinute === defaultStartMinute)
    return "default";
  if (previousStartMinute !== null && startMinute === previousStartMinute)
    return "previous";
  return "none";
}

/**
 * The time card's projection: pure, total, and exactly as long as the window
 * admits.
 *
 * An hour that has passed or does not exist is still a cell — visible, marked
 * and refused (D-05/D-07), never dropped. The only input that yields an empty
 * list is a window no whole rehearsal fits in, which is the generator's honest
 * answer rather than a partial one; the card copy says so.
 */
export function buildTimeStepProjection(
  input: TimeStepInput,
): TimeStepProjection {
  const date = parseCivilDate(input.selectedDate);
  const slots = generateSlots(input.window).map((slot) => ({
    startMinute: slot.startMinute,
    label: slot.label,
    marker: classifySlot(
      slot.startMinute,
      slotAvailability(input.timezone, date, slot.startMinute, input.now) ===
        "available",
      input.defaultStartMinute,
      input.previousRehearsalStartMinute,
    ),
    chosen: slot.startMinute === input.selectedStartMinute,
  }));
  return {
    selectedDate: input.selectedDate,
    slots,
    ...(input.owner === undefined ? {} : { owner: input.owner }),
  };
}

/**
 * The review card's projection: the whole of what Confirm is about to commit.
 *
 * `members` is the chat's CURRENT active roster, because D-09 makes the active
 * roster the lineup — there is no participant-selection step and nothing else
 * to show. The rows are read through the same
 * `listActiveMemberships` the confirm transaction snapshots from, so the card
 * and the snapshot cannot be built from two different ideas of "active".
 */
export type ReviewStepProjection = Readonly<{
  selectedDate: string;
  startMinute: MinuteOfDay;
  durationMinutes: number;
  members: readonly RosterMember[];
  /**
   * Who owns the round right now, for the card's attribution line (D-02/D-13).
   *
   * Optional on the projection TYPE only so a focused unit fixture can build a
   * projection without an identity read; every production path populates it
   * from `PlanningRound.authorUserId`, the same durable column the ownership
   * refusal reads, so the card and the refusal cannot disagree about whose
   * round it is.
   */
  owner?: TelegramIdentity;
}>;

/** The chat-local date a confirmed round's rehearsal actually started on. */
function rehearsalDate(round: PlanningRound | null): string | null {
  if (round === null || round.startsAt === null) return null;
  return isoDate(civilNow(round.timezone, round.startsAt));
}

/** The chat-local minute of day a confirmed round's rehearsal started at. */
function rehearsalStartMinute(round: PlanningRound | null): number | null {
  if (round === null || round.startsAt === null) return null;
  return civilNow(round.timezone, round.startsAt).minuteOfDay;
}

export type SetAnchorResult = Readonly<{
  kind: "anchored" | "stale" | "failed";
}>;

/**
 * The closed set of answers a status request can get (D-14 / D-15, PLAN-10).
 *
 * `live` already carries the step's freshly minted actions, because a re-posted
 * card is a real card: it needs live buttons, not a picture of the old ones.
 * `cooling-down` is the flood refusal, and it is a distinct member rather than a
 * flavour of `failed` so the surface can stay silent in the chat while still
 * saying exactly what happened in the logs.
 */
export type StatusResult =
  | Readonly<{
      kind: "live";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
    }>
  /**
   * The refusal carries the round it was refused ABOUT, so the log line that is
   * the only trace of this branch can name it. A refusal that could not say
   * which round it concerned would be unjoinable with the re-post it lost to.
   */
  | Readonly<{ kind: "cooling-down"; round: PlanningRound }>
  | Readonly<{ kind: "no-active-round" }>
  | Readonly<{ kind: "unconfigured" }>
  | Readonly<{ kind: "failed"; error: unknown }>;

export type ReanchorResult = Readonly<{
  kind: "reanchored" | "stale" | "failed";
}>;

/**
 * The closed set of answers a takeover can give (AUTH-03, D-12/D-13).
 *
 * `not-eligible` and `not-admin` are separate members rather than one refusal
 * because they are different facts about different things — the round's silence
 * and the actor's role — and a chat administrator who is told "you are not an
 * administrator" when the truth is "the author is still using it" would go and
 * check their permissions instead of waiting.
 */
export type TakeoverResult =
  | Readonly<{
      kind: "taken-over";
      round: PlanningRound;
      actions: readonly MintedPlanningAction[];
      /** The NEW owner, so the card can say out loud that it changed hands. */
      owner: TelegramIdentity;
    }>
  | Readonly<{
      kind: "not-eligible" | "not-admin" | "duplicate" | "stale" | "failed";
    }>;

/**
 * Whether a round has been silent long enough to be taken over (D-12).
 *
 * A pure predicate over `lastActivityAt`, which every author action refreshes
 * inside its own guarded transaction — so an author who comes back simply resets
 * it and their round stops being takeover-eligible without anything having to
 * notice. That is the whole reason this phase needs no scheduler: abandonment is
 * a question asked at READ time, not a state a background job has to maintain.
 *
 * `>=` rather than `>`, matching every other lifetime comparison in the
 * codebase: exactly at the threshold counts as elapsed.
 */
export function isTakeoverEligible(
  round: Readonly<{ lastActivityAt: Date }>,
  now: Date,
): boolean {
  return (
    now.getTime() - round.lastActivityAt.getTime() >= PLANNING_INACTIVITY_MS
  );
}

/** Whether a freshly resolved role is one that may take a round over. */
function isAdministratorRole(role: CurrentTelegramRole) {
  return role === "creator" || role === "administrator";
}

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
  constructor(
    private readonly prisma: PlanningPersistence,
    private readonly logger?: Pick<SafeLogger, "error">,
  ) {}

  private logHousekeepingFailure(
    chatId: bigint,
    reason: "start-or-resume-retention-sweep" | "status-retention-sweep",
    error: unknown,
  ) {
    this.logger?.error(
      {
        event: "planning.housekeeping.failure",
        outcome: "retention-sweep-failed",
        reason,
        chatId,
        err: error,
      },
      "Planning callback-action retention sweep failed",
    );
  }

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
      // The FIRST step, so no Back target is minted: there is no step below
      // DAY for one to return to, and an unmintable target is how "Back does
      // not exist here" is expressed rather than by a disabled button.
      return weekDates(round.targetWeekStart).map((date) => ({
        action: "day" as const,
        roundId: round.id,
        date,
      }));
    }
    if (round.step === PlanningStep.TIME) {
      return [
        ...generateSlots(round).map((slot) => ({
          action: "time" as const,
          roundId: round.id,
          startMinute: slot.startMinute,
        })),
        { action: "back" as const, roundId: round.id },
      ];
    }
    // Review: the two controls the phase ends on (D-04). Confirm commits, Back
    // returns to the hours — there is no third, placeholder control.
    return [
      { action: "confirm" as const, roundId: round.id },
      { action: "back" as const, roundId: round.id },
    ];
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
   * Hands a callback token back after its guarded round write loses a race.
   *
   * This is legal only on the branch where the atomic round gate proves that
   * no transition landed. The release and the earlier consume commit in the
   * same transaction, making the result indistinguishable from never having
   * consumed the token. Releasing after a successful write would resurrect a
   * spent action and break exactly-once handling.
   */
  private async releaseAction(
    tx: Prisma.TransactionClient,
    callbackToken: string,
  ) {
    await tx.callbackAction.updateMany({
      where: { token: callbackToken },
      data: { consumedAt: null },
    });
  }

  /**
   * The ONE ownership decision, run by every transition (D-02).
   *
   * Authority is `PlanningRound.authorUserId` — a durable column — and never the
   * callback token, and never `CallbackAction.actorUserId` on its own. The
   * action row records who the button was MINTED for; the round column records
   * who OWNS the round, and after an administrator takeover those two disagree
   * deliberately. Reading the row instead would hand an abandoned round's stale
   * buttons back to its previous author.
   *
   * Answers `null` when the actor owns the round; otherwise the refusal,
   * carrying the owner's stored identity so the surface can name them. It is
   * called BEFORE the callback row is consumed at every site: the row belongs to
   * the author and must survive a bystander's tap, or one stranger's press would
   * kill a button the author still needs.
   */
  private async resolveOwnership(
    client: Pick<PrismaClient, "telegramUser">,
    round: PlanningRound,
    actorId: bigint,
  ): Promise<NotAuthorResult | null> {
    if (round.authorUserId === actorId) return null;
    return {
      kind: "not-author",
      owner: await resolveTelegramIdentity(client, round.authorUserId),
    };
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
      // Read straight off the round, so a day step reached by Back shows the
      // author's earlier choice as still applied (D-03).
      selectedDate: round.selectedDate,
      // The card names its current owner, resolved from the same durable column
      // the ownership refusal reads (D-02/D-13).
      owner: await resolveTelegramIdentity(this.prisma, round.authorUserId),
    });
  }

  /**
   * The marked hours a round's time card should show.
   *
   * The window, the timezone and the chosen day all come from the round's OWN
   * snapshot, so a `/settings` edit landing mid-round cannot change the slots on
   * a card that is already on screen (threat T-02-11). Only the two marker hints
   * read the live `ChatConfiguration`, and deliberately so: a marker is cosmetic
   * advice about what the band usually does. It selects nothing and is never
   * read back as authority.
   */
  async timeStepProjection(
    round: PlanningRound,
    now: Date,
  ): Promise<TimeStepProjection> {
    const configuration = await this.prisma.chatConfiguration.findUnique({
      where: { chatId: round.chatId },
    });
    const previous = await this.previousRehearsal(round.chatId, now);
    return buildTimeStepProjection({
      timezone: round.timezone,
      selectedDate: round.selectedDate ?? round.targetWeekStart,
      window: round,
      now,
      defaultStartMinute: configuration?.defaultStartMinute ?? null,
      previousRehearsalStartMinute: rehearsalStartMinute(previous),
      selectedStartMinute: round.selectedStartMinute,
      owner: await resolveTelegramIdentity(this.prisma, round.authorUserId),
    });
  }

  /**
   * Everything the review card shows, read at RENDER time.
   *
   * The lineup is the chat's current active roster and nothing else (D-09).
   * It is deliberately a fresh read rather than a value carried from an earlier
   * step: a member added or removed while the wizard was open must appear on
   * the card the author is asked to confirm. The card is still only a card —
   * the durable snapshot is taken again inside the confirm transaction, which
   * is the value Phase 3 reads.
   */
  async reviewStepProjection(
    round: PlanningRound,
  ): Promise<ReviewStepProjection> {
    return {
      selectedDate: round.selectedDate ?? round.targetWeekStart,
      startMinute: round.selectedStartMinute ?? round.dailyStartMinute,
      durationMinutes: round.durationMinutes,
      members: await listActiveMemberships(this.prisma, round.chatId),
      owner: await resolveTelegramIdentity(this.prisma, round.authorUserId),
    };
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
      // Read-time reaping, before anything looks for a live round: last week's
      // abandoned draft still holds `@@unique([chatId, activeWeekStart])`, so
      // without this the create below would collide and the chat could never
      // plan again (02-RESEARCH.md Pattern 8).
      await this.supersedeStaleRounds(chatId, now);
      // Housekeeping is idempotent and must never turn `/plan` into a refusal;
      // a transient failure is retried by the next read.
      try {
        await this.reapExpiredActions(chatId, now);
      } catch (error) {
        this.logHousekeepingFailure(
          chatId,
          "start-or-resume-retention-sweep",
          error,
        );
      }

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
        // Every week the search could offer is already spoken for. Refused
        // rather than forced onto the last candidate: a round created for a week
        // that already has a confirmed rehearsal would run a second availability
        // round for it, and the confirmed round's NULL `activeWeekStart` means
        // no unique index would stop it.
        if (weekStart === null) return { kind: "no-free-week" };
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
        const ownership = await this.resolveOwnership(tx, round, actorId);
        if (ownership !== null) return ownership;
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
        if (advanced.count !== 1) {
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }

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
   * Consumes one time action exactly once and advances the round to review.
   *
   * The exact sibling of `selectDay`, deliberately step for step: re-validate
   * the row's kind, chat and expiry, report `duplicate` on an already-consumed
   * row, parse the target, consume with `updateMany ... consumedAt: null`
   * asserting `count === 1`, and only then mutate the round under an
   * expected-revision guard asserting `count === 1`.
   *
   * Both refusals leave the action row UNCONSUMED, so an author who taps a dead
   * hour is not left holding a card whose live buttons no longer work.
   *
   * Nothing here computes `startsAt` or `endsAt`. Those are written inside the
   * Confirm transaction, from the round's civil pair and its timezone snapshot,
   * with `endsAt = startsAt + durationMinutes * 60_000` — exact elapsed time, so
   * a rehearsal spanning a fall-back transition is two real hours and not three
   * wall-clock ones (DST policy rule 4).
   */
  async selectTime(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<SelectTimeResult> {
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
        if (!target.success || target.data.action !== "time")
          return { kind: "stale" };
        // Bound to a local so the narrowing survives into the closure below;
        // it is also the only value from the wire this method ever reads.
        const startMinute = target.data.startMinute;

        const round = await tx.planningRound.findUnique({
          where: { id: target.data.roundId },
        });
        if (
          round === null ||
          round.chatId !== chatId ||
          round.status !== PlanningRoundStatus.DRAFT ||
          round.step !== PlanningStep.TIME ||
          round.selectedDate === null
        )
          return { kind: "stale" };
        const ownership = await this.resolveOwnership(tx, round, actorId);
        if (ownership !== null) return ownership;
        // Rendering is not authority (threat T-02-18). A syntactically valid
        // minute the round's OWN window never admitted is refused, never
        // applied — membership is re-derived from the snapshot, not trusted
        // from the card the minute arrived on.
        const offered = generateSlots(round).some(
          (slot) => slot.startMinute === startMinute,
        );
        if (!offered) return { kind: "stale" };
        // Availability is re-derived at TAP time too: a card can sit in the
        // chat for an hour, so a slot that was offerable when it was drawn may
        // not be offerable when it is pressed. The row is left UNCONSUMED.
        const availability = slotAvailability(
          round.timezone,
          parseCivilDate(round.selectedDate),
          startMinute,
          now,
        );
        if (availability === "past") return { kind: "past-slot" };
        if (availability === "nonexistent") return { kind: "nonexistent-slot" };

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
            step: PlanningStep.TIME,
          },
          data: {
            step: PlanningStep.REVIEW,
            selectedStartMinute: startMinute,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (advanced.count !== 1) {
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }

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
   * Consumes one Back action exactly once and moves the round one step back.
   *
   * The same ordering as `selectDay` and `selectTime`, deliberately: re-validate
   * the row's kind, chat and expiry, report `duplicate` on an already-consumed
   * row, parse the target, consume with `updateMany ... consumedAt: null`
   * asserting `count === 1`, and only then mutate the round under an
   * expected-revision guard asserting `count === 1`.
   *
   * NOTHING here clears `selectedDate` or `selectedStartMinute`. D-03 exists to
   * stop a mis-tap forcing cancel-and-restart, and a Back that discarded the
   * earlier choice on the way past would BE cancel-and-restart under a friendlier
   * label. The destination card renders the surviving choice as chosen, which is
   * what makes the difference visible to the author.
   */
  async back(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<BackResult> {
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
        if (!target.success || target.data.action !== "back")
          return { kind: "stale" };

        const round = await tx.planningRound.findUnique({
          where: { id: target.data.roundId },
        });
        if (
          round === null ||
          round.chatId !== chatId ||
          round.status !== PlanningRoundStatus.DRAFT
        )
          return { kind: "stale" };
        const ownership = await this.resolveOwnership(tx, round, actorId);
        if (ownership !== null) return ownership;
        // A Back on the FIRST step has no destination. The target parses — it
        // is a well-formed planning action — so the refusal is a decision about
        // this round's step, and the row is left unconsumed like every other
        // refusal on this surface.
        const destination = PREVIOUS_STEP[round.step];
        if (destination === undefined) return { kind: "stale" };

        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };

        const moved = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            revision: round.revision,
            status: PlanningRoundStatus.DRAFT,
            step: round.step,
          },
          data: {
            step: destination,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (moved.count !== 1) {
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }

        const updated = await tx.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        const actions = await this.mintStepActions(tx, updated, now);
        return { kind: "moved", round: updated, actions };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  /**
   * Promotes the draft into the durable confirmed proposal — ONE transaction.
   *
   * This is the phase's terminal state (D-04) and its only irreversible action.
   * Four decisions become a single atomic fact here, and the reason they are one
   * transaction rather than four writes is that every partial outcome is a
   * defect with no recovery: a round that released its week without recording a
   * lineup leaves the band an empty proposal they can never answer, and a round
   * that recorded a lineup without releasing its week locks the chat out of
   * planning the next one.
   *
   * ORDERING. The read-only refusals — the round's state, the author, an empty
   * roster (D-10), a selection the round's own snapshot never admitted, and a
   * slot that is no longer available at the injected current time — all happen
   * BEFORE the callback row is consumed, exactly as `selectDay` and
   * `selectTime` order their refusals.
   * 02-RESEARCH.md's Pattern 9 sketch consumes first and checks the roster
   * second; that ordering spends the review card's only Confirm token on a
   * refusal whose message asks the author to go and fix something, so the tap
   * that follows the fix answers `Already applied.` and the card is dead. The
   * consumption remains the single atomic gate in front of every WRITE, which
   * is the property idempotency and concurrency actually depend on.
   *
   * `expectedRevision` may be `null`, meaning "whatever revision this round is
   * at inside this transaction" — the guard `selectDay` and `selectTime` use. A
   * caller that has already observed a specific revision may pin it instead;
   * either way the guarded `updateMany` is the authority, not a prior read.
   *
   * The ONE refusal that cannot be ordered before the gate is the lost revision
   * race, because the gate is what establishes it: the round is read, the token
   * is spent, and only then does the guarded `updateMany` discover that somebody
   * else moved the row in between. Left alone, that spends the review card's
   * only Confirm token on a refusal the author is expected to retry — the exact
   * dead card the ordering rule above exists to prevent, reached from the other
   * side. So the row is RELEASED on that branch. It is the same transaction, so
   * the release and the consume commit together and the outcome is
   * indistinguishable from never having consumed at all.
   */
  async confirm(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    expectedRevision: number | null,
    now: Date,
  ): Promise<ConfirmResult> {
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
        if (!target.success || target.data.action !== "confirm")
          return { kind: "stale" };

        const round = await tx.planningRound.findUnique({
          where: { id: target.data.roundId },
        });
        if (
          round === null ||
          round.chatId !== chatId ||
          round.status !== PlanningRoundStatus.DRAFT ||
          round.step !== PlanningStep.REVIEW ||
          round.selectedDate === null ||
          round.selectedStartMinute === null
        )
          return { kind: "stale" };
        const ownership = await this.resolveOwnership(tx, round, actorId);
        if (ownership !== null) return ownership;
        const selectedDate = round.selectedDate;
        const selectedStartMinute = round.selectedStartMinute;

        // The final selection is re-validated against the ROUND's own snapshot,
        // never against a fresh `ChatConfiguration` read (threat T-02-11). A
        // settings edit that landed mid-round can therefore neither invalidate
        // a legitimate confirm nor legitimise a selection the round never
        // offered. Membership is re-derived from `weekDates` and `generateSlots`
        // — the same functions that produced the buttons — so there is no
        // fourth copy of the containment rule to keep in step.
        if (!weekDates(round.targetWeekStart).includes(selectedDate))
          return { kind: "stale" };
        if (
          !generateSlots(round).some(
            (slot) => slot.startMinute === selectedStartMinute,
          )
        )
          return { kind: "stale" };

        // Selection and confirmation are separate taps, potentially minutes
        // apart. Re-run the SAME availability policy used by the time selector
        // at the transaction's injected `now`: a slot that has started, or a
        // wall clock that does not exist, is no longer actionable. This refusal
        // deliberately precedes both the roster lock and token consumption so
        // retryable state is left untouched.
        const civil = parseCivilDate(selectedDate);
        if (
          slotAvailability(round.timezone, civil, selectedStartMinute, now) !==
          "available"
        )
          return { kind: "stale" };

        // Civil pair to instant, at the single `Intl` seam. A wall clock the
        // zone skipped has NO instant by construction, so there is nothing to
        // write and nothing to quietly shift it to (DST policy rule 2); the
        // time step already refuses such an hour, and this is the backstop for
        // a round whose row was reached another way.
        const resolved = resolveWallClock(
          round.timezone,
          civil.year,
          civil.month,
          civil.day,
          selectedStartMinute,
        );
        if (resolved.kind === "skipped") return { kind: "stale" };
        const startsAt = new Date(resolved.instantMs);
        // DST policy rule 4: EXACT ELAPSED TIME. A rehearsal spanning a
        // fall-back transition is two real hours, not three wall-clock ones.
        const endsAt = new Date(
          startsAt.getTime() + round.durationMinutes * 60_000,
        );

        // READ COMMITTED gives a bare read no protection from a membership
        // change committed before our later snapshot write. Lock every existing
        // membership row for this chat, while `listActiveMemberships` remains
        // the single authority on which locked rows belong in the lineup. The
        // lock prevents removal and reactivation until commit. A brand-new row
        // may still be inserted concurrently; that member joins after this
        // proposal, exactly as if they were added a moment after confirmation.
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id
          FROM chat_memberships
          WHERE chat_id = ${chatId}
          FOR SHARE
        `;

        // D-09/D-10: the active roster IS the lineup. An empty one is refused
        // rather than committed — an availability round with nobody in it can
        // never complete, and it would hold the week's unique slot while being
        // useless.
        const members = await listActiveMemberships(tx, chatId);
        if (members.length === 0) return { kind: "empty-roster" };

        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        // The idempotency AND concurrency guarantee, in one statement: a single
        // atomic compare-and-set at the database, not an application-level
        // check-then-act. Two simultaneous taps both reach here; exactly one
        // sees `count === 1`.
        if (consumed.count !== 1) return { kind: "duplicate" };

        const promoted = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            revision: expectedRevision ?? round.revision,
            status: PlanningRoundStatus.DRAFT,
          },
          data: {
            status: PlanningRoundStatus.CONFIRMED,
            // PLAN-02, and the entire point of the nullable active key: NULLs
            // are distinct in a PostgreSQL unique index, so releasing this
            // frees `@@unique([chatId, activeWeekStart])` for the next week
            // while the confirmed round persists. Set in the SAME statement as
            // `status`, so the pair can never be observed disagreeing.
            activeWeekStart: null,
            confirmedAt: now,
            startsAt,
            endsAt,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (promoted.count !== 1) {
          // The guarded write lost, so the earlier consume must not survive.
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }

        // D-11: the snapshot Phase 3 reads to decide who may answer, and the
        // one `wasPreviousParticipant` reads for the PREVIOUS_PARTICIPANTS
        // policy. Both identities are stored: the Telegram id is the durable
        // person, the membership id is the row that admitted them.
        await tx.planningParticipant.createMany({
          data: members.map((member) => ({
            roundId: round.id,
            chatId: round.chatId,
            telegramUserId: member.telegramUserId,
            membershipId: member.membershipId,
          })),
        });

        const confirmed = await tx.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        // The members that were ACTUALLY snapshotted travel back with the
        // result, so the terminal card names the committed lineup rather than
        // re-reading a roster that may have moved since. The owner rides along
        // for the same reason: read from `confirmed.authorUserId`, so a round
        // that changed hands is attributed to whoever actually holds it.
        return {
          kind: "confirmed",
          round: confirmed,
          members,
          owner: await resolveTelegramIdentity(tx, confirmed.authorUserId),
        };
      });
    } catch (error) {
      return { kind: "failed", error };
    }
  }

  /**
   * Retires any DRAFT round whose target week is already behind the chat, at
   * READ time (02-RESEARCH.md Pattern 8).
   *
   * This is the whole of the phase's reaping mechanism, and it is deliberately
   * not a job. An in-process timer would not survive a restart and could not
   * coordinate replicas — the exact reasons `.claude/CLAUDE.md` rejects
   * process-memory scheduling — and a durable queue would add a schema, a worker
   * lifecycle and a dependency gate for a question that only matters at the
   * moment somebody looks. Every path that reads a chat's round calls this
   * first, so by the time anyone can observe last week's ghost it is gone.
   *
   * A negative grep in this plan's acceptance criteria is what holds that line,
   * so the names of the rejected mechanisms are deliberately not written here.
   *
   * SUPERSEDED, never deleted. `SetupDraft`'s expiry path deletes the row; a
   * planning round must not follow it, because the round holds the selections
   * D-13 requires a takeover to keep and that an author returning after the
   * threshold expects to find. Only `activeWeekStart` is released, in the SAME
   * statement as `status` — the pair encodes "active" twice and must never be
   * observed disagreeing. The same write increments `revision`, invalidating
   * any card or re-anchor that read the draft before it became terminal.
   *
   * Inactivity is NOT a reaping condition. A current-week draft is never
   * superseded however long it has been silent: silence enables TAKEOVER, and
   * only the week boundary supersedes. Conflating them would quietly destroy the
   * week of an author who stepped away for an afternoon.
   */
  async supersedeStaleRounds(chatId: bigint, now: Date) {
    const drafts = await this.prisma.planningRound.findMany({
      where: { chatId, status: PlanningRoundStatus.DRAFT },
      select: {
        id: true,
        targetWeekStart: true,
        timezone: true,
      },
    });
    let supersededCount = 0;
    for (const draft of drafts) {
      const currentWeekStart = isoDate(mondayOf(civilNow(draft.timezone, now)));
      if (draft.targetWeekStart >= currentWeekStart) continue;

      const superseded = await this.prisma.planningRound.updateMany({
        where: {
          id: draft.id,
          status: PlanningRoundStatus.DRAFT,
          // Revision-only activity (for example a concurrent re-anchor) cannot
          // make a round for a completed week live again. Guard the terminal
          // transition with the facts that actually decide staleness instead:
          // identity, draft status, and a target week still behind this round's
          // snapshotted timezone. The increment below still invalidates every
          // in-flight writer that observed the draft before supersession.
          targetWeekStart: { lt: currentWeekStart },
        },
        data: {
          status: PlanningRoundStatus.SUPERSEDED,
          activeWeekStart: null,
          revision: { increment: 1 },
        },
      });
      supersededCount += superseded.count;
    }
    return supersededCount;
  }

  /**
   * Reaps dead callback capabilities for one chat at read time.
   *
   * Expiry is the sole deadness rule, regardless of which surface minted the
   * row or whether it was consumed. The chat scope keeps one band's command
   * from doing unbounded cleanup work for every other chat.
   */
  private async reapExpiredActions(chatId: bigint, now: Date) {
    const cutoff = new Date(now.getTime() - PLANNING_ACTION_RETENTION_MS);
    const deleted = await this.prisma.callbackAction.deleteMany({
      where: { chatId, expiresAt: { lt: cutoff } },
    });
    return deleted.count;
  }

  /**
   * Hands an abandoned round to a chat administrator (AUTH-03, D-12/D-13).
   *
   * The single deliberate exception to author-only control, and every line below
   * is about keeping it narrow. BOTH conditions are re-checked from freshly read
   * state rather than from what the render saw, because the Take over button can
   * sit on someone's screen for minutes while the author comes back or the
   * administrator is demoted (threat T-02-05).
   *
   * `resolveRole` is awaited at TAP time, immediately before the transaction
   * opens rather than inside it. The lookup is a Telegram HTTP round trip, and
   * holding a PostgreSQL transaction open across it would put a row lock behind
   * a third party's latency and hit the interactive-transaction timeout on a
   * slow reply — turning a rate-limited Telegram into a takeover outage. The
   * property that matters is that the role is fresh at the moment of the tap,
   * and it is. It MUST be the non-destructive `currentRole` accessor: the
   * administrator-requirement helper beside it deletes the actor's setup and
   * settings drafts on denial, so a refused takeover would destroy an unrelated
   * in-progress wizard (threat T-02-14).
   *
   * The mutation touches `authorUserId`, `lastActivityAt` and `revision` and
   * NOTHING else. D-13 requires the new author to continue from where the round
   * stopped, and Back on every step is how they revise anything they disagree
   * with — a takeover that cleared the selections would be cancel-and-restart
   * wearing a friendlier label.
   */
  async takeover(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    expectedRevision: number | null,
    now: Date,
    resolveRole: () => Promise<CurrentTelegramRole>,
  ): Promise<TakeoverResult> {
    try {
      const role = await resolveRole();
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
        if (!target.success || target.data.action !== "takeover")
          return { kind: "stale" };

        const round = await tx.planningRound.findUnique({
          where: { id: target.data.roundId },
        });
        if (
          round === null ||
          round.chatId !== chatId ||
          round.status !== PlanningRoundStatus.DRAFT
        )
          return { kind: "stale" };

        // Both refusals are READ-ONLY and both happen before the row is
        // consumed, exactly as every other refusal on this surface does: a
        // takeover refused because the author came back must leave the button
        // spendable, or the administrator has no way to try again later.
        //
        // The round is already theirs. Unreachable from the card — the control
        // is not rendered for the author — but answered rather than applied,
        // because "take over your own round" has no meaning to state.
        if (round.authorUserId === actorId) return { kind: "not-eligible" };
        // Computed HERE, from the `lastActivityAt` this transaction just read,
        // not from the value that was true when the button was drawn.
        if (!isTakeoverEligible(round, now)) return { kind: "not-eligible" };
        if (!isAdministratorRole(role)) return { kind: "not-admin" };

        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };

        const taken = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            revision: expectedRevision ?? round.revision,
            status: PlanningRoundStatus.DRAFT,
          },
          data: {
            authorUserId: actorId,
            lastActivityAt: now,
            revision: { increment: 1 },
          },
        });
        if (taken.count !== 1) {
          // The guarded write lost, so the earlier consume must not survive.
          await this.releaseAction(tx, callbackToken);
          return { kind: "stale" };
        }

        const updated = await tx.planningRound.findUniqueOrThrow({
          where: { id: round.id },
        });
        // Minted AFTER the author column moved, so the new tokens are bound to
        // the new owner and the previous author's remaining buttons are refused
        // by the ordinary ownership check rather than by anything special.
        const actions = await this.mintStepActions(tx, updated, now);
        return {
          kind: "taken-over",
          round: updated,
          actions,
          owner: await resolveTelegramIdentity(tx, actorId),
        };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  /**
   * The chat's live round, ready to be re-posted at the bottom of the chat.
   *
   * D-15 makes this readable by anyone in the chat, so `actorId` is NOT an
   * authority input here — it is only recorded by the caller. What protects the
   * chat is the cooldown, and the cooldown is CLAIMED before this method
   * returns, not after the message is sent.
   *
   * That order is the whole design. 02-RESEARCH.md Pattern 7 sketches
   * send-then-persist, which cannot hold the PLAN-10 concurrency promise: two
   * simultaneous requests both read a clear cooldown, both post a card, and the
   * chat gets two anchors before either write lands. Claiming first turns the
   * cooldown into a single atomic compare-and-set at the database — the same
   * shape as `consumedAt: null` on a callback row — so exactly one of any number
   * of simultaneous requests is ever answered with a card. It also means a
   * Telegram outage cannot be used as a flood amplifier: the claim is durable
   * even when the send that follows it fails.
   *
   * The claim deliberately does NOT bump `revision`. A status request is not a
   * step transition, and bumping would make a bystander's request invalidate the
   * author's in-flight tap — handing anyone in the chat a way to break the
   * author's card once a minute.
   */
  async status(
    chatId: bigint,
    _actorId: bigint,
    now: Date,
  ): Promise<StatusResult> {
    try {
      const configuration = await this.prisma.chatConfiguration.findUnique({
        where: { chatId },
      });
      if (configuration === null) return { kind: "unconfigured" };
      // The same read-time reaping as `startOrResume`, for the same reason: a
      // status request must not re-post last week's ghost as if it were live.
      await this.supersedeStaleRounds(chatId, now);
      // Housekeeping is idempotent and must never turn `/plan_status` into a
      // refusal; a transient failure is retried by the next read.
      try {
        await this.reapExpiredActions(chatId, now);
      } catch (error) {
        this.logHousekeepingFailure(chatId, "status-retention-sweep", error);
      }

      return await this.prisma.$transaction(async (tx) => {
        const round = await tx.planningRound.findFirst({
          where: { chatId, status: PlanningRoundStatus.DRAFT },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        if (round === null) return { kind: "no-active-round" };

        // The compare-and-set. The cooldown lives in the WHERE clause rather
        // than in an `if` above it, so two concurrent transactions cannot both
        // observe a clear window: the second blocks on the row lock and then
        // re-evaluates against the row the first one committed.
        const cutoff = new Date(now.getTime() - PLANNING_STATUS_COOLDOWN_MS);
        const claimed = await tx.planningRound.updateMany({
          where: {
            id: round.id,
            status: PlanningRoundStatus.DRAFT,
            OR: [
              { lastStatusPostedAt: null },
              { lastStatusPostedAt: { lte: cutoff } },
            ],
          },
          data: { lastStatusPostedAt: now },
        });
        if (claimed.count !== 1) return { kind: "cooling-down", round };

        const actions = await this.mintStepActions(tx, round, now);
        return { kind: "live", round, actions };
      });
    } catch (error) {
      return { kind: "failed", error };
    }
  }

  /**
   * Claims the right to answer a `/plan_status` that has NO round to answer with.
   *
   * `PLANNING_STATUS_COOLDOWN_MS` lives in `PlanningRound.lastStatusPostedAt`,
   * which can only rate-limit a chat that HAS a draft round — and so cannot
   * cover the three branches that reply without one: no active round, no
   * configuration, and a failed read. Those are the common state of a chat, D-15
   * admits every member, and each of them posts a message per request, which is
   * exactly the unrated flood the constant's own rationale names. Telegram's
   * per-chat flood control answers that with a 429 against the whole bot, not
   * just against this command.
   *
   * Answers `true` at most once per window. The two statements are a
   * compare-and-set, not a check-then-act: the UPDATE carries the cutoff in its
   * WHERE clause, and the INSERT that follows it is only reached when no row
   * exists at all — where the primary key decides the race, so of any number of
   * simultaneous first requests exactly one is answered. It is claimed BEFORE
   * the reply for the same reason the round-level claim is: a durable claim
   * cannot be undone by a Telegram outage, so an outage cannot be used as a
   * flood amplifier.
   *
   * A thrown claim answers `false` — silence. The right to speak could not be
   * established, and the branch that called this has already logged its own
   * outcome, so nothing is hidden from an operator.
   */
  async claimRoundlessStatusReply(chatId: bigint, now: Date): Promise<boolean> {
    try {
      const claimed = await this.prisma.chatStatusCooldown.updateMany({
        where: {
          chatId,
          lastPostedAt: {
            lte: new Date(now.getTime() - PLANNING_STATUS_COOLDOWN_MS),
          },
        },
        data: { lastPostedAt: now },
      });
      if (claimed.count === 1) return true;
      // Either the row is inside its window or it does not exist yet. Only the
      // second is claimable, and only by whoever wins the primary key.
      await this.prisma.chatStatusCooldown.create({
        data: { chatId, lastPostedAt: now },
      });
      return true;
    } catch {
      // A P2002 means a concurrent first request won the key; anything else
      // means the claim could not be made at all. Both are `false` for the same
      // reason: an unclaimed window is not a licence to speak.
      return false;
    }
  }

  /**
   * Points the round at the message that just became its card (D-14).
   *
   * `anchorMessageId` and `lastStatusPostedAt` move in ONE guarded statement, so
   * the anchor can never be persisted without the cooldown stamp that keeps the
   * next request out — an anchor without a stamp would reopen the flood the
   * stamp exists to close. The stamp is written twice on the ordinary path (once
   * by `status`'s claim, once here) and that redundancy is deliberate: the claim
   * is what serialises concurrent requests, and this write is what makes the
   * pair atomic for anyone reading the row afterwards.
   *
   * `refreshActivity` is the AUTH-03 seam. `lastActivityAt` measures the
   * AUTHOR's silence, and D-15 lets anybody ask for the status — so refreshing
   * it on every request would let any member hold an abandoned round open
   * indefinitely and make administrator takeover unreachable. It is refreshed
   * only when the person asking is the one who owns the round, which is the only
   * case where the request is evidence that the author is still present.
   * Status is part of the compare-and-set too: even a terminal transition that
   * failed to advance a legacy revision must never acquire a fresh anchor.
   */
  async reanchor(
    roundId: string,
    messageId: number,
    expectedRevision: number,
    now: Date,
    refreshActivity: boolean,
  ): Promise<ReanchorResult> {
    try {
      const reanchored = await this.prisma.planningRound.updateMany({
        where: {
          id: roundId,
          status: PlanningRoundStatus.DRAFT,
          revision: expectedRevision,
        },
        data: {
          anchorMessageId: messageId,
          lastStatusPostedAt: now,
          revision: { increment: 1 },
          ...(refreshActivity ? { lastActivityAt: now } : {}),
        },
      });
      return reanchored.count === 1
        ? { kind: "reanchored" }
        : { kind: "stale" };
    } catch {
      return { kind: "failed" };
    }
  }

  /**
   * Mints the ONE extra control a takeover-eligible card offers an
   * administrator, outside the step's own action set.
   *
   * Separate from `mintStepActions` because it is the only control on the card
   * whose presence depends on WHO the card is being drawn for. The step's
   * buttons are a property of the round; this one is a property of the round AND
   * the viewer, and a group card has one body everyone reads — so it can only be
   * decided at the moment somebody asks for a render.
   *
   * Answers `undefined` when the round is not eligible, when the viewer is not a
   * current administrator, or when the viewer already owns the round. Rendering
   * is a convenience: `takeover` re-checks every one of those from freshly read
   * state, so a token minted here confers nothing on its own.
   */
  async mintTakeoverAction(
    round: PlanningRound,
    actorId: bigint,
    role: CurrentTelegramRole,
    now: Date,
  ): Promise<MintedPlanningAction | undefined> {
    if (round.authorUserId === actorId) return undefined;
    if (!isAdministratorRole(role)) return undefined;
    if (!isTakeoverEligible(round, now)) return undefined;
    const minted: MintedPlanningAction = {
      token: createCallbackToken(),
      target: { action: "takeover", roundId: round.id },
    };
    await this.prisma.callbackAction.create({
      data: {
        token: minted.token,
        kind: CallbackActionKind.PLANNING,
        chatId: round.chatId,
        // Bound to the ADMINISTRATOR, not to the round's author: this is the one
        // planning control the author is never offered.
        actorUserId: actorId,
        targetId: createPlanningTarget(minted.target),
        expiresAt: actionExpiresAt(now),
      },
    });
    return minted;
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
