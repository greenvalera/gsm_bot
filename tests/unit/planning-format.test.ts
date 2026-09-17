import { describe, expect, it } from "vitest";
import {
  addDays,
  parseCivilDate,
} from "../../src/infrastructure/time/civil.js";
import {
  dayHeadingLabel,
  dayButtonLabel,
} from "../../src/telegram/planning-renderers.js";

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
