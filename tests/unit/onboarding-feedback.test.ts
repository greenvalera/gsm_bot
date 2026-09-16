import { describe, expect, it, vi } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { dispatchLanguageCallback } from "../../src/telegram/language-handlers.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";

const chatId = -1006007001;
const now = new Date("2026-09-16T12:00:00Z");
it("resolves failure feedback after the attempted language write", async () => {
  let locale = "en";
  const answerCallbackQuery = vi.fn();
  const prisma = {
    chatLanguagePreference: { findUnique: async () => ({ locale }) },
    $transaction: async () => {
      locale = "uk";
      throw Error("write failed");
    },
  };
  await dispatchLanguageCallback(
    { answerCallbackQuery } as never,
    prisma as never,
    { chatId: 1n, actorId: 2n },
    { token: "token" } as never,
    now,
    { setup: vi.fn(), settings: vi.fn() },
  );
  expect(answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
    text: "Не вдалося зберегти мову. Спробуй ще раз.",
    show_alert: true,
  });
});
function harness(locale: Locale, role = "administrator") {
  const calls: Array<{ method: string; payload: any }> = [];
  const actions = new Map<string, any>();
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const findUnique = vi.fn(async ({ where }: any) => ({
    locale: where.chatId === BigInt(chatId) ? locale : "en",
    explicitlySelected: true,
  }));
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as never,
    prisma: {
      chatMigration: { findUnique: async () => null },
      chatLanguagePreference: { findUnique },
      callbackAction: {
        findUnique: async ({ where }: any) => actions.get(where.token) ?? null,
      },
      setupDraft: { deleteMany },
      settingsEditDraft: { deleteMany },
    } as never,
    now: () => now,
    membershipGateway: { getCurrentRole: async () => role as never },
  });
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    return { ok: true, result: true } as never;
  });
  const chat = { id: chatId, type: "supergroup" as const, title: "Band" };
  const from = {
    id: 8101,
    is_bot: false,
    first_name: "Admin",
    language_code: locale === "uk" ? "en" : "uk",
  };
  return {
    calls,
    actions,
    deleteMany,
    findUnique,
    async command(text: string) {
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: 1,
          chat,
          from,
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
        },
      });
    },
    async tap(data: string) {
      await bot.handleUpdate({
        update_id: 2,
        callback_query: {
          id: "cb",
          chat_instance: "c",
          from,
          data,
          message: { message_id: 1, date: 1, chat },
        },
      });
      expect(
        calls.filter((c) => c.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
  };
}
describe.each(["en", "uk"] as const)(
  "%s onboarding boundary feedback",
  (locale) => {
    it.each(["/setup", "/settings", "/roster", "/roster_add"])(
      "localizes %s denial using group preference",
      async (command) => {
        const h = harness(locale, "member");
        await h.command(command);
        expect(h.calls[0]?.payload.text).toBe(
          renderMessage(locale, "common.denied", undefined),
        );
        expect(h.deleteMany).toHaveBeenCalledTimes(2);
      },
    );
    it.each(["malformed", `v1:${crypto.randomUUID()}`])(
      "localizes unresolved token %s",
      async (token) => {
        const h = harness(locale);
        await h.tap(token);
        expect(h.calls[0]?.payload.text).toBe(
          renderMessage(locale, "common.stale", undefined),
        );
      },
    );
    it.each([
      "foreign-chat",
      "foreign-actor",
      "expired",
      "consumed",
      "denied",
      "unknown-role",
    ])("retains %s validity and authority", async (reason) => {
      const h = harness(
        locale,
        reason === "denied"
          ? "member"
          : reason === "unknown-role"
            ? "unknown"
            : "administrator",
      );
      const token = `v1:${crypto.randomUUID()}`;
      h.actions.set(token, {
        token,
        kind: CallbackActionKind.START_SETUP,
        chatId: BigInt(chatId + (reason === "foreign-chat" ? 1 : 0)),
        actorUserId: reason === "foreign-actor" ? 999n : 8101n,
        targetId: null,
        expiresAt: new Date(
          now.getTime() + (reason === "expired" ? -1 : 60000),
        ),
        consumedAt: reason === "consumed" ? now : null,
      });
      await h.tap(token);
      const denied = reason === "denied" || reason === "unknown-role";
      expect(h.calls[0]?.payload.text).toBe(
        denied
          ? locale === "en"
            ? "Only current chat administrators can do that."
            : "Це можуть робити лише поточні адміністратори чату."
          : renderMessage(locale, "setup.stale", undefined),
      );
      expect(h.deleteMany).toHaveBeenCalledTimes(denied ? 2 : 0);
      expect(
        h.findUnique.mock.calls.every(
          ([input]) => input.where.chatId === BigInt(chatId),
        ),
      ).toBe(true);
    });
  },
);
