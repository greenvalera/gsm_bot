import {
  PlanningAccessPolicy,
  SetupStep,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { validateSchedule } from "./schedule-validator.js";
import type {
  PlanningAccessPolicyValue,
  ScheduleField,
  Weekday,
} from "./types.js";

const DRAFT_LIFETIME_MS = 30 * 60 * 1000;

type SetupDraftClient = Pick<PrismaClient, "setupDraft">;

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

/** Durable draft transitions; authorization intentionally remains outside this service. */
export class SetupService {
  constructor(private readonly prisma: SetupDraftClient) {}

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
        expiresAt: expiresAt(now),
      },
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
    if (
      draft.timezone === null ||
      draft.defaultWeekday === null ||
      !isWeekday(draft.defaultWeekday) ||
      !isCompleteSchedule(draft) ||
      draft.reminderMinutes.length !== 2 ||
      draft.reminderMinutes.some((value) => value < 0 || value >= 24 * 60) ||
      draft.planningAccessPolicy === null
    ) {
      return false;
    }
    return validateSchedule(draft).valid;
  }
}
