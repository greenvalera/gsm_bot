import { run } from "@grammyjs/runner";

import { loadConfig } from "./config.js";
import {
  createBot,
  type CurrentTelegramRole,
  type TelegramMembershipGateway,
} from "./create-bot.js";
import { createPrismaClient } from "../infrastructure/db/prisma.js";
import { createLogger } from "../shared/logger.js";

function asCurrentTelegramRole(status: string): CurrentTelegramRole {
  switch (status) {
    case "creator":
    case "administrator":
    case "member":
    case "restricted":
    case "left":
    case "kicked":
      return status;
    default:
      return "unknown";
  }
}

async function main() {
  const config = loadConfig();
  const logger = createLogger({
    level: config.logLevel,
    secrets: [config.botToken, config.databaseUrl],
  });
  const prisma = createPrismaClient(config.databaseUrl);
  const membershipGateway: TelegramMembershipGateway = {
    async getCurrentRole(chatId, actorId) {
      const member = await bot.api.getChatMember(
        Number(chatId),
        Number(actorId),
      );
      return asCurrentTelegramRole(member.status);
    },
  };
  const bot = createBot({
    botToken: config.botToken,
    prisma,
    now: () => new Date(),
    membershipGateway,
    logger,
  });

  // Sequentialization is installed by createBot ahead of every handler.
  bot.catch((error) => {
    logger.error(
      {
        err: error.error,
        updateId: error.ctx.update.update_id,
        chatId: error.ctx.chat?.id,
      },
      "Unhandled Telegram update error",
    );
  });

  const runner = run(bot);
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Stopping Telegram runner");

    void runner
      .stop()
      .then(() => prisma.$disconnect())
      .then(() => {
        logger.info("Telegram runner and Prisma pool stopped");
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "Graceful shutdown failed");
        process.exitCode = 1;
      });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  logger.info("Telegram long-poll runner started");
}

void main().catch((error: unknown) => {
  // Boot can fail before or inside loadConfig, so no configured secret is available
  // to register here. The logger still scrubs token and connection-URL shapes, which
  // a driver or Telegram client error message can carry.
  createLogger().error({ err: error }, "Application startup failed");
  process.exitCode = 1;
});
