import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";

import { PermissionDeniedError } from "../../src/domain/auth/authorization-service.js";
import type { RosterMember } from "../../src/domain/roster/roster-service.js";
import { CallbackActionKind } from "../../src/generated/prisma/client.js";
import {
  createCallbackToken,
  createRosterRemovalTarget,
  parseRosterRemovalTarget,
} from "../../src/shared/callback-schema.js";
import { createLogger } from "../../src/shared/logger.js";
import { registerRosterHandlers } from "../../src/telegram/handlers.js";
import {
  ROSTER_PAGE_SIZE,
  escapeHtml,
  memberLabel,
  paginateRoster,
  plainMemberLabel,
  renderRoster,
  sortRosterMembers,
} from "../../src/telegram/roster-renderers.js";

const CHAT_ID = -1001234567890n;
const ADMIN_ID = 1001n;
const NOW = new Date("2026-08-21T09:00:00.000Z");

const EMPTY_TEXT = [
  "<b>No band members yet</b>",
  "Reply to a member's message, then send /roster_add to add them.",
].join("\n");
const LOADING_TEXT = ["<b>Band roster</b>", "Loading the roster…"].join("\n");
const FAILURE_TEXT = "I couldn't load the roster. Please try again.";
const STALE_TEXT =
  "This action is no longer available. Open /settings or /roster and try again.";
const COMMAND_DENIAL_TEXT =
  "Only current chat administrators can change chat setup, roster, or planning access.";
const CALLBACK_DENIAL_TEXT = "Only current chat administrators can do that.";

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function member(
  telegramUserId: bigint,
  identity: Partial<Omit<RosterMember, "membershipId" | "telegramUserId">> = {},
): RosterMember {
  return {
    membershipId: `membership-${telegramUserId}`,
    telegramUserId,
    firstName: null,
    lastName: null,
    username: null,
    ...identity,
  };
}

// Telegram IDs are deliberately full width so that a random hex token can never
// coincidentally contain one, keeping the leak assertions meaningful.
const FIXTURE_ID_BASE = 770000000000000000n;

function rosterOf(size: number): RosterMember[] {
  return Array.from({ length: size }, (_, index) =>
    member(FIXTURE_ID_BASE + BigInt(index), {
      firstName: `Member ${String(index + 1).padStart(3, "0")}`,
    }),
  );
}

type InlineKeyboardPayload = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

function keyboardOf(payload: Record<string, unknown>) {
  return payload.reply_markup as InlineKeyboardPayload | undefined;
}

function removalTokens(keyboard: InlineKeyboardPayload | undefined) {
  return (keyboard?.inline_keyboard ?? [])
    .filter((row) => row[0]?.text === "Remove member")
    .map((row) => row[0]!.callback_data);
}

function navigationToken(
  keyboard: InlineKeyboardPayload | undefined,
  label: "Previous" | "Next" | "Retry",
) {
  for (const row of keyboard?.inline_keyboard ?? []) {
    const button = row.find((candidate) => candidate.text === label);
    if (button !== undefined) return button.callback_data;
  }
  return undefined;
}

function renderedLabels(payload: Record<string, unknown>) {
  return String(payload.text)
    .split("\n")
    .filter((line) => line.startsWith("• "))
    .map((line) => line.slice(2));
}

function createHarness(listActive: () => Promise<readonly RosterMember[]>) {
  const actions = new Map<string, Record<string, unknown>>();
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  let administrator = true;
  let draftDiscards = 0;

  const prisma = {
    callbackAction: {
      async create({ data }: { data: Record<string, unknown> }) {
        actions.set(data.token as string, { ...data, consumedAt: null });
        return actions.get(data.token as string);
      },
      async findUnique({ where }: { where: { token: string } }) {
        return actions.get(where.token) ?? null;
      },
    },
  };

  const roster = {
    async listActive() {
      return listActive();
    },
    async createRemovalAction(
      chatId: bigint,
      actorId: bigint,
      membershipId: string,
      at: Date,
    ) {
      const token = createCallbackToken();
      actions.set(token, {
        token,
        kind: CallbackActionKind.ROSTER_REMOVE,
        chatId,
        actorUserId: actorId,
        targetId: createRosterRemovalTarget({
          action: "request",
          membershipId,
        }),
        expiresAt: new Date(at.getTime() + 30 * 60 * 1000),
        consumedAt: null,
      });
      return token;
    },
  };

  const authorization = {
    async requireCurrentAdministrator() {
      if (!administrator) throw new PermissionDeniedError();
    },
    /**
     * The non-destructive accessor the callback boundary now asks first. The
     * double answers from the SAME flag as the sibling above, so a role change
     * still moves both answers together and the two cannot disagree.
     */
    async currentRole() {
      return administrator ? ("administrator" as const) : ("member" as const);
    },
    /**
     * Phase 1's delete-on-denial side effect, now invoked by the boundary once
     * the action row proves the surface is admin-only. Recorded rather than
     * ignored so this suite cannot mask its disappearance.
     */
    async discardActorDrafts() {
      draftDiscards += 1;
    },
  };

  const bot = new Bot("123456:TEST_TOKEN", {
    botInfo: {
      id: 9001,
      is_bot: true,
      first_name: "GSMBot",
    } as UserFromGetMe,
  });
  registerRosterHandlers(bot, {
    logger: createLogger({ level: "silent" }),
    prisma,
    authorization,
    roster,
    now: () => NOW,
  } as never);
  (
    bot as unknown as {
      api: { config: { use: (fn: (...args: never[]) => unknown) => void } };
    }
  ).api.config.use((async (
    _previous: unknown,
    method: string,
    payload: Record<string, unknown>,
  ) => {
    calls.push({ method, payload });
    return {
      ok: true,
      result: {
        message_id: 42,
        date: 1_784_000_000,
        chat: { id: Number(CHAT_ID), type: "supergroup" },
        text: payload.text ?? "",
      },
    };
  }) as never);

  return {
    actions,
    bot,
    calls,
    demote() {
      administrator = false;
    },
    /** How many times the denial path destroyed the actor's in-flight drafts. */
    draftDiscards() {
      return draftDiscards;
    },
    edits() {
      return calls.filter((call) => call.method === "editMessageText");
    },
    alerts() {
      return calls.filter((call) => call.method === "answerCallbackQuery");
    },
    last() {
      return calls[calls.length - 1]!;
    },
    reset() {
      calls.length = 0;
    },
    texts() {
      return calls.map((call) => String(call.payload.text ?? ""));
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

function expectPageBinding(
  harness: Harness,
  payload: Record<string, unknown>,
  expected: readonly RosterMember[],
) {
  expect(renderedLabels(payload)).toEqual(expected.map(memberLabel));

  const tokens = removalTokens(keyboardOf(payload));
  expect(tokens).toHaveLength(expected.length);
  tokens.forEach((token, index) => {
    const target = parseRosterRemovalTarget(
      harness.actions.get(token)?.targetId as string,
    );
    if (!target.success || target.data.action !== "request")
      throw new Error("removal button is not bound to a removal request");
    expect(target.data.membershipId).toBe(expected[index]!.membershipId);
    expect(token).not.toContain(expected[index]!.telegramUserId.toString());
    expect(token).not.toContain(memberLabel(expected[index]!));
  });
}

function rosterCommand(updateId: number) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_784_000_000,
      chat: { id: Number(CHAT_ID), type: "supergroup" },
      from: { id: Number(ADMIN_ID), is_bot: false, first_name: "Admin" },
      text: "/roster",
      entities: [{ offset: 0, length: 7, type: "bot_command" }],
    },
  } as never;
}

function rosterCallback(updateId: number, data: string) {
  return {
    update_id: updateId,
    callback_query: {
      id: `callback-${updateId}`,
      from: { id: Number(ADMIN_ID), is_bot: false, first_name: "Admin" },
      chat_instance: "test-chat-instance",
      data,
      message: {
        message_id: 42,
        date: 1_784_000_000,
        chat: { id: Number(CHAT_ID), type: "supergroup" },
        text: "<b>Band roster</b>",
      },
    },
  } as never;
}

describe("roster identity projection", () => {
  it("renders every identity form and never exposes a full Telegram ID", () => {
    expect(
      memberLabel(
        member(700000000000000001n, {
          firstName: "Ada",
          lastName: "Lovelace",
          username: "ada",
        }),
      ),
    ).toBe("Ada Lovelace — @ada");
    expect(memberLabel(member(700000000000000002n, { firstName: "Bob" }))).toBe(
      "Bob",
    );
    expect(
      memberLabel(member(700000000000000003n, { username: "ghost" })),
    ).toBe("@ghost");
    expect(memberLabel(member(987654321987654321n))).toBe(
      "Telegram user ••••4321",
    );

    const projection = renderRoster([
      member(987654321987654321n),
      member(700000000000000001n, {
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
      }),
      member(700000000000000002n, { firstName: "Bob" }),
    ]);
    expect(projection.text.split("\n")).toEqual([
      "<b>Band roster</b>",
      "• Ada Lovelace — @ada",
      "• Bob",
      "• Telegram user ••••4321",
    ]);
    expect(projection.text).not.toContain("987654321987654321");
    expect(projection.text).not.toContain("700000000000000001");
  });

  it("escapes markup in a Telegram identity instead of rendering it", () => {
    expect(
      memberLabel(member(5150n, { firstName: "<b>Eve</b>", username: "e&v" })),
    ).toBe("&lt;b&gt;Eve&lt;/b&gt; — @e&amp;v");
  });

  it("derives every HTML label by escaping the shared plain identity label", () => {
    const identities = [
      member(6101n, { firstName: "Ada" }),
      member(6102n, {
        firstName: "Ada",
        lastName: "Lovelace",
        username: "ada",
      }),
      member(6103n, { username: "ghost" }),
      member(987654321987654321n),
      member(6105n, { firstName: "Ben & <b>Jo</b>", username: "b&j" }),
    ];

    for (const identity of identities) {
      expect(memberLabel(identity)).toBe(
        escapeHtml(plainMemberLabel(identity)),
      );
    }
  });

  it("sorts Unicode labels deterministically and breaks equal labels by an unrendered ID", () => {
    const cyrillic = member(5004n, {
      firstName: "Ольга".repeat(8),
      username: "o".repeat(28),
    });
    const members = [
      member(5002n, { firstName: "Ada" }),
      member(5001n, { firstName: "Ada" }),
      member(5003n, { firstName: "Ängström", username: "ang" }),
      cyrillic,
    ];

    const forward = sortRosterMembers(members);
    const reversed = sortRosterMembers([...members].reverse());
    expect(forward.map((entry) => entry.membershipId)).toEqual(
      reversed.map((entry) => entry.membershipId),
    );
    expect(forward.slice(0, 2).map((entry) => entry.telegramUserId)).toEqual([
      5001n,
      5002n,
    ]);

    const projection = renderRoster(members);
    expect(projection.text).toContain(`• ${memberLabel(cyrillic)}`);
    expect(projection.text).toContain("Ольга".repeat(8));
    expect(projection.text).not.toContain("5004");
  });
});

describe("roster pagination boundaries", () => {
  it("renders the exact empty state without removal controls", () => {
    expect(renderRoster([])).toEqual({ text: EMPTY_TEXT });
    expect(paginateRoster([], 0)).toMatchObject({
      total: 0,
      pageCount: 1,
      start: 0,
      end: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("keeps one and twenty members on a single unpaged projection", () => {
    const one = rosterOf(1);
    expect(paginateRoster(one, 0)).toMatchObject({
      total: 1,
      pageCount: 1,
      start: 1,
      end: 1,
      hasPrevious: false,
      hasNext: false,
    });
    expect(renderRoster(one).text).not.toContain("Showing");

    const twenty = rosterOf(ROSTER_PAGE_SIZE);
    expect(paginateRoster(twenty, 0)).toMatchObject({
      total: 20,
      pageCount: 1,
      start: 1,
      end: 20,
      hasNext: false,
    });
    expect(renderRoster(twenty).text).not.toContain("Showing");
    expect(renderedLabels({ text: renderRoster(twenty).text })).toHaveLength(
      20,
    );
  });

  it("splits more than twenty members into deterministic pages with an exact footer", () => {
    const twentyOne = rosterOf(21);
    const first = paginateRoster(twentyOne, 0);
    const second = paginateRoster(twentyOne, 1);
    expect(first).toMatchObject({
      page: 0,
      pageCount: 2,
      start: 1,
      end: 20,
      hasPrevious: false,
      hasNext: true,
    });
    expect(second).toMatchObject({
      page: 1,
      pageCount: 2,
      start: 21,
      end: 21,
      hasPrevious: true,
      hasNext: false,
    });
    expect(renderRoster(twentyOne, 0).text).toContain("Showing 1–20 of 21");
    expect(renderRoster(twentyOne, 1).text).toContain("Showing 21–21 of 21");

    const covered = [...first.members, ...second.members].map(
      (entry) => entry.membershipId,
    );
    expect(new Set(covered).size).toBe(21);
    expect(covered).toEqual(
      sortRosterMembers(twentyOne).map((entry) => entry.membershipId),
    );

    const many = paginateRoster(rosterOf(45), 2);
    expect(many).toMatchObject({ pageCount: 3, start: 41, end: 45 });
  });

  it("clamps an out-of-range page instead of rendering an empty page", () => {
    const twentyOne = rosterOf(21);
    expect(paginateRoster(twentyOne, 9).page).toBe(1);
    expect(paginateRoster(twentyOne, -3).page).toBe(0);
    expect(paginateRoster(twentyOne, 9).members).toHaveLength(1);
  });
});

describe("roster surface delay, failure, and retry", () => {
  it("shows an in-flight state before the authoritative populated projection", async () => {
    const members = rosterOf(3);
    const harness = createHarness(async () => {
      await delay(5);
      return members;
    });

    await harness.bot.handleUpdate(rosterCommand(201));

    expect(harness.texts()[0]).toBe(LOADING_TEXT);
    expect(keyboardOf(harness.calls[0]!.payload)).toBeUndefined();
    const final = harness.last().payload;
    expectPageBinding(harness, final, sortRosterMembers(members));
    expect(String(final.text)).not.toContain("Showing");
    expect(navigationToken(keyboardOf(final), "Next")).toBeUndefined();
  });

  it("shows an in-flight state before an empty roster with no removal controls", async () => {
    const harness = createHarness(async () => {
      await delay(5);
      return [];
    });

    await harness.bot.handleUpdate(rosterCommand(202));

    expect(harness.texts()).toEqual([LOADING_TEXT, EMPTY_TEXT]);
    expect(keyboardOf(harness.last().payload)).toBeUndefined();
  });

  it("replaces a failed read with a retry action and never a partial page", async () => {
    let attempt = 0;
    const members = rosterOf(2);
    const harness = createHarness(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("roster read failed");
      return members;
    });

    await harness.bot.handleUpdate(rosterCommand(203));

    expect(harness.texts()).toEqual([LOADING_TEXT, FAILURE_TEXT]);
    const failure = harness.last().payload;
    expect(removalTokens(keyboardOf(failure))).toEqual([]);
    const retryToken = navigationToken(keyboardOf(failure), "Retry");
    expect(retryToken).toMatch(/^v1:/);

    harness.reset();
    await harness.bot.handleUpdate(rosterCallback(204, retryToken!));

    const edits = harness.edits();
    expect(String(edits[0]!.payload.text)).toBe(LOADING_TEXT);
    const recovered = edits[edits.length - 1]!.payload;
    expectPageBinding(harness, recovered, sortRosterMembers(members));
  });
});

describe("roster page navigation identity", () => {
  it("keeps per-member removal identity across deterministic pages of twenty", async () => {
    const members = [
      ...rosterOf(ROSTER_PAGE_SIZE),
      member(FIXTURE_ID_BASE + 999n, {
        firstName: "Ω".repeat(40),
        username: "omega".repeat(5),
      }),
    ];
    const sorted = sortRosterMembers(members);
    const harness = createHarness(async () => members);

    await harness.bot.handleUpdate(rosterCommand(205));
    const first = harness.last().payload;
    expect(String(first.text)).toContain("Showing 1–20 of 21");
    expectPageBinding(harness, first, sorted.slice(0, ROSTER_PAGE_SIZE));
    expect(navigationToken(keyboardOf(first), "Previous")).toBeUndefined();
    const nextToken = navigationToken(keyboardOf(first), "Next");
    expect(nextToken).toMatch(/^v1:/);

    harness.reset();
    await harness.bot.handleUpdate(rosterCallback(206, nextToken!));

    const edits = harness.edits();
    expect(String(edits[0]!.payload.text)).toBe(LOADING_TEXT);
    const second = edits[edits.length - 1]!.payload;
    expect(String(second.text)).toContain("Showing 21–21 of 21");
    expectPageBinding(harness, second, sorted.slice(ROSTER_PAGE_SIZE));
    expect(navigationToken(keyboardOf(second), "Next")).toBeUndefined();
    expect(navigationToken(keyboardOf(second), "Previous")).toMatch(/^v1:/);
  });

  it("clamps a stale page action to the roster that still exists", async () => {
    let members = rosterOf(21);
    const harness = createHarness(async () => members);

    await harness.bot.handleUpdate(rosterCommand(207));
    const nextToken = navigationToken(
      keyboardOf(harness.last().payload),
      "Next",
    )!;

    members = members.slice(0, 5);
    harness.reset();
    await harness.bot.handleUpdate(rosterCallback(208, nextToken));

    const edits = harness.edits();
    const final = edits[edits.length - 1]!.payload;
    expect(String(final.text)).not.toContain("Showing");
    expectPageBinding(harness, final, sortRosterMembers(members));
  });

  it("refuses an expired page action without re-rendering the roster", async () => {
    const harness = createHarness(async () => rosterOf(21));

    await harness.bot.handleUpdate(rosterCommand(209));
    const nextToken = navigationToken(
      keyboardOf(harness.last().payload),
      "Next",
    )!;
    const stored = harness.actions.get(nextToken)!;
    stored.expiresAt = new Date(NOW.getTime() - 1);

    harness.reset();
    await harness.bot.handleUpdate(rosterCallback(210, nextToken));

    expect(harness.edits()).toEqual([]);
    expect(harness.alerts().at(-1)?.payload.text).toBe(STALE_TEXT);
  });
});

describe("roster access revalidation", () => {
  it("denies a demoted administrator before reading the roster", async () => {
    const harness = createHarness(async () => {
      throw new Error("roster must not be read for a denied actor");
    });
    harness.demote();

    await harness.bot.handleUpdate(rosterCommand(211));

    expect(harness.texts()).toEqual([COMMAND_DENIAL_TEXT]);
  });

  it("denies a page action from an actor who lost administrator rights", async () => {
    let readable = true;
    const harness = createHarness(async () => {
      if (!readable)
        throw new Error("roster must not be read for a denied actor");
      return rosterOf(21);
    });

    await harness.bot.handleUpdate(rosterCommand(212));
    const nextToken = navigationToken(
      keyboardOf(harness.last().payload),
      "Next",
    )!;

    readable = false;
    harness.demote();
    harness.reset();
    await harness.bot.handleUpdate(rosterCallback(213, nextToken));

    expect(harness.edits()).toEqual([]);
    expect(harness.alerts().at(-1)?.payload.text).toBe(CALLBACK_DENIAL_TEXT);
    // Roster is an admin-only surface, so the demoted actor's in-flight drafts
    // are still destroyed on denial (threat T-01-08).
    expect(harness.draftDiscards()).toBe(1);
  });
});
