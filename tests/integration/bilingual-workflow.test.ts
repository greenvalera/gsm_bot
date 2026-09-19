import { recordOutboundEvidence } from "../helpers/outbound-evidence.js";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import type { TimezoneResolver } from "../../src/infrastructure/time/timezone-resolver.js";
import {
  createCallbackToken,
  createSetupTarget,
  createTimezoneTarget,
} from "../../src/shared/callback-schema.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let database: PostgresTestContainer;
let prisma: ReturnType<typeof createPrismaClient>;
const now = new Date("2026-09-21T12:00:00Z");
let nextChat = -885000n;
beforeAll(async () => {
  database = await startPostgresTestContainer();
  prisma = createPrismaClient(database.databaseUrl);
}, 120000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await prisma?.$disconnect();
  await database?.stop();
}, 60000);

async function fixture(locale: Locale, timezoneResolver?: TimezoneResolver) {
  const chatId = nextChat--;
  const actorId = 885001n;
  await prisma.chatLanguagePreference.create({
    data: { chatId, locale, explicitlySelected: true },
  });
  const calls: { method: string; payload: any }[] = [];
  let role: "administrator" | "member" | "left" = "administrator";
  const chat = {
    id: Number(chatId),
    type: "supergroup" as const,
    title: "Band",
  };
  const from = {
    id: Number(actorId),
    is_bot: false,
    first_name: "🎸 <b>&".repeat(30),
  };
  let sequence = 0;
  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: {
      id: 999,
      is_bot: true,
      first_name: "Bot",
      username: "gsmbot",
    } as never,
    prisma,
    now: () => now,
    membershipGateway: { getCurrentRole: async () => role },
    ...(timezoneResolver ? { timezoneResolver } : {}),
  });
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload });
    const text = (payload as any).text;
    if (text)
      expect(text.length).toBeLessThanOrEqual(
        method === "answerCallbackQuery" ? 200 : 4096,
      );
    return {
      ok: true,
      result:
        method === "answerCallbackQuery"
          ? true
          : { message_id: 500, date: 1, chat, text },
    } as never;
  });
  return {
    chatId,
    actorId,
    calls,
    role(value: typeof role) {
      role = value;
    },
    async message(text: string, sender = true, location = false) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        message: {
          message_id: sequence,
          date: 1,
          chat,
          ...(sender ? { from } : {}),
          ...(location
            ? { location: { latitude: 50, longitude: 30 } }
            : {
                text,
                ...(text.startsWith("/")
                  ? {
                      entities: [
                        { type: "bot_command", offset: 0, length: text.length },
                      ],
                    }
                  : {}),
              }),
        },
      } as never);
    },
    async click(token: string) {
      calls.length = 0;
      await bot.handleUpdate({
        update_id: ++sequence,
        callback_query: {
          id: String(sequence),
          chat_instance: "c",
          from,
          data: token,
          message: { message_id: 500, date: 1, chat },
        },
      });
      expect(
        calls.filter((c) => c.method === "answerCallbackQuery"),
      ).toHaveLength(1);
    },
    async action(targetId: string, consumedAt: Date | null = null) {
      return prisma.callbackAction.create({
        data: {
          token: createCallbackToken(),
          kind: "START_SETUP",
          chatId,
          actorUserId: actorId,
          targetId,
          consumedAt,
          expiresAt: new Date(now.getTime() + 60000),
        },
      });
    },
    async snapshot() {
      return {
        configuration: await prisma.chatConfiguration.findUnique({
          where: { chatId },
        }),
        drafts: await prisma.setupDraft.findMany({ where: { chatId } }),
        actions: await prisma.callbackAction.findMany({
          where: { chatId },
          orderBy: { token: "asc" },
        }),
        rounds: await prisma.planningRound.findMany({ where: { chatId } }),
      };
    },
    expectPhrase(
      key: Parameters<typeof renderMessage>[1],
      method = "sendMessage",
    ) {
      expect(calls.filter((c) => c.method === method)).toHaveLength(1);
      expect(calls.find((c) => c.method === method)?.payload.text).toBe(
        renderMessage(locale, key, undefined as never),
      );
    },
  };
}

describe.each(["en", "uk"] as const)(
  "residual bilingual workflow %s",
  (locale) => {
    it("successfully cancels setup without changing another actor draft or configuration", async () => {
      const h = await fixture(locale);
      const setup = new SetupService(prisma);
      const draft = await setup.beginOrResume(h.chatId, h.actorId, now);
      const other = await setup.beginOrResume(h.chatId, h.actorId + 1n, now);
      const action = await h.action(
        createSetupTarget({ draftId: draft.id, action: "cancel" }),
      );
      await h.click(action.token);
      h.expectPhrase("setup.cancelled", "editMessageText");
      const after = await h.snapshot();
      expect(after.drafts).toEqual([other]);
      expect(after.configuration).toBeNull();
      expect(after.rounds).toEqual([]);
      expect(
        after.actions.find((a) => a.token === action.token)?.consumedAt,
      ).toEqual(now);

      recordOutboundEvidence(
        [
          "src/telegram/setup-handlers.ts#dispatchSetupCallback:editMessageText:2",
        ],
        locale,
      );
    });
    it.each(["failure", "throw"] as const)(
      "setup timezone %s retains draft and offers localized recovery",
      async (failure) => {
        const resolve = vi.fn(async () => {
          if (failure === "throw") throw new Error("resolver unavailable");
          return { kind: "failure" as const, cause: "resolver-error" as const };
        });
        const h = await fixture(locale, { resolve });
        await new SetupService(prisma).beginOrResume(h.chatId, h.actorId, now);
        const before = await h.snapshot();
        await h.message("", true, true);
        expect(resolve).toHaveBeenCalledExactlyOnceWith(50, 30);
        h.expectPhrase("timezone.loading");
        h.expectPhrase("timezone.failure", "editMessageText");
        expect(await h.snapshot()).toEqual(before);

        recordOutboundEvidence(
          [
            "src/telegram/setup-handlers.ts#handleSetupLocation:editMessageText:1",
          ],
          locale,
        );
      },
    );
    it("setup ambiguous timezone renders all bound choices without selecting one", async () => {
      const candidates = ["Europe/Kyiv", "Europe/Warsaw"] as const;
      const h = await fixture(locale, {
        resolve: async () => ({ kind: "ambiguous", candidates }),
      });
      const draft = await new SetupService(prisma).beginOrResume(
        h.chatId,
        h.actorId,
        now,
      );
      await h.message("", true, true);
      h.expectPhrase("timezone.loading");
      const edited = h.calls.find(
        (c) => c.method === "editMessageText",
      )!.payload;
      expect(edited.text).toBe(
        renderMessage(locale, "timezone.candidates", {
          candidates: candidates
            .map((value) => `<code>${value}</code>`)
            .join("\n"),
        }),
      );
      expect(
        edited.reply_markup.inline_keyboard.flat().map((b: any) => b.text),
      ).toEqual([
        ...candidates.map((timezone) =>
          renderMessage(locale, "timezone.use", { timezone }),
        ),
        renderMessage(locale, "timezone.another", undefined),
      ]);
      const after = await h.snapshot();
      expect(after.drafts).toEqual([draft]);
      expect(after.configuration).toBeNull();
      expect(after.actions).toHaveLength(3);
      expect(
        after.actions.every(
          (a) =>
            a.chatId === h.chatId &&
            a.actorUserId === h.actorId &&
            a.consumedAt === null,
        ),
      ).toBe(true);

      recordOutboundEvidence(
        [
          "src/telegram/setup-handlers.ts#renderCandidates:keyboard.text:2",
          "src/telegram/setup-handlers.ts#renderCandidates:text:2",
        ],
        locale,
      );
    });
    it.each(["/plan", "/plan_status", "/plan_cancel", "/plan_change"])(
      "readiness command %s rejects missing identity and unauthorized membership",
      async (command) => {
        const h = await fixture(locale);
        const before = await h.snapshot();
        const key =
          command === "/plan"
            ? "planning.feedback.denied"
            : "planning.feedback.statusDenied";
        await h.message(command, false);
        h.expectPhrase(key);
        h.role(command === "/plan" ? "member" : "left");
        await h.message(command);
        h.expectPhrase(key);
        expect(await h.snapshot()).toEqual(before);

        recordOutboundEvidence(
          [
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:1",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:2",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:3",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:4",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:5",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:6",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:7",
            "src/telegram/handlers.ts#registerChatReadinessHandlers:reply:8",
          ],
          locale,
        );
      },
    );
    it("admin command denial retains persisted language and domain state", async () => {
      const h = await fixture(locale);
      const before = await h.snapshot();
      h.role("member");
      await h.message("/setup");
      h.expectPhrase("common.denied");
      expect(await h.snapshot()).toEqual(before);

      recordOutboundEvidence(
        ["src/telegram/handlers.ts#replyCommandDenial:reply:1"],
        locale,
      );
    });
    it.each(["command", "location", "text", "callback"])(
      "setup expiry at %s removes only the expired actor draft",
      async (entry) => {
        const h = await fixture(locale);
        const setup = new SetupService(prisma);
        const draft = await setup.beginOrResume(
          h.chatId,
          h.actorId,
          new Date(now.getTime() - 3600000),
        );
        const other = await setup.beginOrResume(h.chatId, h.actorId + 1n, now);
        const action = await h.action(draft.id);
        if (entry === "callback") await h.click(action.token);
        else
          await h.message(
            entry === "command" ? "/setup" : "19:00",
            true,
            entry === "location",
          );
        h.expectPhrase("setup.expired");
        expect(
          await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
        ).toBeNull();
        expect(
          await prisma.setupDraft.findUnique({ where: { id: other.id } }),
        ).toEqual(other);
        expect(
          await prisma.callbackAction.findUnique({
            where: { token: action.token },
          }),
        ).toEqual(action);
        expect((await h.snapshot()).configuration).toBeNull();

        recordOutboundEvidence(
          [
            "src/telegram/setup-handlers.ts#handleSetupCommand:reply:2",
            "src/telegram/setup-handlers.ts#handleSetupLocation:reply:1",
            "src/telegram/setup-handlers.ts#handleSetupText:reply:1",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:reply:1",
          ],
          locale,
        );
      },
    );
    it.each([
      "consumed-save",
      "consumed-other",
      "missing",
      "foreign-draft",
      "wrong-step",
      "timezone-selected",
    ])(
      "setup stale branch %s preserves valid persisted controls",
      async (branch) => {
        const h = await fixture(locale);
        const draft = await new SetupService(prisma).beginOrResume(
          h.chatId,
          h.actorId,
          now,
        );
        let targetId = draft.id;
        if (branch === "consumed-save")
          targetId = createSetupTarget({ draftId: draft.id, action: "save" });
        if (branch === "foreign-draft") targetId = "unrelated-draft";
        if (branch === "wrong-step")
          targetId = createSetupTarget({ draftId: draft.id, action: "save" });
        if (branch === "timezone-selected") {
          await prisma.setupDraft.update({
            where: { id: draft.id },
            data: { timezone: "Europe/Kyiv" },
          });
          targetId = createTimezoneTarget(draft.id, "Europe/Kyiv");
        }
        if (branch === "missing")
          await prisma.setupDraft.delete({ where: { id: draft.id } });
        const action = await h.action(
          targetId,
          branch.startsWith("consumed") ? now : null,
        );
        const before = await h.snapshot();
        await h.click(action.token);
        h.expectPhrase(
          branch === "consumed-save" ? "common.applied" : "setup.stale",
          "answerCallbackQuery",
        );
        expect(await h.snapshot()).toEqual(before);

        recordOutboundEvidence(
          [
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:1",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:1",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:2",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:2",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:3",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:3",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:4",
            "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:4",
          ],
          locale,
        );
      },
    );
    for (const actionName of ["save", "cancel"] as const) {
      it.each(["duplicate", "expired", "stale", "failed"] as const)(
        `setup ${actionName} result %s is localized without pretending a write succeeded`,
        async (kind) => {
          const h = await fixture(locale);
          const draft = await new SetupService(prisma).beginOrResume(
            h.chatId,
            h.actorId,
            now,
          );
          await prisma.setupDraft.update({
            where: { id: draft.id },
            data: {
              timezone: "Europe/Kyiv",
              defaultWeekday: 1,
              defaultStartMinute: 1140,
              durationMinutes: 120,
              dailyStartMinute: 600,
              dailyEndMinute: 1320,
              reminderMinutes: [600, 960],
              planningAccessPolicy: "ADMINS_ONLY",
            },
          });
          const action = await h.action(
            createSetupTarget({ draftId: draft.id, action: actionName }),
          );
          // Fault injection occurs at the durable-result seam. Routing, actor-bound
          // token lookup, draft validation, locale lookup and Telegram payload are real.
          const spy = vi
            .spyOn(
              SetupService.prototype,
              actionName === "save" ? "saveConfiguration" : "cancelSetup",
            )
            .mockResolvedValueOnce({ kind });
          const before = await h.snapshot();
          await h.click(action.token);
          expect(spy).toHaveBeenCalledOnce();
          const key =
            kind === "duplicate"
              ? "common.applied"
              : kind === "stale"
                ? "setup.stale"
                : kind === "expired"
                  ? "setup.expired"
                  : "common.saveFailure";
          h.expectPhrase(
            key,
            kind === "duplicate" || kind === "stale"
              ? "answerCallbackQuery"
              : "sendMessage",
          );
          expect(await h.snapshot()).toEqual(before);

          recordOutboundEvidence(
            [
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:5",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:5",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:reply:2",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:6",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:6",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:reply:3",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:7",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:7",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:reply:4",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:8",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:8",
              "src/telegram/setup-handlers.ts#dispatchSetupCallback:reply:5",
            ],
            locale,
          );
        },
      );
    }
    it("setup claim race acknowledges once without mutating the draft", async () => {
      const h = await fixture(locale);
      const draft = await new SetupService(prisma).beginOrResume(
        h.chatId,
        h.actorId,
        now,
      );
      const action = await h.action(draft.id);
      const before = await h.snapshot();
      const spy = vi
        .spyOn(prisma.callbackAction, "updateMany")
        .mockResolvedValueOnce({ count: 0 });
      await h.click(action.token);
      expect(spy).toHaveBeenCalledOnce();
      h.expectPhrase("common.applied", "answerCallbackQuery");
      expect(await h.snapshot()).toEqual(before);

      recordOutboundEvidence(
        [
          "src/telegram/setup-handlers.ts#dispatchSetupCallback:answerCallbackQuery:9",
          "src/telegram/setup-handlers.ts#dispatchSetupCallback:text:9",
        ],
        locale,
      );
    });
  },
);
