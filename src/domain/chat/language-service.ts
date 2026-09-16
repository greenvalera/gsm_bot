import {
  CallbackActionKind,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { parseLanguageTarget } from "../../shared/callback-schema.js";
import type { Locale } from "../../shared/i18n/index.js";

type Client = Pick<Prisma.TransactionClient, "chatLanguagePreference">;
async function resolve(client: Client, chatId: bigint) {
  const row = await client.chatLanguagePreference.findUnique({
    where: { chatId },
  });
  return {
    locale: row?.locale === "uk" ? ("uk" as const) : ("en" as const),
    explicitlySelected: row?.explicitlySelected ?? false,
  };
}
async function select(
  client: Client,
  chatId: bigint,
  locale: Locale,
  now: Date,
) {
  if (locale !== "en" && locale !== "uk")
    throw new RangeError("Unsupported locale");
  const current = await resolve(client, chatId);
  if (!current.explicitlySelected || current.locale !== locale) {
    await client.chatLanguagePreference.upsert({
      where: { chatId },
      create: { chatId, locale, explicitlySelected: true, updatedAt: now },
      update: { locale, explicitlySelected: true, updatedAt: now },
    });
  }
  return {
    kind:
      current.locale === locale ? ("unchanged" as const) : ("changed" as const),
    locale,
  };
}

/** Preference writes never touch configuration or draft revisions. */
export class LanguageService {
  constructor(private readonly prisma: PrismaClient) {}
  resolve(chatId: bigint) {
    return resolve(this.prisma, chatId);
  }
  select(chatId: bigint, locale: Locale, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      // Also orders independent service instances, including the first insert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${chatId})`;
      return select(tx, chatId, locale, now);
    });
  }
  accept(chatId: bigint, actorId: bigint, token: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${chatId})`;
      const row = await tx.callbackAction.findUnique({ where: { token } });
      if (
        !row ||
        row.kind !== CallbackActionKind.SETTINGS_EDIT ||
        row.chatId !== chatId ||
        row.actorUserId !== actorId ||
        row.expiresAt <= now ||
        row.consumedAt !== null
      )
        return { kind: "stale" as const };
      const target = parseLanguageTarget(row.targetId);
      if (!target.success) return { kind: "stale" as const };
      const claimed = await tx.callbackAction.updateMany({
        where: { token, consumedAt: null },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) return { kind: "stale" as const };
      if (target.data.action === "language-select") {
        return {
          ...(await select(tx, chatId, target.data.locale, now)),
          target: target.data,
        };
      }
      return { kind: "navigation" as const, target: target.data };
    });
  }
}
