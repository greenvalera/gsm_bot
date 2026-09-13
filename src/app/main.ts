import { run } from "@grammyjs/runner";

import { loadConfig } from "./config.js";
import {
  createBot,
  type CurrentTelegramRole,
  type TelegramMembershipGateway,
} from "./create-bot.js";
import { createPrismaClient } from "../infrastructure/db/prisma.js";
import { createLogger } from "../shared/logger.js";
import { ReminderService } from "../domain/reminders/reminder-service.js";
import { createReminderQueue } from "../infrastructure/jobs/reminder-queue.js";
import { ChatCoordinator } from "../shared/chat-coordinator.js";
import { renderPlanningReminder } from "../telegram/reminder-renderers.js";

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
  const coordinator = new ChatCoordinator();
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
    coordinator,
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

  try {
    await bot.init();
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
  const reminders = new ReminderService({
    botUserId: BigInt(bot.botInfo.id),
    coordinator,
    prisma,
    now: () => new Date(),
    logger,
    transport: async ({ chatId, targetWeek, callbackData }) => {
      const rendered = renderPlanningReminder(targetWeek, callbackData);
      const message = await bot.api.sendMessage(Number(chatId), rendered.text, {
        reply_markup: rendered.reply_markup,
      });
      return { messageId: message.message_id };
    },
  });
  const queue = createReminderQueue({
    databaseUrl: config.databaseUrl,
    logger,
  });
  let runner: ReturnType<typeof run>;
  try {
    await queue.start((chatId) => reminders.reconcile(chatId));
    runner = run(bot);
  } catch (error) {
    await reminders.stop();
    await queue.stop();
    await prisma.$disconnect();
    throw error;
  }
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Stopping Telegram runner");

    void runner
      .stop()
      .then(() => reminders.stop())
      .then(() => queue.stop())
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
