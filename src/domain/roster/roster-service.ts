import {
  CallbackActionKind,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import {
  createCallbackToken,
  createRosterJoinTarget,
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
  "$transaction" | "callbackAction" | "chatMembership" | "rosterInvite"
>;

/** Every roster callback action (row, confirmation, page, retry) shares this lifetime. */
export const ROSTER_ACTION_LIFETIME_MS = 30 * 60 * 1000;

/** A `/roster_add @username` invite and its Join action stay open for 7 days. */
export const ROSTER_INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/**
 * The one definition of a comparable Telegram username: one optional leading
 * "@" stripped, Telegram's public-username shape enforced, lowercased. Returns
 * `undefined` for anything else, so an invalid value can never become an invite
 * key or be compared against a stored identity.
 */
export function normalizeTelegramUsername(value: string): string | undefined {
  const bare = value.startsWith("@") ? value.slice(1) : value;
  return TELEGRAM_USERNAME.test(bare) ? bare.toLowerCase() : undefined;
}

export type OpenInviteResult = Readonly<{
  token: string;
  username: string;
  expiresAt: Date;
}>;

export type AcceptInviteResult =
  | Readonly<{ kind: "joined"; result: RosterAddResult }>
  | Readonly<{ kind: "wrong-user"; username: string }>
  | Readonly<{ kind: "duplicate" }>
  | Readonly<{ kind: "stale" }>;

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

/** The client shape the active-roster read needs; a transaction satisfies it. */
type MembershipReader = Pick<PrismaClient, "chatMembership">;

/** The client shape the single-identity read needs; a transaction satisfies it. */
type IdentityReader = Pick<PrismaClient, "telegramUser">;

/**
 * The identity fields a safe display label is built from, for a person who is
 * not necessarily on the roster.
 *
 * Structurally the roster member without the membership that admitted them,
 * which is what `memberLabel` already accepts — the planning author may have
 * started a round without ever being added to the band.
 */
export type TelegramIdentity = Omit<RosterMember, "membershipId">;

/**
 * The safe display identity of ONE Telegram user, roster member or not.
 *
 * It lives here rather than in the planning domain for the same reason
 * `listActiveMemberships` does: `firstName` / `lastName` / `username` are read
 * and mapped in exactly one place, so no other surface can grow its own idea of
 * what a person's stored identity is. A user with no stored row answers
 * all-null, which `memberLabel` renders as the masked `Telegram user ••••NNNN`
 * form — the shape threat T-01-21 requires when nothing readable exists.
 */
export async function resolveTelegramIdentity(
  client: IdentityReader,
  telegramUserId: bigint,
): Promise<TelegramIdentity> {
  const user = await client.telegramUser.findUnique({
    where: { telegramUserId },
  });
  return {
    telegramUserId,
    firstName: user?.firstName ?? null,
    lastName: user?.lastName ?? null,
    username: user?.username ?? null,
  };
}

/**
 * The chat's active band roster — the ONE definition of "an active member".
 *
 * A free function taking its client rather than a method, so the confirm
 * transaction in `PlanningService` can run the SAME query against its `tx` and
 * snapshot exactly the membership set `/roster` shows. A second `findMany` with
 * a hand-copied `activeAt` / `deactivatedAt` predicate is how the two would
 * drift, and a lineup that disagrees with the roster is precisely the defect
 * D-09 ("the active roster IS the lineup") exists to prevent.
 */
export async function listActiveMemberships(
  client: MembershipReader,
  chatId: bigint,
): Promise<readonly RosterMember[]> {
  const memberships = await client.chatMembership.findMany({
    where: { chatId, activeAt: { not: null }, deactivatedAt: null },
    include: { telegramUser: true },
  });
  return memberships.map(toMember);
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
  return new Date(now.getTime() + ROSTER_ACTION_LIFETIME_MS);
}

/**
 * Stores the Telegram identity and makes its membership in `chatId` active.
 *
 * Shared by the reply flow and the invite Join flow. It takes the caller's
 * transaction client because Prisma interactive transactions cannot nest.
 */
async function upsertActiveMembership(
  tx: Prisma.TransactionClient,
  chatId: bigint,
  identity: TelegramUserIdentity,
): Promise<RosterAddResult> {
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

    return this.prisma.$transaction((tx: Prisma.TransactionClient) =>
      upsertActiveMembership(tx, chatId, identity),
    );
  }

  /**
   * Adds or reactivates the ONE membership of this chat whose stored username
   * matches `username` case-insensitively; `undefined` when there is no match
   * or more than one, so the caller falls back to an invite.
   *
   * Scoped to this chat on purpose: a username stored for another chat may be
   * stale or belong to someone else (D-03). The comparison runs here on
   * lowercased values rather than as a database case-insensitive filter,
   * which compiles to ILIKE where "_" is a single-character wildcard and could
   * match a different person (threat T-uwu-07).
   */
  async addByKnownUsername(
    chatId: bigint,
    username: string,
  ): Promise<RosterAddResult | undefined> {
    const normalized = normalizeTelegramUsername(username);
    if (normalized === undefined) return undefined;
    return this.prisma.$transaction(
      async (
        tx: Prisma.TransactionClient,
      ): Promise<RosterAddResult | undefined> => {
        const memberships = await tx.chatMembership.findMany({
          where: { chatId },
          include: { telegramUser: true },
        });
        const matches = memberships.filter(
          (membership) =>
            membership.telegramUser.username?.toLowerCase() === normalized,
        );
        if (matches.length !== 1) return undefined;
        const [match] = matches as [(typeof matches)[number]];
        if (isActiveMembership(match))
          return { kind: "already-active", member: toMember(match) };
        const reactivated = await tx.chatMembership.update({
          where: { id: match.id },
          data: { activeAt: new Date(), deactivatedAt: null },
          include: { telegramUser: true },
        });
        return { kind: "reactivated", member: toMember(reactivated) };
      },
    );
  }

  /**
   * Opens (or reuses) the pending invite for `username` in this chat and mints
   * one opaque Join action for it.
   *
   * One row per chat and lowercase username (D-05): an open row is reused as
   * is, and a consumed or expired row is reopened in place. The Join action's
   * `actorUserId` is the inviter only because the column is required; the
   * Join route resolves authority from the invite's stored username instead.
   */
  async openInvite(
    chatId: bigint,
    actorId: bigint,
    username: string,
    now: Date,
  ): Promise<OpenInviteResult> {
    const normalized = normalizeTelegramUsername(username);
    if (normalized === undefined)
      throw new Error("Invalid Telegram username for a roster invite.");
    const expiresAt = new Date(now.getTime() + ROSTER_INVITE_LIFETIME_MS);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let invite = await tx.rosterInvite.upsert({
        where: { chatId_username: { chatId, username: normalized } },
        create: {
          chatId,
          username: normalized,
          invitedByUserId: actorId,
          expiresAt,
        },
        update: {},
      });
      if (invite.consumedAt !== null || invite.expiresAt <= now) {
        invite = await tx.rosterInvite.update({
          where: { id: invite.id },
          data: {
            invitedByUserId: actorId,
            expiresAt,
            consumedAt: null,
            consumedByUserId: null,
          },
        });
      }
      const token = createCallbackToken();
      await tx.callbackAction.create({
        data: {
          token,
          kind: CallbackActionKind.ROSTER_JOIN,
          chatId,
          actorUserId: actorId,
          targetId: createRosterJoinTarget({
            action: "join",
            inviteId: invite.id,
          }),
          expiresAt: invite.expiresAt,
        },
      });
      return { token, username: invite.username, expiresAt: invite.expiresAt };
    });
  }

  /**
   * Consumes an open invite for the Telegram user who pressed Join, when that
   * user's current username is the invited one, and adds them to the roster.
   *
   * A mismatch writes nothing. Consumption is a guarded update in the same
   * transaction as the membership upsert, so two concurrent presses cannot both
   * join (threat T-uwu-04).
   */
  async acceptInvite(
    chatId: bigint,
    inviteId: string,
    identity: TelegramUserIdentity,
    now: Date,
  ): Promise<AcceptInviteResult> {
    return this.prisma.$transaction(
      async (tx: Prisma.TransactionClient): Promise<AcceptInviteResult> => {
        const invite = await tx.rosterInvite.findUnique({
          where: { id: inviteId },
        });
        if (invite === null || invite.chatId !== chatId)
          return { kind: "stale" };
        if (invite.consumedAt !== null) return { kind: "duplicate" };
        if (invite.expiresAt <= now) return { kind: "stale" };
        if (
          identity.isBot ||
          normalizeTelegramUsername(identity.username ?? "") !== invite.username
        )
          return { kind: "wrong-user", username: invite.username };
        const consumed = await tx.rosterInvite.updateMany({
          where: { id: invite.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now, consumedByUserId: identity.id },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };
        return {
          kind: "joined",
          result: await upsertActiveMembership(tx, chatId, identity),
        };
      },
    );
  }

  async listActive(chatId: bigint): Promise<readonly RosterMember[]> {
    return await listActiveMemberships(this.prisma, chatId);
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
