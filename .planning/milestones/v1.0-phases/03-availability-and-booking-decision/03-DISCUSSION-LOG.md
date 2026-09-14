# Phase 3: Availability and Booking Decision - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-05
**Phase:** 3-Availability and Booking Decision
**Areas discussed:** Publishing the card, Answering & changing, Card status display, Ready-to-book & booked

---

## Publishing the Card

### How does a confirmed proposal become a live availability card?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto on Confirm | The same transaction that commits the proposal also publishes the availability card. One tap, no dead time, nothing to forget. | ✓ |
| Publish button on the confirmed card | The confirmed card gains a single author-only Publish control; reverses Phase 2's D-04. | |
| Separate command | A `/publish`-style command; keeps the confirmed card terminal but is less discoverable (cf. Phase 1 finding F-12). | |

**User's choice:** Auto on Confirm
**Notes:** Settles the question Phase 2 D-04 left open by refusing a placeholder — no control was needed at all.

### Where does the availability card live?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace the anchor in place | The wizard anchor becomes the availability card; `renderConfirmedStep` becomes a transition, not a terminal render. | ✓ |
| New message, new anchor | The confirmed card stays in history; the availability card posts fresh and becomes the live anchor. Costs a schema column. | |

**User's choice:** Replace the anchor in place
**Notes:** Carries Phase 2 D-01 (one evolving card) forward unbroken.

### What should the chat see if the publish edit fails?

| Option | Description | Selected |
|--------|-------------|----------|
| State stands, recover via status | The durable round stands; `/plan_status` re-posts the live availability card (D-14) as recovery. Never rolls back a committed proposal. | ✓ |
| Retry, then tell the chat | Same durable outcome plus a plain fallback message pointing at `/plan_status`. | |
| You decide | Leave failure handling to research and planning. | |

**User's choice:** State stands, recover via status
**Notes:** Makes it a requirement that the status command renders the availability card, not only the wizard steps.

---

## Answering & Changing

### Can a participant change their answer after tapping?

| Option | Description | Selected |
|--------|-------------|----------|
| Freely, until the round closes | Both buttons stay live; the other one overwrites. Re-tapping your own answer is an idempotent no-op with a private alert. | ✓ |
| First answer is final | Simplest state machine, but a fat-fingered "Cannot attend" would force a full replan. | |
| Yes changeable, No final | Asymmetric; harder to explain in one line of card copy. | |

**User's choice:** Freely, until the round closes
**Notes:** Framed as "a mis-tap must never cost the group a round."

### What does a "Cannot attend" do in Phase 3, given AVAIL-05 is Phase 4?

| Option | Description | Selected |
|--------|-------------|----------|
| Records and stays open | Marks the participant unavailable and keeps collecting; once all have answered with at least one No, the card says the slot doesn't work — offering no action Phase 3 hasn't built. | ✓ |
| Records and closes the round | Closer to final AVAIL-05 behavior, but contradicts changeable answers and ships a dead end. | |
| You decide | Leave the terminal copy and state to research and planning. | |

**User's choice:** Records and stays open
**Notes:** Leaves the round in exactly the state Phase 4's replan trigger will attach to.

### A snapshotted participant is removed from the roster mid-round — can they still answer?

| Option | Description | Selected |
|--------|-------------|----------|
| Snapshot wins — they answer | The confirm-time snapshot is authoritative for the round's whole life; roster changes take effect next round. The completion denominator can't shift under an open round. | ✓ |
| Live roster wins — refuse them | Strictest AUTH-02 reading, but silently changes the denominator and could make a round uncompletable. | |
| Snapshot, but drop from the tally | Most "correct", most moving parts; the card's lineup would diverge from the confirmed card the chat already saw. | |

**User's choice:** Snapshot wins — they answer
**Notes:** The permission AUTH-02 revalidates on this surface is snapshot membership, read fresh at the action boundary.

### Someone outside the snapshot taps a button — what do they get?

| Option | Description | Selected |
|--------|-------------|----------|
| Private alert naming the reason | Phase 1 D-13 pattern; no group message, so a stray tap adds no chat noise. | ✓ |
| Private alert, plus offer the roster path | More helpful the first time, but roster management is Phase 1's surface, not this card's. | |

**User's choice:** Private alert naming the reason

---

## Card Status Display

### How should each participant's status render?

| Option | Description | Selected |
|--------|-------------|----------|
| One line per name, leading marker | Roster-ordered marked list with a legend above — the Phase 2 D-08 pattern. Order never jumps as answers arrive. | ✓ |
| Grouped into sections | Can / Cannot / Still to answer blocks; reads instantly but visibly reshuffles on every answer. | |
| One line per name, marker plus count line | Same list; the difference is only whether completion gets its own line. | |

**User's choice:** One line per name, leading marker
**Notes:** Stability of the line order was the deciding factor — people look for their own name.

### How should overall completion show (AVAIL-04)?

| Option | Description | Selected |
|--------|-------------|----------|
| A count line above the list | "N of M answered" above the marked names; the same number Phase 5 follow-ups will key off. | ✓ |
| Only the markers | Least copy, but leaves the reader doing arithmetic the bot could do. | |
| Count line plus an explicit outstanding line | Duplicates the list, though it pre-stages REM-04. | |

**User's choice:** A count line above the list

### Plain labels or real Telegram mentions?

| Option | Description | Selected |
|--------|-------------|----------|
| Plain safe labels | Reuses the roster display label; keeps notification behavior off an edit path that fires on every vote. | ✓ |
| Real mentions for pending only | More actionable, but would need Telegram edit-notification behavior verified before shipping. | |

**User's choice:** Plain safe labels
**Notes:** Targeted pinging is Phase 5's job (REM-04), in a fresh message.

### How should the redraw behave under concurrent taps?

| Option | Description | Selected |
|--------|-------------|----------|
| Edit per answer, serialized | Immediate edit on every answer; `sequentialize` by chat key already prevents races. Most responsive. | ✓ |
| Debounce the redraw | Fewer API calls under a burst, but a tapper can press and see nothing change. | |
| You decide | Leave the strategy to research and planning. | |

**User's choice:** Edit per answer, serialized

---

## Ready-to-Book & Booked

### How does the chat learn that everyone can attend (AVAIL-07)?

| Option | Description | Selected |
|--------|-------------|----------|
| New announcement message | The anchor updates AND a fresh message announces the result, carries Mark as booked, and becomes the new anchor. An edit notifies nobody. | ✓ |
| Edit the anchor in place only | Strictly D-01, zero extra messages, but the result can go unseen. | |
| Announcement message, controls stay on the card | Keeps one control surface but splits the moment and makes the reader scroll up to act. | |

**User's choice:** New announcement message
**Notes:** Unanimity is the one moment in the round that has to break through.

### Who may press Mark as booked (LIFE-01)?

| Option | Description | Selected |
|--------|-------------|----------|
| Author or any current admin | Exactly what LIFE-01 specifies; matches Phase 1 D-12. The author can't become a single point of failure. | ✓ |
| Author only | Tightest ownership, but narrows the requirement and the booker may not be the planner. | |
| Anyone in the snapshot | Lowest friction, no ownership, contradicts the requirement's wording. | |

**User's choice:** Author or any current admin

### Should Mark as booked take a confirmation step?

| Option | Description | Selected |
|--------|-------------|----------|
| Single tap, no confirmation | One press records a fact already true externally; Phase 4's cancel/change is the correction path. | |
| Named confirmation step | A confirm-then-apply pair like Phase 1's roster removal. Guards a mis-tap on a state Phase 3 can't undo. | ✓ |

**User's choice:** Named confirmation step
**Notes:** Chosen over the recommendation — Phase 3 ships no undo, so the guard is worth the extra callback action kind.

### How should "booked" be recorded durably?

| Option | Description | Selected |
|--------|-------------|----------|
| New BOOKED round status | Add to `PlanningRoundStatus` and to `WEEK_CLAIMING_STATUSES`; one exhaustible enum carries the lifecycle position. | ✓ |
| A `bookedAt` timestamp | Records when as well as whether, but turns "is it booked" into a null check spread across callers. | |
| Both — status plus timestamp | Complete, but the two can disagree if a future write forgets one. | |

**User's choice:** New BOOKED round status

### Once a round is BOOKED, what happens to the buttons?

| Option | Description | Selected |
|--------|-------------|----------|
| Round closes — buttons removed | Booking is what "until the round closes" meant; late taps get a private alert. Changing a booked rehearsal is Phase 4's LIFE-04. | ✓ |
| Buttons stay live | Honest about reality, but leaves a booked round able to stop being unanimous with no available response. | |

**User's choice:** Round closes — buttons removed

---

## Claude's Discretion

- Command names, button labels, marker glyphs, legend wording, and all card copy (constrained: no replan action implied, no booking undo implied).
- The durable shape of a participant's answer and the migration carrying it alongside the `BOOKED` enum value.
- Whether the all-answered-with-a-no state gets its own status or is derived (if derived, in one function).
- Callback action kinds, target schema entries, route ids, and their deliberate `protectedWhen` declarations.
- Retry, backoff, and error classification on the card edit path.
- Status re-post and cooldown behavior once the anchor has moved to the announcement message.

## Deferred Ideas

- The "Cannot attend" → close-and-replan flow — Phase 4 (AVAIL-05/AVAIL-06).
- Undoing or changing a booking — Phase 4 (LIFE-03/LIFE-04).
- Booked rounds supplying previous-rehearsal defaults — Phase 4 (LIFE-02/LIFE-05).
- The "unless explicitly changed" half of AVAIL-06's snapshot rule — Phase 4.
- Pinging outstanding participants — Phase 5 (REM-04).
- Per-round participant adjustment — still deferred from Phase 2 D-09.
