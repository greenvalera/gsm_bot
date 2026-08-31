import type {
  CurrentTelegramRole,
  TelegramMembershipGateway,
} from "../../src/domain/auth/authorization-service.js";
import type { PlanningAccessPolicyValue } from "../../src/domain/chat/types.js";
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

/**
 * The role gateway, over the FULL `CurrentTelegramRole` union.
 *
 * It used to admit only `"administrator" | "member"`, which made `creator`,
 * `restricted`, `left`, `kicked` and `unknown` inexpressible — so the
 * fail-closed paths that depend on them could not be exercised at all, and a
 * regression in any of them would have passed unnoticed.
 */
export function createMembershipGateway(
  roleFor: (chatId: bigint, actorId: bigint) => CurrentTelegramRole,
): TelegramMembershipGateway {
  return {
    async getCurrentRole(chatId, actorId) {
      return roleFor(chatId, actorId);
    },
  };
}

/** A gateway whose lookup cannot be answered; the caller must fail closed. */
export function createUnavailableMembershipGateway(
  error: Error = new Error("Telegram membership lookup unavailable"),
): TelegramMembershipGateway {
  return {
    async getCurrentRole() {
      throw error;
    },
  };
}

export type ChatConfigurationFixture = Readonly<{
  timezone: string;
  defaultWeekday: number;
  defaultStartMinute: number;
  durationMinutes: number;
  dailyStartMinute: number;
  dailyEndMinute: number;
  reminderMinutes: number[];
  planningAccessPolicy: PlanningAccessPolicyValue;
  revision: number;
}>;

/**
 * A configured chat with the defaults this phase reasons about: a 10:00–21:00
 * daily window and a two-hour rehearsal, which is exactly the pair that yields
 * the ten hourly slots 10:00 … 19:00.
 */
export function createChatConfiguration(
  overrides: Partial<ChatConfigurationFixture> = {},
): ChatConfigurationFixture {
  return {
    timezone: "Europe/Kyiv",
    defaultWeekday: 3,
    defaultStartMinute: 600,
    durationMinutes: 120,
    dailyStartMinute: 600,
    dailyEndMinute: 1260,
    reminderMinutes: [600, 960],
    planningAccessPolicy: "ADMINS_ONLY",
    revision: 1,
    ...overrides,
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
