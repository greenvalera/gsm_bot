import { describe, expect, it } from "vitest";

import {
  availabilityOutcome,
  type AvailabilityParticipantCell,
  type AvailabilityStepProjection,
  type ParticipantMarker,
} from "../../src/domain/planning/planning-service.js";
import {
  PLANNING_CAN_ATTEND_LABEL,
  PLANNING_CANNOT_ATTEND_LABEL,
  PLANNING_MARKER_CANNOT_ATTEND,
  PLANNING_MARKER_CAN_ATTEND,
  PLANNING_MARKER_PENDING,
  type PlanningControlAction,
} from "../../src/telegram/keyboards.js";
import {
  PLANNING_AVAILABILITY_LEGEND,
  renderAvailabilityCard,
} from "../../src/telegram/planning-renderers.js";
import * as planningSurface from "../../src/telegram/planning-handlers.js";

/**
 * AVAIL-03 and AVAIL-04, as the card actually renders them.
 *
 * The organizing rule under test is D-08's: the list should not move. Answers
 * change MARKERS, never positions — so every fixture below asserts the same
 * participant lines in the same order, whatever order the answers arrived in
 * and whatever the input order of the projection's own cells.
 *
 * Fixtures are hand-built `AvailabilityStepProjection` values rather than
 * database rows (which is why `owner` is optional on the type): the renderer is
 * pure, and a suite that had to reach real PostgreSQL to assert a legend line
 * would be a slower test proving less.
 */

/** Thursday of the 2026-08-24 target week, and the hour every fixture picks. */
const CHOSEN_DATE = "2026-08-27";
const START_MINUTE = 900;
const DURATION_MINUTES = 120;

/** The Bot API's hard cap on `answerCallbackQuery` text. */
const CALLBACK_ALERT_LIMIT = 200;

/** The three glyphs that may lead a PARTICIPANT line, and nothing else. */
const PARTICIPANT_GLYPHS = [
  PLANNING_MARKER_PENDING,
  PLANNING_MARKER_CAN_ATTEND,
  PLANNING_MARKER_CANNOT_ATTEND,
] as const;

type CellSpec = Readonly<{
  id: bigint;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  marker: ParticipantMarker;
}>;

function cell(spec: CellSpec): AvailabilityParticipantCell {
  return {
    telegramUserId: spec.id,
    firstName: spec.firstName ?? null,
    lastName: spec.lastName ?? null,
    username: spec.username ?? null,
    marker: spec.marker,
  };
}

type ProjectionOverrides = Readonly<{
  booked?: boolean;
  owner?: AvailabilityStepProjection["owner"];
}>;

/**
 * A projection whose counts and outcome are DERIVED from its cells.
 *
 * Never hand-written numbers: a fixture free to claim "2 of 3" over three
 * pending cells would let the card and the derivation drift apart in exactly
 * the way `availabilityOutcome` exists to prevent.
 */
function project(
  specs: readonly CellSpec[],
  overrides: ProjectionOverrides = {},
): AvailabilityStepProjection {
  const participants = specs.map(cell);
  return {
    selectedDate: CHOSEN_DATE,
    startMinute: START_MINUTE,
    durationMinutes: DURATION_MINUTES,
    participants,
    answeredCount: participants.filter((entry) => entry.marker !== "pending")
      .length,
    totalCount: participants.length,
    outcome: availabilityOutcome(participants),
    booked: overrides.booked ?? false,
    ...(overrides.owner === undefined ? {} : { owner: overrides.owner }),
  };
}

type RenderedCard = Readonly<{
  text: string;
  keyboard: { inline_keyboard: readonly (readonly { text: string }[])[] };
}>;

/** The lookup a live round supplies: both shared answer capabilities (D-04). */
const LIVE_TOKENS = (action: PlanningControlAction) => {
  if (action === "answer-available") return "v1:token-can-attend";
  if (action === "answer-unavailable") return "v1:token-cannot-attend";
  return undefined;
};

/** The lookup a closed round supplies: nothing, so no row is drawn at all. */
const NO_TOKENS = () => undefined;

function render(
  specs: readonly CellSpec[],
  tokenFor: (action: PlanningControlAction) => string | undefined = LIVE_TOKENS,
  overrides: ProjectionOverrides = {},
): RenderedCard {
  return renderAvailabilityCard(
    project(specs, overrides),
    tokenFor,
  ) as RenderedCard;
}

function lines(card: RenderedCard) {
  return card.text.split("\n");
}

/** Every line the card devotes to one named participant. */
function participantLines(card: RenderedCard) {
  return lines(card).filter((line) =>
    PARTICIPANT_GLYPHS.some((glyph) => line.startsWith(glyph)),
  );
}

/** The participant line with its leading marker removed, so names can be compared. */
function stripMarker(line: string) {
  const glyph = PARTICIPANT_GLYPHS.find((entry) => line.startsWith(entry));
  return glyph === undefined ? line : line.slice(glyph.length).trimStart();
}

function namesOf(card: RenderedCard) {
  return participantLines(card).map(stripMarker);
}

function countLinesOf(card: RenderedCard) {
  return lines(card).filter((line) => /Answered \d+ of \d+\./.test(line));
}

function legendLineOf(card: RenderedCard) {
  return lines(card).find((line) =>
    Object.values(PLANNING_AVAILABILITY_LEGEND).some((entry) =>
      line.includes(entry),
    ),
  );
}

function labelsOf(card: RenderedCard) {
  return card.keyboard.inline_keyboard.flatMap((row) =>
    row.map((button) => button.text),
  );
}

const ADA = { id: 7101n, firstName: "Ada" } as const;
const BO = { id: 7102n, firstName: "Bo" } as const;
const ZOE = { id: 7103n, firstName: "Zoe" } as const;

const ALL_PENDING: readonly CellSpec[] = [
  { ...ADA, marker: "pending" },
  { ...BO, marker: "pending" },
  { ...ZOE, marker: "pending" },
];

describe("the shape of the availability card", () => {
  it("renders one marked line per participant and exactly one count line", () => {
    const card = render(ALL_PENDING);

    expect(participantLines(card)).toHaveLength(3);
    expect(namesOf(card)).toEqual(["Ada", "Bo", "Zoe"]);
    expect(
      participantLines(card).every((line) =>
        line.startsWith(PLANNING_MARKER_PENDING),
      ),
    ).toBe(true);
    // D-09: ONE count line. A second line enumerating who is still missing is
    // the chasing framing this product exists to remove.
    expect(countLinesOf(card)).toHaveLength(1);
    expect(countLinesOf(card)[0]).toContain("0 of 3");
  });

  it("moves only the markers as answers arrive, never the lines", () => {
    const before = render(ALL_PENDING);
    const after = render([
      { ...ADA, marker: "available" },
      { ...BO, marker: "unavailable" },
      { ...ZOE, marker: "pending" },
    ]);

    expect(namesOf(after)).toEqual(namesOf(before));
    expect(participantLines(after)).toHaveLength(3);
    expect(countLinesOf(after)[0]).toContain("2 of 3");
    expect(after.text).toContain(`${PLANNING_MARKER_CAN_ATTEND} Ada`);
    expect(after.text).toContain(`${PLANNING_MARKER_CANNOT_ATTEND} Bo`);
    expect(after.text).toContain(`${PLANNING_MARKER_PENDING} Zoe`);
  });

  it("keeps the line order fixed however the answers arrived", () => {
    // The SAME three people and the same three answers, handed to the renderer
    // in two different orders — which is what two different arrival orders
    // produce upstream, because the re-read returns rows in database order.
    const oneOrder = render([
      { ...ZOE, marker: "pending" },
      { ...ADA, marker: "available" },
      { ...BO, marker: "unavailable" },
    ]);
    const another = render([
      { ...BO, marker: "unavailable" },
      { ...ZOE, marker: "pending" },
      { ...ADA, marker: "available" },
    ]);

    expect(namesOf(oneOrder)).toEqual(["Ada", "Bo", "Zoe"]);
    expect(participantLines(another)).toEqual(participantLines(oneOrder));
  });

  it("gives two collator-equal labels two stable lines, broken by Telegram id", () => {
    // AVAIL-04 adjacency. The roster collator has `sensitivity: "base"`, so
    // "ada" and "Ada" compare EQUAL — the exact case where a naive sort is free
    // to swap two people between renders, and where a grouping renderer would
    // merge them into one line.
    const specs: readonly CellSpec[] = [
      { id: 91n, firstName: "ada", marker: "pending" },
      { id: 42n, firstName: "Ada", marker: "pending" },
    ];
    const first = render(specs);
    const second = render([...specs].reverse());

    expect(participantLines(first)).toHaveLength(2);
    // The lower Telegram id wins the tie, in BOTH input orders.
    expect(namesOf(first)).toEqual(["Ada", "ada"]);
    expect(participantLines(second)).toEqual(participantLines(first));
  });

  it("renders one line and a one-of-one count for a single participant", () => {
    // AVAIL-04 empty. A band of one is the smallest lineup Confirm will accept.
    const waiting = render([{ ...ADA, marker: "pending" }]);
    const answered = render([{ ...ADA, marker: "available" }]);

    expect(participantLines(waiting)).toHaveLength(1);
    expect(countLinesOf(waiting)[0]).toContain("0 of 1");
    expect(participantLines(answered)).toHaveLength(1);
    expect(countLinesOf(answered)[0]).toContain("1 of 1");
  });

  it("stays total on the empty lineup Confirm already refuses", () => {
    // A zero-participant availability round is unreachable — Confirm refuses an
    // empty roster — but the renderer is a total function, so it answers rather
    // than throwing if it is ever reached.
    const card = render([]);

    expect(participantLines(card)).toHaveLength(0);
    expect(countLinesOf(card)[0]).toContain("0 of 0");
  });

  it("renders plain safe labels, escaped exactly once and never as a mention", () => {
    const card = render([
      { id: 5n, firstName: "A & B", lastName: "<script>", marker: "pending" },
    ]);

    // D-10: the card is edited on every answer, so a mention would re-notify
    // the whole lineup on every tap.
    expect(card.text).not.toContain("tg://user");
    expect(card.text).toContain("A &amp; B &lt;script&gt;");
    // `memberLabel` already escapes; a second pass would ship `&amp;amp;`.
    expect(card.text).not.toContain("&amp;amp;");
  });
});

describe("the legend above the list (D-08)", () => {
  it("has an entry for every marker a participant can carry", () => {
    for (const marker of [
      "pending",
      "available",
      "unavailable",
    ] as const satisfies readonly ParticipantMarker[]) {
      expect(PLANNING_AVAILABILITY_LEGEND[marker].length).toBeGreaterThan(0);
    }
  });

  it("advertises only the markers the card actually uses", () => {
    const card = render(ALL_PENDING);
    const legend = legendLineOf(card);

    expect(legend).toBeDefined();
    expect(legend).toContain(PLANNING_AVAILABILITY_LEGEND.pending);
    expect(legend).not.toContain(PLANNING_AVAILABILITY_LEGEND.available);
    expect(legend).not.toContain(PLANNING_AVAILABILITY_LEGEND.unavailable);
  });

  it("orders the legend the same way whatever order the answers arrived in", () => {
    const oneOrder = legendLineOf(
      render([
        { ...ADA, marker: "unavailable" },
        { ...BO, marker: "available" },
        { ...ZOE, marker: "pending" },
      ]),
    );
    const another = legendLineOf(
      render([
        { ...ZOE, marker: "pending" },
        { ...ADA, marker: "unavailable" },
        { ...BO, marker: "available" },
      ]),
    );

    expect(oneOrder).toBeDefined();
    expect(another).toBe(oneOrder);
    const line = oneOrder as string;
    expect(line.indexOf(PLANNING_AVAILABILITY_LEGEND.pending)).toBeLessThan(
      line.indexOf(PLANNING_AVAILABILITY_LEGEND.available),
    );
    expect(line.indexOf(PLANNING_AVAILABILITY_LEGEND.available)).toBeLessThan(
      line.indexOf(PLANNING_AVAILABILITY_LEGEND.unavailable),
    );
  });

  it("keeps the legend out of the participant list", () => {
    // The structural invariant every reader and every test leans on: a line
    // that LEADS with a participant marker is a participant. The legend names
    // the same glyphs, so it must not be able to masquerade as a member.
    const card = render(ALL_PENDING);

    expect(participantLines(card)).toHaveLength(3);
    expect(participantLines(card)).not.toContain(legendLineOf(card));
  });
});

describe("the one derived outcome (D-05)", () => {
  const pending = { marker: "pending" } as const;
  const available = { marker: "available" } as const;
  const unavailable = { marker: "unavailable" } as const;

  it("is collecting while anybody is still pending, whatever the answers so far", () => {
    expect(availabilityOutcome([pending, available])).toBe("collecting");
    expect(availabilityOutcome([unavailable, pending])).toBe("collecting");
  });

  it("is all-available only once every participant can attend", () => {
    expect(availabilityOutcome([available, available])).toBe("all-available");
  });

  it("is blocked once everyone has answered and at least one cannot", () => {
    expect(availabilityOutcome([available, unavailable])).toBe("blocked");
    expect(availabilityOutcome([unavailable, unavailable])).toBe("blocked");
  });

  it("closes the card with one sentence chosen from that outcome", () => {
    const collecting = render([
      { ...ADA, marker: "available" },
      { ...BO, marker: "pending" },
    ]);
    const allAvailable = render([
      { ...ADA, marker: "available" },
      { ...BO, marker: "available" },
    ]);
    const blocked = render([
      { ...ADA, marker: "available" },
      { ...BO, marker: "unavailable" },
    ]);

    expect(collecting.text).toContain("Answers are still coming in.");
    expect(allAvailable.text).toContain("Everyone can make it.");
    expect(blocked.text).toContain("This slot doesn't work for the whole band.");
    // One sentence, not a pile of them.
    expect(blocked.text).not.toContain("Answers are still coming in.");
    expect(collecting.text).not.toContain("Everyone can make it.");
  });

  it("offers no replan control and no copy implying one", () => {
    const blocked = render([
      { ...ADA, marker: "available" },
      { ...BO, marker: "unavailable" },
    ]);
    const text = blocked.text.toLowerCase();

    for (const forbidden of [
      "replan",
      "reschedule",
      "pick another",
      "try another",
      "start again",
      "/plan",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    // The declared availability rows are the only controls this card can draw:
    // a blocked round is still OPEN (D-04/D-05), so both answers stay live and
    // a participant can still change their mind — but there is no third button.
    expect(labelsOf(blocked)).toEqual([
      PLANNING_CAN_ATTEND_LABEL,
      PLANNING_CANNOT_ATTEND_LABEL,
    ]);
  });
});

describe("a card with nothing left to press", () => {
  it("draws no control row when the round minted no live answer tokens", () => {
    const card = render(
      [
        { ...ADA, marker: "available" },
        { ...BO, marker: "unavailable" },
      ],
      NO_TOKENS,
    );

    // `planningControlRows` DROPS a control whose token was never minted, so an
    // empty declaration reaches Telegram as a keyboard with no button in it.
    expect(labelsOf(card)).toEqual([]);
    // The card still SAYS everything it said; only the keyboard is gone.
    expect(participantLines(card)).toHaveLength(2);
  });

  it("renders a booked round with no control row at all (D-16)", () => {
    const card = render(
      [
        { ...ADA, marker: "available" },
        { ...BO, marker: "available" },
      ],
      NO_TOKENS,
      { booked: true },
    );

    expect(labelsOf(card)).toEqual([]);
    expect(participantLines(card)).toHaveLength(2);
  });
});

describe("every planning refusal fits in a callback alert", () => {
  it("holds each exported refusal constant to the 200-character cap", () => {
    const constants = Object.entries(planningSurface).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    );

    // The positive existential: an absence proved over an empty set would
    // certify exactly the defect this assertion exists to catch.
    expect(constants.length).toBeGreaterThan(0);
    for (const [name, text] of constants) {
      expect([...text].length, `${name}: ${text}`).toBeLessThanOrEqual(
        CALLBACK_ALERT_LIMIT,
      );
    }
  });

  it("holds the one refusal that interpolates a member label to the same cap", () => {
    // Telegram allows 64 characters of first name, 64 of last, and 32 of
    // username; the label the refusal quotes is built from all three, so the
    // longest legitimate member in the world is the fixture.
    const refusal = planningSurface.planningNotAuthorText({
      telegramUserId: 4242n,
      firstName: "F".repeat(64),
      lastName: "L".repeat(64),
      username: "u".repeat(32),
    });

    expect([...refusal].length).toBeLessThanOrEqual(CALLBACK_ALERT_LIMIT);
    // Bounded, not emptied: the refusal still names who owns the card.
    expect(refusal).toContain("FFFF");
    expect(refusal).toContain("started this plan");
  });
});
