import { InlineKeyboard } from "grammy";
import type { Context, Filter } from "grammy";

import {
  CallbackActionKind,
  PlanningAccessPolicy,
  SettingsField,
  type PrismaClient,
} from "../generated/prisma/client.js";
import { AuthorizationService } from "../domain/auth/authorization-service.js";
import { parseLocalTime } from "../domain/chat/schedule-validator.js";
import {
  SettingsService,
  type SettingsReview,
} from "../domain/chat/settings-service.js";
import type { TimezoneResolver } from "../infrastructure/time/timezone-resolver.js";
import {
  parseSettingsTarget,
  type ActionContext,
} from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";
import {
  planningAccessKeyboard,
  settingsDashboardKeyboard,
  settingsReviewKeyboard,
} from "./keyboards.js";
import {
  renderSettingsDashboard,
  renderSettingsEditPrompt,
  renderSettingsProjection,
  renderSettingsReview,
} from "./renderers.js";

/** Update contexts the settings surface accepts from the central router. */
export type SettingsCommandContext = Context;
export type SettingsLocationContext = Filter<Context, "message:location">;
export type SettingsTextContext = Filter<Context, "message:text">;

/** The durable per-actor edit draft the router loads once per update. */
export type SettingsDraft = Readonly<{
  id: string;
  field: SettingsField;
  expiresAt: Date;
}>;

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
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  settings: SettingsService;
  timezoneResolver: TimezoneResolver;
  now: () => Date;
}

/** See the same pair in `setup-handlers.ts` for why the classes are split. */
const HANDLER_REJECTED_EVENT = "telegram.handler.rejected";
const HANDLER_FAILURE_EVENT = "telegram.handler.failure";

/**
 * The bounded vocabulary of caught-exception sites on the settings surface.
 *
 * Declared next to the surface it describes, like the route table and the
 * callback branch table, so the vocabulary and the code that emits it cannot
 * drift apart.
 */
const SETTINGS_CATCH_SITES = {
  /** Binding the dashboard's per-field actions failed. Durable storage. */
  dashboard: {
    route: "command:settings",
    outcome: "dashboard-binding-failed",
  },
  /** The offline resolver threw. Infrastructure, not user input. */
  timezoneResolution: {
    route: "update:message:location",
    outcome: "timezone-resolution-failed",
  },
  /** A typed replacement value did not parse. Expected; the prompt stands. */
  textValue: {
    route: "update:message:text",
    outcome: "text-value-rejected",
  },
  /** Opening the edit draft, or rendering its prompt, failed. */
  beginEdit: {
    route: "callback:SETTINGS_EDIT",
    outcome: "edit-begin-failed",
  },
} as const satisfies Record<
  string,
  Readonly<{ route: ChatReadinessRouteId; outcome: string }>
>;

type SettingsCatchSite =
  (typeof SETTINGS_CATCH_SITES)[keyof typeof SETTINGS_CATCH_SITES];

/**
 * Records a rejection of expected input. The user's raw text stays out of every
 * field; only the field being collected is named (threat T-01-22-02).
 */
function logSettingsRejection(
  deps: SettingsHandlerDependencies,
  site: SettingsCatchSite,
  context: ActionContext,
  field: string,
  error: unknown,
) {
  deps.logger.debug(
    {
      event: HANDLER_REJECTED_EVENT,
      route: site.route,
      chatId: context.chatId,
      actorId: context.actorId,
      field,
      outcome: site.outcome,
      err: error,
    },
    "Rejected settings input",
  );
}

/**
 * Records an infrastructure or delivery failure the recovery path absorbs.
 *
 * The caught value goes under `err` and nowhere else — the only key the
 * redactor renders structurally, dropping the stack and scrubbing secret shapes
 * out of the message (threat T-01-22-01).
 */
function logSettingsFailure(
  deps: SettingsHandlerDependencies,
  site: SettingsCatchSite,
  context: ActionContext,
  error: unknown,
) {
  deps.logger.error(
    {
      event: HANDLER_FAILURE_EVENT,
      route: site.route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome: site.outcome,
      err: error,
    },
    "Settings surface absorbed a failure",
  );
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

/** One actor's live settings edit draft, or `null` when no edit is in flight. */
export async function findSettingsDraft(
  deps: SettingsHandlerDependencies,
  context: ActionContext,
  now: Date,
) {
  const draft = await deps.prisma.settingsEditDraft.findUnique({
    where: {
      chatId_actorUserId: {
        chatId: context.chatId,
        actorUserId: context.actorId,
      },
    },
  });
  return draft === null || draft.expiresAt <= now ? null : draft;
}

/** Renders the committed settings dashboard behind an authorized `/settings`. */
export async function handleSettingsCommand(
  ctx: SettingsCommandContext,
  deps: SettingsHandlerDependencies,
  context: ActionContext,
) {
  const committed = await deps.settings.getCommitted(context.chatId);
  const projection = renderSettingsProjection(committed);
  if (projection.kind !== "dashboard" || committed.kind !== "committed") {
    await ctx.reply(projection.text);
    return;
  }
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
  } catch (error) {
    logSettingsFailure(deps, SETTINGS_CATCH_SITES.dashboard, context, error);
    await ctx.reply(SAVE_FAILURE);
  }
}

/** Turns a shared location into bound time-zone candidates for a live edit. */
export async function handleSettingsLocation(
  ctx: SettingsLocationContext,
  deps: SettingsHandlerDependencies,
  context: ActionContext,
  draft: SettingsDraft,
  location: Readonly<{ latitude: number; longitude: number }>,
  now: Date,
) {
  if (draft.field !== SettingsField.TIMEZONE) return;
  const inFlight = await ctx.reply("Looking up time zone…");
  let resolution;
  try {
    resolution = await deps.timezoneResolver.resolve(
      location.latitude,
      location.longitude,
    );
  } catch (error) {
    logSettingsFailure(
      deps,
      SETTINGS_CATCH_SITES.timezoneResolution,
      context,
      error,
    );
    resolution = { kind: "failure" as const, cause: "resolver-error" as const };
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
}

/** Turns typed input into a bound review for the actor's live settings edit. */
export async function handleSettingsText(
  ctx: SettingsTextContext,
  deps: SettingsHandlerDependencies,
  context: ActionContext,
  draft: SettingsDraft,
  text: string,
  now: Date,
) {
  if (
    draft.field === SettingsField.TIMEZONE ||
    draft.field === SettingsField.DEFAULT_WEEKDAY ||
    draft.field === SettingsField.PLANNING_ACCESS_POLICY
  )
    return;
  let value: unknown;
  try {
    value = parseTextValue(draft.field, text);
  } catch (error) {
    logSettingsRejection(
      deps,
      SETTINGS_CATCH_SITES.textValue,
      context,
      draft.field,
      error,
    );
    await ctx.reply(INVALID_TIME);
    return;
  }
  const review = await deps.settings.selectValue(
    context.chatId,
    context.actorId,
    draft.id,
    value,
    now,
  );
  if (review === undefined) {
    await ctx.reply(INVALID_SCHEDULE);
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
  const rendered = renderSettingsReview(
    review.field,
    review.current,
    review.replacement,
  );
  await ctx.reply(rendered.text, {
    parse_mode: "HTML",
    reply_markup: settingsReviewKeyboard(saveToken, keepToken),
  });
}

/**
 * Dispatches one already acknowledged, authorized, and chat/actor/expiry-bound
 * settings action. Consumption, revision checks, and the resulting projection
 * all come from the server-side draft.
 */
export async function dispatchSettingsCallback(
  ctx: CallbackContext,
  deps: SettingsHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  if (action.consumedAt !== null) {
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  const target = parseSettingsTarget(action.targetId);
  if (!target.success) {
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

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
    if (!(await deps.settings.consumeSelectionAction(action.token, now))) {
      await ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
      return;
    }
    try {
      const draft = await deps.settings.beginEdit(
        context.chatId,
        context.actorId,
        normalized.field,
        now,
      );
      await showPrompt(ctx, deps, context, draft, now);
    } catch (error) {
      logSettingsFailure(deps, SETTINGS_CATCH_SITES.beginEdit, context, error);
      await ctx.reply(SAVE_FAILURE);
    }
    return;
  }
  if (
    normalized.action === "select" ||
    normalized.action === "timezone-candidate"
  ) {
    if (!(await deps.settings.consumeSelectionAction(action.token, now))) {
      await ctx.answerCallbackQuery({
        text: ALREADY_APPLIED,
        show_alert: true,
      });
      return;
    }
    const review = await deps.settings.selectValue(
      context.chatId,
      context.actorId,
      normalized.draftId,
      normalized.value,
      now,
    );
    if (review === undefined) {
      await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
      return;
    }
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
  if (result.kind === "duplicate") {
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
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
  const projection = renderSettingsProjection(committed);
  if (projection.kind !== "dashboard" || committed.kind !== "committed") {
    await ctx.reply(projection.text);
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
}
