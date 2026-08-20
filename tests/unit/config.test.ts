import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/app/config.js";

const validEnvironment = {
  BOT_TOKEN: "123456:bot-token",
  DATABASE_URL: "postgresql://bot:password@localhost:5432/gsmbot",
};

describe("loadConfig", () => {
  it("returns validated defaults without inferring a test mode", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      botToken: validEnvironment.BOT_TOKEN,
      databaseUrl: validEnvironment.DATABASE_URL,
      logLevel: "info",
      mode: "production",
    });
  });

  it("accepts an explicit smoke mode and log level", () => {
    expect(
      loadConfig({
        ...validEnvironment,
        APP_MODE: "smoke",
        LOG_LEVEL: "debug",
      }),
    ).toMatchObject({ mode: "smoke", logLevel: "debug" });
  });

  it("rejects missing required boot keys by name only", () => {
    expect(() => loadConfig({})).toThrow(
      "Invalid application configuration: BOT_TOKEN, DATABASE_URL",
    );
  });

  it("fails closed without exposing invalid secret values", () => {
    const token = "secret-bot-token";
    const password = "secret-password";

    expect(() =>
      loadConfig({
        BOT_TOKEN: token,
        DATABASE_URL: `https://user:${password}@example.test/not-postgres`,
      }),
    ).toThrow("Invalid application configuration: DATABASE_URL");
    expect(() =>
      loadConfig({
        BOT_TOKEN: token,
        DATABASE_URL: `https://user:${password}@example.test/not-postgres`,
      }),
    ).not.toThrow(token);
    expect(() =>
      loadConfig({
        BOT_TOKEN: token,
        DATABASE_URL: `https://user:${password}@example.test/not-postgres`,
      }),
    ).not.toThrow(password);
  });
});
