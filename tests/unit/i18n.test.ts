import { describe, expect, it } from "vitest";
import { catalogs, renderMessage } from "../../src/shared/i18n/index.js";
import {
  renderSetupStep,
  renderSetupReview,
  renderSettingsDashboard,
  type CompleteSetupReview,
} from "../../src/telegram/renderers.js";

const complete: CompleteSetupReview = {
  timezone: "Europe/Kyiv",
  defaultWeekday: 1,
  defaultStartMinute: 1170,
  durationMinutes: 120,
  dailyStartMinute: 600,
  dailyEndMinute: 1320,
  reminderMinutes: [600, 960],
  planningAccessPolicy: "ADMINS_ONLY",
};
describe("bilingual pure projections", () => {
  it("has identical nonempty catalogs and preserves Ukrainian encoding", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      Object.keys(catalogs.uk).sort(),
    );
    const sample = {
      step: 1,
      prompt: "🎸",
      minutes: 120,
      value: "Київ",
      label: "Оля",
      timezone: "Europe/Kyiv",
      candidates: "Europe/Kyiv",
      suffix: "1234",
      start: 1,
      end: 2,
      total: 2,
    };
    for (const catalog of Object.values(catalogs)) {
      for (const phrase of Object.values(catalog)) {
        const rendered = (phrase as (data: typeof sample) => string)(sample);
        expect(rendered.trim().length).toBeGreaterThan(0);
        expect(Buffer.from(rendered).toString("utf8")).toBe(rendered);
        expect(rendered).not.toContain("undefined");
      }
    }
  });
  it("renders Ukrainian review and preserves English compatibility", () => {
    expect(renderSetupReview(complete, "uk").text).toContain(
      "Мова: Українська",
    );
    expect(renderSetupReview(complete, "uk").text).toContain(
      "Лише адміністратори",
    );
    expect(renderSetupReview(complete).text).toContain("Review configuration");
    expect(renderSettingsDashboard(complete, "uk").text).toContain(
      "Налаштування чату",
    );
  });
  it.each([
    "timezone",
    "defaultWeekday",
    "defaultStartMinute",
    "durationMinutes",
    "dailyStartMinute",
    "dailyEndMinute",
    "reminderMinutes",
    "planningAccessPolicy",
  ] as const)("renders the current %s step only", (field) => {
    const draft = {
      ...complete,
      [field]: field === "reminderMinutes" ? [] : null,
    };
    expect(renderSetupStep(draft, "uk").text).toContain("Крок");
    expect(renderSetupStep(draft, "uk").text).not.toContain("Review");
    expect(renderSetupStep(draft, "en").text).toContain("Step");
  });
  it("escapes Unicode data exactly once at the projection boundary", () => {
    const text = renderSetupReview(
      { ...complete, timezone: "Київ<&>🎸" },
      "uk",
    ).text;
    expect(text).toContain("Київ&lt;&amp;&gt;🎸");
    expect(text).not.toContain("&amp;lt;");
  });
  it("renders ordinary background payload data without a context", () => {
    expect(renderMessage("uk", "duration.value", { minutes: 120 })).toBe(
      "120 хвилин",
    );
    expect(renderMessage("en", "duration.value", { minutes: 120 })).toBe(
      "120 minutes",
    );
  });
});

// Compile-only misuse checks are deliberately never executed.
function contracts() {
  // @ts-expect-error Unknown message keys are rejected.
  renderMessage("uk", "unknown", undefined);
  // @ts-expect-error Required payload cannot be omitted.
  renderMessage("uk", "duration.value", undefined);
  // @ts-expect-error Numbers must not be supplied as strings.
  renderMessage("uk", "duration.value", { minutes: "120" });
}
void contracts;
