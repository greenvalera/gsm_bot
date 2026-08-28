import { describe, expect, it } from "vitest";

import {
  renderSetupStep,
  TIMEZONE_LOCATION_HINT,
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
});
