import { Context } from "grammy";
import type { Update } from "grammy/types";
import { describe, expect, it } from "vitest";
import {
  migrationKeys,
  migrationPair,
} from "../../src/telegram/migration-handler.js";

function context(message: object) {
  return new Context(
    { update_id: 1, message } as Update,
    {} as never,
    {} as never,
  );
}
const base = {
  message_id: 1,
  date: 1,
  from: { id: 1, is_bot: false, first_name: "Member" },
};

describe("migration transport identity", () => {
  it("locks both identities for either service update order", () => {
    const to = context({
      ...base,
      chat: { id: -42, type: "group" },
      migrate_to_chat_id: -10042,
    });
    const from = context({
      ...base,
      chat: { id: -10042, type: "supergroup" },
      migrate_from_chat_id: -42,
    });
    expect(migrationPair(to)).toEqual([-42n, -10042n]);
    expect(migrationPair(from)).toEqual([-42n, -10042n]);
    expect(migrationKeys(to)).toEqual(["chat:-42", "chat:-10042"]);
    expect(migrationKeys(from)).toEqual(migrationKeys(to));
  });
  it("does not interpret text or a private/channel update as a migration", () => {
    expect(
      migrationPair(
        context({
          ...base,
          chat: { id: -42, type: "group" },
          text: "migrate_to_chat_id: -10042",
        }),
      ),
    ).toBeUndefined();
    expect(
      migrationPair(
        context({
          ...base,
          chat: { id: 42, type: "private" },
          migrate_to_chat_id: -10042,
        }),
      ),
    ).toBeUndefined();
  });
  it("keeps ordinary chat serialization and permits chatless updates", () => {
    expect(
      migrationKeys(
        context({ ...base, chat: { id: -42, type: "group" }, text: "/plan" }),
      ),
    ).toEqual(["chat:-42"]);
    expect(
      migrationKeys(
        new Context({ update_id: 1 } as Update, {} as never, {} as never),
      ),
    ).toEqual([]);
  });
});
