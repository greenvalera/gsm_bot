import { describe, expect, it } from "vitest";

import * as renderers from "../../src/telegram/renderers.js";
import type { SetupRenderDraft } from "../../src/telegram/renderers.js";

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

const TIMEZONE_LOCATION_HINT = (
  renderers as typeof renderers & { TIMEZONE_LOCATION_HINT?: string }
).TIMEZONE_LOCATION_HINT;

describe("time-zone location prompt copy", () => {
  it("states the reply gesture in the setup step 1 prompt", () => {
    const projection = renderers.renderSetupStep(DRAFT);

    expect(projection.text.split("\n").slice(0, 2)).toEqual([
      "Setup in progress",
      "Step 1 of 8",
    ]);
    expect(projection.text).toMatch(
      /Reply to this message with a location to choose this chat's time zone\.$/,
    );
  });

  it("composes the setup step 1 text from the shared constant", () => {
    expect(renderers.renderSetupStep(DRAFT).text).toBe(
      `Setup in progress\nStep 1 of 8\n\n${TIMEZONE_LOCATION_HINT}`,
    );
  });

  it("leaves the setup step 1 projection without inline buttons", () => {
    expect(renderers.renderSetupStep(DRAFT)).not.toHaveProperty("buttons");
  });
});
