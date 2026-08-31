import { describe, expect, it } from "vitest";

import { buildDayStepProjection } from "../../src/domain/planning/planning-service.js";
import { generateSlots } from "../../src/domain/planning/slot-generator.js";
import { civilNow } from "../../src/infrastructure/time/zoned-clock.js";
import { createCallbackToken } from "../../src/shared/callback-schema.js";
import {
  planningKeyboard,
  planningRows,
  PLANNING_SLOT_ROW_SIZES,
} from "../../src/telegram/keyboards.js";
import { renderDayStep } from "../../src/telegram/planning-renderers.js";

/**
 * The F-9 guard: the SERIALIZED keyboard, which is the thing Telegram actually
 * receives.
 *
 * Asserting the declared row-size constants alone would not catch a change in
 * `planningRows`' break logic, and it is that logic — not the constant — which
 * decides how wide each button ends up. Phase 1 lost the tail of a label to a
 * row that was one button too crowded; nothing but a shape assertion notices
 * that, because a truncated label is still a working button.
 */

const KYIV = "Europe/Kyiv";
const MONDAY = "2026-08-24";

/** An opaque `v1:<uuid>` and nothing else may travel on the wire (T-01-05). */
const OPAQUE_TOKEN = /^v1:[0-9a-f-]{36}$/i;
/** Any `YYYY-MM-DD` on the wire would be a date leaked into callback data. */
const DATE_SHAPE = /\d{4}-\d{2}-\d{2}/;

type SerializedButton = Readonly<{ text: string; callback_data?: string }>;

function serialize(keyboard: {
  inline_keyboard: readonly (readonly unknown[])[];
}) {
  return keyboard.inline_keyboard as readonly (readonly SerializedButton[])[];
}

function dayCard(overrides: { today?: Date } = {}) {
  const projection = buildDayStepProjection({
    targetWeekStart: MONDAY,
    today: civilNow(KYIV, overrides.today ?? new Date("2026-08-24T09:00:00Z")),
    defaultWeekday: 3,
    // Thursday of the week BEFORE the target week: the previous marker matches
    // on weekday, and a date inside the target week is suppressed — which would
    // quietly drop a marked label out of the width guard below.
    previousRehearsalDate: "2026-08-13",
  });
  return renderDayStep(projection, () => createCallbackToken());
}

describe("the serialized day keyboard", () => {
  it("splits the seven days into the declared 4/3 rows", () => {
    const rows = serialize(dayCard().keyboard);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(4);
    expect(rows[1]).toHaveLength(3);
    expect(rows.flat()).toHaveLength(7);
  });

  it("keeps the same shape when every day is marked unavailable", () => {
    const rows = serialize(
      dayCard({ today: new Date("2026-09-10T09:00:00Z") }).keyboard,
    );

    expect(rows.map((row) => row.length)).toEqual([4, 3]);
  });

  it("puts nothing but an opaque token on the wire", () => {
    for (const button of serialize(dayCard().keyboard).flat()) {
      expect(button.callback_data, button.text).toMatch(OPAQUE_TOKEN);
      // No date, no weekday, no round id, no authority claim.
      expect(button.callback_data ?? "", button.text).not.toMatch(DATE_SHAPE);
    }
  });

  it("keeps every label inside the visible width, marker glyph included", () => {
    for (const button of serialize(dayCard().keyboard).flat()) {
      expect([...button.text].length, button.text).toBeLessThanOrEqual(24);
    }
  });
});

describe("the serialized slot keyboard", () => {
  it("splits the default ten-slot window into the declared 3/3/3/1 rows", () => {
    // 10:00–21:00 with a two-hour rehearsal: the ten starts 10:00 … 19:00.
    const slots = generateSlots({
      dailyStartMinute: 600,
      dailyEndMinute: 1260,
      durationMinutes: 120,
    });
    expect(slots).toHaveLength(10);

    const rows = serialize(
      planningKeyboard(
        planningRows(
          slots.map((slot) => ({
            text: slot.label,
            token: createCallbackToken(),
          })),
          PLANNING_SLOT_ROW_SIZES,
        ),
      ),
    );

    expect(rows.map((row) => row.length)).toEqual([3, 3, 3, 1]);
    for (const button of rows.flat()) {
      expect(button.callback_data, button.text).toMatch(OPAQUE_TOKEN);
    }
  });
});
