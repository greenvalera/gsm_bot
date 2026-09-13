import { describe, expect, it } from "vitest";
import {
  renderPlanningReminder,
  renderFollowupReminder,
} from "../../src/telegram/reminder-renderers.js";

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

const members = [
  {
    telegramUserId: 3n,
    firstName: "C",
    lastName: null,
    username: null,
    marker: "pending" as const,
  },
  {
    telegramUserId: 2n,
    firstName: "B",
    lastName: null,
    username: null,
    marker: "available" as const,
  },
  {
    telegramUserId: 1n,
    firstName: "A",
    lastName: null,
    username: null,
    marker: "pending" as const,
  },
];
const followup = {
  selectedDate: "2026-09-18",
  startMinute: 1080,
  durationMinutes: 120,
  timezone: "Europe/Kyiv",
  participants: members,
  anchorMessageId: 77,
};
it("mentions exactly A/C in card display order with current public card navigation and no answers", () => {
  const rendered = renderFollowupReminder({
    ...followup,
    chat: { id: -100123n, type: "supergroup", username: "the_band" },
  });
  expect(rendered).toMatchObject({ kind: "ready" });
  if (rendered.kind !== "ready") return;
  expect(rendered.text).toContain('href="tg://user?id=1">A</a>');
  expect(rendered.text).toContain('href="tg://user?id=3">C</a>');
  expect(rendered.text).not.toContain("user?id=2");
  expect(rendered.text.indexOf("user?id=1")).toBeLessThan(
    rendered.text.indexOf("user?id=3"),
  );
  expect(rendered.text).toContain("2026-09-18");
  expect(rendered.text).toContain("18:00");
  expect(rendered.text).toContain("https://t.me/the_band/77");
  expect(rendered).not.toHaveProperty("reply_markup");
});
it("uses documented private supergroup conversion and native basic-group reply", () => {
  expect(
    renderFollowupReminder({
      ...followup,
      chat: { id: -100123n, type: "supergroup" },
    }),
  ).toMatchObject({ text: expect.stringContaining("https://t.me/c/123/77") });
  const basic = renderFollowupReminder({
    ...followup,
    chat: { id: -123n, type: "group" },
  });
  expect(basic).toMatchObject({
    kind: "ready",
    reply_parameters: { message_id: 77, allow_sending_without_reply: false },
    text: expect.stringContaining("/plan_status"),
  });
  if (basic.kind === "ready") expect(basic.text).not.toContain("t.me/c/");
});
it("empty pending produces no message and malformed navigation is unsendable", () => {
  expect(
    renderFollowupReminder({
      ...followup,
      participants: [],
      chat: { id: -123n, type: "group" },
    }),
  ).toEqual({ kind: "empty" });
  expect(
    renderFollowupReminder({
      ...followup,
      chat: { id: -123n, type: "supergroup" },
    }),
  ).toEqual({ kind: "unsendable" });
});
it("escapes labels, shortens large text retaining all mentions and refuses impossible capacity", () => {
  const malicious = renderFollowupReminder({
    ...followup,
    participants: [{ ...members[0]!, firstName: '<b>A & "x"</b>' }],
    chat: { id: -123n, type: "group" },
  });
  expect(malicious).toMatchObject({
    text: expect.stringContaining('&lt;b&gt;A &amp; "x"&lt;/b&gt;'),
  });
  const many = Array.from({ length: 60 }, (_, i) => ({
    ...members[0]!,
    telegramUserId: BigInt(i + 1),
    firstName: "&🪕".repeat(1000),
  }));
  const rendered = renderFollowupReminder({
    ...followup,
    participants: many,
    chat: { id: -123n, type: "group" },
  });
  expect(rendered.kind).toBe("ready");
  if (rendered.kind === "ready") {
    expect(rendered.text.length).toBeLessThanOrEqual(4096);
    expect(rendered.text.match(/tg:\/\/user\?id=/g)).toHaveLength(60);
  }
  expect(
    renderFollowupReminder({
      ...followup,
      participants: Array.from({ length: 5000 }, (_, i) => ({
        ...members[0]!,
        telegramUserId: BigInt(i + 1),
      })),
      chat: { id: -123n, type: "group" },
    }),
  ).toEqual({ kind: "unsendable" });
});
