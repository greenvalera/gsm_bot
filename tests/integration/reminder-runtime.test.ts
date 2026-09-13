import { expect, it, vi } from "vitest";
import { startRuntime, registerShutdownSignals } from "../../src/app/main.js";
import { EventEmitter } from "node:events";
import { Bot } from "grammy";
import type { Update } from "grammy/types";
import { createConcurrentSink } from "@grammyjs/runner";
import { ChatCoordinator } from "../../src/shared/chat-coordinator.js";
import { startPostgresTestContainer } from "../helpers/postgres.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { ReminderService } from "../../src/domain/reminders/reminder-service.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  resetReminders,
  reminderRound,
  reminderRow,
  reminderDue,
  reminderChat,
} from "../helpers/reminders.js";

it("does not make queued updates extend a hung reminder's shutdown deadline",async()=>{
  const coordinator=new ChatCoordinator();
  let release!:()=>void;
  const paused=new Promise<void>(resolve=>{release=resolve;});
  let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const reminder=coordinator.run(["chat:1"],async()=>{entered();await paused;});
  await started;
  const handler=vi.fn(async()=>{});
  const queued=coordinator.runUpdate(["chat:1"],handler);
  const {deps}=fixture();
  const runtime=await startRuntime({...deps,updates:coordinator,drainTimeoutMs:5});
  const stopping=runtime.stop().then(()=>true,()=>false);
  try {
    const finished=await Promise.race([stopping,new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),100))]);
    expect(finished).toBe(true);
    expect(deps.disconnect).toHaveBeenCalledOnce();
  } finally {release();await reminder;await queued;await stopping;}
  expect(handler).not.toHaveBeenCalled();
});

it("drains a real grammY middleware promise and drops queued updates before database close", async () => {
  const coordinator = new ChatCoordinator();
  const bot = new Bot("9:test", {
    botInfo: {
      id: 9,
      is_bot: true,
      first_name: "Test",
      username: "testbot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
  });
  let release!: () => void;
  const paused = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  let completed = false;
  let calls = 0;
  bot.use((ctx, next) => coordinator.runUpdate([`chat:${ctx.chat?.id}`], next));
  bot.on("message", async () => {
    calls++;
    entered();
    await paused;
    completed = true;
  });
  const sink = createConcurrentSink<Update>(
    { consume: (update) => bot.handleUpdate(update) },
    async (error) => {
      throw error;
    },
  );
  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1,
      from: { id: 1, is_bot: false, first_name: "A" },
      chat: { id: -1, type: "group" as const, title: "Test" },
      text: "test",
    },
  };
  await sink.handle([update]);
  await started;
  await sink.handle([{ ...update, update_id: 2 }]);
  const { deps } = fixture();
  deps.disconnect.mockImplementation(async () => {
    expect(completed).toBe(true);
  });
  const runtime = await startRuntime({
    ...deps,
    updates: coordinator,
    drainTimeoutMs: 5,
  });
  const stopping = runtime.stop();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(deps.disconnect).not.toHaveBeenCalled();
  release();
  await expect(stopping).rejects.toThrow("Runtime teardown failed");
  expect(calls).toBe(1);
  expect(deps.disconnect).toHaveBeenCalledOnce();
});

it("keeps repeated SIGTERM and SIGINT handlers installed throughout shutdown", async () => {
  const events = new EventEmitter();
  const received: NodeJS.Signals[] = [];
  const remove = registerShutdownSignals(
    (signal) => received.push(signal),
    events,
  );
  events.emit("SIGTERM");
  events.emit("SIGTERM");
  events.emit("SIGINT");
  events.emit("SIGINT");
  expect(received).toEqual(["SIGTERM", "SIGTERM", "SIGINT", "SIGINT"]);
  expect(events.listenerCount("SIGTERM")).toBe(1);
  expect(events.listenerCount("SIGINT")).toBe(1);
  remove();
  expect(events.listenerCount("SIGTERM")).toBe(0);
  expect(events.listenerCount("SIGINT")).toBe(0);
});

it("a failed chat lookup and rejected send do not starve a later healthy chat", async () => {
  const db = await startPostgresTestContainer();
  const prisma = createPrismaClient(db.databaseUrl);
  try {
    await resetReminders(prisma);
    const round = await reminderRound(prisma);
    await reminderRow(prisma, round.id);
    const config = await prisma.chatConfiguration.findUniqueOrThrow({
      where: { chatId: reminderChat },
    });
    const second = -809n;
    await prisma.chatConfiguration.create({
      data: {
        ...config,
        chatId: second,
        reminderState: { create: { effectiveFrom: new Date("2026-09-01") } },
      },
    });
    const other = await prisma.planningRound.create({
      data: { ...round, id: "healthy-round", chatId: second },
    });
    const membership = await prisma.chatMembership.create({
      data: { chatId: second, telegramUserId: 1n },
    });
    await prisma.planningParticipant.create({
      data: {
        roundId: other.id,
        chatId: second,
        telegramUserId: 1n,
        membershipId: membership.id,
      },
    });
    await prisma.reminderOccurrence.create({
      data: {
        id: "a-healthy",
        chatId: second,
        kind: "FOLLOW_UP",
        scope: other.id,
        roundId: other.id,
        generation: 1,
        civilDate: new Date("2026-09-16"),
        minute: 600,
        dueAt: reminderDue,
      },
    });
    const delivered: bigint[] = [];
    const service = new ReminderService({
      prisma,
      now: () => reminderDue,
      botUserId: 9n,
      logger: createLogger({ level: "silent" }),
      transport: async () => ({ messageId: 92 }),
      followups: {
        getChat: async (id) => {
          if (id === reminderChat) throw Error("inaccessible");
          return { id, type: "group" };
        },
        send: async (input) => {
          if (input.chatId === reminderChat) throw Error("transport failure");
          delivered.push(input.chatId);
          return { messageId: 91 };
        },
      },
    });
    await service.reconcile();
    expect(delivered).toEqual([second]);
    await service.stop();
  } finally {
    await prisma.$disconnect();
    await db.stop();
  }
}, 180000);
function fixture(failure?: string) {
  const order: string[] = [];
  const step = (name: string) =>
    vi.fn(async () => {
      order.push(name);
      if (name === failure) throw Error(name);
    });
  const deps = {
    initialize: step("initialize"),
    queue: {
      start: step("queue-start"),
      stopAdmission: vi.fn(() => order.push("queue-admission")),
      stop: step("queue-stop"),
    },
    reminders: {
      recoverAbandonedReservations: step("recover"),
      reconcile: step("reconcile"),
      stopAdmission: vi.fn(() => order.push("reminder-admission")),
      stop: step("drain"),
    },
    startRunner: () => {
      order.push("runner-start");
      if (failure === "runner-start") throw Error("runner-start");
      return { stop: step("runner-stop") };
    },
    disconnect: step("disconnect"),
  };
  return { deps, order };
}
it.each(["initialize", "queue-start", "recover", "reconcile", "runner-start"])(
  "closes acquired resources after %s fails",
  async (failure) => {
    const { deps, order } = fixture(failure);
    await expect(startRuntime(deps)).rejects.toThrow(failure);
    expect(order.slice(-2)).toEqual(["queue-stop", "disconnect"]);
  },
);
it("uses current-anchor reply when metadata lookup fails and drains a paused send within its bound", async () => {
  const db = await startPostgresTestContainer();
  const prisma = createPrismaClient(db.databaseUrl);
  let release!: () => void;
  const paused = new Promise<void>((r) => (release = r));
  let entered!: () => void;
  const sending = new Promise<void>((r) => (entered = r));
  try {
    await resetReminders(prisma);
    const round = await reminderRound(prisma);
    const row = await reminderRow(prisma, round.id);
    const getChat = vi.fn(async () => {
      throw Error("unavailable chat");
    });
    const send = vi.fn(async () => {
      entered();
      await paused;
      return { messageId: 91 };
    });
    const service = new ReminderService({
      prisma,
      now: () => reminderDue,
      botUserId: 9n,
      logger: createLogger({ level: "silent" }),
      transport: async () => ({ messageId: 92 }),
      followups: { getChat, send },
    });
    const work = service.dispatch(row.id);
    await Promise.race([sending, work]);
    expect(send).toHaveBeenCalledOnce();
    await service.stop(10);
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "RESERVED" });
    await service.dispatch(row.id);
    expect(send).toHaveBeenCalledOnce();
    release();
    await work;
    expect(
      await prisma.reminderOccurrence.findUnique({ where: { id: row.id } }),
    ).toMatchObject({ disposition: "RESERVED", attemptId: expect.any(String) });
    await service.dispatch(row.id);
    expect(send).toHaveBeenCalledOnce();
  } finally {
    release?.();
    await prisma.$disconnect();
    await db.stop();
  }
}, 180000);
it("stops admission first and closes queue before database exactly once", async () => {
  const { deps, order } = fixture();
  const runtime = await startRuntime(deps);
  await Promise.all([runtime.stop(), runtime.stop()]);
  expect(order.slice(-6)).toEqual([
    "queue-admission",
    "reminder-admission",
    "runner-stop",
    "drain",
    "queue-stop",
    "disconnect",
  ]);
  expect(deps.disconnect).toHaveBeenCalledTimes(1);
});
it("still closes all resources when runner teardown rejects", async () => {
  const { deps, order } = fixture("runner-stop");
  const runtime = await startRuntime(deps);
  await expect(runtime.stop()).rejects.toThrow();
  expect(order.slice(-3)).toEqual(["drain", "queue-stop", "disconnect"]);
});
it("bounds a paused runner without skipping database cleanup", async () => {
  const { deps, order } = fixture();
  const runtime = await startRuntime({
    ...deps,
    drainTimeoutMs: 5,
    startRunner: () => ({
      stop: async () => {
        await new Promise(() => {});
      },
    }),
  });
  await expect(runtime.stop()).rejects.toThrow("Runtime teardown failed");
  expect(order.slice(-3)).toEqual(["drain", "queue-stop", "disconnect"]);
});
it("does not admit queue work before recovery or after teardown", async () => {
  const { deps } = fixture();
  let handler!: (id?: bigint) => Promise<void>;
  const runtime = await startRuntime({
    ...deps,
    queue: {
      ...deps.queue,
      start: async (callback) => {
        handler = callback;
        await callback();
      },
    },
  });
  expect(deps.reminders.reconcile).toHaveBeenCalledTimes(1);
  await handler(reminderChat);
  expect(deps.reminders.reconcile).toHaveBeenCalledTimes(2);
  await runtime.stop();
  await handler(reminderChat);
  expect(deps.reminders.reconcile).toHaveBeenCalledTimes(2);
});
