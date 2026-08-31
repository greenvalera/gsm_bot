import { GrammyError, type CommandContext, type Context } from "grammy";

import type { PrismaClient } from "../generated/prisma/client.js";
import { PlanningStep } from "../generated/prisma/client.js";
import type { AuthorizationService } from "../domain/auth/authorization-service.js";
import { generateSlots } from "../domain/planning/slot-generator.js";
import {
  PlanningService,
  type MintedPlanningAction,
  type PlanningRound,
} from "../domain/planning/planning-service.js";
import {
  parsePlanningTarget,
  type ActionContext,
} from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";
import {
  planningKeyboard,
  planningRows,
  PLANNING_SLOT_ROW_SIZES,
  type PlanningKeyboardButton,
} from "./keyboards.js";
import { renderDayStep, renderTimeStep } from "./planning-renderers.js";

/**
 * The planning surface never imports the administrator-requirement helper or
 * its permission error: that path deletes the acting user's setup and settings
 * drafts on denial, so a band member's tap would silently destroy an
 * administrator's in-progress wizard (Pitfall 2, threat T-02-14). Authority
 * here comes from `AuthorizationService.currentRole` and from the round's own
 * `authorUserId`.
 */

export type PlanningCommandContext = CommandContext<Context>;

/**
 * The `/plan` refusal, spoken in the group rather than as a private alert
 * (Phase 1 D-13). It names the setting rather than the actor's role, because
 * the answer depends on the chat's configured planning access, not on whether
 * the person is an administrator.
 */
export const PLANNING_DENIAL =
  "Only people this chat's planning access setting allows can start a rehearsal plan.";

const NOT_CONFIGURED =
  "This chat isn't set up for rehearsals yet. Send /setup first, then try /plan again.";
const WEEK_TAKEN =
  "Someone is already planning this week's rehearsal. Ask them to finish, or try again later.";
const START_FAILED = "I couldn't start the rehearsal plan. Please try again.";
const CALLBACK_STALE =
  "This planning action is no longer available. Send /plan to start again.";
const ALREADY_APPLIED = "Already applied.";
const NOT_AUTHOR = "Only the person who started this plan can use its buttons.";
const DAY_ALREADY_PAST =
  "That day has already passed. Pick one of the days still ahead.";
const SAVE_FAILED = "I couldn't save that change. Please try again.";

export interface PlanningHandlerDependencies {
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  planning: PlanningService;
  now: () => Date;
}

/** See the same pair in `roster-handlers.ts` for the shared shape. */
const HANDLER_FAILURE_EVENT = "telegram.handler.failure";
const PLANNING_EVENT = "telegram.planning";

/**
 * The bounded vocabulary of caught-exception sites on the planning surface.
 *
 * Every absorbed failure lands here. A caught value bound under any key other
 * than `err` is unloggable, because the redactor renders only `err`
 * structurally — name, message and code, with the stack dropped.
 */
const PLANNING_CATCH_SITES = {
  /** Telegram rejected the send or the in-place edit. Nothing left to recover. */
  delivery: { outcome: "telegram-delivery-failed" },
  /** The card was delivered but the anchor could not be recorded. */
  anchor: { outcome: "anchor-not-recorded" },
} as const;

type PlanningCatchSite =
  (typeof PLANNING_CATCH_SITES)[keyof typeof PLANNING_CATCH_SITES];

/**
 * The bounded vocabulary of decisions the planning surface can reach.
 *
 * Values never appear in a log line: the chosen date, the chosen minute, the
 * week and the chat's timezone are all absent from the redactor's allow list,
 * and `timezone` in particular is a location proxy deliberately excluded by
 * threat T-01-21-03. Bounded classifications are emitted instead.
 */
const PLANNING_OUTCOMES = [
  "round-started",
  "round-resumed",
  "chat-not-configured",
  "week-taken",
  "start-failed",
  "day-selected",
  "duplicate-tap",
  "not-author",
  "past-day",
  "stale-action",
  "unsupported-action",
  "select-failed",
  "anchor-unchanged",
] as const;

type PlanningOutcome = (typeof PLANNING_OUTCOMES)[number];

function logPlanningFailure(
  deps: PlanningHandlerDependencies,
  site: PlanningCatchSite,
  route: ChatReadinessRouteId,
  context: ActionContext,
  error: unknown,
) {
  deps.logger.error(
    {
      event: HANDLER_FAILURE_EVENT,
      route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome: site.outcome,
      err: error,
    },
    "Planning surface absorbed a failure",
  );
}

/** One line per planning decision; only bounded classifications reach a field. */
function logPlanning(
  deps: PlanningHandlerDependencies,
  route: ChatReadinessRouteId,
  context: ActionContext,
  outcome: PlanningOutcome,
  roundId?: string,
) {
  deps.logger.info(
    {
      event: PLANNING_EVENT,
      route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome,
      roundId,
    },
    "Handled a planning step",
  );
}

/** The card a round's CURRENT step should show, built from the round's own snapshot. */
async function renderStep(
  deps: PlanningHandlerDependencies,
  round: PlanningRound,
  actions: readonly MintedPlanningAction[],
  now: Date,
) {
  const buttons: PlanningKeyboardButton[] = [];
  if (round.step === PlanningStep.DAY) {
    // The projection decides WHICH seven days and how each is marked; the
    // minted actions decide only which opaque token sits behind each one.
    const tokens = new Map<string, string>();
    for (const action of actions) {
      if (action.target.action !== "day") continue;
      tokens.set(action.target.date, action.token);
    }
    const projection = await deps.planning.dayStepProjection(round, now);
    return renderDayStep(projection, (isoDate) => tokens.get(isoDate));
  }

  const slots = generateSlots(round);
  for (const action of actions) {
    const target = action.target;
    if (target.action !== "time") continue;
    const slot = slots.find(
      (candidate) => candidate.startMinute === target.startMinute,
    );
    if (slot === undefined) continue;
    buttons.push({ text: slot.label, token: action.token });
  }
  return {
    ...renderTimeStep(round.selectedDate ?? round.targetWeekStart, slots),
    keyboard: planningKeyboard(planningRows(buttons, PLANNING_SLOT_ROW_SIZES)),
  };
}

/**
 * Telegram rejects an edit whose text AND markup are byte-identical.
 *
 * Matched on a substring rather than on equality: the description carries a
 * longer explanatory tail. The durable transition already committed when this
 * fires, so it is a success, not a failure.
 */
function isNotModified(error: unknown) {
  return (
    error instanceof GrammyError &&
    error.description.includes("message is not modified")
  );
}

/**
 * The last card rendered onto each anchor, so an identical re-render is skipped
 * before it becomes a request Telegram would reject.
 *
 * Process memory, and only ever an optimisation: a miss simply attempts the
 * edit, which the `isNotModified` catch then absorbs. No wizard value lives
 * here, so a restart loses nothing (RELI-01).
 */
const LAST_RENDER = new Map<string, string>();
const LAST_RENDER_LIMIT = 128;

function rememberRender(key: string, rendered: string) {
  if (LAST_RENDER.size >= LAST_RENDER_LIMIT) {
    const oldest = LAST_RENDER.keys().next().value;
    if (oldest !== undefined) LAST_RENDER.delete(oldest);
  }
  LAST_RENDER.set(key, rendered);
}

/** Replaces the round's single anchor card in place (D-01): one card, edited. */
async function replaceAnchor(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  round: PlanningRound,
  actions: readonly MintedPlanningAction[],
  now: Date,
) {
  if (round.anchorMessageId === null) {
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  const card = await renderStep(deps, round, actions, now);
  const key = `${round.chatId.toString()}:${round.anchorMessageId}`;
  const fingerprint = JSON.stringify({
    text: card.text,
    reply_markup: card.keyboard,
  });
  if (LAST_RENDER.get(key) === fingerprint) {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "anchor-unchanged",
      round.id,
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  try {
    await ctx.api.editMessageText(
      context.chatId.toString(),
      round.anchorMessageId,
      card.text,
      { parse_mode: "HTML", reply_markup: card.keyboard },
    );
    rememberRender(key, fingerprint);
  } catch (error) {
    if (!isNotModified(error)) {
      logPlanningFailure(
        deps,
        PLANNING_CATCH_SITES.delivery,
        "callback:PLANNING",
        context,
        error,
      );
      return;
    }
    rememberRender(key, fingerprint);
  }
}

/**
 * Starts or resumes the chat's rehearsal plan and posts its single anchor card.
 *
 * Authorization already happened at the route: this handler is reached only for
 * an actor `canStartPlanning` admitted.
 */
export async function handlePlanCommand(
  ctx: PlanningCommandContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
) {
  const now = deps.now();
  const result = await deps.planning.startOrResume(
    context.chatId,
    context.actorId,
    now,
  );

  // Every refusal is answered in the group and recorded with a bounded outcome:
  // a deliberate no-op and a swallowed failure must never look alike to an
  // operator (finding F-4).
  if (result.kind !== "started" && result.kind !== "resumed") {
    const refusal =
      result.kind === "unconfigured"
        ? ({ outcome: "chat-not-configured", text: NOT_CONFIGURED } as const)
        : result.kind === "week-taken"
          ? ({ outcome: "week-taken", text: WEEK_TAKEN } as const)
          : ({ outcome: "start-failed", text: START_FAILED } as const);
    logPlanning(deps, "command:plan", context, refusal.outcome);
    await ctx.reply(refusal.text);
    return;
  }

  logPlanning(
    deps,
    "command:plan",
    context,
    result.kind === "started" ? "round-started" : "round-resumed",
    result.round.id,
  );

  const card = await renderStep(deps, result.round, result.actions, now);
  let sent;
  try {
    sent = await ctx.reply(card.text, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
    });
  } catch (error) {
    // Telegram delivery itself failed; there is no further recovery to attempt
    // — which is exactly why the operator needs the line (finding F-4).
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.delivery,
      "command:plan",
      context,
      error,
    );
    return;
  }

  const messageId = sent?.message_id;
  if (messageId === undefined) return;
  rememberRender(
    `${result.round.chatId.toString()}:${messageId}`,
    JSON.stringify({ text: card.text, reply_markup: card.keyboard }),
  );
  const anchored = await deps.planning.setAnchor(
    result.round.id,
    messageId,
    result.round.revision,
    now,
  );
  if (anchored.kind !== "anchored") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.anchor,
      "command:plan",
      context,
      new Error(`Anchor not recorded: ${anchored.kind}`),
    );
  }
}

/**
 * Dispatches one already acknowledged, chat- and expiry-bound planning action.
 *
 * The target is parsed first and the callback is answered from the branch that
 * OWNS the outcome, never at the top — answering up front is what made every
 * alert unreachable in Phase 1 (finding F-3). Every `result.kind` has a branch.
 */
export async function dispatchPlanningCallback(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  const target = parsePlanningTarget(action.targetId);
  if (!target.success) {
    logPlanning(deps, "callback:PLANNING", context, "stale-action");
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

  if (target.data.action !== "day") {
    // The remaining actions arrive with the steps that render them; a token for
    // one of those is refused rather than silently ignored (finding F-4).
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "unsupported-action",
      target.data.roundId,
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

  const result = await deps.planning.selectDay(
    context.chatId,
    context.actorId,
    action.token,
    now,
  );

  if (result.kind === "advanced") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "day-selected",
      result.round.id,
    );
    await replaceAnchor(ctx, deps, context, result.round, result.actions, now);
    return;
  }
  if (result.kind === "duplicate") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "duplicate-tap",
      target.data.roundId,
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "past-day") {
    // A deliberate no-op, and it says so out loud: nothing durable changed and
    // there is nothing to edit, so the card is left exactly as it is and the
    // author is told why in a private alert (D-05, D-13). A no-op that logged
    // nothing would be indistinguishable from a swallowed failure (F-4).
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "past-day",
      target.data.roundId,
    );
    await ctx.answerCallbackQuery({
      text: DAY_ALREADY_PAST,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "not-author") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "not-author",
      target.data.roundId,
    );
    await ctx.answerCallbackQuery({ text: NOT_AUTHOR, show_alert: true });
    return;
  }
  if (result.kind === "stale") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      target.data.roundId,
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  logPlanning(
    deps,
    "callback:PLANNING",
    context,
    "select-failed",
    target.data.roundId,
  );
  await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
}
