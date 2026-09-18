import assert from "node:assert/strict";
import { catalogs, renderMessage } from "./index.js";

/** Runs without application configuration, database, Telegram or dev dependencies. */
export function verifyRuntime(candidate: unknown = catalogs): void {
  assert(candidate !== null && typeof candidate === "object");
  const pair = candidate as Record<string, unknown>;
  for (const locale of ["en", "uk"] as const) {
    const catalog = pair[locale];
    assert(
      catalog !== null && typeof catalog === "object",
      `${locale} catalog`,
    );
    const entries = Object.entries(catalog);
    assert(entries.length > 0, `${locale} empty catalog`);
    for (const [key, entry] of entries) {
      assert.equal(
        typeof entry,
        "function",
        `${locale}.${key} is not callable`,
      );
    }
  }
  assert.deepEqual(
    Object.keys(pair.en as object).sort(),
    Object.keys(pair.uk as object).sort(),
  );
  for (const locale of ["en", "uk"] as const) {
    for (const output of [
      renderMessage(locale, "reminder.planning.body", {
        weekRange: "21–27 вересня",
      }),
      renderMessage(locale, "reminder.followup.heading", {
        date: "понеділок, 21 вересня",
        range: "19:00–21:00",
        timezone: "Europe/Kyiv",
        startTime: "19:00",
        durationMinutes: 120,
      }),
      renderMessage(locale, "planning.answered", { value: 2, total: 5 }),
    ])
      assert(output.trim().length > 0 && !output.includes("undefined"));
  }
  assert(Intl.DateTimeFormat.supportedLocalesOf(["uk-UA"]).length > 0);
  const date = new Intl.DateTimeFormat("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  assert(date.resolvedOptions().locale.startsWith("uk"));
  const sample = new Date("2026-09-21T19:00:00Z");
  assert(date.format(sample).includes("вересня"));
  assert(date.format(sample).includes("понеділок"));
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  });
  assert.equal(time.resolvedOptions().hourCycle, "h23");
  assert.equal(time.format(sample), "19:00");
  const rules = new Intl.PluralRules("uk");
  assert(rules.resolvedOptions().locale.startsWith("uk"));
  for (const [value, category] of [
    [0, "many"],
    [1, "one"],
    [2, "few"],
    [5, "many"],
    [11, "many"],
    [14, "many"],
    [21, "one"],
    [22, "few"],
    [25, "many"],
    [101, "one"],
    [111, "many"],
  ] as const)
    assert.equal(rules.select(value), category, `uk plural ${value}`);
}

verifyRuntime();
