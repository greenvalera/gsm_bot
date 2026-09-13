import { describe, expect, it } from "vitest";
import { ChatCoordinator } from "../../src/shared/chat-coordinator.js";
import { migrationKeys } from "../../src/telegram/migration-handler.js";
import { Context } from "grammy";

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
describe("shared worker/update coordination", () => {
  it.each(["settings", "cancel", "response"])("holds %s update behind in-flight worker and permits another chat", async (kind) => {
    const coordinator = new ChatCoordinator();
    const entered = latch(); const finish = latch(); const order: string[] = [];
    const worker = coordinator.run(["chat:-1"], async () => { entered.release(); await finish.promise; order.push("send"); });
    await entered.promise;
    const update = coordinator.run(["chat:-1"], async () => { order.push(kind); });
    await coordinator.run(["chat:-2"], async () => { order.push("other"); });
    expect(order).toEqual(["other"]);
    finish.release(); await Promise.all([worker, update]);
    expect(order).toEqual(["other", "send", kind]);
  });
  it("migration obtains old/new keys once in sorted order without deadlock", async () => {
    const coordinator = new ChatCoordinator();
    const fake = { message: { migrate_to_chat_id: -1002, chat: { id: -1, type: "group" } } } as Context;
    expect(migrationKeys(fake)).toEqual(["chat:-1", "chat:-1002"]);
    const hold = latch(); const entered = latch(); const events: string[] = [];
    const migration = coordinator.run([...migrationKeys(fake), "chat:-1"].reverse(), async () => { entered.release(); await hold.promise; events.push("migration"); });
    await entered.promise;
    const old = coordinator.run(["chat:-1"], async () => { events.push("old"); });
    const next = coordinator.run(["chat:-1002"], async () => { events.push("new"); });
    expect(events).toEqual([]); hold.release(); await Promise.all([migration, old, next]);
    expect(events[0]).toBe("migration");
  });
  it("releases keys after errors", async () => {
    const coordinator = new ChatCoordinator();
    await expect(coordinator.run(["a"], async () => { throw new Error("failure"); })).rejects.toThrow("failure");
    expect(await coordinator.run(["a"], async () => 1)).toBe(1);
  });
});
