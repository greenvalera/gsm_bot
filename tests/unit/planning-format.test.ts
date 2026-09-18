import { describe, expect, it } from "vitest";
import { renderMessage } from "../../src/shared/i18n/index.js";
import {
  formatPlanningUnit,
  formatReminderWeekRange,
} from "../../src/shared/i18n/planning-format.js";
import {
  addDays,
  parseCivilDate,
} from "../../src/infrastructure/time/civil.js";
import {
  dayHeadingLabel,
  dayButtonLabel,
  formatPlanningTimeRange,
} from "../../src/telegram/planning-renderers.js";

describe("reminder civil-week ranges", () => {
  it.each([
    ["2026-09-21", "2026-09-27", "21–27 вересня"],
    ["2026-09-28", "2026-10-04", "28 вересня – 4 жовтня"],
    ["2026-12-28", "2027-01-03", "28 грудня – 3 січня"],
    ["2028-02-28", "2028-03-05", "28 лютого – 5 березня"],
  ])("preserves the week beginning %s in both locales", (start, end, uk) => {
    expect(formatReminderWeekRange("uk", start)).toBe(uk);
    expect(formatReminderWeekRange("en", start)).toBe(`${start} – ${end}`);
  });
});

describe("resolved wall-minute ranges", () => {
  it.each([
    [0, 1, "00:00–00:01"],
    [1380, 1439, "23:00–23:59"],
    [1439, 0, "23:59–00:00"],
    [120, 180, "02:00–03:00"],
  ] as const)("preserves %i to %i exactly", (start, end, expected) => {
    expect(formatPlanningTimeRange(start, end)).toBe(expected);
  });
  it("retains strict whole-minute bounds", () => {
    for (const invalid of [-1, 0.5, 1440])
      expect(() => formatPlanningTimeRange(0, invalid)).toThrow();
  });
});

describe("natural planning duration", () => {
  it.each([
    [0, "годин", "хвилин"],
    [1, "година", "хвилина"],
    [2, "години", "хвилини"],
    [5, "годин", "хвилин"],
    [11, "годин", "хвилин"],
    [14, "годин", "хвилин"],
    [21, "година", "хвилина"],
    [22, "години", "хвилини"],
    [25, "годин", "хвилин"],
    [101, "година", "хвилина"],
    [111, "годин", "хвилин"],
  ] as const)(
    "inflects both units independently at %i",
    (count, hours, minutes) => {
      expect(formatPlanningUnit("uk", count, "hour")).toBe(`${count} ${hours}`);
      expect(formatPlanningUnit("uk", count, "minute")).toBe(
        `${count} ${minutes}`,
      );
      expect(formatPlanningUnit("en", count, "hour")).toBe(
        `${count} hour${count === 1 ? "" : "s"}`,
      );
      expect(formatPlanningUnit("en", count, "minute")).toBe(
        `${count} minute${count === 1 ? "" : "s"}`,
      );
    },
  );
  it.each([
    [0, "0 minutes", "0 хвилин"],
    [59, "59 minutes", "59 хвилин"],
    [60, "1 hour", "1 година"],
    [61, "1 hour 1 minute", "1 година 1 хвилина"],
    [90, "1 hour 30 minutes", "1 година 30 хвилин"],
    [119, "1 hour 59 minutes", "1 година 59 хвилин"],
    [120, "2 hours", "2 години"],
    [121, "2 hours 1 minute", "2 години 1 хвилина"],
  ] as const)("decomposes %i minutes exactly", (minutes, en, uk) => {
    expect(renderMessage("en", "duration.value", { minutes })).toBe(en);
    expect(renderMessage("uk", "duration.value", { minutes })).toBe(uk);
  });
});

describe("planning civil-date presentation", () => {
  it.each(["UTC", "America/Los_Angeles"])(
    "preserves dates in host TZ %s",
    (tz) => {
      const previous = process.env.TZ;
      process.env.TZ = tz;
      try {
        const weekdays = [
          "Понеділок",
          "Вівторок",
          "Середа",
          "Четвер",
          "П’ятниця",
          "Субота",
          "Неділя",
        ];
        const compact = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
        weekdays.forEach((weekday, offset) => {
          const date = addDays(parseCivilDate("2026-09-21"), offset);
          expect(dayHeadingLabel(date, "uk")).toBe(
            `${weekday}, ${21 + offset} вересня`,
          );
          expect(
            dayButtonLabel(
              {
                isoDate: `2026-09-${21 + offset}`,
                weekdayLabel: "Mon",
                dayOfMonth: 21 + offset,
                chosen: true,
                marker: "default",
              } as never,
              "uk",
            ),
          ).toBe(`✅ ⭐ ${compact[offset]} ${21 + offset}`);
        });
        const months = [
          "січня",
          "лютого",
          "березня",
          "квітня",
          "травня",
          "червня",
          "липня",
          "серпня",
          "вересня",
          "жовтня",
          "листопада",
          "грудня",
        ];
        months.forEach((month, index) =>
          expect(
            dayHeadingLabel({ year: 2026, month: index + 1, day: 1 }, "uk"),
          ).toMatch(new RegExp(`, 1 ${month}$`)),
        );
        expect(dayHeadingLabel(parseCivilDate("2028-02-29"), "uk")).toBe(
          "Вівторок, 29 лютого",
        );
        expect(dayHeadingLabel(parseCivilDate("2026-12-31"), "uk")).toBe(
          "Четвер, 31 грудня",
        );
        expect(dayHeadingLabel(parseCivilDate("2027-01-01"), "uk")).toBe(
          "П’ятниця, 1 січня",
        );
        expect(dayHeadingLabel(parseCivilDate("2026-09-21"), "en")).toBe(
          "Mon 21 Sep",
        );
      } finally {
        if (previous === undefined) delete process.env.TZ;
        else process.env.TZ = previous;
      }
    },
  );
});
