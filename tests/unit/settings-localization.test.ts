import { recordOutboundEvidence } from "../helpers/outbound-evidence.js";
import { describe, expect, it, vi } from "vitest";
import { SettingsField } from "../../src/generated/prisma/client.js";
import { SettingsService } from "../../src/domain/chat/settings-service.js";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import { createSettingsTarget } from "../../src/shared/callback-schema.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import { renderPlanningAccessReview } from "../../src/telegram/renderers.js";
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
      reply: vi.fn(async (_text: string, _options?: object) => ({
        message_id: 1,
      })),
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

/** Minimal durable delegates: services own revisions, expiry and action validity. */
function durableHarness(locale: Locale) {
  const h = harness(locale);
  let edit: any = null;
  const actions = new Map<string, any>();
  const reminders = { generation: 7, dueAt: new Date("2026-09-17T09:00:00Z") };
  const prisma: any = {
    $executeRaw: vi.fn(),
    chatMigration: { findUnique: vi.fn(async () => null) },
    chatLanguagePreference: {
      findUnique: async () => ({ locale: h.locale, explicitlySelected: true }),
      upsert: vi.fn(async ({ update }: any) => {
        h.locale = update.locale;
        return update;
      }),
    },
    chatConfiguration: {
      findUnique: async () => h.configuration,
      updateMany: async ({ where, data }: any) => {
        if (where.revision !== h.configuration.revision) return { count: 0 };
        const { revision, ...values } = data;
        Object.assign(h.configuration, values, {
          revision: h.configuration.revision + revision.increment,
        });
        return { count: 1 };
      },
    },
    settingsEditDraft: {
      findUnique: async ({ where }: any) =>
        where.chatId_actorUserId?.actorUserId === context.actorId ? edit : null,
      upsert: async ({ create }: any) =>
        (edit = { id: "durable-draft", replacementPayload: null, ...create }),
      update: async ({ data }: any) => (edit = { ...edit, ...data }),
      delete: async () => {
        edit = null;
      },
    },
    callbackAction: {
      create: async ({ data }: any) => {
        const row = { consumedAt: null, ...data };
        actions.set(row.token, row);
        return row;
      },
      findUnique: async ({ where }: any) => actions.get(where.token) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = actions.get(where.token);
        if (
          !row ||
          row.consumedAt !== null ||
          (where.expiresAt && row.expiresAt <= where.expiresAt.gt)
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  h.deps.prisma = prisma;
  h.deps.settings = new SettingsService(prisma);
  return {
    ...h,
    language: new LanguageService(prisma),
    actions,
    reminders,
    edit: () => edit,
  };
}

describe("settings edits across language changes", () => {
  it("does not write preference or edit state for the already explicit locale", async () => {
    const h = durableHarness("uk");
    await h.deps.settings.beginEdit(1n, 2n, "DEFAULT_START_MINUTE", now);
    const before = structuredClone(h.edit());
    expect(await h.language.select(1n, "uk", now)).toMatchObject({
      kind: "unchanged",
    });
    expect(h.deps.prisma.chatLanguagePreference.upsert).not.toHaveBeenCalled();
    expect(h.edit()).toEqual(before);
  });
  it("escapes timezone candidates once in HTML while preserving button text", async () => {
    const h = harness("uk");
    h.deps.timezoneResolver.resolve.mockResolvedValue({
      kind: "resolved",
      candidate: "<Kyiv&😀>",
    });
    await handleSettingsLocation(
      h.ctx as never,
      h.deps,
      context,
      draft("TIMEZONE"),
      { latitude: 50, longitude: 30 },
      now,
    );
    expect(h.ctx.api.editMessageText.mock.calls[0]?.[2]).toContain(
      "&lt;Kyiv&amp;😀&gt;",
    );
    expect(
      JSON.stringify(h.ctx.api.editMessageText.mock.calls[0]?.[3]),
    ).toContain("Обрати <Kyiv&😀>");
  });
  it.each([
    ["en", "uk"],
    ["uk", "en"],
  ] as const)(
    "keeps an original %s confirmation valid after switching to %s",
    async (before, after) => {
      const h = durableHarness(before);
      const d = await h.deps.settings.beginEdit(
        context.chatId,
        context.actorId,
        "DEFAULT_START_MINUTE",
        now,
      );
      await handleSettingsText(
        h.ctx as never,
        h.deps,
        context,
        d,
        "19:30",
        now,
      );
      expect(h.ctx.reply.mock.calls[0]?.[0]).toContain(
        renderMessage(before, "settings.review", undefined),
      );
      const save = [...h.actions.values()].find(
        (a) => JSON.parse(a.targetId).action === "save",
      );
      const state = structuredClone({
        draft: h.edit(),
        configuration: h.configuration,
        reminders: h.reminders,
      });
      await h.language.select(context.chatId, after, now);
      expect({
        draft: h.edit(),
        configuration: h.configuration,
        reminders: h.reminders,
      }).toEqual(state);
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        context,
        save,
        now,
      );
      expect(h.configuration.defaultStartMinute).toBe(1170);
      expect(h.configuration.revision).toBe(2);
      expect(h.edit()).toBeNull();
      expect(h.ctx.editMessageText.mock.calls[0]?.[0]).toContain(
        renderMessage(after, "settings.title", undefined),
      );
    },
  );
  it.each(["save", "keep"] as const)(
    "answers an old prompt and %s in the newly selected language",
    async (operation) => {
      const h = durableHarness("en");
      const d = await h.deps.settings.beginEdit(
        1n,
        2n,
        "DEFAULT_START_MINUTE",
        now,
      );
      await h.language.select(1n, "uk", now);
      await handleSettingsText(
        h.ctx as never,
        h.deps,
        context,
        d,
        "19:30",
        now,
      );
      expect(h.ctx.reply.mock.calls[0]?.[0]).toContain(
        renderMessage("uk", "settings.review", undefined),
      );
      const a = [...h.actions.values()].find(
        (a) => JSON.parse(a.targetId).action === operation,
      );
      await dispatchSettingsCallback(h.ctx as never, h.deps, context, a, now);
      expect(h.configuration.defaultStartMinute).toBe(
        operation === "save" ? 1170 : 1140,
      );
      expect(h.ctx.editMessageText.mock.calls[0]?.[0]).toContain(
        "Налаштування чату",
      );
    },
  );
  it.each(["conflict", "expired", "other-actor"] as const)(
    "still rejects a %s confirmation after a language change",
    async (invalidity) => {
      const h = durableHarness("en");
      const d = await h.deps.settings.beginEdit(
        1n,
        2n,
        "DEFAULT_START_MINUTE",
        now,
      );
      await handleSettingsText(
        h.ctx as never,
        h.deps,
        context,
        d,
        "19:30",
        now,
      );
      const save = [...h.actions.values()].find(
        (a) => JSON.parse(a.targetId).action === "save",
      );
      await h.language.select(1n, "uk", now);
      if (invalidity === "conflict") h.configuration.revision++;
      if (invalidity === "expired") h.edit().expiresAt = now;
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        invalidity === "other-actor" ? { ...context, actorId: 3n } : context,
        save,
        now,
      );
      expect(h.configuration.defaultStartMinute).toBe(1140);
      expect(h.ctx.editMessageText).not.toHaveBeenCalled();
      const output = JSON.stringify([
        ...h.ctx.reply.mock.calls.slice(1),
        ...h.ctx.answerCallbackQuery.mock.calls,
      ]);
      expect(output).toContain(
        renderMessage(
          "uk",
          invalidity === "conflict" ? "common.saveFailure" : "common.stale",
          undefined,
        ),
      );
    },
  );
  it("resolves locale after the timezone lookup and each action creation", async () => {
    const h = harness("en");
    h.deps.settings.createAction.mockImplementation(async () => {
      h.locale = "uk";
      return "candidate";
    });
    await handleSettingsLocation(
      h.ctx as never,
      h.deps,
      context,
      draft("TIMEZONE"),
      { latitude: 50, longitude: 30 },
      now,
    );
    const output = JSON.stringify(h.ctx.api.editMessageText.mock.calls);
    expect(output).toContain("Часовий пояс знайдено");
    expect(output).toContain("Обрати Europe/Kyiv");
  });
  it("resolves locale after selecting a weekday and creating review actions", async () => {
    const h = harness("en");
    h.deps.settings.createSaveAction.mockImplementation(async () => {
      h.locale = "uk";
      return "save";
    });
    h.deps.settings.selectValue.mockResolvedValue({
      draftId: "draft",
      field: "DEFAULT_WEEKDAY",
      current: 1,
      replacement: 2,
    });
    await dispatchSettingsCallback(
      h.ctx as never,
      h.deps,
      context,
      action({ action: "select", draftId: "draft", value: 2 }),
      now,
    );
    expect(JSON.stringify(h.ctx.editMessageText.mock.calls)).toContain(
      "Зберегти зміну",
    );
  });
});

describe.each(["en", "uk"] as const)("settings controller in %s", (locale) => {
  it("renders a typed settings review with bound save and keep controls", async () => {
    const h = harness(locale);
    await handleSettingsText(
      h.ctx as never,
      h.deps,
      context,
      draft("DEFAULT_START_MINUTE"),
      "19:30",
      now,
    );
    expect(h.deps.settings.selectValue).toHaveBeenCalledWith(
      1n,
      2n,
      "draft",
      1170,
      now,
    );
    expect(h.ctx.reply.mock.calls[0]?.[0]).toBe(
      [
        renderMessage(locale, "settings.review", undefined),
        renderMessage(locale, "settings.current", {
          value: "<code>19:00</code>",
        }),
        renderMessage(locale, "settings.new", { value: "<code>19:30</code>" }),
      ].join("\n"),
    );
    expect(h.ctx.reply.mock.calls[0]?.[1]).toMatchObject({
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: renderMessage(locale, "button.saveChange", undefined),
              callback_data: "save",
            },
          ],
          [
            {
              text: renderMessage(locale, "button.keepValue", undefined),
              callback_data: "action",
            },
          ],
        ],
      },
    });
    expect(h.deps.settings.saveChange).not.toHaveBeenCalled();

    recordOutboundEvidence(
      ["src/telegram/settings-handlers.ts#handleSettingsText:reply:3"],
      locale,
    );
  });
  it("renders the planning access review compatibility wrapper", () => {
    expect(
      renderPlanningAccessReview("ADMINS_ONLY", "ANYONE_IN_CHAT", locale).text,
    ).toBe(
      [
        renderMessage(locale, "settings.review", undefined),
        renderMessage(locale, "settings.current", {
          value: renderMessage(locale, "policy.ADMINS_ONLY", undefined),
        }),
        renderMessage(locale, "settings.new", {
          value: renderMessage(locale, "policy.ANYONE_IN_CHAT", undefined),
        }),
      ].join("\n"),
    );

    recordOutboundEvidence(
      ["src/telegram/renderers.ts#module:factory.renderPlanningAccessReview:1"],
      locale,
    );
  });
  it.each([
    "consumed",
    "invalid-target",
    "begin-duplicate",
    "select-duplicate",
    "select-stale",
  ] as const)(
    "localizes callback guard %s without saving settings",
    async (branch) => {
      const h = harness(locale);
      const a = action(
        branch.startsWith("begin")
          ? { action: "begin", field: "DEFAULT_WEEKDAY" }
          : { action: "select", draftId: "draft", value: 2 },
      );
      if (branch === "consumed") a.consumedAt = now;
      if (branch === "invalid-target") a.targetId = "invalid";
      if (branch.endsWith("duplicate"))
        h.deps.settings.consumeSelectionAction.mockResolvedValue(false);
      if (branch === "select-stale")
        h.deps.settings.selectValue.mockResolvedValue(undefined);
      await dispatchSettingsCallback(h.ctx as never, h.deps, context, a, now);
      expect(h.ctx.answerCallbackQuery).toHaveBeenCalledWith({
        text: renderMessage(
          locale,
          branch === "invalid-target" || branch === "select-stale"
            ? "common.stale"
            : "common.applied",
          undefined,
        ),
        show_alert: true,
      });
      expect(h.deps.settings.beginEdit).not.toHaveBeenCalled();
      expect(h.deps.settings.saveChange).not.toHaveBeenCalled();
      expect(h.deps.settings.keepCurrent).not.toHaveBeenCalled();
      expect(h.deps.settings.createSaveAction).not.toHaveBeenCalled();
      if (branch !== "select-stale")
        expect(h.deps.settings.selectValue).not.toHaveBeenCalled();
      expect(h.ctx.editMessageText).not.toHaveBeenCalled();

      recordOutboundEvidence(
        [
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:1",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:1",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:2",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:2",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:3",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:3",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:4",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:4",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:5",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:5",
        ],
        locale,
      );
    },
  );
  it.each(["begin", "dashboard"] as const)(
    "localizes %s action creation failure",
    async (branch) => {
      const h = harness(locale);
      h.deps.settings.createAction.mockRejectedValue(
        new Error("storage unavailable"),
      );
      if (branch === "begin") {
        await dispatchSettingsCallback(
          h.ctx as never,
          h.deps,
          context,
          action({ action: "begin", field: "DEFAULT_WEEKDAY" }),
          now,
        );
      } else {
        await handleSettingsCommand(h.ctx, h.deps, context);
      }
      expect(h.ctx.reply).toHaveBeenCalledWith(
        renderMessage(locale, "common.saveFailure", undefined),
      );
      expect(h.ctx.editMessageText).not.toHaveBeenCalled();
      expect(h.deps.settings.saveChange).not.toHaveBeenCalled();
      expect(h.deps.settings.keepCurrent).not.toHaveBeenCalled();

      recordOutboundEvidence(
        [
          "src/telegram/settings-handlers.ts#handleSettingsCommand:reply:4",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:reply:1",
        ],
        locale,
      );
    },
  );
  it("localizes the unconfigured dashboard language entry", async () => {
    const h = harness(locale);
    h.deps.settings.getCommitted.mockResolvedValue({ kind: "not-configured" });
    await handleSettingsCommand(h.ctx, h.deps, context);
    expect(h.ctx.reply.mock.calls[0]?.[0]).toBe(
      renderMessage(locale, "language.row", undefined),
    );
    expect(JSON.stringify(h.ctx.reply.mock.calls[0]?.[1])).toContain(
      renderMessage(locale, "setup.continue", undefined),
    );
    expect(h.deps.settings.beginEdit).not.toHaveBeenCalled();

    recordOutboundEvidence(
      [
        "src/telegram/settings-handlers.ts#handleSettingsCommand:reply:2",
        "src/telegram/settings-handlers.ts#handleSettingsCommand:keyboard.text:1",
        "src/telegram/settings-handlers.ts#handleSettingsCommand:keyboard.text:2",
      ],
      locale,
    );
  });
  it.each(
    (["save", "keep"] as const).flatMap((operation) =>
      (["failed", "not-configured"] as const).map(
        (kind) => [operation, kind] as const,
      ),
    ),
  )("localizes %s post-save projection %s", async (operation, kind) => {
    const h = harness(locale);
    h.deps.settings.getCommitted.mockResolvedValue({ kind });
    await dispatchSettingsCallback(
      h.ctx as never,
      h.deps,
      context,
      action({ action: operation, draftId: "draft" }),
      now,
    );
    expect(h.ctx.reply).toHaveBeenCalledWith(
      renderMessage(
        locale,
        kind === "failed" ? "settings.failure" : "settings.notConfigured",
        undefined,
      ),
    );
    expect(h.ctx.editMessageText).not.toHaveBeenCalled();

    recordOutboundEvidence(
      [
        "src/telegram/renderers.ts#renderSettingsProjection:text:2",
        "src/telegram/renderers.ts#renderSettingsProjection:text:3",
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:reply:3",
      ],
      locale,
    );
  });
  it.each(["resolved", "ambiguous"] as const)(
    "localizes %s timezone candidates and bound controls",
    async (kind) => {
      const h = harness(locale);
      const candidates =
        kind === "resolved"
          ? ["Europe/Kyiv"]
          : ["Europe/Kyiv", "Europe/Warsaw"];
      h.deps.timezoneResolver.resolve.mockResolvedValue(
        kind === "resolved"
          ? { kind, candidate: candidates[0] }
          : { kind, candidates },
      );
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
      const edit = h.ctx.api.editMessageText.mock.calls[0];
      expect(edit?.[2]).toBe(
        renderMessage(locale, "timezone.candidates", {
          candidates: candidates
            .map((candidate) => `<code>${candidate}</code>`)
            .join("\n"),
        }),
      );
      for (const candidate of candidates) {
        expect(JSON.stringify(edit?.[3])).toContain(
          renderMessage(locale, "timezone.use", { timezone: candidate }),
        );
        expect(h.deps.settings.createAction).toHaveBeenCalledWith(
          1n,
          2n,
          { draftId: "draft", action: "timezone-candidate", value: candidate },
          now,
        );
      }
      expect(h.deps.settings.selectValue).not.toHaveBeenCalled();
      expect(h.deps.settings.saveChange).not.toHaveBeenCalled();

      recordOutboundEvidence(
        [
          "src/telegram/settings-handlers.ts#inFlight:reply:1",
          "src/telegram/settings-handlers.ts#handleSettingsLocation:keyboard.text:1",
          "src/telegram/settings-handlers.ts#handleSettingsLocation:editMessageText:2",
        ],
        locale,
      );
    },
  );
  it.each(Object.values(SettingsField))(
    "localizes the %s review and controls",
    async (field) => {
      const h = harness(locale);
      const values = {
        TIMEZONE: "Europe/Kyiv",
        DEFAULT_WEEKDAY: 1,
        DEFAULT_START_MINUTE: 1140,
        DURATION_MINUTES: 120,
        DAILY_START_MINUTE: 600,
        DAILY_END_MINUTE: 1320,
        REMINDER_MINUTES: [600, 960],
        PLANNING_ACCESS_POLICY: "ADMINS_ONLY",
      };
      h.deps.settings.selectValue.mockResolvedValue({
        draftId: "draft",
        field,
        current: values[field],
        replacement: values[field],
      });
      await dispatchSettingsCallback(
        h.ctx as never,
        h.deps,
        context,
        action({ action: "select", draftId: "draft", value: values[field] }),
        now,
      );
      const output = JSON.stringify(h.ctx.editMessageText.mock.calls);
      expect(output).toContain(
        renderMessage(locale, "settings.review", undefined),
      );
      expect(output).toContain(
        renderMessage(locale, "button.saveChange", undefined),
      );
      expect(output).toContain(
        renderMessage(locale, "button.keepValue", undefined),
      );

      recordOutboundEvidence(
        [
          "src/telegram/renderers.ts#module:factory.renderSettingsReview:1",
          "src/telegram/renderers.ts#renderSettingsReview:text:1",
          "src/telegram/settings-handlers.ts#showReview:editMessageText:1",
        ],
        locale,
      );
    },
  );
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

      recordOutboundEvidence(
        [
          "src/telegram/renderers.ts#module:factory.renderPlanningAccessSelection:1",
          "src/telegram/renderers.ts#renderPlanningAccessSelection:text:1",
          "src/telegram/renderers.ts#module:factory.renderSettingsEditPrompt:1",
          "src/telegram/renderers.ts#renderSettingsEditPrompt:text:1",
          "src/telegram/renderers.ts#renderSettingsEditPrompt:text:2",
          "src/telegram/settings-handlers.ts#module:factory.weekdayKeyboard:1",
          "src/telegram/settings-handlers.ts#weekdayKeyboard:keyboard.text:1",
          "src/telegram/settings-handlers.ts#showPrompt:editMessageText:1",
          "src/telegram/settings-handlers.ts#showPrompt:editMessageText:2",
        ],
        locale,
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

      recordOutboundEvidence(
        [
          "src/telegram/settings-handlers.ts#createDashboard:text:1",
          "src/telegram/settings-handlers.ts#createDashboard:keyboard.text:1",
          "src/telegram/settings-handlers.ts#dispatchSettingsCallback:editMessageText:1",
        ],
        locale,
      );
    },
  );
  it.each(
    (["save", "keep"] as const).flatMap((operation) =>
      ["duplicate", "stale", "expired", "conflict", "failed"].map(
        (kind) => [operation, kind] as const,
      ),
    ),
  )("localizes %s %s feedback", async (operation, kind) => {
    const h = harness(locale);
    h.deps.settings[
      operation === "save" ? "saveChange" : "keepCurrent"
    ].mockResolvedValue({ kind });
    await dispatchSettingsCallback(
      h.ctx as never,
      h.deps,
      context,
      action({ action: operation, draftId: "draft" }),
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

    recordOutboundEvidence(
      [
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:6",
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:6",
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:answerCallbackQuery:7",
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:text:7",
        "src/telegram/settings-handlers.ts#dispatchSettingsCallback:reply:2",
      ],
      locale,
    );
  });
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

    recordOutboundEvidence(
      ["src/telegram/settings-handlers.ts#handleSettingsText:reply:1"],
      locale,
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

    recordOutboundEvidence(
      [
        "src/telegram/settings-handlers.ts#handleExpiredSettingsDraft:reply:1",
        "src/telegram/settings-handlers.ts#handleSettingsText:reply:2",
      ],
      locale,
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

    recordOutboundEvidence(
      [
        "src/telegram/settings-handlers.ts#handleSettingsCommand:reply:1",
        "src/telegram/settings-handlers.ts#handleSettingsCommand:reply:3",
      ],
      locale,
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

    recordOutboundEvidence(
      [
        "src/telegram/settings-handlers.ts#handleSettingsLocation:editMessageText:1",
      ],
      locale,
    );
  });
});
