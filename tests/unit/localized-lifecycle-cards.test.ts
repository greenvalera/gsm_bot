import { describe, expect, it } from "vitest";
import type { AvailabilityStepProjection } from "../../src/domain/planning/planning-service.js";
import { renderReadyAnnouncement, renderBlockedAnnouncement, renderRetractedAnnouncement, renderBookingConfirmation, renderCancellationConfirmation, renderChangeConfirmation, renderCancellationNotice, renderSupersededAttemptLine, renderRetiredPlanningMessage } from "../../src/telegram/planning-renderers.js";

const noTokens = () => undefined;
const round = { selectedDate: "2026-08-27", selectedStartMinute: 600 };
const projection: AvailabilityStepProjection = {
  selectedDate: "2026-08-27", startMinute: 600, durationMinutes: 120,
  participants: [{ membershipId: "1", telegramUserId: 123456789n, firstName: "Оля <&>", lastName: null, username: null, marker: "unavailable" }],
  answeredCount: 1, totalCount: 1, outcome: "blocked", booked: false,
};

describe.each(["en", "uk"] as const)("lifecycle cards in %s", (locale) => {
  it("distinguishes readiness, blocked and retracted facts with safe names", () => {
    const ready = renderReadyAnnouncement(projection, noTokens, locale).text;
    const blocked = renderBlockedAnnouncement(projection, noTokens, locale).text;
    const retracted = renderRetractedAnnouncement(projection, locale).text;
    expect(ready).toContain(locale === "uk" ? "Усі можуть! Час бронювати репетицію." : "Time to book the rehearsal.");
    expect(blocked).toContain(locale === "uk" ? "Цей час підходить не всім. Обери іншу дату й час." : "This slot does not work");
    expect(blocked).toContain(locale === "uk" ? "Не можуть: Оля &lt;&amp;&gt;." : "Cannot attend: Оля &lt;&amp;&gt;.");
    expect(retracted).toContain(locale === "uk" ? "Попереднє оголошення вже не актуальне" : "The earlier announcement no longer stands");
    for (const text of [ready, blocked, retracted]) {
      expect(text).toContain(locale === "uk" ? "Четвер, 27 серпня" : "Thu 27 Aug");
      expect(text).toContain("10:00–12:00");
      expect(text).not.toContain("&amp;lt;");
    }
  });
  it("asks about an external booking and records it without attribution", () => {
    const prompt = renderBookingConfirmation(projection, noTokens, locale).text;
    expect(prompt).toContain(locale === "uk" ? "Студію вже заброньовано на цей час?" : "Only confirm if the band has already booked this slot with the studio.");
    expect(prompt).toContain("10:00–12:00");
    const booked = renderBookingConfirmation({ ...projection, booked: true }, noTokens, locale);
    expect(booked.text).toContain(locale === "uk" ? "Студію заброньовано" : "Rehearsal booked");
    expect(booked.text).not.toContain("Оля");
    expect(booked.keyboard.inline_keyboard.flat()).toEqual([]);
  });
  it("keeps cancellation, successor and retired-copy recovery distinct", () => {
    expect(renderCancellationConfirmation(round, noTokens, locale).text).toContain(locale === "uk" ? "Репетицію буде скасовано." : "The rehearsal will be called off.");
    expect(renderChangeConfirmation(round, noTokens, locale).text).toContain(locale === "uk" ? "Усі відповідатимуть знову в межах того самого тижня." : "Everyone will answer again within the same week.");
    expect(renderCancellationNotice(round, projection.participants, locale).text).toContain(locale === "uk" ? "Репетицію скасовано." : "This rehearsal was cancelled.");
    expect(renderSupersededAttemptLine(round, locale).text).toContain(locale === "uk" ? "переплановано" : "was replanned");
    const retired = renderRetiredPlanningMessage(round, locale).text;
    expect(retired).toContain(locale === "uk" ? "Ця копія вже не актуальна." : "This copy is no longer current.");
    expect(retired).toContain("/plan_status");
    expect(retired).not.toMatch(/скасовано|заброньовано|cancelled|booked/);
  });
  it("localizes incomplete slots and masked identities", () => {
    const empty = { selectedDate: null, selectedStartMinute: null };
    expect(renderCancellationConfirmation(empty, noTokens, locale).text).toContain(locale === "uk" ? "план репетиції" : "the rehearsal plan");
    expect(renderSupersededAttemptLine(empty, locale).text).toContain(locale === "uk" ? "Попередню спробу планування" : "The previous planning attempt");
    const unknown = { ...projection.participants[0]!, firstName: null };
    expect(renderCancellationNotice(round, [unknown], locale).text).toContain(locale === "uk" ? "Користувач Telegram ••••6789" : "Telegram user ••••6789");
  });
});
