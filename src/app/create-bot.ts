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
import { registerChatReadinessHandlers } from "../telegram/handlers.js";

export type { CurrentTelegramRole, TelegramMembershipGateway };

export interface BotDependencies {
  botToken: string;
  botInfo?: UserFromGetMe;
  prisma: PrismaClient;
  now: () => Date;
  membershipGateway: TelegramMembershipGateway;
  timezoneResolver?: TimezoneResolver;
}

/**
 * Composition root. Sequentialization is installed before any handler so two
 * updates for the same chat can never interleave inside the actor-bound draft
 * and callback-consumption transitions.
 */
export function createBot(deps: BotDependencies): Bot {
  const bot =
    deps.botInfo === undefined
      ? new Bot(deps.botToken)
      : new Bot(deps.botToken, { botInfo: deps.botInfo });

  bot.use(
    sequentialize((ctx) =>
      ctx.chat === undefined ? undefined : `chat:${String(ctx.chat.id)}`,
    ),
  );

  registerChatReadinessHandlers(bot, {
    prisma: deps.prisma,
    authorization: new AuthorizationService(
      deps.prisma,
      deps.membershipGateway,
    ),
    setup: new SetupService(deps.prisma),
    settings: new SettingsService(deps.prisma),
    roster: new RosterService(deps.prisma),
    timezoneResolver: deps.timezoneResolver ?? new GeoTzTimezoneResolver(),
    now: deps.now,
  });

  return bot;
}
