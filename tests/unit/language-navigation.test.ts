import { describe, expect, it, vi } from "vitest";
import {
  handleSetupCommand,
  continueSetup,
  handleSetupText,
  handleSetupLocation,
  dispatchSetupCallback,
} from "../../src/telegram/setup-handlers.js";
import { handleSettingsCommand } from "../../src/telegram/settings-handlers.js";
import {
  planningAccessKeyboard,
  settingsDashboardKeyboard,
  settingsReviewKeyboard,
} from "../../src/telegram/keyboards.js";
import { createSetupTarget } from "../../src/shared/callback-schema.js";

const context = { chatId: 1n, actorId: 2n };
function harness(explicitlySelected = false, locale = "en") {
  const actions: any[] = [];
  const reply = vi.fn(async (_text: string, _options?: object) => ({}));
  const draft = {
    id: "draft",
    timezone: null,
    defaultWeekday: null,
    defaultStartMinute: null,
    durationMinutes: null,
    dailyStartMinute: null,
    dailyEndMinute: null,
    reminderMinutes: [],
    planningAccessPolicy: null,
  };
  const deps: any = {
    logger: { debug: vi.fn(), error: vi.fn() },
    now: () => new Date("2026-09-16T12:00:00Z"),
    prisma: {
      chatLanguagePreference: {
        findUnique: vi.fn(async () =>
          explicitlySelected ? { locale, explicitlySelected } : null,
        ),
      },
      chatConfiguration: { findUnique: vi.fn(async () => null) },
      callbackAction: {
        create: vi.fn(async ({ data }) => {
          actions.push(data);
          return data;
        }),
      },
    },
    setup: {
      requireActive: vi.fn(async () => ({ kind: "missing" })),
      beginOrResume: vi.fn(async () => draft),
    },
    settings: { getCommitted: vi.fn(async () => ({ kind: "not-configured" })) },
  };
  return { deps, draft, actions, reply, ctx: { reply } as never };
}
describe("language navigation", () => {
  it("asks first in English without starting a schedule draft", async () => {
    const h = harness();
    await handleSetupCommand(h.ctx, h.deps, context);
    expect(h.reply.mock.calls[0]?.[0]).toBe("Choose this chat's language.");
    expect(h.deps.setup.beginOrResume).not.toHaveBeenCalled();
    expect(h.actions.map((a) => JSON.parse(a.targetId).locale)).toEqual([
      "en",
      "uk",
    ]);
  });
  it("resumes explicit Ukrainian setup and adds bilingual timezone navigation", async () => {
    const h = harness(true, "uk");
    h.deps.setup.requireActive.mockResolvedValue({
      kind: "active",
      draft: h.draft,
    });
    await handleSetupCommand(h.ctx, h.deps, context);
    expect(h.reply.mock.calls[0]?.[0]).toContain("Надішли геолокацію");
    expect(JSON.stringify(h.reply.mock.calls)).toContain("Мова / Language");
  });
  it("renders only language and Continue setup before configuration", async () => {
    const h = harness(true, "uk");
    await handleSettingsCommand(h.ctx, h.deps, context);
    expect(h.reply.mock.calls[0]?.[0]).toContain("Мова: Українська");
    expect(JSON.stringify(h.reply.mock.calls)).toContain(
      "Продовжити налаштування",
    );
    expect(JSON.stringify(h.reply.mock.calls)).not.toContain("Schedule");
  });
  it("continues through beginOrResume using the acting administrator and retained draft", async () => {
    const h = harness(true, "uk");
    h.draft.timezone = "Europe/Kyiv" as never;
    await continueSetup(h.ctx, h.deps, context);
    expect(h.deps.setup.beginOrResume).toHaveBeenCalledWith(
      1n,
      2n,
      h.deps.now(),
    );
    expect(h.draft.timezone).toBe("Europe/Kyiv");
    expect(h.reply.mock.calls[0]?.[0]).toContain("Крок 2");
  });
  it("accepts an old English prompt and reads Ukrainian after the durable transition", async () => {
    const h = harness(true, "en");
    Object.assign(h.draft, { timezone: "Europe/Kyiv", defaultWeekday: 1 });
    h.deps.setup.requireActive.mockResolvedValue({
      kind: "active",
      draft: h.draft,
    });
    h.deps.setup.setScheduleField = vi.fn(async (_draft, field, value) => {
      Object.assign(h.draft, { [field]: value });
      h.deps.prisma.chatLanguagePreference.findUnique.mockResolvedValue({
        locale: "uk",
        explicitlySelected: true,
      });
      return { kind: "updated", draft: h.draft };
    });
    await handleSetupText(h.ctx, h.deps, context, "19:30");
    expect(h.draft.defaultStartMinute).toBe(1170);
    expect(h.reply.mock.calls[0]?.[0]).toContain("Крок 4");
    expect(h.reply.mock.calls[0]?.[0]).toContain("Надішли тривалість");
  });
  it("gives conversational Ukrainian corrective feedback", async () => {
    const h = harness(true, "uk");
    Object.assign(h.draft, { timezone: "Europe/Kyiv", defaultWeekday: 1 });
    h.deps.setup.requireActive.mockResolvedValue({
      kind: "active",
      draft: h.draft,
    });
    await handleSetupText(h.ctx, h.deps, context, "nope");
    expect(h.reply.mock.calls[0]?.[0]).toContain(
      "Ой, не вдалося розібрати час. Спробуй так: 19:30.",
    );
  });
  it("localizes expiry without touching the language preference", async () => {
    const h = harness(true, "uk");
    h.deps.setup.requireActive.mockResolvedValue({ kind: "expired" });
    await handleSetupText(h.ctx, h.deps, context, "19:30");
    expect(h.reply.mock.calls[0]?.[0]).toContain("30 хвилин");
    expect(h.reply.mock.calls[0]?.[0]).toContain("/setup");
    expect(h.deps.setup.beginOrResume).not.toHaveBeenCalled();
  });
  it("localizes candidate text after the resolver finishes in a changed language", async () => {
    const h = harness(true, "en");
    h.deps.setup.requireActive.mockResolvedValue({
      kind: "active",
      draft: h.draft,
    });
    h.deps.timezoneResolver = {
      resolve: vi.fn(async () => {
        h.deps.prisma.chatLanguagePreference.findUnique.mockResolvedValue({
          locale: "uk",
          explicitlySelected: true,
        });
        return { kind: "resolved", candidate: "Europe/Kyiv" };
      }),
    };
    const editMessageText = vi.fn();
    await handleSetupLocation(
      { reply: h.reply, api: { editMessageText } } as never,
      h.deps,
      context,
      { latitude: 50, longitude: 30 },
    );
    expect(editMessageText.mock.calls[0]?.[2]).toContain(
      "Часовий пояс знайдено",
    );
    expect(JSON.stringify(editMessageText.mock.calls)).toContain(
      "Обрати Europe/Kyiv",
    );
    expect(JSON.stringify(editMessageText.mock.calls)).toContain(
      "Надішли іншу геолокацію",
    );
  });
  it("keeps stable policies and compatible English keyboard calls", () => {
    const uk = planningAccessKeyboard((value) => value, "uk").inline_keyboard;
    expect(
      uk
        .filter((row) => row.length > 0)
        .map((row) => row.map((button) => button.text)),
    ).toEqual([
      ["Лише адміністратори"],
      ["Учасники попереднього планування"],
      ["Усі в чаті"],
    ]);
    expect(
      planningAccessKeyboard((value) => value).inline_keyboard[0]?.[0]?.text,
    ).toBe("Admins only");
    expect(
      settingsReviewKeyboard("save", "keep", "uk").inline_keyboard[0]?.[0]
        ?.text,
    ).toBe("Зберегти зміну");
    expect(
      settingsDashboardKeyboard((value) => value, "uk").inline_keyboard[0]?.[0]
        ?.text,
    ).toBe("Змінити часовий пояс");
  });
  it.each([
    ["save", "saved", "Налаштування чату збережено"],
    ["cancel", "cancelled", "Налаштування скасовано"],
    ["save", "duplicate", "Уже застосовано"],
    ["save", "stale", "Ця дія вже недоступна"],
    ["save", "expired", "30 хвилин"],
    ["save", "failed", "Не вдалося зберегти"],
  ] as const)(
    "renders %s/%s with the post-transition locale",
    async (action, kind, expected) => {
      const h = harness(true, "en");
      Object.assign(h.draft, {
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: "ADMINS_ONLY",
      });
      h.deps.setup.requireActive.mockResolvedValue({
        kind: "active",
        draft: h.draft,
      });
      const transition = vi.fn(async () => {
        h.deps.prisma.chatLanguagePreference.findUnique.mockResolvedValue({
          locale: "uk",
          explicitlySelected: true,
        });
        return { kind, configuration: h.draft };
      });
      h.deps.setup.saveConfiguration = transition;
      h.deps.setup.cancelSetup = transition;
      const editMessageText = vi.fn();
      const answerCallbackQuery = vi.fn();
      await dispatchSetupCallback(
        { reply: h.reply, editMessageText, answerCallbackQuery } as never,
        h.deps,
        context,
        {
          targetId: createSetupTarget({ draftId: h.draft.id, action }),
          token: "opaque",
          consumedAt: null,
        } as never,
        h.deps.now(),
      );
      expect(
        JSON.stringify([
          h.reply.mock.calls,
          editMessageText.mock.calls,
          answerCallbackQuery.mock.calls,
        ]),
      ).toContain(expected);
      expect(transition).toHaveBeenCalledExactlyOnceWith(
        context.chatId,
        context.actorId,
        "opaque",
        h.deps.now(),
      );
      if (kind === "saved") {
        expect(editMessageText.mock.calls[0]?.[0]).toContain(
          "Мова: Українська",
        );
        expect(editMessageText.mock.calls[0]?.[0]).toContain("19:30");
      }
      expect(answerCallbackQuery.mock.calls.length).toBeLessThanOrEqual(1);
    },
  );
  it("renders resolver failure with Ukrainian recovery and no candidate actions", async () => {
    const h = harness(true, "uk");
    h.deps.setup.requireActive.mockResolvedValue({
      kind: "active",
      draft: h.draft,
    });
    h.deps.timezoneResolver = {
      resolve: vi.fn(async () => {
        throw new Error("offline");
      }),
    };
    const editMessageText = vi.fn();
    await handleSetupLocation(
      { reply: h.reply, api: { editMessageText } } as never,
      h.deps,
      context,
      { latitude: 50, longitude: 30 },
    );
    expect(editMessageText.mock.calls[0]?.[2]).toContain(
      "Надішли точнішу або іншу геолокацію",
    );
    expect(h.actions).toHaveLength(0);
  });
});
