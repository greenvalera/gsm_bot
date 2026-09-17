import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import type { CurrentTelegramRole } from "../../src/domain/auth/authorization-service.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import type { Locale } from "../../src/shared/i18n/index.js";
import { createChatConfiguration } from "../fakes/chat-readiness.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-08-26T09:00:00Z");
const author = 87401;
const member = 87402;
const admin = 87403;
let nextChat = -74000n;
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterAll(async () => {
  await prisma?.$disconnect();
  await database?.stop();
}, 60000);

type Call = { method: string; payload: any };
function session(chatId: bigint) {
  const calls: Call[] = [];
  const history: Call[] = [];
  let sequence = 0;
  let messageId = 500;
  let missing = false;
  const roles = new Map<number, CurrentTelegramRole>([
    [admin, "administrator"],
  ]);
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
  };
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as never,
    prisma,
    now: () => now,
    membershipGateway: {
      getCurrentRole: async (_chat, actor) =>
        roles.get(Number(actor)) ?? "member",
    },
  });
  bot.api.config.use(async (_previous, method, payload) => {
    const call = { method, payload };
    calls.push(call);
    history.push(call);
    if (missing && method === "editMessageText") {
      missing = false;
      return {
        ok: false,
        error_code: 400,
        description: "Bad Request: message to edit not found",
      } as never;
    }
    return {
      ok: true,
      result:
        method === "answerCallbackQuery"
          ? true
          : {
              message_id: method === "sendMessage" ? ++messageId : messageId,
              date: 1,
              chat,
              text: (payload as any).text,
            },
    } as never;
  });
  const from = (id: number) => ({
    id,
    is_bot: false,
    first_name: "Оля <&>",
    language_code: "de",
  });
  return {
    calls,
    history,
    roles,
    missingNextEdit() {
      missing = true;
    },
    token(label: string) {
      for (const call of [...history].reverse()) {
        const button = call.payload.reply_markup?.inline_keyboard
          .flat()
          .find((b: any) => b.text.endsWith(label));
        if (button) return button.callback_data as string;
      }
      throw new Error(`Missing visible label ${label}`);
    },
    text() {
      return calls
        .filter((c) => c.method !== "answerCallbackQuery")
        .map((c) => c.payload.text ?? "")
        .join("\n");
    },
    async message(text: string, actor = author) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          from: from(actor),
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
        },
      });
    },
    async click(data: string, actor = author, reset = true) {
      if (reset) calls.length = 0;
      const id = String(++sequence);
      await bot.handleUpdate({
        update_id: sequence,
        callback_query: {
          id,
          chat_instance: "lifecycle",
          from: from(actor),
          data,
          message: { message_id: messageId, date: 1, chat },
        },
      });
      expect(
        calls.filter(
          (c) =>
            c.method === "answerCallbackQuery" &&
            c.payload.callback_query_id === id,
        ),
      ).toHaveLength(1);
    },
  };
}
const labels = (locale: Locale) =>
  locale === "uk"
    ? {
        day: "Чт 27",
        confirm: "Підтвердити репетицію",
        yes: "👍 Можу",
        no: "👎 Не можу",
        book: "Студію заброньовано",
        apply: "Так, заброньовано",
        back: "Назад",
        replan: "↻ Перепланувати",
        cancel: "✕ Скасувати репетицію",
        cancelApply: "Так, скасувати",
        cancelKeep: "Залишити репетицію",
        changeApply: "Так, обрати інший час",
        changeKeep: "Залишити цей час",
      }
    : {
        day: "Thu 27",
        confirm: "Confirm rehearsal",
        yes: "👍 Can attend",
        no: "👎 Cannot attend",
        book: "Mark as booked",
        apply: "Yes, it's booked",
        back: "Not yet",
        replan: "↻ Replan",
        cancel: "✕ Cancel rehearsal",
        cancelApply: "Yes, cancel it",
        cancelKeep: "Keep rehearsal",
        changeApply: "Yes, choose a new slot",
        changeKeep: "Keep this slot",
      };
async function fixture(
  locale: Locale,
  stage: "draft" | "collecting" | "ready" | "booked" = "collecting",
) {
  const chatId = nextChat--;
  await prisma.chatConfiguration.create({
    data: {
      chatId,
      ...createChatConfiguration({ planningAccessPolicy: "ANYONE_IN_CHAT" }),
    },
  });
  await prisma.chatLanguagePreference.create({
    data: { chatId, locale, explicitlySelected: true },
  });
  for (const id of [author, member]) {
    await prisma.telegramUser.upsert({
      where: { telegramUserId: BigInt(id) },
      create: { telegramUserId: BigInt(id), firstName: "Оля <&>" },
      update: {},
    });
    await prisma.chatMembership.create({
      data: { chatId, telegramUserId: BigInt(id), activeAt: now },
    });
  }
  const h = session(chatId);
  const l = labels(locale);
  await h.message("/plan");
  const read = () =>
    prisma.planningRound.findFirstOrThrow({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      include: { participants: true },
    });
  if (stage !== "draft") {
    await h.click(h.token(l.day));
    await h.click(h.token("19:00"));
    await h.click(h.token(l.confirm));
  }
  if (stage === "ready" || stage === "booked") {
    await h.click(h.token(l.yes));
    await h.click(h.token(l.yes), member);
    expect(h.text()).toContain(
      locale === "uk"
        ? "Усі можуть! Час бронювати репетицію."
        : "Time to book the rehearsal.",
    );
  }
  if (stage === "booked") {
    await h.click(h.token(l.book));
    await h.click(h.token(l.apply));
    expect((await read()).status).toBe("BOOKED");
  }
  return { h, l, chatId, read };
}

describe.each(["en", "uk"] as const)("composed lifecycle in %s", (locale) => {
  it("keeps Back read-only, rechecks request/apply authority, and books exactly once", async () => {
    const { h, l, chatId, read } = await fixture(locale, "ready");
    const initial = await read();
    const request = h.token(l.book);
    await h.click(request, 87499);
    expect((await read()).status).toBe("CONFIRMED");
    expect(h.calls.filter((c) => c.method === "editMessageText")).toHaveLength(
      0,
    );
    await h.click(request);
    expect(h.text()).toContain(
      locale === "uk"
        ? "Студію вже заброньовано на цей час?"
        : "Only confirm if the band has already booked this slot with the studio.",
    );
    expect(h.text()).toContain("19:00–21:00");
    await h.click(h.token(l.back));
    expect((await read()).participants).toEqual(initial.participants);
    expect((await read()).bookedAt).toBeNull();
    await h.click(h.token(l.book), admin);
    const apply = h.token(l.apply);
    h.roles.set(admin, "member");
    await h.click(apply, admin);
    expect((await read()).status).toBe("CONFIRMED");
    expect(
      (
        await prisma.callbackAction.findUniqueOrThrow({
          where: { token: apply },
        })
      ).consumedAt,
    ).toBeNull();
    await h.click(apply);
    const booked = await read();
    expect(booked.status).toBe("BOOKED");
    expect(booked.bookedByUserId).toBe(BigInt(author));
    expect(h.text()).toContain(
      locale === "uk" ? "Студію заброньовано" : "Rehearsal booked",
    );
    const buttons = h.calls.flatMap(
      (c) => c.payload.reply_markup?.inline_keyboard.flat() ?? [],
    );
    expect(buttons.map((b: any) => b.text)).toContain(l.cancel);
    expect(buttons.map((b: any) => b.text)).not.toContain(l.yes);
    await h.click(apply);
    expect((await read()).revision).toBe(booked.revision);
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(1);
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });

  it("rejects a booking after unanimity is lost without creating another claim", async () => {
    const { h, l, read } = await fixture(locale, "ready");
    const initial = await read();
    await h.click(h.token(l.book));
    const apply = h.token(l.apply);
    await h.click(h.token(l.no), member);
    expect(h.text()).toContain(
      locale === "uk"
        ? "Цей час підходить не всім. Обери іншу дату й час."
        : "This slot does not work",
    );
    await h.click(apply);
    const round = await read();
    expect(round.status).toBe("CONFIRMED");
    expect(round.bookedAt).toBeNull();
    expect(round.readyAnnouncedAt).toEqual(initial.readyAnnouncedAt);
    expect(
      round.participants.find((p) => p.telegramUserId === BigInt(member))
        ?.availability,
    ).toBe("UNAVAILABLE");
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
  });

  it("supersedes a blocked attempt once, recovers old controls and resnapshots the roster", async () => {
    const { h, l, chatId, read } = await fixture(locale);
    const old = await read();
    const oldAnswer = h.token(l.no);
    await h.click(oldAnswer, member);
    expect(h.text()).toContain(
      locale === "uk"
        ? "Цей час підходить не всім. Обери іншу дату й час."
        : "This slot does not work",
    );
    const replan = h.token(l.replan);
    await prisma.chatMembership.updateMany({
      where: { chatId, telegramUserId: BigInt(member) },
      data: { activeAt: null, deactivatedAt: now },
    });
    await h.click(replan);
    const successor = await read();
    const prior = await prisma.planningRound.findUniqueOrThrow({
      where: { id: old.id },
    });
    expect(prior.status).toBe("SUPERSEDED");
    expect(prior.supersededByRoundId).toBe(successor.id);
    expect(successor.targetWeekStart).toBe(old.targetWeekStart);
    expect(successor.participants.map((p) => p.telegramUserId)).toEqual([
      BigInt(author),
    ]);
    expect(successor.participants.every((p) => p.availability === null)).toBe(
      true,
    );
    expect(h.text()).toContain(
      locale === "uk" ? "переплановано" : "was replanned",
    );
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
    await h.click(replan);
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
    await h.click(oldAnswer, member);
    expect(
      h.calls.find((c) => c.method === "answerCallbackQuery")?.payload.text,
    ).toContain("/plan_status");
    await h.message("/plan_status");
    await h.click(h.token(l.day));
    await h.click(h.token("19:00"));
    await h.click(h.token(l.confirm));
    expect((await read()).participants.map((p) => p.telegramUserId)).toEqual([
      BigInt(author),
    ]);
  });

  it("changes a booked slot in the same week and preserves keep semantics", async () => {
    const { h, l, chatId, read } = await fixture(locale, "booked");
    const old = await read();
    await h.message("/plan_change");
    expect(h.text()).toContain(
      locale === "uk"
        ? "Усі відповідатимуть знову"
        : "Everyone will answer again",
    );
    await h.click(h.token(l.changeKeep));
    expect((await read()).status).toBe("BOOKED");
    await h.message("/plan_change");
    const apply = h.token(l.changeApply);
    await h.click(apply);
    const next = await read();
    expect(next.status).toBe("DRAFT");
    expect(next.targetWeekStart).toBe(old.targetWeekStart);
    expect(next.bookedAt).toBeNull();
    expect(
      (await prisma.planningRound.findUniqueOrThrow({ where: { id: old.id } }))
        .supersededByRoundId,
    ).toBe(next.id);
    await h.click(apply);
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
  });

  it.each(["draft", "collecting", "booked"] as const)(
    "cancels %s with the correct notification entitlement",
    async (stage) => {
      const { h, l, read } = await fixture(locale, stage);
      const initial = await read();
      await h.message("/plan_cancel");
      expect(h.text()).toContain(
        locale === "uk"
          ? "Репетицію буде скасовано."
          : "The rehearsal will be called off.",
      );
      await h.click(h.token(l.cancelKeep));
      expect((await read()).status).toBe(initial.status);
      await h.message("/plan_cancel");
      const apply = h.token(l.cancelApply);
      await h.click(apply);
      expect((await read()).status).toBe("CANCELLED");
      expect((await read()).participants).toEqual(initial.participants);
      expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(
        stage === "booked" ? 1 : 0,
      );
      expect(h.text()).toContain(locale === "uk" ? "скасовано" : "cancelled");
      await h.click(apply);
      expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
      await h.message("/plan_status");
      expect((await read()).status).toBe("CANCELLED");
    },
  );

  it("reanchors missing messages and leaves retired copies truthful", async () => {
    const { h, l, read } = await fixture(locale, "ready");
    const initial = await read();
    h.missingNextEdit();
    await h.click(h.token(l.book));
    const recovered = await read();
    expect(recovered.status).toBe("CONFIRMED");
    expect(recovered.participants).toEqual(initial.participants);
    // Opening confirmation is best-effort; /plan_status owns durable reanchoring.
    expect(recovered.announcementMessageId).toBe(initial.announcementMessageId);
    expect(recovered.readyAnnouncedAt).toEqual(initial.readyAnnouncedAt);
    expect(h.text()).toContain(
      locale === "uk"
        ? "Студію вже заброньовано на цей час?"
        : "Only confirm if the band has already booked this slot with the studio.",
    );
    await h.message("/plan_status");
    expect(h.text()).toContain(
      locale === "uk" ? "Четвер, 27 серпня" : "Thu 27 Aug",
    );
    expect((await read()).anchorMessageId).not.toBe(initial.anchorMessageId);
    expect((await read()).status).toBe("CONFIRMED");
  });

  it("keeps one locale across body and appended lifecycle controls", async () => {
    const { h, l } = await fixture(locale, "ready");
    await h.click(h.token(l.book));
    const keep = h.token(l.back);
    const original = prisma.chatLanguagePreference.findUnique.bind(
      prisma.chatLanguagePreference,
    );
    let reads = 0;
    const spy = vi
      .spyOn(prisma.chatLanguagePreference, "findUnique")
      .mockImplementation((async (args: any) => {
        const result = await original(args);
        // A different preference observed after the body has been rendered must
        // not change the keyboard language of that same payload.
        return result
          ? {
              ...result,
              locale: ++reads <= 1 ? locale : locale === "uk" ? "en" : "uk",
            }
          : result;
      }) as any);
    try {
      await h.click(keep);
      const rendered = h.calls.filter(
        (c) => c.method === "editMessageText" && c.payload.reply_markup,
      );
      expect(rendered.length).toBeGreaterThan(0);
      for (const call of rendered) {
        const text = String(call.payload.text);
        const buttons = call.payload.reply_markup.inline_keyboard
          .flat()
          .map((b: any) => b.text);
        if (text.includes("Можна бронювати"))
          expect(buttons).toContain(labels("uk").cancel);
        if (text.includes("Ready to book"))
          expect(buttons).toContain(labels("en").cancel);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("does not duplicate announcement or successor claims under concurrent actions", async () => {
    const { h, l, chatId, read } = await fixture(locale);
    const yes = h.token(l.yes);
    h.calls.length = 0;
    await Promise.all([
      h.click(yes, author, false),
      h.click(yes, member, false),
    ]);
    expect((await read()).readyAnnouncedAt).not.toBeNull();
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
    await h.click(h.token(l.no), member);
    const replan = h.token(l.replan);
    h.calls.length = 0;
    await Promise.all([
      h.click(replan, author, false),
      h.click(replan, admin, false),
    ]);
    expect(await prisma.planningRound.count({ where: { chatId } })).toBe(2);
    expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(1);
  });

  it.each(["cancel", "change"] as const)(
    "rechecks %s authority before apply",
    async (action) => {
      const { h, l, read } = await fixture(locale);
      const before = await read();
      await h.message(`/plan_${action}`, member);
      expect((await read()).status).toBe(before.status);
      await h.message(`/plan_${action}`, admin);
      const apply = h.token(
        action === "cancel" ? l.cancelApply : l.changeApply,
      );
      h.roles.set(admin, "member");
      await h.click(apply, admin);
      expect((await read()).status).toBe(before.status);
      expect(
        (
          await prisma.callbackAction.findUniqueOrThrow({
            where: { token: apply },
          })
        ).consumedAt,
      ).toBeNull();
      expect(h.calls.filter((c) => c.method === "sendMessage")).toHaveLength(0);
    },
  );
});
