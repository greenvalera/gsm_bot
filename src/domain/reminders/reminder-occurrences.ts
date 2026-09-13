import type { MinuteOfDay } from "../chat/types.js";
import { addDays, isoDate, mondayOf } from "../../infrastructure/time/civil.js";
import {
  civilNow,
  resolveWallClock,
} from "../../infrastructure/time/zoned-clock.js";

export type ReminderStream = "PLANNING_START" | "FOLLOW_UP";

/** Caller supplies one immutable stream after reloading authoritative state. */
export function coalesceDueOccurrences(
  rows: readonly { id: string; dueAt: Date; eligible: boolean }[],
  now: Date,
) {
  const eligible = [],
    skippedIds: string[] = [],
    obsoleteIds: string[] = [];
  for (const row of rows) {
    if (row.dueAt > now) continue;
    if (!row.eligible) obsoleteIds.push(row.id);
    else if (now.getTime() - row.dueAt.getTime() > 7200000)
      skippedIds.push(row.id);
    else eligible.push(row);
  }
  eligible.sort(
    (a, b) => a.dueAt.getTime() - b.dueAt.getTime() || a.id.localeCompare(b.id),
  );
  return {
    selectedId: eligible.at(-1)?.id ?? null,
    coalescedIds: eligible.slice(0, -1).map((r) => r.id),
    skippedIds,
    obsoleteIds,
  };
}
export type OccurrenceCandidate = Readonly<{
  chatId: bigint;
  kind: ReminderStream;
  scope: string;
  generation: number;
  civilDate: string;
  minute: MinuteOfDay;
  dueAt: Date;
  roundId?: string;
}>;
export type OccurrenceInput = Readonly<{
  chatId: bigint;
  kind: ReminderStream;
  generation: number;
  timezone: string;
  effectiveFrom: Date;
  now: Date;
  minutes?: readonly MinuteOfDay[];
  roundId?: string;
  startsAt?: Date;
}>;

/** Bounded reconstruction: two hours behind now through tomorrow's civil day.
 * Planning never pre-generates a future week. Gaps vanish; overlaps resolve once.
 */
export function enumerateReminderOccurrences(
  input: OccurrenceInput,
): readonly OccurrenceCandidate[] {
  if (input.kind === "FOLLOW_UP" && !input.roundId) return [];
  const earliest = input.now.getTime() - 2 * 60 * 60 * 1000;
  const today = civilNow(input.timezone, input.now);
  const end = isoDate(addDays(today, 1));
  const week = isoDate(mondayOf(today));
  const minutes =
    input.kind === "PLANNING_START"
      ? [600]
      : [...new Set(input.minutes ?? [])].sort((a, b) => a - b);
  const result: OccurrenceCandidate[] = [];
  let day = civilNow(input.timezone, new Date(earliest));
  // Civil dates are incremented, never local instants plus 24 hours.
  for (
    let count = 0;
    count < 4 && isoDate(day) <= end;
    count++, day = { ...addDays(day, 1), minuteOfDay: 0 }
  ) {
    const date = isoDate(day);
    if (input.kind === "PLANNING_START" && isoDate(mondayOf(day)) !== week)
      continue;
    for (const minute of minutes) {
      if (!Number.isInteger(minute) || minute < 0 || minute >= 1440) continue;
      const resolved = resolveWallClock(
        input.timezone,
        day.year,
        day.month,
        day.day,
        minute,
      );
      if (resolved.kind === "skipped") continue;
      const instant = resolved.instantMs;
      if (
        instant < earliest ||
        instant <= input.effectiveFrom.getTime() ||
        (input.startsAt && instant >= input.startsAt.getTime())
      )
        continue;
      result.push({
        chatId: input.chatId,
        kind: input.kind,
        scope: input.kind === "PLANNING_START" ? week : input.roundId!,
        generation: input.generation,
        civilDate: date,
        minute,
        dueAt: new Date(instant),
        ...(input.kind === "FOLLOW_UP" ? { roundId: input.roundId! } : {}),
      });
    }
  }
  return result;
}
