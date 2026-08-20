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
import type {
  TimezoneResolution,
  TimezoneResolver,
} from "../infrastructure/time/timezone-resolver.js";
import {
  callbackTokenSchema,
  createCallbackToken,
  createTimezoneTarget,
  parseTimezoneTarget,
} from "../shared/callback-schema.js";

const COMMAND_DENIAL =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL = "Only current chat administrators can do that.";
const CALLBACK_STALE =
  "This setup action is no longer available. Send /setup to start again.";
const DRAFT_EXPIRED =
  "This setup expired after 30 minutes of inactivity. Send /setup to start again.";
const LOCATION_FAILURE =
  "I couldn't determine a time zone from that location. Send a more precise location or another location in this group.";
const SETUP_PROGRESS =
  "Setup in progress\nStep 1 of 8\n\nSend a location in this group to choose this chat's time zone.";

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
  if (chatId === undefined || actorId === undefined) {
    return undefined;
  }
  return { chatId: BigInt(chatId), actorId: BigInt(actorId) };
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
    text: `<b>Time zone found</b>\nCandidates:\n${resolution.candidates
      .map((candidate) => `<code>${candidate}</code>`)
      .join("\n")}\n\nSend another location`,
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
        kind: CallbackActionKind.SELECT_TIMEZONE,
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

async function denyCommand(ctx: { reply: (text: string) => Promise<unknown> }) {
  await ctx.reply(COMMAND_DENIAL);
}

export function registerSetupHandlers(
  bot: Bot,
  deps: SetupHandlerDependencies,
) {
  bot.command("setup", async (ctx) => {
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      if (ctx.chat !== undefined) {
        await denyCommand(ctx);
      }
      return;
    }

    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        await denyCommand(ctx);
        return;
      }
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
    if (context === undefined || location === undefined) {
      return;
    }

    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        await denyCommand(ctx);
        return;
      }
      throw error;
    }

    const now = deps.now();
    const active = await deps.setup.requireActive(
      context.chatId,
      context.actorId,
      now,
    );
    if (active.kind === "expired") {
      await ctx.reply(DRAFT_EXPIRED);
      return;
    }
    if (active.kind !== "active") {
      return;
    }

    const inFlight = await ctx.reply("Looking up time zone…");
    const resolution = await deps.timezoneResolver.resolve(
      location.latitude,
      location.longitude,
    );
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
        kind: CallbackActionKind.SEND_ANOTHER_LOCATION,
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
      inFlight.message_id,
      rendered.text,
      { parse_mode: "HTML", reply_markup: rendered.keyboard },
    );
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return;
    }
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      return;
    }
    try {
      await deps.authorization.requireCurrentAdministrator(
        context.chatId,
        context.actorId,
      );
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        await denyCommand(ctx);
        return;
      }
      throw error;
    }

    const active = await deps.setup.requireActive(
      context.chatId,
      context.actorId,
      deps.now(),
    );
    if (active.kind === "expired") {
      await ctx.reply(DRAFT_EXPIRED);
    }
  });

  bot.callbackQuery(/.*/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      return;
    }
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
      action.consumedAt !== null ||
      action.expiresAt <= now
    ) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }

    if (action.kind === CallbackActionKind.SELECT_TIMEZONE) {
      const target = parseTimezoneTarget(action.targetId);
      if (!target.success) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      const active = await deps.setup.requireActive(
        context.chatId,
        context.actorId,
        now,
      );
      if (active.kind === "expired") {
        await ctx.reply(DRAFT_EXPIRED);
        return;
      }
      if (active.kind !== "active" || active.draft.id !== target.data.draftId) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      const consumed = await deps.prisma.callbackAction.updateMany({
        where: {
          token: action.token,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        await ctx.answerCallbackQuery({
          text: "Already applied.",
          show_alert: true,
        });
        return;
      }
      await deps.setup.selectTimezone(
        target.data.draftId,
        target.data.timezone,
        now,
      );
      await ctx.reply(
        `Time zone selected: <code>${target.data.timezone}</code>`,
        {
          parse_mode: "HTML",
        },
      );
      return;
    }

    if (action.kind === CallbackActionKind.START_SETUP) {
      const active = await deps.setup.requireActive(
        context.chatId,
        context.actorId,
        now,
      );
      if (active.kind === "expired") {
        await ctx.reply(DRAFT_EXPIRED);
        return;
      }
      if (active.kind !== "active" || active.draft.id !== action.targetId) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      const consumed = await deps.prisma.callbackAction.updateMany({
        where: {
          token: action.token,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        await ctx.answerCallbackQuery({
          text: "Already applied.",
          show_alert: true,
        });
        return;
      }
      await ctx.reply(SETUP_PROGRESS);
      return;
    }

    if (action.kind === CallbackActionKind.SEND_ANOTHER_LOCATION) {
      const active = await deps.setup.requireActive(
        context.chatId,
        context.actorId,
        now,
      );
      if (active.kind === "expired") {
        await ctx.reply(DRAFT_EXPIRED);
        return;
      }
      if (active.kind !== "active" || active.draft.id !== action.targetId) {
        await ctx.answerCallbackQuery({
          text: CALLBACK_STALE,
          show_alert: true,
        });
        return;
      }
      const consumed = await deps.prisma.callbackAction.updateMany({
        where: {
          token: action.token,
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        await ctx.answerCallbackQuery({
          text: "Already applied.",
          show_alert: true,
        });
        return;
      }
      await ctx.reply(SETUP_PROGRESS);
      return;
    }

    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
  });
}
