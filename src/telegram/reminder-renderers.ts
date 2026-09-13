import {
  addDays,
  isoDate,
  parseCivilDate,
} from "../infrastructure/time/civil.js";

export function renderPlanningReminder(
  targetWeek: string,
  callbackData: string,
) {
  return {
    text: `Plan rehearsal for ${targetWeek} – ${isoDate(addDays(parseCivilDate(targetWeek), 6))}.`,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Start planning", callback_data: callbackData }],
      ],
    },
  };
}
