import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserFromGetMe } from "grammy/types";
import { createBot } from "../../src/app/create-bot.js";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import { migrateChat } from "../../src/domain/chat/migration-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { createLanguageTarget } from "../../src/shared/callback-schema.js";
import {
  startPostgresTestContainer,
  type PostgresTestContainer,
} from "../helpers/postgres.js";

let postgres: PostgresTestContainer;
let prisma: PrismaClient;
const now = new Date("2026-09-16T12:00:00Z");
beforeAll(async () => {
  postgres = await startPostgresTestContainer();
  prisma = createPrismaClient(postgres.databaseUrl);
}, 180_000);
afterAll(async () => {
  await prisma?.$disconnect();
  await postgres?.stop();
}, 60_000);

async function preference(chatId: bigint, locale: "en" | "uk") {
  return prisma.chatLanguagePreference.create({
    data: {
      chatId,
      locale,
      explicitlySelected: true,
      createdAt: now,
      updatedAt: now,
    },
  });
}

describe("language identity continuity", () => {
  it("lets an unrelated language callback finish before migration takes table locks", async () => {
    const chatId = -6206n;
    const token = "unrelated-language-selection";
    await prisma.callbackAction.create({
      data: {
        token,
        kind: "SETTINGS_EDIT",
        chatId,
        actorUserId: 123n,
        targetId: createLanguageTarget({
          action: "language-select",
          locale: "uk",
          destination: "settings",
        }),
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = prisma.$extends({
      query: {
        callbackAction: {
          async updateMany({ args, query }) {
            const result = await query(args);
            reached.resolve();
            await release.promise;
            return result;
          },
        },
      },
    });
    const selecting = new LanguageService(
      held as unknown as PrismaClient,
    ).accept(chatId, 123n, token, now);
    await reached.promise;
    const moving = migrateChat(prisma, -6207n, -106207n, now);
    try {
      await vi.waitFor(async () => {
        const [row] = await prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) AS count FROM pg_locks
          WHERE relation = 'chat_migrations'::regclass AND NOT granted
        `;
        expect(Number(row?.count)).toBeGreaterThan(0);
      });
    } finally {
      release.resolve();
    }
    expect(await selecting).toMatchObject({ kind: "changed", locale: "uk" });
    expect(await moving).toBe("migrated");
  });

  it("keeps language-only writes independent of configuration, drafts and reminder timing across reconstructed clients", async () => {
    const chatId = -6201n;
    await prisma.chatConfiguration.create({
      data: {
        chatId,
        timezone: "Europe/Kyiv",
        defaultWeekday: 5,
        defaultStartMinute: 1020,
        durationMinutes: 120,
        dailyStartMinute: 540,
        dailyEndMinute: 1320,
        reminderMinutes: [60],
      },
    });
    await prisma.chatReminderState.create({
      data: { chatId, effectiveFrom: now },
    });
    await prisma.setupDraft.create({
      data: {
        chatId,
        actorUserId: 123n,
        timezone: "Europe/Kyiv",
        reminderMinutes: [60],
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    await prisma.settingsEditDraft.create({
      data: {
        chatId,
        actorUserId: 123n,
        field: "DURATION_MINUTES",
        replacementPayload: 180,
        expectedRevision: 1,
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    async function snapshot() {
      return {
        config: await prisma.chatConfiguration.findUnique({
          where: { chatId },
          include: { reminderState: true },
        }),
        setup: await prisma.setupDraft.findMany({ where: { chatId } }),
        edits: await prisma.settingsEditDraft.findMany({ where: { chatId } }),
      };
    }
    const before = await snapshot();
    const service = new LanguageService(prisma);
    expect(await service.resolve(chatId)).toEqual({
      locale: "en",
      explicitlySelected: false,
    });
    await service.select(chatId, "en", now);
    const explicit = await prisma.chatLanguagePreference.findUniqueOrThrow({
      where: { chatId },
    });
    await service.select(chatId, "en", new Date(now.getTime() + 1000));
    expect(
      await prisma.chatLanguagePreference.findUniqueOrThrow({
        where: { chatId },
      }),
    ).toEqual(explicit);
    await service.select(chatId, "uk", now);
    const client = createPrismaClient(postgres.databaseUrl);
    try {
      const reconstructed = new LanguageService(client);
      expect(await reconstructed.resolve(chatId)).toEqual({
        locale: "uk",
        explicitlySelected: true,
      });
      expect(await reconstructed.resolve(-6202n)).toEqual({
        locale: "en",
        explicitlySelected: false,
      });
      await reconstructed.select(chatId, "uk", new Date(now.getTime() + 2000));
      expect(
        (
          await client.chatLanguagePreference.findUniqueOrThrow({
            where: { chatId },
          })
        ).updatedAt,
      ).toEqual(now);
    } finally {
      await client.$disconnect();
    }
    expect(await snapshot()).toEqual(before);
  });

  it("rejects an old-ID selection waiting behind an in-flight migration", async () => {
    const oldId = -6203n,
      newId = -106203n;
    await preference(oldId, "uk");
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = prisma.$extends({
      query: {
        chatMigration: {
          async create({ args, query }) {
            reached.resolve();
            await release.promise;
            return query(args);
          },
        },
      },
    });
    const moving = migrateChat(
      held as unknown as PrismaClient,
      oldId,
      newId,
      now,
    );
    await reached.promise;
    const selecting = new LanguageService(prisma).select(oldId, "en", now);
    const outcome = selecting.then(
      () => "accepted",
      () => "rejected",
    );
    try {
      await vi.waitFor(async () => {
        const [row] = await prisma.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        expect(Number(row?.count)).toBeGreaterThan(0);
      });
    } finally {
      release.resolve();
    }
    expect(await moving).toBe("migrated");
    expect(await outcome).toBe("rejected");
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: oldId },
      }),
    ).toBeNull();
    expect(await new LanguageService(prisma).resolve(newId)).toEqual({
      locale: "uk",
      explicitlySelected: true,
    });
  });

  it.each(["source", "destination"] as const)(
    "orders a %s selection already in progress before migration",
    async (side) => {
      const oldId = side === "source" ? -6204n : -6205n;
      const newId = oldId - 100000n;
      const chatId = side === "source" ? oldId : newId;
      const reached = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const held = prisma.$extends({
        query: {
          chatLanguagePreference: {
            async upsert({ args, query }) {
              const result = await query(args);
              reached.resolve();
              await release.promise;
              return result;
            },
          },
        },
      });
      const selecting = new LanguageService(
        held as unknown as PrismaClient,
      ).select(chatId, "uk", now);
      await reached.promise;
      const moving = migrateChat(prisma, oldId, newId, now).then(
        (value) => value,
        () => "conflict",
      );
      try {
        await vi.waitFor(async () => {
          const [row] = await prisma.$queryRaw<
            Array<{ count: bigint }>
          >`SELECT count(*) AS count FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
          expect(Number(row?.count)).toBeGreaterThan(0);
        });
      } finally {
        release.resolve();
      }
      await selecting;
      expect(await moving).toBe(side === "source" ? "migrated" : "conflict");
      expect(await new LanguageService(prisma).resolve(newId)).toEqual({
        locale: "uk",
        explicitlySelected: true,
      });
      expect(
        await prisma.chatLanguagePreference.findUnique({
          where: { chatId: oldId },
        }),
      ).toBeNull();
    },
  );
  it.each(["en", "uk"] as const)(
    "transfers preference-only %s exactly and replays without mutation",
    async (locale) => {
      const oldId = locale === "en" ? -6101n : -6102n;
      const newId = oldId - 100000n;
      const before = await preference(oldId, locale);
      expect(await migrateChat(prisma, oldId, newId, now)).toBe("migrated");
      expect(
        await prisma.chatLanguagePreference.findUnique({
          where: { chatId: oldId },
        }),
      ).toBeNull();
      expect(
        await prisma.chatLanguagePreference.findUnique({
          where: { chatId: newId },
        }),
      ).toEqual({ ...before, chatId: newId });
      expect(
        await migrateChat(prisma, oldId, newId, new Date(now.getTime() + 1000)),
      ).toBe("already-migrated");
      expect(
        await prisma.chatLanguagePreference.findUnique({
          where: { chatId: newId },
        }),
      ).toEqual({ ...before, chatId: newId });
      expect(
        await prisma.chatConfiguration.count({
          where: { chatId: { in: [oldId, newId] } },
        }),
      ).toBe(0);
    },
  );

  it("rejects destination-owned preferences before changing either side or drafts", async () => {
    const oldId = -6103n,
      newId = -106103n;
    const source = await preference(oldId, "uk");
    const destination = await preference(newId, "en");
    const draft = await prisma.setupDraft.create({
      data: {
        chatId: oldId,
        actorUserId: 123n,
        step: "READINESS",
        timezone: "Europe/Kyiv",
        reminderMinutes: [60],
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    await expect(migrateChat(prisma, oldId, newId, now)).rejects.toThrow(
      "conflicts",
    );
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: oldId },
      }),
    ).toEqual(source);
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: newId },
      }),
    ).toEqual(destination);
    expect(
      await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).toEqual(draft);
    expect(
      await prisma.chatMigration.findUnique({ where: { oldChatId: oldId } }),
    ).toBeNull();
  });

  it("rolls back preference and draft transfer when the final tombstone fails", async () => {
    const oldId = -6104n,
      newId = -106104n;
    const before = await preference(oldId, "uk");
    const failing = prisma.$extends({
      query: {
        chatMigration: {
          async create() {
            throw Error("injected failure");
          },
        },
      },
    });
    await expect(
      migrateChat(failing as unknown as PrismaClient, oldId, newId, now),
    ).rejects.toThrow("injected failure");
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: oldId },
      }),
    ).toEqual(before);
    expect(
      await prisma.chatLanguagePreference.findUnique({
        where: { chatId: newId },
      }),
    ).toBeNull();
    expect(
      await prisma.chatMigration.findUnique({ where: { oldChatId: oldId } }),
    ).toBeNull();
  });

  it("renders migrated incomplete settings and resumes the owner's saved draft in Ukrainian", async () => {
    const oldId = -6105n,
      newId = -106105n;
    await preference(oldId, "uk");
    const draft = await prisma.setupDraft.create({
      data: {
        chatId: oldId,
        actorUserId: 123n,
        step: "READINESS",
        timezone: "Europe/Kyiv",
        reminderMinutes: [60],
        expiresAt: new Date(now.getTime() + 60000),
      },
    });
    await migrateChat(prisma, oldId, newId, now);
    const texts: string[] = [];
    const bot = createBot({
      botToken: "123456:TEST",
      botInfo: {
        id: 9001,
        is_bot: true,
        first_name: "GSMBot",
        username: "gsmbot",
      } as UserFromGetMe,
      prisma,
      now: () => now,
      membershipGateway: {
        async getCurrentRole() {
          return "administrator";
        },
      },
    });
    bot.api.config.use(async (_previous, _method, payload) => {
      const text = "text" in payload ? String(payload.text) : "";
      texts.push(text);
      return {
        ok: true,
        result: {
          message_id: 800,
          date: 1,
          chat: { id: Number(newId), type: "supergroup" },
          text,
        },
      } as never;
    });
    let update = 0;
    async function command(chatId: bigint, text: string) {
      await bot.handleUpdate({
        update_id: ++update,
        message: {
          message_id: update,
          date: 1,
          chat: { id: Number(chatId), type: "supergroup", title: "Band" },
          from: { id: 123, is_bot: false, first_name: "Admin" },
          text,
          entities: [{ type: "bot_command", offset: 0, length: text.length }],
        },
      });
    }
    await command(oldId, "/settings");
    expect(texts).toEqual([]);
    await command(newId, "/settings");
    expect(texts.at(-1)).toContain("Мова: Українська");
    await command(newId, "/setup");
    expect(texts.at(-1)).toContain("Обери");
    expect(
      await prisma.setupDraft.findUnique({ where: { id: draft.id } }),
    ).toMatchObject({
      chatId: newId,
      actorUserId: draft.actorUserId,
      step: draft.step,
      timezone: draft.timezone,
      reminderMinutes: draft.reminderMinutes,
      expectedRevision: draft.expectedRevision,
    });
    expect(await new LanguageService(prisma).resolve(newId)).toEqual({
      locale: "uk",
      explicitlySelected: true,
    });
  });
});
