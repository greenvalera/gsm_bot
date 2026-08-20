import { InlineKeyboard, type Bot } from "grammy";

import {
  CallbackActionKind,
  PlanningAccessPolicy,
  SettingsField,
  type PrismaClient,
} from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import { parseLocalTime } from "../domain/chat/schedule-validator.js";
import {
  SettingsService,
  type SettingsReview,
} from "../domain/chat/settings-service.js";
import type { TimezoneResolver } from "../infrastructure/time/timezone-resolver.js";
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
  renderSettingsDashboard,
  renderSettingsEditPrompt,
  renderSettingsReview,
} from "./renderers.js";

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This action is no longer available. Open /settings or /roster and try again.";
const SAVE_FAILURE = "I couldn't save that change. Please try again.";
const LOCATION_FAILURE =
  "I couldn't determine a time zone from that location. Send a more precise location or another location in this group.";
const INVALID_TIME = "Use 24-hour time in HH:MM format, for example 19:30.";
const INVALID_SCHEDULE =
  "That schedule does not fit inside the daily time boundaries. No changes were saved.";
const ALREADY_APPLIED = "Already applied.";

export interface SettingsHandlerDependencies {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  settings: SettingsService;
  timezoneResolver: TimezoneResolver;
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
  const tokens = new Map<SettingsField, string>();
  for (const field of Object.values(SettingsField)) {
    tokens.set(
      field,
      await deps.settings.createAction(
        context.chatId,
        context.actorId,
        { action: "begin", field },
        now,
      ),
    );
  }
  return {
    ...renderSettingsDashboard(configuration),
    reply_markup: settingsDashboardKeyboard((field) => tokens.get(field)!),
  };
}

function weekdayKeyboard(tokenFor: (value: number) => string) {
  const keyboard = new InlineKeyboard();
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((label, index) => {
    keyboard.text(label, tokenFor(index + 1));
    if (index === 3) keyboard.row();
  });
  return keyboard;
}

async function showReview(
  ctx: {
    editMessageText: (text: string, options?: object) => Promise<unknown>;
  },
  deps: SettingsHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
  review: SettingsReview,
  now: Date,
) {
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
  const rendered = renderSettingsReview(
    review.field,
    review.current,
    review.replacement,
  );
  await ctx.editMessageText(rendered.text, {
    parse_mode: "HTML",
    reply_markup: settingsReviewKeyboard(saveToken, keepToken),
  });
}

async function showPrompt(
  ctx: {
    editMessageText: (text: string, options?: object) => Promise<unknown>;
  },
  deps: SettingsHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
  draft: { id: string; field: SettingsField },
  now: Date,
) {
  const committed = await deps.settings.getCommitted(context.chatId);
  if (committed.kind !== "committed")
    throw new Error("Committed settings unavailable");
  const prompt = renderSettingsEditPrompt(draft.field, committed.configuration);
  if (
    draft.field === SettingsField.DEFAULT_WEEKDAY ||
    draft.field === SettingsField.PLANNING_ACCESS_POLICY
  ) {
    const values =
      draft.field === SettingsField.DEFAULT_WEEKDAY
        ? [1, 2, 3, 4, 5, 6, 7]
        : Object.values(PlanningAccessPolicy);
    const tokens = new Map<unknown, string>();
    for (const value of values)
      tokens.set(
        value,
        await deps.settings.createAction(
          context.chatId,
          context.actorId,
          { draftId: draft.id, action: "select", value },
          now,
        ),
      );
    const keyboard =
      draft.field === SettingsField.DEFAULT_WEEKDAY
        ? weekdayKeyboard((value) => tokens.get(value)!)
        : planningAccessKeyboard((value) => tokens.get(value)!);
    await ctx.editMessageText(prompt.text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
    return;
  }
  await ctx.editMessageText(prompt.text, { parse_mode: "HTML" });
}

function parseTextValue(field: SettingsField, text: string): unknown {
  if (field === SettingsField.DURATION_MINUTES) {
    if (!/^[1-9][0-9]*$/.test(text)) throw new RangeError("duration");
    return Number(text);
  }
  if (
    field === SettingsField.DEFAULT_START_MINUTE ||
    field === SettingsField.DAILY_START_MINUTE ||
    field === SettingsField.DAILY_END_MINUTE
  )
    return parseLocalTime(text);
  if (field === SettingsField.REMINDER_MINUTES) {
    const values = text.split(",").map((value) => parseLocalTime(value.trim()));
    if (values.length !== 2) throw new RangeError("reminder count");
    return values;
  }
  throw new RangeError("not a text setting");
}

export function registerSettingsHandlers(
  bot: Bot,
  deps: SettingsHandlerDependencies,
) {
  bot.command("settings", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await requireAdministrator(deps, context))) {
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    const committed = await deps.settings.getCommitted(context.chatId);
    if (committed.kind === "not-configured")
      return ctx.reply(
        "This chat is not configured yet. Send /setup to start.",
      );
    if (committed.kind !== "committed") return ctx.reply(SAVE_FAILURE);
    try {
      const dashboard = await createDashboard(
        deps,
        context,
        committed.configuration,
        deps.now(),
      );
      await ctx.reply(dashboard.text, {
        parse_mode: "HTML",
        reply_markup: dashboard.reply_markup,
      });
    } catch {
      await ctx.reply(SAVE_FAILURE);
    }
  });

  bot.on("message:location", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (
      context === undefined ||
      ctx.message.location === undefined ||
      !(await requireAdministrator(deps, context))
    )
      return;
    const now = deps.now();
    const draft = await deps.prisma.settingsEditDraft.findUnique({
      where: {
        chatId_actorUserId: {
          chatId: context.chatId,
          actorUserId: context.actorId,
        },
      },
    });
    if (
      draft === null ||
      draft.field !== SettingsField.TIMEZONE ||
      draft.expiresAt <= now
    )
      return;
    const inFlight = await ctx.reply("Looking up time zone…");
    let resolution;
    try {
      resolution = await deps.timezoneResolver.resolve(
        ctx.message.location.latitude,
        ctx.message.location.longitude,
      );
    } catch {
      resolution = {
        kind: "failure" as const,
        cause: "resolver-error" as const,
      };
    }
    if (resolution.kind === "failure") {
      await ctx.api.editMessageText(
        context.chatId.toString(),
        inFlight.message_id,
        LOCATION_FAILURE,
      );
      return;
    }
    const candidates =
      resolution.kind === "resolved"
        ? [resolution.candidate]
        : resolution.candidates;
    const keyboard = new InlineKeyboard();
    for (const candidate of candidates) {
      const token = await deps.settings.createAction(
        context.chatId,
        context.actorId,
        { draftId: draft.id, action: "timezone-candidate", value: candidate },
        now,
      );
      keyboard.text(`Use ${candidate}`, token).row();
    }
    await ctx.api.editMessageText(
      context.chatId.toString(),
      inFlight.message_id,
      "<b>Time zone found</b>\nChoose a time zone before reviewing the change.",
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined || !(await requireAdministrator(deps, context)))
      return;
    const now = deps.now();
    const draft = await deps.prisma.settingsEditDraft.findUnique({
      where: {
        chatId_actorUserId: {
          chatId: context.chatId,
          actorUserId: context.actorId,
        },
      },
    });
    if (
      draft === null ||
      draft.expiresAt <= now ||
      draft.field === SettingsField.TIMEZONE ||
      draft.field === SettingsField.DEFAULT_WEEKDAY ||
      draft.field === SettingsField.PLANNING_ACCESS_POLICY
    )
      return;
    let value: unknown;
    try {
      value = parseTextValue(draft.field, ctx.message.text);
    } catch {
      return ctx.reply(INVALID_TIME);
    }
    const review = await deps.settings.selectValue(
      context.chatId,
      context.actorId,
      draft.id,
      value,
      now,
    );
    if (review === undefined) return ctx.reply(INVALID_SCHEDULE);
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
    const rendered = renderSettingsReview(
      review.field,
      review.current,
      review.replacement,
    );
    await ctx.reply(rendered.text, {
      parse_mode: "HTML",
      reply_markup: settingsReviewKeyboard(saveToken, keepToken),
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
    if (!(await requireAdministrator(deps, context)))
      return ctx.answerCallbackQuery({
        text: CALLBACK_DENIAL,
        show_alert: true,
      });
    const now = deps.now();
    if (
      action.chatId !== context.chatId ||
      action.actorUserId !== context.actorId ||
      action.expiresAt <= now
    )
      return ctx.answerCallbackQuery({
        text: CALLBACK_STALE,
        show_alert: true,
      });
    if (action.consumedAt !== null)
      return ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
    const target = parseSettingsTarget(action.targetId);
    if (!target.success)
      return ctx.answerCallbackQuery({
        text: CALLBACK_STALE,
        show_alert: true,
      });

    const normalized =
      target.data.action === "begin-planning-access"
        ? {
            action: "begin" as const,
            field: SettingsField.PLANNING_ACCESS_POLICY,
          }
        : target.data.action === "select-planning-access"
          ? {
              action: "select" as const,
              draftId: target.data.draftId,
              value: target.data.value,
            }
          : target.data;
    if (normalized.action === "begin") {
      if (!(await deps.settings.consumeSelectionAction(action.token, now)))
        return ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
      try {
        const draft = await deps.settings.beginEdit(
          context.chatId,
          context.actorId,
          normalized.field,
          now,
        );
        await showPrompt(ctx, deps, context, draft, now);
      } catch {
        await ctx.reply(SAVE_FAILURE);
      }
      return;
    }
    if (
      normalized.action === "select" ||
      normalized.action === "timezone-candidate"
    ) {
      if (!(await deps.settings.consumeSelectionAction(action.token, now)))
        return ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
      const review = await deps.settings.selectValue(
        context.chatId,
        context.actorId,
        normalized.draftId,
        normalized.value,
        now,
      );
      if (review === undefined)
        return ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
      await showReview(ctx, deps, context, review, now);
      return;
    }
    const result =
      normalized.action === "save"
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
    if (result.kind === "duplicate")
      return ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
    if (result.kind === "stale" || result.kind === "expired")
      return ctx.answerCallbackQuery({
        text: CALLBACK_STALE,
        show_alert: true,
      });
    if (result.kind !== "saved") return ctx.reply(SAVE_FAILURE);
    const committed = await deps.settings.getCommitted(context.chatId);
    if (committed.kind !== "committed") return ctx.reply(SAVE_FAILURE);
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
