import {
  PlanningAccessPolicy,
  SetupStep,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { parseSetupTarget } from "../../shared/callback-schema.js";
import { validateSchedule } from "./schedule-validator.js";
import type {
  PlanningAccessPolicyValue,
  ScheduleField,
  Weekday,
} from "./types.js";

const DRAFT_LIFETIME_MS = 30 * 60 * 1000;

type SetupDraftClient = Pick<PrismaClient, "setupDraft">;
type SetupPersistence = Pick<
  PrismaClient,
  "setupDraft" | "chatConfiguration" | "callbackAction" | "$transaction"
>;

type SetupDraft = Awaited<
  ReturnType<SetupDraftClient["setupDraft"]["findUnique"]>
> &
  object;

export type ActiveSetupDraft = Readonly<{
  kind: "active";
  draft: SetupDraft;
}>;

export type SetupDraftLookup =
  ActiveSetupDraft | Readonly<{ kind: "missing" | "expired" }>;

export type CompleteSetupConfiguration = Readonly<{
  timezone: string;
  defaultWeekday: number;
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
  reminderMinutes: readonly [number, number];
  planningAccessPolicy: PlanningAccessPolicy;
}>;

export type SaveConfigurationResult =
  | Readonly<{ kind: "saved"; configuration: CompleteSetupConfiguration }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "failed" }>;

export type CancelSetupResult =
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "stale" }>
  | Readonly<{ kind: "expired" }>
  | Readonly<{ kind: "failed" }>;

class SetupTransactionAbort extends Error {
  constructor(readonly result: SaveConfigurationResult | CancelSetupResult) {
    super(result.kind);
    this.name = "SetupTransactionAbort";
  }
}

function expiresAt(now: Date) {
  return new Date(now.getTime() + DRAFT_LIFETIME_MS);
}

function isCompleteSchedule(draft: SetupDraft): draft is SetupDraft & {
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
} {
  return (
    draft.defaultStartMinute !== null &&
    draft.durationMinutes !== null &&
    draft.dailyStartMinute !== null &&
    draft.dailyEndMinute !== null
  );
}

function isWeekday(value: number): value is 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function completeConfiguration(
  draft: SetupDraft,
): CompleteSetupConfiguration | undefined {
  if (
    draft.timezone === null ||
    draft.defaultWeekday === null ||
    !isWeekday(draft.defaultWeekday) ||
    !isCompleteSchedule(draft) ||
    draft.reminderMinutes.length !== 2 ||
    draft.reminderMinutes.some((value) => value < 0 || value >= 24 * 60) ||
    draft.planningAccessPolicy === null ||
    !validateSchedule(draft).valid
  ) {
    return undefined;
  }
  const [firstReminder, secondReminder] = draft.reminderMinutes;
  if (firstReminder === undefined || secondReminder === undefined) {
    return undefined;
  }
  return {
    timezone: draft.timezone,
    defaultWeekday: draft.defaultWeekday,
    defaultStartMinute: draft.defaultStartMinute,
    durationMinutes: draft.durationMinutes,
    dailyStartMinute: draft.dailyStartMinute,
    dailyEndMinute: draft.dailyEndMinute,
    reminderMinutes: [firstReminder, secondReminder],
    planningAccessPolicy: draft.planningAccessPolicy,
  };
}

/** Durable draft transitions; authorization intentionally remains outside this service. */
export class SetupService {
  constructor(private readonly prisma: SetupDraftClient | SetupPersistence) {}

  /**
   * The revision a draft created now would be saved against. A draft-only
   * client cannot hold a configuration, so it cannot conflict with one either:
   * 0 is the correct expectation, not an error.
   */
  private async activeRevision(chatId: bigint): Promise<number> {
    let persistence: SetupPersistence;
    try {
      persistence = this.persistence();
    } catch {
      return 0;
    }
    const active = await persistence.chatConfiguration.findUnique({
      where: { chatId },
    });
    return active?.revision ?? 0;
  }

  async beginOrResume(chatId: bigint, actorId: bigint, now: Date) {
    const existing = await this.prisma.setupDraft.findUnique({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
    });

    if (existing !== null && existing.expiresAt <= now) {
      await this.prisma.setupDraft.delete({ where: { id: existing.id } });
    }

    return this.prisma.setupDraft.upsert({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
      create: {
        chatId,
        actorUserId: actorId,
        step: SetupStep.READINESS,
        reminderMinutes: [],
        // Without this the draft always expected revision 0, so /setup on an
        // already-configured chat walked all eight steps and then aborted at
        // `saveConfiguration`'s revision check.
        expectedRevision: await this.activeRevision(chatId),
        expiresAt: expiresAt(now),
      },
      // Deliberately NOT re-read here: a resumed draft keeps the revision it
      // was created against, so a configuration that moved underneath it still
      // produces the conflict it really is.
      update: { expiresAt: expiresAt(now) },
    });
  }

  async requireActive(
    chatId: bigint,
    actorId: bigint,
    now: Date,
  ): Promise<SetupDraftLookup> {
    const draft = await this.prisma.setupDraft.findUnique({
      where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
    });
    if (draft === null) {
      return { kind: "missing" };
    }
    if (draft.expiresAt <= now) {
      await this.prisma.setupDraft.delete({ where: { id: draft.id } });
      return { kind: "expired" };
    }
    return { kind: "active", draft };
  }

  async selectTimezone(draftId: string, timezone: string, now: Date) {
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: {
        candidateTimezone: timezone,
        timezone,
        expiresAt: expiresAt(now),
      },
    });
  }

  async selectWeekday(draftId: string, weekday: Weekday, now: Date) {
    const value = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].indexOf(
      weekday,
    );
    if (!isWeekday(value + 1)) {
      throw new RangeError("Unsupported weekday.");
    }
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: { defaultWeekday: value + 1, expiresAt: expiresAt(now) },
    });
  }

  async setScheduleField(
    draft: SetupDraft,
    field: ScheduleField,
    value: number,
    now: Date,
  ): Promise<
    | Readonly<{ kind: "updated"; draft: SetupDraft }>
    | Readonly<{ kind: "schedule-conflict" }>
  > {
    const candidate = { ...draft, [field]: value } as SetupDraft;
    if (isCompleteSchedule(candidate) && !validateSchedule(candidate).valid) {
      return { kind: "schedule-conflict" };
    }
    const updated = await this.prisma.setupDraft.update({
      where: { id: draft.id },
      data: { [field]: value, expiresAt: expiresAt(now) },
    });
    return { kind: "updated", draft: updated as SetupDraft };
  }

  async useDefaultReminders(draftId: string, now: Date) {
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: { reminderMinutes: [600, 960], expiresAt: expiresAt(now) },
    });
  }

  async beginReminderEdit(draftId: string, now: Date) {
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      // -1 exists only while the actor is being prompted for the first value.
      // Review readiness permits only two valid minutes.
      data: { reminderMinutes: [-1], expiresAt: expiresAt(now) },
    });
  }

  async enterReminderTime(draft: SetupDraft, minute: number, now: Date) {
    const reminders =
      draft.reminderMinutes[0] === -1
        ? [minute]
        : [...draft.reminderMinutes, minute];
    if (
      reminders.length > 2 ||
      reminders.some((value) => value < 0 || value >= 24 * 60)
    ) {
      throw new RangeError("Expected one or two valid reminder times.");
    }
    return this.prisma.setupDraft.update({
      where: { id: draft.id },
      data: { reminderMinutes: reminders, expiresAt: expiresAt(now) },
    });
  }

  async setPlanningAccessPolicy(
    draftId: string,
    policy: PlanningAccessPolicyValue,
    now: Date,
  ) {
    if (!Object.values(PlanningAccessPolicy).includes(policy)) {
      throw new RangeError("Unsupported planning access policy.");
    }
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: {
        planningAccessPolicy: policy,
        expiresAt: expiresAt(now),
      },
    });
  }

  isReviewReady(draft: SetupDraft) {
    return completeConfiguration(draft) !== undefined;
  }

  private persistence(): SetupPersistence {
    if (
      !("$transaction" in this.prisma) ||
      !("chatConfiguration" in this.prisma) ||
      !("callbackAction" in this.prisma)
    ) {
      throw new Error("Configuration persistence is not available.");
    }
    return this.prisma;
  }

  /**
   * Promotes a complete owner-bound draft as one transaction. Every outcome before
   * `saved` leaves the active configuration untouched.
   */
  async saveConfiguration(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<SaveConfigurationResult> {
    let persistence: SetupPersistence;
    try {
      persistence = this.persistence();
    } catch {
      return { kind: "failed" };
    }

    try {
      return await persistence.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        ) {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        if (action.consumedAt !== null) {
          throw new SetupTransactionAbort({ kind: "duplicate" });
        }
        const target = parseSetupTarget(action.targetId);
        if (!target.success || target.data.action !== "save") {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        const draft = await tx.setupDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId) {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        if (draft.expiresAt <= now) {
          await tx.setupDraft.delete({ where: { id: draft.id } });
          return { kind: "expired" };
        }
        const configuration = completeConfiguration(draft);
        if (configuration === undefined) {
          throw new SetupTransactionAbort({ kind: "failed" });
        }
        const active = await tx.chatConfiguration.findUnique({
          where: { chatId },
        });
        if (draft.expectedRevision !== (active?.revision ?? 0)) {
          throw new SetupTransactionAbort({ kind: "conflict" });
        }

        if (active === null) {
          await tx.chatConfiguration.create({
            data: {
              chatId,
              ...configuration,
              reminderMinutes: [...configuration.reminderMinutes],
            },
          });
        } else {
          const updated = await tx.chatConfiguration.updateMany({
            where: { chatId, revision: draft.expectedRevision },
            data: {
              ...configuration,
              reminderMinutes: [...configuration.reminderMinutes],
              revision: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new SetupTransactionAbort({ kind: "conflict" });
          }
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
          throw new SetupTransactionAbort({ kind: "duplicate" });
        }
        await tx.setupDraft.delete({ where: { id: draft.id } });
        return { kind: "saved", configuration };
      });
    } catch (error) {
      if (
        error instanceof SetupTransactionAbort &&
        error.result.kind !== "cancelled"
      ) {
        return error.result;
      }
      return { kind: "failed" };
    }
  }

  /** Cancelling consumes only this actor's bound action and draft in one transaction. */
  async cancelSetup(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<CancelSetupResult> {
    let persistence: SetupPersistence;
    try {
      persistence = this.persistence();
    } catch {
      return { kind: "failed" };
    }

    try {
      return await persistence.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        ) {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        if (action.consumedAt !== null) {
          throw new SetupTransactionAbort({ kind: "duplicate" });
        }
        const target = parseSetupTarget(action.targetId);
        if (!target.success || target.data.action !== "cancel") {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        const draft = await tx.setupDraft.findUnique({
          where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
        });
        if (draft === null || draft.id !== target.data.draftId) {
          throw new SetupTransactionAbort({ kind: "stale" });
        }
        if (draft.expiresAt <= now) {
          await tx.setupDraft.delete({ where: { id: draft.id } });
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
          throw new SetupTransactionAbort({ kind: "duplicate" });
        }
        await tx.setupDraft.delete({ where: { id: draft.id } });
        return { kind: "cancelled" };
      });
    } catch (error) {
      if (error instanceof SetupTransactionAbort) {
        switch (error.result.kind) {
          case "cancelled":
          case "duplicate":
          case "stale":
          case "expired":
          case "failed":
            return error.result;
          case "saved":
          case "conflict":
            return { kind: "failed" };
        }
      }
      return { kind: "failed" };
    }
  }
}
