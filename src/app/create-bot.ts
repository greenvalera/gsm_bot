import { randomUUID } from "node:crypto";

import { Bot, InlineKeyboard } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { z } from "zod";

import {
  CallbackActionKind,
  SetupStep,
  type PrismaClient,
} from "../generated/prisma/client.js";

export type CurrentTelegramRole =
  | "creator"
  | "administrator"
  | "member"
  | "restricted"
  | "left"
  | "kicked"
  | "unknown";

export interface TelegramMembershipGateway {
  getCurrentRole(chatId: bigint, actorId: bigint): Promise<CurrentTelegramRole>;
}

export interface BotDependencies {
  botToken: string;
  botInfo?: UserFromGetMe;
  prisma: PrismaClient;
  now: () => Date;
  membershipGateway: TelegramMembershipGateway;
}

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This setup action is no longer available. Send /setup to start again.";
const DRAFT_LIFETIME_MS = 30 * 60 * 1000;
const callbackTokenSchema = z.string().regex(/^v1:[0-9a-f-]{36}$/i);

function actionContext(
  chatId: number | undefined,
  actorId: number | undefined,
) {
  if (chatId === undefined || actorId === undefined) {
    return undefined;
  }

  return { chatId: BigInt(chatId), actorId: BigInt(actorId) };
}

function expiryFrom(now: Date) {
  return new Date(now.getTime() + DRAFT_LIFETIME_MS);
}

function isCurrentAdministrator(role: CurrentTelegramRole) {
  return role === "creator" || role === "administrator";
}

async function hasCurrentAdministrator(
  membershipGateway: TelegramMembershipGateway,
  chatId: bigint,
  actorId: bigint,
) {
  try {
    return isCurrentAdministrator(
      await membershipGateway.getCurrentRole(chatId, actorId),
    );
  } catch {
    return false;
  }
}

export function createBot(deps: BotDependencies): Bot {
  const bot =
    deps.botInfo === undefined
      ? new Bot(deps.botToken)
      : new Bot(deps.botToken, { botInfo: deps.botInfo });

  bot.command("setup", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      if (ctx.chat !== undefined) {
        await ctx.reply(COMMAND_DENIAL);
      }
      return;
    }

    if (
      !(await hasCurrentAdministrator(
        deps.membershipGateway,
        context.chatId,
        context.actorId,
      ))
    ) {
      await deps.prisma.setupDraft.deleteMany({
        where: { chatId: context.chatId, actorUserId: context.actorId },
      });
      await ctx.reply(COMMAND_DENIAL);
      return;
    }

    const now = deps.now();
    const existingDraft = await deps.prisma.setupDraft.findUnique({
      where: {
        chatId_actorUserId: {
          chatId: context.chatId,
          actorUserId: context.actorId,
        },
      },
    });
    if (
      existingDraft?.expiresAt !== undefined &&
      existingDraft.expiresAt <= now
    ) {
      await deps.prisma.setupDraft.delete({ where: { id: existingDraft.id } });
    }

    await deps.prisma.setupDraft.upsert({
      where: {
        chatId_actorUserId: {
          chatId: context.chatId,
          actorUserId: context.actorId,
        },
      },
      create: {
        chatId: context.chatId,
        actorUserId: context.actorId,
        step: SetupStep.READINESS,
        reminderMinutes: [],
        expiresAt: expiryFrom(now),
      },
      update: { expiresAt: expiryFrom(now) },
    });
    const draft = await deps.prisma.setupDraft.findUniqueOrThrow({
      where: {
        chatId_actorUserId: {
          chatId: context.chatId,
          actorUserId: context.actorId,
        },
      },
    });
    const token = `v1:${randomUUID()}`;
    await deps.prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.START_SETUP,
        chatId: context.chatId,
        actorUserId: context.actorId,
        targetId: draft.id,
        expiresAt: expiryFrom(now),
      },
    });

    await ctx.reply(
      "<b>Set up rehearsal planning</b>\nThis chat is not configured yet.",
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("Start setup", token),
      },
    );
  });

  bot.callbackQuery(/.*/, async (ctx) => {
    await ctx.answerCallbackQuery();

    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      return;
    }

    if (
      !(await hasCurrentAdministrator(
        deps.membershipGateway,
        context.chatId,
        context.actorId,
      ))
    ) {
      await deps.prisma.setupDraft.deleteMany({
        where: { chatId: context.chatId, actorUserId: context.actorId },
      });
      await ctx.answerCallbackQuery({
        text: CALLBACK_DENIAL,
        show_alert: true,
      });
      return;
    }

    const parsedToken = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
    if (!parsedToken.success) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }

    const action = await deps.prisma.callbackAction.findUnique({
      where: { token: parsedToken.data },
    });
    const now = deps.now();
    if (
      action === null ||
      action.kind !== CallbackActionKind.START_SETUP ||
      action.chatId !== context.chatId ||
      action.actorUserId !== context.actorId ||
      action.consumedAt !== null ||
      action.expiresAt <= now
    ) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }

    const consumed = await deps.prisma.callbackAction.updateMany({
      where: { token: action.token, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      await ctx.answerCallbackQuery({
        text: "Already applied.",
        show_alert: true,
      });
      return;
    }

    await ctx.reply("Setup in progress\nStep 1 of 8");
  });

  return bot;
}
