import { randomUUID } from "node:crypto";

import { z } from "zod";

export const callbackTokenSchema = z.string().regex(/^v1:[0-9a-f-]{36}$/i);

const timezoneTargetSchema = z.object({
  draftId: z.string().min(1),
  timezone: z.string().min(1),
});

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
