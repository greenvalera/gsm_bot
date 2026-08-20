import { InlineKeyboard, type Bot } from "grammy";

import {
  CallbackActionKind,
  type PrismaClient,
} from "../generated/prisma/client.js";
import {
  AuthorizationService,
  PermissionDeniedError,
} from "../domain/auth/authorization-service.js";
import { SetupService } from "../domain/chat/setup-service.js";
import { parseLocalTime } from "../domain/chat/schedule-validator.js";
import type { ScheduleField } from "../domain/chat/types.js";
import type {
  TimezoneResolution,
  TimezoneResolver,
} from "../infrastructure/time/timezone-resolver.js";
import {
  callbackTokenSchema,
  createCallbackToken,
  createSetupTarget,
  createTimezoneTarget,
  parseSetupTarget,
  parseTimezoneTarget,
} from "../shared/callback-schema.js";
import { setupKeyboard, type SetupActionKey } from "./keyboards.js";
import { renderCommittedConfiguration, renderSetupStep } from "./renderers.js";

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This setup action is no longer available. Send /setup to start again.";
const DRAFT_EXPIRED =
  "This setup expired after 30 minutes of inactivity. Send /setup to start again.";
const LOCATION_FAILURE =
  "I couldn't determine a time zone from that location. Send a more precise location or another location in this group.";
const INVALID_TIME = "Use 24-hour time in HH:MM format, for example 19:30.";
const INVALID_SCHEDULE =
  "That schedule does not fit inside the daily time boundaries. No changes were saved.";
const SAVE_FAILURE = "I couldn't save that change. Please try again.";
const ALREADY_APPLIED = "Already applied.";

export interface SetupHandlerDependencies {
  prisma: PrismaClient;
  authorization: AuthorizationService;
  setup: SetupService;
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

function expiryFrom(now: Date) {
  return new Date(now.getTime() + 30 * 60 * 1000);
}

function renderCandidates(
  resolution: TimezoneResolution,
  tokens: readonly string[],
) {
  if (resolution.kind === "failure") {
    throw new Error(
      "Cannot render timezone candidates for a failed resolution.",
    );
  }
  if (resolution.kind === "resolved") {
    return {
      text: `<b>Time zone found</b>\nCandidate: <code>${resolution.candidate}</code>\n\nSend another location`,
      keyboard: new InlineKeyboard().text(
        `Use ${resolution.candidate}`,
        tokens[0]!,
      ),
    };
  }
  const keyboard = new InlineKeyboard();
  for (const [index, candidate] of resolution.candidates.entries()) {
    keyboard.text(`Use ${candidate}`, tokens[index]!).row();
  }
  return {
    text: `<b>Time zone found</b>\nCandidates:\n${resolution.candidates.map((candidate) => `<code>${candidate}</code>`).join("\n")}\n\nSend another location`,
    keyboard,
  };
}

async function createCandidateActions(
  deps: SetupHandlerDependencies,
  candidates: readonly string[],
  chatId: bigint,
  actorId: bigint,
  draftId: string,
  now: Date,
) {
  const tokens: string[] = [];
  for (const candidate of candidates) {
    const token = createCallbackToken();
    await deps.prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.START_SETUP,
        chatId,
        actorUserId: actorId,
        targetId: createTimezoneTarget(draftId, candidate),
        expiresAt: expiryFrom(now),
      },
    });
    tokens.push(token);
  }
  return tokens;
}

async function createSetupAction(
  deps: SetupHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
  draftId: string,
  action: SetupActionKey,
  now: Date,
) {
  const target = action.startsWith("weekday:")
    ? {
        draftId,
        action: "weekday" as const,
        value: action.slice(8) as
          "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN",
      }
    : action === "reminders:defaults"
      ? { draftId, action: "reminders-defaults" as const }
      : action === "reminders:edit"
        ? { draftId, action: "reminders-edit" as const }
        : action === "save"
          ? { draftId, action: "save" as const }
          : action === "cancel"
            ? { draftId, action: "cancel" as const }
            : {
                draftId,
                action: "policy" as const,
                value: action.slice(7) as
                  "ADMINS_ONLY" | "PREVIOUS_PARTICIPANTS" | "ANYONE_IN_CHAT",
              };
  const token = createCallbackToken();
  await deps.prisma.callbackAction.create({
    data: {
      token,
      kind: CallbackActionKind.START_SETUP,
      chatId: context.chatId,
      actorUserId: context.actorId,
      targetId: createSetupTarget(target),
      expiresAt: expiryFrom(now),
    },
  });
  return token;
}

async function replyWithStep(
  ctx: { reply: (text: string, options?: object) => Promise<unknown> },
  deps: SetupHandlerDependencies,
  context: { chatId: bigint; actorId: bigint },
  draft: Parameters<typeof renderSetupStep>[0],
  draftId: string,
  now: Date,
  prefix?: string,
) {
  const projection = renderSetupStep(draft);
  const text =
    prefix === undefined ? projection.text : `${prefix}\n\n${projection.text}`;
  if (projection.buttons === undefined) {
    await ctx.reply(text, { parse_mode: "HTML" });
    return;
  }
  const tokens = new Map<SetupActionKey, string>();
  for (const row of projection.buttons) {
    for (const button of row) {
      if (!tokens.has(button.action)) {
        tokens.set(
          button.action,
          await createSetupAction(deps, context, draftId, button.action, now),
        );
      }
    }
  }
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: setupKeyboard(projection.buttons, (action) =>
      tokens.get(action)!,
    ),
  });
}

async function denyCommand(ctx: { reply: (text: string) => Promise<unknown> }) {
  await ctx.reply(COMMAND_DENIAL);
}

function scheduleFieldForDraft(draft: {
  defaultStartMinute: number | null;
  durationMinutes: number | null;
  dailyStartMinute: number | null;
  dailyEndMinute: number | null;
}) {
  if (draft.defaultStartMinute === null) return "defaultStartMinute" as const;
  if (draft.durationMinutes === null) return "durationMinutes" as const;
  if (draft.dailyStartMinute === null) return "dailyStartMinute" as const;
  if (draft.dailyEndMinute === null) return "dailyEndMinute" as const;
  return undefined;
}

function parseScheduleValue(value: string, field: ScheduleField) {
  if (field !== "durationMinutes") return parseLocalTime(value);
  if (!/^[1-9][0-9]*$/.test(value))
    throw new RangeError("Expected a positive whole duration.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new RangeError("Expected a safe whole duration.");
  return parsed;
}

function isExpectedSetupAction(
  draft: {
    timezone: string | null;
    defaultWeekday: number | null;
    defaultStartMinute: number | null;
    durationMinutes: number | null;
    dailyStartMinute: number | null;
    dailyEndMinute: number | null;
    reminderMinutes: readonly number[];
    planningAccessPolicy: string | null;
  },
  action:
    | "weekday"
    | "reminders-defaults"
    | "reminders-edit"
    | "policy"
    | "save"
    | "cancel",
) {
  if (action === "cancel") return true;
  if (action === "weekday")
    return draft.timezone !== null && draft.defaultWeekday === null;
  const scheduleComplete =
    draft.defaultStartMinute !== null &&
    draft.durationMinutes !== null &&
    draft.dailyStartMinute !== null &&
    draft.dailyEndMinute !== null;
  if (action === "reminders-defaults" || action === "reminders-edit") {
    return scheduleComplete && draft.reminderMinutes.length === 0;
  }
  if (action === "save") {
    return (
      scheduleComplete &&
      draft.reminderMinutes.length === 2 &&
      draft.planningAccessPolicy !== null
    );
  }
  return (
    scheduleComplete &&
    draft.reminderMinutes.length === 2 &&
    draft.planningAccessPolicy === null
  );
}

export function registerSetupHandlers(
  bot: Bot,
  deps: SetupHandlerDependencies,
) {
  bot.command("setup", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      if (ctx.chat !== undefined) await denyCommand(ctx);
      return;
    }
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) return denyCommand(ctx);
      throw error;
    }
    const now = deps.now();
    const draft = await deps.setup.beginOrResume(
      context.chatId,
      context.actorId,
      now,
    );
    const token = createCallbackToken();
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

  bot.on("message:location", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    const location = ctx.message?.location;
    if (context === undefined || location === undefined) return;
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) return denyCommand(ctx);
      throw error;
    }
    const now = deps.now();
    const active = await deps.setup.requireActive(
      context.chatId,
      context.actorId,
      now,
    );
    if (active.kind === "expired") return ctx.reply(DRAFT_EXPIRED);
    if (active.kind !== "active" || active.draft.timezone !== null) return;
    const inFlight = await ctx.reply("Looking up time zone…");
    const resolution = await deps.timezoneResolver.resolve(
      location.latitude,
      location.longitude,
    );
    if (resolution.kind === "failure") {
      await ctx.api.editMessageText(
        context.chatId.toString(),
        (inFlight as { message_id: number }).message_id,
        LOCATION_FAILURE,
      );
      return;
    }
    const candidates =
      resolution.kind === "resolved"
        ? [resolution.candidate]
        : resolution.candidates;
    const tokens = await createCandidateActions(
      deps,
      candidates,
      context.chatId,
      context.actorId,
      active.draft.id,
      now,
    );
    const anotherLocationToken = createCallbackToken();
    await deps.prisma.callbackAction.create({
      data: {
        token: anotherLocationToken,
        kind: CallbackActionKind.START_SETUP,
        chatId: context.chatId,
        actorUserId: context.actorId,
        targetId: active.draft.id,
        expiresAt: expiryFrom(now),
      },
    });
    const rendered = renderCandidates(resolution, tokens);
    rendered.keyboard.row().text("Send another location", anotherLocationToken);
    await ctx.api.editMessageText(
      context.chatId.toString(),
      (inFlight as { message_id: number }).message_id,
      rendered.text,
      { parse_mode: "HTML", reply_markup: rendered.keyboard },
    );
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) return denyCommand(ctx);
      throw error;
    }
    const now = deps.now();
    const active = await deps.setup.requireActive(
      context.chatId,
      context.actorId,
      now,
    );
    if (active.kind === "expired") return ctx.reply(DRAFT_EXPIRED);
    if (active.kind !== "active") return;
    const draft = active.draft;
    const field = scheduleFieldForDraft(draft);
    if (draft.timezone === null || draft.defaultWeekday === null) {
      return replyWithStep(ctx, deps, context, draft, draft.id, now);
    }
    if (field !== undefined) {
      let value: number;
      try {
        value = parseScheduleValue(ctx.message.text, field);
      } catch {
        return replyWithStep(
          ctx,
          deps,
          context,
          draft,
          draft.id,
          now,
          INVALID_TIME,
        );
      }
      const changed = await deps.setup.setScheduleField(
        draft,
        field,
        value,
        now,
      );
      if (changed.kind === "schedule-conflict") {
        return replyWithStep(
          ctx,
          deps,
          context,
          draft,
          draft.id,
          now,
          INVALID_SCHEDULE,
        );
      }
      return replyWithStep(ctx, deps, context, changed.draft, draft.id, now);
    }
    if (draft.reminderMinutes[0] === -1 || draft.reminderMinutes.length === 1) {
      try {
        const updated = await deps.setup.enterReminderTime(
          draft,
          parseLocalTime(ctx.message.text),
          now,
        );
        return replyWithStep(ctx, deps, context, updated, draft.id, now);
      } catch {
        return replyWithStep(
          ctx,
          deps,
          context,
          draft,
          draft.id,
          now,
          INVALID_TIME,
        );
      }
    }
    return replyWithStep(ctx, deps, context, draft, draft.id, now);
  });

  bot.callbackQuery(/.*/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) return;
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_DENIAL,
          show_alert: true,
        });
        return;
      }
      throw error;
    }
    const token = callbackTokenSchema.safeParse(ctx.callbackQuery.data);
    if (!token.success) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    const now = deps.now();
    const action = await deps.prisma.callbackAction.findUnique({
      where: { token: token.data },
    });
    if (
      action === null ||
      action.chatId !== context.chatId ||
      action.actorUserId !== context.actorId ||
      action.expiresAt <= now
    ) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    const timezoneTarget = parseTimezoneTarget(action.targetId);
    const setupTarget = parseSetupTarget(action.targetId);
    if (action.consumedAt !== null) {
      await ctx.answerCallbackQuery({
        text:
          setupTarget.success && setupTarget.data.action === "save"
            ? ALREADY_APPLIED
            : CALLBACK_STALE,
        show_alert: true,
      });
      return;
    }
    const active = await deps.setup.requireActive(
      context.chatId,
      context.actorId,
      now,
    );
    if (active.kind === "expired") return ctx.reply(DRAFT_EXPIRED);
    if (active.kind !== "active") {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    const targetDraftId = timezoneTarget.success
      ? timezoneTarget.data.draftId
      : setupTarget.success
        ? setupTarget.data.draftId
        : action.targetId;
    if (active.draft.id !== targetDraftId) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    if (
      (timezoneTarget.success && active.draft.timezone !== null) ||
      (setupTarget.success &&
        !isExpectedSetupAction(active.draft, setupTarget.data.action))
    ) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
    if (setupTarget.success && setupTarget.data.action === "save") {
      const result = await deps.setup.saveConfiguration(
        context.chatId,
        context.actorId,
        action.token,
        now,
      );
      if (result.kind === "saved") {
        const projection = renderCommittedConfiguration(result.configuration);
        await ctx.reply(projection.text, { parse_mode: "HTML" });
        return;
      }
      if (result.kind === "duplicate") {
        await ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
        return;
      }
      if (result.kind === "expired") return ctx.reply(DRAFT_EXPIRED);
      if (result.kind === "stale") {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      await ctx.reply(SAVE_FAILURE);
      return;
    }
    if (setupTarget.success && setupTarget.data.action === "cancel") {
      const result = await deps.setup.cancelSetup(
        context.chatId,
        context.actorId,
        action.token,
        now,
      );
      if (result.kind === "cancelled") return ctx.reply("Setup cancelled.");
      if (result.kind === "duplicate") {
        await ctx.answerCallbackQuery({
          text: ALREADY_APPLIED,
          show_alert: true,
        });
        return;
      }
      if (result.kind === "expired") return ctx.reply(DRAFT_EXPIRED);
      if (result.kind === "stale") {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      await ctx.reply(SAVE_FAILURE);
      return;
    }
    const consumed = await deps.prisma.callbackAction.updateMany({
      where: { token: action.token, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      await ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
      return;
    }
    if (timezoneTarget.success) {
      const updated = await deps.setup.selectTimezone(
        active.draft.id,
        timezoneTarget.data.timezone,
        now,
      );
      return replyWithStep(ctx, deps, context, updated, active.draft.id, now);
    }
    if (setupTarget.success) {
      let updated: typeof active.draft;
      switch (setupTarget.data.action) {
        case "weekday":
          updated = await deps.setup.selectWeekday(
            active.draft.id,
            setupTarget.data.value,
            now,
          );
          break;
        case "reminders-defaults":
          updated = await deps.setup.useDefaultReminders(active.draft.id, now);
          break;
        case "reminders-edit":
          updated = await deps.setup.beginReminderEdit(active.draft.id, now);
          break;
        case "policy":
          updated = await deps.setup.setPlanningAccessPolicy(
            active.draft.id,
            setupTarget.data.value,
            now,
          );
          break;
        case "save":
        case "cancel":
          await ctx.answerCallbackQuery({
            text: CALLBACK_STALE,
            show_alert: true,
          });
          return;
      }
      return replyWithStep(ctx, deps, context, updated, active.draft.id, now);
    }
    if (action.kind === CallbackActionKind.START_SETUP) {
      return replyWithStep(
        ctx,
        deps,
        context,
        active.draft,
        active.draft.id,
        now,
      );
    }
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
  });
}
