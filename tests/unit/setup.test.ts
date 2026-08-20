import { describe, expect, it } from "vitest";

import {
  AuthorizationService,
  PermissionDeniedError,
} from "../../src/domain/auth/authorization-service.js";
import { SetupService } from "../../src/domain/chat/setup-service.js";
import { GeoTzTimezoneResolver } from "../../src/infrastructure/time/timezone-resolver.js";
import {
  createCallbackToken,
  createTimezoneTarget,
  parseTimezoneTarget,
} from "../../src/shared/callback-schema.js";

const NOW = new Date("2026-08-20T10:00:00.000Z");
const CHAT_ID = 100n;
const ACTOR_ID = 200n;

function createDraftStore() {
  const drafts = new Map<string, Record<string, unknown>>();
  const key = (chatId: bigint, actorId: bigint) => `${chatId}:${actorId}`;

  return {
    drafts,
    prisma: {
      setupDraft: {
        async findUnique({ where }: any) {
          const selector = where.chatId_actorUserId;
          return drafts.get(key(selector.chatId, selector.actorUserId)) ?? null;
        },
        async upsert({ where, create, update }: any) {
          const selector = where.chatId_actorUserId;
          const draftKey = key(selector.chatId, selector.actorUserId);
          const current = drafts.get(draftKey);
          const next =
            current === undefined
              ? { id: `draft-${draftKey}`, ...create }
              : { ...current, ...update };
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
        async delete({ where }: any) {
          for (const [draftKey, draft] of drafts) {
            if (draft.id === where.id) {
              drafts.delete(draftKey);
              return draft;
            }
          }
          throw new Error("missing draft");
        },
        async deleteMany({ where }: any) {
          const draftKey = key(where.chatId, where.actorUserId);
          const deleted = drafts.delete(draftKey);
          return { count: deleted ? 1 : 0 };
        },
      },
    },
  };
}

describe("location-confirmed setup", () => {
  it("starts only the current administrator's actor-bound draft and expires it after 30 minutes", async () => {
    const store = createDraftStore();
    const setup = new SetupService(store.prisma as never);

    const draft = await setup.beginOrResume(CHAT_ID, ACTOR_ID, NOW);
    expect(draft.step).toBe("TIMEZONE");
    expect(store.drafts.size).toBe(1);

    await expect(
      setup.requireActive(
        CHAT_ID,
        ACTOR_ID,
        new Date(NOW.getTime() + 30 * 60 * 1000),
      ),
    ).resolves.toEqual({ kind: "expired" });
    expect(store.drafts.size).toBe(0);
  });

  it("deletes a demoted actor's drafts before denying access", async () => {
    const store = createDraftStore();
    await new SetupService(store.prisma as never).beginOrResume(
      CHAT_ID,
      ACTOR_ID,
      NOW,
    );
    const authorization = new AuthorizationService(store.prisma as never, {
      async getCurrentRole() {
        return "member";
      },
    });

    await expect(
      authorization.requireCurrentAdministrator(CHAT_ID, ACTOR_ID),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(store.drafts.size).toBe(0);
  });

  it("returns no candidate for invalid coordinates and preserves every valid geo-tz candidate without selecting one", async () => {
    const resolver = new GeoTzTimezoneResolver((latitude, longitude) => {
      if (latitude === 1 && longitude === 2) {
        return ["Europe/Kyiv", "Europe/Warsaw", "Europe/Kyiv"];
      }
      return [];
    });

    await expect(resolver.resolve(91, 2)).resolves.toEqual({
      kind: "failure",
      cause: "invalid-coordinates",
    });
    await expect(resolver.resolve(1, 2)).resolves.toEqual({
      kind: "ambiguous",
      candidates: ["Europe/Kyiv", "Europe/Warsaw"],
    });
    await expect(resolver.resolve(2, 3)).resolves.toEqual({
      kind: "failure",
      cause: "empty-result",
    });
    await expect(
      new GeoTzTimezoneResolver(() => {
        throw new Error("boundary data unavailable");
      }).resolve(1, 2),
    ).resolves.toEqual({ kind: "failure", cause: "resolver-error" });
  });

  it("contains timezone authority only in a server-side target, never in its opaque callback token", () => {
    const token = createCallbackToken();
    const target = createTimezoneTarget("draft-1", "Europe/Kyiv");

    expect(token).toMatch(/^v1:[0-9a-f-]{36}$/i);
    expect(token).not.toContain("Kyiv");
    expect(parseTimezoneTarget(target)).toMatchObject({
      success: true,
      data: { draftId: "draft-1", timezone: "Europe/Kyiv" },
    });
    expect(parseTimezoneTarget("not JSON").success).toBe(false);
  });

  it("writes only the administrator's selected candidate to the existing draft field", async () => {
    const store = createDraftStore();
    const setup = new SetupService(store.prisma as never);
    const draft = await setup.beginOrResume(CHAT_ID, ACTOR_ID, NOW);

    await setup.selectTimezone(draft.id as string, "Europe/Warsaw", NOW);
    expect(store.drafts.get(`${CHAT_ID}:${ACTOR_ID}`)).toMatchObject({
      candidateTimezone: "Europe/Warsaw",
    });
  });
});
