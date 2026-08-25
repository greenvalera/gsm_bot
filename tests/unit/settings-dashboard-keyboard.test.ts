import { describe, expect, it } from "vitest";

import { SettingsField } from "../../src/generated/prisma/client.js";
import { settingsDashboardKeyboard } from "../../src/telegram/keyboards.js";

/**
 * The dashboard keyboard is the ONLY entry point into a settings edit, so a
 * `SettingsField` bound to no button is unreachable by construction — which is
 * exactly how `DAILY_END_MINUTE` became dead code behind a plural label
 * (F-5 / broken window 6). Asserting the two daily rows alone would leave the
 * next field free to repeat it, so the oracle is derived from the enum itself.
 */
function dashboardRows() {
  // Echo the field name back as the callback token, so the serialized keyboard
  // reveals which field each rendered button is actually bound to.
  const keyboard = settingsDashboardKeyboard((field) => field);
  return keyboard.inline_keyboard.map((row) =>
    row.map((button) => ({
      text: button.text,
      field: "callback_data" in button ? button.callback_data : undefined,
    })),
  );
}

function boundFields() {
  return dashboardRows().flatMap((row) => row.map((button) => button.field));
}

describe("settings dashboard keyboard", () => {
  it("binds every SettingsField member to exactly one button", () => {
    const bound = boundFields();
    const expected = Object.values(SettingsField);

    expect([...bound].sort()).toEqual([...expected].sort());
    expect(new Set(bound).size).toBe(bound.length);
  });

  it("gives the daily start and the daily end adjacent rows, in that order, where the combined row used to be", () => {
    const rows = dashboardRows();

    expect(rows.every((row) => row.length === 1)).toBe(true);

    const fields = rows.map((row) => row[0]?.field);
    const dailyStart = fields.indexOf(SettingsField.DAILY_START_MINUTE);
    const dailyEnd = fields.indexOf(SettingsField.DAILY_END_MINUTE);

    expect(dailyStart).toBeGreaterThanOrEqual(0);
    expect(dailyEnd).toBe(dailyStart + 1);
    expect(fields[dailyStart - 1]).toBe(SettingsField.DURATION_MINUTES);
    expect(fields[dailyEnd + 1]).toBe(SettingsField.REMINDER_MINUTES);
  });

  it("keeps every label inside the 24-visible-character cap", () => {
    const labels = dashboardRows().flatMap((row) =>
      row.map((button) => button.text),
    );

    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(Array.from(label).length).toBeLessThanOrEqual(24);
    }
  });
});
