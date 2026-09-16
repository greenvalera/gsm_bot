import { InlineKeyboard } from "grammy";
import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { LanguageService } from "../domain/chat/language-service.js";
import {
  createCallbackToken,
  createLanguageTarget,
  type ActionContext,
  type LanguageTarget,
} from "../shared/callback-schema.js";
import { renderMessage } from "../shared/i18n/index.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";

export async function createLanguageAction(
  prisma: PrismaClient,
  context: ActionContext,
  target: LanguageTarget,
  now: Date,
) {
  const token = createCallbackToken();
  await prisma.callbackAction.create({
    data: {
      token,
      kind: CallbackActionKind.SETTINGS_EDIT,
      chatId: context.chatId,
      actorUserId: context.actorId,
      targetId: createLanguageTarget(target),
      expiresAt: new Date(now.getTime() + 30 * 60_000),
    },
  });
  return token;
}

export async function renderLanguageSelection(
  prisma: PrismaClient,
  context: ActionContext,
  destination: "setup" | "settings",
  now: Date,
) {
  const keyboard = new InlineKeyboard();
  for (const locale of ["en", "uk"] as const) {
    keyboard.text(
      renderMessage(
        locale,
        locale === "en" ? "language.english" : "language.ukrainian",
        undefined,
      ),
      await createLanguageAction(
        prisma,
        context,
        { action: "language-select", locale, destination },
        now,
      ),
    );
  }
  const { locale } = await new LanguageService(prisma).resolve(context.chatId);
  return {
    text: renderMessage(locale, "language.select", undefined),
    reply_markup: keyboard,
  };
}

export async function dispatchLanguageCallback(
  ctx: CallbackContext,
  prisma: PrismaClient,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
  navigation: { setup: () => Promise<void>; settings: () => Promise<void> },
  logger?: SafeLogger,
) {
  const service = new LanguageService(prisma);
  const result = await service
    .accept(context.chatId, context.actorId, action.token, now)
    .catch((error: unknown) => {
      logger?.error(
        {
          event: "telegram.handler.failure",
          route: "callback:SETTINGS_EDIT",
          chatId: context.chatId,
          actorId: context.actorId,
          err: error,
        },
        "Language selection failed",
      );
      return { kind: "failed" as const };
    });
  const { locale } = await service.resolve(context.chatId);
  if (result.kind === "failed") {
    await ctx.answerCallbackQuery({
      text: renderMessage(locale, "language.failure", undefined),
      show_alert: true,
    });
    return;
  }
  if (result.kind === "stale") {
    await ctx.answerCallbackQuery({
      text: renderMessage(locale, "language.stale", undefined),
      show_alert: true,
    });
    return;
  }
  if (result.target.action === "language-open") {
    const screen = await renderLanguageSelection(
      prisma,
      context,
      result.target.destination,
      now,
    );
    await ctx.editMessageText(screen.text, {
      reply_markup: screen.reply_markup,
    });
    return;
  }
  if (result.kind === "changed")
    await ctx.answerCallbackQuery({
      text: renderMessage(locale, "language.changed", undefined),
    });
  if (
    result.target.action === "language-continue-setup" ||
    result.target.destination === "setup"
  )
    await navigation.setup();
  else await navigation.settings();
}
