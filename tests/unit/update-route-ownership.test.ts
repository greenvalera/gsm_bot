import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import { AuthorizationService } from "../../src/domain/auth/authorization-service.js";
import { SettingsService } from "../../src/domain/chat/settings-service.js";
import {
  PlanningAccessPolicy,
  SettingsField,
} from "../../src/generated/prisma/client.js";
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
 *
 * Ownership is only half the contract. Once a carrier route HAS claimed an
 * update, the claim must resolve into a user-visible outcome. Finding F-10
 * (broken window 14) is the other half failing: an owned update whose claim
 * came from a LAPSED settings-edit draft fell through to the setup wizard,
 * which found no setup draft of its own and returned in silence. The expired
 * cases below pin that fall-through shut for both carriers.
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
const SETTINGS_EDIT_EXPIRED =
  "This settings change expired after 30 minutes of inactivity. Open /settings to start again.";

type SentCall = Readonly<{ method: string; text: string }>;
type ReadCall = Readonly<{ model: string; where: unknown }>;
type SetupLookup =
  Readonly<{ kind: "missing" }> | Readonly<{ kind: "expired" }>;

/** How the acting user's settings-edit row is seeded, when one exists at all. */
type SettingsDraftState = Readonly<{
  /** Row owner; defaults to `MEMBER_ID`. */
  actor?: bigint;
  /** Field under edit; defaults to a text-collected schedule field. */
  field?: SettingsField;
  /** Lapsed by default — that is the F-10 case. */
  active?: boolean;
}>;

type HarnessOptions = Readonly<{
  /** Everyone who is not ADMIN_ID is an ordinary member. May throw. */
  role?: (actorId: bigint) => "administrator" | "member";
  /** Whether a setup draft ROW exists for the acting user. */
  setupDraft?: boolean;
  /** Whether a settings edit draft ROW exists, and in what state. */
  settingsDraft?: boolean | SettingsDraftState;
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

/** A settings-edit row, lapsed unless the case explicitly asks for a live one. */
function settingsDraftRow(state: SettingsDraftState) {
  return {
    id: "settings-draft-1",
    chatId: CHAT_ID,
    actorUserId: state.actor ?? MEMBER_ID,
    field: state.field ?? SettingsField.DEFAULT_START_MINUTE,
    replacementPayload: null,
    expectedRevision: 1,
    expiresAt: new Date(
      NOW.getTime() + (state.active === true ? 60_000 : -60_000),
    ),
  };
}

type SettingsDraftRow = ReturnType<typeof settingsDraftRow>;

function ownKey(actorId: bigint) {
  return {
    chatId_actorUserId: { chatId: CHAT_ID, actorUserId: actorId },
  };
}

/** A complete, valid committed configuration, so a settings read never fails. */
function committedConfiguration() {
  return {
    chatId: CHAT_ID,
    timezone: "Europe/Kyiv",
    defaultWeekday: 3,
    defaultStartMinute: 19 * 60,
    durationMinutes: 120,
    dailyStartMinute: 10 * 60,
    dailyEndMinute: 21 * 60,
    reminderMinutes: [10 * 60, 16 * 60],
    planningAccessPolicy: PlanningAccessPolicy.ADMINS_ONLY,
    revision: 1,
  };
}

function createHarness(options: HarnessOptions = {}) {
  const sent: SentCall[] = [];
  const deletions: string[] = [];
  const reads: ReadCall[] = [];
  /** Every `where` a settings deletion was actually bound by. */
  const settingsDeleteWheres: Record<string, unknown>[] = [];
  /** Any write that would touch committed configuration. Must stay empty. */
  const configurationWrites: string[] = [];
  /** Every observable effect in real call order, so ordering is assertable. */
  const order: string[] = [];

  const setupRow = options.setupDraft === true ? draftRow(MEMBER_ID) : null;
  let settingsRow: SettingsDraftRow | null =
    options.settingsDraft === undefined || options.settingsDraft === false
      ? null
      : settingsDraftRow(
          options.settingsDraft === true ? {} : options.settingsDraft,
        );
  const configuration = committedConfiguration();

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
      /**
       * A semantic fake, not a counter: a deletion bound by id, chat, actor and
       * a lapsed expiry must be unable to remove a live or foreign row, which
       * is the property T-01-23-02 turns on.
       */
      async deleteMany({ where }: { where: Record<string, unknown> }) {
        deletions.push("settingsEditDraft.deleteMany");
        order.push("settingsEditDraft.deleteMany");
        settingsDeleteWheres.push(where);
        if (settingsRow === null) return { count: 0 };
        const expiry = where.expiresAt as { lte?: Date } | undefined;
        const matches =
          (where.id === undefined || where.id === settingsRow.id) &&
          (where.chatId === undefined || where.chatId === settingsRow.chatId) &&
          (where.actorUserId === undefined ||
            where.actorUserId === settingsRow.actorUserId) &&
          (expiry?.lte === undefined || settingsRow.expiresAt <= expiry.lte);
        if (!matches) return { count: 0 };
        settingsRow = null;
        return { count: 1 };
      },
    },
    chatConfiguration: {
      async findUnique() {
        order.push("chatConfiguration.findUnique");
        return configuration;
      },
      async update() {
        configurationWrites.push("chatConfiguration.update");
        return configuration;
      },
      async updateMany() {
        configurationWrites.push("chatConfiguration.updateMany");
        return { count: 1 };
      },
    },
    callbackAction: {
      async create() {
        order.push("callbackAction.create");
        return {};
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
    settings: new SettingsService(prisma as never),
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
    settingsDeleteWheres,
    configurationWrites,
    settingsDraft() {
      return settingsRow;
    },
    roleLookups() {
      return order.filter((entry) => entry === "membership");
    },
    async sendText(actorId: bigint, text: string, updateId = 7_001) {
      await bot.handleUpdate({
        update_id: updateId,
        message: {
          message_id: updateId,
          date: 1_784_000_000,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
          from: { id: Number(actorId), is_bot: false, first_name: "Sam" },
          text,
        },
      } as never);
    },
    async sendLocation(actorId: bigint, updateId = 7_002) {
      await bot.handleUpdate({
        update_id: updateId,
        message: {
          message_id: updateId,
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

/**
 * Finding F-10 / broken window 14.
 *
 * The route claims the update (an expired settings-edit row is still route
 * ownership), so it MUST answer. Answering with the setup wizard's sentence is
 * as wrong as answering with silence — the administrator never opened /setup.
 */
describe("expired settings edit on a carrier route", () => {
  it("authorizes, discards only the lapsed row, and answers with settings expiry copy", async () => {
    const harness = createHarness({
      role: () => "administrator",
      settingsDraft: { actor: ADMIN_ID },
    });

    await harness.sendText(ADMIN_ID, "19:30");

    // Ownership probe, then a FRESH role lookup, then cleanup, then one reply.
    expect(harness.order).toStrictEqual([
      "setupDraft.findUnique",
      "settingsEditDraft.findUnique",
      "membership",
      "settingsEditDraft.findUnique",
      "settingsEditDraft.deleteMany",
      "api:sendMessage",
    ]);
    expect(harness.sent).toStrictEqual([
      { method: "sendMessage", text: SETTINGS_EDIT_EXPIRED },
    ]);
    // The setup wizard is never consulted, and its sentence never surfaces.
    expect(harness.order).not.toContain("setup.requireActive");
    expect(harness.sent.map((call) => call.text)).not.toContain(DRAFT_EXPIRED);
    // Committed configuration is untouched by an expiry.
    expect(harness.configurationWrites).toStrictEqual([]);
  });

  it("binds the discard to the observed id, chat, actor and lapsed expiry", async () => {
    const harness = createHarness({
      role: () => "administrator",
      settingsDraft: { actor: ADMIN_ID },
    });

    await harness.sendText(ADMIN_ID, "19:30");

    expect(harness.settingsDeleteWheres).toStrictEqual([
      {
        id: "settings-draft-1",
        chatId: CHAT_ID,
        actorUserId: ADMIN_ID,
        expiresAt: { lte: NOW },
      },
    ]);
    expect(harness.settingsDraft()).toBeNull();
  });

  it("returns to the silent no-in-flight path once the lapsed row is gone", async () => {
    const harness = createHarness({
      role: () => "administrator",
      settingsDraft: { actor: ADMIN_ID },
    });

    await harness.sendText(ADMIN_ID, "19:30", 7_001);
    await harness.sendText(ADMIN_ID, "see you at practice", 7_003);

    // Exactly one reply and one role lookup across BOTH updates: the second
    // update found no row, so it cost neither.
    expect(harness.sent).toStrictEqual([
      { method: "sendMessage", text: SETTINGS_EDIT_EXPIRED },
    ]);
    expect(harness.roleLookups()).toStrictEqual(["membership"]);
  });

  it("keeps the lapsed row intact when the membership lookup cannot be answered", async () => {
    const harness = createHarness({
      role: () => {
        throw new Error("Bad Gateway");
      },
      settingsDraft: { actor: ADMIN_ID },
    });

    await harness.sendText(ADMIN_ID, "19:30");

    // Fail-closed denial, and no destructive cleanup on unanswerable evidence.
    expect(harness.sent.at(-1)?.text).toBe(COMMAND_DENIAL);
    expect(harness.deletions).toStrictEqual([]);
    expect(harness.settingsDraft()).not.toBeNull();
    expect(harness.order).not.toContain("setup.requireActive");
  });
});
