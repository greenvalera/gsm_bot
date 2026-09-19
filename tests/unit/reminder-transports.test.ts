import { expect, it, vi } from "vitest";
import { GrammyError } from "grammy";
import { createFollowupReminderTransport } from "../../src/app/main.js";

it("forwards HTML follow-up sends without inventing basic-group reply parameters", async () => {
  const sendMessage = vi.fn(async () => ({ message_id: 345 }));
  const transport = createFollowupReminderTransport({ sendMessage });
  const text = '<a href="tg://user?id=7">Оля &amp; Ben</a>';
  expect(
    await transport({ kind: "ready", chatId: -1001234567890n, text }),
  ).toEqual({ messageId: 345 });
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith(-1001234567890, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
});

it("preserves Telegram rejection identity for durable delivery classification", async () => {
  const failure = new GrammyError(
    "rejected",
    {
      ok: false,
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 60 },
    },
    "sendMessage",
    {},
  );
  const sendMessage = vi.fn(async () => {
    throw failure;
  });
  const transport = createFollowupReminderTransport({ sendMessage });
  await expect(
    transport({ kind: "ready", chatId: -1001234567890n, text: "follow-up" }),
  ).rejects.toBe(failure);
  expect(sendMessage).toHaveBeenCalledOnce();
});
