export const WEEKDAYS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

export const PLANNING_ACCESS_POLICIES = [
  "ADMINS_ONLY",
  "PREVIOUS_PARTICIPANTS",
  "ANYONE_IN_CHAT",
] as const;

export type PlanningAccessPolicyValue =
  (typeof PLANNING_ACCESS_POLICIES)[number];

export const PLANNING_ACCESS_LABELS: Readonly<
  Record<PlanningAccessPolicyValue, string>
> = {
  ADMINS_ONLY: "Admins only",
  PREVIOUS_PARTICIPANTS: "Previous participants",
  ANYONE_IN_CHAT: "Anyone in chat",
};

export type MinuteOfDay = number;

export type ScheduleField =
  | "defaultStartMinute"
  | "durationMinutes"
  | "dailyStartMinute"
  | "dailyEndMinute";
