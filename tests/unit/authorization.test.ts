import { describe, expect, it } from "vitest";

import {
  AuthorizationService,
  PermissionDeniedError,
} from "../../src/domain/auth/authorization-service.js";
import { createLogger } from "../../src/shared/logger.js";

/** Pino's numeric level for `error`; asserted rather than inferred from text. */
const ERROR_LEVEL = 50;

type DeleteCall = Readonly<{
  model: "setupDraft" | "settingsEditDraft";
  where: Record<string, unknown>;
}>;

/**
 * Records WHICH draft model was deleted, not merely that something was.
 *
 * The previous double pushed only the `where` argument from both models, so two
 * identical entries could not distinguish "both models deleted" from "one model
 * deleted twice" — a one-model regression would have passed unnoticed.
 */
function createDraftCallRecorder() {
  const calls: DeleteCall[] = [];
  const model = (name: DeleteCall["model"]) => ({
    async deleteMany({ where }: { where: Record<string, unknown> }) {
      calls.push({ model: name, where });
      return { count: 0 };
    },
  });

  return {
    calls,
    prisma: {
      setupDraft: model("setupDraft"),
      settingsEditDraft: model("settingsEditDraft"),
    },
  };
}

/**
 * A logger at the DEFAULT level that keeps every emitted line.
 *
 * No `level` override on purpose: a line only visible at `debug` would not
 * exist in a production log, which is exactly where finding F-4 was found.
 */
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

/** Every construction that does not assert on log output stays silent. */
const silent = () => createLogger({ level: "silent" });

describe("protected settings authorization", () => {
  it("fails closed for every non-administrator role and membership lookup failure", async () => {
    for (const role of [
      "member",
      "restricted",
      "left",
      "kicked",
      "unknown",
    ] as const) {
      const authorization = new AuthorizationService(
        {
          setupDraft: { async deleteMany() {} },
          settingsEditDraft: { async deleteMany() {} },
        } as never,
        {
          async getCurrentRole() {
            return role;
          },
        },
        silent(),
      );
      await expect(
        authorization.requireCurrentAdministrator(1n, 2n),
      ).rejects.toBeInstanceOf(PermissionDeniedError);
    }
    const unavailable = new AuthorizationService(
      {
        setupDraft: { async deleteMany() {} },
        settingsEditDraft: { async deleteMany() {} },
      } as never,
      {
        async getCurrentRole() {
          throw new Error("Telegram unavailable");
        },
      },
      silent(),
    );
    await expect(
      unavailable.requireCurrentAdministrator(1n, 2n),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it("denies a failed membership lookup without destroying the actor drafts", async () => {
    const recorder = createDraftCallRecorder();
    const capture = createCapturingLogger();
    expect(capture.logger.level).toBe("info");

    const unavailable = new AuthorizationService(
      recorder.prisma as never,
      {
        async getCurrentRole() {
          throw new Error("Telegram did not answer getChatMember");
        },
      },
      capture.logger,
    );

    // Fail-closed stays: unrefreshable evidence is still never authority.
    await expect(
      unavailable.requireCurrentAdministrator(1n, 2n),
    ).rejects.toBeInstanceOf(PermissionDeniedError);

    // The defect itself. An empty recorder proves the destructive block was
    // never entered, so a transient 429 arriving mid-`/setup` cannot wipe a
    // CURRENT administrator's wizard progress. Asserted only after the
    // rejection, so the test cannot pass by never reaching the call at all.
    expect(recorder.calls).toEqual([]);

    const lines = capture.lines();
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? {};
    expect(line.level).toBe(ERROR_LEVEL);
    expect((line.err as { message?: string } | undefined)?.message).toBe(
      "Telegram did not answer getChatMember",
    );
    expect(typeof line.event).toBe("string");
    expect(typeof line.outcome).toBe("string");
  });

  it("permits creators and administrators, and deletes only the denied actor drafts", async () => {
    const recorder = createDraftCallRecorder();
    const allowed = new AuthorizationService(
      recorder.prisma as never,
      {
        async getCurrentRole() {
          return "creator" as const;
        },
      },
      silent(),
    );
    await expect(
      allowed.requireCurrentAdministrator(1n, 2n),
    ).resolves.toBeUndefined();

    const denied = new AuthorizationService(
      recorder.prisma as never,
      {
        async getCurrentRole() {
          return "member" as const;
        },
      },
      silent(),
    );
    await expect(
      denied.requireCurrentAdministrator(1n, 2n),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(recorder.calls).toEqual([
      { model: "setupDraft", where: { chatId: 1n, actorUserId: 2n } },
      { model: "settingsEditDraft", where: { chatId: 1n, actorUserId: 2n } },
    ]);
  });
});
