import { describe, expect, it } from "vitest";
import { catalogs, renderMessage } from "../../src/shared/i18n/index.js";
import {
  catalogSamples,
  validateCatalog,
} from "../fixtures/catalog-samples.js";
import * as identities from "../../src/telegram/roster-renderers.js";
import {
  renderSetupStep,
  renderSetupReview,
  renderSettingsDashboard,
  renderSettingsEditPrompt,
  renderSettingsReview,
  type CompleteSetupReview,
} from "../../src/telegram/renderers.js";
import {
  settingsDashboardKeyboard,
  settingsReviewKeyboard,
  planningAccessKeyboard,
} from "../../src/telegram/keyboards.js";

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
  it("keeps fixed planning alerts inside Telegram's UTF-16 budget in both catalogs", () => {
    for (const catalog of Object.values(catalogs)) {
      for (const [key, phrase] of Object.entries(catalog)) {
        if (!key.startsWith("planning.feedback.") || key.endsWith("ownerOnly"))
          continue;
        const text = (phrase as () => string)();
        expect(text.length, key).toBeLessThanOrEqual(200);
        expect(text.isWellFormed(), key).toBe(true);
      }
    }
    expect(renderMessage("uk", "planning.feedback.replanned", undefined)).toBe(
      "Планування вже змінилося. Поточний стан — /plan_status.",
    );
  });
  it("exports plain localized identities without HTML encoding or full numeric IDs", () => {
    const unknown = {
      telegramUserId: 123456789n,
      firstName: null,
      lastName: null,
      username: null,
    };
    expect(identities.localizedPlainMemberLabel(unknown, "uk")).toBe(
      "Користувач Telegram ••••6789",
    );
    expect(identities.localizedPlainMemberLabel(unknown, "en")).toBe(
      identities.plainMemberLabel(unknown),
    );
    const hostile = { ...unknown, firstName: "𝄞".repeat(64) + " <&>" };
    expect(identities.localizedPlainMemberLabel(hostile, "uk")).toBe(
      hostile.firstName,
    );
    expect(identities.localizedMemberLabel(hostile, "uk")).toContain(
      "&lt;&amp;&gt;",
    );
    expect(identities.localizedMemberLabel(hostile, "uk")).not.toContain(
      "&amp;lt;",
    );
  });
  it.each(["en", "uk"] as const)(
    "uses explicit %s for background settings and keyboard projections",
    (locale) => {
      const token = () => "v1:opaque";
      expect(
        renderSettingsEditPrompt("DURATION_MINUTES", complete, locale).text,
      ).toContain(renderMessage(locale, "field.DURATION_MINUTES", undefined));
      expect(
        renderSettingsReview("DURATION_MINUTES", 120, 150, locale).text,
      ).toContain(renderMessage(locale, "settings.review", undefined));
      expect(
        JSON.stringify(settingsDashboardKeyboard(token, locale)),
      ).toContain(renderMessage(locale, "edit.TIMEZONE", undefined));
      expect(
        JSON.stringify(settingsReviewKeyboard("save", "keep", locale)),
      ).toContain(renderMessage(locale, "button.saveChange", undefined));
      expect(JSON.stringify(planningAccessKeyboard(token, locale))).toContain(
        renderMessage(locale, "policy.PREVIOUS_PARTICIPANTS", undefined),
      );
    },
  );
  it("has identical nonempty catalogs and preserves Ukrainian encoding", () => {
    expect(Object.keys(catalogs.en).sort()).toEqual(
      Object.keys(catalogs.uk).sort(),
    );
    for (const catalog of Object.values(catalogs)) {
      expect(validateCatalog(catalog)).toEqual([]);
    }
    expect(catalogSamples["migration.upgraded"]).toBeUndefined();
  });
  it("rejects missing Ukrainian translations even with a complete English catalog", () => {
    const missing: Record<string, unknown> = { ...catalogs.uk };
    delete missing["migration.upgraded"];
    expect(validateCatalog(catalogs.en)).toEqual([]);
    expect(validateCatalog(missing)).toContain("missing:migration.upgraded");
    expect(validateCatalog({})).toContain("empty-catalog");
    expect(validateCatalog(undefined)).toContain("missing-catalog");
  });
  it.each([
    ["empty-output", () => "  "],
    ["noncallable", "translation"],
    ["invalid-output", () => undefined],
    ["invalid-output", () => "undefined"],
    [
      "payload-error",
      (payload: { nonexistent: { value: string } }) =>
        payload.nonexistent.value,
    ],
  ])("rejects a cloned Ukrainian catalog with %s", (reason, phrase) => {
    expect(
      validateCatalog({ ...catalogs.uk, "reminder.planning.body": phrase }),
    ).toContain(`${reason}:reminder.planning.body`);
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
      "2 години",
    );
    expect(renderMessage("en", "duration.value", { minutes: 120 })).toBe(
      "2 hours",
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
  // @ts-expect-error The planning reminder requires its actual week range.
  renderMessage("uk", "reminder.planning.body", {});
  // @ts-expect-error Follow-up payload cannot omit the durable range fields.
  renderMessage("uk", "reminder.followup.heading", { date: "21 вересня" });
  // @ts-expect-error Reminder week ranges cannot be numeric.
  renderMessage("uk", "reminder.planning.body", { weekRange: 21 });
  const wrong: (typeof catalogSamples)["reminder.planning.body"] = {
    // @ts-expect-error Typed samples must retain the exact per-key payload contract.
    minutes: 120,
  };
  void wrong;
}
void contracts;
