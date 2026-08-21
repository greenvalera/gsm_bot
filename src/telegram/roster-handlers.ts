import type { Bot } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import {
  RosterService,
  type RosterAddResult,
  type RosterMember,
  type TelegramUserIdentity,
} from "../domain/roster/roster-service.js";
import {
  callbackTokenSchema,
  parseRosterRemovalTarget,
} from "../shared/callback-schema.js";
import {
  rosterRemovalConfirmationKeyboard,
  rosterRemovalKeyboard,
} from "./keyboards.js";
import {
  memberLabel,
  renderRemovalConfirmation,
  renderRoster,
  sortRosterMembers,
} from "./roster-renderers.js";

export { memberLabel, renderRoster } from "./roster-renderers.js";

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const INVALID_REPLY =
  "Reply to a band member's message, then send /roster_add to add them.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This action is no longer available. Open /settings or /roster and try again.";
const ALREADY_APPLIED = "Already applied.";

export interface RosterHandlerDependencies {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  roster: RosterService;
  now: () => Date;
}

function actionContext(
  chatId: number | undefined,
  actorId: number | undefined,
) {
  return chatId === undefined || actorId === undefined
    ? undefined
    : { chatId: BigInt(chatId), actorId: BigInt(actorId) };
}

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

async function requireAdministrator(
  deps: RosterHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
) {
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

export function registerRosterHandlers(
  bot: Bot,
  deps: RosterHandlerDependencies,
) {
  bot.command("roster_add", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await requireAdministrator(deps, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
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
    } catch {
      await ctx.reply("I couldn't save that change. Please try again.");
    }
  });

  bot.command("roster", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await requireAdministrator(deps, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    try {
      const roster = await deps.roster.listActive(context.chatId);
      const sorted = sortRosterMembers(roster);
      const tokens = await Promise.all(
        sorted.map(async (member) => ({
          member,
          token: await deps.roster.createRemovalAction(
            context.chatId,
            context.actorId,
            member.membershipId,
            deps.now(),
          ),
        })),
      );
      if (tokens.some(({ token }) => token === undefined))
        throw new Error(
          "A roster member changed before its action was created.",
        );
      const tokenByMembershipId = new Map(
        tokens.map(
          ({ member, token }) => [member.membershipId, token!] as const,
        ),
      );
      const projection = renderRoster(sorted);
      if (sorted.length === 0) {
        await ctx.reply(projection.text, { parse_mode: "HTML" });
        return;
      }
      await ctx.reply(projection.text, {
        parse_mode: "HTML",
        reply_markup: rosterRemovalKeyboard(sorted, (member) =>
          tokenByMembershipId.get((member as RosterMember).membershipId)!,
        ),
      });
    } catch {
      await ctx.reply("I couldn't save that change. Please try again.");
    }
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
    if (!token.success) return next();
    const action = await deps.prisma.callbackAction.findUnique({
      where: { token: token.data },
    });
    if (action?.kind !== CallbackActionKind.ROSTER_REMOVE) return next();

    await ctx.answerCallbackQuery();
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;
    if (!(await requireAdministrator(deps, context))) {
      await ctx.answerCallbackQuery({
        text: CALLBACK_DENIAL,
        show_alert: true,
      });
      return;
    }
    const now = deps.now();
    if (
      action.chatId !== context.chatId ||
      action.actorUserId !== context.actorId ||
      action.expiresAt <= now
    ) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    const target = parseRosterRemovalTarget(action.targetId);
    if (!target.success) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
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
  });
}
