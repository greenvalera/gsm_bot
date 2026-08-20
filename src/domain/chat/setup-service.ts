import { SetupStep, type PrismaClient } from "../../generated/prisma/client.js";

const DRAFT_LIFETIME_MS = 30 * 60 * 1000;

type SetupDraftClient = Pick<PrismaClient, "setupDraft">;

export type ActiveSetupDraft = Readonly<{
  kind: "active";
  draft: Awaited<ReturnType<SetupDraftClient["setupDraft"]["findUnique"]>> &
    object;
}>;

export type SetupDraftLookup =
  ActiveSetupDraft | Readonly<{ kind: "missing" | "expired" }>;

function expiresAt(now: Date) {
  return new Date(now.getTime() + DRAFT_LIFETIME_MS);
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
        step: SetupStep.TIMEZONE,
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
    if (draft.step !== SetupStep.TIMEZONE) {
      return { kind: "missing" };
    }
    return { kind: "active", draft };
  }

  async selectTimezone(draftId: string, timezone: string, now: Date) {
    return this.prisma.setupDraft.update({
      where: { id: draftId },
      data: { candidateTimezone: timezone, expiresAt: expiresAt(now) },
    });
  }
}
