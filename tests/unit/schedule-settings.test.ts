import { describe, expect, it } from "vitest";

import {
  formatLocalTime,
  parseLocalTime,
  validateSchedule,
} from "../../src/domain/chat/schedule-validator.js";
import { SETUP_WEEKDAY_BUTTONS } from "../../src/telegram/keyboards.js";
import { renderSetupStep } from "../../src/telegram/renderers.js";

describe("schedule settings", () => {
  it("parses and formats only strict zero-padded 24-hour local times", () => {
    expect(parseLocalTime("00:00")).toBe(0);
    expect(parseLocalTime("19:30")).toBe(1170);
    expect(formatLocalTime(1170)).toBe("19:30");
    expect(() => parseLocalTime("9:30")).toThrow();
    expect(() => parseLocalTime("24:00")).toThrow();
    expect(() => parseLocalTime("19:30 ")).toThrow();
  });

  it("rejects exact schedule boundary conflicts", () => {
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toEqual({ valid: true });
    expect(
      validateSchedule({
        defaultStartMinute: 1081,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 0,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 120,
        dailyStartMinute: 1200,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
  });

  it("renders weekday choices in four-and-three rows and advances to strict default-start input", () => {
    expect(SETUP_WEEKDAY_BUTTONS.map((row) => row.map((button) => button.text))).toEqual([
      ["Mon", "Tue", "Wed", "Thu"],
      ["Fri", "Sat", "Sun"],
    ]);
    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: null,
        durationMinutes: null,
        dailyStartMinute: null,
        dailyEndMinute: null,
        reminderMinutes: [],
        planningAccessPolicy: null,
      }),
    ).toMatchObject({
      text: expect.stringContaining("Step 3 of 8"),
    });
  });

  it("renders default reminders and administrators-only planning access until explicitly changed", () => {
    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [],
        planningAccessPolicy: null,
      }).text,
    ).toContain("10:00 and 16:00");

    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: null,
      }).text,
    ).toContain("Step 8 of 8");
  });
});
