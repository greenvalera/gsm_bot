import type { Bot } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import { SettingsService } from "../domain/chat/settings-service.js";
import {
  callbackTokenSchema,
  parseSettingsTarget,
} from "../shared/callback-schema.js";
import {
  planningAccessKeyboard,
  settingsDashboardKeyboard,
  settingsReviewKeyboard,
} from "./keyboards.js";
import {
  renderPlanningAccessReview,
  renderPlanningAccessSelection,
  renderSettingsDashboard,
} from "./renderers.js";

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This action is no longer available. Open /settings or /roster and try again.";
const SAVE_FAILURE = "I couldn't save that change. Please try again.";
const ALREADY_APPLIED = "Already applied.";

export interface SettingsHandlerDependencies {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  settings: SettingsService;
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

async function requireAdministrator(
  deps: SettingsHandlerDependencies,
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

async function createDashboard(
  deps: SettingsHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
  configuration: Parameters<typeof renderSettingsDashboard>[0],
  now: Date,
) {
  const token = await deps.settings.createAction(
    context.chatId,
    context.actorId,
    { action: "begin-planning-access" },
    now,
  );
  return {
    ...renderSettingsDashboard(configuration),
    reply_markup: settingsDashboardKeyboard(token),
  };
}

export function registerSettingsHandlers(
  bot: Bot,
  deps: SettingsHandlerDependencies,
) {
  bot.command("settings", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await requireAdministrator(deps, context))) {
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    const now = deps.now();
    const committed = await deps.settings.getCommitted(context.chatId);
    if (committed.kind === "not-configured") {
      await ctx.reply("This chat is not configured yet. Send /setup to start.");
      return;
    }
    if (committed.kind === "failed") {
      await ctx.reply(SAVE_FAILURE);
      return;
    }
    const dashboard = await createDashboard(
      deps,
      context,
      committed.configuration,
      now,
    );
    await ctx.reply(dashboard.text, {
      parse_mode: "HTML",
      reply_markup: dashboard.reply_markup,
    });
  });

  bot.on("callback_query:data", async (ctx, next) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return next();
    const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
    if (!token.success) return next();
    const action = await deps.prisma.callbackAction.findUnique({
      where: { token: token.data },
    });
    if (action?.kind !== CallbackActionKind.SETTINGS_EDIT) return next();

    await ctx.answerCallbackQuery();
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
    if (action.consumedAt !== null) {
      await ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
      return;
    }
    const target = parseSettingsTarget(action.targetId);
    if (!target.success) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }

    if (target.data.action === "begin-planning-access") {
      if (!(await deps.settings.consumeSelectionAction(action.token, now))) {
        await ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
        return;
      }
      try {
        const draft = await deps.settings.beginPlanningAccessEdit(
          context.chatId,
          context.actorId,
          now,
        );
        const committed = await deps.settings.getCommitted(context.chatId);
        if (committed.kind !== "committed")
          throw new Error("Configuration unavailable");
        const selection = renderPlanningAccessSelection(
          committed.configuration.planningAccessPolicy,
        );
        const tokens = new Map(
          await Promise.all(
            (
              [
                "ADMINS_ONLY",
                "PREVIOUS_PARTICIPANTS",
                "ANYONE_IN_CHAT",
              ] as const
            ).map(
              async (policy) =>
                [
                  policy,
                  await deps.settings.createAction(
                    context.chatId,
                    context.actorId,
                    {
                      draftId: draft.id,
                      action: "select-planning-access",
                      value: policy,
                    },
                    now,
                  ),
                ] as const,
            ),
          ),
        );
        await ctx.editMessageText(selection.text, {
          parse_mode: "HTML",
          reply_markup: planningAccessKeyboard((policy) => tokens.get(policy)!),
        });
      } catch {
        await ctx.reply(SAVE_FAILURE);
      }
      return;
    }

    if (target.data.action === "select-planning-access") {
      if (!(await deps.settings.consumeSelectionAction(action.token, now))) {
        await ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
        return;
      }
      const review = await deps.settings.selectPlanningAccessPolicy(
        context.chatId,
        context.actorId,
        target.data.draftId,
        target.data.value,
        now,
      );
      if (review === undefined) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      const [saveToken, keepToken] = await Promise.all([
        deps.settings.createSaveAction(
          context.chatId,
          context.actorId,
          review.draftId,
          now,
        ),
        deps.settings.createAction(
          context.chatId,
          context.actorId,
          { draftId: review.draftId, action: "keep" },
          now,
        ),
      ]);
      const rendered = renderPlanningAccessReview(
        review.current,
        review.replacement,
      );
      await ctx.editMessageText(rendered.text, {
        parse_mode: "HTML",
        reply_markup: settingsReviewKeyboard(saveToken, keepToken),
      });
      return;
    }

    const result =
      target.data.action === "save"
        ? await deps.settings.saveChange(
            context.chatId,
            context.actorId,
            action.token,
            now,
          )
        : await deps.settings.keepCurrent(
            context.chatId,
            context.actorId,
            action.token,
            now,
          );
    if (result.kind === "duplicate") {
      await ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
      return;
    }
    if (result.kind === "stale" || result.kind === "expired") {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    if (result.kind !== "saved") {
      await ctx.reply(SAVE_FAILURE);
      return;
    }
    const committed = await deps.settings.getCommitted(context.chatId);
    if (committed.kind !== "committed") {
      await ctx.reply(SAVE_FAILURE);
      return;
    }
    const dashboard = await createDashboard(
      deps,
      context,
      committed.configuration,
      now,
    );
    await ctx.editMessageText(dashboard.text, {
      parse_mode: "HTML",
      reply_markup: dashboard.reply_markup,
    });
  });
}
