import { describe, expect, it } from "vitest";

import {
  formatLocalTime,
  parseLocalTime,
  validateSchedule,
} from "../../src/domain/chat/schedule-validator.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import { SETUP_WEEKDAY_BUTTONS } from "../../src/telegram/keyboards.js";
import {
  renderSetupReview,
  renderSetupStep,
} from "../../src/telegram/renderers.js";

describe("schedule settings", () => {
  it("parses and formats only strict zero-padded 24-hour local times", () => {
    expect(parseLocalTime("00:00")).toBe(0);
    expect(parseLocalTime("19:30")).toBe(1170);
    expect(formatLocalTime(1170)).toBe("19:30");
    expect(() => parseLocalTime("9:30")).toThrow();
    expect(() => parseLocalTime("24:00")).toThrow();
    expect(() => parseLocalTime("19:30 ")).toThrow();
  });

  it("rejects exact schedule boundary conflicts", () => {
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toEqual({ valid: true });
    expect(
      validateSchedule({
        defaultStartMinute: 1081,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 0,
        dailyStartMinute: 600,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
    expect(
      validateSchedule({
        defaultStartMinute: 1080,
        durationMinutes: 120,
        dailyStartMinute: 1200,
        dailyEndMinute: 1200,
      }),
    ).toMatchObject({ valid: false });
  });

  /**
   * The pre-existing boundary assertions all place the rehearsal ABOVE the
   * daily start, mirroring the spec that never stated the floor rule — which is
   * why a schedule beginning an hour before the window opens reached production
   * (F-6 / broken window 7). These are its missing neighbours.
   */
  it("anchors the rehearsal to the daily window floor, inclusive of the boundary", () => {
    expect(
      validateSchedule({
        defaultStartMinute: 600,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
      }),
    ).toEqual({ valid: true });
    expect(
      validateSchedule({
        defaultStartMinute: 599,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
      }),
      // The reason is pinned, not just the verdict: it maps to the already
      // verbatim invalid-schedule copy on both surfaces, so no new user-facing
      // string is needed.
    ).toEqual({ valid: false, reason: "outside-boundaries" });
    expect(
      validateSchedule({
        defaultStartMinute: 601,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
      }),
    ).toEqual({ valid: true });
  });

  it("renders weekday choices in four-and-three rows and advances to strict default-start input", () => {
    expect(
      SETUP_WEEKDAY_BUTTONS.map((row) => row.map((button) => button.text)),
    ).toEqual([
      ["Mon", "Tue", "Wed", "Thu"],
      ["Fri", "Sat", "Sun"],
    ]);
    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: null,
        durationMinutes: null,
        dailyStartMinute: null,
        dailyEndMinute: null,
        reminderMinutes: [],
        planningAccessPolicy: null,
      }),
    ).toMatchObject({
      text: expect.stringContaining("Step 3 of 8"),
    });
  });

  it("renders default reminders and administrators-only planning access until explicitly changed", () => {
    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [],
        planningAccessPolicy: null,
      }).text,
    ).toContain("<code>10:00</code> and <code>16:00</code>");

    expect(
      renderSetupStep({
        timezone: "Europe/Kyiv",
        defaultWeekday: 1,
        defaultStartMinute: 1170,
        durationMinutes: 120,
        dailyStartMinute: 600,
        dailyEndMinute: 1320,
        reminderMinutes: [600, 960],
        planningAccessPolicy: null,
      }).text,
    ).toContain("Step 8 of 8");
  });

  it("renders a complete review with save before cancel", () => {
    const projection = renderSetupReview({
      timezone: "Europe/Kyiv",
      defaultWeekday: 1,
      defaultStartMinute: 1170,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: 1320,
      reminderMinutes: [600, 960],
      planningAccessPolicy: "ADMINS_ONLY",
    });

    expect(projection.text).toContain("<b>Review configuration</b>");
    expect(projection.buttons?.flat().map((button) => button.text)).toEqual([
      "Save configuration",
      "Cancel setup",
    ]);
  });

  it("preserves valid draft values when a completed schedule conflicts and reaches review with defaults", async () => {
    const drafts = new Map<string, Record<string, unknown>>();
    const key = (chatId: bigint, actorId: bigint) => `${chatId}:${actorId}`;
    const prisma = {
      setupDraft: {
        async findUnique({ where }: any) {
          const selector = where.chatId_actorUserId;
          return drafts.get(key(selector.chatId, selector.actorUserId)) ?? null;
        },
        async upsert({ where, create, update }: any) {
          const selector = where.chatId_actorUserId;
          const draftKey = key(selector.chatId, selector.actorUserId);
          const next = {
            id: `draft-${draftKey}`,
            timezone: null,
            defaultWeekday: null,
            defaultStartMinute: null,
            durationMinutes: null,
            dailyStartMinute: null,
            dailyEndMinute: null,
            planningAccessPolicy: null,
            ...(drafts.get(draftKey) ?? create),
            ...(drafts.has(draftKey) ? update : {}),
          };
          drafts.set(draftKey, next);
          return next;
        },
        async update({ where, data }: any) {
          for (const [draftKey, draft] of drafts) {
            if (draft.id === where.id) {
              const next = { ...draft, ...data };
              drafts.set(draftKey, next);
              return next;
            }
          }
          throw new Error("missing draft");
        },
        async delete() {},
      },
    };
    const setup = new SetupService(prisma as never);
    const now = new Date("2026-08-20T10:00:00.000Z");
    let draft = await setup.beginOrResume(100n, 200n, now);
    draft = await setup.selectTimezone(draft.id, "Europe/Kyiv", now);
    draft = await setup.selectWeekday(draft.id, "MON", now);
    const start = await setup.setScheduleField(
      draft,
      "defaultStartMinute",
      1170,
      now,
    );
    if (start.kind !== "updated") throw new Error("start should be valid");
    draft = start.draft;
    const duration = await setup.setScheduleField(
      draft,
      "durationMinutes",
      120,
      now,
    );
    if (duration.kind !== "updated")
      throw new Error("duration should be valid");
    draft = duration.draft;
    const dailyStart = await setup.setScheduleField(
      draft,
      "dailyStartMinute",
      600,
      now,
    );
    if (dailyStart.kind !== "updated")
      throw new Error("daily start should be valid");
    draft = dailyStart.draft;

    const conflict = await setup.setScheduleField(
      draft,
      "dailyEndMinute",
      1200,
      now,
    );
    expect(conflict).toEqual({ kind: "schedule-conflict" });
    expect(drafts.get("100:200")).toMatchObject({
      defaultStartMinute: 1170,
      durationMinutes: 120,
      dailyStartMinute: 600,
      dailyEndMinute: null,
    });

    const resolved = await setup.setScheduleField(
      draft,
      "dailyEndMinute",
      1320,
      now,
    );
    expect(resolved.kind).toBe("updated");
    if (resolved.kind !== "updated")
      throw new Error("schedule should be valid");
    draft = await setup.useDefaultReminders(resolved.draft.id, now);
    draft = await setup.setPlanningAccessPolicy(draft.id, "ADMINS_ONLY", now);
    expect(draft.reminderMinutes).toEqual([600, 960]);
    expect(draft.planningAccessPolicy).toBe("ADMINS_ONLY");
    expect(setup.isReviewReady(draft)).toBe(true);
  });
});
