import { describe, expect, it } from "vitest";
import {
  enumerateReminderOccurrences,
  coalesceDueOccurrences,
} from "../../src/domain/reminders/reminder-occurrences.js";

const base = {
  chatId: -1n,
  kind: "PLANNING_START" as const,
  generation: 1,
  timezone: "UTC",
  effectiveFrom: new Date("2025-01-01"),
  now: new Date("2026-12-31T10:00:00Z"),
};
it("coalesces only eligible due candidates per immutable stream and skips expired work", () => {
  const at = new Date("2026-09-16T12:00Z");
  const rows = [
    {
      id: "expired",
      dueAt: new Date("2026-09-16T09:59:59.999Z"),
      eligible: true,
    },
    { id: "older", dueAt: new Date("2026-09-16T10:00Z"), eligible: true },
    { id: "latest", dueAt: new Date("2026-09-16T11:00Z"), eligible: true },
    { id: "blocked", dueAt: at, eligible: false },
    { id: "future", dueAt: new Date("2026-09-16T13:00Z"), eligible: true },
  ];
  expect(coalesceDueOccurrences(rows, at)).toEqual({
    selectedId: "latest",
    coalescedIds: ["older"],
    skippedIds: ["expired"],
    obsoleteIds: ["blocked"],
  });
});
describe("civil reminder occurrences", () => {
  it("generates current week daily 10:00 across a year boundary", () => {
    const rows = enumerateReminderOccurrences(base);
    expect(rows.map((r) => [r.civilDate, r.scope, r.minute])).toEqual([
      ["2026-12-31", "2026-12-28", 600],
      ["2027-01-01", "2026-12-28", 600],
    ]);
  });
  it("never looks into next week on Sunday and starts Monday independently", () => {
    expect(
      enumerateReminderOccurrences({
        ...base,
        now: new Date("2026-09-13T10:00Z"),
      }),
    ).toHaveLength(1);
    expect(
      enumerateReminderOccurrences({
        ...base,
        now: new Date("2026-09-14T10:00Z"),
      })[0]?.scope,
    ).toBe("2026-09-14");
  });
  it("activation exactly at 10:00 skips today and persisted activation enables recovery", () => {
    expect(
      enumerateReminderOccurrences({ ...base, effectiveFrom: base.now }).map(
        (r) => r.civilDate,
      ),
    ).toEqual(["2027-01-01"]);
    expect(
      enumerateReminderOccurrences({
        ...base,
        now: new Date("2026-12-31T12:00Z"),
      })[0]?.civilDate,
    ).toBe("2026-12-31");
    expect(
      enumerateReminderOccurrences({
        ...base,
        now: new Date("2026-12-31T12:00:00.001Z"),
      }),
    ).toHaveLength(1);
  });
  it("deduplicates and sorts follow-up minutes; empty times remain empty", () => {
    const input = {
      ...base,
      kind: "FOLLOW_UP" as const,
      roundId: "round",
      minutes: [960, 600, 960],
      now: new Date("2026-12-31T09:00Z"),
    };
    expect(enumerateReminderOccurrences(input).map((r) => r.minute)).toEqual([
      600, 960, 600, 960,
    ]);
    expect(enumerateReminderOccurrences({ ...input, minutes: [] })).toEqual([]);
  });
  it("skips a DST gap and chooses only the earlier overlap instant", () => {
    const input = {
      ...base,
      kind: "FOLLOW_UP" as const,
      roundId: "r",
      timezone: "America/New_York",
      minutes: [150],
      now: new Date("2026-03-08T05:00Z"),
    };
    expect(enumerateReminderOccurrences(input).map((r) => r.civilDate)).toEqual(
      ["2026-03-09"],
    );
    const overlap = enumerateReminderOccurrences({
      ...input,
      minutes: [90],
      now: new Date("2026-11-01T04:00Z"),
    });
    expect(overlap[0]?.dueAt.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("new timezone uses its wall clock with strict generation and fixed rehearsal cutoff", () => {
    const rows = enumerateReminderOccurrences({
      ...base,
      kind: "FOLLOW_UP" as const,
      roundId: "r",
      timezone: "Europe/Kyiv",
      effectiveFrom: new Date("2026-12-31T09:00Z"),
      now: new Date("2026-12-31T09:00Z"),
      minutes: [600, 720],
      startsAt: new Date("2026-12-31T10:00Z"),
    });
    expect(rows).toEqual([]);
  });
});
