import type { Bot } from "grammy";

import type { PrismaClient } from "../generated/prisma/client.js";
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

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const INVALID_REPLY =
  "Reply to a band member's message, then send /roster_add to add them.";

export interface RosterHandlerDependencies {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  roster: RosterService;
}

function actionContext(
  chatId: number | undefined,
  actorId: number | undefined,
) {
  return chatId === undefined || actorId === undefined
    ? undefined
    : { chatId: BigInt(chatId), actorId: BigInt(actorId) };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function memberLabel(member: Omit<RosterMember, "membershipId">) {
  const name = [member.firstName, member.lastName]
    .filter((part): part is string => part !== null && part.trim().length > 0)
    .join(" ");
  if (name.length > 0) {
    return member.username === null || member.username.trim().length === 0
      ? escapeHtml(name)
      : `${escapeHtml(name)} — @${escapeHtml(member.username)}`;
  }
  return `Telegram user ••••${member.telegramUserId.toString().slice(-4)}`;
}

/** Renders only safe active-member labels; full Telegram IDs never reach chat text. */
export function renderRoster(
  members: readonly Omit<RosterMember, "membershipId">[],
) {
  if (members.length === 0) {
    return {
      text: [
        "<b>No band members yet</b>",
        "Reply to a member's message, then send /roster_add to add them.",
      ].join("\n"),
    };
  }
  const sorted = [...members].sort((left, right) =>
    memberLabel(left).localeCompare(memberLabel(right), "en", {
      sensitivity: "base",
    }),
  );
  return {
    text: [
      "<b>Band roster</b>",
      ...sorted.map((member) => `• ${memberLabel(member)}`),
    ].join("\n"),
  };
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
      await ctx.reply(renderRoster(roster).text, { parse_mode: "HTML" });
    } catch {
      await ctx.reply("I couldn't save that change. Please try again.");
    }
  });
}
