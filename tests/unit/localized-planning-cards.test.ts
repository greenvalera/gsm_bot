import { describe, expect, it } from "vitest";
import {
  buildDayStepProjection,
  buildTimeStepProjection,
  availabilityOutcome,
  type AvailabilityStepProjection,
  type ParticipantMarker,
} from "../../src/domain/planning/planning-service.js";
import { parseCivilDate } from "../../src/infrastructure/time/civil.js";
import {
  renderDayStep,
  renderTimeStep,
  renderReviewStep,
  renderAvailabilityCard,
} from "../../src/telegram/planning-renderers.js";

const owner = {
  telegramUserId: 123456789n,
  firstName: null,
  lastName: null,
  username: null,
};
const member = (id: number, name: string | null = "Оля <&>") => ({
  membershipId: String(id),
  telegramUserId: BigInt(id),
  firstName: name,
  lastName: null,
  username: null,
});
const noTokens = () => undefined;
const day = buildDayStepProjection({
  targetWeekStart: "2026-08-24",
  today: parseCivilDate("2026-08-24"),
  defaultWeekday: 4,
  previousRehearsalDate: "2026-08-20",
  selectedDate: "2026-08-27",
  owner,
});
const time = buildTimeStepProjection({
  selectedDate: "2026-08-27",
  timezone: "Europe/Kyiv",
  now: new Date("2026-08-24T09:00:00Z"),
  window: { dailyStartMinute: 600, dailyEndMinute: 1260, durationMinutes: 120 },
  defaultStartMinute: 600,
  previousRehearsalStartMinute: 600,
  selectedStartMinute: 600,
  owner,
});
const review = {
  selectedDate: "2026-08-27",
  startMinute: 600,
  durationMinutes: 120,
  members: [member(1)],
  owner,
};
function availability(
  markers: readonly ParticipantMarker[],
): AvailabilityStepProjection {
  const participants = markers.map((marker, i) => ({
    ...member(i + 1),
    marker,
  }));
  return {
    ...review,
    participants,
    answeredCount: markers.filter((m) => m !== "pending").length,
    totalCount: markers.length,
    outcome: availabilityOutcome(participants),
    booked: false,
  };
}

describe.each(["en", "uk"] as const)(
  "localized planning cards in %s",
  (locale) => {
    it("localizes all four card headings and safely masks the organizer", () => {
      const cards = [
        renderDayStep(day, noTokens, noTokens, locale),
        renderTimeStep(time, noTokens, noTokens, locale),
        renderReviewStep(review, noTokens, locale),
        renderAvailabilityCard(availability(["pending"]), noTokens, locale),
      ];
      const headings =
        locale === "uk"
          ? [
              "Заплануй репетицію — тиждень",
              "Заплануй репетицію — Четвер",
              "Підтвердь репетицію",
              "Репетицію підтверджено",
            ]
          : [
              "Plan a rehearsal — week",
              "Plan a rehearsal — Thu",
              "Confirm the rehearsal",
              "Rehearsal confirmed",
            ];
      cards.forEach((card, i) => {
        expect(card.text).toContain(headings[i]);
        expect(card.text).toContain(
          locale === "uk"
            ? "Організатор: Користувач Telegram ••••6789"
            : "Planned by Telegram user ••••6789.",
        );
        expect(card.text).not.toContain("123456789");
        expect(card.text).not.toContain("&amp;lt;");
      });
      expect(cards[2]!.text).toContain("Оля &lt;&amp;&gt;");
    });
    it("retains tied marker precedence, chosen marker, and separate adjacent slots", () => {
      const card = renderDayStep(day, (d) => `v1:${d}`, noTokens, locale);
      expect(card.keyboard.inline_keyboard.map((r) => r.length)).toEqual([
        4, 3,
      ]);
      expect(card.keyboard.inline_keyboard.flat()[3]!.text).toMatch(/^✅ ⭐ /);
      expect(card.text).toContain(
        locale === "uk" ? "звичний день" : "usual day",
      );
      expect(card.text).not.toContain(
        locale === "uk" ? "минула репетиція" : "last rehearsal",
      );
      expect(card.text).toContain(
        locale === "uk" ? "твій поточний вибір" : "your current choice",
      );
      const hours = renderTimeStep(time, (n) => `v1:${n}`, noTokens, locale);
      expect(
        hours.keyboard.inline_keyboard
          .flat()
          .slice(0, 2)
          .map((b) => b.text),
      ).toEqual(["✅ ⭐ 10:00", "11:00"]);
      expect(hours.text).toContain(
        locale === "uk" ? "звичний час" : "usual time",
      );
    });
    it("renders empty windows and empty roster without inventing controls", () => {
      const empty = renderTimeStep(
        { ...time, slots: [] },
        noTokens,
        noTokens,
        locale,
      );
      expect(empty.text).toContain(
        locale === "uk" ? "Жодна репетиція не вміщується" : "No rehearsal fits",
      );
      expect(empty.keyboard.inline_keyboard.flat()).toEqual([]);
      const card = renderReviewStep(
        { ...review, members: [] },
        noTokens,
        locale,
      );
      expect(card.text).toContain(
        locale === "uk"
          ? "У складі гурту ще нікого немає"
          : "Nobody is on the band roster yet",
      );
      expect(card.keyboard.inline_keyboard.flat()).toEqual([]);
      expect(
        renderAvailabilityCard(
          availability([]),
          noTokens,
          locale,
        ).keyboard.inline_keyboard.flat(),
      ).toEqual([]);
    });
    it("uses state legends and outcome facts with exact counts", () => {
      const card = renderAvailabilityCard(
        availability(["pending", "available", "unavailable"]),
        noTokens,
        locale,
      );
      for (const phrase of locale === "uk"
        ? [
            "Очікуємо відповідь",
            "Може",
            "Не може",
            "Відповіли 2 з 3",
            "Цей час підходить не всім",
            "Не можуть прийти:",
          ]
        : [
            "no answer yet",
            "can attend",
            "cannot attend",
            "Answered 2 of 3",
            "This slot doesn't work",
            "Cannot attend:",
          ])
        expect(card.text).toContain(phrase);
      expect(
        renderAvailabilityCard(availability(["available"]), noTokens, locale)
          .text,
      ).toContain(
        locale === "uk" ? "Усі можуть прийти." : "Everyone can make it.",
      );
      expect(
        renderAvailabilityCard(availability([]), noTokens, locale).text,
      ).toContain(
        locale === "uk"
          ? "Ще збираємо відповіді."
          : "Answers are still coming in.",
      );
      expect(
        renderAvailabilityCard(
          { ...availability(["available"]), booked: true },
          noTokens,
          locale,
        ).text,
      ).toContain(
        locale === "uk"
          ? "Цю репетицію заброньовано."
          : "This rehearsal is booked.",
      );
      expect(
        renderAvailabilityCard(
          { ...availability(["available"]), cancelled: true },
          noTokens,
          locale,
        ).text,
      ).toContain(
        locale === "uk"
          ? "Цю репетицію скасовано."
          : "This rehearsal was cancelled.",
      );
    });
    it.each([0, 1, 2, 5, 11, 14, 21, 22, 25, 101, 111])(
      "renders %i members truthfully",
      (total) => {
        const members = Array.from({ length: total }, (_, i) =>
          member(i + 1, "Оля"),
        );
        const card = renderReviewStep({ ...review, members }, noTokens, locale);
        if (locale === "uk" && total > 0)
          expect(card.text).toContain(`Учасників, яких запитаємо: ${total}`);
        if (locale === "en" && total > 1)
          expect(card.text).toContain(`these ${total} band members`);
        expect(
          card.text.split("\n").filter((l) => l.startsWith("• ")),
        ).toHaveLength(total);
        const answers = renderAvailabilityCard(
          availability(members.map(() => "available")),
          noTokens,
          locale,
        );
        expect(answers.text).toContain(
          locale === "uk"
            ? `Відповіли ${total} з ${total}.`
            : `Answered ${total} of ${total}.`,
        );
      },
    );
    it("keeps equal-label ties and snapshot display order stable across locales", () => {
      const participants = [
        { ...member(91, "ada"), marker: "pending" as const },
        { ...member(42, "Ada"), marker: "available" as const },
        { ...owner, marker: "pending" as const },
      ];
      const projection = {
        ...availability([]),
        participants,
        totalCount: 3,
        answeredCount: 1,
      };
      const card = renderAvailabilityCard(projection, noTokens, locale);
      expect(card.text.indexOf("👍 Ada")).toBeLessThan(
        card.text.indexOf(" ada\n"),
      );
      expect(projection.participants).toEqual(participants);
    });
  },
);
