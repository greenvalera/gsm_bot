import { describe, expect, it, vi } from "vitest";
import {
  handleSetupCommand,
  continueSetup,
} from "../../src/telegram/setup-handlers.js";
import { handleSettingsCommand } from "../../src/telegram/settings-handlers.js";

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
    now: () => new Date("2026-09-16T12:00:00Z"),
    prisma: {
      chatLanguagePreference: {
        findUnique: vi.fn(async () => ({ locale, explicitlySelected })),
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
    expect(h.reply.mock.calls[0]?.[0]).toContain("Step 2");
  });
});
