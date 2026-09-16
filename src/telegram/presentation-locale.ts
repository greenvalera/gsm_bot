import type { PrismaClient } from "../generated/prisma/client.js";
import { LanguageService } from "../domain/chat/language-service.js";
import type { Locale } from "../shared/i18n/index.js";
import type { SafeLogger } from "../shared/logger.js";

/** Presentation only: never use a fallback to authorize or accept a mutation. */
export async function resolvePresentationLocale(
  prisma: PrismaClient,
  chatId: bigint,
  logger?: SafeLogger,
  lastKnown: Locale = "en",
): Promise<Locale> {
  try {
    return (await new LanguageService(prisma).resolve(chatId)).locale;
  } catch (error) {
    logger?.error(
      { event: "telegram.locale.failed", chatId, err: error },
      "Could not resolve presentation locale; using fallback",
    );
    return lastKnown;
  }
}
