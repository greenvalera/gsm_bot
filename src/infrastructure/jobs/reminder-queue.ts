import { PgBoss } from "pg-boss";
import type { SafeLogger } from "../../shared/logger.js";

const QUEUE = "reminder-reconcile";
/** Payloads are hints only; the reconciler resolves current canonical state. */
function parseIdentity(data: unknown): bigint | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid wake payload");
  const record = data as Record<string, unknown>;
  if (Object.keys(record).length === 0) return undefined;
  if (
    Object.keys(record).length !== 1 ||
    typeof record.chatId !== "string" ||
    !/^-?[1-9]\d{0,15}$/.test(record.chatId)
  )
    throw new Error("Invalid wake identity");
  const id = BigInt(record.chatId);
  if (
    id > BigInt(Number.MAX_SAFE_INTEGER) ||
    id < -BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new Error("Invalid wake identity");
  return id;
}

export function createReminderQueue({
  databaseUrl,
  logger,
}: {
  databaseUrl: string;
  logger: SafeLogger;
}) {
  // The pg-boss cron monitor calls createQueue even with migrate:false.
  // Pulse durable jobs instead. The domain ledger owns all dates and recovery.
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
    migrate: false,
    schedule: false,
    supervise: true,
    persistWarnings: false,
    persistQueueStats: false,
  });
  boss.on("error", (err) =>
    logger.error(
      { err, event: "reminder-queue-error" },
      "Reminder queue operation failed",
    ),
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
  let accepting = false;
  async function wake(chatId?: bigint) {
    const data = chatId === undefined ? {} : { chatId: chatId.toString() };
    parseIdentity(data);
    if (!running) throw new Error("Reminder queue is not started");
    await boss.send(QUEUE, data, { singletonKey: chatId?.toString() ?? "all" });
  }
  return {
    async start(handler: (chatId?: bigint) => Promise<void>) {
      if (running) return;
      try {
        await boss.start();
        const provisioned = await boss.getQueue(QUEUE);
        if (
          (await boss.schemaVersion()) !== 37 ||
          !(await boss.detectSchemaDrift()).ok ||
          !provisioned ||
          provisioned.policy !== "short" ||
          provisioned.retryLimit !== 2 ||
          provisioned.retryDelay !== 30 ||
          provisioned.expireInSeconds !== 60 ||
          provisioned.retentionSeconds !== 3600 ||
          provisioned.deleteAfterSeconds !== 3600
        )
          throw new Error(
            "Reminder queue provisioning is missing or mismatched",
          );
        // Recover expired infrastructure jobs before accepting new work; no DDL.
        await boss.supervise(QUEUE);
        await boss.work(
          QUEUE,
          { batchSize: 1, pollingIntervalSeconds: 1 },
          async (jobs) => {
            for (const job of jobs)
              if (accepting) await handler(parseIdentity(job.data));
          },
        );
        running = true;
        accepting = true;
        await wake();
        timer = setInterval(() => {
          void wake().catch((err: unknown) =>
            logger.error(
              { err, event: "reminder-wake-failed" },
              "Reminder wake failed",
            ),
          );
        }, 30_000);
        timer.unref();
      } catch (error) {
        running = false;
        await boss.stop();
        throw error;
      }
    },
    wake,
    stopAdmission() {
      accepting = false;
      running = false;
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    async stop() {
      accepting = false;
      if (timer) clearInterval(timer);
      timer = undefined;
      running = false;
      await boss.stop({ graceful: true, timeout: 30_000 });
    },
  };
}
