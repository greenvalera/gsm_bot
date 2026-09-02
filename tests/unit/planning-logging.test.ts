import { describe, expect, it } from "vitest";

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
    revision: 4,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Record<string, unknown>;
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
  /**
   * When the chat last spoke without a round, or `undefined` for never.
   *
   * The roundless `/plan_status` cooldown lives in its own row rather than on
   * `PlanningRound`, because the branches it protects are the ones with no
   * round to hold it.
   */
  statusCooldownAt?: Date;
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
 * Deliberately narrow: it understands scalar equality, `{ lt }`, and a top-level
 * `OR` of those, which is exactly what `updateMany` is called with. Anything
 * else throws rather than matching, so a future guard written in an operator
 * this double cannot evaluate fails loudly instead of silently passing.
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
      if (keys.length !== 1 || keys[0] !== "lt") {
        throw new Error(`Double cannot evaluate where.${key}: ${keys.join()}`);
      }
      const bound = operators.lt;
      if (actual === null || actual === undefined) return false;
      if (actual instanceof Date && bound instanceof Date) {
        if (!(actual.getTime() < bound.getTime())) return false;
        continue;
      }
      if (!((actual as string) < (bound as string))) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function createPrismaDouble(options: DoubleOptions) {
  const round = options.round ?? null;
  const action = options.action ?? null;
  let cooldown: { chatId: bigint; lastPostedAt: Date } | null =
    options.statusCooldownAt === undefined
      ? null
      : { chatId: CHAT_ID, lastPostedAt: options.statusCooldownAt };
  const client = {
    // Modelled rather than stubbed, for the same reason `planningRound`
    // evaluates its own `where`: a double that answered unconditionally would
    // report a claim the database would have refused, and the silent-after-first
    // branch would be unreachable from this file.
    chatStatusCooldown: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { lastPostedAt: { lt: Date } };
        data: { lastPostedAt: Date };
      }) => {
        if (cooldown === null) return { count: 0 };
        if (
          !(cooldown.lastPostedAt.getTime() < where.lastPostedAt.lt.getTime())
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
      create: async () => ({ ...createRound() }),
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

function createTelegramDouble(replyThrows = false) {
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
}>;

async function driveCallback(
  options: DoubleOptions & {
    actorId?: bigint;
    target?: PlanningTargetAction;
    rawTargetId?: string;
    actionOverrides?: Record<string, unknown>;
    role?: "administrator" | "member";
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
  const telegram = createTelegramDouble();
  const deps = createDeps(prisma, capture, options.role ?? "member");
  await dispatchPlanningCallback(
    telegram.ctx as never,
    deps,
    { chatId: CHAT_ID, actorId: options.actorId ?? AUTHOR_ID },
    action as unknown as CallbackActionRow,
    NOW,
  );
  return { lines: capture.lines(), answers: telegram.answers };
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
  return { lines: capture.lines(), answers: telegram.answers };
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
  return { lines: capture.lines(), answers: telegram.answers };
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
    run: () => driveStatus({ round: createRound() }),
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
];

describe("every terminating planning branch leaves a distinguishable trace", () => {
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
