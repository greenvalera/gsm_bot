import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import { createBot } from "../../src/app/create-bot.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import { CHAT_READINESS_ROUTES } from "../../src/telegram/handlers.js";
import { createLogger } from "../../src/shared/logger.js";

/**
 * NON-VACUITY GUARD for the Telegram update path.
 *
 * THE ORDER OF THE ASSERTIONS IN THIS FILE IS THE POINT OF THIS FILE.
 *
 * Finding F-4 was not that the redactor leaked. It was that the update path
 * emitted NOTHING, so the live check "grep the logs for raw coordinates —
 * returns nothing" was a universally-quantified claim over an EMPTY SET:
 * vacuously true, and exactly as true if the redactor were entirely broken.
 * A negative grep can only mean something once something is known to be there.
 *
 * So the positive existential is asserted FIRST, and every absence assertion
 * below re-asserts it before making any negative claim. A future change that
 * silences the update path must fail this file loudly rather than pass it
 * quietly.
 *
 * The absence claims match on the CONCRETE values the fixture sent — this
 * latitude, this longitude, this IANA zone — not on field names. Matching on
 * field names would let the test pass merely because a key was renamed, which
 * is the same class of false negative all over again.
 */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

const CHAT_ID = -1004000000021n;
const ADMIN_ID = 4201n;
const NOW = new Date("2026-08-25T09:00:00.000Z");
const DRAFT_ID = "draft-21";

/**
 * The concrete values the absence assertions match against. They must be
 * distinctive enough that an accidental substring match is implausible.
 */
const LATITUDE = 50.4501;
const LONGITUDE = 30.5234;
const RESOLVED_ZONE = "Europe/Kyiv";

/** A well-formed opaque token, so the boundary reaches the durable lookup. */
const STALE_TOKEN = "v1:11111111-2222-3333-4444-555555555555";

/** Every route identifier the bot is allowed to name, from the one table. */
const ROUTE_VOCABULARY = new Set(
  CHAT_READINESS_ROUTES.map((route) => route.id),
);

type LogLine = Record<string, unknown>;

type HarnessOptions = Readonly<{
  /** A stale (already lapsed, still correctly bound) action row to serve. */
  staleAction?: boolean;
}>;

function createHarness(options: HarnessOptions = {}) {
  const written: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) written.push(line);
        }
      },
    },
  });

  const setupDraftRow = {
    id: DRAFT_ID,
    chatId: CHAT_ID,
    actorUserId: ADMIN_ID,
    timezone: null,
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
  };

  const staleActionRow = {
    token: STALE_TOKEN,
    kind: CallbackActionKind.START_SETUP,
    chatId: CHAT_ID,
    actorUserId: ADMIN_ID,
    targetId: DRAFT_ID,
    // Already lapsed, so the boundary terminates on its stale branch.
    expiresAt: new Date(NOW.getTime() - 60_000),
    consumedAt: null,
  };

  const prisma = {
    setupDraft: {
      async findUnique() {
        return setupDraftRow;
      },
      async delete() {
        return setupDraftRow;
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    settingsEditDraft: {
      async findUnique() {
        return null;
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    callbackAction: {
      async create() {
        return staleActionRow;
      },
      async findUnique() {
        return options.staleAction === true ? staleActionRow : null;
      },
    },
  };

  const bot = createBot({
    botToken: "123456:TEST_TOKEN",
    botInfo: BOT_INFO,
    prisma: prisma as never,
    now: () => NOW,
    membershipGateway: {
      async getCurrentRole() {
        return "administrator";
      },
    },
    // The resolver genuinely returns a zone, and that zone genuinely reaches a
    // chat message below — which is what makes its absence from the logs a real
    // claim rather than an accident of the fixture.
    timezoneResolver: {
      async resolve() {
        return { kind: "resolved", candidate: RESOLVED_ZONE };
      },
    } as never,
    logger,
  });

  const sent: string[] = [];
  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    _method: string,
    payload: Record<string, unknown>,
  ) => {
    sent.push(String(payload.text ?? ""));
    return {
      ok: true,
      result: {
        message_id: 601,
        date: 1_784_000_000,
        chat: { id: Number(CHAT_ID), type: "supergroup" },
        text: payload.text ?? "",
      },
    };
  }) as never);

  return {
    sent,
    /** The raw captured lines, exactly as they were written to the sink. */
    raw() {
      return written;
    },
    lines(): LogLine[] {
      return written.map((line) => JSON.parse(line) as LogLine);
    },
    async shareLocation() {
      await bot.handleUpdate({
        update_id: 8_001,
        message: {
          message_id: 8_001,
          date: 1_784_000_000,
          chat: { id: Number(CHAT_ID), type: "supergroup", title: "Test band" },
          from: { id: Number(ADMIN_ID), is_bot: false, first_name: "Ada" },
          location: { latitude: LATITUDE, longitude: LONGITUDE },
        },
      } as never);
    },
    async tapStaleButton() {
      await bot.handleUpdate({
        update_id: 8_002,
        callback_query: {
          id: "callback-8002",
          from: { id: Number(ADMIN_ID), is_bot: false, first_name: "Ada" },
          chat_instance: "instance-8002",
          data: STALE_TOKEN,
          message: {
            message_id: 8_000,
            date: 1_784_000_000,
            chat: {
              id: Number(CHAT_ID),
              type: "supergroup",
              title: "Test band",
            },
            from: { id: BOT_INFO.id, is_bot: true, first_name: "GSMBot" },
            text: "Setup",
          },
        },
      } as never);
    },
  };
}

describe("update path logging", () => {
  // ── 1. POSITIVE EXISTENTIAL — asserted before any absence claim ──────────
  it("emits at least one line carrying an update identifier and a bounded route identifier", async () => {
    const harness = createHarness();

    await harness.shareLocation();

    const lines = harness.lines();
    // If this fails, every negative assertion below is vacuous. That is F-4.
    expect(lines.length).toBeGreaterThan(0);

    const routeRecords = lines.filter(
      (line) => line.updateId !== undefined && line.route !== undefined,
    );
    expect(routeRecords.length).toBeGreaterThan(0);
    expect(routeRecords[0]?.updateId).toBe(8_001);
    expect(routeRecords[0]?.route).toBe("update:message:location");
  });

  it("emits the one-line-per-update route record at the default configured level", async () => {
    const written: string[] = [];
    const logger = createLogger({
      // The DEFAULT level, not debug: a record only visible at debug would not
      // exist in a production log, which is where F-4 was found.
      destination: {
        write(chunk: string) {
          for (const line of chunk.split("\n")) {
            if (line.trim().length > 0) written.push(line);
          }
        },
      },
    });
    expect(logger.level).toBe("info");

    logger.info(
      { event: "telegram.route", route: "update:message:text", updateId: 1 },
      "Handled Telegram update",
    );
    logger.debug({ event: "telegram.route.detail" }, "detail");

    expect(written).toHaveLength(1);
    expect((JSON.parse(written[0] ?? "{}") as LogLine).route).toBe(
      "update:message:text",
    );
  });

  // ── 2. ABSENCE — only now, and only against concrete fixture values ──────
  it("never lets the shared coordinates or the resolved zone reach a log line", async () => {
    const harness = createHarness();

    await harness.shareLocation();

    const captured = harness.raw();
    // The existential, re-asserted here so this test cannot pass vacuously
    // even if it is ever run in isolation or reordered.
    expect(captured.length).toBeGreaterThan(0);

    // The zone really was computed and really did reach the chat, so its
    // absence from the logs below is a claim about the logs, not the fixture.
    expect(harness.sent.some((text) => text.includes(RESOLVED_ZONE))).toBe(
      true,
    );

    const haystack = captured.join("\n");
    expect(haystack).not.toContain(String(LATITUDE));
    expect(haystack).not.toContain(String(LONGITUDE));
    expect(haystack).not.toContain(RESOLVED_ZONE);
    // The truncated forms an over-eager formatter might produce.
    expect(haystack).not.toContain("50.45");
    expect(haystack).not.toContain("30.52");
    expect(haystack).not.toContain("Kyiv");
  });

  it("identifies the stale callback branch by its own outcome and reason", async () => {
    const harness = createHarness({ staleAction: true });

    await harness.tapStaleButton();

    const lines = harness.lines();
    expect(lines.length).toBeGreaterThan(0);

    const stale = lines.filter(
      (line) =>
        line.outcome === "stale" && line.reason === "stale-or-mis-bound-action",
    );
    expect(stale).toHaveLength(1);
    expect(stale[0]?.event).toBe("telegram.callback");
    expect(stale[0]?.updateId).toBe(8_002);
    expect(stale[0]?.callbackKind).toBe(CallbackActionKind.START_SETUP);
    // Identifiers survive redaction only as scalars; a bigint is stringified.
    expect(stale[0]?.chatId).toBe(CHAT_ID.toString());
    // The opaque token is never a log field.
    expect(harness.raw().join("\n")).not.toContain(STALE_TOKEN);
  });

  it("only ever names routes that are members of the declared route table", async () => {
    const harness = createHarness({ staleAction: true });

    await harness.shareLocation();
    await harness.tapStaleButton();

    const emitted = harness
      .lines()
      .map((line) => line.route)
      .filter((route): route is string => typeof route === "string");

    expect(emitted.length).toBeGreaterThan(0);
    for (const route of emitted) {
      expect(ROUTE_VOCABULARY).toContain(route);
    }
  });
});
