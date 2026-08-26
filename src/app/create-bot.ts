import { sequentialize } from "@grammyjs/runner";
import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  AuthorizationService,
  type CurrentTelegramRole,
  type TelegramMembershipGateway,
} from "../domain/auth/authorization-service.js";
import { SetupService } from "../domain/chat/setup-service.js";
import { SettingsService } from "../domain/chat/settings-service.js";
import { RosterService } from "../domain/roster/roster-service.js";
import {
  GeoTzTimezoneResolver,
  type TimezoneResolver,
} from "../infrastructure/time/timezone-resolver.js";
import { createLogger, type SafeLogger } from "../shared/logger.js";
import { registerChatReadinessHandlers } from "../telegram/handlers.js";

export type { CurrentTelegramRole, TelegramMembershipGateway };

export interface BotDependencies {
  botToken: string;
  botInfo?: UserFromGetMe;
  prisma: PrismaClient;
  now: () => Date;
  membershipGateway: TelegramMembershipGateway;
  timezoneResolver?: TimezoneResolver;
  /**
   * Optional here and REQUIRED on every container below it, which is the whole
   * point: a handler can always log, while a caller that never asked for logs
   * (every existing suite) stays byte-for-byte silent via the substitution
   * below rather than by handlers checking for an absent logger.
   */
  logger?: SafeLogger;
}

/**
 * Composition root. Sequentialization is installed before any handler so two
 * updates for the same chat can never interleave inside the actor-bound draft
 * and callback-consumption transitions.
 *
 * The logger is threaded from here into every update-path container. Finding
 * F-4's structural root cause was that `main.ts` held a logger in scope and did
 * not pass it, so no handler *could* log.
 */
export function createBot(deps: BotDependencies): Bot {
  const bot =
    deps.botInfo === undefined
      ? new Bot(deps.botToken)
      : new Bot(deps.botToken, { botInfo: deps.botInfo });

  // The substitution happens once, here, and the SAME instance reaches every
  // container below — the telegram handlers and the domain authorization
  // service alike. Evaluating it twice would produce two loggers and quietly
  // break the "one logger per composition root" seam.
  const logger = deps.logger ?? createLogger({ level: "silent" });

  bot.use(
    sequentialize((ctx) =>
      ctx.chat === undefined ? undefined : `chat:${String(ctx.chat.id)}`,
    ),
  );

  registerChatReadinessHandlers(bot, {
    logger,
    prisma: deps.prisma,
    authorization: new AuthorizationService(
      deps.prisma,
      deps.membershipGateway,
      logger,
    ),
    setup: new SetupService(deps.prisma),
    settings: new SettingsService(deps.prisma),
    roster: new RosterService(deps.prisma),
    timezoneResolver: deps.timezoneResolver ?? new GeoTzTimezoneResolver(),
    now: deps.now,
  });

  return bot;
}
