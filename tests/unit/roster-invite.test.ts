import { Bot } from "grammy";
import type { MessageEntity, UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import { PermissionDeniedError } from "../../src/domain/auth/authorization-service.js";
import { RosterService } from "../../src/domain/roster/roster-service.js";
import {
  callbackTokenSchema,
  parseRosterJoinTarget,
} from "../../src/shared/callback-schema.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import { createLogger } from "../../src/shared/logger.js";
import { registerRosterHandlers } from "../../src/telegram/handlers.js";
import { localizedMemberLabel } from "../../src/telegram/roster-renderers.js";
import { parseRosterAddArgument } from "../../src/telegram/roster-invite-handlers.js";

const CHAT = -1001234567890n;
const OTHER_CHAT = -1009876543210n;
const ADMIN = 1001n;
const NOW = new Date("2026-09-22T10:00:00Z");
const BOT_USERNAME = "GSMBot";

type Presser = Readonly<{
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_bot?: boolean;
}>;

function harness(initial: Locale = "en") {
  const locale = initial;
  const roles = new Map<bigint, string>([[ADMIN, "administrator"]]);
  let inviteFailure = false;
  const actions = new Map<string, any>();
  const members = new Map<string, any>();
  const users = new Map<bigint, any>();
  const invites = new Map<string, any>();
  const calls: { method: string; payload: any }[] = [];
  const logs: unknown[] = [];
  let nextInvite = 1;

  const withUser = (row: any) => ({
    ...row,
    telegramUser: users.get(row.telegramUserId),
  });
  const guardInvite = () => {
    if (inviteFailure) throw new Error("invite storage unavailable");
  };

  const prisma: any = {
    $executeRaw: async () => 0,
    chatMigration: { findUnique: async () => null },
    chatLanguagePreference: {
      findUnique: async () => ({
        chatId: CHAT,
        locale,
        explicitlySelected: true,
      }),
    },
    callbackAction: {
      create: async ({ data }: any) => {
        actions.set(data.token, { ...data, consumedAt: null });
        return actions.get(data.token);
      },
      findUnique: async ({ where }: any) => actions.get(where.token) ?? null,
    },
    telegramUser: {
      upsert: async ({ where, create, update }: any) => {
        const row = {
          ...(users.get(where.telegramUserId) ?? create),
          ...update,
        };
        users.set(where.telegramUserId, row);
        return row;
      },
    },
    chatMembership: {
      findUnique: async ({ where, include }: any) => {
        const row = where.id
          ? members.get(where.id)
          : [...members.values()].find(
              (candidate) =>
                candidate.chatId === where.chatId_telegramUserId.chatId &&
                candidate.telegramUserId ===
                  where.chatId_telegramUserId.telegramUserId,
            );
        return row ? (include ? withUser(row) : { ...row }) : null;
      },
      upsert: async ({ create, update }: any) => {
        const id = `membership-${create.chatId}-${create.telegramUserId}`;
        const row = { ...(members.get(id) ?? { id, ...create }), ...update };
        members.set(id, row);
        return withUser(row);
      },
      findMany: async ({ where, include }: any = {}) =>
        [...members.values()]
          .filter(
            (row) =>
              (where?.chatId === undefined || row.chatId === where.chatId) &&
              (where?.activeAt === undefined ||
                (row.activeAt !== null && row.deactivatedAt === null)),
          )
          .map((row) => (include ? withUser(row) : { ...row })),
      update: async ({ where, data, include }: any) => {
        const row = members.get(where.id);
        Object.assign(row, data);
        return include ? withUser(row) : { ...row };
      },
    },
    rosterInvite: {
      upsert: async ({ where, create }: any) => {
        guardInvite();
        const key = where.chatId_username;
        const existing = [...invites.values()].find(
          (row) => row.chatId === key.chatId && row.username === key.username,
        );
        if (existing) return { ...existing };
        const row = {
          id: `invite-${nextInvite++}`,
          consumedAt: null,
          consumedByUserId: null,
          ...create,
        };
        invites.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        guardInvite();
        const row = invites.get(where.id);
        Object.assign(row, data);
        return { ...row };
      },
      findUnique: async ({ where }: any) => {
        const row = invites.get(where.id);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: any) => {
        const row = invites.get(where.id);
        if (
          !row ||
          (where.consumedAt === null && row.consumedAt !== null) ||
          (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt)
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      create: async ({ data }: any) => {
        const row = {
          id: `invite-${nextInvite++}`,
          consumedAt: null,
          consumedByUserId: null,
          ...data,
        };
        invites.set(row.id, row);
        return { ...row };
      },
    },
    $transaction: async (operation: any) => operation(prisma),
  };

  const roster = new RosterService(prisma);
  const roleOf = (actorId: bigint) => roles.get(actorId) ?? "member";
  const authorization = {
    requireCurrentAdministrator: async (_chatId: bigint, actorId: bigint) => {
      const role = roleOf(actorId);
      if (role !== "administrator" && role !== "creator")
        throw new PermissionDeniedError();
    },
    currentRole: async (_chatId: bigint, actorId: bigint) => roleOf(actorId),
    discardActorDrafts: async () => {},
  };
  const logger = createLogger({ level: "silent" });
  const capturingLogger = new Proxy(logger, {
    get(target, property, receiver) {
      if (property === "error")
        return (...args: unknown[]) => {
          logs.push(args[0]);
        };
      return Reflect.get(target, property, receiver);
    },
  });
  const bot = new Bot("123456:TEST_TOKEN", {
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "GSMBot",
      username: BOT_USERNAME,
    } as UserFromGetMe,
  });
  registerRosterHandlers(bot, {
    logger: capturingLogger,
    prisma,
    roster,
    authorization,
    now: () => NOW,
  } as never);
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return {
      ok: true,
      result: {
        message_id: 42,
        date: 1,
        chat: { id: Number(CHAT), type: "supergroup" },
        text: (payload as any).text ?? "",
      },
    } as never;
  });

  let nextUpdate = 1;
  const chat = { id: Number(CHAT), type: "supergroup" };

  return {
    prisma,
    roster,
    actions,
    members,
    users,
    invites,
    calls,
    logs,
    setRole(actorId: bigint, role: string) {
      roles.set(actorId, role);
    },
    failInvites() {
      inviteFailure = true;
    },
    seedMember(
      chatId: bigint,
      telegramUserId: bigint,
      username: string | null,
      active = true,
    ) {
      users.set(telegramUserId, {
        telegramUserId,
        firstName: `User ${telegramUserId}`,
        lastName: null,
        username,
      });
      const id = `membership-${chatId}-${telegramUserId}`;
      members.set(id, {
        id,
        chatId,
        telegramUserId,
        activeAt: active ? new Date("2026-09-01T00:00:00Z") : null,
        deactivatedAt: active ? null : new Date("2026-09-10T00:00:00Z"),
      });
      return id;
    },
    async command(
      text: string,
      options: Readonly<{
        entities?: MessageEntity[];
        reply?: Readonly<{ id: number; is_bot?: boolean; first_name: string }>;
        actor?: bigint;
      }> = {},
    ) {
      calls.length = 0;
      const commandLength = text.split(/\s/u)[0]!.length;
      await bot.handleUpdate({
        update_id: nextUpdate++,
        message: {
          message_id: 1,
          date: 1,
          chat,
          from: {
            id: Number(options.actor ?? ADMIN),
            is_bot: false,
            first_name: "Admin",
          },
          text,
          entities: [
            { offset: 0, length: commandLength, type: "bot_command" },
            ...(options.entities ?? []),
          ],
          ...(options.reply === undefined
            ? {}
            : {
                reply_to_message: {
                  message_id: 2,
                  date: 1,
                  chat,
                  from: { is_bot: false, ...options.reply },
                },
              }),
        },
      } as never);
    },
    async press(token: string, presser: Presser) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: nextUpdate++,
        callback_query: {
          id: `callback-${nextUpdate}`,
          from: {
            is_bot: false,
            first_name: presser.first_name ?? "Presser",
            ...presser,
          },
          chat_instance: "fixture",
          data: token,
          message: { message_id: 42, date: 1, chat, text: "invite" },
        },
      } as never);
      expect(
        calls.filter((call) => call.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
    sent() {
      return calls.filter((call) => call.method === "sendMessage");
    },
    lastText() {
      return calls.filter((call) => call.payload.text).at(-1)?.payload
        .text as string;
    },
    joinButton() {
      const message = calls.find((call) => call.method === "sendMessage")!;
      const buttons = message.payload.reply_markup.inline_keyboard.flat();
      expect(buttons).toHaveLength(1);
      return buttons[0] as { text: string; callback_data: string };
    },
  };
}

function mention(text: string, username: string): MessageEntity {
  return {
    type: "mention",
    offset: text.indexOf(`@${username}`),
    length: username.length + 1,
  };
}

async function invite(
  h: ReturnType<typeof harness>,
  username: string,
  expectPrompt = true,
) {
  const text = `/roster_add @${username}`;
  await h.command(text, { entities: [mention(text, username)] });
  if (!expectPrompt) return "";
  return h.joinButton().callback_data;
}

function lastAlert(h: ReturnType<typeof harness>) {
  const answers = h.calls.filter(
    (call) => call.method === "answerCallbackQuery",
  );
  const { text, show_alert } = answers.at(-1)!.payload;
  return { text, show_alert };
}

describe("roster invites by @username", () => {
  it.each(["en", "uk"] as const)(
    "invites an unknown @username and adds the matching Join presser in %s",
    async (locale) => {
      const h = harness(locale);
      const text = "/roster_add @Baukov";
      await h.command(text, { entities: [mention(text, "Baukov")] });

      const prompt = h.sent();
      expect(prompt).toHaveLength(1);
      expect(prompt[0]!.payload.text).toBe(
        renderMessage(locale, "roster.invitePrompt", { username: "baukov" }),
      );
      const button = h.joinButton();
      expect(button.text).toBe(
        renderMessage(locale, "roster.inviteButton", undefined),
      );
      expect(callbackTokenSchema.safeParse(button.callback_data).success).toBe(
        true,
      );
      expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
      expect(button.callback_data.toLowerCase()).not.toContain("baukov");
      expect([...h.invites.values()]).toHaveLength(1);
      const invite = [...h.invites.values()][0]!;
      expect(invite.username).toBe("baukov");
      expect(invite.chatId).toBe(CHAT);
      const target = parseRosterJoinTarget(
        h.actions.get(button.callback_data).targetId,
      );
      expect(target.success && target.data.inviteId).toBe(invite.id);

      await h.press(button.callback_data, {
        id: 3003,
        username: "BAUKOV",
        first_name: "Oleh",
      });
      const edit = h.calls.find((call) => call.method === "editMessageText");
      expect(edit).toBeDefined();
      const membership = h.members.get(`membership-${CHAT}-3003`);
      expect(membership.activeAt).not.toBeNull();
      expect(membership.deactivatedAt).toBeNull();
      expect(edit!.payload.text).toBe(
        renderMessage(locale, "roster.added", {
          label: localizedMemberLabel(
            {
              telegramUserId: 3003n,
              firstName: "Oleh",
              lastName: null,
              username: "BAUKOV",
            },
            locale,
          ),
        }),
      );
      expect(invite.consumedAt).toEqual(NOW);
      expect(invite.consumedByUserId).toBe(3003n);
    },
  );

  it.each(["en", "uk"] as const)(
    "reuses one pending invite when /roster_add @username is re-issued in %s",
    async (locale) => {
      const h = harness(locale);
      const first = await invite(h, "baukov");
      const second = await invite(h, "Baukov");
      expect(first).not.toBe(second);
      expect(h.invites.size).toBe(1);
      const inviteIds = [first, second].map((token) => {
        const target = parseRosterJoinTarget(h.actions.get(token).targetId);
        return target.success ? target.data.inviteId : undefined;
      });
      expect(inviteIds[0]).toBeDefined();
      expect(inviteIds[0]).toBe(inviteIds[1]);

      await h.press(first, { id: 3003, username: "baukov" });
      expect(h.calls.some((call) => call.method === "editMessageText")).toBe(
        true,
      );
      await h.press(second, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual({
        text: renderMessage(locale, "common.applied", undefined),
        show_alert: true,
      });
      expect(h.calls.some((call) => call.method === "editMessageText")).toBe(
        false,
      );
      expect(h.members.size).toBe(1);
    },
  );

  it.each(["en", "uk"] as const)(
    "refuses a Join press from a different user in %s",
    async (locale) => {
      const h = harness(locale);
      const token = await invite(h, "baukov");
      for (const presser of [
        { id: 4004, username: "someone_else" },
        { id: 5005 },
        { id: 6006, username: "baukov", is_bot: true },
      ]) {
        await h.press(token, presser);
        expect(lastAlert(h)).toEqual({
          text: renderMessage(locale, "roster.inviteWrongUser", {
            username: "baukov",
          }),
          show_alert: true,
        });
        expect(h.calls.some((call) => call.method === "editMessageText")).toBe(
          false,
        );
      }
      expect(h.members.size).toBe(0);
      expect([...h.invites.values()][0].consumedAt).toBeNull();

      await h.press(token, { id: 3003, username: "Baukov" });
      expect(h.members.get(`membership-${CHAT}-3003`)).toBeDefined();
    },
  );

  it.each(["en", "uk"] as const)(
    "answers stale, consumed and non-member Join presses without changes in %s",
    async (locale) => {
      const snapshot = (h: ReturnType<typeof harness>) =>
        structuredClone({
          members: h.members,
          invites: h.invites,
          users: h.users,
        });
      const stale = {
        text: renderMessage(locale, "roster.inviteStale", undefined),
        show_alert: true,
      };

      // The Join action itself expired: the boundary answers stale.
      let h = harness(locale);
      let token = await invite(h, "baukov");
      h.actions.get(token).expiresAt = new Date(NOW.getTime() - 1);
      let before = snapshot(h);
      await h.press(token, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual(stale);
      expect(snapshot(h)).toEqual(before);

      // The invite expired while its action row is still live.
      h = harness(locale);
      token = await invite(h, "baukov");
      [...h.invites.values()][0].expiresAt = new Date(NOW.getTime() - 1);
      before = snapshot(h);
      await h.press(token, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual(stale);
      expect(snapshot(h)).toEqual(before);

      // An unparseable target.
      h = harness(locale);
      token = await invite(h, "baukov");
      h.actions.get(token).targetId = "malformed";
      before = snapshot(h);
      await h.press(token, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual(stale);
      expect(snapshot(h)).toEqual(before);

      // An invite that was already consumed.
      h = harness(locale);
      token = await invite(h, "baukov");
      [...h.invites.values()][0].consumedAt = NOW;
      before = snapshot(h);
      await h.press(token, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual({
        text: renderMessage(locale, "common.applied", undefined),
        show_alert: true,
      });
      expect(snapshot(h)).toEqual(before);

      // A presser who has left the chat.
      h = harness(locale);
      token = await invite(h, "baukov");
      h.setRole(3003n, "left");
      before = snapshot(h);
      await h.press(token, { id: 3003, username: "baukov" });
      expect(lastAlert(h)).toEqual({
        text: renderMessage(locale, "roster.inviteNonMember", undefined),
        show_alert: true,
      });
      expect(snapshot(h)).toEqual(before);
    },
  );

  it.each(["en", "uk"] as const)(
    "adds a text_mention user directly without an invite in %s",
    async (locale) => {
      const h = harness(locale);
      const text = "/roster_add Oleh";
      const entities: MessageEntity[] = [
        {
          type: "text_mention",
          offset: text.indexOf("Oleh"),
          length: 4,
          user: { id: 3003, is_bot: false, first_name: "Oleh" },
        },
      ];
      const label = localizedMemberLabel(
        {
          telegramUserId: 3003n,
          firstName: "Oleh",
          lastName: null,
          username: null,
        },
        locale,
      );
      await h.command(text, { entities });
      expect(h.lastText()).toBe(
        renderMessage(locale, "roster.added", { label }),
      );
      await h.command(text, { entities });
      expect(h.lastText()).toBe(
        renderMessage(locale, "roster.alreadyActive", { label }),
      );
      expect(h.members.size).toBe(1);
      expect(h.invites.size).toBe(0);
    },
  );

  it.each(["en", "uk"] as const)(
    "adds a username already stored in this chat directly in %s",
    async (locale) => {
      const h = harness(locale);
      h.seedMember(CHAT, 3003n, "Baukov", false);
      const label = localizedMemberLabel(
        {
          telegramUserId: 3003n,
          firstName: "User 3003",
          lastName: null,
          username: "Baukov",
        },
        locale,
      );
      await invite(h, "baukov", false);
      expect(h.lastText()).toBe(
        renderMessage(locale, "roster.added", { label }),
      );
      const membership = h.members.get(`membership-${CHAT}-3003`);
      expect(membership.activeAt).not.toBeNull();
      expect(membership.deactivatedAt).toBeNull();

      await invite(h, "BAUKOV", false);
      expect(h.lastText()).toBe(
        renderMessage(locale, "roster.alreadyActive", { label }),
      );
      expect(h.invites.size).toBe(0);
      expect(h.members.size).toBe(1);
    },
  );

  it("invites instead of guessing when a stored username is not an exact single match", async () => {
    // "_" must not behave like a LIKE wildcard.
    let h = harness();
    h.seedMember(CHAT, 3003n, "olehxbaukov");
    await invite(h, "oleh_baukov");
    expect(h.invites.size).toBe(1);

    // The same username stored only for another chat.
    h = harness();
    h.seedMember(OTHER_CHAT, 3003n, "baukov");
    await invite(h, "baukov");
    expect(h.invites.size).toBe(1);
    expect(h.members.get(`membership-${OTHER_CHAT}-3003`).chatId).toBe(
      OTHER_CHAT,
    );

    // Two memberships in this chat claim the same username.
    h = harness();
    h.seedMember(CHAT, 3003n, "baukov");
    h.seedMember(CHAT, 4004n, "Baukov", false);
    await invite(h, "baukov");
    expect(h.invites.size).toBe(1);
    expect(h.members.get(`membership-${CHAT}-4004`).activeAt).toBeNull();
  });

  it.each(["en", "uk"] as const)(
    "keeps the usage reply for a missing or malformed argument in %s",
    async (locale) => {
      const h = harness(locale);
      for (const text of [
        "/roster_add",
        "/roster_add baukov",
        "/roster_add @abc",
        "/roster_add @bad-name",
        "/roster_add @baukov extra",
        `/roster_add @${BOT_USERNAME}`,
        `/roster_add @${BOT_USERNAME.toLowerCase()}`,
      ]) {
        await h.command(text);
        expect(h.lastText()).toBe(
          renderMessage(locale, "roster.addUsage", undefined),
        );
      }
      expect(h.invites.size).toBe(0);
      expect(h.members.size).toBe(0);
    },
  );

  it("keeps the reply flow unchanged and never invites when replying", async () => {
    const h = harness();
    await h.command("/roster_add", {
      reply: { id: 2002, first_name: "Replied" },
    });
    await h.command("/roster_add @other_person", {
      reply: { id: 2003, first_name: "Also replied" },
    });
    expect(h.members.get(`membership-${CHAT}-2002`)).toBeDefined();
    expect(h.members.get(`membership-${CHAT}-2003`)).toBeDefined();
    expect(h.members.size).toBe(2);
    expect(h.invites.size).toBe(0);
  });

  it.each(["en", "uk"] as const)(
    "denies /roster_add @username to a non-administrator in %s",
    async (locale) => {
      const h = harness(locale);
      await h.command("/roster_add @baukov", { actor: 7007n });
      expect(h.lastText()).toBe(
        renderMessage(locale, "common.denied", undefined),
      );
      expect(h.invites.size).toBe(0);
      expect(h.actions.size).toBe(0);
    },
  );

  it.each(["en", "uk"] as const)(
    "reports a failed invite write without logging the username in %s",
    async (locale) => {
      const h = harness(locale);
      h.failInvites();
      await h.command("/roster_add @baukov");
      expect(h.lastText()).toBe(
        renderMessage(locale, "common.saveFailure", undefined),
      );
      expect(h.invites.size).toBe(0);
      expect(h.logs).toHaveLength(1);
      expect(h.logs[0]).toMatchObject({
        event: "telegram.handler.failure",
        route: "command:roster_add",
        outcome: "roster-invite-failed",
      });
      expect(
        JSON.stringify(h.logs[0], (_key, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ).toLowerCase(),
      ).not.toContain("baukov");
    },
  );
});

describe("parseRosterAddArgument", () => {
  const parse = (text: string, extra: MessageEntity[] = []) =>
    parseRosterAddArgument({
      text,
      entities: [
        {
          type: "bot_command",
          offset: 0,
          length: text.split(" ")[0]!.length,
        },
        ...extra,
      ],
    });

  it("reads a single @username argument", () => {
    expect(parse("/roster_add @Baukov")).toEqual({
      kind: "username",
      username: "baukov",
    });
    expect(parse("/roster_add@GSMBot @Baukov")).toEqual({
      kind: "username",
      username: "baukov",
    });
    expect(parse("/roster_add   @Baukov  ")).toEqual({
      kind: "username",
      username: "baukov",
    });
  });

  it("reads a text_mention user after the command", () => {
    expect(
      parse("/roster_add Oleh", [
        {
          type: "text_mention",
          offset: 12,
          length: 4,
          user: {
            id: 3003,
            is_bot: false,
            first_name: "Oleh",
            last_name: "B",
            username: "baukov",
          },
        },
      ]),
    ).toEqual({
      kind: "user",
      identity: {
        id: 3003n,
        isBot: false,
        firstName: "Oleh",
        lastName: "B",
        username: "baukov",
      },
    });
    expect(
      parse("/roster_add Robot", [
        {
          type: "text_mention",
          offset: 12,
          length: 5,
          user: { id: 9, is_bot: true, first_name: "Robot" },
        },
      ]),
    ).toEqual({ kind: "invalid" });
  });

  it("rejects everything else", () => {
    expect(parse("/roster_add")).toEqual({ kind: "none" });
    for (const text of [
      "/roster_add baukov",
      "/roster_add @abc",
      "/roster_add @bad-name",
      "/roster_add @1baukov",
      "/roster_add @baukov extra",
      "/roster_add @@baukov",
    ])
      expect(parse(text)).toEqual({ kind: "invalid" });
  });
});
