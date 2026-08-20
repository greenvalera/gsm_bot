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
import {
  GeoTzTimezoneResolver,
  type TimezoneResolver,
} from "../infrastructure/time/timezone-resolver.js";
import { registerSetupHandlers } from "../telegram/setup-handlers.js";
import { registerSettingsHandlers } from "../telegram/settings-handlers.js";

export type { CurrentTelegramRole, TelegramMembershipGateway };

export interface BotDependencies {
  botToken: string;
  botInfo?: UserFromGetMe;
  prisma: PrismaClient;
  now: () => Date;
  membershipGateway: TelegramMembershipGateway;
  timezoneResolver?: TimezoneResolver;
}

export function createBot(deps: BotDependencies): Bot {
  const bot =
    deps.botInfo === undefined
      ? new Bot(deps.botToken)
      : new Bot(deps.botToken, { botInfo: deps.botInfo });

  registerSetupHandlers(bot, {
    prisma: deps.prisma,
    authorization: new AuthorizationService(
      deps.prisma,
      deps.membershipGateway,
    ),
    setup: new SetupService(deps.prisma),
    timezoneResolver: deps.timezoneResolver ?? new GeoTzTimezoneResolver(),
    now: deps.now,
  });
  registerSettingsHandlers(bot, {
    prisma: deps.prisma,
    authorization: new AuthorizationService(
      deps.prisma,
      deps.membershipGateway,
    ),
    settings: new SettingsService(deps.prisma),
    timezoneResolver: deps.timezoneResolver ?? new GeoTzTimezoneResolver(),
    now: deps.now,
  });

  return bot;
}
