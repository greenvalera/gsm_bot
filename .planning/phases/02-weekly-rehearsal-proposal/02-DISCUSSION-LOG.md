# Phase 2: Weekly Rehearsal Proposal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 2-Weekly Rehearsal Proposal
**Areas discussed:** Proposal card flow, Week & slot boundaries, Participant picker, Ownership & recovery

---

## Proposal Card Flow

### How should the planning wizard appear in the group chat?

| Option | Description | Selected |
|--------|-------------|----------|
| One card, edited in place | `/plan` posts a single group message replaced in place at each step; reuses the Phase 1 in-place pattern and gives the round one anchor `message_id`. | ✓ |
| New message per step | Each step posts a fresh card; simpler, but clutters the chat and leaves stale buttons clickable. | |
| Private DM wizard | Author picks in a private chat; keeps the group quiet but breaks the Telegram-group-only constraint. | |

**User's choice:** One card, edited in place

### Who is allowed to drive the card?

| Option | Description | Selected |
|--------|-------------|----------|
| Author only | Only the starter can advance it; others get a private alert naming the owner. Keeps the state machine single-writer. | ✓ |
| Author or any admin | More forgiving, but concurrent drivers and takeover loses meaning. | |
| Anyone who may start planning | Most collaborative, but races and no clear owner. | |

**User's choice:** Author only

### Can the author go back and change an earlier step?

| Option | Description | Selected |
|--------|-------------|----------|
| Back button on every step | Returns to the previous selector with the earlier choice applied; avoids cancel-and-restart on a mis-tap. | ✓ |
| Only the final review can revise | Forward-only with jump-backs from the summary. | |
| Forward only — cancel to restart | Simplest state machine, worst experience. | |

**User's choice:** Back button on every step

### Where should this phase's flow stop?

| Option | Description | Selected |
|--------|-------------|----------|
| Stop at a confirmed proposal | Review summary + explicit Confirm atomically promotes a durable proposal record; mirrors Phase 1 D-03. | ✓ |
| Stop at the review summary | Nothing promoted; leaves the round in an expiring draft, weakening RELI-01. | |
| Confirm, and stub the publish button | Makes the Phase 3 seam visible, but ships a dead control. | |

**User's choice:** Stop at a confirmed proposal

---

## Week & Slot Boundaries

### What should the day selector do with days already past in the current target week?

| Option | Description | Selected |
|--------|-------------|----------|
| Show all 7, past ones disabled | Every day rendered (PLAN-04), past ones marked and refused with a private alert. | ✓ |
| Show only remaining days | Cleanest keyboard, but the week reads as a fragment and "every day" becomes false. | |
| Show all 7, all selectable | Simplest, but a mis-tap schedules a rehearsal in the past. | |

**User's choice:** Show all 7, past ones disabled

### Which generated hourly slots count as valid?

| Option | Description | Selected |
|--------|-------------|----------|
| Whole rehearsal must fit | `start + duration <= dailyEnd`; 10:00–21:00 with 2h yields 10:00–19:00. Matches `validateSchedule` and CONF-04. | ✓ |
| Start must be in the window | More choice, but contradicts CONF-04 and the shipped validator. | |
| Fit, but allow an explicit override | Flexible, but adds an override to a rule the chat configured deliberately. | |

**User's choice:** Whole rehearsal must fit

### Hours already past when the chosen day is today?

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule as days — disabled | One consistent "in the past" rule across both selectors; the full configured window stays visible. | ✓ |
| Drop past hours | Shortest keyboard, but the window looks different depending on the day. | |
| Allow them | Fewer edge cases, but a same-day proposal can land in a passed hour. | |

**User's choice:** Same rule as days — disabled

### How should default / previous highlights read on a button?

| Option | Description | Selected |
|--------|-------------|----------|
| Emoji markers + card legend | Distinct leading markers with the legend in the card text; survives Telegram's narrow button width (cf. F-9). | ✓ |
| Word suffixes on the label | Unambiguous, but long text forces one button per row or truncates — the exact Phase 1 failure. | |
| Highlight only in the card text | Clean keyboard, but the reader must hold two facts while scanning. | |

**User's choice:** Emoji markers + card legend

---

## Participant Picker

### How should the author adjust who is included (PLAN-09)?

| Option | Description | Selected |
|--------|-------------|----------|
| Toggle list of the whole roster | One button per active member showing in/out state; reuses paginated collator-ordered listing. | ✓ (later superseded) |
| Selected list + Add sub-screen | Shorter default card, but two screens and two callback shapes. | |
| Accept default, edit only on request | Fastest common path, hides the roster a tap deeper. | |

**User's choice:** Toggle list of the whole roster — superseded later in this area by the roster-as-lineup decision.

### What should be pre-selected on the very first rehearsal?

| Option | Description | Selected |
|--------|-------------|----------|
| Everyone on the roster | The roster is already an admin-curated band list; over-inclusive is visible and correctable. | ✓ |
| Nobody — start empty | No accidental inclusions, but laborious and invites a zero-participant card. | |
| Everyone, but require a confirm | Safer against blind taps, but repeats the review summary. | |

**User's choice:** Everyone on the roster

### What should the pre-selection do with a previous participant who is no longer on the roster?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop them silently | Intersection of previous participants and the active roster. | |
| Drop them, but say so | Transparent, but surfaces a departure weekly. | |
| Keep them, marked as off-roster | Nobody dropped unseen, but undercuts the roster as the authorization boundary. | |

**User's choice:** *(free text)* "Lets change it. Don't take participents from previosly rehearsal, and take it always from roster. If we need to change we need to chage roster. Its made logic more clear"

**Notes:** This changes the model rather than answering the question. It was flagged in-session as a change to locked requirements: PLAN-08, PLAN-09, ROADMAP Phase 2 success criterion 5, and the corresponding PROJECT.md active requirement all state the previous-participants-seeded model. The user confirmed the change with the follow-up below. The ripple is recorded in CONTEXT.md under "Requirements Ripple".

### Does the author still adjust the lineup per round?

| Option | Description | Selected |
|--------|-------------|----------|
| Roster is the lineup — no picker | No participants step; the proposal snapshots every active roster member at confirm. Drops PLAN-09 from this phase. | ✓ |
| Keep the toggle, roster-seeded | PLAN-09 survives; the toggle always starts from the full active roster. | |
| Roster is the lineup, with an opt-out | Escape hatch on the review card; one more branch. | |

**User's choice:** Roster is the lineup — no picker

### What if the roster is empty at confirm time?

| Option | Description | Selected |
|--------|-------------|----------|
| Block an empty roster only | Refuse Confirm with zero active members and direct to `/roster_add`; any non-empty roster confirms. | ✓ |
| Block at the start instead | Fails earlier, but couples starting planning to roster state. | |
| Allow it | Nothing to special-case, but Phase 3 inherits an unanswerable card. | |

**User's choice:** Block an empty roster only

---

## Ownership & Recovery

### What makes a planning process "abandoned" (AUTH-03)?

| Option | Description | Selected |
|--------|-------------|----------|
| Inactivity timeout | Configured no-action period (Phase 1 used 30 min) makes the round takeable; reuses existing expiry mechanics. | ✓ |
| Admin can take over any time | No waiting, but "abandoned" loses meaning and an admin can interrupt mid-selection. | |
| Timeout, or the author hands off | Covers a planner stepping away, at the cost of another command and state. | |

**User's choice:** Inactivity timeout

### What happens to selections already made when an admin takes over?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the selections | The new author continues from where it stopped; Back on every step allows revision. | ✓ |
| Reset to the first step | Nobody inherits an unseen decision, but a round abandoned at review loses everything. | |
| Keep them, require a re-confirm | Explicit handoff, but Back already makes revision reachable. | |

**User's choice:** Keep the selections

### What should the status request produce (PLAN-10)?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-post the live card | A fresh copy becomes the new anchor; genuinely recovers a card buried by chat traffic. | ✓ |
| Read-only summary | Safe and cheap, but a buried card stays buried. | |
| Summary plus a jump link | Single anchor, but a deleted or old anchor leaves the round unreachable. | |

**User's choice:** Re-post the live card

### Who may issue the status request?

| Option | Description | Selected |
|--------|-------------|----------|
| Anyone in the chat, read-only for non-authors | Card renders for everyone; buttons still refuse non-authors. Visibility for all, control for one. | ✓ |
| Only the author or an admin | Tighter surface, but turns "when are we rehearsing?" into a denial. | |
| Anyone, but only the author gets buttons | Avoids dead buttons, at the cost of two rendering paths. | |

**User's choice:** Anyone in the chat, read-only for non-authors

---

## Claude's Discretion

- Command names, button labels, marker glyphs, and card copy.
- The concrete inactivity threshold and the mechanism that reaps stale rounds.
- Durable schema for the round, its anchor message, and its participant snapshot; how the one-active-process-per-week rule is enforced.
- Timezone-relative computation of the "past" boundary, and the DST policy for a target week containing a transition — a named open concern in STATE.md that research must resolve.
- Pagination or message-splitting if a card exceeds Telegram limits.

## Deferred Ideas

- Per-round participant adjustment (would revive PLAN-09) — dropped by the roster-as-lineup decision.
- Explicit author hand-off of a round — considered alongside the abandonment rule and not adopted.
- Reconciling `AVAIL-06` and `LIFE-05` with the roster-as-lineup model — belongs to the Phase 3 and Phase 4 discussions.
