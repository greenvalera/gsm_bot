import { describe, expect, it } from "vitest";

import { RosterService } from "../../src/domain/roster/roster-service.js";
import { renderRemovalConfirmation } from "../../src/telegram/roster-renderers.js";

const CHAT_ID = -1001234567890n;
const ADMIN_ID = 1001n;
const MEMBER_ID = 2002n;
const NOW = new Date("2026-08-20T12:00:00.000Z");

function createStore() {
  const users = new Map<bigint, Record<string, unknown>>();
  const memberships = new Map<string, Record<string, unknown>>();
  const actions = new Map<string, Record<string, unknown>>();
  const membershipKey = (chatId: bigint, telegramUserId: bigint) =>
    `${chatId}:${telegramUserId}`;
  const membershipClient = {
    async findUnique({ where }: any) {
      if (where.id !== undefined)
        return [...memberships.values()].find(
          (membership) => membership.id === where.id,
        ) ?? null;
      return (
        memberships.get(
          membershipKey(
            where.chatId_telegramUserId.chatId,
            where.chatId_telegramUserId.telegramUserId,
          ),
        ) ?? null
      );
    },
    async upsert({ where, create, update }: any) {
      const key = membershipKey(
        where.chatId_telegramUserId.chatId,
        where.chatId_telegramUserId.telegramUserId,
      );
      const current = memberships.get(key);
      const next =
        current === undefined
          ? { id: `membership-${key}`, ...create }
          : { ...current, ...update };
      memberships.set(key, next);
      return { ...next, telegramUser: users.get(next.telegramUserId as bigint) };
    },
    async findMany({ where }: any) {
      return [...memberships.values()]
        .filter(
          (membership) =>
            membership.chatId === where.chatId &&
            membership.activeAt !== null &&
            membership.deactivatedAt === null,
        )
        .map((membership) => ({
          ...membership,
          telegramUser: users.get(membership.telegramUserId as bigint),
        }));
    },
    async updateMany({ where, data }: any) {
      const membership = memberships.get(
        membershipKey(where.chatId, MEMBER_ID),
      );
      if (
        membership === undefined ||
        membership.id !== where.id ||
        membership.activeAt === null ||
        membership.deactivatedAt !== null
      )
        return { count: 0 };
      memberships.set(membershipKey(where.chatId, MEMBER_ID), {
        ...membership,
        ...data,
      });
      return { count: 1 };
    },
  };
  const callbackAction = {
    async create({ data }: any) {
      actions.set(data.token, { ...data, consumedAt: null });
      return actions.get(data.token);
    },
    async findUnique({ where }: any) {
      return actions.get(where.token) ?? null;
    },
    async updateMany({ where, data }: any) {
      const action = actions.get(where.token);
      if (
        action === undefined ||
        action.consumedAt !== null ||
        (where.expiresAt?.gt !== undefined && action.expiresAt <= where.expiresAt.gt)
      )
        return { count: 0 };
      actions.set(where.token, { ...action, ...data });
      return { count: 1 };
    },
  };
  return {
    actions,
    memberships,
    prisma: {
      $transaction: async (operation: any) =>
        operation({
          telegramUser: {
            upsert: async ({ where, create, update }: any) => {
              const current = users.get(where.telegramUserId);
              const next =
                current === undefined
                  ? { ...create }
                  : { ...current, ...update };
              users.set(where.telegramUserId, next);
              return next;
            },
          },
          chatMembership: membershipClient,
          callbackAction,
        }),
      chatMembership: membershipClient,
      callbackAction,
    },
  };
}

describe("roster removal", () => {
  it("creates opaque actor-bound confirmation actions and removes only once", async () => {
    const store = createStore();
    const roster = new RosterService(store.prisma as never);
    const added = await roster.addFromRepliedUser(CHAT_ID, ADMIN_ID, {
      id: MEMBER_ID,
      isBot: false,
      firstName: "Ada",
      username: "ada",
    });

    const request = await roster.createRemovalAction(
      CHAT_ID,
      ADMIN_ID,
      added.member.membershipId,
      NOW,
    );
    expect(request).toMatch(/^v1:/);
    expect(request).not.toContain(MEMBER_ID.toString());
    expect(request).not.toContain("Ada");

    const confirmation = await roster.beginRemoval(
      CHAT_ID,
      ADMIN_ID,
      request,
      NOW,
    );
    expect(confirmation).toMatchObject({ kind: "confirmation" });
    if (confirmation.kind !== "confirmation") throw new Error("no confirmation");
    expect(renderRemovalConfirmation(confirmation.member)).toEqual({
      text: [
        "<b>Remove Ada — @ada?</b>",
        "They will no longer be selected for future rehearsals.",
      ].join("\n"),
    });

    await expect(
      roster.removeConfirmed(CHAT_ID, ADMIN_ID, confirmation.removeToken, NOW),
    ).resolves.toEqual({ kind: "removed" });
    await expect(
      roster.removeConfirmed(CHAT_ID, ADMIN_ID, confirmation.removeToken, NOW),
    ).resolves.toEqual({ kind: "duplicate" });
    expect([...store.memberships.values()][0]).toMatchObject({
      activeAt: null,
      deactivatedAt: NOW,
    });
  });
});
