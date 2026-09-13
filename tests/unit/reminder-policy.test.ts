import { describe, expect, it } from "vitest";
import { evaluateReminderEligibility } from "../../src/domain/reminders/reminder-policy.js";

const base = {kind: "PLANNING_START" as const, now: new Date("2026-09-14T10:00Z"), dueAt: new Date("2026-09-14T10:00Z"), timezone: "UTC", scope: "2026-09-14", effectiveFrom: new Date("2026-09-13"), generation: 1, currentGeneration: 1, activeDraft: false, claimedWeek: false};
describe("current reminder eligibility", () => {
  it("independently suppresses active drafts and claimed weeks", () => {
    expect(evaluateReminderEligibility(base)).toBe(true);
    expect(evaluateReminderEligibility({...base, activeDraft: true})).toBe(false);
    expect(evaluateReminderEligibility({...base, claimedWeek: true})).toBe(false);
    expect(evaluateReminderEligibility({...base, scope: "2026-09-21"})).toBe(false);
  });
  it("rejects activation, obsolete generations, migrated chats, quiet intervals and future sends", () => {
    for (const patch of [{effectiveFrom: base.now}, {currentGeneration: 2}, {migrated: true}, {quietUntil: new Date("2026-09-21")}, {now: new Date("2026-09-14T09:59Z")}]) expect(evaluateReminderEligibility({...base, ...patch})).toBe(false);
  });
  const follow = {...base, kind: "FOLLOW_UP" as const, status: "CONFIRMED", startsAt: new Date("2026-09-15T10:00Z"), firstPublishedAt: new Date("2026-09-14T09:30Z"), participants: [{marker: "pending" as const}]};
  it("derives unavailable before pending and rejects empty or completed snapshots", () => {
    expect(evaluateReminderEligibility(follow)).toBe(true);
    expect(evaluateReminderEligibility({...follow, participants: [{marker: "pending"}, {marker: "unavailable"}]})).toBe(false);
    expect(evaluateReminderEligibility({...follow, participants: []})).toBe(false);
    expect(evaluateReminderEligibility({...follow, participants: [{marker: "available"}]})).toBe(false);
  });
  it("enforces publication on scheduled instant, actual attempt spacing, and fixed start", () => {
    expect(evaluateReminderEligibility({...follow, firstPublishedAt: new Date("2026-09-14T09:30:00.001Z")})).toBe(false);
    expect(evaluateReminderEligibility({...follow, firstPublishedAt: new Date("2026-09-14T09:59Z"), now: new Date("2026-09-14T11:00Z")})).toBe(false);
    expect(evaluateReminderEligibility({...follow, lastAttemptAt: new Date("2026-09-14T09:30Z")})).toBe(true);
    expect(evaluateReminderEligibility({...follow, lastAttemptAt: new Date("2026-09-14T09:30:00.001Z")})).toBe(false);
    expect(evaluateReminderEligibility({...follow, startsAt: base.now})).toBe(false);
    expect(evaluateReminderEligibility({...follow, status: "BOOKED"})).toBe(false);
  });
});
