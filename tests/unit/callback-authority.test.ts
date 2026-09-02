import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import {
  AuthorizationService,
  type CurrentTelegramRole,
} from "../../src/domain/auth/authorization-service.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import {
  CALLBACK_DENIAL,
  GENERIC_STALE_TEXT,
  PLANNING_STALE_TEXT,
  SETUP_STALE_TEXT,
  registerCallbackBoundary,
  type CallbackActionRow,
  type CallbackRouteTable,
} from "../../src/telegram/callbacks.js";
import { PLANNING_NON_MEMBER_DENIAL } from "../../src/telegram/planning-handlers.js";
import { createLogger } from "../../src/shared/logger.js";
import {
  createMembershipGateway,
  createUnavailableMembershipGateway,
} from "../fakes/chat-readiness.js";

/**
 * The Pattern 5 regression matrix.
 *
 * Phase 2 changed the callback boundary so a non-administrator who legitimately
 * owns a planning card can press its buttons. That is the single highest-risk
 * edit in the phase: the same code path is what refuses every unauthorized tap
 * on the setup, settings and roster surfaces. This file pins BOTH halves —
 * every Phase 1 kind behaves exactly as it did, and only the planning kind
 * behaves differently.
 *
 * Copy is imported from the module rather than re-typed, so a copy change
 * breaks the assertion at its source instead of drifting silently.
 */

const BOT_INFO = {
  id: 9001,
  is_bot: true,
  first_name: "GSMBot",
  username: "gsmbot",
} as UserFromGetMe;

const NOW = new Date("2026-08-26T09:00:00.000Z");
const CHAT_ID = -1005000000001n;
const OTHER_CHAT_ID = -1005000000002n;
const ACTOR_ID = 7301n;

const ADMIN_ROLES: readonly CurrentTelegramRole[] = [
  "creator",
  "administrator",
];
const NON_ADMIN_ROLES: readonly CurrentTelegramRole[] = [
  "member",
  "restricted",
  "left",
  "kicked",
  "unknown",
];
/** Non-administrators who are nonetheless present in the chat. */
const PRESENT_NON_ADMINS: readonly CurrentTelegramRole[] = [
  "member",
  "restricted",
];
const ABSENT_ROLES: readonly CurrentTelegramRole[] = [
  "left",
  "kicked",
  "unknown",
];

/** The three Phase 1 kinds, whose behaviour must be observably unchanged. */
const PHASE_1_KINDS = [
  CallbackActionKind.START_SETUP,
  CallbackActionKind.SETTINGS_EDIT,
  CallbackActionKind.ROSTER_REMOVE,
] as const;

const STALE_TEXT_BY_KIND: Readonly<Record<CallbackActionKind, string>> = {
  [CallbackActionKind.START_SETUP]: SETUP_STALE_TEXT,
  [CallbackActionKind.SETTINGS_EDIT]: GENERIC_STALE_TEXT,
  [CallbackActionKind.ROSTER_REMOVE]: GENERIC_STALE_TEXT,
  [CallbackActionKind.PLANNING]: PLANNING_STALE_TEXT,
};

function validToken() {
  return `v1:${crypto.randomUUID()}`;
}

function actionRow(
  kind: CallbackActionKind,
  overrides: Partial<CallbackActionRow> = {},
): CallbackActionRow {
  return {
    token: validToken(),
    kind,
    chatId: CHAT_ID,
    actorUserId: ACTOR_ID,
    targetId: null,
    expiresAt: new Date(NOW.getTime() + 60_000),
    consumedAt: null,
    ...overrides,
  };
}

type HarnessOptions = Readonly<{
  role: CurrentTelegramRole;
  roleUnavailable?: boolean;
  action?: CallbackActionRow | null;
}>;

function createHarness(options: HarnessOptions) {
  const answers: Array<Record<string, unknown>> = [];
  const dispatched: CallbackActionKind[] = [];
  const draftDeletions: string[] = [];
  const logLines: string[] = [];

  const logger = createLogger({
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) logLines.push(line);
        }
      },
    },
  });

  const draftModel = (name: string) => ({
    async deleteMany() {
      draftDeletions.push(name);
      return { count: 0 };
    },
  });

  const authorization = new AuthorizationService(
    {
      setupDraft: draftModel("setupDraft"),
      settingsEditDraft: draftModel("settingsEditDraft"),
    } as never,
    options.roleUnavailable === true
      ? createUnavailableMembershipGateway()
      : createMembershipGateway(() => options.role),
    logger,
  );

  const route = (kind: CallbackActionKind) => {
    const dispatch = async () => {
      dispatched.push(kind);
    };

    return kind === CallbackActionKind.PLANNING
      ? {
          staleText: STALE_TEXT_BY_KIND[kind],
          nonMemberText: PLANNING_NON_MEMBER_DENIAL,
          authority: "route-resolved" as const,
          actorBinding: "route-resolved" as const,
          dispatch,
        }
      : {
          staleText: STALE_TEXT_BY_KIND[kind],
          authority: "current-admin" as const,
          actorBinding: "strict" as const,
          dispatch,
        };
  };

  const routes: CallbackRouteTable = {
    [CallbackActionKind.START_SETUP]: route(CallbackActionKind.START_SETUP),
    [CallbackActionKind.SETTINGS_EDIT]: route(CallbackActionKind.SETTINGS_EDIT),
    [CallbackActionKind.ROSTER_REMOVE]: route(CallbackActionKind.ROSTER_REMOVE),
    [CallbackActionKind.PLANNING]: route(CallbackActionKind.PLANNING),
  };

  const bot = new Bot("123456:TEST_TOKEN", { botInfo: BOT_INFO });
  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    method: string,
    payload: Record<string, unknown>,
  ) => {
    if (method === "answerCallbackQuery") answers.push(payload);
    return { ok: true, result: true };
  }) as never);

  registerCallbackBoundary(
    bot,
    {
      logger,
      prisma: {
        callbackAction: {
          async findUnique() {
            return options.action ?? null;
          },
        },
      } as never,
      authorization,
      now: () => NOW,
    },
    routes,
    { exhaustive: true },
  );

  return {
    answers,
    dispatched,
    draftDeletions,
    /** Every terminating boundary record for this update. */
    boundaryLines() {
      return logLines
        .map((line) => JSON.parse(line) as Record<string, unknown>)
        .filter((line) => line.event === "telegram.callback");
    },
    async tap(data: string) {
      await bot.handleUpdate({
        update_id: 5_001,
        callback_query: {
          id: "callback-authority",
          from: { id: Number(ACTOR_ID), is_bot: false, first_name: "Actor" },
          chat_instance: "callback-authority",
          data,
          message: {
            message_id: 777,
            date: 1_784_000_000,
            chat: { id: Number(CHAT_ID), type: "supergroup", title: "Band" },
          },
        },
      } as never);
    },
  };
}

/** Every cell asserts this, so no branch may return in silence (finding F-4). */
function expectExactlyOneAnsweredAndLogged(
  harness: ReturnType<typeof createHarness>,
) {
  expect(harness.answers).toHaveLength(1);
  const lines = harness.boundaryLines();
  expect(lines).toHaveLength(1);
  expect(lines[0]?.outcome).toEqual(expect.any(String));
  expect(lines[0]?.reason).toEqual(expect.any(String));
  return lines[0]!;
}

describe("callback boundary authority matrix", () => {
  it("dispatches every kind for both administrator roles, exactly as before", async () => {
    for (const role of ADMIN_ROLES) {
      for (const kind of [...PHASE_1_KINDS, CallbackActionKind.PLANNING]) {
        const action = actionRow(kind);
        const harness = createHarness({ role, action });
        await harness.tap(action.token);

        expect(harness.dispatched, `${role} / ${kind}`).toEqual([kind]);
        expect(harness.draftDeletions).toEqual([]);
        const line = harness.boundaryLines()[0];
        expect(line?.outcome).toBe("dispatched");
        expect(line?.reason).toBe("action-dispatched");
      }
    }
  });

  it("refuses every non-administrator on every Phase 1 kind with the verbatim alert", async () => {
    // This is the T-01-16-01 invariant restated for Phase 2. If this cell ever
    // goes green on a dispatch, the phase has broken the setup, settings and
    // roster surfaces for the whole chat.
    for (const role of NON_ADMIN_ROLES) {
      for (const kind of PHASE_1_KINDS) {
        const action = actionRow(kind);
        const harness = createHarness({
          role,
          roleUnavailable: role === "unknown",
          action,
        });
        await harness.tap(action.token);

        expect(harness.dispatched, `${role} / ${kind}`).toEqual([]);
        const line = expectExactlyOneAnsweredAndLogged(harness);
        expect(harness.answers[0]).toMatchObject({
          text: CALLBACK_DENIAL,
          show_alert: true,
        });
        expect(line.outcome).toBe("denied");
        expect(line.reason).toBe("permission-denied");
        // The surface is provably admin-only, so Phase 1's delete-on-denial
        // side effect still applies in full (threat T-01-08).
        expect(harness.draftDeletions).toEqual([
          "setupDraft",
          "settingsEditDraft",
        ]);
      }
    }
  });

  it("dispatches the planning kind for a member and for a restricted member", async () => {
    // The behaviour the phase exists to enable: a non-administrator author can
    // press the buttons on the card they own.
    for (const role of PRESENT_NON_ADMINS) {
      const action = actionRow(CallbackActionKind.PLANNING);
      const harness = createHarness({ role, action });
      await harness.tap(action.token);

      expect(harness.dispatched, role).toEqual([CallbackActionKind.PLANNING]);
      // And it costs no administrator their in-progress wizard (threat T-02-14).
      expect(harness.draftDeletions).toEqual([]);
      expect(harness.boundaryLines()[0]?.outcome).toBe("dispatched");
    }
  });

  it("refuses the planning kind for anyone no longer in the chat", async () => {
    for (const role of ABSENT_ROLES) {
      const action = actionRow(CallbackActionKind.PLANNING);
      const harness = createHarness({
        role,
        roleUnavailable: role === "unknown",
        action,
      });
      await harness.tap(action.token);

      expect(harness.dispatched, role).toEqual([]);
      const line = expectExactlyOneAnsweredAndLogged(harness);
      expect(harness.answers[0]).toMatchObject({
        text: PLANNING_NON_MEMBER_DENIAL,
        show_alert: true,
      });
      expect(line.outcome).toBe("denied");
      expect(line.reason).toBe("not-a-current-chat-member");
      // Not an admin-only surface, so nothing of theirs is destroyed either.
      expect(harness.draftDeletions).toEqual([]);
    }
  });

  it("uses distinct refusal copy for non-members and non-administrators", () => {
    expect(PLANNING_NON_MEMBER_DENIAL).not.toBe(CALLBACK_DENIAL);
  });

  it("refuses a non-administrator holding an unparseable token, touching nothing durable", async () => {
    const harness = createHarness({ role: "member", action: null });
    await harness.tap("not-an-opaque-token");

    expect(harness.dispatched).toEqual([]);
    const line = expectExactlyOneAnsweredAndLogged(harness);
    expect(harness.answers[0]).toMatchObject({
      text: CALLBACK_DENIAL,
      show_alert: true,
    });
    expect(line.reason).toBe("unparseable-token");
    // The kind — and therefore the surface — is unknowable here, so the
    // delete-on-denial side effect must NOT fire: a garbage callback from any
    // member would otherwise wipe an administrator's wizard (threat T-02-14).
    expect(harness.draftDeletions).toEqual([]);
  });

  it("refuses a non-administrator holding a well-formed token with no action row", async () => {
    const harness = createHarness({ role: "member", action: null });
    await harness.tap(validToken());

    expect(harness.dispatched).toEqual([]);
    const line = expectExactlyOneAnsweredAndLogged(harness);
    expect(harness.answers[0]).toMatchObject({
      text: CALLBACK_DENIAL,
      show_alert: true,
    });
    expect(line.reason).toBe("unknown-action-row");
    expect(harness.draftDeletions).toEqual([]);
  });

  it("keeps chat binding at the boundary for every route, including planning", async () => {
    for (const kind of [...PHASE_1_KINDS, CallbackActionKind.PLANNING]) {
      const action = actionRow(kind, { chatId: OTHER_CHAT_ID });
      const harness = createHarness({ role: "administrator", action });
      await harness.tap(action.token);

      expect(harness.dispatched, `admin / ${kind}`).toEqual([]);
      const line = expectExactlyOneAnsweredAndLogged(harness);
      expect(harness.answers[0]).toMatchObject({
        text: STALE_TEXT_BY_KIND[kind],
        show_alert: true,
      });
      expect(line.outcome).toBe("stale");
    }

    // A member on the planning route reaches the same check (threat T-02-02).
    const planning = actionRow(CallbackActionKind.PLANNING, {
      chatId: OTHER_CHAT_ID,
    });
    const member = createHarness({ role: "member", action: planning });
    await member.tap(planning.token);
    expect(member.dispatched).toEqual([]);
    expect(member.answers[0]).toMatchObject({
      text: PLANNING_STALE_TEXT,
      show_alert: true,
    });
  });

  it("keeps the expiry check at the boundary for every route, including planning", async () => {
    for (const kind of [...PHASE_1_KINDS, CallbackActionKind.PLANNING]) {
      const action = actionRow(kind, {
        expiresAt: new Date(NOW.getTime() - 1),
      });
      const harness = createHarness({ role: "administrator", action });
      await harness.tap(action.token);

      expect(harness.dispatched, `admin / ${kind}`).toEqual([]);
      const line = expectExactlyOneAnsweredAndLogged(harness);
      expect(harness.answers[0]).toMatchObject({
        text: STALE_TEXT_BY_KIND[kind],
        show_alert: true,
      });
      expect(line.outcome).toBe("stale");
    }

    const planning = actionRow(CallbackActionKind.PLANNING, {
      expiresAt: new Date(NOW.getTime() - 1),
    });
    const member = createHarness({ role: "member", action: planning });
    await member.tap(planning.token);
    expect(member.dispatched).toEqual([]);
    expect(member.answers[0]).toMatchObject({
      text: PLANNING_STALE_TEXT,
      show_alert: true,
    });
  });

  it("defers only the actor comparison, and only for a route-resolved binding", async () => {
    // A Phase 1 kind bound to someone else is stale AT the boundary, as before.
    const strict = actionRow(CallbackActionKind.ROSTER_REMOVE, {
      actorUserId: ACTOR_ID + 1n,
    });
    const admin = createHarness({ role: "administrator", action: strict });
    await admin.tap(strict.token);
    expect(admin.dispatched).toEqual([]);
    expect(admin.answers[0]).toMatchObject({ text: GENERIC_STALE_TEXT });

    // The planning kind reaches its dispatcher, which resolves ownership from
    // the round row and can name the owner instead of claiming expiry.
    const resolved = actionRow(CallbackActionKind.PLANNING, {
      actorUserId: ACTOR_ID + 1n,
    });
    const member = createHarness({ role: "member", action: resolved });
    await member.tap(resolved.token);
    expect(member.dispatched).toEqual([CallbackActionKind.PLANNING]);
  });

  it("leaves an in-progress setup draft intact when a member taps a planning button", async () => {
    const action = actionRow(CallbackActionKind.PLANNING);
    const harness = createHarness({ role: "member", action });
    await harness.tap(action.token);

    expect(harness.draftDeletions).toEqual([]);
    expect(harness.dispatched).toEqual([CallbackActionKind.PLANNING]);
  });

  it("gives every refusal reason its own distinct outcome and reason pair", async () => {
    const pairs = new Set<string>();
    const record = async (harness: ReturnType<typeof createHarness>) => {
      const line = harness.boundaryLines()[0];
      pairs.add(`${String(line?.outcome)}/${String(line?.reason)}`);
    };

    const denied = actionRow(CallbackActionKind.START_SETUP);
    const deniedHarness = createHarness({ role: "member", action: denied });
    await deniedHarness.tap(denied.token);
    await record(deniedHarness);

    const absent = actionRow(CallbackActionKind.PLANNING);
    const absentHarness = createHarness({ role: "left", action: absent });
    await absentHarness.tap(absent.token);
    await record(absentHarness);

    const unparseable = createHarness({ role: "member", action: null });
    await unparseable.tap("not-an-opaque-token");
    await record(unparseable);

    const unknown = createHarness({ role: "member", action: null });
    await unknown.tap(validToken());
    await record(unknown);

    const stale = actionRow(CallbackActionKind.PLANNING, {
      chatId: OTHER_CHAT_ID,
    });
    const staleHarness = createHarness({ role: "member", action: stale });
    await staleHarness.tap(stale.token);
    await record(staleHarness);

    const ok = actionRow(CallbackActionKind.PLANNING);
    const okHarness = createHarness({ role: "member", action: ok });
    await okHarness.tap(ok.token);
    await record(okHarness);

    // Six terminating exits, six distinguishable records.
    expect(pairs.size).toBe(6);
  });
});
