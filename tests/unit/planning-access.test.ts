import { describe, expect, it } from "vitest";

import { canStartPlanning } from "../../src/domain/auth/planning-access-service.js";

describe("planning access policy", () => {
  it("always allows current Telegram creators and administrators", () => {
    for (const currentRole of ["creator", "administrator"] as const) {
      for (const policy of [
        "ADMINS_ONLY",
        "PREVIOUS_PARTICIPANTS",
        "ANYONE_IN_CHAT",
      ] as const) {
        expect(
          canStartPlanning({
            currentRole,
            policy,
            wasPreviousParticipant: false,
          }),
        ).toBe(true);
      }
    }
  });

  it("broadens non-administrator access only as the selected policy allows", () => {
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: "ADMINS_ONLY",
        wasPreviousParticipant: true,
      }),
    ).toBe(false);
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: "PREVIOUS_PARTICIPANTS",
        wasPreviousParticipant: true,
      }),
    ).toBe(true);
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: "PREVIOUS_PARTICIPANTS",
        wasPreviousParticipant: false,
      }),
    ).toBe(false);
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: "ANYONE_IN_CHAT",
        wasPreviousParticipant: false,
      }),
    ).toBe(true);
  });

  it("fails closed for missing membership and unsupported policy values", () => {
    expect(
      canStartPlanning({
        currentRole: "unknown",
        policy: "ANYONE_IN_CHAT",
        wasPreviousParticipant: true,
      }),
    ).toBe(false);
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: null,
        wasPreviousParticipant: true,
      }),
    ).toBe(false);
    expect(
      canStartPlanning({
        currentRole: "member",
        policy: "UNSUPPORTED" as never,
        wasPreviousParticipant: true,
      }),
    ).toBe(false);
  });
});
