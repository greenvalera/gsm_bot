import type { MessageEntity, User } from "grammy/types";

import {
  normalizeTelegramUsername,
  type RosterAddResult,
  type TelegramUserIdentity,
} from "../domain/roster/roster-service.js";
import {
  parseRosterJoinTarget,
  type ActionContext,
} from "../shared/callback-schema.js";
import { renderMessage, type Locale } from "../shared/i18n/index.js";
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

/** The stored identity of a real Telegram user taken from an update. */
function telegramIdentity(user: User): TelegramUserIdentity {
  return {
    id: BigInt(user.id),
    isBot: user.is_bot,
    firstName: user.first_name,
    ...(user.last_name === undefined ? {} : { lastName: user.last_name }),
    ...(user.username === undefined ? {} : { username: user.username }),
  };
}

/**
 * Reads the `/roster_add` argument from the command message.
 *
 * The argument is whatever follows the offset-0 `bot_command` entity (so
 * `/roster_add@BotName @x` works too). A `text_mention` after the command names
 * a user by Telegram id and wins; otherwise exactly one `@username` token that
 * is a valid Telegram username becomes a username request. Anything else,
 * including a mention of a bot, is invalid.
 */
export function parseRosterAddArgument(message: {
  text?: string;
  entities?: MessageEntity[];
}): RosterAddArgument {
  const text = message.text ?? "";
  const entities = message.entities ?? [];
  const command = entities.find(
    (entity) => entity.type === "bot_command" && entity.offset === 0,
  );
  const commandEnd = command === undefined ? 0 : command.length;

  const mentioned = entities.find(
    (entity): entity is MessageEntity.TextMentionMessageEntity =>
      entity.type === "text_mention" && entity.offset >= commandEnd,
  );
  if (mentioned !== undefined)
    return mentioned.user.is_bot
      ? { kind: "invalid" }
      : { kind: "user", identity: telegramIdentity(mentioned.user) };

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
  /** A direct add, the known-username lookup or the invite write failed. */
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

function inviteLocale(deps: RosterHandlerDependencies, context: ActionContext) {
  return resolvePresentationLocale(deps.prisma, context.chatId, deps.logger);
}

/** The add confirmation shared by every direct-add path on this surface. */
function renderInviteAddConfirmation(result: RosterAddResult, locale: Locale) {
  return renderMessage(
    locale,
    result.kind === "already-active" ? "roster.alreadyActive" : "roster.added",
    { label: localizedMemberLabel(result.member, locale) },
  );
}

/**
 * Handles `/roster_add <argument>` when the command replies to nobody.
 *
 * A `text_mention` adds that user directly; an `@username` already stored on
 * exactly one of this chat's memberships is added directly; any other valid
 * `@username` opens a durable invite with a Join button. Returns `false` when
 * there is no usable argument (including the bot's own username), so the
 * caller keeps its usage reply; `true` once this module has answered.
 */
export async function handleRosterAddArgument(
  ctx: RosterCommandContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
): Promise<boolean> {
  const argument = parseRosterAddArgument(ctx.msg ?? {});
  if (argument.kind === "none" || argument.kind === "invalid") return false;
  if (
    argument.kind === "username" &&
    argument.username === normalizeTelegramUsername(ctx.me?.username ?? "")
  )
    return false;
  try {
    let added: RosterAddResult;
    if (argument.kind === "user") {
      added = await deps.roster.addFromRepliedUser(
        context.chatId,
        context.actorId,
        argument.identity,
      );
    } else {
      const known = await deps.roster.addByKnownUsername(
        context.chatId,
        argument.username,
      );
      if (known === undefined) {
        const invite = await deps.roster.openInvite(
          context.chatId,
          context.actorId,
          argument.username,
          deps.now(),
        );
        const locale = await inviteLocale(deps, context);
        await ctx.reply(
          renderMessage(locale, "roster.invitePrompt", {
            username: invite.username,
          }),
          {
            parse_mode: "HTML",
            reply_markup: rosterInviteKeyboard(invite.token, locale),
          },
        );
        return true;
      }
      added = known;
    }
    await ctx.reply(
      renderInviteAddConfirmation(added, await inviteLocale(deps, context)),
      { parse_mode: "HTML" },
    );
  } catch (error) {
    logInviteFailure(
      deps,
      ROSTER_INVITE_CATCH_SITES.invite,
      "command:roster_add",
      context,
      error,
    );
    await ctx.reply(
      renderMessage(
        await inviteLocale(deps, context),
        "common.saveFailure",
        undefined,
      ),
    );
  }
  return true;
}

/**
 * Dispatches one Join press that the boundary already bound to this chat,
 * checked for expiry and admitted as a current chat member.
 *
 * Authority is the invite's stored username, compared in the domain against
 * the presser's Telegram-provided username (threat T-uwu-01). A successful
 * join edits the invite into the add confirmation, which also removes the
 * button; the boundary supplies the bare acknowledgement on that branch.
 */
export async function dispatchRosterJoinCallback(
  ctx: CallbackContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  try {
    const target = parseRosterJoinTarget(action.targetId);
    const outcome = target.success
      ? await deps.roster.acceptInvite(
          context.chatId,
          target.data.inviteId,
          telegramIdentity(ctx.from),
          now,
        )
      : ({ kind: "stale" } as const);
    const locale = await inviteLocale(deps, context);
    if (outcome.kind === "joined") {
      await ctx.editMessageText(
        renderInviteAddConfirmation(outcome.result, locale),
        { parse_mode: "HTML" },
      );
      return;
    }
    const refusal =
      outcome.kind === "wrong-user"
        ? renderMessage(locale, "roster.inviteWrongUser", {
            username: outcome.username,
          })
        : renderMessage(
            locale,
            outcome.kind === "duplicate"
              ? "common.applied"
              : "roster.inviteStale",
            undefined,
          );
    await ctx.answerCallbackQuery({ text: refusal, show_alert: true });
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
        await inviteLocale(deps, context),
        "common.saveFailure",
        undefined,
      ),
      show_alert: true,
    });
  }
}
