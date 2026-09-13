import { availabilityOutcome } from "../planning/planning-service.js";
import { isoDate, mondayOf } from "../../infrastructure/time/civil.js";
import { civilNow } from "../../infrastructure/time/zoned-clock.js";
import type { ReminderStream } from "./reminder-occurrences.js";

export type ReminderEligibilityInput = Readonly<{
  kind: ReminderStream;
  now: Date;
  dueAt: Date;
  timezone: string;
  scope: string;
  effectiveFrom: Date;
  generation: number;
  currentGeneration: number;
  migrated?: boolean;
  activeDraft?: boolean;
  claimedWeek?: boolean;
  quietUntil?: Date | null;
  status?: string;
  startsAt?: Date | null;
  firstPublishedAt?: Date | null;
  graceRestartAt?: Date | null;
  lastAttemptAt?: Date | null;
  participants?: readonly Readonly<{
    marker: "pending" | "available" | "unavailable";
  }>[];
}>;

/** Current authoritative state, evaluated at reservation as well as generation. */
export function evaluateReminderEligibility(
  input: ReminderEligibilityInput,
): boolean {
  if (
    input.migrated ||
    input.generation !== input.currentGeneration ||
    input.dueAt <= input.effectiveFrom ||
    input.dueAt > input.now
  )
    return false;
  if (input.kind === "PLANNING_START")
    return (
      input.scope === isoDate(mondayOf(civilNow(input.timezone, input.now))) &&
      !input.activeDraft &&
      !input.claimedWeek &&
      !(input.quietUntil && input.now < input.quietUntil)
    );
  const participants = input.participants ?? [];
  if (
    input.status !== "CONFIRMED" ||
    !input.startsAt ||
    input.now >= input.startsAt ||
    !input.firstPublishedAt ||
    !participants.some((p) => p.marker === "pending") ||
    availabilityOutcome(participants) !== "collecting"
  )
    return false;
  const grace = Math.max(
    input.firstPublishedAt.getTime(),
    input.graceRestartAt?.getTime() ?? -Infinity,
  );
  if (input.dueAt.getTime() - grace < 30 * 60 * 1000) return false;
  return (
    !input.lastAttemptAt ||
    input.now.getTime() - input.lastAttemptAt.getTime() >= 30 * 60 * 1000
  );
}
