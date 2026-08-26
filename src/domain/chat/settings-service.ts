import {
  CallbackActionKind,
  PlanningAccessPolicy,
  Prisma,
  SettingsField,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import {
  createCallbackToken,
  createSettingsTarget,
  parseSettingsTarget,
} from "../../shared/callback-schema.js";
import { validateSchedule } from "./schedule-validator.js";

const DRAFT_LIFETIME_MS = 30 * 60 * 1000;

type SettingsPersistence = Pick<
  PrismaClient,
  "settingsEditDraft" | "chatConfiguration" | "callbackAction" | "$transaction"
>;
type ChatConfiguration = NonNullable<
  Awaited<ReturnType<PrismaClient["chatConfiguration"]["findUnique"]>>
>;
type SettingsEditDraft = NonNullable<
  Awaited<ReturnType<PrismaClient["settingsEditDraft"]["findUnique"]>>
>;

export type CommittedSettingsResult =
  | Readonly<{ kind: "committed"; configuration: ChatConfiguration }>
  | Readonly<{ kind: "not-configured" }>
  | Readonly<{ kind: "failed" }>;

export type SettingsReview = Readonly<{
  draftId: string;
  field: SettingsField;
  current: string | number | readonly number[] | PlanningAccessPolicy;
  replacement: string | number | readonly number[] | PlanningAccessPolicy;
}>;
export type PlanningAccessReview = Omit<
  SettingsReview,
  "current" | "replacement"
> &
  Readonly<{
    current: PlanningAccessPolicy;
    replacement: PlanningAccessPolicy;
  }>;
export type SaveSettingsResult =
  | Readonly<{ kind: "saved" }>
  | Readonly<{
      kind: "duplicate" | "stale" | "expired" | "conflict" | "failed";
    }>;

export type SettingsActionTarget =
  | Readonly<{ action: "begin"; field: SettingsField }>
  | Readonly<{ draftId: string; action: "select"; value: unknown }>
  | Readonly<{ draftId: string; action: "timezone-candidate"; value: string }>
  | Readonly<{ draftId: string; action: "save" | "keep" }>
  | Readonly<{ action: "begin-planning-access" }>
  | Readonly<{
      draftId: string;
      action: "select-planning-access";
      value: PlanningAccessPolicy;
    }>;

class SettingsTransactionAbort extends Error {
  constructor(readonly result: SaveSettingsResult) {
    super(result.kind);
    this.name = "SettingsTransactionAbort";
  }
}

function expiresAt(now: Date) {
  return new Date(now.getTime() + DRAFT_LIFETIME_MS);
}

function isPlanningAccessPolicy(value: unknown): value is PlanningAccessPolicy {
  return Object.values(PlanningAccessPolicy).includes(
    value as PlanningAccessPolicy,
  );
}

function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isMinute(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < 24 * 60
  );
}

function fieldProperty(field: SettingsField) {
  switch (field) {
    case SettingsField.TIMEZONE:
      return "timezone" as const;
    case SettingsField.DEFAULT_WEEKDAY:
      return "defaultWeekday" as const;
    case SettingsField.DEFAULT_START_MINUTE:
      return "defaultStartMinute" as const;
    case SettingsField.DURATION_MINUTES:
      return "durationMinutes" as const;
    case SettingsField.DAILY_START_MINUTE:
      return "dailyStartMinute" as const;
    case SettingsField.DAILY_END_MINUTE:
      return "dailyEndMinute" as const;
    case SettingsField.REMINDER_MINUTES:
      return "reminderMinutes" as const;
    case SettingsField.PLANNING_ACCESS_POLICY:
      return "planningAccessPolicy" as const;
  }
}

function fieldValueIsValid(field: SettingsField, value: unknown) {
  switch (field) {
    case SettingsField.TIMEZONE:
      return isIanaTimezone(value);
    case SettingsField.DEFAULT_WEEKDAY:
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 7
      );
    case SettingsField.DURATION_MINUTES:
      return typeof value === "number" && Number.isInteger(value) && value > 0;
    case SettingsField.DEFAULT_START_MINUTE:
    case SettingsField.DAILY_START_MINUTE:
    case SettingsField.DAILY_END_MINUTE:
      return isMinute(value);
    case SettingsField.REMINDER_MINUTES:
      return (
        Array.isArray(value) && value.length === 2 && value.every(isMinute)
      );
    case SettingsField.PLANNING_ACCESS_POLICY:
      return isPlanningAccessPolicy(value);
  }
}

function configurationIsValid(configuration: ChatConfiguration) {
  return (
    isIanaTimezone(configuration.timezone) &&
    Number.isInteger(configuration.defaultWeekday) &&
    configuration.defaultWeekday >= 1 &&
    configuration.defaultWeekday <= 7 &&
    isPlanningAccessPolicy(configuration.planningAccessPolicy) &&
    fieldValueIsValid(
      SettingsField.REMINDER_MINUTES,
      configuration.reminderMinutes,
    ) &&
    validateSchedule(configuration).valid
  );
}

function replacementValue(draft: SettingsEditDraft): unknown {
  const payload = draft.replacementPayload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    return undefined;
  return (payload as Record<string, unknown>).value;
}

function configurationWithReplacement(
  active: ChatConfiguration,
  field: SettingsField,
  value: unknown,
): ChatConfiguration | undefined {
  if (!fieldValueIsValid(field, value)) return undefined;
  const property = fieldProperty(field);
  const candidate = { ...active, [property]: value } as ChatConfiguration;
  return configurationIsValid(candidate) ? candidate : undefined;
}

/** Reads only complete committed settings and applies one owner-bound field at a time. */
export class SettingsService {
  constructor(private readonly prisma: SettingsPersistence) {}

  async getCommitted(chatId: bigint): Promise<CommittedSettingsResult> {
    try {
      const configuration = await this.prisma.chatConfiguration.findUnique({
        where: { chatId },
      });
      if (configuration === null) return { kind: "not-configured" };
      return configurationIsValid(configuration)
        ? { kind: "committed", configuration }
        : { kind: "failed" };
    } catch {
      return { kind: "failed" };
    }
  }

  async beginEdit(
    chatId: bigint,
    actorId: bigint,
    field: SettingsField,
    now: Date,
  ) {
    const committed = await this.getCommitted(chatId);
    if (committed.kind !== "committed")
      throw new Error("Committed chat configuration is unavailable.");
    return this.prisma.settingsEditDraft.upsert({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
      create: {
        chatId,
        actorUserId: actorId,
        field,
        expectedRevision: committed.configuration.revision,
        expiresAt: expiresAt(now),
      },
      update: {
        field,
        replacementPayload: Prisma.JsonNull,
        expectedRevision: committed.configuration.revision,
        expiresAt: expiresAt(now),
      },
    });
  }

  beginPlanningAccessEdit(chatId: bigint, actorId: bigint, now: Date) {
    return this.beginEdit(
      chatId,
      actorId,
      SettingsField.PLANNING_ACCESS_POLICY,
      now,
    );
  }

  async selectValue(
    chatId: bigint,
    actorId: bigint,
    draftId: string,
    value: unknown,
    now: Date,
  ): Promise<SettingsReview | undefined> {
    const draft = await this.prisma.settingsEditDraft.findUnique({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
    });
    if (draft === null || draft.id !== draftId || draft.expiresAt <= now) {
      if (draft !== null && draft.expiresAt <= now)
        await this.prisma.settingsEditDraft.delete({ where: { id: draft.id } });
      return undefined;
    }
    const committed = await this.getCommitted(chatId);
    if (committed.kind !== "committed") return undefined;
    const candidate = configurationWithReplacement(
      committed.configuration,
      draft.field,
      value,
    );
    if (candidate === undefined) return undefined;
    const updated = await this.prisma.settingsEditDraft.update({
      where: { id: draft.id },
      data: {
        replacementPayload: { value } as Prisma.InputJsonValue,
        expiresAt: expiresAt(now),
      },
    });
    const property = fieldProperty(updated.field);
    return {
      draftId: updated.id,
      field: updated.field,
      current: committed.configuration[property],
      replacement: candidate[property],
    };
  }

  async selectPlanningAccessPolicy(
    chatId: bigint,
    actorId: bigint,
    draftId: string,
    policy: PlanningAccessPolicy,
    now: Date,
  ) {
    const review = await this.selectValue(
      chatId,
      actorId,
      draftId,
      policy,
      now,
    );
    return review?.field === SettingsField.PLANNING_ACCESS_POLICY
      ? (review as PlanningAccessReview)
      : undefined;
  }

  /**
   * Discards one lapsed settings-edit draft, and only a lapsed one.
   *
   * Every clause of the predicate is load-bearing. `id`, `chatId` and
   * `actorUserId` bind the deletion to the exact row the carrier route
   * observed, so it can never reach another member's draft or another chat's.
   * `expiresAt: { lte: now }` makes the statement structurally incapable of
   * removing a LIVE draft: if a concurrent `beginEdit` renewed the row between
   * the route's read and this call, the delete matches nothing and an
   * administrator's in-progress edit survives instead of being destroyed by a
   * stale observation (threat T-01-23-02).
   *
   * `chatConfiguration` is deliberately not referenced. An expiry reports that
   * nothing was applied, so it must not be able to apply anything.
   */
  async discardExpiredDraft(
    chatId: bigint,
    actorId: bigint,
    draftId: string,
    now: Date,
  ) {
    const discarded = await this.prisma.settingsEditDraft.deleteMany({
      where: {
        id: draftId,
        chatId,
        actorUserId: actorId,
        expiresAt: { lte: now },
      },
    });
    return discarded.count === 1;
  }

  async createAction(
    chatId: bigint,
    actorId: bigint,
    target: SettingsActionTarget,
    now: Date,
  ) {
    const token = createCallbackToken();
    await this.prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.SETTINGS_EDIT,
        chatId,
        actorUserId: actorId,
        targetId: createSettingsTarget(target),
        expiresAt: expiresAt(now),
      },
    });
    return token;
  }

  createSaveAction(
    chatId: bigint,
    actorId: bigint,
    draftId: string,
    now: Date,
  ) {
    return this.createAction(chatId, actorId, { draftId, action: "save" }, now);
  }

  async consumeSelectionAction(token: string, now: Date) {
    const consumed = await this.prisma.callbackAction.updateMany({
      where: { token, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    return consumed.count === 1;
  }

  async saveChange(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<SaveSettingsResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.SETTINGS_EDIT ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          throw new SettingsTransactionAbort({ kind: "stale" });
        if (action.consumedAt !== null)
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        const target = parseSettingsTarget(action.targetId);
        if (!target.success || target.data.action !== "save")
          throw new SettingsTransactionAbort({ kind: "stale" });
        const draft = await tx.settingsEditDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId)
          throw new SettingsTransactionAbort({ kind: "stale" });
        if (draft.expiresAt <= now) {
          await tx.settingsEditDraft.delete({ where: { id: draft.id } });
          return { kind: "expired" };
        }
        const active = await tx.chatConfiguration.findUnique({
          where: { chatId },
        });
        const candidate =
          active === null
            ? undefined
            : configurationWithReplacement(
                active,
                draft.field,
                replacementValue(draft),
              );
        if (candidate === undefined)
          throw new SettingsTransactionAbort({ kind: "failed" });
        if (draft.expectedRevision !== active!.revision)
          throw new SettingsTransactionAbort({ kind: "conflict" });
        const property = fieldProperty(draft.field);
        const updated = await tx.chatConfiguration.updateMany({
          where: { chatId, revision: draft.expectedRevision },
          data: {
            [property]: candidate[property],
            revision: { increment: 1 },
          } as never,
        });
        if (updated.count !== 1)
          throw new SettingsTransactionAbort({ kind: "conflict" });
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1)
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        await tx.settingsEditDraft.delete({ where: { id: draft.id } });
        return { kind: "saved" };
      });
    } catch (error) {
      return error instanceof SettingsTransactionAbort
        ? error.result
        : { kind: "failed" };
    }
  }

  async keepCurrent(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<SaveSettingsResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.SETTINGS_EDIT ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          throw new SettingsTransactionAbort({ kind: "stale" });
        if (action.consumedAt !== null)
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        const target = parseSettingsTarget(action.targetId);
        if (!target.success || target.data.action !== "keep")
          throw new SettingsTransactionAbort({ kind: "stale" });
        const draft = await tx.settingsEditDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId)
          throw new SettingsTransactionAbort({ kind: "stale" });
        if (draft.expiresAt <= now) {
          await tx.settingsEditDraft.delete({ where: { id: draft.id } });
          return { kind: "expired" };
        }
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1)
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        await tx.settingsEditDraft.delete({ where: { id: draft.id } });
        return { kind: "saved" };
      });
    } catch (error) {
      return error instanceof SettingsTransactionAbort
        ? error.result
        : { kind: "failed" };
    }
  }
}
