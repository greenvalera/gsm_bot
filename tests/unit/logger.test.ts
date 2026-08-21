import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger, REDACTED } from "../../src/shared/logger.js";

const BOT_TOKEN = "8130947265:AAF9tQ2xHhV0nbLpQ7c1KzY-3wRmS4dJeUo";
const DATABASE_URL = "postgresql://gsmbot:sup3r-s3cret@db.internal:5432/gsmbot";

/** Representative sensitive payloads a Phase 1 handler could be tempted to log. */
const LOCATION_UPDATE = {
  update_id: 884_213_907,
  message: {
    message_id: 4821,
    from: {
      id: 5_512_338_901,
      is_bot: false,
      first_name: "Oksana",
      last_name: "Kovalenko",
      username: "oksana_bass",
      language_code: "uk",
    },
    chat: { id: -1_002_233_445_566, type: "supergroup", title: "Band studio" },
    location: { latitude: 50.4501, longitude: 30.5234 },
  },
};

const CALLBACK_TOKEN = "v1:2f7c9d1e-4a6b-4c8d-9e0f-1a2b3c4d5e6f";

const SETUP_DRAFT = {
  timeZone: "Europe/Kyiv",
  defaultWeekday: 3,
  defaultStartMinute: 1_140,
  durationMinutes: 120,
  earliestMinute: 540,
  latestMinute: 1_320,
  firstReminderMinute: 600,
  secondReminderMinute: 960,
};

const ROSTER_IDENTITY = [
  {
    telegramUserId: 5_512_338_901n,
    firstName: "Oksana",
    lastName: "Kovalenko",
    username: "oksana_bass",
  },
  {
    telegramUserId: 7_781_002_344n,
    firstName: "Danylo",
    lastName: "Marchenko",
    username: "dan_drums",
  },
];

function createSink() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: unknown, _encoding: unknown, callback: () => void) {
      chunks.push(String(chunk));
      callback();
    },
  });

  return {
    stream,
    text: () => chunks.join(""),
    entries: () =>
      chunks
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function firstEntry(sink: ReturnType<typeof createSink>) {
  const [entry] = sink.entries();
  if (entry === undefined) {
    throw new Error("expected the logger to write exactly one JSON line");
  }
  return entry;
}

function createTestLogger() {
  const sink = createSink();
  const logger = createLogger({
    level: "trace",
    secrets: [BOT_TOKEN, DATABASE_URL],
    destination: sink.stream,
  });

  return { logger, sink };
}

describe("createLogger", () => {
  it("writes no secret, raw update, coordinate, callback, draft, or roster identity value", () => {
    const { logger, sink } = createTestLogger();

    logger.error(
      {
        botToken: BOT_TOKEN,
        databaseUrl: DATABASE_URL,
        update: LOCATION_UPDATE,
        latitude: LOCATION_UPDATE.message.location.latitude,
        longitude: LOCATION_UPDATE.message.location.longitude,
        callbackData: CALLBACK_TOKEN,
        draft: SETUP_DRAFT,
        roster: ROSTER_IDENTITY,
        from: LOCATION_UPDATE.message.from,
      },
      "Setup location step failed",
    );

    const text = sink.text();
    const forbidden = [
      BOT_TOKEN,
      DATABASE_URL,
      "sup3r-s3cret",
      "50.4501",
      "30.5234",
      CALLBACK_TOKEN,
      "2f7c9d1e",
      "Europe/Kyiv",
      "Oksana",
      "Kovalenko",
      "oksana_bass",
      "Danylo",
      "dan_drums",
      "5512338901",
      "Band studio",
    ];

    for (const value of forbidden) {
      expect(text).not.toContain(value);
    }

    const entry = firstEntry(sink);
    expect(entry).toMatchObject({
      botToken: REDACTED,
      databaseUrl: REDACTED,
      update: REDACTED,
      latitude: REDACTED,
      longitude: REDACTED,
      callbackData: REDACTED,
      draft: REDACTED,
      roster: REDACTED,
      from: REDACTED,
      msg: "Setup location step failed",
    });
  });

  it("retains bounded diagnostic identifiers and action kinds", () => {
    const { logger, sink } = createTestLogger();

    logger.info(
      {
        chatId: -1_002_233_445_566,
        actorId: 5_512_338_901n,
        updateId: 884_213_907,
        actionKind: "CONFIRM_TIME_ZONE",
        revision: 4,
        outcome: "denied",
      },
      "Callback denied",
    );

    const entry = firstEntry(sink);
    expect(entry).toMatchObject({
      chatId: -1_002_233_445_566,
      actorId: "5512338901",
      updateId: 884_213_907,
      actionKind: "CONFIRM_TIME_ZONE",
      revision: 4,
      outcome: "denied",
      msg: "Callback denied",
    });
    expect(entry).not.toHaveProperty("pid");
    expect(entry).not.toHaveProperty("hostname");
  });

  it("scrubs secrets embedded in a message, an error message, and a child binding", () => {
    const { logger, sink } = createTestLogger();

    logger
      .child({ chatId: -1_002_233_445_566, username: "oksana_bass" })
      .error(
        { err: new Error(`connect ECONNREFUSED ${DATABASE_URL}`) },
        `Prisma pool failed for ${DATABASE_URL} using ${BOT_TOKEN}`,
      );

    const text = sink.text();
    expect(text).not.toContain(DATABASE_URL);
    expect(text).not.toContain(BOT_TOKEN);
    expect(text).not.toContain("oksana_bass");

    const entry = firstEntry(sink);
    expect(entry).toMatchObject({
      chatId: -1_002_233_445_566,
      username: REDACTED,
      err: { name: "Error", message: `connect ECONNREFUSED ${REDACTED}` },
    });
    expect(entry.msg).toBe(
      `Prisma pool failed for ${REDACTED} using ${REDACTED}`,
    );
  });

  it("scrubs unregistered secrets that match a token or connection-URL shape", () => {
    const { logger, sink } = createTestLogger();
    const otherToken = "1234567890:BBGdlEvZmc7Yq1sTnRxWpKhLuA0iJfOe4Xz";
    const otherUrl = "postgres://other:hunter2@10.0.0.4:5432/somedb";

    logger.warn(
      { reason: `rotated to ${otherToken}`, err: new Error(otherUrl) },
      `fallback to ${otherUrl}`,
    );

    const text = sink.text();
    expect(text).not.toContain(otherToken);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("BBGdlEvZmc7Yq1sTnRxWpKhLuA0iJfOe4Xz");
  });

  it("bounds a retained string value so an allowed key cannot smuggle a payload", () => {
    const { logger, sink } = createTestLogger();

    logger.info({ reason: "x".repeat(500) }, "bounded");

    const entry = firstEntry(sink);
    expect(String(entry.reason)).toHaveLength(123);
    expect(String(entry.reason).endsWith("...")).toBe(true);
  });

  it("redacts a non-Error throw value instead of serializing it", () => {
    const { logger, sink } = createTestLogger();

    logger.error({ err: LOCATION_UPDATE }, "Unhandled Telegram update error");

    const entry = firstEntry(sink);
    expect(entry.err).toBe(REDACTED);
    expect(sink.text()).not.toContain("Oksana");
  });
});
