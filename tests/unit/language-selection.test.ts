import { describe, expect, it } from "vitest";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import { createLanguageTarget, parseLanguageTarget } from "../../src/shared/callback-schema.js";

const now = new Date("2026-09-16T12:00:00Z");
function store() {
  const preferences = new Map<bigint, any>();
  const actions = new Map<string, any>();
  let writes = 0;
  const prisma: any = {
    async $executeRaw() {},
    async $transaction(fn: any) { return fn(prisma); },
    chatLanguagePreference: {
      async findUnique({where}: any) { return preferences.get(where.chatId) ?? null; },
      async upsert({where, create, update}: any) {
        writes++;
        const row = preferences.has(where.chatId) ? {...preferences.get(where.chatId), ...update} : create;
        preferences.set(where.chatId, row); return row;
      },
    },
    callbackAction: {
      async findUnique({where}: any) { return actions.get(where.token) ?? null; },
      async updateMany({where, data}: any) {
        const row = actions.get(where.token);
        if (!row || row.consumedAt !== null) return {count: 0};
        Object.assign(row, data); return {count: 1};
      },
    },
  };
  function token(token: string, locale: "en" | "uk", overrides = {}) {
    actions.set(token, {token, kind: "SETTINGS_EDIT", chatId: 1n, actorUserId: 2n,
      targetId: createLanguageTarget({action: "language-select", locale, destination: "settings"}),
      consumedAt: null, expiresAt: new Date(now.getTime()+60000), ...overrides});
  }
  return {service: new LanguageService(prisma), preferences, token, writes: () => writes};
}

describe("durable language selections", () => {
  it("persists the first explicit English choice once and leaves repeated timestamps unchanged", async () => {
    const s = store();
    expect(await s.service.resolve(1n)).toEqual({locale: "en", explicitlySelected: false});
    expect(await s.service.select(1n, "en", now)).toMatchObject({kind: "unchanged", locale: "en"});
    const before = {...s.preferences.get(1n)};
    await s.service.select(1n, "en", new Date(now.getTime()+1000));
    expect(s.preferences.get(1n)).toEqual(before);
    expect(s.writes()).toBe(1);
  });
  it("accepts independently valid screens in mutation order without affecting another chat", async () => {
    const s = store(); s.token("a", "uk"); s.token("b", "en");
    expect(await s.service.accept(1n, 2n, "a", now)).toMatchObject({kind: "changed", locale: "uk"});
    expect(await s.service.accept(1n, 2n, "b", now)).toMatchObject({kind: "changed", locale: "en"});
    expect(await s.service.resolve(3n)).toEqual({locale: "en", explicitlySelected: false});
    expect(await s.service.accept(1n, 2n, "a", now)).toEqual({kind: "stale"});
    expect(s.writes()).toBe(2);
  });
  it.each([
    {chatId: 9n}, {actorUserId: 9n}, {expiresAt: now}, {consumedAt: now},
    {targetId: '{"action":"language-select","locale":"fr","destination":"settings"}'},
  ])("refuses invalid actions without preference writes: %j", async (overrides) => {
    const s=store(); s.token("a", "uk", overrides);
    expect(await s.service.accept(1n, 2n, "a", now)).toEqual({kind:"stale"});
    expect(s.writes()).toBe(0);
  });
  it("rejects extra authority fields and unsupported locales in stored targets", () => {
    expect(parseLanguageTarget('{"action":"language-select","locale":"uk","destination":"settings","actorId":2}').success).toBe(false);
    expect(parseLanguageTarget("not-json").success).toBe(false);
  });
});
