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

/**
 * The single callback boundary for the phase.
 *
 * Order is the contract: acknowledge first so Telegram stops showing progress,
 * then refresh the current administrator role, then parse a version-prefixed
 * opaque token, then load the authoritative action row, and only then dispatch
 * by the stored kind. Nothing carried in the token is ever authority.
 *
 * `exhaustive` marks the registration that owns every callback in the bot; a
 * focused registration instead passes an unowned token to the next handler.
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
    // Acknowledged before any parse, role lookup, or durable read.
    await ctx.answerCallbackQuery();

    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;

    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (!(error instanceof PermissionDeniedError)) throw error;
      await ctx.answerCallbackQuery({
        text: CALLBACK_DENIAL,
        show_alert: true,
      });
      return;
    }

    const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
    if (!token.success) return unresolved(ctx, next);

    const action = (await deps.prisma.callbackAction.findUnique({
      where: { token: token.data },
    })) as CallbackActionRow | null;
    if (action === null) return unresolved(ctx, next);

    const route = routes[action.kind];
    if (route === undefined) return unresolved(ctx, next);

    const now = deps.now();
    if (
      action.chatId !== context.chatId ||
      action.actorUserId !== context.actorId ||
      action.expiresAt <= now
    ) {
      await ctx.answerCallbackQuery({
        text: route.staleText,
        show_alert: true,
      });
      return;
    }

    await route.dispatch(ctx, context, action, now);
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
