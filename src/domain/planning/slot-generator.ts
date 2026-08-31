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
