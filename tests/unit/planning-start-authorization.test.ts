import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import {
  AuthorizationService,
  type CurrentTelegramRole,
} from "../../src/domain/auth/authorization-service.js";
import { canStartPlanning } from "../../src/domain/auth/planning-access-service.js";
import type { PlanningAccessPolicyValue } from "../../src/domain/chat/types.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  type ChatReadinessServices,
  registerChatReadinessHandlers,
} from "../../src/telegram/handlers.js";
import {
  createMembershipGateway,
  createUnavailableMembershipGateway,
} from "../fakes/chat-readiness.js";

/**
 * REQ-PLAN-01: who may start a rehearsal plan.
 *
 * Driven by a table over the FULL cross product, so adding a role or a policy
 * forces a new row here rather than silently falling through to a default. The
 * fail-closed cells are the point of the exercise: a policy this table gets
 * wrong is a stranger starting rehearsals in someone else's band chat.
 */

const ROLES: readonly CurrentTelegramRole[] = [
  "creator",
  "administrator",
  "member",
  "restricted",
  "left",
  "kicked",
  "unknown",
];

/** The three configured policies, plus both shapes of "no configuration". */
const POLICIES: readonly (PlanningAccessPolicyValue | null | undefined)[] = [
  "ADMINS_ONLY",
  "PREVIOUS_PARTICIPANTS",
  "ANYONE_IN_CHAT",
  null,
  undefined,
];

/** A role a user currently present in the chat can hold. */
const PRESENT: readonly CurrentTelegramRole[] = [
  "creator",
  "administrator",
  "member",
  "restricted",
];

const ADMINS: readonly CurrentTelegramRole[] = ["creator", "administrator"];

/**
 * The expected answer, stated independently of the implementation.
 *
 * Deriving it from `canStartPlanning` would make the test a tautology, so the
 * rule is restated here in prose-shaped form: admins always pass; anyone not
 * currently in the chat never does; everyone else follows the policy.
 */
function expected(
  role: CurrentTelegramRole,
  policy: PlanningAccessPolicyValue | null | undefined,
  wasPreviousParticipant: boolean,
) {
  if (ADMINS.includes(role)) return true;
  if (!PRESENT.includes(role)) return false;
  if (policy === "ANYONE_IN_CHAT") return true;
  if (policy === "PREVIOUS_PARTICIPANTS") return wasPreviousParticipant;
  return false;
}

function createCapturingLogger() {
  const written: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) written.push(line);
        }
      },
    },
  });
  return {
    logger,
    lines: () =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function createDraftRecorder() {
  const deletions: string[] = [];
  const model = (name: string) => ({
    async deleteMany() {
      deletions.push(name);
      return { count: 0 };
    },
  });
  return {
    deletions,
    prisma: {
      setupDraft: model("setupDraft"),
      settingsEditDraft: model("settingsEditDraft"),
    },
  };
}

const silent = () => createLogger({ level: "silent" });

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

function createPlanRouteHarness(
  role: CurrentTelegramRole,
  policy: PlanningAccessPolicyValue | null,
) {
  let participantQueries = 0;
  let planningDispatches = 0;
  const replies: string[] = [];
  const prisma = {
    chatConfiguration: {
      async findUnique() {
        return policy === null ? null : { planningAccessPolicy: policy };
      },
    },
    planningParticipant: {
      async count() {
        participantQueries += 1;
        throw new Error("participant history unavailable");
      },
    },
  };
  const planning = {
    async wasPreviousParticipant() {
      return (await prisma.planningParticipant.count()) > 0;
    },
    async startOrResume() {
      planningDispatches += 1;
      return { kind: "unconfigured" } as const;
    },
  };
  const bot = new Bot("123456:TEST_TOKEN", { botInfo: BOT_INFO });
  registerChatReadinessHandlers(bot, {
    logger: silent(),
    prisma,
    authorization: { currentRole: async () => role },
    planning,
    now: () => new Date("2026-08-25T09:00:00.000Z"),
  } as unknown as ChatReadinessServices);
  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    _method: string,
    payload: Record<string, unknown>,
  ) => {
    replies.push(String(payload.text ?? ""));
    return {
      ok: true,
      result: {
        message_id: 1,
        date: 1_784_000_000,
        chat: { id: -1001, type: "supergroup" },
        text: payload.text ?? "",
      },
    };
  }) as never);

  return {
    participantQueries: () => participantQueries,
    planningDispatches: () => planningDispatches,
    replies,
    async sendPlan() {
      await bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: 1_784_000_000,
          chat: { id: -1001, type: "supergroup", title: "Test band" },
          from: { id: 42, is_bot: false, first_name: "Sam" },
          text: "/plan",
          entities: [{ type: "bot_command", offset: 0, length: 5 }],
        },
      } as never);
    },
  };
}

describe("who may start a rehearsal plan", () => {
  it("answers every role against every policy, in both participation states", () => {
    const cells: string[] = [];
    for (const role of ROLES) {
      for (const policy of POLICIES) {
        for (const wasPreviousParticipant of [false, true]) {
          const allowed = canStartPlanning({
            currentRole: role,
            policy,
            wasPreviousParticipant,
          });
          expect(
            allowed,
            `${role} / ${String(policy)} / previous=${wasPreviousParticipant}`,
          ).toBe(expected(role, policy, wasPreviousParticipant));
          cells.push(`${role}:${String(policy)}:${wasPreviousParticipant}`);
        }
      }
    }
    // 7 roles x 5 policy shapes x 2 participation states.
    expect(new Set(cells).size).toBe(70);
    expect(cells.length).toBeGreaterThanOrEqual(28);
  });

  it("admits both administrator roles under every policy, including ADMINS_ONLY", () => {
    for (const role of ADMINS) {
      for (const policy of POLICIES) {
        expect(
          canStartPlanning({
            currentRole: role,
            policy,
            wasPreviousParticipant: false,
          }),
          `${role} / ${String(policy)}`,
        ).toBe(true);
      }
    }
  });

  it("lets an ordinary and a restricted member through only where the policy says so", () => {
    for (const role of ["member", "restricted"] as const) {
      expect(
        canStartPlanning({
          currentRole: role,
          policy: "ADMINS_ONLY",
          wasPreviousParticipant: true,
        }),
      ).toBe(false);
      expect(
        canStartPlanning({
          currentRole: role,
          policy: "ANYONE_IN_CHAT",
          wasPreviousParticipant: false,
        }),
      ).toBe(true);
      expect(
        canStartPlanning({
          currentRole: role,
          policy: "PREVIOUS_PARTICIPANTS",
          wasPreviousParticipant: false,
        }),
      ).toBe(false);
      expect(
        canStartPlanning({
          currentRole: role,
          policy: "PREVIOUS_PARTICIPANTS",
          wasPreviousParticipant: true,
        }),
      ).toBe(true);
    }
  });

  it("refuses everyone who is not currently in the chat, even under ANYONE_IN_CHAT", () => {
    for (const role of ["left", "kicked", "unknown"] as const) {
      for (const policy of POLICIES) {
        expect(
          canStartPlanning({
            currentRole: role,
            policy,
            wasPreviousParticipant: true,
          }),
          `${role} / ${String(policy)}`,
        ).toBe(false);
      }
    }
  });
});

describe("the non-destructive role accessor behind /plan", () => {
  it("does not query participant history for an administrator", async () => {
    const harness = createPlanRouteHarness("administrator", null);

    await harness.sendPlan();

    expect(harness.participantQueries()).toBe(0);
    expect(harness.planningDispatches()).toBe(1);
    expect(harness.replies).toHaveLength(1);
  });

  it("does not query participant history under ANYONE_IN_CHAT", async () => {
    const harness = createPlanRouteHarness("member", "ANYONE_IN_CHAT");

    await harness.sendPlan();

    expect(harness.participantQueries()).toBe(0);
    expect(harness.planningDispatches()).toBe(1);
    expect(harness.replies).toHaveLength(1);
  });

  it("reports every role the gateway can return, unchanged", async () => {
    for (const role of ROLES) {
      const authorization = new AuthorizationService(
        createDraftRecorder().prisma as never,
        createMembershipGateway(() => role),
        silent(),
      );
      await expect(authorization.currentRole(1n, 2n)).resolves.toBe(role);
    }
  });

  it("fails closed to unknown when the lookup cannot be answered, and records why", async () => {
    const recorder = createDraftRecorder();
    const capture = createCapturingLogger();
    // No level override: a line only visible at debug would not exist in a
    // production log, which is where finding F-4 was found.
    expect(capture.logger.level).toBe("info");
    const authorization = new AuthorizationService(
      recorder.prisma as never,
      createUnavailableMembershipGateway(),
      capture.logger,
    );

    const role = await authorization.currentRole(1n, 2n);

    expect(role, "an unanswerable lookup is never authority").toBe("unknown");
    expect(
      canStartPlanning({
        currentRole: role,
        policy: "ANYONE_IN_CHAT",
        wasPreviousParticipant: true,
      }),
      "and the broadest policy still refuses it",
    ).toBe(false);

    const failure = capture
      .lines()
      .find((line) => line.outcome === "membership-lookup-unavailable");
    expect(failure).toBeDefined();
    // Bound under `err` and nowhere else: the redactor renders only that key
    // structurally, so any other binding would be unloggable.
    expect(failure?.err).toMatchObject({ name: "Error" });
  });

  it("destroys no draft on any path, whatever the role", async () => {
    for (const role of ROLES) {
      const recorder = createDraftRecorder();
      const authorization = new AuthorizationService(
        recorder.prisma as never,
        createMembershipGateway(() => role),
        silent(),
      );
      await authorization.currentRole(1n, 2n);
      expect(recorder.deletions, `${role} kept the actor's drafts`).toEqual([]);
    }

    const recorder = createDraftRecorder();
    const unavailable = new AuthorizationService(
      recorder.prisma as never,
      createUnavailableMembershipGateway(),
      silent(),
    );
    await unavailable.currentRole(1n, 2n);
    expect(recorder.deletions).toEqual([]);
  });
});
