import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../../src/domain/auth/authorization-service.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  type ChatReadinessServices,
  registerChatReadinessHandlers,
} from "../../src/telegram/handlers.js";

/**
 * Route ownership on the two update routes.
 *
 * `message:text` and `message:location` are carrier routes: they can carry a
 * protected action, but an ordinary sentence on them is not one. The gate must
 * therefore establish that the actor has an in-flight action BEFORE it consults
 * the current role, or every ordinary non-administrator message is refused.
 *
 * The administrator control matters as much as the regression: a fix that
 * silences the routes unconditionally would pass case 1 and break the wizard.
 */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

const CHAT_ID = -1004000000001n;
const ADMIN_ID = 4101n;
const MEMBER_ID = 4102n;
const NOW = new Date("2026-08-25T09:00:00.000Z");

/** Copywriting Contract texts, verbatim. */
const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const DRAFT_EXPIRED =
  "This setup expired after 30 minutes of inactivity. Send /setup to start again.";

type SentCall = Readonly<{ method: string; text: string }>;
type ReadCall = Readonly<{ model: string; where: unknown }>;
type SetupLookup =
  Readonly<{ kind: "missing" }> | Readonly<{ kind: "expired" }>;

type HarnessOptions = Readonly<{
  /** Everyone who is not ADMIN_ID is an ordinary member. */
  role?: (actorId: bigint) => "administrator" | "member";
  /** Whether a setup draft ROW exists for the acting user. */
  setupDraft?: boolean;
  /** Whether a settings edit draft ROW exists for the acting user. */
  settingsDraft?: boolean;
  /** What the setup wizard reports once the route hands the turn over. */
  setupLookup?: SetupLookup;
}>;

/**
 * Rows are deliberately already lapsed. An existing-but-expired row is still an
 * in-flight action for route-ownership purposes, which is what keeps the
 * documented expiry copy reachable instead of silently swallowed.
 */
function draftRow(actorId: bigint) {
  return {
    id: "draft-1",
    chatId: CHAT_ID,
    actorUserId: actorId,
    expiresAt: new Date(NOW.getTime() - 60_000),
  };
}

function ownKey(actorId: bigint) {
  return {
    chatId_actorUserId: { chatId: CHAT_ID, actorUserId: actorId },
  };
}

function createHarness(options: HarnessOptions = {}) {
  const sent: SentCall[] = [];
  const deletions: string[] = [];
  const reads: ReadCall[] = [];
  /** Every observable effect in real call order, so ordering is assertable. */
  const order: string[] = [];

  const setupRow = options.setupDraft === true ? draftRow(MEMBER_ID) : null;
  const settingsRow =
    options.settingsDraft === true ? draftRow(MEMBER_ID) : null;

  const prisma = {
    setupDraft: {
      async findUnique({ where }: { where: unknown }) {
        reads.push({ model: "setupDraft", where });
        order.push("setupDraft.findUnique");
        return setupRow;
      },
      async deleteMany() {
        deletions.push("setupDraft.deleteMany");
        order.push("setupDraft.deleteMany");
        return { count: 0 };
      },
    },
    settingsEditDraft: {
      async findUnique({ where }: { where: unknown }) {
        reads.push({ model: "settingsEditDraft", where });
        order.push("settingsEditDraft.findUnique");
        return settingsRow;
      },
      async deleteMany() {
        deletions.push("settingsEditDraft.deleteMany");
        order.push("settingsEditDraft.deleteMany");
        return { count: 0 };
      },
    },
  };

  const authorization = new AuthorizationService(
    prisma as never,
    {
      async getCurrentRole(_chatId, actorId) {
        order.push("membership");
        return options.role?.(actorId) ?? "member";
      },
    },
    createLogger({ level: "silent" }),
  );

  const setup = {
    async requireActive() {
      order.push("setup.requireActive");
      return options.setupLookup ?? ({ kind: "missing" } as const);
    },
  };

  const bot = new Bot("123456:TEST_TOKEN", { botInfo: BOT_INFO });
  registerChatReadinessHandlers(bot, {
    // This suite asserts silence on the CHAT surface, not on the log stream.
    logger: createLogger({ level: "silent" }),
    prisma,
    authorization,
    setup,
    settings: {},
    roster: {},
    timezoneResolver: {
      async resolve() {
        return { kind: "resolved", candidate: "Europe/Kyiv" };
      },
    },
    now: () => NOW,
  } as unknown as ChatReadinessServices);

  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    method: string,
    payload: Record<string, unknown>,
  ) => {
    sent.push({ method, text: String(payload.text ?? "") });
    order.push(`api:${method}`);
    return {
      ok: true,
      result: {
        message_id: 501,
        date: 1_784_000_000,
        chat: { id: Number(CHAT_ID), type: "supergroup" },
        text: payload.text ?? "",
      },
    };
  }) as never);

  return {
    sent,
    deletions,
    reads,
    order,
    roleLookups() {
      return order.filter((entry) => entry === "membership");
    },
    async sendText(actorId: bigint, text: string) {
      await bot.handleUpdate({
        update_id: 7_001,
        message: {
          message_id: 7_001,
          date: 1_784_000_000,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
          from: { id: Number(actorId), is_bot: false, first_name: "Sam" },
          text,
        },
      } as never);
    },
    async sendLocation(actorId: bigint) {
      await bot.handleUpdate({
        update_id: 7_002,
        message: {
          message_id: 7_002,
          date: 1_784_000_000,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
          from: { id: Number(actorId), is_bot: false, first_name: "Sam" },
          location: { latitude: 50.45, longitude: 30.52 },
        },
      } as never);
    },
  };
}

describe("update route ownership", () => {
  it("says nothing to a non-administrator ordinary message with no draft", async () => {
    const harness = createHarness();

    await harness.sendText(MEMBER_ID, "see you at practice");

    expect(harness.sent).toStrictEqual([]);
    expect(harness.roleLookups()).toStrictEqual([]);
    expect(harness.deletions).toStrictEqual([]);
    // The probe reads only the acting user's own rows, and mutates nothing.
    expect(harness.reads).toStrictEqual([
      { model: "setupDraft", where: ownKey(MEMBER_ID) },
      { model: "settingsEditDraft", where: ownKey(MEMBER_ID) },
    ]);
  });

  it("says nothing to an administrator ordinary message with no draft", async () => {
    const harness = createHarness({
      role: (actorId) => (actorId === ADMIN_ID ? "administrator" : "member"),
    });

    await harness.sendText(ADMIN_ID, "see you at practice");

    expect(harness.sent).toStrictEqual([]);
    expect(harness.deletions).toStrictEqual([]);
  });

  it("still denies a non-administrator answering a live prompt, with the draft already deleted", async () => {
    const harness = createHarness({
      role: (actorId) => (actorId === ADMIN_ID ? "administrator" : "member"),
      setupDraft: true,
    });

    await harness.sendText(MEMBER_ID, "19:30");

    expect(harness.deletions).toStrictEqual([
      "setupDraft.deleteMany",
      "settingsEditDraft.deleteMany",
    ]);
    expect(harness.sent.at(-1)?.text).toBe(COMMAND_DENIAL);
    // Delete-before-deny: both deletions precede the denial in real call order.
    expect(harness.order.indexOf("settingsEditDraft.deleteMany")).toBeLessThan(
      harness.order.indexOf("api:sendMessage"),
    );
    expect(harness.roleLookups()).toStrictEqual(["membership"]);
  });

  it("says nothing to a non-administrator sharing a location with no draft", async () => {
    const harness = createHarness();

    await harness.sendLocation(MEMBER_ID);

    expect(harness.sent).toStrictEqual([]);
    expect(harness.roleLookups()).toStrictEqual([]);
    expect(harness.deletions).toStrictEqual([]);
  });

  it("hands an administrator with an existing draft row to the wizard, keeping the expiry copy reachable", async () => {
    const harness = createHarness({
      role: (actorId) => (actorId === ADMIN_ID ? "administrator" : "member"),
      setupDraft: true,
      setupLookup: { kind: "expired" },
    });

    await harness.sendText(ADMIN_ID, "19:30");

    expect(harness.order).toContain("setup.requireActive");
    expect(harness.sent.at(-1)?.text).toBe(DRAFT_EXPIRED);
    expect(harness.deletions).toStrictEqual([]);
  });
});
