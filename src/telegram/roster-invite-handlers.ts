import type { MessageEntity } from "grammy/types";

import {
  normalizeTelegramUsername,
  type TelegramUserIdentity,
} from "../domain/roster/roster-service.js";
import {
  parseRosterJoinTarget,
  type ActionContext,
} from "../shared/callback-schema.js";
import { renderMessage } from "../shared/i18n/index.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";
import { rosterInviteKeyboard } from "./keyboards.js";
import { resolvePresentationLocale } from "./presentation-locale.js";
import type {
  RosterCommandContext,
  RosterHandlerDependencies,
} from "./roster-handlers.js";
import { localizedMemberLabel } from "./roster-renderers.js";

/** What the text after `/roster_add` asks for, when there is no reply target. */
export type RosterAddArgument =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "user"; identity: TelegramUserIdentity }>
  | Readonly<{ kind: "username"; username: string }>;

/**
 * Reads the `/roster_add` argument from the command message.
 *
 * The argument is whatever follows the offset-0 `bot_command` entity (so
 * `/roster_add@BotName @x` works too). Exactly one token that is a valid
 * Telegram username becomes an invite request; anything else is invalid.
 */
export function parseRosterAddArgument(message: {
  text?: string;
  entities?: MessageEntity[];
}): RosterAddArgument {
  const text = message.text ?? "";
  const command = message.entities?.find(
    (entity) => entity.type === "bot_command" && entity.offset === 0,
  );
  const commandEnd = command === undefined ? 0 : command.length;
  const argument = text.slice(commandEnd).trim();
  if (argument.length === 0) return { kind: "none" };
  const tokens = argument.split(/\s+/u);
  if (tokens.length !== 1 || !tokens[0]!.startsWith("@"))
    return { kind: "invalid" };
  const username = normalizeTelegramUsername(tokens[0]!);
  return username === undefined
    ? { kind: "invalid" }
    : { kind: "username", username };
}

/** Bounded outcomes for the invite surface's caught failures. */
const ROSTER_INVITE_CATCH_SITES = {
  /** Opening the durable invite or its Join action failed. */
  invite: { outcome: "roster-invite-failed" },
  /** Consuming the invite or adding the presser failed. */
  join: { outcome: "roster-join-failed" },
} as const;

/**
 * One line per absorbed failure. Never the username, a name or the token: only
 * the chat/actor ids, a bounded outcome and the redacted `err` (T-uwu-05).
 */
function logInviteFailure(
  deps: RosterHandlerDependencies,
  site: (typeof ROSTER_INVITE_CATCH_SITES)[keyof typeof ROSTER_INVITE_CATCH_SITES],
  route: ChatReadinessRouteId,
  context: ActionContext,
  error: unknown,
) {
  deps.logger.error(
    {
      event: "telegram.handler.failure",
      route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome: site.outcome,
      err: error,
    },
    "Roster invite surface absorbed a failure",
  );
}

/**
 * Handles `/roster_add <argument>` when the command replies to nobody.
 *
 * Returns `false` when there is no usable argument, so the caller keeps its
 * usage reply; `true` once this module has answered the command.
 */
export async function handleRosterAddArgument(
  ctx: RosterCommandContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
): Promise<boolean> {
  const argument = parseRosterAddArgument(ctx.msg ?? {});
  if (argument.kind !== "username") return false;
  try {
    const invite = await deps.roster.openInvite(
      context.chatId,
      context.actorId,
      argument.username,
      deps.now(),
    );
    const locale = await resolvePresentationLocale(
      deps.prisma,
      context.chatId,
      deps.logger,
    );
    await ctx.reply(
      renderMessage(locale, "roster.invitePrompt", {
        username: invite.username,
      }),
      {
        parse_mode: "HTML",
        reply_markup: rosterInviteKeyboard(invite.token, locale),
      },
    );
  } catch (error) {
    logInviteFailure(
      deps,
      ROSTER_INVITE_CATCH_SITES.invite,
      "command:roster_add",
      context,
      error,
    );
    const locale = await resolvePresentationLocale(
      deps.prisma,
      context.chatId,
      deps.logger,
    );
    await ctx.reply(renderMessage(locale, "common.saveFailure", undefined));
  }
  return true;
}

function presserIdentity(from: CallbackContext["from"]): TelegramUserIdentity {
  return {
    id: BigInt(from.id),
    isBot: from.is_bot,
    firstName: from.first_name,
    ...(from.last_name === undefined ? {} : { lastName: from.last_name }),
    ...(from.username === undefined ? {} : { username: from.username }),
  };
}

/**
 * Dispatches one Join press that the boundary already bound to this chat,
 * checked for expiry and admitted as a current chat member.
 *
 * Authority is the invite's stored username, compared in the domain against
 * the presser's Telegram-provided username (threat T-uwu-01).
 */
export async function dispatchRosterJoinCallback(
  ctx: CallbackContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  const currentLocale = () =>
    resolvePresentationLocale(deps.prisma, context.chatId, deps.logger);
  try {
    const target = parseRosterJoinTarget(action.targetId);
    const outcome = target.success
      ? await deps.roster.acceptInvite(
          context.chatId,
          target.data.inviteId,
          presserIdentity(ctx.from),
          now,
        )
      : ({ kind: "stale" } as const);
    const locale = await currentLocale();
    if (outcome.kind === "joined") {
      const { result } = outcome;
      await ctx.editMessageText(
        renderMessage(
          locale,
          result.kind === "already-active"
            ? "roster.alreadyActive"
            : "roster.added",
          { label: localizedMemberLabel(result.member, locale) },
        ),
        { parse_mode: "HTML" },
      );
      return;
    }
    await ctx.answerCallbackQuery({
      text: renderMessage(locale, "common.stale", undefined),
      show_alert: true,
    });
  } catch (error) {
    logInviteFailure(
      deps,
      ROSTER_INVITE_CATCH_SITES.join,
      "callback:ROSTER_JOIN",
      context,
      error,
    );
    await ctx.answerCallbackQuery({
      text: renderMessage(
        await currentLocale(),
        "common.saveFailure",
        undefined,
      ),
      show_alert: true,
    });
  }
}
