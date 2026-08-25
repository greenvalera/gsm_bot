import type { CommandContext, Context, InlineKeyboard } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { AuthorizationService } from "../domain/auth/authorization-service.js";
import {
  ROSTER_ACTION_LIFETIME_MS,
  RosterService,
  type RosterAddResult,
  type TelegramUserIdentity,
} from "../domain/roster/roster-service.js";
import {
  createCallbackToken,
  createRosterRemovalTarget,
  parseRosterRemovalTarget,
  type ActionContext,
  type RosterRemovalAction,
} from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";
import {
  rosterRemovalConfirmationKeyboard,
  rosterRemovalKeyboard,
  rosterRetryKeyboard,
  type RosterPageNavigation,
} from "./keyboards.js";
import {
  memberLabel,
  paginateRoster,
  renderRemovalConfirmation,
  renderRosterFailure,
  renderRosterLoading,
  renderRosterPage,
} from "./roster-renderers.js";

export { memberLabel, renderRoster } from "./roster-renderers.js";

/** Update context the roster surface accepts from the central router. */
export type RosterCommandContext = CommandContext<Context>;

const INVALID_REPLY =
  "Reply to a band member's message, then send /roster_add to add them.";
const CALLBACK_STALE =
  "This action is no longer available. Open /settings or /roster and try again.";
const ALREADY_APPLIED = "Already applied.";
const SAVE_FAILED = "I couldn't save that change. Please try again.";

export interface RosterHandlerDependencies {
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  roster: RosterService;
  now: () => Date;
}

/** See the same pair in `setup-handlers.ts` for why the classes are split. */
const HANDLER_FAILURE_EVENT = "telegram.handler.failure";

/**
 * The bounded vocabulary of caught-exception sites on the roster surface.
 *
 * Every one of them is an infrastructure or delivery failure — the roster
 * surface takes no free-text input, so it has no expected-rejection class. Two
 * of these sites (`delivery`) were the black holes named in finding F-4: their
 * own comments said Telegram delivery itself had failed and there was nothing
 * left to try, and then they discarded the only evidence that it had.
 */
const ROSTER_CATCH_SITES = {
  /** Even the retry action could not be stored; the page has no action left. */
  retryAction: { outcome: "retry-action-unavailable" },
  /** Listing or binding the page failed; the failed projection is emitted. */
  projection: { outcome: "roster-projection-failed" },
  /** The durable upsert behind `/roster_add` failed. */
  add: { outcome: "roster-add-failed" },
  /** Telegram itself rejected the send or the edit. Nothing left to recover. */
  delivery: { outcome: "telegram-delivery-failed" },
} as const;

type RosterCatchSite =
  (typeof ROSTER_CATCH_SITES)[keyof typeof ROSTER_CATCH_SITES];

/**
 * Records a failure the recovery path is about to absorb.
 *
 * The caught value goes under `err` and nowhere else — the only key the
 * redactor renders structurally, as name, message and code, with the stack
 * dropped and secret shapes scrubbed out of the message (threat T-01-22-01).
 * No roster identity, label or membership row reaches a field: the surface's
 * whole privacy contract is that a full identity never leaves the projection.
 */
function logRosterFailure(
  deps: RosterHandlerDependencies,
  site: RosterCatchSite,
  route: ChatReadinessRouteId,
  context: ActionContext,
  error: unknown,
) {
  deps.logger.error(
    {
      event: HANDLER_FAILURE_EVENT,
      route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome: site.outcome,
      err: error,
    },
    "Roster surface absorbed a failure",
  );
}

/** One roster surface state; a page is emitted only when it is fully bound. */
export type RosterProjection = Readonly<{
  kind: "loading" | "empty" | "page" | "failed";
  text: string;
  keyboard?: InlineKeyboard;
}>;

function repliedIdentity(
  value:
    | {
        id: number;
        is_bot: boolean;
        first_name: string;
        last_name?: string;
        username?: string;
      }
    | undefined,
): TelegramUserIdentity | undefined {
  if (value === undefined || value.is_bot) return undefined;
  return {
    id: BigInt(value.id),
    isBot: value.is_bot,
    firstName: value.first_name,
    ...(value.last_name === undefined ? {} : { lastName: value.last_name }),
    ...(value.username === undefined ? {} : { username: value.username }),
  };
}

function addConfirmation(result: RosterAddResult) {
  const label = memberLabel(result.member);
  return result.kind === "already-active"
    ? `✅ ${label} is already in the band roster.`
    : `✅ Added ${label} to the band roster.`;
}

function messageOptions(projection: RosterProjection) {
  return {
    parse_mode: "HTML" as const,
    ...(projection.keyboard === undefined
      ? {}
      : { reply_markup: projection.keyboard }),
  };
}

/**
 * Creates an opaque page or retry action. Page and retry are idempotent reads,
 * so they are not consumed; chat, actor, and expiry authority stays in the row.
 */
async function createViewAction(
  deps: RosterHandlerDependencies,
  context: ActionContext,
  target: RosterRemovalAction,
  now: Date,
) {
  const token = createCallbackToken();
  await deps.prisma.callbackAction.create({
    data: {
      token,
      kind: CallbackActionKind.ROSTER_REMOVE,
      chatId: context.chatId,
      actorUserId: context.actorId,
      targetId: createRosterRemovalTarget(target),
      expiresAt: new Date(now.getTime() + ROSTER_ACTION_LIFETIME_MS),
    },
  });
  return token;
}

async function failedProjection(
  deps: RosterHandlerDependencies,
  route: ChatReadinessRouteId,
  context: ActionContext,
  page: number,
  now: Date,
): Promise<RosterProjection> {
  const { text } = renderRosterFailure();
  try {
    const retryToken = await createViewAction(
      deps,
      context,
      { action: "retry", page },
      now,
    );
    return { kind: "failed", text, keyboard: rosterRetryKeyboard(retryToken) };
  } catch (error) {
    // Without durable storage there is no safe action to offer; state the failure only.
    logRosterFailure(
      deps,
      ROSTER_CATCH_SITES.retryAction,
      route,
      context,
      error,
    );
    return { kind: "failed", text };
  }
}

/**
 * Emits the in-flight state, then exactly one authoritative roster projection.
 * A partially bound page is never emitted, so a visible label can never carry
 * another membership's action.
 */
export async function projectRoster(
  deps: RosterHandlerDependencies,
  route: ChatReadinessRouteId,
  context: ActionContext,
  page: number,
  emit: (projection: RosterProjection) => Promise<void>,
): Promise<void> {
  await emit({ kind: "loading", ...renderRosterLoading() });
  const now = deps.now();
  try {
    const members = await deps.roster.listActive(context.chatId);
    const projection = paginateRoster(members, page);
    if (projection.total === 0) {
      await emit({ kind: "empty", ...renderRosterPage(projection) });
      return;
    }

    const removalTokens = await Promise.all(
      projection.members.map((member) =>
        deps.roster.createRemovalAction(
          context.chatId,
          context.actorId,
          member.membershipId,
          now,
        ),
      ),
    );
    if (removalTokens.some((token) => token === undefined)) {
      // A membership changed while the page was being bound.
      await emit(
        await failedProjection(deps, route, context, projection.page, now),
      );
      return;
    }

    const navigation: RosterPageNavigation = {
      ...(projection.hasPrevious
        ? {
            previousToken: await createViewAction(
              deps,
              context,
              { action: "page", page: projection.page - 1 },
              now,
            ),
          }
        : {}),
      ...(projection.hasNext
        ? {
            nextToken: await createViewAction(
              deps,
              context,
              { action: "page", page: projection.page + 1 },
              now,
            ),
          }
        : {}),
    };

    await emit({
      kind: "page",
      ...renderRosterPage(projection),
      keyboard: rosterRemovalKeyboard(removalTokens as string[], navigation),
    });
  } catch (error) {
    logRosterFailure(
      deps,
      ROSTER_CATCH_SITES.projection,
      route,
      context,
      error,
    );
    await emit(await failedProjection(deps, route, context, page, now));
  }
}

/** Adds the replied non-bot Telegram identity behind an authorized `/roster_add`. */
export async function handleRosterAddCommand(
  ctx: RosterCommandContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
) {
  const target = repliedIdentity(ctx.msg?.reply_to_message?.from);
  if (target === undefined) {
    await ctx.reply(INVALID_REPLY);
    return;
  }
  try {
    const result = await deps.roster.addFromRepliedUser(
      context.chatId,
      context.actorId,
      target,
    );
    await ctx.reply(addConfirmation(result), { parse_mode: "HTML" });
  } catch (error) {
    logRosterFailure(
      deps,
      ROSTER_CATCH_SITES.add,
      "command:roster_add",
      context,
      error,
    );
    await ctx.reply(SAVE_FAILED);
  }
}

/** Emits the in-flight roster state, then exactly one authoritative page. */
export async function handleRosterCommand(
  ctx: RosterCommandContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
) {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  let messageId: number | undefined;
  try {
    await projectRoster(
      deps,
      "command:roster",
      context,
      0,
      async (projection) => {
        if (messageId === undefined) {
          const sent = await ctx.reply(projection.text, {
            ...messageOptions(projection),
          });
          messageId = sent?.message_id;
          return;
        }
        await ctx.api.editMessageText(chatId, messageId, projection.text, {
          ...messageOptions(projection),
        });
      },
    );
  } catch (error) {
    // Telegram delivery itself failed; there is no further recovery to attempt
    // — which is exactly why the operator needs the line. Discarding the error
    // here was one of the two black holes behind finding F-4.
    logRosterFailure(
      deps,
      ROSTER_CATCH_SITES.delivery,
      "command:roster",
      context,
      error,
    );
  }
}

/**
 * Dispatches one already acknowledged, authorized, and chat/actor/expiry-bound
 * roster action. Page and retry are idempotent reads and are never consumed, so
 * repeated navigation re-renders instead of reporting `Already applied.`
 */
export async function dispatchRosterCallback(
  ctx: CallbackContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  const target = parseRosterRemovalTarget(action.targetId);
  if (!target.success) {
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

  if (target.data.action === "page" || target.data.action === "retry") {
    const requestedPage = target.data.page;
    try {
      await projectRoster(
        deps,
        "callback:ROSTER_REMOVE",
        context,
        requestedPage,
        async (projection) => {
          await ctx.editMessageText(projection.text, {
            ...messageOptions(projection),
          });
        },
      );
    } catch (error) {
      // Telegram delivery itself failed; there is no further recovery to
      // attempt — the second of the two black holes behind finding F-4.
      logRosterFailure(
        deps,
        ROSTER_CATCH_SITES.delivery,
        "callback:ROSTER_REMOVE",
        context,
        error,
      );
    }
    return;
  }

  if (target.data.action === "request") {
    const result = await deps.roster.beginRemoval(
      context.chatId,
      context.actorId,
      action.token,
      now,
    );
    if (result.kind === "confirmation") {
      const projection = renderRemovalConfirmation(result.member);
      await ctx.editMessageText(projection.text, {
        parse_mode: "HTML",
        reply_markup: rosterRemovalConfirmationKeyboard(
          result.removeToken,
          result.keepToken,
        ),
      });
      return;
    }
    await ctx.answerCallbackQuery({
      text: result.kind === "duplicate" ? ALREADY_APPLIED : CALLBACK_STALE,
      show_alert: true,
    });
    return;
  }

  const result =
    target.data.action === "confirm"
      ? await deps.roster.removeConfirmed(
          context.chatId,
          context.actorId,
          action.token,
          now,
        )
      : await deps.roster.keepRemoval(
          context.chatId,
          context.actorId,
          action.token,
          now,
        );
  if (result.kind === "removed") {
    await ctx.editMessageText(
      "<b>Roster updated</b>\nThey will no longer be selected for future rehearsals.",
      { parse_mode: "HTML" },
    );
    return;
  }
  if (result.kind === "kept") {
    await ctx.editMessageText("Removal cancelled.");
    return;
  }
  await ctx.answerCallbackQuery({
    text: result.kind === "duplicate" ? ALREADY_APPLIED : CALLBACK_STALE,
    show_alert: true,
  });
}
