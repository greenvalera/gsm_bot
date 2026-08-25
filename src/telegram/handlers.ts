import type { Bot } from "grammy";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import type { SetupService } from "../domain/chat/setup-service.js";
import type { SettingsService } from "../domain/chat/settings-service.js";
import type { RosterService } from "../domain/roster/roster-service.js";
import type { TimezoneResolver } from "../infrastructure/time/timezone-resolver.js";
import {
  actionContext,
  type ActionContext,
} from "../shared/callback-schema.js";
import {
  registerCallbackBoundary,
  registerChatReadinessCallbacks,
  rosterCallbackRoute,
} from "./callbacks.js";
import {
  COMMAND_DENIAL,
  handleSetupCommand,
  handleSetupLocation,
  handleSetupText,
} from "./setup-handlers.js";
import {
  findSettingsDraft,
  handleSettingsCommand,
  handleSettingsLocation,
  handleSettingsText,
} from "./settings-handlers.js";
import {
  handleRosterAddCommand,
  handleRosterCommand,
  type RosterHandlerDependencies,
} from "./roster-handlers.js";
import { CallbackActionKind } from "../generated/prisma/client.js";

export interface ChatReadinessServices {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  setup: SetupService;
  settings: SettingsService;
  roster: RosterService;
  timezoneResolver: TimezoneResolver;
  now: () => Date;
}

export type ChatReadinessRouteKind = "command" | "update" | "callback";

/**
 * WHEN a route's authorization boundary applies.
 *
 * - `always` — every update on the route IS a protected action by definition.
 * - `in-flight` — the route merely CARRIES a protected action: it is protected
 *   only while the acting user has a prompt in flight.
 */
export type ChatReadinessProtection = "always" | "in-flight";

/**
 * The complete Phase 1 Telegram surface. Every entry is registered exactly once
 * by `registerChatReadinessHandlers` and every entry crosses the same current
 * administrator boundary before any protected read or mutation.
 */
export type ChatReadinessRoute = Readonly<{
  id: string;
  kind: ChatReadinessRouteKind;
  filter: string;
  surface: "setup" | "settings" | "roster";
  protectedRoute: true;
  protectedWhen: ChatReadinessProtection;
}>;

/**
 * Every route is protected — `protectedRoute` stays `true` throughout, because
 * every one of them crosses the same authorization boundary. `protectedWhen`
 * records the condition the flat flag was hiding.
 *
 * That conflation is the model error behind finding F-7. The two update routes
 * were declared `protectedRoute: true` exactly like the four commands, which
 * made "authorize at the top of the handler" look correct to the implementer
 * and to the test — so an ordinary non-administrator message was refused, in a
 * live group, every single time. A command IS a protected action; a text or
 * location message only BECOMES one when it answers a live prompt. Routes
 * marked `in-flight` must therefore establish route ownership before they
 * authorize (see `hasInFlightAction`).
 */
export const CHAT_READINESS_ROUTES: readonly ChatReadinessRoute[] = [
  {
    id: "command:setup",
    kind: "command",
    filter: "setup",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "command:settings",
    kind: "command",
    filter: "settings",
    surface: "settings",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "command:roster",
    kind: "command",
    filter: "roster",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "command:roster_add",
    kind: "command",
    filter: "roster_add",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "update:message:location",
    kind: "update",
    filter: "message:location",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "in-flight",
  },
  {
    id: "update:message:text",
    kind: "update",
    filter: "message:text",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "in-flight",
  },
  {
    id: "callback:START_SETUP",
    kind: "callback",
    filter: "callback_query:data",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "callback:SETTINGS_EDIT",
    kind: "callback",
    filter: "callback_query:data",
    surface: "settings",
    protectedRoute: true,
    protectedWhen: "always",
  },
  {
    id: "callback:ROSTER_REMOVE",
    kind: "callback",
    filter: "callback_query:data",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
  },
];

/**
 * The single authorization gate. Every registered route calls it exactly once
 * per update, so a protected route cannot reach durable state without a fresh
 * `getChatMember` result for the acting user.
 */
async function authorize(
  services: ChatReadinessServices,
  context: ActionContext,
) {
  try {
    await services.authorization.requireCurrentAdministrator(
      context.chatId,
      context.actorId,
    );
    return true;
  } catch (error) {
    if (error instanceof PermissionDeniedError) return false;
    throw error;
  }
}

/**
 * True when this actor has an in-flight action of their own in this chat.
 *
 * Both reads are `findUnique` on the `chatId_actorUserId` unique key, so the
 * probe touches only the acting user's own rows and writes nothing. That is
 * what makes it safe to run BEFORE the administrator check: nothing privileged
 * and nothing observable about another member happens ahead of the role lookup.
 *
 * An EXISTING row counts as an in-flight action regardless of its `expiresAt`.
 * That is a deliberate, binding decision rather than an oversight:
 *  - it keeps the documented expiry copy reachable, because a lapsed draft
 *    still hands the turn to the wizard, which reports `DRAFT_EXPIRED`; and
 *  - it keeps the probe read-only. `SetupService.requireActive` DELETES an
 *    expired row before reporting it, so it must never be used here — that
 *    would mutate durable state ahead of the role check.
 *
 * Only the total absence of BOTH rows means "ordinary message", which the two
 * carrier routes answer with silence.
 */
async function hasInFlightAction(
  services: ChatReadinessServices,
  context: ActionContext,
) {
  const where = {
    chatId_actorUserId: {
      chatId: context.chatId,
      actorUserId: context.actorId,
    },
  };
  const setupDraft = await services.prisma.setupDraft.findUnique({ where });
  if (setupDraft !== null) return true;
  const settingsDraft = await services.prisma.settingsEditDraft.findUnique({
    where,
  });
  return settingsDraft !== null;
}

/**
 * Registers every Phase 1 command, message update, and callback exactly once.
 *
 * A single registration point is what makes the authorization boundary
 * provable. The four commands are inherently protected actions, so they
 * authorize at the top. `message:location` and `message:text` are carrier
 * routes: they establish route ownership first and authorize only once the
 * update is known to answer a live prompt, so an ordinary message costs no
 * role lookup, no draft deletion and no reply. Everything downstream of the
 * gate is unchanged. Feature services and renderers stay in their own modules.
 */
export function registerChatReadinessHandlers(
  bot: Bot,
  services: ChatReadinessServices,
) {
  bot.command("setup", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorize(services, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleSetupCommand(ctx, services, context);
  });

  bot.command("settings", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorize(services, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleSettingsCommand(ctx, services, context);
  });

  bot.command("roster_add", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorize(services, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleRosterAddCommand(ctx, services, context);
  });

  bot.command("roster", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorize(services, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleRosterCommand(ctx, services, context);
  });

  bot.on("message:location", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;
    // Route ownership before authorization: a shared location is a protected
    // action only while this actor has a prompt in flight.
    if (!(await hasInFlightAction(services, context))) return;
    if (!(await authorize(services, context))) {
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    const now = services.now();
    const draft = await findSettingsDraft(services, context, now);
    if (draft !== null) {
      await handleSettingsLocation(
        ctx,
        services,
        context,
        draft,
        ctx.message.location,
        now,
      );
      return;
    }
    await handleSetupLocation(ctx, services, context, ctx.message.location);
  });

  bot.on("message:text", async (ctx) => {
    // Commands are matched by their own routes above; a leading slash never
    // enters a wizard step and never costs a role lookup.
    if (ctx.message.text.startsWith("/")) return;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;
    // Route ownership before authorization: an ordinary sentence is not a
    // protected action, so it is answered with silence rather than a refusal.
    if (!(await hasInFlightAction(services, context))) return;
    if (!(await authorize(services, context))) {
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    const now = services.now();
    const draft = await findSettingsDraft(services, context, now);
    if (draft !== null) {
      await handleSettingsText(
        ctx,
        services,
        context,
        draft,
        ctx.message.text,
        now,
      );
      return;
    }
    await handleSetupText(ctx, services, context, ctx.message.text);
  });

  registerChatReadinessCallbacks(bot, services);
}

/**
 * Registers the roster surface alone against the same shared callback boundary.
 * Focused roster tests use it; the composed bot uses
 * `registerChatReadinessHandlers`.
 */
export function registerRosterHandlers(
  bot: Bot,
  deps: RosterHandlerDependencies,
) {
  async function authorizeRoster(context: ActionContext) {
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
      return true;
    } catch (error) {
      if (error instanceof PermissionDeniedError) return false;
      throw error;
    }
  }

  bot.command("roster_add", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorizeRoster(context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleRosterAddCommand(ctx, deps, context);
  });

  bot.command("roster", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await authorizeRoster(context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    await handleRosterCommand(ctx, deps, context);
  });

  registerCallbackBoundary(
    bot,
    deps,
    { [CallbackActionKind.ROSTER_REMOVE]: rosterCallbackRoute(deps) },
    { exhaustive: false },
  );
}
