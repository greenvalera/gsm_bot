import { describe, expect, it, vi } from "vitest";
import { SettingsField } from "../../src/generated/prisma/client.js";
import { createSettingsTarget } from "../../src/shared/callback-schema.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import {
  dispatchSettingsCallback,
  handleSettingsCommand,
  handleSettingsText,
  handleSettingsLocation,
  handleExpiredSettingsDraft,
} from "../../src/telegram/settings-handlers.js";

const context = { chatId: 1n, actorId: 2n };
const now = new Date("2026-09-16T12:00:00Z");
function harness(locale: Locale = "uk") {
  const configuration = {
    chatId: 1n,
    timezone: "Europe/Kyiv",
    defaultWeekday: 1,
    defaultStartMinute: 1140,
    durationMinutes: 120,
    dailyStartMinute: 600,
    dailyEndMinute: 1320,
    reminderMinutes: [600, 960],
    planningAccessPolicy: "ADMINS_ONLY",
    revision: 1,
  };
  const h = {
    locale,
    configuration,
    ctx: {
      reply: vi.fn(async () => ({ message_id: 1 })),
      editMessageText: vi.fn(),
      answerCallbackQuery: vi.fn(),
      api: { editMessageText: vi.fn() },
    },
    deps: {} as any,
  };
  h.deps = {
    now: () => now,
    logger: { debug: vi.fn(), error: vi.fn() },
    prisma: {
      chatLanguagePreference: {
        findUnique: vi.fn(async () => ({
          locale: h.locale,
          explicitlySelected: true,
        })),
      },
      callbackAction: { create: vi.fn(async ({ data }: any) => data) },
    },
    settings: {
      getCommitted: vi.fn(async () => ({ kind: "committed", configuration })),
      createAction: vi.fn(async () => "action"),
      createSaveAction: vi.fn(async () => "save"),
      consumeSelectionAction: vi.fn(async () => true),
      beginEdit: vi.fn(async (_chat, _actor, field) => ({
        id: "draft",
        field,
      })),
      selectValue: vi.fn(async () => ({
        draftId: "draft",
        field: "DEFAULT_START_MINUTE",
        current: 1140,
        replacement: 1170,
      })),
      saveChange: vi.fn(async () => ({ kind: "saved" })),
      keepCurrent: vi.fn(async () => ({ kind: "saved" })),
      discardExpiredDraft: vi.fn(),
    },
    timezoneResolver: {
      resolve: vi.fn(async () => ({
        kind: "resolved",
        candidate: "Europe/Kyiv",
      })),
    },
  };
  return h;
}
function action(target: Parameters<typeof createSettingsTarget>[0]) {
  return {
    token: "token",
    consumedAt: null,
    targetId: createSettingsTarget(target),
  } as any;
}
const draft = (field: SettingsField) => ({
  id: "draft",
  field,
  expiresAt: new Date(now.getTime() + 60000),
});

describe.each(["en", "uk"] as const)("settings controller in %s", (locale) => {
  it.each(Object.values(SettingsField))(
    "localizes the %s prompt and controls",
    async (field) => {
      const h = harness(locale);
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        context,
        action({ action: "begin", field }),
        now,
      );
      const output = JSON.stringify(h.ctx.editMessageText.mock.calls);
      expect(output).toContain(
        renderMessage(locale, `field.${field}`, undefined),
      );
      if (field === "DEFAULT_WEEKDAY")
        expect(output).toContain(
          renderMessage(locale, "weekday.MON", undefined),
        );
      if (field === "PLANNING_ACCESS_POLICY")
        expect(output).toContain(
          renderMessage(locale, "policy.ADMINS_ONLY", undefined),
        );
    },
  );
  it.each(["save", "keep"] as const)(
    "retains localized dashboard and language controls after %s",
    async (operation) => {
      const h = harness(locale);
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        context,
        action({ action: operation, draftId: "draft" }),
        now,
      );
      const output = JSON.stringify(h.ctx.editMessageText.mock.calls);
      expect(output).toContain(
        renderMessage(locale, "settings.title", undefined),
      );
      expect(output).toContain(
        renderMessage(locale, "language.row", undefined),
      );
      expect(output).toContain("Мова / Language");
    },
  );
  it.each(["duplicate", "stale", "expired", "conflict", "failed"])(
    "localizes %s feedback",
    async (kind) => {
      const h = harness(locale);
      h.deps.settings.saveChange.mockResolvedValue({ kind });
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        context,
        action({ action: "save", draftId: "draft" }),
        now,
      );
      const key =
        kind === "duplicate"
          ? "common.applied"
          : kind === "stale" || kind === "expired"
            ? "common.stale"
            : "common.saveFailure";
      expect(
        JSON.stringify([
          ...h.ctx.reply.mock.calls,
          ...h.ctx.answerCallbackQuery.mock.calls,
        ]),
      ).toContain(renderMessage(locale, key, undefined));
    },
  );
  it.each([
    ["DEFAULT_START_MINUTE", "input.time"],
    ["DURATION_MINUTES", "input.duration"],
    ["REMINDER_MINUTES", "input.reminders"],
  ] as const)("gives corrective input for %s", async (field, key) => {
    const h = harness(locale);
    await handleSettingsText(
      h.ctx as never,
      h.deps,
      context,
      draft(field),
      "bad",
      now,
    );
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(locale, key, undefined),
    );
  });
  it("localizes invalid schedules and expiry", async () => {
    const h = harness(locale);
    h.deps.settings.selectValue.mockResolvedValue(undefined);
    await handleSettingsText(
      h.ctx as never,
      h.deps,
      context,
      draft("DEFAULT_START_MINUTE"),
      "19:30",
      now,
    );
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(locale, "input.schedule", undefined),
    );
    await handleExpiredSettingsDraft(
      h.ctx,
      h.deps,
      context,
      "update:message:text",
      draft("DEFAULT_START_MINUTE"),
      now,
    );
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(locale, "settings.expired", undefined),
    );
  });
  it("localizes configured and failed dashboard reads", async () => {
    const h = harness(locale);
    await handleSettingsCommand(h.ctx, h.deps, context);
    expect(JSON.stringify(h.ctx.reply.mock.calls)).toContain(
      renderMessage(locale, "settings.title", undefined),
    );
    h.deps.settings.getCommitted.mockResolvedValue({ kind: "failed" });
    await handleSettingsCommand(h.ctx, h.deps, context);
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(locale, "settings.failure", undefined),
    );
  });
  it("localizes timezone failure", async () => {
    const h = harness(locale);
    h.deps.timezoneResolver.resolve.mockRejectedValue(new Error("offline"));
    await handleSettingsLocation(
      h.ctx as never,
      h.deps,
      context,
      draft("TIMEZONE"),
      { latitude: 50, longitude: 30 },
      now,
    );
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(locale, "timezone.loading", undefined),
    );
    expect(h.ctx.api.editMessageText).toHaveBeenCalledWith(
      "1",
      1,
      renderMessage(locale, "timezone.failure", undefined),
    );
  });
});
