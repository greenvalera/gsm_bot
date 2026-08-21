import { run } from "@grammyjs/runner";
import pino from "pino";

import { loadConfig } from "./config.js";
import {
  createBot,
  type CurrentTelegramRole,
  type TelegramMembershipGateway,
} from "./create-bot.js";
import { createPrismaClient } from "../infrastructure/db/prisma.js";

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
  const logger = pino({
    level: config.logLevel,
    redact: ["BOT_TOKEN", "DATABASE_URL"],
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
  });

  // Sequentialization is installed by createBot ahead of every handler.
  bot.catch((error) => {
    logger.error(
      { err: error.error, updateId: error.ctx.update.update_id },
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
  // Configuration is validated before clients are made; avoid printing values from it.
  console.error("Application startup failed", error);
  process.exitCode = 1;
});
