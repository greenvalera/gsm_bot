import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

export type TelegramUserIdentity = Readonly<{
  id: bigint;
  isBot: boolean;
  firstName?: string;
  lastName?: string;
  username?: string;
}>;

export type RosterMember = Readonly<{
  membershipId: string;
  telegramUserId: bigint;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}>;

export type RosterAddResult = Readonly<{
  kind: "added" | "already-active" | "reactivated";
  member: RosterMember;
}>;

type RosterPersistence = Pick<PrismaClient, "$transaction" | "chatMembership">;

function nullableText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function toMember(record: {
  id: string;
  telegramUserId: bigint;
  telegramUser: {
    firstName: string | null;
    lastName: string | null;
    username: string | null;
  };
}): RosterMember {
  return {
    membershipId: record.id,
    telegramUserId: record.telegramUserId,
    firstName: record.telegramUser.firstName,
    lastName: record.telegramUser.lastName,
    username: record.telegramUser.username,
  };
}

/** Stores reply-anchored Telegram identities and one soft-active membership per chat. */
export class RosterService {
  constructor(private readonly prisma: RosterPersistence) {}

  async addFromRepliedUser(
    chatId: bigint,
    _actorId: bigint,
    identity: TelegramUserIdentity,
  ): Promise<RosterAddResult> {
    if (identity.isBot) throw new Error("Bot users cannot join a band roster.");

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.chatMembership.findUnique({
        where: {
          chatId_telegramUserId: {
            chatId,
            telegramUserId: identity.id,
          },
        },
      });
      const user = await tx.telegramUser.upsert({
        where: { telegramUserId: identity.id },
        create: {
          telegramUserId: identity.id,
          firstName: nullableText(identity.firstName),
          lastName: nullableText(identity.lastName),
          username: nullableText(identity.username),
        },
        update: {
          firstName: nullableText(identity.firstName),
          lastName: nullableText(identity.lastName),
          username: nullableText(identity.username),
        },
      });
      const isActive =
        existing !== null &&
        existing.activeAt !== null &&
        existing.deactivatedAt === null;
      const membership = await tx.chatMembership.upsert({
        where: {
          chatId_telegramUserId: {
            chatId,
            telegramUserId: identity.id,
          },
        },
        create: {
          chatId,
          telegramUserId: user.telegramUserId,
          activeAt: new Date(),
          deactivatedAt: null,
        },
        update: isActive
          ? {}
          : {
              activeAt: new Date(),
              deactivatedAt: null,
            },
        include: { telegramUser: true },
      });
      const kind: RosterAddResult["kind"] = isActive
        ? "already-active"
        : existing === null
          ? "added"
          : "reactivated";
      return {
        kind,
        member: toMember(membership),
      };
    });
  }

  async listActive(chatId: bigint): Promise<readonly RosterMember[]> {
    const memberships = await this.prisma.chatMembership.findMany({
      where: { chatId, activeAt: { not: null }, deactivatedAt: null },
      include: { telegramUser: true },
    });
    return memberships.map(toMember);
  }
}
