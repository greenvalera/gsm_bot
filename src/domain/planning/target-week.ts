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
 * The definition of "this week is already spoken for", as ONE named function so
 * a later phase extends exactly one place.
 *
 * A CONFIRMED round claims its week, and so does a BOOKED one (D-15) — for the
 * same reason and not as a special case: the week HAS a rehearsal in it, and
 * booking is the position that rehearsal moves to, never a different kind of
 * fact. Leaving BOOKED out re-offers a week whose rehearsal is already booked,
 * and nothing downstream catches it: a non-draft round has already released
 * `activeWeekStart` to NULL, so `@@unique([chatId, activeWeekStart])` has no
 * live row to collide with.
 *
 * A DRAFT round deliberately does NOT claim its week (Pitfall 6): if it did, an
 * author who started on Sunday and resumed on Monday would recompute a different
 * target week and orphan their own card.
 *
 * This list is an INNER filter. Three queries in `planning-service.ts` narrow
 * their own row set by status before `weekIsClaimed` ever sees it, so they read
 * this constant too — widening here alone would leave all three unchanged.
 * Phase 4's LIFE-02 / LIFE-06 is the next editor of the set below.
 *
 * `readonly` is deliberate — a shared authorization input must not be mutable
 * from a call site. Prisma's `in` operator wants a mutable array, so those
 * call sites spread a copy (`{ in: [...WEEK_CLAIMING_STATUSES] }`) rather than
 * widening the type here.
 */
export const WEEK_CLAIMING_STATUSES: readonly PlanningRoundStatus[] = [
  PlanningRoundStatus.CONFIRMED,
  PlanningRoundStatus.BOOKED,
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
 * How many weeks ahead of the current one the search may look before giving up.
 *
 * One year. The search only ever walks CONFIRMED weeks, so reaching the cap
 * means the chat has a confirmed rehearsal for every week of the coming year and
 * there is no honest answer left to give. The bound exists because the predicate
 * is supplied by the caller: an unbounded walk would turn a data shape nobody
 * can see into a hung command, and 53 comparisons against an already-loaded
 * array cost nothing.
 */
export const MAX_WEEK_LOOKAHEAD = 52;

/**
 * The Monday a new round should target (PLAN-03), or `null` when every week in
 * the lookahead window is already claimed.
 *
 * Both inputs are injected: the caller supplies the chat-local civil date (from
 * `civilNow`) and the claim predicate (from the chat's rounds). Nothing here
 * reads `Date.now()` or `Intl`, so the week arithmetic is deterministically
 * testable at any instant.
 *
 * The predicate is asked about EVERY candidate, including the ones the search
 * rolls into. Asking only about the current week and rolling forward once looks
 * equivalent and is not: two consecutive claimed weeks then hand back the second
 * one without ever testing it, and the round created for it becomes a second
 * confirmed rehearsal for a week that already has one.
 * `@@unique([chatId, activeWeekStart])` cannot catch that, because a confirmed
 * round has already released `activeWeekStart` to NULL — there is no live row to
 * collide with. `weekIsClaimed` is the only thing standing there, so it has to
 * be asked about the week that is actually used.
 *
 * `null` rather than a throw: the exhausted window is a real state of the chat,
 * not an infrastructure fault, and the caller has to tell the difference to say
 * anything true about it.
 */
export function targetWeekStart(
  nowCivil: CivilDate,
  isClaimed: (weekStart: string) => boolean,
): string | null {
  let monday = mondayOf(nowCivil);
  for (let ahead = 0; ahead <= MAX_WEEK_LOOKAHEAD; ahead += 1) {
    const candidate = isoDate(monday);
    if (!isClaimed(candidate)) return candidate;
    monday = addDays(monday, 7);
  }
  return null;
}

/** The seven civil dates of a target week, Monday first, as "YYYY-MM-DD". */
export function weekDates(weekStart: string): readonly string[] {
  const monday = mondayOf(parseCivilDate(weekStart));
  return [0, 1, 2, 3, 4, 5, 6].map((offset) =>
    isoDate(addDays(monday, offset)),
  );
}
