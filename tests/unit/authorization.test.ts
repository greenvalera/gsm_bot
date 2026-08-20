import { describe, expect, it } from "vitest";

import {
  AuthorizationService,
  PermissionDeniedError,
} from "../../src/domain/auth/authorization-service.js";

describe("protected settings authorization", () => {
  it("permits creators and administrators, and deletes only the denied actor drafts", async () => {
    const deleted: Array<Record<string, unknown>> = [];
    const prisma = {
      setupDraft: {
        async deleteMany({ where }: any) {
          deleted.push(where);
        },
      },
      settingsEditDraft: {
        async deleteMany({ where }: any) {
          deleted.push(where);
        },
      },
    };
    const allowed = new AuthorizationService(prisma as never, {
      async getCurrentRole() {
        return "creator" as const;
      },
    });
    await expect(
      allowed.requireCurrentAdministrator(1n, 2n),
    ).resolves.toBeUndefined();

    const denied = new AuthorizationService(prisma as never, {
      async getCurrentRole() {
        return "member" as const;
      },
    });
    await expect(
      denied.requireCurrentAdministrator(1n, 2n),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(deleted).toEqual([
      { chatId: 1n, actorUserId: 2n },
      { chatId: 1n, actorUserId: 2n },
    ]);
  });
});
