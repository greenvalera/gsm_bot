import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it, vi } from "vitest";
import { RosterService } from "../../src/domain/roster/roster-service.js";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import { PermissionDeniedError } from "../../src/domain/auth/authorization-service.js";
import { createLogger } from "../../src/shared/logger.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import { registerRosterHandlers } from "../../src/telegram/handlers.js";

const CHAT = -1001234567890n;
const ACTOR = 1001n;
const MEMBER = 2002n;
const NOW = new Date("2026-09-16T10:00:00Z");
const NAME = "Оля <>&🎵е́";

function harness(initial: Locale = "uk") {
  let locale = initial;
  let admin = true;
  let fail = false;
  let afterWrite = async () => {};
  const actions = new Map<string, any>();
  const members = new Map<string, any>();
  const users = new Map<bigint, any>();
  const calls: { method: string; payload: any }[] = [];
  const prisma: any = {
    $executeRaw: async () => 0,
    chatMigration: { findUnique: async () => null },
    chatLanguagePreference: {
      findUnique: async () => ({ chatId: CHAT, locale, explicitlySelected: true }),
      upsert: async ({ update }: any) => { locale = update.locale; },
    },
    callbackAction: {
      create: async ({ data }: any) => { actions.set(data.token, { ...data, consumedAt: null }); return actions.get(data.token); },
      findUnique: async ({ where }: any) => actions.get(where.token) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = actions.get(where.token);
        if (!row || row.consumedAt !== null || (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    telegramUser: {
      upsert: async ({ where, create, update }: any) => {
        const row = { ...(users.get(where.telegramUserId) ?? create), ...update };
        users.set(where.telegramUserId, row); return row;
      },
    },
    chatMembership: {
      findUnique: async ({ where, include }: any) => {
        const row = where.id ? members.get(where.id) : [...members.values()].find(row => row.chatId === where.chatId_telegramUserId.chatId && row.telegramUserId === where.chatId_telegramUserId.telegramUserId);
        return row ? { ...row, ...(include ? { telegramUser: users.get(row.telegramUserId) } : {}) } : null;
      },
      upsert: async ({ create, update }: any) => {
        const id = `membership-${create.chatId}-${create.telegramUserId}`;
        const row = { ...(members.get(id) ?? { id, ...create }), ...update };
        members.set(id, row); return { ...row, telegramUser: users.get(row.telegramUserId) };
      },
      findMany: async () => [...members.values()].filter(row => row.activeAt !== null && row.deactivatedAt === null).map(row => ({ ...row, telegramUser: users.get(row.telegramUserId) })),
      updateMany: async ({ where, data }: any) => {
        const row = members.get(where.id);
        if (!row || row.chatId !== where.chatId || row.activeAt === null || row.deactivatedAt !== null) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    $transaction: async (operation: any) => {
      if (fail) throw new Error("storage unavailable");
      const result = await operation(prisma);
      const hook = afterWrite; afterWrite = async () => {}; await hook();
      return result;
    },
  };
  const roster = new RosterService(prisma);
  const language = new LanguageService(prisma);
  const authorization = {
    requireCurrentAdministrator: async () => { if (!admin) throw new PermissionDeniedError(); },
    currentRole: async () => admin ? "administrator" : "member",
    discardActorDrafts: async () => {},
  };
  const bot = new Bot("123456:TEST_TOKEN", { botInfo: { id: 9001, is_bot: true, first_name: "GSMBot" } as UserFromGetMe });
  registerRosterHandlers(bot, { logger: createLogger({level: "silent"}), prisma, roster, authorization, now: () => NOW } as never);
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: { message_id: 42, date: 1, chat: { id: Number(CHAT), type: "supergroup" }, text: (payload as any).text ?? "" } } as never;
  });
  let nextUpdate = 1;
  const chat = { id: Number(CHAT), type: "supergroup" };
  const from = { id: Number(ACTOR), is_bot: false, first_name: "Admin" };
  return {
    prisma, roster, language, actions, members, calls,
    demote() { admin = false; },
    fail() { fail = true; },
    afterWrite(hook: () => Promise<void>) { afterWrite = hook; },
    async add(reply: "member" | "bot" | "none" = "member") {
      await bot.handleUpdate({ update_id: nextUpdate++, message: { message_id: 1, date: 1, chat, from, text: "/roster_add", entities: [{offset: 0, length: 11, type: "bot_command"}], ...(reply === "none" ? {} : {reply_to_message: {message_id: 2, date: 1, chat, from: {id: Number(MEMBER), is_bot: reply === "bot", first_name: NAME}}}) } } as never);
    },
    async click(token: string, actor = Number(ACTOR)) {
      calls.length = 0;
      await bot.handleUpdate({ update_id: nextUpdate++, callback_query: { id: `callback-${nextUpdate}`, from: {...from, id: actor}, chat_instance: "fixture", data: token, message: { message_id: 42, date: 1, chat, text: "existing card" } } } as never);
      expect(calls.filter(call => call.method === "answerCallbackQuery")).toHaveLength(1);
    },
    async confirmation() {
      const added = await roster.addFromRepliedUser(CHAT, ACTOR, { id: MEMBER, isBot: false, firstName: NAME });
      const token = await roster.createRemovalAction(CHAT, ACTOR, added.member.membershipId, NOW);
      if (!token) throw new Error("Missing request");
      await this.click(token);
      const controls = calls.find(call => call.method === "editMessageText")!.payload.reply_markup.inline_keyboard.flat();
      return { remove: controls[0].callback_data as string, keep: controls[1].callback_data as string, request: token };
    },
    lastText() { return calls.filter(call => call.payload.text).at(-1)!.payload.text as string; },
  };
}

describe("localized roster controllers", () => {
  it.each(["en", "uk"] as const)("preserves safe add and duplicate identity in %s", async locale => {
    const h = harness(locale);
    await h.add();
    expect(h.lastText()).toBe(renderMessage(locale, "roster.added", { label: "Оля &lt;&gt;&amp;🎵е́" }));
    await h.add();
    expect(h.lastText()).toBe(renderMessage(locale, "roster.alreadyActive", { label: "Оля &lt;&gt;&amp;🎵е́" }));
    expect(h.members.size).toBe(1);
  });
  it.each(["none", "bot"] as const)("gives Ukrainian corrective reply guidance for %s", async reply => {
    const h = harness(); await h.add(reply);
    expect(h.lastText()).toBe(renderMessage("uk", "roster.addUsage", undefined));
    expect(h.members.size).toBe(0);
  });
  it("uses the locale selected during the add write", async () => {
    const h = harness("en");
    h.afterWrite(async () => { await h.language.select(CHAT, "uk", NOW); });
    await h.add(); expect(h.lastText()).toContain("тепер у складі гурту");
  });
  it("localizes failed add recovery without inventing a member", async () => {
    const h = harness(); h.fail(); await h.add();
    expect(h.lastText()).toBe(renderMessage("uk", "common.saveFailure", undefined));
    expect(h.members.size).toBe(0);
  });
  it.each(["en", "uk"] as const)("renders minted removal review in %s", async locale => {
    const h = harness(locale); const tokens = await h.confirmation();
    expect(h.lastText()).toContain(renderMessage(locale, "roster.removeTitle", {label: "Оля &lt;&gt;&amp;🎵е́"}));
    const controls = h.calls.find(call => call.method === "editMessageText")!.payload.reply_markup.inline_keyboard.flat();
    expect(controls.map((control: any) => control.text)).toEqual([renderMessage(locale, "roster.remove", undefined), renderMessage(locale, "roster.keep", undefined)]);
    for (const token of Object.values(tokens)) expect(Buffer.byteLength(token)).toBeLessThanOrEqual(64);
  });
  it.each(["remove", "keep"] as const)("preserves real English confirmation across language selection: %s", async action => {
    const h = harness("en"); const tokens = await h.confirmation();
    const before = structuredClone({actions: h.actions, members: h.members});
    await h.language.select(CHAT, "uk", NOW);
    expect({actions: h.actions, members: h.members}).toEqual(before);
    await h.click(tokens[action]);
    expect(h.lastText()).toBe(action === "remove" ? `${renderMessage("uk", "roster.updated", undefined)}\n${renderMessage("uk", "roster.consequence", undefined)}` : renderMessage("uk", "roster.cancelled", undefined));
    expect([...h.members.values()][0].activeAt === null).toBe(action === "remove");
  });
  it("refreshes language after a removal transaction", async () => {
    const h = harness("en"); const tokens = await h.confirmation();
    h.afterWrite(async () => { await h.language.select(CHAT, "uk", NOW); });
    await h.click(tokens.remove); expect(h.lastText()).toContain("Склад гурту оновлено");
  });
  it("retains current administrator checks and single acknowledgement", async () => {
    const h = harness(); const tokens = await h.confirmation(); h.demote();
    await h.click(tokens.remove);
    expect([...h.members.values()][0].activeAt).not.toBeNull();
    expect(h.actions.get(tokens.remove).consumedAt).toBeNull();
    expect(h.calls.some(call => call.method === "editMessageText")).toBe(false);
  });
  it.each(["duplicate", "stale", "failed"] as const)("localizes %s returned after dispatch without extra acknowledgement", async kind => {
    const h = harness(); const tokens = await h.confirmation();
    vi.spyOn(h.roster, "removeConfirmed").mockResolvedValue({kind});
    await h.click(tokens.remove);
    // Failed operations retain the existing stale recovery destination.
    expect(h.lastText()).toBe(renderMessage("uk", kind === "duplicate" ? "common.applied" : "common.stale", undefined));
    expect(h.lastText().length).toBeLessThanOrEqual(200);
  });
  it("rejects a genuine removed-member race with Ukrainian recovery", async () => {
    const h = harness(); const tokens = await h.confirmation();
    h.members.clear(); await h.click(tokens.remove);
    expect(h.lastText()).toBe(renderMessage("uk", "common.stale", undefined));
  });
});
