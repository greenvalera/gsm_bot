import type { MinuteOfDay } from "./types.js";

export type ScheduleValues = Readonly<{
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
}>;

export type ScheduleValidation =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      reason:
        | "invalid-minute"
        | "invalid-duration"
        | "invalid-boundaries"
        | "outside-boundaries";
    }>;

const LOCAL_TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

export function parseLocalTime(value: string): MinuteOfDay {
  const match = LOCAL_TIME.exec(value);
  if (match === null) {
    throw new RangeError("Expected a strict 24-hour HH:MM local time.");
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatLocalTime(minutes: MinuteOfDay): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new RangeError("Expected minutes since local midnight.");
  }
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

export function validateSchedule(values: ScheduleValues): ScheduleValidation {
  const minutes = [
    values.defaultStartMinute,
    values.dailyStartMinute,
    values.dailyEndMinute,
  ];
  if (
    minutes.some(
      (value) => !Number.isInteger(value) || value < 0 || value >= 24 * 60,
    )
  ) {
    return { valid: false, reason: "invalid-minute" };
  }
  if (
    !Number.isInteger(values.durationMinutes) ||
    values.durationMinutes <= 0
  ) {
    return { valid: false, reason: "invalid-duration" };
  }
  if (values.dailyStartMinute >= values.dailyEndMinute) {
    return { valid: false, reason: "invalid-boundaries" };
  }
  if (
    values.defaultStartMinute + values.durationMinutes >
    values.dailyEndMinute
  ) {
    return { valid: false, reason: "outside-boundaries" };
  }
  return { valid: true };
}
