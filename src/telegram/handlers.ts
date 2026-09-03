import type { Bot } from "grammy";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import type { SetupService } from "../domain/chat/setup-service.js";
import type { SettingsService } from "../domain/chat/settings-service.js";
import {
  canStartPlanning,
  isCurrentMember,
} from "../domain/auth/planning-access-service.js";
import type { RosterService } from "../domain/roster/roster-service.js";
import type { PlanningService } from "../domain/planning/planning-service.js";
import type { TimezoneResolver } from "../infrastructure/time/timezone-resolver.js";
import type { SafeLogger } from "../shared/logger.js";
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
  handleExpiredSettingsDraft,
  handleSettingsCommand,
  handleSettingsLocation,
  handleSettingsText,
} from "./settings-handlers.js";
import {
  handleRosterAddCommand,
  handleRosterCommand,
  type RosterHandlerDependencies,
} from "./roster-handlers.js";
import {
  handlePlanCommand,
  handlePlanStatusCommand,
  PLANNING_DENIAL,
  PLANNING_STATUS_DENIAL,
} from "./planning-handlers.js";
import { CallbackActionKind } from "../generated/prisma/client.js";

export interface ChatReadinessServices {
  /** Required: every route must be able to leave a trace. See create-bot.ts. */
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  setup: SetupService;
  settings: SettingsService;
  roster: RosterService;
  planning: PlanningService;
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
 * The closed set of route identifiers. Declaring it as a union rather than
 * `string` is what stops a hand-written route label reaching a log line: a
 * caller cannot name a route the table does not contain (threat T-01-21-06).
 */
export type ChatReadinessRouteId =
  | "command:setup"
  | "command:settings"
  | "command:roster"
  | "command:roster_add"
  | "command:plan"
  | "command:plan_status"
  | "update:message:location"
  | "update:message:text"
  | "callback:START_SETUP"
  | "callback:SETTINGS_EDIT"
  | "callback:ROSTER_REMOVE"
  | "callback:PLANNING";

/**
 * WHO a route accepts.
 *
 * `protectedWhen` records WHEN a route's boundary applies — the distinction
 * whose absence caused finding F-7. This is the second dimension: every Phase 1
 * route answers to the current chat administrator and nobody else, while the
 * planning surface exists precisely because a non-administrator may legitimately
 * own a card. Leaving that implicit is how the callback boundary came to deny
 * every non-administrator before it had even parsed the token.
 */
export type ChatReadinessAuthority =
  /** Current chat administrator, refreshed per update. */
  | "current-admin"
  /** `canStartPlanning` over the chat's configured broadening policy. */
  | "planning-access-policy"
  /** Any current member of the chat, fail-closed on an unavailable lookup. */
  | "chat-member"
  /** The route resolves authority from durable state (the round's author). */
  | "route-resolved";

/**
 * The complete Phase 1 Telegram surface. Every entry is registered exactly once
 * by `registerChatReadinessHandlers` and every entry crosses the same current
 * administrator boundary before any protected read or mutation.
 */
export type ChatReadinessRoute = Readonly<{
  id: ChatReadinessRouteId;
  kind: ChatReadinessRouteKind;
  filter: string;
  surface: "setup" | "settings" | "roster" | "planning";
  protectedRoute: true;
  protectedWhen: ChatReadinessProtection;
  authority: ChatReadinessAuthority;
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
    authority: "current-admin",
  },
  {
    id: "command:settings",
    kind: "command",
    filter: "settings",
    surface: "settings",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
  {
    id: "command:roster",
    kind: "command",
    filter: "roster",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
  {
    id: "command:roster_add",
    kind: "command",
    filter: "roster_add",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
  {
    id: "update:message:location",
    kind: "update",
    filter: "message:location",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "in-flight",
    authority: "current-admin",
  },
  {
    id: "update:message:text",
    kind: "update",
    filter: "message:text",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "in-flight",
    authority: "current-admin",
  },
  {
    id: "callback:START_SETUP",
    kind: "callback",
    filter: "callback_query:data",
    surface: "setup",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
  {
    id: "callback:SETTINGS_EDIT",
    kind: "callback",
    filter: "callback_query:data",
    surface: "settings",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
  {
    id: "callback:ROSTER_REMOVE",
    kind: "callback",
    filter: "callback_query:data",
    surface: "roster",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "current-admin",
  },
];

/**
 * The planning surface. Declared alongside the Phase 1 table rather than merged
 * into it, so `CHAT_READINESS_ROUTES` keeps meaning exactly "the routes that
 * answer to a current chat administrator" and a reader can see at a glance
 * which routes do not.
 *
 * Every step is button-driven, so no `message:text` or `message:location` route
 * is added — deliberately avoiding the open deferred item N-6.
 */
export const PLANNING_ROUTES: readonly ChatReadinessRoute[] = [
  {
    id: "command:plan",
    kind: "command",
    filter: "plan",
    surface: "planning",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "planning-access-policy",
  },
  /**
   * The only side-effecting command in the phase that no ROLE gates.
   *
   * D-15 grants visibility to everyone in the chat, so its authority is
   * `chat-member` — "are you here", not "are you the author" and not "are you an
   * administrator". Control stays with the author through the dispatcher's
   * ownership check (D-02), and the flood risk that comes with an open command
   * is carried by the round's own `lastStatusPostedAt` cooldown rather than by
   * the route.
   */
  {
    id: "command:plan_status",
    kind: "command",
    filter: "plan_status",
    surface: "planning",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "chat-member",
  },
  {
    id: "callback:PLANNING",
    kind: "callback",
    filter: "callback_query:data",
    surface: "planning",
    protectedRoute: true,
    protectedWhen: "always",
    authority: "route-resolved",
  },
];

/** Every registered route, and the only table the route-id resolver consults. */
export const ALL_ROUTES: readonly ChatReadinessRoute[] = [
  ...CHAT_READINESS_ROUTES,
  ...PLANNING_ROUTES,
];

const ROUTE_BY_ID: ReadonlyMap<string, ChatReadinessRoute> = new Map(
  ALL_ROUTES.map((route) => [route.id, route]),
);

/**
 * Resolves a route identifier from the one route table.
 *
 * The union type already bounds the vocabulary at compile time; this lookup
 * additionally proves at run time that the emitted label is a member of the
 * table, so the table cannot drift away from what the logs claim.
 */
export function chatReadinessRouteId(id: ChatReadinessRouteId): string {
  const route = ROUTE_BY_ID.get(id);
  if (route === undefined) {
    throw new Error(`Unknown chat-readiness route: ${id}`);
  }
  return route.id;
}

/**
 * The bounded vocabulary of decisions a route can reach.
 *
 * It lives next to the route table because both halves of a record must stay
 * bounded: `outcome` is allow-listed, so whatever a caller passes survives
 * redaction verbatim, and an unbounded outcome is as useless to an operator as
 * an unbounded route.
 *
 * `no-in-flight-action` is the case plan 01-17 made deliberately silent in the
 * chat. It must NOT be silent here — a deliberate no-op and a swallowed failure
 * look identical to an operator otherwise (threat T-01-21-04).
 *
 * `timezone-resolution-requested` records the FACT that a location was handed
 * to a resolver. The coordinates and the resolved IANA zone never appear: the
 * zone is deliberately absent from the redactor's allow list, and re-adding it
 * would turn a log line into a location proxy (threat T-01-21-03).
 */
export const CHAT_READINESS_ROUTE_OUTCOMES = [
  "authorized-and-dispatched",
  "denied",
  "no-in-flight-action",
  "unresolved-context",
  "timezone-resolution-requested",
] as const;

export type ChatReadinessRouteOutcome =
  (typeof CHAT_READINESS_ROUTE_OUTCOMES)[number];

/** The one event name every non-callback route record carries. */
const ROUTE_EVENT = "telegram.route";

/**
 * Builds one route record.
 *
 * Every identifier is passed as a bigint or a number, never as an object: an
 * allow-listed key holding an object is redacted rather than walked, so an
 * object here would silently lose the diagnostic (threat T-01-21-02).
 */
function routeFields(
  route: ChatReadinessRouteId,
  updateId: number,
  outcome: ChatReadinessRouteOutcome,
  context: ActionContext | undefined,
) {
  return {
    event: ROUTE_EVENT,
    route: chatReadinessRouteId(route),
    updateId,
    chatId: context?.chatId,
    actorId: context?.actorId,
    outcome,
  };
}

/** One line per handled update, at the default configured level. */
function logRoute(
  services: ChatReadinessServices,
  route: ChatReadinessRouteId,
  updateId: number,
  outcome: ChatReadinessRouteOutcome,
  context?: ActionContext,
) {
  services.logger.info(
    routeFields(route, updateId, outcome, context),
    "Handled Telegram update",
  );
}

/** Per-branch detail, below the default level so steady-state volume stays flat. */
function logRouteDetail(
  services: ChatReadinessServices,
  route: ChatReadinessRouteId,
  updateId: number,
  outcome: ChatReadinessRouteOutcome,
  context?: ActionContext,
) {
  services.logger.debug(
    routeFields(route, updateId, outcome, context),
    "Telegram update route detail",
  );
}

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
/**
 * Whether this actor is in the participant snapshot of a previous rehearsal —
 * the input to the `PREVIOUS_PARTICIPANTS` broadening policy.
 *
 * Delegated to `PlanningService` rather than queried here: which rounds count
 * as "previous" is a planning-domain rule, and a second copy of the status
 * filter at a surface is a second place for an authorization input to drift.
 */
async function wasPreviousParticipant(
  services: ChatReadinessServices,
  context: ActionContext,
) {
  return await services.planning.wasPreviousParticipant(
    context.chatId,
    context.actorId,
  );
}

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
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:setup", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "command:setup", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:setup",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handleSetupCommand(ctx, services, context);
  });

  bot.command("settings", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:settings", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "command:settings", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:settings",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handleSettingsCommand(ctx, services, context);
  });

  bot.command("roster_add", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:roster_add", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "command:roster_add", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:roster_add",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handleRosterAddCommand(ctx, services, context);
  });

  bot.command("roster", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:roster", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "command:roster", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:roster",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handleRosterCommand(ctx, services, context);
  });

  /**
   * `/plan` copies the command skeleton above and substitutes ONLY the
   * authorization. It never calls `authorize`: that helper deletes the actor's
   * setup and settings drafts on denial, which is correct for an admin-only
   * command and would let a band member's `/plan` destroy an administrator's
   * in-progress wizard here (Pitfall 2, threat T-02-14).
   *
   * Denial is a concise group reply rather than a private alert (Phase 1 D-13),
   * and an unanswerable membership lookup resolves to `unknown`, which
   * `canStartPlanning` denies — fail closed.
   */
  bot.command("plan", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:plan", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(PLANNING_DENIAL);
      return;
    }
    const currentRole = await services.authorization.currentRole(
      context.chatId,
      context.actorId,
    );
    const configuration = await services.prisma.chatConfiguration.findUnique({
      where: { chatId: context.chatId },
      select: { planningAccessPolicy: true },
    });
    const needsParticipantHistory =
      (currentRole === "member" || currentRole === "restricted") &&
      configuration?.planningAccessPolicy === "PREVIOUS_PARTICIPANTS";
    const previousParticipant = needsParticipantHistory
      ? await wasPreviousParticipant(services, context)
      : false;
    if (
      !canStartPlanning({
        currentRole,
        policy: configuration?.planningAccessPolicy ?? null,
        wasPreviousParticipant: previousParticipant,
      })
    ) {
      logRoute(services, "command:plan", updateId, "denied", context);
      await ctx.reply(PLANNING_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:plan",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handlePlanCommand(ctx, services, context);
  });

  /**
   * `/plan_status` copies the `/plan` skeleton and substitutes ONLY the
   * authority: D-15 opens the status request to anyone in the chat, so the
   * question is chat membership rather than the planning-access policy.
   *
   * Like `/plan`, it never calls `authorize`: that helper deletes the actor's
   * setup and settings drafts on denial, and this command is reachable by every
   * member, so a non-administrator's `/plan_status` would silently destroy an
   * administrator's in-progress wizard (Pitfall 2, threat T-02-14). An
   * unanswerable membership lookup resolves to `unknown`, which `isCurrentMember`
   * denies — fail closed, with the caught value already logged under `err` by
   * `currentRole`.
   */
  bot.command("plan_status", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:plan_status", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(PLANNING_STATUS_DENIAL);
      return;
    }
    const currentRole = await services.authorization.currentRole(
      context.chatId,
      context.actorId,
    );
    if (!isCurrentMember(currentRole)) {
      logRoute(services, "command:plan_status", updateId, "denied", context);
      await ctx.reply(PLANNING_STATUS_DENIAL);
      return;
    }
    logRoute(
      services,
      "command:plan_status",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    await handlePlanStatusCommand(ctx, services, context, currentRole);
  });

  bot.on("message:location", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(
        services,
        "update:message:location",
        updateId,
        "unresolved-context",
      );
      return;
    }
    // Route ownership before authorization: a shared location is a protected
    // action only while this actor has a prompt in flight.
    if (!(await hasInFlightAction(services, context))) {
      // Silent in the chat by design (F-7); never silent here (F-4).
      logRoute(
        services,
        "update:message:location",
        updateId,
        "no-in-flight-action",
        context,
      );
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(
        services,
        "update:message:location",
        updateId,
        "denied",
        context,
      );
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "update:message:location",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    // Both location surfaces below hand these coordinates to a resolver. Record
    // only that a resolution was requested — never the coordinates, never the
    // zone the resolver returns.
    logRouteDetail(
      services,
      "update:message:location",
      updateId,
      "timezone-resolution-requested",
      context,
    );
    const now = services.now();
    const lookup = await findSettingsDraft(services, context, now);
    // Same claim, same debt as the text carrier: a lapsed settings edit owns
    // this update, so the settings surface answers it. Checked ahead of BOTH
    // dispatches — the wizard must not see it, and no live edit exists to run.
    if (lookup.kind === "expired") {
      await handleExpiredSettingsDraft(
        ctx,
        services,
        context,
        "update:message:location",
        lookup.draft,
        now,
      );
      return;
    }
    if (lookup.kind === "active") {
      await handleSettingsLocation(
        ctx,
        services,
        context,
        lookup.draft,
        ctx.message.location,
        now,
      );
      return;
    }
    await handleSetupLocation(ctx, services, context, ctx.message.location);
  });

  bot.on("message:text", async (ctx) => {
    // Commands are matched by their own routes above; a leading slash never
    // enters a wizard step and never costs a role lookup. This route does not
    // HANDLE such an update, so it does not record one either — the owning
    // command route emits its own line.
    if (ctx.message.text.startsWith("/")) return;
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "update:message:text", updateId, "unresolved-context");
      return;
    }
    // Route ownership before authorization: an ordinary sentence is not a
    // protected action, so it is answered with silence rather than a refusal.
    if (!(await hasInFlightAction(services, context))) {
      // Silent in the chat by design (F-7); never silent here (F-4).
      logRoute(
        services,
        "update:message:text",
        updateId,
        "no-in-flight-action",
        context,
      );
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "update:message:text", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(
      services,
      "update:message:text",
      updateId,
      "authorized-and-dispatched",
      context,
    );
    const now = services.now();
    const lookup = await findSettingsDraft(services, context, now);
    // A lapsed settings edit is what CLAIMED this update, so the settings
    // surface owes the answer. Falling through to the wizard here is finding
    // F-10: the wizard owns no draft of its own, so it says nothing at all.
    if (lookup.kind === "expired") {
      await handleExpiredSettingsDraft(
        ctx,
        services,
        context,
        "update:message:text",
        lookup.draft,
        now,
      );
      return;
    }
    if (lookup.kind === "active") {
      await handleSettingsText(
        ctx,
        services,
        context,
        lookup.draft,
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
