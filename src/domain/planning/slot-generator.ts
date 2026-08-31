import type { CivilDate } from "../../infrastructure/time/civil.js";
import { resolveWallClock } from "../../infrastructure/time/zoned-clock.js";
import {
  formatLocalTime,
  validateSchedule,
} from "../chat/schedule-validator.js";
import type { MinuteOfDay } from "../chat/types.js";

/** One offerable rehearsal start within the chat's configured daily window. */
export type Slot = Readonly<{ startMinute: MinuteOfDay; label: string }>;

/** The generated grid is hourly (CONF-04 / D-06). */
const SLOT_STEP_MINUTES = 60;

const MINUTES_PER_DAY = 24 * 60;

export type SlotWindow = Readonly<{
  dailyStartMinute: number;
  dailyEndMinute: number;
  durationMinutes: number;
}>;

/**
 * The hourly starts at which a whole rehearsal fits inside the daily window.
 *
 * Generation is purely civil: DST never changes which starts the containment
 * rule admits (DST policy rule 1). Admission delegates to `validateSchedule`
 * rather than restating `start >= dailyStart && start + duration <= dailyEnd`.
 * The floor half of that rule was missing until Phase 1 plan 01-18 repaired it
 * (findings F-5/F-6), and a second copy here would be a second place to get it
 * wrong. The first candidate is `dailyStartMinute` itself, because starting
 * exactly at the floor is inside the window.
 */
export function generateSlots(window: SlotWindow): readonly Slot[] {
  const slots: Slot[] = [];
  for (
    let minute = window.dailyStartMinute;
    minute >= 0 && minute < MINUTES_PER_DAY;
    minute += SLOT_STEP_MINUTES
  ) {
    const admitted = validateSchedule({
      defaultStartMinute: minute,
      durationMinutes: window.durationMinutes,
      dailyStartMinute: window.dailyStartMinute,
      dailyEndMinute: window.dailyEndMinute,
    });
    if (!admitted.valid) continue;
    slots.push({ startMinute: minute, label: formatLocalTime(minute) });
  }
  return slots;
}

/** Whether a generated slot can actually be picked, and if not, why not. */
export type SlotAvailability = "available" | "past" | "nonexistent";

/**
 * Whether an hour on the chosen day is still offerable.
 *
 * The two refusals are kept APART on purpose. "This hour has passed" and "this
 * hour does not exist in this chat's timezone" are different facts, and an
 * operator reading the logs — or an author reading the alert — must be able to
 * tell them apart, even though D-07 gives them the same visible treatment: one
 * consistent unavailability rule across both selectors, two distinct reasons
 * underneath it.
 *
 * Past-ness is decided by comparing INSTANTS, never civil minutes. On a
 * transition day the civil comparison is simply wrong — a repeated hour has two
 * instants and one of them can already be behind the chat while the other is
 * not — and it is exactly the day on which a wrong answer is hardest to notice.
 * A slot starting at this very instant is past: a rehearsal to agree on is one
 * that has not begun.
 */
export function slotAvailability(
  timezone: string,
  date: CivilDate,
  startMinute: MinuteOfDay,
  now: Date,
): SlotAvailability {
  const resolved = resolveWallClock(
    timezone,
    date.year,
    date.month,
    date.day,
    startMinute,
  );
  // DST policy rule 2: rendered and refused, never quietly relocated to the
  // neighbouring instant the clock skipped to.
  if (resolved.kind === "skipped") return "nonexistent";
  return resolved.instantMs <= now.getTime() ? "past" : "available";
}
