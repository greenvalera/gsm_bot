import { recordOutboundEvidence } from "../helpers/outbound-evidence.js";
import { describe, expect, it, vi } from "vitest";
import { handleSetupCommand } from "../../src/telegram/setup-handlers.js";
import { renderMessage } from "../../src/shared/i18n/index.js";

describe.each(["en", "uk"] as const)("setup entry race in %s", (locale) => {
  it("renders a bound fresh setup entry when configuration disappears between reads", async () => {
    const reply = vi.fn();
    const create = vi.fn(async ({ data }) => data);
    const beginOrResume = vi.fn(async () => ({ id: "draft" }));
    const context = { chatId: 1n, actorId: 2n };
    const now = new Date("2026-09-21T12:00:00Z");
    await handleSetupCommand(
      { reply } as never,
      {
        now: () => now,
        prisma: {
          chatLanguagePreference: {
            findUnique: vi.fn(async () => ({
              locale,
              explicitlySelected: false,
            })),
          },
          chatConfiguration: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce({ chatId: 1n })
              .mockResolvedValueOnce(null),
          },
          callbackAction: { create },
        },
        setup: {
          requireActive: vi.fn(async () => ({ kind: "missing" })),
          beginOrResume,
        },
      } as never,
      context,
    );
    expect(beginOrResume).toHaveBeenCalledExactlyOnceWith(1n, 2n, now);
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].data).toMatchObject({
      chatId: 1n,
      actorUserId: 2n,
      targetId: "draft",
      kind: "START_SETUP",
    });
    expect(reply).toHaveBeenCalledExactlyOnceWith(
      renderMessage(locale, "setup.entry", undefined),
      expect.objectContaining({ parse_mode: "HTML" }),
    );
    expect(reply.mock.calls[0]![1].reply_markup.inline_keyboard[0][0]).toEqual({
      text: renderMessage(locale, "setup.start", undefined),
      callback_data: create.mock.calls[0]![0].data.token,
    });

    recordOutboundEvidence(
      [
        "src/telegram/setup-handlers.ts#handleSetupCommand:reply:3",
        "src/telegram/setup-handlers.ts#handleSetupCommand:keyboard.text:1",
      ],
      locale,
    );
  });
});
