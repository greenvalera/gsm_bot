import type { TelegramMembershipGateway } from "../../src/domain/auth/authorization-service.js";
import type { TimezoneResolver } from "../../src/infrastructure/time/timezone-resolver.js";

export function createClock(initial: Date) {
  let current = new Date(initial);
  return {
    now: () => new Date(current),
    advance(milliseconds: number) {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

export function createMembershipGateway(
  roleFor: (chatId: bigint, actorId: bigint) => "administrator" | "member",
): TelegramMembershipGateway {
  return {
    async getCurrentRole(chatId, actorId) {
      return roleFor(chatId, actorId);
    },
  };
}

export function createTimezoneResolver(timezone: string): TimezoneResolver {
  return {
    async resolve() {
      return { kind: "resolved", candidate: timezone };
    },
  };
}

export function transactionFailurePrisma() {
  return {
    async $transaction() {
      throw new Error("simulated persistence failure");
    },
  };
}
