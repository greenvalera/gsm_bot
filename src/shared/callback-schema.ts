import { randomUUID } from "node:crypto";

import { z } from "zod";

export const callbackTokenSchema = z.string().regex(/^v1:[0-9a-f-]{36}$/i);

const timezoneTargetSchema = z.object({
  draftId: z.string().min(1),
  timezone: z.string().min(1),
});

const setupTargetSchema = z.discriminatedUnion("action", [
  z.object({
    draftId: z.string().min(1),
    action: z.literal("weekday"),
    value: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  }),
  z.object({
    draftId: z.string().min(1),
    action: z.enum(["reminders-defaults", "reminders-edit"]),
  }),
  z.object({
    draftId: z.string().min(1),
    action: z.enum(["save", "cancel"]),
  }),
  z.object({
    draftId: z.string().min(1),
    action: z.literal("policy"),
    value: z.enum(["ADMINS_ONLY", "PREVIOUS_PARTICIPANTS", "ANYONE_IN_CHAT"]),
  }),
]);

export function createCallbackToken() {
  return `v1:${randomUUID()}`;
}

export function createTimezoneTarget(draftId: string, timezone: string) {
  return JSON.stringify({ draftId, timezone });
}

export function parseTimezoneTarget(targetId: string | null) {
  try {
    return timezoneTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return timezoneTargetSchema.safeParse(undefined);
  }
}

export function createSetupTarget(target: z.input<typeof setupTargetSchema>) {
  return JSON.stringify(target);
}

export function parseSetupTarget(targetId: string | null) {
  try {
    return setupTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return setupTargetSchema.safeParse(undefined);
  }
}
