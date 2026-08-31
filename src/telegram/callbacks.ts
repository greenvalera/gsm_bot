import type { Bot, Context, Filter, NextFunction } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { AuthorizationService } from "../domain/auth/authorization-service.js";
import { isCurrentMember } from "../domain/auth/planning-access-service.js";
import {
  actionContext,
  callbackTokenSchema,
  type ActionContext,
} from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import {
  dispatchSetupCallback,
  type SetupHandlerDependencies,
} from "./setup-handlers.js";
import {
  dispatchSettingsCallback,
  type SettingsHandlerDependencies,
} from "./settings-handlers.js";
import {
  dispatchRosterCallback,
  type RosterHandlerDependencies,
} from "./roster-handlers.js";
import {
  dispatchPlanningCallback,
  type PlanningHandlerDependencies,
} from "./planning-handlers.js";

/** Copy contract (01-UI-SPEC.md) for the shared callback boundary. */
export const CALLBACK_DENIAL = "Only current chat administrators can do that.";
export const SETUP_STALE_TEXT =
  "This setup action is no longer available. Send /setup to start again.";
export const GENERIC_STALE_TEXT =
  "This action is no longer available. Open /settings or /roster and try again.";
export const PLANNING_STALE_TEXT =
  "This planning action is no longer available. Send /plan to start again.";

/** Any callback context the boundary can hand to a feature dispatcher. */
export type CallbackContext = Filter<Context, "callback_query:data">;

/**
 * The authoritative server-side record behind one opaque token. Every binding
 * a dispatcher may trust — chat, actor, target, expiry, consumption — lives
 * here, never in the token.
 */
export type CallbackActionRow = Readonly<{
  token: string;
  kind: CallbackActionKind;
  chatId: bigint;
  actorUserId: bigint;
  targetId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}>;

export type CallbackDispatcher = (
  ctx: CallbackContext,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) => Promise<void>;

/**
 * WHO a route accepts, as an explicit declaration rather than a boundary-wide
 * assumption.
 *
 * - `current-admin` — Phase 1 behaviour, unchanged: only a current chat
 *   administrator may act, and every other role receives `CALLBACK_DENIAL`.
 * - `route-resolved` — the route resolves authority from durable state (the
 *   round's author), so a non-administrator who legitimately owns the card can
 *   press its buttons. The boundary still refuses anyone who is not a current
 *   member of the chat at all.
 */
export type CallbackAuthority = "current-admin" | "route-resolved";

/**
 * WHERE the `actorUserId` comparison happens.
 *
 * `strict` keeps it at the boundary, where a mismatch is indistinguishable from
 * a stale action. `route-resolved` defers only that one comparison to the
 * dispatcher so a refusal can name the owning author instead of claiming the
 * button expired. The chat binding and the expiry check stay at the boundary
 * for every route regardless (threat T-02-02).
 */
export type CallbackActorBinding = "strict" | "route-resolved";

/** One feature surface's dispatch entry, keyed by the stored action kind. */
export type CallbackRoute = Readonly<{
  staleText: string;
  authority: CallbackAuthority;
  actorBinding: CallbackActorBinding;
  dispatch: CallbackDispatcher;
}>;

export type CallbackRouteTable = Partial<
  Record<CallbackActionKind, CallbackRoute>
>;

export interface CallbackBoundaryDependencies {
  /**
   * Required: the boundary's terminating branches used to return silently, so a
   * genuinely silent defect (F-3) left no evidence at all. Every exit logs now.
   */
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  now: () => Date;
}

export interface ChatReadinessCallbackDependencies extends CallbackBoundaryDependencies {
  setup: SetupHandlerDependencies["setup"];
  settings: SettingsHandlerDependencies["settings"];
  roster: RosterHandlerDependencies["roster"];
  planning: PlanningHandlerDependencies["planning"];
  timezoneResolver: SetupHandlerDependencies["timezoneResolver"];
}

/** The one event name every callback boundary record carries. */
const CALLBACK_EVENT = "telegram.callback";

/**
 * The bounded outcome/reason vocabulary for the boundary's terminating exits.
 *
 * Finding F-4 was that every one of these branches returned in silence, so a
 * genuinely silent defect (F-3) left no trace at all. The three branches that
 * funnel through the shared `unresolved` helper share an outcome but carry
 * three DIFFERENT reasons, and the reason is supplied by the branch rather than
 * chosen inside the helper — otherwise they would be indistinguishable in the
 * logs, which is the whole failure being closed here (threat T-01-21-04).
 */
export const CALLBACK_BOUNDARY_BRANCHES = {
  unresolvedContext: {
    outcome: "unresolved-context",
    reason: "missing-chat-or-actor-context",
  },
  denied: { outcome: "denied", reason: "permission-denied" },
  /**
   * A route-resolved kind tapped by someone who is not in the chat at all
   * (`left`, `kicked`, or a role that could not be refreshed).
   *
   * Distinct from `denied` on purpose: "you are not an administrator" and "you
   * are not here" are different operator questions, and collapsing them would
   * hide a departed member probing a live card.
   */
  deniedNonMember: { outcome: "denied", reason: "not-a-current-chat-member" },
  unparseableToken: {
    outcome: "unresolved-action",
    reason: "unparseable-token",
  },
  unknownAction: { outcome: "unresolved-action", reason: "unknown-action-row" },
  unroutedKind: {
    outcome: "unresolved-action",
    reason: "unrouted-action-kind",
  },
  stale: { outcome: "stale", reason: "stale-or-mis-bound-action" },
  dispatched: { outcome: "dispatched", reason: "action-dispatched" },
  /**
   * The bare fallback acknowledgement could not be delivered.
   *
   * This is not one of the twelve handler sites plan 01-22 names, but it is the
   * same defect: an unbound `catch` in the Telegram layer. It matters on its own
   * because in the common case — the body succeeded and only the bare ack failed
   * — this is the ONLY evidence that the user's client is still showing a
   * spinner. `bot.catch` never sees it, because nothing is rethrown here.
   */
  fallbackAcknowledgementFailed: {
    outcome: "acknowledgement-failed",
    reason: "fallback-acknowledgement-delivery-failed",
  },
} as const;

type CallbackBoundaryBranch =
  (typeof CALLBACK_BOUNDARY_BRANCHES)[keyof typeof CALLBACK_BOUNDARY_BRANCHES];

/**
 * One line per handled callback, at the default configured level.
 *
 * Every identifier is a bigint, a number or a bounded enum member — never an
 * object, because an allow-listed key holding an object is redacted rather than
 * walked (threat T-01-21-02). The opaque token, the raw update and any message
 * text are deliberately absent (threat T-01-21-01).
 */
function logCallbackBranch(
  deps: CallbackBoundaryDependencies,
  updateId: number,
  branch: CallbackBoundaryBranch,
  context?: ActionContext,
  callbackKind?: CallbackActionKind,
) {
  deps.logger.info(
    {
      event: CALLBACK_EVENT,
      outcome: branch.outcome,
      reason: branch.reason,
      updateId,
      chatId: context?.chatId,
      actorId: context?.actorId,
      callbackKind,
    },
    "Handled Telegram callback",
  );
}

/**
 * The narrow shape the single-shot acknowledgement guard overrides.
 *
 * Telegram honours only the FIRST answer per `callback_query.id` and silently
 * discards every later one, so the boundary may not spend that one answer on a
 * bare acknowledgement before it knows the outcome. The override shadows the
 * prototype method with an identical signature for the lifetime of one update.
 */
type AnswerableContext = {
  answerCallbackQuery: CallbackContext["answerCallbackQuery"];
};

/**
 * The single callback boundary for the phase.
 *
 * Order is the contract: refresh the current administrator role first, then
 * parse a version-prefixed opaque token, then load the authoritative action
 * row, and only then dispatch by the stored kind. Nothing carried in the token
 * is ever authority.
 *
 * The one answer Telegram honours is reserved for the branch that owns the
 * outcome, so a denial, stale or duplicate alert is the answer the client
 * actually sees. A branch that chooses no text still gets a bare acknowledgement
 * from the boundary, so no client is left showing progress.
 *
 * `exhaustive` marks the registration that owns every callback in the bot; a
 * focused registration instead passes an unowned token to the next handler.
 *
 * Every terminating exit records a distinct event/outcome/reason triple before
 * it returns, including the exits that answer nothing. A branch that returns in
 * silence is exactly what made finding F-3 undiagnosable from the live run.
 */
export function registerCallbackBoundary(
  bot: Bot,
  deps: CallbackBoundaryDependencies,
  routes: CallbackRouteTable,
  options: Readonly<{ exhaustive: boolean }>,
) {
  async function unresolved(ctx: CallbackContext, next: NextFunction) {
    if (!options.exhaustive) return next();
    await ctx.answerCallbackQuery({
      text: GENERIC_STALE_TEXT,
      show_alert: true,
    });
  }

  bot.on("callback_query:data", async (ctx, next) => {
    // Telegram honours only the first answer for this callback_query.id, so
    // bind a single-shot guard to it: the first branch to answer wins, and any
    // later answer resolves without spending a request that would be discarded.
    const deliver = ctx.answerCallbackQuery.bind(ctx);
    let answered = false;
    (ctx as AnswerableContext).answerCallbackQuery = async (...args) => {
      if (answered) return true;
      answered = true;
      return deliver(...args);
    };

    const updateId = ctx.update.update_id;

    try {
      const context = actionContext(ctx.chat?.id, ctx.from?.id);
      if (context === undefined) {
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.unresolvedContext,
        );
        return;
      }

      // A FRESH role lookup, still before the token parse and before any
      // durable read. Only the DENIAL DECISION moves after the kind is known,
      // and only for non-administrators (threat T-02-12). This accessor is
      // deliberately non-destructive: the administrator-requirement path
      // deletes the actor's setup and settings drafts on denial, so calling it
      // here would let a band member's tap destroy an administrator's
      // in-progress wizard (threat T-02-14).
      const role = await deps.authorization.currentRole(
        context.chatId,
        context.actorId,
      );
      const isAdministrator = role === "creator" || role === "administrator";

      /** Every non-administrator refusal answers the identical Phase 1 alert. */
      const denyNonAdministrator = async (
        branch: CallbackBoundaryBranch,
        callbackKind?: CallbackActionKind,
      ) => {
        logCallbackBranch(deps, updateId, branch, context, callbackKind);
        await ctx.answerCallbackQuery({
          text: CALLBACK_DENIAL,
          show_alert: true,
        });
      };

      if (isAdministrator) {
        deps.logger.debug(
          {
            event: "telegram.callback.authorized",
            updateId,
            chatId: context.chatId,
            actorId: context.actorId,
          },
          "Callback actor holds the current administrator role",
        );
      }

      const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
      if (!token.success) {
        if (!isAdministrator) {
          // Identical to Phase 1: a non-administrator with an unusable token
          // learns only that they may not act, never whether the token exists.
          return await denyNonAdministrator(
            CALLBACK_BOUNDARY_BRANCHES.unparseableToken,
          );
        }
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.unparseableToken,
          context,
        );
        return await unresolved(ctx, next);
      }

      const action = (await deps.prisma.callbackAction.findUnique({
        where: { token: token.data },
      })) as CallbackActionRow | null;
      if (action === null) {
        if (!isAdministrator) {
          return await denyNonAdministrator(
            CALLBACK_BOUNDARY_BRANCHES.unknownAction,
          );
        }
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.unknownAction,
          context,
        );
        return await unresolved(ctx, next);
      }

      const route = routes[action.kind];
      if (route === undefined) {
        if (!isAdministrator) {
          return await denyNonAdministrator(
            CALLBACK_BOUNDARY_BRANCHES.unroutedKind,
            action.kind,
          );
        }
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.unroutedKind,
          context,
          action.kind,
        );
        return await unresolved(ctx, next);
      }

      if (!isAdministrator) {
        // The kind is known now, so the route's own declaration decides.
        if (route.authority === "current-admin") {
          // The row proves this surface is admin-only, so Phase 1's
          // delete-on-denial side effect still applies in full: a demoted
          // administrator's in-flight wizard must not survive to promote later
          // (threat T-01-08). It fires HERE, after the kind is known, rather
          // than before the parse — so it can no longer reach an actor whose
          // tap was on a route-resolved surface (threat T-02-14).
          await deps.authorization.discardActorDrafts(
            context.chatId,
            context.actorId,
          );
          return await denyNonAdministrator(
            CALLBACK_BOUNDARY_BRANCHES.denied,
            action.kind,
          );
        }
        // A route-resolved kind still requires the actor to be in the chat.
        // `left`, `kicked` and an unrefreshable `unknown` all fail closed here,
        // before the dispatcher sees the update.
        if (!isCurrentMember(role)) {
          return await denyNonAdministrator(
            CALLBACK_BOUNDARY_BRANCHES.deniedNonMember,
            action.kind,
          );
        }
      }

      const now = deps.now();
      if (
        action.chatId !== context.chatId ||
        action.expiresAt <= now ||
        (route.actorBinding === "strict" &&
          action.actorUserId !== context.actorId)
      ) {
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.stale,
          context,
          action.kind,
        );
        await ctx.answerCallbackQuery({
          text: route.staleText,
          show_alert: true,
        });
        return;
      }

      logCallbackBranch(
        deps,
        updateId,
        CALLBACK_BOUNDARY_BRANCHES.dispatched,
        context,
        action.kind,
      );
      await route.dispatch(ctx, context, action, now);
    } finally {
      // No branch chose an outcome text, so acknowledge bare and stop the
      // client showing progress. A failure delivering this fallback must never
      // replace or mask an error already in flight from the body above;
      // bot.catch stays the terminal seam for those.
      if (!answered) {
        try {
          await ctx.answerCallbackQuery();
        } catch (error) {
          // The in-flight outcome, if any, still owns this update — nothing is
          // rethrown, so `bot.catch` never sees this. That makes the line below
          // the only trace that the client was left showing progress.
          deps.logger.error(
            {
              event: CALLBACK_EVENT,
              outcome:
                CALLBACK_BOUNDARY_BRANCHES.fallbackAcknowledgementFailed
                  .outcome,
              reason:
                CALLBACK_BOUNDARY_BRANCHES.fallbackAcknowledgementFailed.reason,
              updateId,
              chatId:
                ctx.chat?.id === undefined ? undefined : BigInt(ctx.chat.id),
              err: error,
            },
            "Callback boundary could not deliver the fallback acknowledgement",
          );
        }
      }
    }
  });
}

/** The roster-only dispatch entry, reused by the composed and focused routes. */
export function rosterCallbackRoute(deps: RosterHandlerDependencies) {
  return {
    staleText: GENERIC_STALE_TEXT,
    authority: "current-admin",
    actorBinding: "strict",
    dispatch: (
      ctx: CallbackContext,
      context: ActionContext,
      action: CallbackActionRow,
      now: Date,
    ) => dispatchRosterCallback(ctx, deps, context, action, now),
  } satisfies CallbackRoute;
}

/**
 * The planning dispatch entry — the one route whose authority is not "current
 * administrator".
 *
 * `route-resolved` on both axes: the boundary admits any current chat member
 * whom the planning-access policy let start a round, and the dispatcher decides
 * ownership from `PlanningRound.authorUserId`, a durable column.
 */
export function planningCallbackRoute(deps: PlanningHandlerDependencies) {
  return {
    staleText: PLANNING_STALE_TEXT,
    authority: "route-resolved",
    actorBinding: "route-resolved",
    dispatch: (
      ctx: CallbackContext,
      context: ActionContext,
      action: CallbackActionRow,
      now: Date,
    ) => dispatchPlanningCallback(ctx, deps, context, action, now),
  } satisfies CallbackRoute;
}

/** Registers exhaustive Phase 1 callback dispatch for a fully composed bot. */
export function registerChatReadinessCallbacks(
  bot: Bot,
  deps: ChatReadinessCallbackDependencies,
) {
  registerCallbackBoundary(
    bot,
    deps,
    {
      [CallbackActionKind.START_SETUP]: {
        staleText: SETUP_STALE_TEXT,
        authority: "current-admin",
        actorBinding: "strict",
        dispatch: (ctx, context, action, now) =>
          dispatchSetupCallback(ctx, deps, context, action, now),
      },
      [CallbackActionKind.SETTINGS_EDIT]: {
        staleText: GENERIC_STALE_TEXT,
        authority: "current-admin",
        actorBinding: "strict",
        dispatch: (ctx, context, action, now) =>
          dispatchSettingsCallback(ctx, deps, context, action, now),
      },
      [CallbackActionKind.ROSTER_REMOVE]: rosterCallbackRoute(deps),
      // Registered inside the SAME exhaustive call: `unresolved()` calls
      // `next()` only when `!options.exhaustive`, so a second
      // `registerCallbackBoundary` would never run.
      [CallbackActionKind.PLANNING]: planningCallbackRoute(deps),
    },
    { exhaustive: true },
  );
}
