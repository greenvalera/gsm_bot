import { describe, expect, it } from "vitest";

import { RosterService } from "../../src/domain/roster/roster-service.js";
import { renderRoster } from "../../src/telegram/roster-handlers.js";

const CHAT_ID = -1001234567890n;
const ADMIN_ID = 1001n;
const MEMBER_ID = 2002n;

function createStore() {
  const users = new Map<bigint, Record<string, unknown>>();
  const memberships = new Map<string, Record<string, unknown>>();
  const membershipKey = (chatId: bigint, telegramUserId: bigint) =>
    `${chatId}:${telegramUserId}`;
  const membershipClient = {
    async findUnique({ where }: any) {
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
      return {
        ...next,
        telegramUser: users.get(next.telegramUserId as bigint),
      };
    },
    async findMany({ where }: any) {
      return [...memberships.values()]
        .filter(
          (membership) =>
            membership.chatId === where.chatId && membership.activeAt !== null,
        )
        .map((membership) => ({
          ...membership,
          telegramUser: users.get(membership.telegramUserId as bigint),
        }));
    },
  };
  return {
    users,
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
        }),
      telegramUser: {
        upsert: async ({ where, create, update }: any) => {
          const current = users.get(where.telegramUserId);
          const next =
            current === undefined ? { ...create } : { ...current, ...update };
          users.set(where.telegramUserId, next);
          return next;
        },
      },
      chatMembership: membershipClient,
    },
  };
}

describe("roster add and safe rendering", () => {
  it("upserts one replied Telegram identity and makes an active add idempotent", async () => {
    const store = createStore();
    const roster = new RosterService(store.prisma as never);
    const user = {
      id: MEMBER_ID,
      isBot: false,
      firstName: "Zoe",
      lastName: "Ångström",
      username: "zoe",
    };

    await expect(
      roster.addFromRepliedUser(CHAT_ID, ADMIN_ID, user),
    ).resolves.toMatchObject({ kind: "added" });
    await expect(
      roster.addFromRepliedUser(CHAT_ID, ADMIN_ID, user),
    ).resolves.toMatchObject({ kind: "already-active" });
    expect(store.users.size).toBe(1);
    expect(store.memberships.size).toBe(1);
  });

  it("reactivates the same membership rather than inserting a duplicate", async () => {
    const store = createStore();
    const roster = new RosterService(store.prisma as never);
    const user = { id: MEMBER_ID, isBot: false, firstName: "Zoe" };
    await roster.addFromRepliedUser(CHAT_ID, ADMIN_ID, user);
    const membership = [...store.memberships.values()][0]!;
    membership.activeAt = null;
    membership.deactivatedAt = new Date();

    await expect(
      roster.addFromRepliedUser(CHAT_ID, ADMIN_ID, user),
    ).resolves.toMatchObject({ kind: "reactivated" });
    expect(store.memberships.size).toBe(1);
    expect([...store.memberships.values()][0]).toMatchObject({
      activeAt: expect.any(Date),
      deactivatedAt: null,
    });
  });

  it("renders an exact empty state and never exposes a full numeric ID", () => {
    expect(renderRoster([])).toEqual({
      text: [
        "<b>No band members yet</b>",
        "Reply to a member's message, then send /roster_add to add them.",
      ].join("\n"),
    });
    const projection = renderRoster([
      {
        telegramUserId: 1234567890123456789n,
        firstName: null,
        lastName: null,
        username: null,
      },
      {
        telegramUserId: MEMBER_ID,
        firstName: "Zoe",
        lastName: "Ångström",
        username: "zoe",
      },
    ]);
    expect(projection.text).toContain("• Telegram user ••••6789");
    expect(projection.text).toContain("• Zoe Ångström — @zoe");
    expect(projection.text).not.toContain("1234567890123456789");
  });
});
