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

const settingsTargetSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("begin"),
    field: z.enum([
      "TIMEZONE",
      "DEFAULT_WEEKDAY",
      "DEFAULT_START_MINUTE",
      "DURATION_MINUTES",
      "DAILY_START_MINUTE",
      "DAILY_END_MINUTE",
      "REMINDER_MINUTES",
      "PLANNING_ACCESS_POLICY",
    ]),
  }),
  z.object({
    draftId: z.string().min(1),
    action: z.literal("select"),
    value: z.unknown(),
  }),
  z.object({
    draftId: z.string().min(1),
    action: z.literal("timezone-candidate"),
    value: z.string().min(1),
  }),
  // Existing callbacks are accepted while an in-flight Plan 08 dashboard ages out.
  z.object({ action: z.literal("begin-planning-access") }),
  z.object({
    draftId: z.string().min(1),
    action: z.literal("select-planning-access"),
    value: z.enum(["ADMINS_ONLY", "PREVIOUS_PARTICIPANTS", "ANYONE_IN_CHAT"]),
  }),
  z.object({ draftId: z.string().min(1), action: z.enum(["save", "keep"]) }),
]);

// Roster-surface callback targets. Membership actions name the exact target
// membership; view actions carry only a page index. Neither ever carries a
// Telegram identity, a display name, or an authorization claim.
const rosterRemovalTargetSchema = z.union([
  z
    .object({
      action: z.enum(["request", "confirm", "keep"]),
      membershipId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.enum(["page", "retry"]),
      page: z.number().int().min(0),
    })
    .strict(),
]);

// Planning-surface callback targets. This vocabulary is derived from the
// `PlanningService.stepTargets`, `mintTakeoverAction` and
// `mintAvailabilityActions` minting sites. The wire token stays an opaque
// `v1:<uuid>`; the date, minute, answer and round id live ONLY in the
// server-side `CallbackAction.targetId` alongside the chat, actor and expiry
// bindings. Nothing on the wire is ever an authorization claim (threat T-01-05).
//
// The ANSWER member is the one target whose row is shared by the whole lineup
// and never consumed: it grants the right to ATTEMPT an answer, and the answer's
// exactly-once property lives on the `PlanningParticipant` row instead. The
// BOOKING member is declared here so the vocabulary lands in one edit; it is
// minted and dispatched by a later plan of this phase.
const planningTargetSchema = z.union([
  z
    .object({
      action: z.literal("day"),
      roundId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("time"),
      roundId: z.string().min(1),
      startMinute: z.number().int().min(0).max(1439),
    })
    .strict(),
  z
    .object({
      action: z.enum(["back", "confirm", "takeover"]),
      roundId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("answer"),
      roundId: z.string().min(1),
      answer: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    })
    .strict(),
  z
    .object({
      action: z.enum(["book-request", "book-apply", "book-keep"]),
      roundId: z.string().min(1),
    })
    .strict(),
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

export function createSettingsTarget(
  target: z.input<typeof settingsTargetSchema>,
) {
  return JSON.stringify(target);
}

export function parseSettingsTarget(targetId: string | null) {
  try {
    return settingsTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return settingsTargetSchema.safeParse(undefined);
  }
}

export type RosterRemovalAction = z.infer<typeof rosterRemovalTargetSchema>;

export function createRosterRemovalTarget(target: RosterRemovalAction) {
  return JSON.stringify(target);
}

export function parseRosterRemovalTarget(targetId: string | null) {
  try {
    return rosterRemovalTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return rosterRemovalTargetSchema.safeParse(undefined);
  }
}

export type PlanningTargetAction = z.infer<typeof planningTargetSchema>;

export function createPlanningTarget(target: PlanningTargetAction) {
  return JSON.stringify(target);
}

export function parsePlanningTarget(targetId: string | null) {
  try {
    return planningTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return planningTargetSchema.safeParse(undefined);
  }
}

/** Chat and actor identity of one update; both are required before authorization. */
export type ActionContext = Readonly<{ chatId: bigint; actorId: bigint }>;

/**
 * Binds an update to its chat and its acting Telegram user. An update missing
 * either identity can never be authorized, so it resolves to `undefined`.
 */
export function actionContext(
  chatId: number | undefined,
  actorId: number | undefined,
): ActionContext | undefined {
  return chatId === undefined || actorId === undefined
    ? undefined
    : { chatId: BigInt(chatId), actorId: BigInt(actorId) };
}
