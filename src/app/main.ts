import { run } from "@grammyjs/runner";
import { pathToFileURL } from "node:url";

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

/** Keep both handlers installed until cleanup settles: repeat signals must not
 * regain Node's default immediate-termination behavior during a drain. */
export function registerShutdownSignals(
  shutdown: (signal: NodeJS.Signals) => void,
  signals: {
    on(event: NodeJS.Signals, listener: () => void): unknown;
    removeListener(event: NodeJS.Signals, listener: () => void): unknown;
  } = process,
) {
  const term = () => shutdown("SIGTERM");
  const interrupt = () => shutdown("SIGINT");
  signals.on("SIGTERM", term);
  signals.on("SIGINT", interrupt);
  return () => {
    signals.removeListener("SIGTERM", term);
    signals.removeListener("SIGINT", interrupt);
  };
}

/** One process owns polling and delivery. Cleanup always visits every resource. */
export async function startRuntime(deps: {
  initialize(): Promise<void>;
  queue: {
    start(handler: (chatId?: bigint) => Promise<void>): Promise<void>;
    stopAdmission(): void;
    stop(): Promise<void>;
  };
  reminders: {
    recoverAbandonedReservations(): Promise<void>;
    reconcile(chatId?: bigint): Promise<void>;
    stopAdmission(): void;
    stop(): Promise<void>;
  };
  startRunner(): { stop(): Promise<unknown> };
  disconnect(): Promise<void>;
  drainTimeoutMs?: number;
  updates?: Pick<
    ChatCoordinator,
    "stopUpdateAdmission" | "drainUpdates" | "updatesSettled"
  >;
}) {
  let runner: ReturnType<typeof deps.startRunner> | undefined;
  let stopping: Promise<void> | undefined;
  let ready = false;
  const stop = () =>
    (stopping ??= (async () => {
      ready = false;
      deps.queue.stopAdmission();
      deps.reminders.stopAdmission();
      deps.updates?.stopUpdateAdmission();
      const errors: unknown[] = [];
      const stopRunner = async () => {
        if (!runner) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            runner.stop(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(Error("Runner drain deadline reached")),
                deps.drainTimeoutMs ?? 30_000,
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      };
      for (const close of [
        stopRunner,
        () => deps.updates?.drainUpdates(deps.drainTimeoutMs),
        () => deps.reminders.stop(),
        () => deps.queue.stop(),
        async () => {
          // A drain timeout cannot cancel arbitrary middleware already executing.
          // Do not disconnect underneath it; queue admission is already closed.
          await deps.updates?.updatesSettled();
          await deps.disconnect();
        },
      ]) {
        try {
          await close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "Runtime teardown failed");
    })());
  try {
    await deps.initialize();
    // Register a gated handler: readiness/recovery completes before claims enter.
    await deps.queue.start(async (id) => {
      if (ready) await deps.reminders.reconcile(id);
    });
    await deps.reminders.recoverAbandonedReservations();
    await deps.reminders.reconcile();
    runner = deps.startRunner();
    ready = true;
    return { stop };
  } catch (error) {
    try {
      await stop();
    } catch {
      /* Preserve the startup reason. */
    }
    throw error;
  }
}

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
    followups: {
      getChat: async (chatId) => {
        const chat = await bot.api.getChat(Number(chatId));
        return {
          id: BigInt(chat.id),
          type: chat.type,
          ...("username" in chat && chat.username
            ? { username: chat.username }
            : {}),
        };
      },
      send: async ({ chatId, text, reply_parameters }) => {
        const message = await bot.api.sendMessage(Number(chatId), text, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
          ...(reply_parameters ? { reply_parameters } : {}),
        });
        return { messageId: message.message_id };
      },
    },
  });
  const queue = createReminderQueue({
    databaseUrl: config.databaseUrl,
    logger,
  });
  const runtime = await startRuntime({
    initialize: async () => {
      await prisma.$connect();
    },
    queue,
    reminders,
    updates: coordinator,
    startRunner: () => run(bot, { runner: { silent: true } }),
    disconnect: () => prisma.$disconnect(),
  });
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Stopping Telegram runner");

    void runtime
      .stop()
      .then(() => {
        logger.info("Telegram runner and Prisma pool stopped");
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "Graceful shutdown failed");
        process.exitCode = 1;
      })
      .finally(() => removeSignals());
  };

  const removeSignals = registerShutdownSignals(shutdown);
  logger.info("Telegram long-poll runner started");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error: unknown) => {
    // Boot can fail before or inside loadConfig, so no configured secret is available
    // to register here. The logger still scrubs token and connection-URL shapes, which
    // a driver or Telegram client error message can carry.
    createLogger().error({ err: error }, "Application startup failed");
    process.exitCode = 1;
  });
