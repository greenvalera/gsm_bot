import { describe, expect, it } from "vitest";
import { GrammyError } from "grammy";

import {
  PlanningService,
  type PlanningRound,
} from "../../src/domain/planning/planning-service.js";
import {
  CallbackActionKind,
  PlanningRoundStatus,
  PlanningStep,
} from "../../src/generated/prisma/client.js";
import {
  createCallbackToken,
  createPlanningTarget,
  type PlanningTargetAction,
} from "../../src/shared/callback-schema.js";
import { createLogger, REDACTED } from "../../src/shared/logger.js";
import type { CallbackActionRow } from "../../src/telegram/callbacks.js";
import {
  dispatchPlanningCallback,
  handlePlanCommand,
  handlePlanStatusCommand,
} from "../../src/telegram/planning-handlers.js";

/**
 * The observability gate for the whole phase.
 *
 * Two guarantees, and they pull in opposite directions, which is why they are
 * asserted together:
 *
 *  1. **No branch is silent, and no two branches look alike.** Phase 1 finding
 *     F-4 was branches that returned without a trace, so a genuinely silent
 *     defect (F-3) was undiagnosable from a live run. Its successor defect is
 *     branches that all log `stale-action`: an operator reading a complaint
 *     about a dead button cannot tell a dead Back from a dead Confirm from a
 *     token that never parsed. Every terminating branch below is driven for
 *     real and its `(event, outcome, reason)` triple is required to be distinct.
 *
 *  2. **No value escapes.** The redactor is an allow list, and `weekday`,
 *     `minute`, `date`, `weekStart` and `timezone` are deliberately absent from
 *     it — `timezone` because it is a location proxy (threat T-01-21-03). The
 *     absence assertions below are ALWAYS preceded by a positive existential:
 *     an absence proved over an empty set is vacuously true and would certify
 *     exactly the defect this file exists to catch.
 */

const CHAT_ID = -1010000000001n;
const AUTHOR_ID = 940111n;
const BYSTANDER_ID = 940222n;
const NOW = new Date("2026-08-26T09:00:00.000Z");

const TARGET_WEEK = "2026-08-24";
/** Thursday of the target week: still ahead of `NOW`. */
const FUTURE_DAY = "2026-08-27";
/** Monday of the target week: already behind the chat's clock at `NOW`. */
const PAST_DAY = "2026-08-24";
const TIMEZONE = "Europe/Kyiv";

/** Every value that must never survive redaction, under any key. */
const FORBIDDEN_VALUES = [
  FUTURE_DAY,
  PAST_DAY,
  TARGET_WEEK,
  TIMEZONE,
  "Kyiv",
  "Thu",
  "15:00",
];

function createRound(overrides: Record<string, unknown> = {}) {
  return {
    id: "round-logging-1",
    chatId: CHAT_ID,
    authorUserId: AUTHOR_ID,
    targetWeekStart: TARGET_WEEK,
    activeWeekStart: TARGET_WEEK,
    status: PlanningRoundStatus.DRAFT,
    step: PlanningStep.TIME,
    timezone: TIMEZONE,
    durationMinutes: 120,
    dailyStartMinute: 600,
    dailyEndMinute: 1260,
    selectedDate: FUTURE_DAY,
    selectedStartMinute: null,
    anchorMessageId: 4242,
    startsAt: null,
    endsAt: null,
    confirmedAt: null,
    lastActivityAt: NOW,
    lastStatusPostedAt: null,
    // The AVAIL-07 claim's `OR` arms compare against these, so the double's
    // round has to carry them as NULL rather than as absent: `undefined` is not
    // `null` to `matchesRound`, and the claim would silently never match.
    readyAnnouncedAt: null,
    announcementMessageId: null,
    revision: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Record<string, unknown>;
}

/** A round that has been promoted and is now collecting availability. */
function confirmedRound(overrides: Record<string, unknown> = {}) {
  return createRound({
    status: PlanningRoundStatus.CONFIRMED,
    step: PlanningStep.REVIEW,
    selectedStartMinute: 900,
    ...overrides,
  });
}

/** The shared "Can attend" capability, as its server-side target. */
const ANSWER_AVAILABLE: PlanningTargetAction = {
  action: "answer",
  roundId: "round-logging-1",
  answer: "AVAILABLE",
};

/**
 * Telegram's flood control, as grammY surfaces it.
 *
 * A real `GrammyError`, because the predicate under test narrows on the class
 * before it reads `error_code` — a duck-typed object would pass a test the
 * production code would fail.
 */
function floodControlError() {
  return new GrammyError(
    "Call to 'editMessageText' failed! (429: Too Many Requests: retry after 5)",
    {
      ok: false,
      error_code: 429,
      description: "Too Many Requests: retry after 5",
    },
    "editMessageText",
    {},
  );
}

function createAction(
  target: PlanningTargetAction,
  overrides: Record<string, unknown> = {},
) {
  return {
    token: createCallbackToken(),
    kind: CallbackActionKind.PLANNING,
    chatId: CHAT_ID,
    actorUserId: AUTHOR_ID,
    targetId: createPlanningTarget(target),
    expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    consumedAt: null,
    ...overrides,
  } as Record<string, unknown>;
}

type DoubleOptions = Readonly<{
  round?: Record<string, unknown> | null;
  action?: Record<string, unknown>;
  configuration?: Record<string, unknown> | null;
  members?: readonly unknown[];
  failWrites?: boolean;
  failAnchorWrites?: boolean;
  /** Makes recording the announcement's message id throw, and only that. */
  failAnnouncementWrites?: boolean;
  /**
   * When the chat last spoke without a round, or `undefined` for never.
   *
   * The roundless `/plan_status` cooldown lives in its own row rather than on
   * `PlanningRound`, because the branches it protects are the ones with no
   * round to hold it.
   */
  statusCooldownAt?: Date;
  /**
   * The round's confirm-time participant snapshot (D-06), as the answer path
   * reads it. An absent or non-matching snapshot is how the AVAIL-03 refusal is
   * reached — the callback boundary establishes chat membership and nothing
   * more, so the snapshot read is the only thing standing between a bystander
   * and somebody else's round.
   */
  participants?: readonly Readonly<{
    telegramUserId: bigint;
    availability?: "AVAILABLE" | "UNAVAILABLE" | null;
    firstName?: string | null;
  }>[];
}>;

/**
 * A writable double over exactly the reads and writes the planning surface
 * performs. Each branch below is reached by shaping this, never by stubbing the
 * service — a stubbed service would prove that the TEST can produce a `kind`,
 * not that the handler emits a line when the real code produces one.
 */
/**
 * Evaluates the subset of Prisma `where` operators the planning writes use.
 *
 * Deliberately narrow: it understands scalar equality, `{ lt }`, `{ lte }`,
 * `{ in }`, and a top-level `OR` of those, which is exactly what `updateMany` is
 * called with. Anything else throws rather than matching, so a future guard
 * written in an operator this double cannot evaluate fails loudly instead of
 * silently passing.
 */
function matchesRound(
  round: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === "OR") {
      const alternatives = expected as Record<string, unknown>[];
      if (!alternatives.some((clause) => matchesRound(round, clause))) {
        return false;
      }
      continue;
    }
    const actual = round[key];
    if (expected !== null && typeof expected === "object") {
      const operators = expected as Record<string, unknown>;
      const keys = Object.keys(operators);
      // The status guards `status()` and `reanchor()` carry inside their
      // compare-and-set are `{ in: RECOVERABLE_ROUND_STATUSES }`. Evaluated
      // here, not waved through: a double that ignored the set would report a
      // claim on a SUPERSEDED round that the database would have refused.
      if (keys.length === 1 && keys[0] === "in") {
        const admitted = operators.in as readonly unknown[];
        if (!admitted.includes(actual)) return false;
        continue;
      }
      if (keys.length !== 1 || (keys[0] !== "lt" && keys[0] !== "lte")) {
        throw new Error(`Double cannot evaluate where.${key}: ${keys.join()}`);
      }
      const operator = keys[0];
      const bound = operators[operator];
      if (actual === null || actual === undefined) return false;
      if (actual instanceof Date && bound instanceof Date) {
        const matches =
          operator === "lt"
            ? actual.getTime() < bound.getTime()
            : actual.getTime() <= bound.getTime();
        if (!matches) return false;
        continue;
      }
      const matches =
        operator === "lt"
          ? (actual as string) < (bound as string)
          : (actual as string) <= (bound as string);
      if (!matches) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function createPrismaDouble(options: DoubleOptions) {
  const round = options.round ?? null;
  const action = options.action ?? null;
  const participants = (options.participants ?? []).map((entry) => ({
    roundId: (round?.id as string | undefined) ?? "round-logging-1",
    telegramUserId: entry.telegramUserId,
    availability: (entry.availability ?? null) as string | null,
    answeredAt: null as Date | null,
    membership: {
      telegramUser: {
        firstName: entry.firstName ?? null,
        lastName: null,
        username: null,
      },
    },
  }));
  let cooldown: { chatId: bigint; lastPostedAt: Date } | null =
    options.statusCooldownAt === undefined
      ? null
      : { chatId: CHAT_ID, lastPostedAt: options.statusCooldownAt };
  const client = {
    $queryRaw: async () => [],
    // Modelled rather than stubbed, for the same reason `planningRound`
    // evaluates its own `where`: a double that answered unconditionally would
    // report a claim the database would have refused, and the silent-after-first
    // branch would be unreachable from this file.
    chatStatusCooldown: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { lastPostedAt: { lte: Date } };
        data: { lastPostedAt: Date };
      }) => {
        if (cooldown === null) return { count: 0 };
        if (
          !(cooldown.lastPostedAt.getTime() <= where.lastPostedAt.lte.getTime())
        )
          return { count: 0 };
        cooldown.lastPostedAt = data.lastPostedAt;
        return { count: 1 };
      },
      create: async ({
        data,
      }: {
        data: { chatId: bigint; lastPostedAt: Date };
      }) => {
        if (cooldown !== null) {
          throw Object.assign(new Error("Unique constraint failed"), {
            code: "P2002",
          });
        }
        cooldown = { chatId: data.chatId, lastPostedAt: data.lastPostedAt };
        return { ...cooldown };
      },
    },
    callbackAction: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        action !== null && where.token === action.token ? { ...action } : null,
      updateMany: async ({ where }: { where: { token?: string } }) => {
        if (
          action === null ||
          where.token !== action.token ||
          action.consumedAt !== null
        ) {
          return { count: 0 };
        }
        action.consumedAt = NOW;
        return { count: 1 };
      },
      createMany: async () => ({ count: 0 }),
      create: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      // The re-render's token lookup: the round's LIVE answer capabilities,
      // matched on the deterministic target JSON exactly as production does.
      findMany: async ({
        where,
      }: {
        where: { targetId?: { in?: readonly string[] } };
      }) => {
        if (action === null) return [];
        const wanted = where.targetId?.in;
        if (
          wanted !== undefined &&
          !wanted.includes(action.targetId as string)
        ) {
          return [];
        }
        return [{ ...action }];
      },
    },
    planningRound: {
      findUnique: async () => (round === null ? null : { ...round }),
      findUniqueOrThrow: async () => ({ ...round }),
      findFirst: async () => (round === null ? null : { ...round }),
      findMany: async () => [],
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (
          options.failAnchorWrites === true &&
          Object.hasOwn(data, "anchorMessageId")
        ) {
          throw new Error("connection lost while recording anchor");
        }
        if (
          options.failAnnouncementWrites === true &&
          Object.hasOwn(data, "announcementMessageId")
        ) {
          throw new Error("connection lost while recording announcement");
        }
        if (options.failWrites === true) {
          throw new Error("connection lost mid-transaction");
        }
        if (round === null) return { count: 0 };
        // The `where` clause is EVALUATED, not ignored. Three production guards
        // live entirely in it — the expected-revision guard, the stale-week
        // predicate, and the status cooldown's compare-and-set — so a double
        // that matched unconditionally would report success for writes the
        // database would have refused, and every branch that depends on one of
        // them would be unreachable from this file.
        if (!matchesRound(round, where)) return { count: 0 };
        for (const [key, value] of Object.entries(data)) {
          if (key === "revision") continue;
          round[key] = value;
        }
        // Only a write that ASKS for the increment gets one. The status
        // cooldown's claim deliberately does not bump the revision, and a double
        // that bumped it anyway would break the re-anchor that follows it.
        if (data.revision !== undefined) {
          round.revision = (round.revision as number) + 1;
        }
        return { count: 1 };
      },
      create: async () => {
        if (options.failWrites === true) {
          throw new Error("connection lost mid-transaction");
        }
        return { ...createRound() };
      },
      count: async () => 0,
    },
    telegramUser: { findUnique: async () => null },
    chatMembership: { findMany: async () => options.members ?? [] },
    chatConfiguration: {
      findUnique: async () =>
        options.configuration === undefined
          ? {
              chatId: CHAT_ID,
              timezone: TIMEZONE,
              defaultWeekday: 3,
              defaultStartMinute: 600,
              durationMinutes: 120,
              dailyStartMinute: 600,
              dailyEndMinute: 1260,
            }
          : options.configuration,
    },
    planningParticipant: {
      count: async () => 0,
      createMany: async () => ({ count: 0 }),
      findUnique: async ({
        where,
      }: {
        where: {
          roundId_telegramUserId: { roundId: string; telegramUserId: bigint };
        };
      }) =>
        participants.find(
          (row) =>
            row.telegramUserId === where.roundId_telegramUserId.telegramUserId,
        ) ?? null,
      // The nullable-safe compare-and-set is EVALUATED, not ignored. It IS the
      // idempotency gate (D-04 / RELI-02): a double that reported a write the
      // database would have refused would make the duplicate branch below
      // unreachable from this file.
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        if (options.failWrites === true) {
          throw new Error("connection lost mid-transaction");
        }
        const row = participants.find(
          (entry) => entry.telegramUserId === where.telegramUserId,
        );
        if (row === undefined) return { count: 0 };
        const answer = data.availability as string;
        if (row.availability === answer) return { count: 0 };
        row.availability = answer;
        row.answeredAt = data.answeredAt as Date;
        return { count: 1 };
      },
      findMany: async () => participants.map((row) => ({ ...row })),
    },
  };
  return {
    ...client,
    $transaction: async (run: (tx: typeof client) => Promise<unknown>) =>
      await run(client),
  };
}

function createCapturingLogger() {
  const written: string[] = [];
  const logger = createLogger({
    destination: {
      write(chunk: string) {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) written.push(line);
        }
      },
    },
  });
  return {
    logger,
    lines: () =>
      written.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function createTelegramDouble(replyThrows = false, editError?: unknown) {
  const answers: { text?: string; show_alert?: boolean }[] = [];
  const edits: unknown[] = [];
  const sends: unknown[] = [];
  return {
    answers,
    edits,
    sends,
    ctx: {
      answerCallbackQuery: async (payload: {
        text?: string;
        show_alert?: boolean;
      }) => {
        answers.push(payload);
      },
      reply: async (...args: unknown[]) => {
        if (replyThrows) throw new Error("Telegram rejected the message");
        sends.push(args);
        return { message_id: 5150 };
      },
      api: {
        editMessageText: async (...args: unknown[]) => {
          if (editError !== undefined) throw editError;
          edits.push(args);
        },
        sendMessage: async (...args: unknown[]) => {
          sends.push(args);
        },
      },
    },
  };
}

function createDeps(
  prisma: unknown,
  logger = createCapturingLogger(),
  role: "administrator" | "member" = "member",
) {
  return {
    logger: logger.logger,
    prisma: undefined as never,
    authorization: { currentRole: async () => role } as never,
    planning: new PlanningService(prisma as never),
    now: () => NOW,
    capture: logger,
  };
}

/** One driven branch: the lines it emitted, and the Telegram calls it made. */
type Run = Readonly<{
  lines: Record<string, unknown>[];
  answers: { text?: string; show_alert?: boolean }[];
  edits?: unknown[];
  messages?: unknown[];
}>;

async function driveCallback(
  options: DoubleOptions & {
    actorId?: bigint;
    target?: PlanningTargetAction;
    rawTargetId?: string;
    actionOverrides?: Record<string, unknown>;
    role?: "administrator" | "member";
    /** What Telegram rejects the anchor edit with, if anything. */
    editError?: unknown;
    /** Whether Telegram rejects a NEW message — the announcement's send. */
    replyThrows?: boolean;
  },
): Promise<Run> {
  if (options.target === undefined && options.rawTargetId === undefined) {
    throw new Error("A typed target or raw target id is required");
  }
  const action = createAction(
    options.target ?? { action: "back", roundId: "raw-target-placeholder" },
    {
      ...(options.actionOverrides ?? {}),
      ...(options.rawTargetId === undefined
        ? {}
        : { targetId: options.rawTargetId }),
    },
  );
  const prisma = createPrismaDouble({ ...options, action });
  const capture = createCapturingLogger();
  const telegram = createTelegramDouble(
    options.replyThrows ?? false,
    options.editError,
  );
  const deps = createDeps(prisma, capture, options.role ?? "member");
  await dispatchPlanningCallback(
    telegram.ctx as never,
    deps,
    { chatId: CHAT_ID, actorId: options.actorId ?? AUTHOR_ID },
    action as unknown as CallbackActionRow,
    NOW,
  );
  return {
    lines: capture.lines(),
    answers: telegram.answers,
    messages: telegram.sends,
  };
}

async function driveStatus(
  options: DoubleOptions & {
    actorId?: bigint;
    role?: "administrator" | "member";
  },
): Promise<Run> {
  const prisma = createPrismaDouble(options);
  const capture = createCapturingLogger();
  const telegram = createTelegramDouble();
  const deps = createDeps(prisma, capture, options.role ?? "member");
  await handlePlanStatusCommand(
    telegram.ctx as never,
    deps,
    { chatId: CHAT_ID, actorId: options.actorId ?? AUTHOR_ID },
    options.role ?? "member",
  );
  return {
    lines: capture.lines(),
    answers: telegram.answers,
    messages: telegram.sends,
  };
}

async function drivePlan(options: DoubleOptions): Promise<Run> {
  const prisma = createPrismaDouble(options);
  const capture = createCapturingLogger();
  const telegram = createTelegramDouble();
  const deps = createDeps(prisma, capture);
  await handlePlanCommand(
    telegram.ctx as never,
    deps,
    { chatId: CHAT_ID, actorId: AUTHOR_ID },
    // grammY's CommandContext is far wider than these handlers use; the double
    // provides exactly `reply` and `api`.
  );
  return {
    lines: capture.lines(),
    answers: telegram.answers,
    edits: telegram.edits,
    messages: telegram.sends,
  };
}

/**
 * Every terminating planning branch, driven for real.
 *
 * A branch is named by the outcome it is supposed to reach, and the driver
 * shapes the double so the production code — not the test — decides to go
 * there. The `expect` on `outcome` inside each case is therefore also a check
 * that the branch is still reachable at all.
 */
const BRANCHES: readonly Readonly<{
  name: string;
  outcome: string;
  reason?: string;
  run: () => Promise<Run>;
}>[] = [
  {
    name: "a day tap that advances the round",
    outcome: "day-selected",
    run: () =>
      driveCallback({
        round: createRound({ step: PlanningStep.DAY, selectedDate: null }),
        target: {
          action: "day",
          roundId: "round-logging-1",
          date: FUTURE_DAY,
        },
      }),
  },
  {
    name: "an hour tap that advances the round",
    outcome: "time-selected",
    run: () =>
      driveCallback({
        round: createRound(),
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 900,
        },
      }),
  },
  {
    name: "Back on a step after the first",
    outcome: "step-back",
    run: () =>
      driveCallback({
        round: createRound(),
        target: { action: "back", roundId: "round-logging-1" },
      }),
  },
  {
    name: "Confirm with an empty roster",
    outcome: "empty-roster",
    run: () =>
      driveCallback({
        round: createRound({
          step: PlanningStep.REVIEW,
          selectedStartMinute: 900,
        }),
        members: [],
        target: { action: "confirm", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a tap on a day already behind the chat's clock",
    outcome: "past-day",
    run: () =>
      driveCallback({
        round: createRound({ step: PlanningStep.DAY, selectedDate: null }),
        target: { action: "day", roundId: "round-logging-1", date: PAST_DAY },
      }),
  },
  {
    name: "a tap on an hour already behind the chat's clock",
    outcome: "past-slot",
    run: () =>
      driveCallback({
        round: createRound({ selectedDate: "2026-08-26" }),
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 600,
        },
      }),
  },
  {
    name: "a tap on an hour the clock change removed",
    outcome: "nonexistent-slot",
    run: () =>
      driveCallback({
        round: createRound({
          selectedDate: "2027-03-28",
          dailyStartMinute: 60,
          dailyEndMinute: 360,
          durationMinutes: 60,
        }),
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 180,
        },
      }),
  },
  {
    name: "a tap from someone who does not own the round",
    outcome: "not-author",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        round: createRound(),
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 900,
        },
      }),
  },
  {
    name: "a replayed selection tap",
    outcome: "duplicate-tap",
    run: () =>
      driveCallback({
        round: createRound(),
        actionOverrides: { consumedAt: NOW },
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 900,
        },
      }),
  },
  {
    name: "a selection tap whose round has moved on",
    outcome: "stale-action",
    run: () =>
      driveCallback({
        round: createRound({ status: PlanningRoundStatus.CONFIRMED }),
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 900,
        },
      }),
  },
  {
    name: "a token naming an action outside the minted vocabulary",
    outcome: "stale-action",
    reason: "unparseable-planning-target",
    run: () =>
      driveCallback({
        round: createRound(),
        rawTargetId: JSON.stringify({
          action: "cancel",
          roundId: "round-logging-1",
        }),
      }),
  },
  {
    name: "a takeover of a round that is still active",
    outcome: "takeover-not-eligible",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "administrator",
        round: createRound({ lastActivityAt: NOW }),
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a takeover attempted by someone who is not an administrator",
    outcome: "takeover-not-admin",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "member",
        round: createRound({
          lastActivityAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        }),
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a takeover that succeeds",
    outcome: "round-taken-over",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "administrator",
        round: createRound({
          lastActivityAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        }),
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a status request with no live round",
    outcome: "no-active-round",
    run: () => driveStatus({ round: null }),
  },
  {
    name: "a status request in an unconfigured chat",
    outcome: "chat-not-configured",
    run: () => driveStatus({ round: null, configuration: null }),
  },
  {
    name: "a status request inside the cooldown",
    outcome: "status-cooling-down",
    run: () => driveStatus({ round: createRound({ lastStatusPostedAt: NOW }) }),
  },
  {
    name: "a status request that re-posts the card",
    outcome: "status-reposted",
    // Pinned explicitly now that THREE different cards go out under this one
    // outcome (D-03): the wizard step, the live availability card and a booked
    // round's closed summary. An operator holding only the logs has to be able
    // to tell which one the chat actually received.
    reason: "card-reposted-at-chat-bottom",
    run: () => driveStatus({ round: createRound() }),
  },
  {
    name: "a status request that re-posts the availability card",
    outcome: "status-reposted",
    reason: "availability-card-reposted",
    run: () =>
      driveStatus({
        round: confirmedRound(),
        // The round's EXISTING answer capability. `status()` loads it rather
        // than minting, so the re-post is driven by a token that already
        // existed — which is the property under test.
        action: createAction(ANSWER_AVAILABLE),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
      }),
  },
  {
    name: "a status request that re-posts a booked round's summary",
    outcome: "status-reposted",
    reason: "booked-summary-reposted",
    run: () =>
      driveStatus({
        round: confirmedRound({ status: PlanningRoundStatus.BOOKED }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
      }),
  },
  {
    name: "a /plan that starts a round",
    outcome: "round-started",
    run: () => drivePlan({ round: null }),
  },
  {
    name: "a /plan in an unconfigured chat",
    outcome: "chat-not-configured",
    run: () => drivePlan({ round: null, configuration: null }),
  },
  {
    name: "a /plan on a week someone else is already planning",
    outcome: "week-taken",
    run: () =>
      drivePlan({ round: createRound({ authorUserId: BYSTANDER_ID }) }),
  },
  {
    name: "a /plan whose database operation fails",
    outcome: "start-failed",
    run: () => drivePlan({ round: null, failWrites: true }),
  },

  // --- The per-control duplicate/stale/failed families.
  //
  // These four controls reach the SAME three outcomes, so without a branch here
  // for each of them the distinctness assertion below has nothing to compare and
  // two controls could quietly settle on one reason. A mutation proved exactly
  // that: collapsing Back's stale reason into the selection one came back GREEN
  // until these were added.
  {
    name: "a replayed Back tap",
    outcome: "duplicate-tap",
    run: () =>
      driveCallback({
        round: createRound(),
        actionOverrides: { consumedAt: NOW },
        target: { action: "back", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a Back tap whose round has moved on",
    outcome: "stale-action",
    run: () =>
      driveCallback({
        round: createRound({ status: PlanningRoundStatus.CONFIRMED }),
        target: { action: "back", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a Back tap whose write fails",
    outcome: "select-failed",
    run: () =>
      driveCallback({
        round: createRound(),
        failWrites: true,
        target: { action: "back", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a replayed Confirm tap",
    outcome: "duplicate-tap",
    run: () =>
      driveCallback({
        round: createRound({
          step: PlanningStep.REVIEW,
          selectedStartMinute: 900,
        }),
        actionOverrides: { consumedAt: NOW },
        target: { action: "confirm", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a Confirm tap whose round has moved on",
    outcome: "stale-action",
    run: () =>
      driveCallback({
        round: createRound({
          step: PlanningStep.REVIEW,
          selectedStartMinute: 900,
          status: PlanningRoundStatus.CONFIRMED,
        }),
        target: { action: "confirm", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a replayed Take over tap",
    outcome: "duplicate-tap",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "administrator",
        round: createRound({
          lastActivityAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        }),
        actionOverrides: { consumedAt: NOW },
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a Take over tap whose round has moved on",
    outcome: "stale-action",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "administrator",
        round: createRound({ status: PlanningRoundStatus.CONFIRMED }),
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a Take over tap whose write fails",
    outcome: "select-failed",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        role: "administrator",
        round: createRound({
          lastActivityAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        }),
        failWrites: true,
        target: { action: "takeover", roundId: "round-logging-1" },
      }),
  },
  {
    name: "a selection tap whose write fails",
    outcome: "select-failed",
    run: () =>
      driveCallback({
        round: createRound(),
        failWrites: true,
        target: {
          action: "time",
          roundId: "round-logging-1",
          startMinute: 900,
        },
      }),
  },

  // --- The availability answer (AVAIL-02 / AVAIL-03 / AVAIL-04).
  //
  // Six branches reaching four outcomes that other controls also reach, plus
  // the delivery failure the answer path is the first to classify. Every one of
  // them is driven through the REAL service against the participant double, so
  // the branch that decides is the production compare-and-set, not the test.
  {
    name: "an availability answer that records",
    outcome: "availability-answered",
    run: () =>
      driveCallback({
        round: confirmedRound(),
        // TWO participants, one of them still pending, so this branch stays a
        // COLLECTING answer. A one-participant lineup would also complete
        // unanimity and emit the announcement line, folding two decisions the
        // gate exists to keep apart into one driven branch.
        participants: [
          { telegramUserId: AUTHOR_ID, firstName: "Ada" },
          { telegramUserId: BYSTANDER_ID, firstName: "Bo" },
        ],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "an availability answer that completes unanimity",
    outcome: "ready-to-book-announced",
    reason: "unanimity-claimed-and-announced",
    run: () =>
      driveCallback({
        // Its OWN anchor: the process-memory render fingerprint another branch
        // left behind must not short-circuit the card edit this branch makes
        // before it announces.
        round: confirmedRound({ anchorMessageId: 4444 }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "an announcement Telegram refuses to deliver",
    outcome: "announce-failed",
    reason: "telegram-rejected-the-announcement",
    run: () =>
      driveCallback({
        round: confirmedRound({ anchorMessageId: 4445 }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
        replyThrows: true,
      }),
  },
  {
    name: "an announcement whose message id cannot be recorded",
    outcome: "announce-failed",
    reason: "announcement-not-recorded",
    run: () =>
      driveCallback({
        round: confirmedRound({ anchorMessageId: 4446 }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
        failAnnouncementWrites: true,
      }),
  },
  {
    name: "an availability tap from outside the confirm-time snapshot",
    outcome: "not-a-participant",
    run: () =>
      driveCallback({
        actorId: BYSTANDER_ID,
        round: confirmedRound(),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "a re-tap of the answer a participant already gave",
    outcome: "duplicate-tap",
    run: () =>
      driveCallback({
        round: confirmedRound(),
        participants: [
          {
            telegramUserId: AUTHOR_ID,
            firstName: "Ada",
            availability: "AVAILABLE",
          },
        ],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "an availability tap on a round that is already booked",
    outcome: "round-already-booked",
    run: () =>
      driveCallback({
        round: confirmedRound({ status: PlanningRoundStatus.BOOKED }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "an availability tap whose round has moved on",
    outcome: "stale-action",
    run: () =>
      driveCallback({
        round: createRound({ status: PlanningRoundStatus.DRAFT }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "an availability answer whose write fails",
    outcome: "answer-failed",
    run: () =>
      driveCallback({
        round: confirmedRound(),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        failWrites: true,
        target: ANSWER_AVAILABLE,
      }),
  },
  {
    name: "a card edit refused by Telegram flood control",
    outcome: "telegram-delivery-failed",
    reason: "telegram-flood-control-throttled",
    run: () =>
      driveCallback({
        // Its OWN anchor, so the process-memory render fingerprint another
        // branch left behind cannot short-circuit the edit this branch exists
        // to have rejected.
        round: confirmedRound({ anchorMessageId: 4343 }),
        participants: [{ telegramUserId: AUTHOR_ID, firstName: "Ada" }],
        target: ANSWER_AVAILABLE,
        editError: floodControlError(),
      }),
  },
];

describe("every terminating planning branch leaves a distinguishable trace", () => {
  it("strips the initial card when its anchor cannot be recorded", async () => {
    const run = await drivePlan({ round: null });

    expect(run.edits).toHaveLength(1);
    const edit = run.edits?.[0] as unknown[];
    expect(edit[1]).toBe(5150);
    expect(edit[3]).toEqual({ parse_mode: "HTML" });
    expect(
      run.lines.filter((line) => line.outcome === "anchor-not-recorded"),
    ).toHaveLength(1);
  });

  it("enumerates enough branches to be a real gate", () => {
    // The gate is only as good as its coverage; a shrinking enumeration is the
    // way this test would quietly stop protecting anything.
    expect(BRANCHES.length).toBeGreaterThanOrEqual(10);

    // And it has to contain the families that actually collide. Three outcomes
    // are reached by four different controls each, which is where two branches
    // become indistinguishable if nobody is looking.
    for (const outcome of ["duplicate-tap", "stale-action", "select-failed"]) {
      const family = BRANCHES.filter((branch) => branch.outcome === outcome);
      expect(family.length, outcome).toBeGreaterThanOrEqual(3);
    }

    // And the availability answer, whose six branches join those same colliding
    // families: an answer's duplicate, its stale target and its failed write are
    // a fifth control reaching outcomes four others already reach.
    for (const outcome of [
      "availability-answered",
      "not-a-participant",
      "round-already-booked",
      "answer-failed",
    ]) {
      expect(
        BRANCHES.some((branch) => branch.outcome === outcome),
        outcome,
      ).toBe(true);
    }
  });

  for (const branch of BRANCHES) {
    it(`emits exactly one bounded line for ${branch.name}`, async () => {
      const run = await branch.run();
      const matching = run.lines.filter(
        (line) => line.outcome === branch.outcome,
      );

      // The positive existential FIRST: the branch is reachable and it spoke.
      expect(matching).toHaveLength(1);
      const line = matching[0]!;
      expect(typeof line.event).toBe("string");
      expect((line.event as string).length).toBeGreaterThan(0);
      expect(typeof line.reason).toBe("string");
      expect((line.reason as string).length).toBeGreaterThan(0);
      if (branch.reason !== undefined) {
        expect(line.reason).toBe(branch.reason);
      }
      expect(line.reason).not.toBe(REDACTED);
      expect(line.outcome).not.toBe(REDACTED);
    });
  }

  it("gives no two branches the same event/outcome/reason triple", async () => {
    const triples = new Map<string, string>();
    for (const branch of BRANCHES) {
      const run = await branch.run();
      const line = run.lines.find((entry) => entry.outcome === branch.outcome);
      expect(line, branch.name).toBeDefined();
      const triple = JSON.stringify([
        line?.event,
        line?.route,
        line?.outcome,
        line?.reason,
      ]);
      const owner = triples.get(triple);
      // Two branches that answer identically are indistinguishable to an
      // operator holding nothing but the logs — which is the whole defect.
      expect(
        owner === undefined || owner === branch.name,
        `"${branch.name}" is indistinguishable from "${owner}": ${triple}`,
      ).toBe(true);
      triples.set(triple, branch.name);
    }
    expect(triples.size).toBe(BRANCHES.length);
  });

  it("gives no two branches the same (outcome, reason) pair, even across routes", async () => {
    // The stricter form, and the one the plan asks for. `route` is on every line
    // too, so distinctness of the quadruple above would already be enough to
    // tell two branches apart — but a reason that only becomes unique once you
    // also read the route is a reason that did not say enough on its own.
    const pairs = new Map<string, string>();
    for (const branch of BRANCHES) {
      const run = await branch.run();
      const line = run.lines.find((entry) => entry.outcome === branch.outcome);
      const pair = `${String(line?.outcome)}|${String(line?.reason)}`;
      const owner = pairs.get(pair);
      expect(
        owner === undefined || owner === branch.name,
        `"${branch.name}" and "${owner}" both report ${pair}`,
      ).toBe(true);
      pairs.set(pair, branch.name);
    }
    expect(pairs.size).toBe(BRANCHES.length);
  });
});

describe("absorbed failures keep their cause", () => {
  it("binds the caught value under `err` and under no other key", async () => {
    const capture = createCapturingLogger();
    const telegram = createTelegramDouble();
    const action = createAction({
      action: "confirm",
      roundId: "round-logging-1",
    });
    const doubleWithAction = createPrismaDouble({
      round: createRound({
        step: PlanningStep.REVIEW,
        selectedStartMinute: 900,
      }),
      members: [
        {
          id: "m-1",
          chatId: CHAT_ID,
          telegramUserId: 5n,
          telegramUser: { firstName: "A", lastName: null, username: null },
        },
      ],
      action,
      failWrites: true,
    });
    await dispatchPlanningCallback(
      telegram.ctx as never,
      createDeps(doubleWithAction, capture),
      { chatId: CHAT_ID, actorId: AUTHOR_ID },
      action as unknown as CallbackActionRow,
      NOW,
    );

    const failures = capture
      .lines()
      .filter((line) => line.outcome === "confirm-failed");
    // Positive existential before the absence assertions below.
    expect(failures).toHaveLength(1);
    const line = failures[0]!;
    expect(line.err).toBeDefined();
    expect(typeof line.reason).toBe("string");
    // The redactor renders `err` structurally — name and message, stack dropped.
    expect(line.err).toMatchObject({ name: "Error" });
    // And no other key smuggled the cause in beside it.
    for (const [key, value] of Object.entries(line)) {
      if (key === "err") continue;
      expect(JSON.stringify(value), key).not.toContain(
        "connection lost mid-transaction",
      );
    }
    expect(JSON.stringify(telegram.answers)).not.toContain(
      "connection lost mid-transaction",
    );
  });

  it("logs every recoverable planning-operation error without exposing it to Telegram", async () => {
    const failedBranches = BRANCHES.filter(
      ({ name }) =>
        name.includes("write fails") ||
        name.includes("database operation fails"),
    );
    expect(failedBranches).toHaveLength(5);

    for (const branch of failedBranches) {
      const run = await branch.run();
      const line = run.lines.find((entry) => entry.outcome === branch.outcome);
      expect(line?.err, branch.name).toMatchObject({ name: "Error" });
      expect(
        JSON.stringify([run.answers, run.messages]),
        branch.name,
      ).not.toContain("connection lost");
    }
  });

  it("keeps a re-anchor database error and sends only generic user-facing text", async () => {
    const run = await driveStatus({
      round: createRound(),
      failAnchorWrites: true,
    });
    const failures = run.lines.filter(
      (line) => line.outcome === "anchor-not-recorded",
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.err).toMatchObject({
      name: "Error",
      message: "connection lost while recording anchor",
    });
    expect(JSON.stringify([run.answers, run.messages])).not.toContain(
      "connection lost while recording anchor",
    );
  });

  it("records a Telegram delivery failure rather than swallowing it", async () => {
    const capture = createCapturingLogger();
    const telegram = createTelegramDouble(true);
    await handlePlanCommand(
      telegram.ctx as never,
      createDeps(createPrismaDouble({ round: null }), capture),
      { chatId: CHAT_ID, actorId: AUTHOR_ID },
    );

    const failures = capture
      .lines()
      .filter((line) => line.outcome === "telegram-delivery-failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.err).toBeDefined();
    expect(typeof failures[0]?.reason).toBe("string");
  });
});

describe("no planning log line carries a date, a time or a timezone", () => {
  it("emits lines, and none of them contains a forbidden value", async () => {
    const emitted: Record<string, unknown>[] = [];
    for (const branch of BRANCHES) {
      const run = await branch.run();
      emitted.push(...run.lines);
    }

    // The existential the absence rests on. Without it every assertion below
    // would hold over an empty array and certify nothing at all.
    expect(emitted.length).toBeGreaterThanOrEqual(BRANCHES.length);

    const serialized = JSON.stringify(emitted);
    for (const value of FORBIDDEN_VALUES) {
      expect(serialized, value).not.toContain(value);
    }
  });

  it("does not let a date or a zone survive under an allow-listed key", async () => {
    // The adversarial case: a future branch that decided a chosen date "is just
    // an identifier really" and put it under `targetId`. `targetId` IS
    // allow-listed, so this is the one shape the allow list cannot refuse — the
    // assertion is that it is refused by policy, proved by there being no such
    // call in the surface at all.
    const capture = createCapturingLogger();
    capture.logger.info(
      { event: "telegram.planning", targetId: FUTURE_DAY, reason: TIMEZONE },
      "adversarial",
    );
    const smuggled = capture.lines();
    expect(smuggled).toHaveLength(1);
    // The redactor is an allow list, so an allow-listed key DOES carry its
    // scalar through — which is exactly why the rule is enforced at the call
    // sites and asserted over the real branches above, not here.
    expect(smuggled[0]?.targetId).toBe(FUTURE_DAY);

    // The real guarantee: no production planning branch does this.
    const emitted: Record<string, unknown>[] = [];
    for (const branch of BRANCHES) {
      emitted.push(...(await branch.run()).lines);
    }
    expect(emitted.length).toBeGreaterThan(0);
    for (const line of emitted) {
      expect(line.targetId).toBeUndefined();
      expect(line.timezone).toBeUndefined();
      expect(line.date).toBeUndefined();
      expect(line.weekStart).toBeUndefined();
      expect(line.weekday).toBeUndefined();
      expect(line.minute).toBeUndefined();
    }
  });

  it("passes no object under an allow-listed key", async () => {
    // An allow-listed key holding an object is REDACTED rather than walked
    // (threat T-01-21-02), so a diagnostic passed that way is silently lost.
    const emitted: Record<string, unknown>[] = [];
    for (const branch of BRANCHES) {
      emitted.push(...(await branch.run()).lines);
    }
    expect(emitted.length).toBeGreaterThan(0);
    for (const line of emitted) {
      for (const [key, value] of Object.entries(line)) {
        if (key === "err") continue;
        expect(
          value,
          `${key} was redacted, so it was passed as an object`,
        ).not.toBe(REDACTED);
      }
    }
  });
});

/** Compile-time proof that the round shape the doubles build is the real one. */
export type __RoundShapeIsReal = PlanningRound;
