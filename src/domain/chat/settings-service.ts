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
type ChatConfiguration = Awaited<
  ReturnType<PrismaClient["chatConfiguration"]["findUnique"]>
> &
  object;
type SettingsEditDraft = Awaited<
  ReturnType<PrismaClient["settingsEditDraft"]["findUnique"]>
> &
  object;

export type CommittedSettingsResult =
  | Readonly<{ kind: "committed"; configuration: ChatConfiguration }>
  | Readonly<{ kind: "not-configured" }>
  | Readonly<{ kind: "failed" }>;

export type PlanningAccessReview = Readonly<{
  draftId: string;
  current: PlanningAccessPolicy;
  replacement: PlanningAccessPolicy;
}>;

export type SaveSettingsResult =
  | Readonly<{ kind: "saved" }>
  | Readonly<{
      kind: "duplicate" | "stale" | "expired" | "conflict" | "failed";
    }>;

type SettingsActionTarget =
  | Readonly<{ action: "begin-planning-access" }>
  | Readonly<{
      draftId: string;
      action: "select-planning-access";
      value: PlanningAccessPolicy;
    }>
  | Readonly<{ draftId: string; action: "save" | "keep" }>;

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
  return (
    value === PlanningAccessPolicy.ADMINS_ONLY ||
    value === PlanningAccessPolicy.PREVIOUS_PARTICIPANTS ||
    value === PlanningAccessPolicy.ANYONE_IN_CHAT
  );
}

function replacementPolicy(draft: SettingsEditDraft) {
  const payload = draft.replacementPayload;
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !("planningAccessPolicy" in payload) ||
    !isPlanningAccessPolicy(payload.planningAccessPolicy)
  ) {
    return undefined;
  }
  return payload.planningAccessPolicy;
}

function configurationIsValid(configuration: ChatConfiguration) {
  return (
    configuration.timezone.length > 0 &&
    Number.isInteger(configuration.defaultWeekday) &&
    configuration.defaultWeekday >= 1 &&
    configuration.defaultWeekday <= 7 &&
    isPlanningAccessPolicy(configuration.planningAccessPolicy) &&
    configuration.reminderMinutes.length === 2 &&
    configuration.reminderMinutes.every(
      (value) => Number.isInteger(value) && value >= 0 && value < 24 * 60,
    ) &&
    validateSchedule(configuration).valid
  );
}

/** Reads only a complete committed configuration and owns revision-safe edits. */
export class SettingsService {
  constructor(private readonly prisma: SettingsPersistence) {}

  async getCommitted(chatId: bigint): Promise<CommittedSettingsResult> {
    try {
      const configuration = await this.prisma.chatConfiguration.findUnique({
        where: { chatId },
      });
      return configuration === null
        ? { kind: "not-configured" }
        : { kind: "committed", configuration };
    } catch {
      return { kind: "failed" };
    }
  }

  async beginPlanningAccessEdit(chatId: bigint, actorId: bigint, now: Date) {
    const configuration = await this.prisma.chatConfiguration.findUnique({
      where: { chatId },
    });
    if (configuration === null || !configurationIsValid(configuration)) {
      throw new Error("Committed chat configuration is unavailable.");
    }
    return this.prisma.settingsEditDraft.upsert({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
      create: {
        chatId,
        actorUserId: actorId,
        field: SettingsField.PLANNING_ACCESS_POLICY,
        expectedRevision: configuration.revision,
        expiresAt: expiresAt(now),
      },
      update: {
        field: SettingsField.PLANNING_ACCESS_POLICY,
        replacementPayload: Prisma.JsonNull,
        expectedRevision: configuration.revision,
        expiresAt: expiresAt(now),
      },
    });
  }

  async selectPlanningAccessPolicy(
    chatId: bigint,
    actorId: bigint,
    draftId: string,
    policy: PlanningAccessPolicy,
    now: Date,
  ): Promise<PlanningAccessReview | undefined> {
    if (!isPlanningAccessPolicy(policy)) {
      throw new RangeError("Unsupported planning access policy.");
    }
    const draft = await this.prisma.settingsEditDraft.findUnique({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
    });
    if (
      draft === null ||
      draft.id !== draftId ||
      draft.field !== SettingsField.PLANNING_ACCESS_POLICY
    ) {
      return undefined;
    }
    if (draft.expiresAt <= now) {
      await this.prisma.settingsEditDraft.delete({ where: { id: draft.id } });
      return undefined;
    }
    const committed = await this.prisma.chatConfiguration.findUnique({
      where: { chatId },
    });
    if (committed === null || !configurationIsValid(committed))
      return undefined;
    const updated = await this.prisma.settingsEditDraft.update({
      where: { id: draft.id },
      data: {
        replacementPayload: { planningAccessPolicy: policy },
        expiresAt: expiresAt(now),
      },
    });
    return {
      draftId: updated.id,
      current: committed.planningAccessPolicy,
      replacement: policy,
    };
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
        ) {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
        if (action.consumedAt !== null) {
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        }
        const target = parseSettingsTarget(action.targetId);
        if (!target.success || target.data.action !== "save") {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
        const draft = await tx.settingsEditDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId) {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
        if (draft.expiresAt <= now) {
          await tx.settingsEditDraft.delete({ where: { id: draft.id } });
          return { kind: "expired" };
        }
        const replacement = replacementPolicy(draft);
        const active = await tx.chatConfiguration.findUnique({
          where: { chatId },
        });
        if (
          active === null ||
          !configurationIsValid(active) ||
          draft.field !== SettingsField.PLANNING_ACCESS_POLICY ||
          replacement === undefined
        ) {
          throw new SettingsTransactionAbort({ kind: "failed" });
        }
        if (draft.expectedRevision !== active.revision) {
          throw new SettingsTransactionAbort({ kind: "conflict" });
        }
        const updated = await tx.chatConfiguration.updateMany({
          where: { chatId, revision: draft.expectedRevision },
          data: {
            planningAccessPolicy: replacement,
            revision: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new SettingsTransactionAbort({ kind: "conflict" });
        }
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) {
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        }
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
        ) {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
        if (action.consumedAt !== null) {
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        }
        const target = parseSettingsTarget(action.targetId);
        if (!target.success || target.data.action !== "keep") {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
        const draft = await tx.settingsEditDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId) {
          throw new SettingsTransactionAbort({ kind: "stale" });
        }
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
        if (consumed.count !== 1) {
          throw new SettingsTransactionAbort({ kind: "duplicate" });
        }
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
