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
import { createLogger } from "../../src/shared/logger.js";

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

/**
 * A client that can also hold an active configuration, so `beginOrResume` can
 * read the revision its draft will later be saved against. `configuration`
 * stays mutable so a test can move the active row on underneath an open draft.
 */
function createConfiguredStore(configuration: { revision: number } | null) {
  const store = createDraftStore();
  const state = { configuration };
  return {
    ...store,
    state,
    prisma: {
      ...store.prisma,
      chatConfiguration: {
        async findUnique() {
          return state.configuration;
        },
      },
      callbackAction: {},
      async $transaction() {
        throw new Error("unused by beginOrResume");
      },
    },
  };
}

describe("location-confirmed setup", () => {
  it("starts only the current administrator's actor-bound draft and expires it after 30 minutes", async () => {
    const store = createDraftStore();
    const setup = new SetupService(store.prisma as never);

    const draft = await setup.beginOrResume(CHAT_ID, ACTOR_ID, NOW);
    // The existing first-step enum value represents the initial timezone step;
    // this slice must not add a Prisma migration merely to rename it.
    expect(draft.step).toBe("READINESS");
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
    const authorization = new AuthorizationService(
      store.prisma as never,
      {
        async getCurrentRole() {
          return "member";
        },
      },
      createLogger({ level: "silent" }),
    );

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

/**
 * `saveConfiguration` aborts with `conflict` unless the draft's expected
 * revision matches the active configuration. Nothing wrote that field, so
 * /setup on an already-configured chat walked all eight steps and then refused
 * to save — which also disabled the documented recovery from an incoherent
 * committed row.
 */
describe("setup draft revision expectations", () => {
  it("records the active configuration revision when the draft is created", async () => {
    const store = createConfiguredStore({ revision: 4 });

    await expect(
      new SetupService(store.prisma as never).beginOrResume(
        CHAT_ID,
        ACTOR_ID,
        NOW,
      ),
    ).resolves.toMatchObject({ expectedRevision: 4 });
  });

  it("records 0 for a chat with no configuration, and for a client that cannot hold one", async () => {
    await expect(
      new SetupService(
        createConfiguredStore(null).prisma as never,
      ).beginOrResume(CHAT_ID, ACTOR_ID, NOW),
    ).resolves.toMatchObject({ expectedRevision: 0 });

    await expect(
      new SetupService(createDraftStore().prisma as never).beginOrResume(
        CHAT_ID,
        ACTOR_ID,
        NOW,
      ),
    ).resolves.toMatchObject({ expectedRevision: 0 });
  });

  it("leaves a resumed draft's expected revision untouched while extending its expiry", async () => {
    const store = createConfiguredStore({ revision: 4 });
    const setup = new SetupService(store.prisma as never);
    await setup.beginOrResume(CHAT_ID, ACTOR_ID, NOW);

    // The active configuration moves on underneath the still-open draft.
    store.state.configuration = { revision: 9 };
    const later = new Date(NOW.getTime() + 5 * 60 * 1000);
    const resumed = await setup.beginOrResume(CHAT_ID, ACTOR_ID, later);

    // Still 4, so saving now correctly reports the conflict it really is.
    expect(resumed.expectedRevision).toBe(4);
    expect(resumed.expiresAt).toEqual(
      new Date(later.getTime() + 30 * 60 * 1000),
    );
  });
});
