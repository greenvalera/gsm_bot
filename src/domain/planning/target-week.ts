import { PlanningRoundStatus } from "../../generated/prisma/client.js";
import {
  addDays,
  isoDate,
  mondayOf,
  parseCivilDate,
  type CivilDate,
} from "../../infrastructure/time/civil.js";

/** The minimum a round must expose for the week-claim question to be asked. */
export type WeekClaimingRound = Readonly<{
  status: PlanningRoundStatus;
  targetWeekStart: string;
}>;

/**
 * The Phase 2 definition of "this week is already spoken for", as ONE named
 * function so a later phase extends exactly one place.
 *
 * Only a CONFIRMED round claims its week. A DRAFT round deliberately does NOT
 * (Pitfall 6): if it did, an author who started on Sunday and resumed on Monday
 * would recompute a different target week and orphan their own card. Phase 4
 * narrows this to booked/cancelled state (LIFE-02 / LIFE-06) by changing the
 * status set below and nothing else.
 */
export const WEEK_CLAIMING_STATUSES: readonly PlanningRoundStatus[] = [
  PlanningRoundStatus.CONFIRMED,
];

export function weekIsClaimed(
  rounds: readonly WeekClaimingRound[],
  weekStart: string,
): boolean {
  return rounds.some(
    (round) =>
      round.targetWeekStart === weekStart &&
      WEEK_CLAIMING_STATUSES.includes(round.status),
  );
}

/**
 * The Monday a new round should target (PLAN-03).
 *
 * Both inputs are injected: the caller supplies the chat-local civil date (from
 * `civilNow`) and the claim predicate (from the chat's rounds). Nothing here
 * reads `Date.now()` or `Intl`, so the week arithmetic is deterministically
 * testable at any instant.
 */
export function targetWeekStart(
  nowCivil: CivilDate,
  isClaimed: (weekStart: string) => boolean,
): string {
  const monday = mondayOf(nowCivil);
  const current = isoDate(monday);
  return isClaimed(current) ? isoDate(addDays(monday, 7)) : current;
}

/** The seven civil dates of a target week, Monday first, as "YYYY-MM-DD". */
export function weekDates(weekStart: string): readonly string[] {
  const monday = mondayOf(parseCivilDate(weekStart));
  return [0, 1, 2, 3, 4, 5, 6].map((offset) =>
    isoDate(addDays(monday, offset)),
  );
}
