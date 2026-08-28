import { describe, expect, it } from "vitest";

import { SettingsField } from "../../src/generated/prisma/client.js";
import {
  renderSettingsEditPrompt,
  renderSetupStep,
  TIMEZONE_LOCATION_HINT,
  type SettingsDashboardConfiguration,
  type SetupRenderDraft,
} from "../../src/telegram/renderers.js";

const DRAFT: SetupRenderDraft = {
  timezone: null,
  defaultWeekday: null,
  defaultStartMinute: null,
  durationMinutes: null,
  dailyStartMinute: null,
  dailyEndMinute: null,
  reminderMinutes: [],
  planningAccessPolicy: null,
};

const CONFIGURATION: SettingsDashboardConfiguration = {
  timezone: "Europe/Kyiv",
  defaultWeekday: 1,
  defaultStartMinute: 1170,
  durationMinutes: 120,
  dailyStartMinute: 600,
  dailyEndMinute: 1320,
  reminderMinutes: [600, 960],
  planningAccessPolicy: "ADMINS_ONLY",
};

describe("time-zone location prompt copy", () => {
  it("states the reply gesture in the setup step 1 prompt", () => {
    const projection = renderSetupStep(DRAFT);

    expect(projection.text.split("\n").slice(0, 2)).toEqual([
      "Setup in progress",
      "Step 1 of 8",
    ]);
    expect(projection.text).toMatch(
      /Reply to this message with a location to choose this chat's time zone\.$/,
    );
  });

  it("composes the setup step 1 text from the shared constant", () => {
    expect(renderSetupStep(DRAFT).text).toBe(
      `Setup in progress\nStep 1 of 8\n\n${TIMEZONE_LOCATION_HINT}`,
    );
  });

  it("leaves the setup step 1 projection without inline buttons", () => {
    expect(renderSetupStep(DRAFT)).not.toHaveProperty("buttons");
  });

  it("states the same reply gesture in the settings time-zone edit prompt", () => {
    const text = renderSettingsEditPrompt(
      SettingsField.TIMEZONE,
      CONFIGURATION,
    ).text;

    expect(text.split("\n")[0]).toBe("<b>Time zone</b>");
    expect(text).toMatch(
      /Reply to this message with a location to choose this chat's time zone\.$/,
    );
  });

  it("keeps both time-zone prompts byte-identical to the copywriting contract sentence", () => {
    const setupSentence = renderSetupStep(DRAFT).text.split("\n").at(-1);
    const settingsSentence = renderSettingsEditPrompt(
      SettingsField.TIMEZONE,
      CONFIGURATION,
    )
      .text.split("\n")
      .at(-1);

    expect(setupSentence).toBe(settingsSentence);
    expect(settingsSentence).toBe(TIMEZONE_LOCATION_HINT);
  });
});
