import type { PrismaClient } from "../../generated/prisma/client.js";

export type CurrentTelegramRole =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked"
  | "unknown";

export interface TelegramMembershipGateway {
  getCurrentRole(chatId: bigint, actorId: bigint): Promise<CurrentTelegramRole>;
}

export class PermissionDeniedError extends Error {
  constructor() {
    super("Current chat administrator permission is required.");
    this.name = "PermissionDeniedError";
  }
}

export class AuthorizationService {
  constructor(
    private readonly prisma: Pick<PrismaClient, "setupDraft"> &
      Partial<Pick<PrismaClient, "settingsEditDraft">>,
    private readonly membershipGateway: TelegramMembershipGateway,
  ) {}

  async requireCurrentAdministrator(
    chatId: bigint,
    actorId: bigint,
  ): Promise<void> {
    let role: CurrentTelegramRole = "unknown";
    try {
      role = await this.membershipGateway.getCurrentRole(chatId, actorId);
    } catch {
      // Membership evidence that cannot be refreshed is never authority.
    }

    if (role === "creator" || role === "administrator") {
      return;
    }

    await this.prisma.setupDraft.deleteMany({
      where: { chatId, actorUserId: actorId },
    });
    if (this.prisma.settingsEditDraft !== undefined) {
      await this.prisma.settingsEditDraft.deleteMany({
        where: { chatId, actorUserId: actorId },
      });
    }
    throw new PermissionDeniedError();
  }
}
