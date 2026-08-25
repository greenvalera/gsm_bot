import type { Bot, Context, Filter, NextFunction } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
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

/** Copy contract (01-UI-SPEC.md) for the shared callback boundary. */
export const CALLBACK_DENIAL = "Only current chat administrators can do that.";
export const SETUP_STALE_TEXT =
  "This setup action is no longer available. Send /setup to start again.";
export const GENERIC_STALE_TEXT =
  "This action is no longer available. Open /settings or /roster and try again.";

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

/** One feature surface's dispatch entry, keyed by the stored action kind. */
export type CallbackRoute = Readonly<{
  staleText: string;
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

      try {
        await deps.authorization.requireCurrentAdministrator(
          context.chatId,
          context.actorId,
        );
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) throw error;
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.denied,
          context,
        );
        await ctx.answerCallbackQuery({
          text: CALLBACK_DENIAL,
          show_alert: true,
        });
        return;
      }

      deps.logger.debug(
        {
          event: "telegram.callback.authorized",
          updateId,
          chatId: context.chatId,
          actorId: context.actorId,
        },
        "Callback actor holds the current administrator role",
      );

      const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
      if (!token.success) {
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
        logCallbackBranch(
          deps,
          updateId,
          CALLBACK_BOUNDARY_BRANCHES.unroutedKind,
          context,
          action.kind,
        );
        return await unresolved(ctx, next);
      }

      const now = deps.now();
      if (
        action.chatId !== context.chatId ||
        action.actorUserId !== context.actorId ||
        action.expiresAt <= now
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
        } catch {
          /* the in-flight outcome, if any, owns this update */
        }
      }
    }
  });
}

/** The roster-only dispatch entry, reused by the composed and focused routes. */
export function rosterCallbackRoute(deps: RosterHandlerDependencies) {
  return {
    staleText: GENERIC_STALE_TEXT,
    dispatch: (
      ctx: CallbackContext,
      context: ActionContext,
      action: CallbackActionRow,
      now: Date,
    ) => dispatchRosterCallback(ctx, deps, context, action, now),
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
        dispatch: (ctx, context, action, now) =>
          dispatchSetupCallback(ctx, deps, context, action, now),
      },
      [CallbackActionKind.SETTINGS_EDIT]: {
        staleText: GENERIC_STALE_TEXT,
        dispatch: (ctx, context, action, now) =>
          dispatchSettingsCallback(ctx, deps, context, action, now),
      },
      [CallbackActionKind.ROSTER_REMOVE]: rosterCallbackRoute(deps),
    },
    { exhaustive: true },
  );
}
