import { describe, expect, it, vi } from "vitest";
import { LanguageService } from "../../src/domain/chat/language-service.js";
import type { PrismaClient } from "../../src/generated/prisma/client.js";

const now = new Date("2026-09-16T12:00:00Z");
function store(tombstoned = false) {
  let preference: { locale: string; explicitlySelected: boolean } | null = null;
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    chatMigration: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          tombstoned ? { oldChatId: -1n, newChatId: -2n } : null,
        ),
    },
    chatLanguagePreference: {
      findUnique: vi.fn(async () => preference),
      upsert: vi.fn(
        async ({
          create,
        }: {
          create: { locale: string; explicitlySelected: boolean };
        }) => {
          preference = create;
          return preference;
        },
      ),
    },
    callbackAction: { findUnique: vi.fn(), updateMany: vi.fn() },
  };
  const service = new LanguageService({
    $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaClient);
  return { tx, service };
}

describe("language service identity and no-op contract", () => {
  it("rejects selection for a tombstoned identity without writing a preference", async () => {
    const { tx, service } = store(true);
    await expect(service.select(-1n, "uk", now)).rejects.toThrow("migrated");
    expect(tx.chatLanguagePreference.upsert).not.toHaveBeenCalled();
  });
  it("treats any callback on a retired identity as stale before token consumption", async () => {
    const { tx, service } = store(true);
    await expect(service.accept(-1n, 10n, "token", now)).resolves.toEqual({
      kind: "stale",
    });
    expect(tx.callbackAction.findUnique).not.toHaveBeenCalled();
    expect(tx.callbackAction.updateMany).not.toHaveBeenCalled();
  });
  it.each(["en", "uk"] as const)(
    "writes explicit %s once and skips repeated selection",
    async (locale) => {
      const { tx, service } = store();
      await service.select(-1n, locale, now);
      await service.select(-1n, locale, new Date(now.getTime() + 1000));
      expect(tx.chatLanguagePreference.upsert).toHaveBeenCalledTimes(1);
      expect(tx.chatLanguagePreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            chatId: -1n,
            locale,
            explicitlySelected: true,
            updatedAt: now,
          },
        }),
      );
    },
  );
  it("rejects unsupported locale values without persistence", async () => {
    const { tx, service } = store();
    await expect(service.select(-1n, "fr" as "en", now)).rejects.toThrow(
      "Unsupported locale",
    );
    expect(tx.chatLanguagePreference.upsert).not.toHaveBeenCalled();
  });
});
