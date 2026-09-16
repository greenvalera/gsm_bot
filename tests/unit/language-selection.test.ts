import { describe, expect, it, vi } from "vitest";
import { Bot } from "grammy";
import { registerCallbackBoundary } from "../../src/telegram/callbacks.js";
import { dispatchLanguageCallback } from "../../src/telegram/language-handlers.js";
import { createLogger } from "../../src/shared/logger.js";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import {
  createLanguageTarget,
  parseLanguageTarget,
} from "../../src/shared/callback-schema.js";

const now = new Date("2026-09-16T12:00:00Z");
function store() {
  const preferences = new Map<bigint, any>();
  const actions = new Map<string, any>();
  let writes = 0;
  const prisma: any = {
    async $executeRaw() {},
    async $transaction(fn: any) {
      return fn(prisma);
    },
    chatLanguagePreference: {
      async findUnique({ where }: any) {
        return preferences.get(where.chatId) ?? null;
      },
      async upsert({ where, create, update }: any) {
        writes++;
        const row = preferences.has(where.chatId)
          ? { ...preferences.get(where.chatId), ...update }
          : create;
        preferences.set(where.chatId, row);
        return row;
      },
    },
    callbackAction: {
      async findUnique({ where }: any) {
        return actions.get(where.token) ?? null;
      },
      async updateMany({ where, data }: any) {
        const row = actions.get(where.token);
        if (!row || row.consumedAt !== null) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  function token(token: string, locale: "en" | "uk", overrides = {}) {
    actions.set(token, {
      token,
      kind: "SETTINGS_EDIT",
      chatId: 1n,
      actorUserId: 2n,
      targetId: createLanguageTarget({
        action: "language-select",
        locale,
        destination: "settings",
      }),
      consumedAt: null,
      expiresAt: new Date(now.getTime() + 60000),
      ...overrides,
    });
  }
  return {
    prisma,
    actions,
    service: new LanguageService(prisma),
    preferences,
    token,
    writes: () => writes,
  };
}

describe("durable language selections", () => {
  it("persists the first explicit English choice once and leaves repeated timestamps unchanged", async () => {
    const s = store();
    expect(await s.service.resolve(1n)).toEqual({
      locale: "en",
      explicitlySelected: false,
    });
    expect(await s.service.select(1n, "en", now)).toMatchObject({
      kind: "unchanged",
      locale: "en",
    });
    const before = { ...s.preferences.get(1n) };
    await s.service.select(1n, "en", new Date(now.getTime() + 1000));
    expect(s.preferences.get(1n)).toEqual(before);
    expect(s.writes()).toBe(1);
  });
  it("accepts independently valid screens in mutation order without affecting another chat", async () => {
    const s = store();
    s.token("a", "uk");
    s.token("b", "en");
    expect(await s.service.accept(1n, 2n, "a", now)).toMatchObject({
      kind: "changed",
      locale: "uk",
    });
    expect(await s.service.accept(1n, 2n, "b", now)).toMatchObject({
      kind: "changed",
      locale: "en",
    });
    expect(await s.service.resolve(3n)).toEqual({
      locale: "en",
      explicitlySelected: false,
    });
    expect(await s.service.accept(1n, 2n, "a", now)).toEqual({ kind: "stale" });
    expect(s.writes()).toBe(2);
  });
  it.each([
    { chatId: 9n },
    { actorUserId: 9n },
    { expiresAt: now },
    { consumedAt: now },
    {
      targetId:
        '{"action":"language-select","locale":"fr","destination":"settings"}',
    },
  ])(
    "refuses invalid actions without preference writes: %#",
    async (overrides) => {
      const s = store();
      s.token("a", "uk", overrides);
      expect(await s.service.accept(1n, 2n, "a", now)).toEqual({
        kind: "stale",
      });
      expect(s.writes()).toBe(0);
    },
  );
  it("rejects extra authority fields and unsupported locales in stored targets", () => {
    expect(
      parseLanguageTarget(
        '{"action":"language-select","locale":"uk","destination":"settings","actorId":2}',
      ).success,
    ).toBe(false);
    expect(parseLanguageTarget("not-json").success).toBe(false);
  });
  it.each([
    "valid",
    "same",
    "lost-role",
    "actor",
    "chat",
    "expired",
    "consumed",
    "unsupported",
  ])(
    "acknowledges exactly once through the real boundary: %s",
    async (scenario) => {
      const s = store();
      const token = `v1:${crypto.randomUUID()}`;
      s.token(token, scenario === "same" ? "en" : "uk");
      const row = s.actions.get(token);
      if (scenario === "actor") row.actorUserId = 9n;
      if (scenario === "chat") row.chatId = 9n;
      if (scenario === "expired") row.expiresAt = now;
      if (scenario === "consumed") row.consumedAt = now;
      if (scenario === "unsupported") row.targetId = "{}";
      const answers: any[] = [];
      const bot = new Bot("123456:TEST_TOKEN", {
        botInfo: {
          id: 9001,
          is_bot: true,
          first_name: "GSMBot",
          username: "gsmbot",
          can_join_groups: true,
          can_read_all_group_messages: false,
          supports_inline_queries: false,
          can_connect_to_business: false,
          has_main_web_app: false,
        },
      });
      bot.api.config.use(async (_prev, method, payload) => {
        expect(method).toBe("answerCallbackQuery");
        answers.push(payload);
        return { ok: true, result: true } as never;
      });
      const refresh = vi.fn(async () =>
        scenario === "lost-role" ? "member" : "administrator",
      );
      const navigation = {
        setup: vi.fn(async () => {}),
        settings: vi.fn(async () => {}),
      };
      registerCallbackBoundary(
        bot,
        {
          prisma: s.prisma,
          now: () => now,
          logger: createLogger({ destination: { write() {} } }),
          authorization: {
            currentRole: refresh,
            requireCurrentAdministrator: vi.fn(),
            discardActorDrafts: vi.fn(),
          } as never,
        },
        {
          SETTINGS_EDIT: {
            staleText: "stale",
            authority: "current-admin",
            actorBinding: "strict",
            dispatch: (ctx, context, action, time) =>
              dispatchLanguageCallback(
                ctx,
                s.prisma,
                context,
                action,
                time,
                navigation,
              ),
          },
        },
        { exhaustive: true },
      );
      await bot.handleUpdate({
        update_id: 1,
        callback_query: {
          id: "q",
          chat_instance: "c",
          data: token,
          from: { id: 2, is_bot: false, first_name: "Admin" },
          message: {
            message_id: 1,
            date: 1,
            chat: { id: 1, type: "supergroup", title: "Band" },
          },
        },
      });
      expect(refresh).toHaveBeenCalledOnce();
      expect(answers).toHaveLength(1);
      expect(s.writes()).toBe(
        scenario === "valid" || scenario === "same" ? 1 : 0,
      );
      if (scenario === "same") expect(answers[0].text).toBeUndefined();
    },
  );
});
