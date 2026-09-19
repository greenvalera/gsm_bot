import { recordOutboundEvidence } from "../helpers/outbound-evidence.js";
import { describe, expect, it, vi } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { dispatchLanguageCallback } from "../../src/telegram/language-handlers.js";
import { handleSettingsCommand } from "../../src/telegram/settings-handlers.js";
import { projectRoster } from "../../src/telegram/roster-handlers.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import { planningNotAuthorText } from "../../src/telegram/planning-handlers.js";
import {
  localizedMemberLabel,
  localizedPlainMemberLabel,
} from "../../src/telegram/roster-renderers.js";

const chatId = -1006007001;
const now = new Date("2026-09-16T12:00:00Z");
describe.each(["en", "uk"] as const)("language navigation in %s", (locale) => {
  it.each([
    "stale",
    "open",
    "changed-setup",
    "changed-settings",
    "unchanged-setup",
    "unchanged-settings",
    "continue",
  ] as const)("renders and routes %s language outcome", async (branch) => {
    const target =
      branch === "open"
        ? { action: "language-open", destination: "settings" }
        : branch === "continue"
          ? { action: "language-continue-setup" }
          : {
              action: "language-select",
              locale,
              destination: branch.endsWith("setup") ? "setup" : "settings",
            };
    const result =
      branch === "stale"
        ? { kind: "stale" }
        : {
            kind: branch.startsWith("changed-")
              ? "changed"
              : branch.startsWith("unchanged-")
                ? "unchanged"
                : "navigation",
            locale,
            target,
          };
    const ctx = { answerCallbackQuery: vi.fn(), editMessageText: vi.fn() };
    const navigation = { setup: vi.fn(), settings: vi.fn() };
    const create = vi.fn(async ({ data }) => data);
    await dispatchLanguageCallback(
      ctx as never,
      {
        chatLanguagePreference: {
          findUnique: async () => ({ locale, explicitlySelected: true }),
        },
        callbackAction: { create },
        $transaction: async () => result,
      } as never,
      { chatId: 1n, actorId: 2n },
      { token: "token" } as never,
      now,
      navigation,
    );
    if (branch === "stale") {
      expect(ctx.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
        text: renderMessage(locale, "language.stale", undefined),
        show_alert: true,
      });
    } else if (branch === "open") {
      expect(ctx.editMessageText.mock.calls[0]?.[0]).toBe(
        renderMessage(locale, "language.select", undefined),
      );
      const markup = JSON.stringify(ctx.editMessageText.mock.calls[0]?.[1]);
      expect(markup).toContain("English");
      expect(markup).toContain("Українська");
      expect(create).toHaveBeenCalledTimes(2);
    } else {
      if (branch.startsWith("changed-"))
        expect(ctx.answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
          text: renderMessage(locale, "language.changed", undefined),
        });
      else expect(ctx.answerCallbackQuery).not.toHaveBeenCalled();
      expect(
        navigation[
          branch.endsWith("setup") || branch === "continue"
            ? "setup"
            : "settings"
        ],
      ).toHaveBeenCalledExactlyOnceWith();
    }
    if (branch === "stale" || branch === "open") {
      expect(navigation.setup).not.toHaveBeenCalled();
      expect(navigation.settings).not.toHaveBeenCalled();
    }
    if (branch !== "open") expect(create).not.toHaveBeenCalled();

    recordOutboundEvidence(
      [
        "src/telegram/language-handlers.ts#module:factory.renderLanguageSelection:1",
        "src/telegram/language-handlers.ts#renderLanguageSelection:keyboard.text:1",
        "src/telegram/language-handlers.ts#renderLanguageSelection:text:1",
        "src/telegram/language-handlers.ts#dispatchLanguageCallback:answerCallbackQuery:2",
        "src/telegram/language-handlers.ts#dispatchLanguageCallback:text:2",
        "src/telegram/language-handlers.ts#dispatchLanguageCallback:editMessageText:1",
        "src/telegram/language-handlers.ts#dispatchLanguageCallback:answerCallbackQuery:3",
        "src/telegram/language-handlers.ts#dispatchLanguageCallback:text:3",
      ],
      locale,
    );
  });
  it("masks the localized unnamed member fallback", () => {
    const member = {
      telegramUserId: 123456789n,
      firstName: " ",
      lastName: null,
      username: null,
    };
    const expected = renderMessage(locale, "roster.fallback", {
      suffix: "6789",
    });
    expect(localizedPlainMemberLabel(member, locale)).toBe(expected);
    expect(localizedMemberLabel(member, locale)).toBe(expected);
    expect(expected).not.toContain("123456789");
  });
});
it.each(["en", "uk"] as const)(
  "shares the %s member label while escaping HTML cards only once",
  (locale) => {
    const member = {
      telegramUserId: 123456789n,
      firstName: "Ben & <b>Jo</b> 🎸",
      lastName: null,
      username: null,
    };
    expect(planningNotAuthorText(member, locale)).toContain(
      localizedPlainMemberLabel(member, locale),
    );
    expect(localizedMemberLabel(member, locale)).toBe(
      "Ben &amp; &lt;b&gt;Jo&lt;/b&gt; 🎸",
    );
    expect(localizedMemberLabel(member, locale)).not.toContain("&amp;amp;");
  },
);
describe("database outage presentation recovery", () => {
  const outage = async () => {
    throw Error("database unavailable");
  };
  const logger = { error: vi.fn(), debug: vi.fn() };
  it("confirms the committed language when the post-write locale read fails", async () => {
    const answerCallbackQuery = vi.fn();
    const findUnique = vi.fn(outage);
    findUnique.mockImplementationOnce((() => ({ locale: "en" })) as never);
    await dispatchLanguageCallback(
      { answerCallbackQuery } as never,
      {
        chatLanguagePreference: { findUnique },
        $transaction: async () => ({
          kind: "changed",
          locale: "uk",
          target: {
            action: "language-select",
            locale: "uk",
            destination: "settings",
          },
        }),
      } as never,
      { chatId: 1n, actorId: 2n },
      { token: "token" } as never,
      now,
      { setup: vi.fn(), settings: vi.fn() },
      logger as never,
    );
    expect(answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
      text: renderMessage("uk", "language.changed", undefined),
    });
  });
  it.each([false, true])(
    "still reports language save failure with last-known locale: %s",
    async (known) => {
      const answerCallbackQuery = vi.fn();
      const findUnique = vi.fn(outage);
      if (known)
        findUnique.mockImplementationOnce((() => ({ locale: "uk" })) as never);
      await dispatchLanguageCallback(
        { answerCallbackQuery } as never,
        {
          chatLanguagePreference: { findUnique },
          $transaction: outage,
        } as never,
        { chatId: 1n, actorId: 2n },
        { token: "token" } as never,
        now,
        { setup: vi.fn(), settings: vi.fn() },
        logger as never,
      );
      expect(answerCallbackQuery).toHaveBeenCalledExactlyOnceWith({
        text: renderMessage(known ? "uk" : "en", "language.failure", undefined),
        show_alert: true,
      });

      recordOutboundEvidence(
        [
          "src/telegram/language-handlers.ts#dispatchLanguageCallback:answerCallbackQuery:1",
          "src/telegram/language-handlers.ts#dispatchLanguageCallback:text:1",
        ],
        known ? "uk" : "en",
      );
    },
  );
  it("reports settings read failure when preference lookup is also unavailable", async () => {
    const reply = vi.fn();
    await handleSettingsCommand(
      { reply },
      {
        prisma: { chatLanguagePreference: { findUnique: outage } },
        settings: { getCommitted: async () => ({ kind: "failed" }) },
        logger,
      } as never,
      { chatId: 1n, actorId: 2n },
    );
    expect(reply).toHaveBeenCalledWith(
      renderMessage("en", "settings.failure", undefined),
    );
  });
  it.each([false, true])(
    "reports roster failure without unsafe retry action, last-known locale: %s",
    async (known) => {
      const emit = vi.fn();
      const findUnique = vi.fn(outage);
      if (known)
        findUnique.mockImplementationOnce((() => ({ locale: "uk" })) as never);
      await projectRoster(
        {
          prisma: {
            chatLanguagePreference: { findUnique },
            callbackAction: { create: outage },
          },
          roster: { listActive: outage },
          logger,
          now: () => now,
        } as never,
        "command:roster",
        { chatId: 1n, actorId: 2n },
        0,
        emit,
      );
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit.mock.calls[1]?.[0]).toMatchObject({
        kind: "failed",
        text: expect.stringContaining(
          renderMessage(known ? "uk" : "en", "roster.failure", undefined),
        ),
      });
      expect(emit.mock.calls[1]?.[0].keyboard).toBeUndefined();
    },
  );
});
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

        recordOutboundEvidence(
          [
            "src/telegram/callbacks.ts#denyNonAdministrator:answerCallbackQuery:1",
            "src/telegram/callbacks.ts#denyNonAdministrator:text:1",
          ],
          locale,
        );
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

        recordOutboundEvidence(
          [
            "src/telegram/callbacks.ts#unresolved:answerCallbackQuery:1",
            "src/telegram/callbacks.ts#unresolved:text:1",
          ],
          locale,
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

      recordOutboundEvidence(
        [
          "src/telegram/callbacks.ts#registerCallbackBoundary:answerCallbackQuery:1",
          "src/telegram/callbacks.ts#registerCallbackBoundary:text:1",
          "src/telegram/callbacks.ts#registerCallbackBoundary:answerCallbackQuery:2",
        ],
        locale,
      );
    });
  },
);
