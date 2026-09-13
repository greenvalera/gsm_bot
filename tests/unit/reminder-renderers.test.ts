import { describe, expect, it } from "vitest";
import { renderPlanningReminder } from "../../src/telegram/reminder-renderers.js";

describe("planning reminder", () => {
  it("names the whole target week and offers one opaque Start button without mentions", () => {
    const token = "v1:12345678-1234-1234-1234-123456789012";
    const rendered = renderPlanningReminder("2026-09-14", token);
    expect(rendered.text).toContain("2026-09-14");
    expect(rendered.text).toContain("2026-09-20");
    expect(rendered.text).not.toMatch(/tg:|@/);
    expect(rendered.reply_markup.inline_keyboard).toEqual([
      [{ text: "Start planning", callback_data: token }],
    ]);
    expect(Buffer.byteLength(token)).toBeLessThanOrEqual(64);
  });
});
