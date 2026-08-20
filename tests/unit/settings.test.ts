import { describe, expect, it } from "vitest";

import { SettingsService } from "../../src/domain/chat/settings-service.js";
import { renderSettingsProjection } from "../../src/telegram/renderers.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");
const CHAT_ID = 100n;
const ACTOR_ID = 200n;

function createStore() {
  const configuration = {
    chatId: CHAT_ID,
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
  const drafts = new Map<string, Record<string, unknown>>();
  return {
    configuration,
    prisma: {
      chatConfiguration: {
        async findUnique() {
          return configuration;
        },
      },
      settingsEditDraft: {
        async upsert({ create }: any) {
          const draft = { id: "draft-1", ...create };
          drafts.set(draft.id, draft);
          return draft;
        },
        async findUnique() {
          return drafts.get("draft-1") ?? null;
        },
        async update({ data }: any) {
          const draft = { ...drafts.get("draft-1"), ...data };
          drafts.set("draft-1", draft);
          return draft;
        },
      },
    },
  };
}

describe("settings edits", () => {
  it("never renders a partial or failed read as authoritative settings", () => {
    expect(renderSettingsProjection({ kind: "failed" })).toEqual({
      kind: "failure",
      text: "I couldn't load chat settings. Please try again.",
    });
    expect(renderSettingsProjection({ kind: "not-configured" })).toEqual({
      kind: "not-configured",
      text: "This chat is not configured yet. Send /setup to start.",
    });
  });

  it("reviews a timezone edit without changing the committed configuration", async () => {
    const store = createStore();
    const settings = new SettingsService(store.prisma as never);

    const draft = await settings.beginEdit(CHAT_ID, ACTOR_ID, "TIMEZONE", NOW);
    const review = await settings.selectValue(
      CHAT_ID,
      ACTOR_ID,
      draft.id,
      "Europe/Warsaw",
      NOW,
    );

    expect(review).toMatchObject({
      field: "TIMEZONE",
      current: "Europe/Kyiv",
      replacement: "Europe/Warsaw",
    });
    expect(store.configuration.timezone).toBe("Europe/Kyiv");
  });

  it("rejects an edit that would make the reconstructed schedule invalid", async () => {
    const store = createStore();
    const settings = new SettingsService(store.prisma as never);
    const draft = await settings.beginEdit(
      CHAT_ID,
      ACTOR_ID,
      "DAILY_END_MINUTE",
      NOW,
    );

    await expect(
      settings.selectValue(CHAT_ID, ACTOR_ID, draft.id, 1200, NOW),
    ).resolves.toBeUndefined();
    expect(store.configuration.dailyEndMinute).toBe(1320);
  });
});
