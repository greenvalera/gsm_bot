import { GrammyError, type CommandContext, type Context } from "grammy";

import type { PrismaClient } from "../generated/prisma/client.js";
import { PlanningStep } from "../generated/prisma/client.js";
import type {
  AuthorizationService,
  CurrentTelegramRole,
} from "../domain/auth/authorization-service.js";
import {
  availabilityStepProjection,
  PlanningService,
  type MintedPlanningAction,
  type PlanningRound,
} from "../domain/planning/planning-service.js";
import type { TelegramIdentity } from "../domain/roster/roster-service.js";
import { plainMemberLabel } from "./roster-renderers.js";
import {
  parsePlanningTarget,
  type ActionContext,
} from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";
import type { PlanningControlAction } from "./keyboards.js";
import {
  renderAvailabilityCard,
  renderDayStep,
  renderReviewStep,
  renderTimeStep,
} from "./planning-renderers.js";

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

/**
 * Exported so the recovery suite asserts the module's own copy rather than a
 * retyped duplicate: a copy change then breaks the assertion at its source.
 */
export const PLANNING_NOT_CONFIGURED =
  "This chat isn't set up for rehearsals yet. Send /setup first, then try /plan again.";
const NOT_CONFIGURED = PLANNING_NOT_CONFIGURED;

/**
 * The `/plan_status` refusal for someone who is not in this chat at all.
 *
 * A concise group reply rather than a private alert, because it answers a
 * command (Phase 1 D-13). It names presence rather than a role: D-15 opens the
 * status request to every member, so "you are not here" is the only thing that
 * can be wrong.
 */
export const PLANNING_STATUS_DENIAL =
  "Only people in this chat can check the rehearsal plan.";

/**
 * The planning-card refusal for someone who is no longer in this chat.
 *
 * Kept distinct from `PLANNING_STATUS_DENIAL`: that copy answers a command
 * asking to see the plan, while this private alert answers a tap on a control.
 * Phase 1 D-13 keeps replies and button alerts worded for the gesture they
 * answer.
 */
export const PLANNING_NON_MEMBER_DENIAL =
  "Only people in this chat can use this rehearsal card.";

/** There is nothing to show: no draft round is open for this chat. */
export const PLANNING_NO_ACTIVE_ROUND =
  "Nobody is planning a rehearsal right now. Send /plan to start one.";
const WEEK_TAKEN =
  "Someone is already planning this week's rehearsal. Ask them to finish, or try again later.";
/**
 * Every week the search may offer already has a confirmed rehearsal.
 *
 * Worded as the fact rather than as a limit, because a chat that hits this is
 * not looking at a bug: it has genuinely booked out the horizon, and the only
 * useful thing to say is that there is nothing left to plan.
 */
const NO_FREE_WEEK =
  "Every week ahead already has a confirmed rehearsal. There is nothing left to plan yet.";
const START_FAILED = "I couldn't start the rehearsal plan. Please try again.";
const CALLBACK_STALE =
  "This planning action is no longer available. Send /plan to start again.";
const ALREADY_APPLIED = "Already applied.";
const DAY_ALREADY_PAST =
  "That day has already passed. Pick one of the days still ahead.";
const SLOT_ALREADY_PAST =
  "That time has already passed. Pick one of the hours still ahead.";
/**
 * The clock-change refusal, worded as its own fact.
 *
 * It shares a glyph with a past hour on the card (D-07), but telling the author
 * "that time has already passed" about an hour in the future would simply be
 * false, and they would tap it again.
 */
const SLOT_DOES_NOT_EXIST =
  "That hour doesn't exist on that day — the clocks change. Pick another one.";
const SAVE_FAILED = "I couldn't save that change. Please try again.";
/**
 * The D-10 refusal, worded as the next action rather than as a rule.
 *
 * An availability round with nobody in it can never complete, so the proposal
 * is not committed — and the author is told exactly what to do about it,
 * because the Confirm row is left spendable so that they can.
 */
const EMPTY_ROSTER =
  "Nobody is on the band roster yet. Reply to a member's message with /roster_add, then confirm again.";
/**
 * The D-12 refusal: the round is still active, so there is nothing to rescue.
 *
 * Worded as a fact about the ROUND rather than about the tapper's permissions.
 * An administrator told "you may not do that" would go and check their role;
 * what they actually need to know is that the author is still using it.
 */
const TAKEOVER_NOT_ELIGIBLE =
  "This plan is still active. You can take it over only after its author has been quiet for a while.";
/** The other half of D-12: the threshold alone is not authority. */
const TAKEOVER_NOT_ADMIN =
  "Only a chat administrator can take over someone else's rehearsal plan.";

/**
 * The AVAIL-03 / D-07 refusal: this round never asked you.
 *
 * A private alert, invisible to the group, and worded as a fact about the ROUND
 * rather than about the tapper — the lineup was fixed when the proposal was
 * confirmed (D-06), so being outside it says nothing about the person. It does
 * NOT route them to roster management: that is another surface's business, and
 * the roster they would change only takes effect on the NEXT round.
 *
 * Under 200 characters, which is the cap `answerCallbackQuery` text carries.
 */
export const PLANNING_NOT_A_PARTICIPANT =
  "This rehearsal is asking the people who were on the band roster when it was confirmed. You aren't one of them, so there's nothing here for you to answer.";

/** D-16: booking closed the round, so the answers are settled. */
export const PLANNING_ALREADY_BOOKED =
  "This rehearsal is already booked, so availability answers are closed.";

/**
 * The Bot API's hard cap on `answerCallbackQuery` text.
 *
 * Not a style rule: Telegram REJECTS a longer alert with a 400, and a rejected
 * answer is an unacknowledged callback — the tapper's client keeps spinning and
 * the refusal they needed to read never arrives. Every fixed refusal on this
 * surface is written inside the cap; the one that quotes a member label has to
 * be bounded at runtime, because the label is the member's, not ours.
 */
const CALLBACK_ALERT_LIMIT = 200;

/**
 * Clamps an untrusted label to a budget, in CODE POINTS.
 *
 * Never `String.slice`: a Telegram display name may end in an astral-plane
 * glyph, and cutting one in half produces a lone surrogate that Telegram
 * rejects outright — trading the too-long alert for an unsendable one.
 */
function boundedLabel(label: string, budget: number) {
  const points = [...label];
  if (points.length <= budget) return label;
  return `${points.slice(0, Math.max(0, budget - 1)).join("")}…`;
}

/**
 * The two halves of the ownership refusal, hoisted so the runtime budget above
 * is computed from the SAME strings the message is built from. A literal
 * template with a hand-counted allowance is how the two would drift.
 */
const NOT_AUTHOR_PREFIX = "Only ";
const NOT_AUTHOR_SUFFIX =
  " can use this card's buttons — they started this plan.";

/**
 * The D-02 refusal, naming who owns the round.
 *
 * A bystander who taps must learn WHOSE round it is, not that "the button
 * expired" — the generic stale text would send them to `/plan`, where the
 * one-active-round rule refuses them again, and the card would look broken.
 *
 * Callback alerts are delivered through `answerCallbackQuery` as plain text,
 * so an HTML-escaped label would expose literal entities to the user. Planning
 * code never assembles stored identity columns itself: the shared plain-label
 * precedence keeps the `Telegram user ••••NNNN` mask for unreadable identities.
 * `tests/unit/planning-ownership.test.ts` holds that owner-alert derivation
 * seam while a negative grep keeps identity-column assembly out of planning.
 */
export function planningNotAuthorText(owner: TelegramIdentity) {
  const budget =
    CALLBACK_ALERT_LIMIT -
    [...NOT_AUTHOR_PREFIX].length -
    [...NOT_AUTHOR_SUFFIX].length;
  return `${NOT_AUTHOR_PREFIX}${boundedLabel(plainMemberLabel(owner), budget)}${NOT_AUTHOR_SUFFIX}`;
}

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
  /** Starting or resuming the round failed before a durable result existed. */
  start: {
    outcome: "start-failed",
    reason: "round-create-failed",
  },
  /** A day or time selection transaction threw. */
  selection: {
    outcome: "select-failed",
    reason: "selection-transaction-failed",
  },
  /** The Back transaction threw. */
  back: {
    outcome: "select-failed",
    reason: "back-transaction-failed",
  },
  /** The takeover transaction threw. */
  takeover: {
    outcome: "select-failed",
    reason: "takeover-transaction-failed",
  },
  /** Telegram rejected the send or the in-place edit. Nothing left to recover. */
  delivery: {
    outcome: "telegram-delivery-failed",
    reason: "telegram-rejected-the-card",
  },
  /**
   * Telegram throttled the edit under flood control.
   *
   * Its own reason rather than a flavour of `delivery`, because they call for
   * opposite operator reactions: a rejected card is a defect to investigate, a
   * throttled one is the chat simply answering faster than Telegram will
   * redraw. The card self-heals — the next answer re-renders it — so this is
   * absorbed and never retried in place (T-03-13).
   */
  deliveryFlood: {
    outcome: "telegram-delivery-failed",
    reason: "telegram-flood-control-throttled",
  },
  /** The card was delivered but the anchor could not be recorded. */
  anchor: {
    outcome: "anchor-not-recorded",
    reason: "anchor-write-lost-its-revision-race",
  },
  /** The confirm transaction itself threw; the round was NOT promoted. */
  confirm: {
    outcome: "confirm-failed",
    reason: "confirm-transaction-threw",
  },
  /**
   * The new card is live and recorded, but the SUPERSEDED one still shows its
   * keyboard — a chat admin may have deleted it, or Telegram refused the edit.
   *
   * Deliberately its own site rather than folded into `delivery`: the re-anchor
   * already committed and must not be rolled back for a cosmetic cleanup, but
   * an operator still needs to know that a card with live-looking buttons was
   * left on screen.
   */
  supersededCard: {
    outcome: "superseded-card-not-cleared",
    reason: "superseded-keyboard-edit-rejected",
  },
  /** The status transaction itself threw; nothing was claimed or posted. */
  status: {
    outcome: "status-failed",
    reason: "status-transaction-threw",
  },
  /** The availability answer transaction threw; no answer was recorded. */
  answer: {
    outcome: "answer-failed",
    reason: "answer-transaction-failed",
  },
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
  "no-free-week",
  "start-failed",
  "day-selected",
  "time-selected",
  "step-back",
  "round-confirmed",
  "empty-roster",
  "duplicate-tap",
  "not-author",
  "past-day",
  "past-slot",
  "nonexistent-slot",
  "stale-action",
  "select-failed",
  "anchor-unchanged",
  "status-reposted",
  "status-cooling-down",
  "no-active-round",
  "round-taken-over",
  "takeover-not-eligible",
  "takeover-not-admin",
  "availability-answered",
  "not-a-participant",
  "round-already-booked",
  "answer-failed",
] as const;

type PlanningOutcome = (typeof PLANNING_OUTCOMES)[number];

/**
 * The bounded vocabulary of REASONS a planning decision can carry.
 *
 * Distinct from `outcome` so the two unavailability facts stay tellable apart in
 * the logs even though the card gives them one glyph: "this hour has passed" and
 * "this hour does not exist in this chat's timezone because the clocks changed"
 * are different problems, and an operator reading a refusal must know which one
 * they are looking at. Still a closed set of our own words — never a value.
 */
const PLANNING_REASONS = [
  "hour-behind-chat-clock",
  "hour-removed-by-clock-change",
  /**
   * D-02. Distinct from every stale reason: the tapped button is perfectly
   * valid and unspent, and the ONLY thing wrong is who pressed it. An operator
   * seeing this line is looking at a bystander, not at a defect.
   */
  "round-owned-by-another-member",
  /**
   * PLAN-10. The request was well-formed and the asker was entitled to make it;
   * the ONLY thing wrong is how recently the card was already re-posted. It has
   * its own reason because this branch is silent in the chat, so the log line is
   * the only evidence the request happened at all.
   */
  "status-requested-inside-cooldown",
  /** Nothing to re-post: the chat has no draft round open. */
  "no-draft-round-for-chat",
  /**
   * AUTH-03. The round has NOT been silent long enough, measured inside the
   * takeover transaction from freshly read state. Distinct from the role
   * refusal below because they are facts about different things, and an
   * operator investigating a complaint needs to know which one fired.
   */
  "round-still-active",
  /** The role resolved at TAP time was not an administrator's. */
  "actor-not-current-administrator",

  // --- /plan and /plan_status command outcomes
  "new-round-created",
  "live-round-resumed",
  "card-reposted-at-chat-bottom",
  "chat-has-no-configuration",
  "status-requested-in-unconfigured-chat",
  "week-claimed-by-another-author",
  /**
   * PLAN-03. Distinct from `week-claimed-by-another-author`: no other author is
   * holding anything, every week the search may reach is already CONFIRMED.
   * An operator seeing this is looking at a saturated chat, not at a collision.
   */
  "every-week-in-lookahead-claimed",
  "round-create-failed",
  "status-read-failed",

  // --- successful step transitions
  "day-applied-to-round",
  "hour-applied-to-round",
  "round-moved-one-step-back",
  "round-promoted-to-proposal",
  "round-handed-to-administrator",

  // --- deliberate no-ops, ONE reason per control so two dead buttons never
  //     look alike to an operator
  "day-already-behind-chat-clock",
  "roster-empty-at-confirm-time",
  "rendered-card-already-matches",
  "unparseable-planning-target",
  "selection-already-applied",
  "back-already-applied",
  "confirm-already-applied",
  "takeover-already-applied",
  "selection-target-no-longer-actionable",
  "back-target-no-longer-actionable",
  "confirm-target-no-longer-actionable",
  "takeover-target-no-longer-actionable",
  "selection-transaction-failed",
  "back-transaction-failed",
  "takeover-transaction-failed",

  // --- the availability answer (AVAIL-02 / AVAIL-03 / AVAIL-04)
  "answer-recorded-for-participant",
  "answer-already-recorded",
  "actor-not-in-participant-snapshot",
  "round-already-booked-at-tap",
  "answer-target-no-longer-actionable",
  "answer-transaction-failed",
  /**
   * A well-formed target for an action THIS build declares but does not mint or
   * dispatch. Unreachable from any card — nothing mints a booking token yet —
   * and its own reason precisely so it stays unreachable: routing an undispatched
   * target into the selection tail would apply a booking tap as an hour choice.
   */
  "unminted-planning-target",

  // --- absorbed failures, one per catch site
  "telegram-rejected-the-card",
  "telegram-flood-control-throttled",
  "anchor-write-lost-its-revision-race",
  "confirm-transaction-threw",
  "superseded-keyboard-edit-rejected",
  "status-transaction-threw",
] as const;

type PlanningReason = (typeof PLANNING_REASONS)[number];

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
      reason: site.reason,
      err: error,
    },
    "Planning surface absorbed a failure",
  );
}

/**
 * One line per planning decision; only bounded classifications reach a field.
 *
 * `reason` is REQUIRED, and that is the point. Finding F-4 was branches that
 * returned in silence, and its successor defect is branches that all log the
 * same thing: an operator reading `outcome: "stale-action"` four times cannot
 * tell a dead Back from a dead Confirm. Making the parameter mandatory means a
 * new branch cannot be added without the compiler asking which one it is.
 * `tests/unit/planning-logging.test.ts` holds the other half — that no two
 * branches choose the same answer.
 *
 * `roundId` is explicitly `string | undefined` rather than optional for the same
 * reason: a branch with no round in hand has to say so.
 */
function logPlanning(
  deps: PlanningHandlerDependencies,
  route: ChatReadinessRouteId,
  context: ActionContext,
  outcome: PlanningOutcome,
  roundId: string | undefined,
  reason: PlanningReason,
) {
  deps.logger.info(
    {
      event: PLANNING_EVENT,
      route,
      chatId: context.chatId,
      actorId: context.actorId,
      outcome,
      roundId,
      reason,
    },
    "Handled a planning step",
  );
}

/**
 * The ONE non-author refusal branch, shared by every control (D-02).
 *
 * Every planning control funnels here so the refusal cannot drift between them:
 * the same alert, the same bounded `outcome`/`reason` pair, and — critically —
 * no `editMessageText` at all. The anchor belongs to the author and nothing
 * durable changed, so re-rendering it would spend the author's card on a
 * stranger's mistake.
 *
 * The alert is answered from HERE, the branch that owns the outcome, never at
 * the top of the dispatcher: Telegram honours only the first answer per
 * `callback_query.id`, and acknowledging up front is what made every alert
 * unreachable in Phase 1 (finding F-3).
 */
async function refuseNonAuthor(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  owner: TelegramIdentity,
  roundId: string,
) {
  logPlanning(
    deps,
    "callback:PLANNING",
    context,
    "not-author",
    roundId,
    "round-owned-by-another-member",
  );
  await ctx.answerCallbackQuery({
    text: planningNotAuthorText(owner),
    show_alert: true,
  });
}

/** One card: text, and the keyboard the step needs — a terminal card has none. */
type RenderedStep = Readonly<{
  text: string;
  keyboard?: ReturnType<typeof renderDayStep>["keyboard"];
}>;

/** `reply_markup` as a spreadable fragment: absent when the step has no keyboard. */
function markupOf(card: RenderedStep) {
  return card.keyboard === undefined ? {} : { reply_markup: card.keyboard };
}

/**
 * The opaque token behind each trailing control, looked up by its action.
 *
 * Answers `undefined` for a control this step did not mint, which is how the
 * day step ends up with no Back row at all rather than with a dead button.
 */
function controlTokens(actions: readonly MintedPlanningAction[]) {
  const tokens = new Map<PlanningControlAction, string>();
  for (const action of actions) {
    if (action.target.action === "back") tokens.set("back", action.token);
    if (action.target.action === "confirm") tokens.set("confirm", action.token);
    if (action.target.action === "takeover")
      tokens.set("takeover", action.token);
    // The two availability capabilities differ only by the answer they carry,
    // which lives in the server-side target and never on the wire.
    if (action.target.action === "answer")
      tokens.set(
        action.target.answer === "AVAILABLE"
          ? "answer-available"
          : "answer-unavailable",
        action.token,
      );
  }
  return (control: PlanningControlAction) => tokens.get(control);
}

/** The card a round's CURRENT step should show, built from the round's own snapshot. */
async function renderStep(
  deps: PlanningHandlerDependencies,
  round: PlanningRound,
  actions: readonly MintedPlanningAction[],
  now: Date,
): Promise<RenderedStep> {
  if (round.step === PlanningStep.DAY) {
    // The projection decides WHICH seven days and how each is marked; the
    // minted actions decide only which opaque token sits behind each one.
    const tokens = new Map<string, string>();
    for (const action of actions) {
      if (action.target.action !== "day") continue;
      tokens.set(action.target.date, action.token);
    }
    const projection = await deps.planning.dayStepProjection(round, now);
    return renderDayStep(
      projection,
      (isoDate) => tokens.get(isoDate),
      // The day step mints no Back — it is the first step — but a round
      // abandoned on it is still takeover-eligible, so the control lookup is
      // passed through here too.
      controlTokens(actions),
    );
  }

  if (round.step === PlanningStep.TIME) {
    // Same division of labour as the day card: the projection decides which
    // hours and how each is marked, the minted actions only which opaque token
    // sits behind each one.
    const tokens = new Map<number, string>();
    for (const action of actions) {
      if (action.target.action !== "time") continue;
      tokens.set(action.target.startMinute, action.token);
    }
    const projection = await deps.planning.timeStepProjection(round, now);
    return renderTimeStep(
      projection,
      (startMinute) => tokens.get(startMinute),
      controlTokens(actions),
    );
  }

  // Review: the terminal card of the phase (D-04). The time buttons do not
  // survive the step that owned them — leaving them live on an anchor whose
  // round has already moved on would let a second tap fight the first (D-01 —
  // one card, edited) — and Confirm and Back take their place.
  const projection = await deps.planning.reviewStepProjection(round);
  return renderReviewStep(projection, controlTokens(actions));
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
 * Telegram is throttling this chat: HTTP 429, "Too Many Requests".
 *
 * Narrowed on the CODE rather than on the description, because the retry
 * interval Telegram appends makes the text different every time.
 *
 * Classified so it can be ABSORBED, never so it can be retried. The card is
 * re-rendered by the next answer anyway, so a dropped edit self-heals within
 * one tap — while a retry loop would run inside a handler the chat-key
 * `sequentialize` is holding, blocking every other update for that chat behind
 * a sleep, on the exact surface a band answers all at once (T-03-13). No retry
 * plugin either: this phase adds no npm root.
 */
function isFloodControl(error: unknown) {
  return error instanceof GrammyError && error.error_code === 429;
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

/**
 * Puts one already-rendered card onto the round's single anchor (D-01).
 *
 * Shared by every transition and by the terminal confirmation card, so the
 * not-modified guard, the fingerprint bookkeeping and the delivery-failure log
 * exist once. A second copy would be a second place for the "is this edit a
 * no-op" comparison to go stale.
 */
async function editAnchor(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  round: PlanningRound,
  card: RenderedStep,
) {
  if (round.anchorMessageId === null) {
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
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
      "rendered-card-already-matches",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  try {
    await ctx.api.editMessageText(
      context.chatId.toString(),
      round.anchorMessageId,
      card.text,
      // Omitted rather than sent as undefined when the step has no keyboard:
      // `exactOptionalPropertyTypes` is on, and an edit without `reply_markup`
      // is how Telegram is asked to drop the previous step's buttons.
      { parse_mode: "HTML", ...markupOf(card) },
    );
    rememberRender(key, fingerprint);
  } catch (error) {
    if (!isNotModified(error)) {
      logPlanningFailure(
        deps,
        isFloodControl(error)
          ? PLANNING_CATCH_SITES.deliveryFlood
          : PLANNING_CATCH_SITES.delivery,
        "callback:PLANNING",
        context,
        error,
      );
      return;
    }
    rememberRender(key, fingerprint);
  }
}

/** Replaces the anchor with the card the round's CURRENT step should show. */
async function replaceAnchor(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  round: PlanningRound,
  actions: readonly MintedPlanningAction[],
  now: Date,
) {
  await editAnchor(
    ctx,
    deps,
    context,
    round,
    await renderStep(deps, round, actions, now),
  );
}

/**
 * A command context that can post into the group. Both command handlers below
 * only ever need `reply` and the raw api, so this is deliberately narrower than
 * grammY's full `CommandContext`.
 */
type PostingContext = Pick<PlanningCommandContext, "reply" | "api">;

/**
 * Stops a card that is NOT the round's anchor being live, by editing its
 * keyboard away (D-14).
 *
 * This is not cosmetic. Its tokens are still unconsumed and unexpired, so until
 * the keyboard is gone there are two cards in the chat whose buttons both look
 * pressable, and a tap on the one the anchor does not name races the one it
 * does. Removing the markup is the mechanism that makes those tokens
 * unreachable from any on-screen surface (threat T-01-19-01 / T-02-13).
 *
 * Which message that is depends on which way the re-anchor went, and BOTH ways
 * end here: on success the old card is the one the anchor no longer names, and
 * on failure it is the new one — the anchor still points at the old message, so
 * the new card's buttons would edit a message far up the chat.
 *
 * A failure here is ABSORBED. The old message may simply have been deleted by a
 * chat administrator, and rolling a card back over a cosmetic cleanup would be a
 * worse outcome than a stale keyboard. It gets its own catch site so it is still
 * visible to an operator.
 */
async function clearSupersededCard(
  ctx: PostingContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  route: ChatReadinessRouteId,
  supersededMessageId: number,
  card: RenderedStep,
) {
  try {
    await ctx.api.editMessageText(
      context.chatId.toString(),
      supersededMessageId,
      card.text,
      // No `reply_markup` at all: that is how Telegram is asked to drop a
      // message's buttons, and `exactOptionalPropertyTypes` forbids passing it
      // as undefined.
      { parse_mode: "HTML" },
    );
    rememberRender(
      `${context.chatId.toString()}:${supersededMessageId}`,
      JSON.stringify({ text: card.text }),
    );
  } catch (error) {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.supersededCard,
      route,
      context,
      error,
    );
  }
}

/**
 * Posts the round's card as a NEW message at the bottom of the chat and makes
 * that message the round's anchor (D-14).
 *
 * Shared by `/plan_status` and by a `/plan` that resumed a live round, because
 * they are the same act: the card got buried under conversation and has to come
 * back where people are actually looking. Editing the old message in place would
 * not do it — a card 200 messages up is invisible however current its contents
 * are.
 *
 * The order is post, re-anchor, then clear the old keyboard. Re-anchoring before
 * the post would name a message that does not exist yet; clearing before the
 * re-anchor would leave a window with no live card at all.
 */
async function repostAnchor(
  ctx: PostingContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  route: ChatReadinessRouteId,
  round: PlanningRound,
  actions: readonly MintedPlanningAction[],
  outcome: PlanningOutcome,
  reason: PlanningReason,
  now: Date,
) {
  const card = await renderStep(deps, round, actions, now);
  const supersededMessageId = round.anchorMessageId;
  let sent;
  try {
    sent = await ctx.reply(card.text, {
      parse_mode: "HTML",
      ...markupOf(card),
    });
  } catch (error) {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.delivery,
      route,
      context,
      error,
    );
    return;
  }

  const messageId = sent?.message_id;
  if (messageId === undefined) return;
  rememberRender(
    `${round.chatId.toString()}:${messageId}`,
    JSON.stringify({ text: card.text, reply_markup: card.keyboard }),
  );

  const reanchored = await deps.planning.reanchor(
    round.id,
    messageId,
    round.revision,
    now,
    // AUTH-03: only the AUTHOR's own request is evidence that the author is
    // still present, so only theirs may postpone takeover.
    round.authorUserId === context.actorId,
  );
  if (reanchored.kind !== "reanchored") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.anchor,
      route,
      context,
      reanchored.kind === "failed"
        ? reanchored.error
        : new Error(`Anchor not recorded: ${reanchored.kind}`),
    );
    // The anchor still names the OLD message, so the card just posted is
    // un-anchored: a tap on it would commit the transition and then edit a
    // message hundreds of lines up the chat, which reads as a dead bot while
    // leaving two pressable keyboards behind. Strip the new card's markup
    // instead of returning into that state — the old card is still live, still
    // current, and still the one the round points at.
    await clearSupersededCard(ctx, deps, context, route, messageId, card);
    return;
  }
  logPlanning(deps, route, context, outcome, round.id, reason);

  if (supersededMessageId !== null && supersededMessageId !== messageId) {
    await clearSupersededCard(
      ctx,
      deps,
      context,
      route,
      supersededMessageId,
      card,
    );
  }
}

/**
 * Starts or resumes the chat's rehearsal plan and posts its single anchor card.
 *
 * Authorization already happened at the route: this handler is reached only for
 * an actor `canStartPlanning` admitted.
 *
 * A STARTED round has no anchor yet, so its card is posted and recorded. A
 * RESUMED round already has one, somewhere up the chat — 02-RESEARCH.md
 * Pitfall 6 is that `/plan` must not recompute the week, and D-14 is that it
 * must bring the existing card back down rather than leave the author scrolling
 * for it. Both are the resume path below.
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

  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.start,
      "command:plan",
      context,
      result.error,
    );
    await ctx.reply(START_FAILED);
    return;
  }

  // Every refusal is answered in the group and recorded with a bounded outcome:
  // a deliberate no-op and a swallowed failure must never look alike to an
  // operator (finding F-4).
  if (result.kind !== "started" && result.kind !== "resumed") {
    const refusal =
      result.kind === "unconfigured"
        ? ({
            outcome: "chat-not-configured",
            reason: "chat-has-no-configuration",
            text: NOT_CONFIGURED,
          } as const)
        : result.kind === "week-taken"
          ? ({
              outcome: "week-taken",
              reason: "week-claimed-by-another-author",
              text: WEEK_TAKEN,
            } as const)
          : ({
              outcome: "no-free-week",
              reason: "every-week-in-lookahead-claimed",
              text: NO_FREE_WEEK,
            } as const);
    logPlanning(
      deps,
      "command:plan",
      context,
      refusal.outcome,
      undefined,
      refusal.reason,
    );
    await ctx.reply(refusal.text);
    return;
  }

  if (result.kind === "resumed") {
    await repostAnchor(
      ctx,
      deps,
      context,
      "command:plan",
      result.round,
      result.actions,
      "round-resumed",
      "live-round-resumed",
      now,
    );
    return;
  }

  logPlanning(
    deps,
    "command:plan",
    context,
    "round-started",
    result.round.id,
    "new-round-created",
  );

  const card = await renderStep(deps, result.round, result.actions, now);
  let sent;
  try {
    sent = await ctx.reply(card.text, {
      parse_mode: "HTML",
      ...markupOf(card),
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
      anchored.kind === "failed"
        ? anchored.error
        : new Error(`Anchor not recorded: ${anchored.kind}`),
    );
    await clearSupersededCard(
      ctx,
      deps,
      context,
      "command:plan",
      messageId,
      card,
    );
  }
}

/**
 * Brings the chat's live card back to the bottom of the chat (D-14 / D-15).
 *
 * Authorization already happened at the route, and it is only chat MEMBERSHIP:
 * D-15 opens this to everyone, so the re-posted card renders for whoever asked
 * while its buttons still refuse anyone but the author (D-02, Task 1).
 *
 * The cooldown refusal is deliberately SILENT in the chat and never silent in
 * the logs. A "please wait" reply would itself be a message per request — the
 * exact flood the cooldown exists to stop (02-RESEARCH.md Pitfall 8) — and the
 * card the requester asked for is already at the bottom of the chat, seconds
 * old. The other two no-ops DO reply, because in those cases there is nothing on
 * screen to point at and silence would read as a broken bot.
 */
export async function handlePlanStatusCommand(
  ctx: PlanningCommandContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  /**
   * The role the route already resolved to admit this request.
   *
   * Threaded down rather than looked up again: it decides only whether the
   * re-posted card CARRIES a Take over control, and a second `getChatMember`
   * round trip per status request would double the cost of the phase's most
   * open command to answer a question already answered milliseconds ago. It is
   * never authority — the takeover transaction resolves the role again at tap
   * time and re-checks it there.
   */
  role: CurrentTelegramRole,
) {
  const now = deps.now();
  const result = await deps.planning.status(
    context.chatId,
    context.actorId,
    now,
  );

  if (result.kind === "cooling-down") {
    logPlanning(
      deps,
      "command:plan_status",
      context,
      "status-cooling-down",
      // The round the request was ABOUT, so the line is joinable with the
      // re-post it was refused behind.
      result.round.id,
      "status-requested-inside-cooldown",
    );
    return;
  }

  // The three branches that answer WITHOUT a round cannot be rate-limited by
  // `PlanningRound.lastStatusPostedAt`, because there is no round to hold it.
  // They claim the chat-level cooldown instead, and only the LOG is
  // unconditional: every request stays visible to an operator (finding F-4)
  // while at most one per window reaches the chat.
  if (result.kind === "no-active-round") {
    logPlanning(
      deps,
      "command:plan_status",
      context,
      "no-active-round",
      undefined,
      "no-draft-round-for-chat",
    );
    if (await deps.planning.claimRoundlessStatusReply(context.chatId, now)) {
      await ctx.reply(PLANNING_NO_ACTIVE_ROUND);
    }
    return;
  }

  if (result.kind === "unconfigured") {
    logPlanning(
      deps,
      "command:plan_status",
      context,
      "chat-not-configured",
      undefined,
      "status-requested-in-unconfigured-chat",
    );
    if (await deps.planning.claimRoundlessStatusReply(context.chatId, now)) {
      await ctx.reply(NOT_CONFIGURED);
    }
    return;
  }

  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.status,
      "command:plan_status",
      context,
      result.error,
    );
    if (await deps.planning.claimRoundlessStatusReply(context.chatId, now)) {
      await ctx.reply(START_FAILED);
    }
    return;
  }

  // The one control whose presence depends on WHO asked. `undefined` unless the
  // round is genuinely abandoned and the asker is a current administrator who
  // does not already own it.
  const takeover = await deps.planning.mintTakeoverAction(
    result.round,
    context.actorId,
    role,
    now,
  );

  await repostAnchor(
    ctx,
    deps,
    context,
    "command:plan_status",
    result.round,
    takeover === undefined ? result.actions : [...result.actions, takeover],
    "status-reposted",
    "card-reposted-at-chat-bottom",
    now,
  );
}

/**
 * One step backwards through the wizard, with the earlier choice intact (D-03).
 *
 * Every `result.kind` has a branch and the callback is answered from the branch
 * that owns the outcome, never at the top. The successful path edits the anchor
 * in place with the DESTINATION step's card — the same single card, showing the
 * previous selector with the author's earlier choice still marked as chosen.
 */
async function dispatchBack(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  roundId: string,
  now: Date,
) {
  const result = await deps.planning.back(
    context.chatId,
    context.actorId,
    action.token,
    now,
  );
  if (result.kind === "moved") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "step-back",
      result.round.id,
      "round-moved-one-step-back",
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
      roundId,
      "back-already-applied",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "not-author") {
    await refuseNonAuthor(ctx, deps, context, result.owner, roundId);
    return;
  }
  if (result.kind === "stale") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      roundId,
      "back-target-no-longer-actionable",
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.back,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
  }
}

/**
 * The one irreversible tap in the phase: the draft becomes the proposal (D-04).
 *
 * Every one of the six kinds `confirm` can answer with has its own branch, its
 * own copy and its own bounded outcome, and the callback is answered from the
 * branch that owns it. The successful branch edits the anchor in place with a
 * terminal card carrying no controls — the round is durable and there is
 * nothing left on it to press.
 */
async function dispatchConfirm(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  roundId: string,
  now: Date,
) {
  const result = await deps.planning.confirm(
    context.chatId,
    context.actorId,
    action.token,
    // The round's own revision inside the transaction is the guard, exactly as
    // it is for every other step transition. Nothing out here has observed a
    // revision more recently than the transaction will.
    null,
    now,
  );
  if (result.kind === "confirmed") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "round-confirmed",
      result.round.id,
      "round-promoted-to-proposal",
    );
    // D-01/D-02: Confirm PUBLISHES. The availability card replaces the review
    // card on the round's existing anchor, in place, with the two answer
    // controls the confirm transaction just minted — there is no second author
    // gesture and no second message.
    //
    // Per D-03 a failed edit here is absorbed at `editAnchor`'s delivery catch
    // site and posts no compensating message: the durable round stands open for
    // availability regardless of what Telegram did, and the status re-post is
    // the recovery.
    await editAnchor(
      ctx,
      deps,
      context,
      result.round,
      renderAvailabilityCard(
        // Built from the lineup the transaction ACTUALLY snapshotted, not from
        // a fresh roster read: a membership change that committed between the
        // review render and this tap is then visible to the author as a
        // difference between the two cards rather than silently absorbed. Every
        // one of them is pending, because publication IS the moment of asking.
        availabilityStepProjection(
          result.round,
          result.members,
          // D-13, on the card that now persists for the whole round. After a
          // takeover this is the record of whose round it became, and dropping
          // it un-attributes exactly the case the owner line exists for.
          result.owner,
        ),
        controlTokens(result.answerActions),
      ),
    );
    return;
  }
  if (result.kind === "empty-roster") {
    // A deliberate, actionable no-op: nothing was promoted and the Confirm row
    // was NOT spent, so the author can add members and press the same button.
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "empty-roster",
      roundId,
      "roster-empty-at-confirm-time",
    );
    await ctx.answerCallbackQuery({ text: EMPTY_ROSTER, show_alert: true });
    return;
  }
  if (result.kind === "duplicate") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "duplicate-tap",
      roundId,
      "confirm-already-applied",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "not-author") {
    await refuseNonAuthor(ctx, deps, context, result.owner, roundId);
    return;
  }
  if (result.kind === "failed") {
    // The caught value travelled out of the transaction so it can be bound
    // under `err` here — the only key the redactor renders structurally.
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.confirm,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
    return;
  }
  logPlanning(
    deps,
    "callback:PLANNING",
    context,
    "stale-action",
    roundId,
    "confirm-target-no-longer-actionable",
  );
  await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
}

/**
 * One participant's answer to the availability card (AVAIL-02 / AVAIL-04).
 *
 * The same shape as every other dispatcher: one `logPlanning` and one
 * `answerCallbackQuery` per branch, from the branch that OWNS the outcome and
 * never up front, with a trailing unguarded stale fallthrough.
 *
 * The two refusals answer with an alert and NO `editMessageText`, following
 * `refuseNonAuthor`: nothing durable changed, so re-rendering would spend the
 * round's card on somebody else's mistake. The `answered` branch re-renders the
 * anchor through the shared `editAnchor` — D-11 wants every tap visibly
 * acknowledged, and there is no second edit helper, so the render fingerprint,
 * the not-modified absorption and the delivery catch site exist once.
 */
async function dispatchAvailabilityAnswer(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  roundId: string,
  now: Date,
) {
  const result = await deps.planning.answerAvailability(
    context.chatId,
    context.actorId,
    action.token,
    now,
  );

  if (result.kind === "answered") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "availability-answered",
      result.round.id,
      "answer-recorded-for-participant",
    );
    await editAnchor(
      ctx,
      deps,
      context,
      result.round,
      renderAvailabilityCard(
        availabilityStepProjection(
          result.round,
          result.participants,
          // Every render of this card names its owner (D-02/D-13). Dropping it
          // here would make the attribution line last exactly as long as the
          // first answer took to arrive.
          result.owner,
        ),
        // BOTH tokens, not just the one that was tapped: they were never
        // consumed, so the keyboard this answer re-renders is the keyboard the
        // rest of the band is still looking at.
        controlTokens(result.actions),
      ),
    );
    return;
  }
  if (result.kind === "not-a-participant") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "not-a-participant",
      roundId,
      "actor-not-in-participant-snapshot",
    );
    await ctx.answerCallbackQuery({
      text: PLANNING_NOT_A_PARTICIPANT,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "already-booked") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "round-already-booked",
      roundId,
      "round-already-booked-at-tap",
    );
    await ctx.answerCallbackQuery({
      text: PLANNING_ALREADY_BOOKED,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "duplicate") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "duplicate-tap",
      roundId,
      "answer-already-recorded",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.answer,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
    return;
  }
  logPlanning(
    deps,
    "callback:PLANNING",
    context,
    "stale-action",
    roundId,
    "answer-target-no-longer-actionable",
  );
  await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
}

/**
 * The one tap that changes whose round it is (AUTH-03, D-12/D-13).
 *
 * The actor's role is resolved HERE, at tap time, through the non-destructive
 * `currentRole` accessor — never through the administrator-requirement helper,
 * which deletes the actor's setup and settings drafts on denial, so a refused
 * takeover would destroy an unrelated in-progress wizard (threat T-02-14). It is
 * passed into the transaction as a thunk so the service owns the freshness rule
 * rather than the surface.
 *
 * Both refusals leave the tapped row UNCONSUMED, so an administrator refused
 * because the author came back can use the same button later if the author goes
 * quiet again. The successful branch edits the anchor in place with the round's
 * current step, now naming its new owner.
 */
async function dispatchTakeover(
  ctx: CallbackContext,
  deps: PlanningHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  roundId: string,
  now: Date,
) {
  const result = await deps.planning.takeover(
    context.chatId,
    context.actorId,
    action.token,
    // The round's own revision inside the transaction, exactly as every other
    // transition guards itself. Nothing out here has observed a revision more
    // recently than the transaction will.
    null,
    now,
    () => deps.authorization.currentRole(context.chatId, context.actorId),
  );

  if (result.kind === "taken-over") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "round-taken-over",
      result.round.id,
      "round-handed-to-administrator",
    );
    await replaceAnchor(ctx, deps, context, result.round, result.actions, now);
    return;
  }
  if (result.kind === "not-eligible") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "takeover-not-eligible",
      roundId,
      "round-still-active",
    );
    await ctx.answerCallbackQuery({
      text: TAKEOVER_NOT_ELIGIBLE,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "not-admin") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "takeover-not-admin",
      roundId,
      "actor-not-current-administrator",
    );
    await ctx.answerCallbackQuery({
      text: TAKEOVER_NOT_ADMIN,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "duplicate") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "duplicate-tap",
      roundId,
      "takeover-already-applied",
    );
    await ctx.answerCallbackQuery({ text: ALREADY_APPLIED, show_alert: true });
    return;
  }
  if (result.kind === "stale") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      roundId,
      "takeover-target-no-longer-actionable",
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.takeover,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
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
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      undefined,
      "unparseable-planning-target",
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

  if (target.data.action === "back") {
    await dispatchBack(ctx, deps, context, action, target.data.roundId, now);
    return;
  }

  if (target.data.action === "confirm") {
    await dispatchConfirm(ctx, deps, context, action, target.data.roundId, now);
    return;
  }

  if (target.data.action === "takeover") {
    await dispatchTakeover(
      ctx,
      deps,
      context,
      action,
      target.data.roundId,
      now,
    );
    return;
  }

  if (target.data.action === "answer") {
    await dispatchAvailabilityAnswer(
      ctx,
      deps,
      context,
      action,
      target.data.roundId,
      now,
    );
    return;
  }

  // The booking members of the vocabulary are DECLARED by this plan and minted
  // by a later one. Refusing them here rather than letting them fall through is
  // what stops an undispatched target being applied as an hour choice by the
  // selection tail below.
  if (target.data.action !== "day" && target.data.action !== "time") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      target.data.roundId,
      "unminted-planning-target",
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }

  const isDay = target.data.action === "day";
  const result = isDay
    ? await deps.planning.selectDay(
        context.chatId,
        context.actorId,
        action.token,
        now,
      )
    : await deps.planning.selectTime(
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
      isDay ? "day-selected" : "time-selected",
      result.round.id,
      isDay ? "day-applied-to-round" : "hour-applied-to-round",
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
      "selection-already-applied",
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
      "day-already-behind-chat-clock",
    );
    await ctx.answerCallbackQuery({
      text: DAY_ALREADY_PAST,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "past-slot") {
    // The time step's half of the same deliberate no-op. Nothing durable
    // changed and the tapped row is still spendable, so the card is left
    // exactly as it is and the author is told why in a private alert.
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "past-slot",
      target.data.roundId,
      "hour-behind-chat-clock",
    );
    await ctx.answerCallbackQuery({
      text: SLOT_ALREADY_PAST,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "nonexistent-slot") {
    // Its own branch, its own reason and its own copy. An operator reading the
    // logs must be able to tell an hour that has gone by from an hour the tz
    // database removed — the card shows them the same glyph, so this line is
    // the only place the difference survives.
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "nonexistent-slot",
      target.data.roundId,
      "hour-removed-by-clock-change",
    );
    await ctx.answerCallbackQuery({
      text: SLOT_DOES_NOT_EXIST,
      show_alert: true,
    });
    return;
  }
  if (result.kind === "not-author") {
    await refuseNonAuthor(
      ctx,
      deps,
      context,
      result.owner,
      target.data.roundId,
    );
    return;
  }
  if (result.kind === "stale") {
    logPlanning(
      deps,
      "callback:PLANNING",
      context,
      "stale-action",
      target.data.roundId,
      "selection-target-no-longer-actionable",
    );
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  if (result.kind === "failed") {
    logPlanningFailure(
      deps,
      PLANNING_CATCH_SITES.selection,
      "callback:PLANNING",
      context,
      result.error,
    );
    await ctx.answerCallbackQuery({ text: SAVE_FAILED, show_alert: true });
  }
}
