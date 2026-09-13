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
  });
  boss.on("error", () =>
    logger.error(
      { event: "reminder-queue-error" },
      "Reminder queue operation failed",
    ),
  );
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;
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
        if (
          (await boss.schemaVersion()) !== 37 ||
          !(await boss.detectSchemaDrift()).ok ||
          !(await boss.getQueue(QUEUE))
        )
          throw new Error(
            "Reminder queue provisioning is missing or mismatched",
          );
        await boss.work(
          QUEUE,
          { batchSize: 1, pollingIntervalSeconds: 1 },
          async (jobs) => {
            for (const job of jobs) await handler(parseIdentity(job.data));
          },
        );
        running = true;
        await wake();
        timer = setInterval(() => {
          void wake().catch(() =>
            logger.error(
              { event: "reminder-wake-failed" },
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
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      running = false;
      await boss.stop({ graceful: true, timeout: 30_000 });
    },
  };
}
