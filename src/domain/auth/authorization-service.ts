import type { PrismaClient } from "../../generated/prisma/client.js";
import type { SafeLogger } from "../../shared/logger.js";

export type CurrentTelegramRole =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked"
  | "unknown";

export interface TelegramMembershipGateway {
  getCurrentRole(chatId: bigint, actorId: bigint): Promise<CurrentTelegramRole>;
}

export class PermissionDeniedError extends Error {
  constructor() {
    super("Current chat administrator permission is required.");
    this.name = "PermissionDeniedError";
  }
}

/** See the same pair in `telegram/roster-handlers.ts` for the shared shape. */
const AUTHORIZATION_FAILURE_EVENT = "domain.authorization.failure";

/**
 * The bounded vocabulary of caught-exception sites on the authorization surface.
 *
 * One member today, and still the right shape: it keeps the `outcome` string
 * bounded and greppable, and it is what a second site would extend.
 */
const AUTHORIZATION_CATCH_SITES = {
  /** Telegram could not answer the membership lookup at all. */
  membershipLookup: { outcome: "membership-lookup-unavailable" },
} as const;

type AuthorizationCatchSite =
  (typeof AUTHORIZATION_CATCH_SITES)[keyof typeof AUTHORIZATION_CATCH_SITES];

export class AuthorizationService {
  constructor(
    private readonly prisma: Pick<PrismaClient, "setupDraft"> &
      Partial<Pick<PrismaClient, "settingsEditDraft">>,
    private readonly membershipGateway: TelegramMembershipGateway,
    private readonly logger: SafeLogger,
  ) {}

  /**
   * Records a membership lookup the denial path could not resolve.
   *
   * The caught value goes under `err` and nowhere else — the only key the
   * redactor renders structurally, as name, message and code, with the stack
   * dropped and secret shapes scrubbed from the message (threat T-e62-03).
   */
  private logFailure(
    site: AuthorizationCatchSite,
    chatId: bigint,
    actorId: bigint,
    error: unknown,
  ) {
    this.logger.error(
      {
        event: AUTHORIZATION_FAILURE_EVENT,
        chatId,
        actorId,
        outcome: site.outcome,
        err: error,
      },
      "Membership lookup could not be answered",
    );
  }

  /**
   * The actor's current role, with no side effect of any kind.
   *
   * The sibling below DELETES the actor's setup and settings drafts when it
   * denies, which is correct for an admin-only surface (threat T-01-08) and
   * catastrophic anywhere else: a band member tapping a planning button would
   * silently destroy an administrator's in-progress wizard (Pitfall 2). Every
   * surface whose authority is broader than "current administrator" must call
   * THIS method instead.
   *
   * An unanswerable lookup resolves to `"unknown"` rather than throwing, and
   * `canStartPlanning` denies `"unknown"` — so the caller fails closed without
   * having to catch anything. The failure is still recorded, with the caught
   * value under `err`, exactly as the sibling records it.
   */
  async currentRole(
    chatId: bigint,
    actorId: bigint,
  ): Promise<CurrentTelegramRole> {
    try {
      return await this.membershipGateway.getCurrentRole(chatId, actorId);
    } catch (error) {
      this.logFailure(
        AUTHORIZATION_CATCH_SITES.membershipLookup,
        chatId,
        actorId,
        error,
      );
      return "unknown";
    }
  }

  /**
   * Destroys the actor's in-flight privileged drafts.
   *
   * Extracted so there is exactly ONE copy of this side effect. It belongs to
   * a refusal on an ADMIN-ONLY surface: a demoted administrator's half-finished
   * wizard must not survive to promote later (threat T-01-08).
   *
   * It must NEVER run for a surface whose authority is resolved elsewhere. A
   * band member tapping a planning button would otherwise silently destroy an
   * unrelated administrator's work (threat T-02-14) — which is why the callback
   * boundary calls this only once the action row proves the kind is admin-only,
   * and never on an unparseable or unknown token, whose surface is unknowable.
   */
  async discardActorDrafts(chatId: bigint, actorId: bigint): Promise<void> {
    await this.prisma.setupDraft.deleteMany({
      where: { chatId, actorUserId: actorId },
    });
    if (this.prisma.settingsEditDraft !== undefined) {
      await this.prisma.settingsEditDraft.deleteMany({
        where: { chatId, actorUserId: actorId },
      });
    }
  }

  async requireCurrentAdministrator(
    chatId: bigint,
    actorId: bigint,
  ): Promise<void> {
    let role: CurrentTelegramRole;
    try {
      role = await this.membershipGateway.getCurrentRole(chatId, actorId);
    } catch (error) {
      // Membership evidence that cannot be refreshed is never authority, so
      // access is still denied here — fail-closed, unchanged.
      //
      // The draft cleanup below deliberately does NOT run on this path: an
      // unanswerable lookup is not authority, but it is also not proof of
      // demotion, so it must not destroy the actor's in-progress work. A
      // transient 429 mid-`/setup` would otherwise wipe a CURRENT
      // administrator's wizard and tell them something false (threat T-e62-02).
      this.logFailure(
        AUTHORIZATION_CATCH_SITES.membershipLookup,
        chatId,
        actorId,
        error,
      );
      throw new PermissionDeniedError();
    }

    if (role === "creator" || role === "administrator") {
      return;
    }

    await this.discardActorDrafts(chatId, actorId);
    throw new PermissionDeniedError();
  }
}
