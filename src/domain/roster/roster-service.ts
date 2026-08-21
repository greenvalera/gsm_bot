import {
  CallbackActionKind,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import {
  createCallbackToken,
  createRosterRemovalTarget,
  parseRosterRemovalTarget,
} from "../../shared/callback-schema.js";

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

type RosterPersistence = Pick<
  PrismaClient,
  "$transaction" | "callbackAction" | "chatMembership"
>;

const REMOVAL_ACTION_LIFETIME_MS = 30 * 60 * 1000;

export type BeginRemovalResult =
  | Readonly<{
      kind: "confirmation";
      member: RosterMember;
      removeToken: string;
      keepToken: string;
    }>
  | Readonly<{ kind: "duplicate" | "stale" | "failed" }>;

export type ConfirmRemovalResult = Readonly<{
  kind: "removed" | "kept" | "duplicate" | "stale" | "failed";
}>;

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

function isActiveMembership(
  membership: { activeAt: Date | null; deactivatedAt: Date | null } | null,
) {
  return (
    membership !== null &&
    membership.activeAt !== null &&
    membership.deactivatedAt === null
  );
}

function actionExpiresAt(now: Date) {
  return new Date(now.getTime() + REMOVAL_ACTION_LIFETIME_MS);
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

  /** Creates an opaque request action; actor/chat/target authority stays in PostgreSQL. */
  async createRemovalAction(
    chatId: bigint,
    actorId: bigint,
    membershipId: string,
    now: Date,
  ): Promise<string | undefined> {
    const membership = await this.prisma.chatMembership.findUnique({
      where: { id: membershipId },
    });
    if (
      membership === null ||
      membership.chatId !== chatId ||
      !isActiveMembership(membership)
    )
      return undefined;
    const token = createCallbackToken();
    await this.prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.ROSTER_REMOVE,
        chatId,
        actorUserId: actorId,
        targetId: createRosterRemovalTarget({
          action: "request",
          membershipId,
        }),
        expiresAt: actionExpiresAt(now),
      },
    });
    return token;
  }

  /** Consumes a selected roster-row action and creates the visible second confirmation. */
  async beginRemoval(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<BeginRemovalResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.ROSTER_REMOVE ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parseRosterRemovalTarget(action.targetId);
        if (!target.success || target.data.action !== "request")
          return { kind: "stale" };
        const membership = await tx.chatMembership.findUnique({
          where: { id: target.data.membershipId },
          include: { telegramUser: true },
        });
        if (
          membership === null ||
          membership.chatId !== chatId ||
          !isActiveMembership(membership)
        )
          return { kind: "stale" };
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };
        const removeToken = createCallbackToken();
        const keepToken = createCallbackToken();
        await Promise.all([
          tx.callbackAction.create({
            data: {
              token: removeToken,
              kind: CallbackActionKind.ROSTER_REMOVE,
              chatId,
              actorUserId: actorId,
              targetId: createRosterRemovalTarget({
                action: "confirm",
                membershipId: membership.id,
              }),
              expiresAt: actionExpiresAt(now),
            },
          }),
          tx.callbackAction.create({
            data: {
              token: keepToken,
              kind: CallbackActionKind.ROSTER_REMOVE,
              chatId,
              actorUserId: actorId,
              targetId: createRosterRemovalTarget({
                action: "keep",
                membershipId: membership.id,
              }),
              expiresAt: actionExpiresAt(now),
            },
          }),
        ]);
        return {
          kind: "confirmation",
          member: toMember(membership),
          removeToken,
          keepToken,
        };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  /** Consumes a keep action without changing the selected membership. */
  async keepRemoval(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<ConfirmRemovalResult> {
    return this.consumeRemovalAction(
      chatId,
      actorId,
      callbackToken,
      "keep",
      now,
    );
  }

  /** Atomically consumes a confirmation action and soft-deactivates its exact active target. */
  async removeConfirmed(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    now: Date,
  ): Promise<ConfirmRemovalResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.ROSTER_REMOVE ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parseRosterRemovalTarget(action.targetId);
        if (!target.success || target.data.action !== "confirm")
          return { kind: "stale" };
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };
        const removed = await tx.chatMembership.updateMany({
          where: {
            id: target.data.membershipId,
            chatId,
            activeAt: { not: null },
            deactivatedAt: null,
          },
          data: { activeAt: null, deactivatedAt: now },
        });
        return removed.count === 1 ? { kind: "removed" } : { kind: "stale" };
      });
    } catch {
      return { kind: "failed" };
    }
  }

  private async consumeRemovalAction(
    chatId: bigint,
    actorId: bigint,
    callbackToken: string,
    expectedAction: "keep",
    now: Date,
  ): Promise<ConfirmRemovalResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({
          where: { token: callbackToken },
        });
        if (
          action === null ||
          action.kind !== CallbackActionKind.ROSTER_REMOVE ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parseRosterRemovalTarget(action.targetId);
        if (!target.success || target.data.action !== expectedAction)
          return { kind: "stale" };
        const consumed = await tx.callbackAction.updateMany({
          where: {
            token: callbackToken,
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        return consumed.count === 1 ? { kind: "kept" } : { kind: "duplicate" };
      });
    } catch {
      return { kind: "failed" };
    }
  }
}
