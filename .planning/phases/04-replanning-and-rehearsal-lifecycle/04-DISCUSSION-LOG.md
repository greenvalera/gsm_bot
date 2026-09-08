# Phase 4: Replanning and Rehearsal Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-08
**Phase:** 4-Replanning and Rehearsal Lifecycle
**Areas discussed:** Replan trigger, Replan mechanics, Cancel & change, Previous rehearsal

---

## Area selection

| Option | Description | Selected |
|--------|-------------|----------|
| Replan trigger | When a "Cannot attend" actually closes the round; AVAIL-05 vs Phase 3 D-04/D-05 | ✓ |
| Replan mechanics | Rewind vs. supersede-and-new-round; old card's live buttons; the participant snapshot | ✓ |
| Cancel & change | How LIFE-03/LIFE-04 are invoked; the durable status; week release; group notification | ✓ |
| Previous rehearsal | LIFE-05's boundary and whether only booked rounds count | ✓ |

**User's choice:** all four areas.

---

## Replan trigger

### Q1 — When does a "Cannot attend" close the availability round?

| Option | Description | Selected |
|--------|-------------|----------|
| First "no" closes it | Round closes the moment anyone taps "Cannot attend"; matches AVAIL-05 literally; supersedes D-05; a mis-tap costs the round | |
| Only when all have answered | Close on the existing `blocked` outcome (all answered, ≥1 no); preserves D-04 fully; band keeps getting pinged about a dead slot | |
| Closes, reversible until replan | First "no" closes and prompts the author immediately, but that person can flip back until the author commits a new slot | ✓ |

**User's choice:** Closes, reversible until replan.
**Notes:** Both properties were wanted — no chasing answers on a dead slot, and no mis-tap costing the band a round. Became D-01, and amends Phase 3 D-05.

### Q2 — While the round is closed-but-reopenable, what does the card carry?

| Option | Description | Selected |
|--------|-------------|----------|
| Both buttons stay live | Nothing removed; card text says the slot is blocked; author additionally gets Replan; `availabilityOutcome()` changes only in when it returns `blocked` | ✓ |
| Only blockers keep buttons | Non-blockers lose their buttons; two keyboards for two classes of participant on one card | |
| Author-only reopen | All participant buttons removed; author gets Replan and Reopen; every mis-tap routes through a human conversation | |

**User's choice:** Both buttons stay live.
**Notes:** Became D-02. Keeps D-04 literally true for the round's whole life; reopening needs no special action.

### Q3 — Does anything land in the chat beyond the card edit?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse the announcement slot | `announcementMessageId` carries whichever break-through fact the round warrants; reuses the post/edit/retract directive and its cooldown | ✓ |
| Card edit only | No new message for a block; cheapest, but the author may not notice | |
| Its own separate message | A third durable message slot; unambiguous, but a third re-post/re-anchor path | |

**User's choice:** Reuse the announcement slot.
**Notes:** Became D-03. A reopen retracts the blocked message the way a flipped answer already retracts a ready-to-book one.

### Q4 — Who may act on the replan prompt?

| Option | Description | Selected |
|--------|-------------|----------|
| Author only; takeover is the escape | D-02's author-only card; absent authors handled by the existing 30-minute `isTakeoverEligible` path | |
| Author or current admin | Mirrors D-13's booking eligibility; no 30-minute stall; raises an attribution question | ✓ |
| Anyone the access policy admits | Whoever could have started planning; fastest recovery, loosest control | |

**User's choice:** Author or current admin.
**Notes:** Became D-04. The attribution tension it raised (card's owner line vs. its controls) was flagged as unresolved and folded into the next area — settled there by D-06, since the new round's author is whoever replanned.

---

## Replan mechanics

### Q1 — What does replanning do to the durable round?

| Option | Description | Selected |
|--------|-------------|----------|
| Supersede and create a new round | Old → SUPERSEDED with week released, new round created re-claiming it; per-attempt history; AVAIL-08 becomes structural; costs a link column and an atomic week hand-off | ✓ |
| Rewind the same round in place | Same row reset to DRAFT/DAY with answers cleared; zero new schema; destroys attempt history; AVAIL-08 rests on the revision guard | |
| Rewind in place, log attempts | Hybrid; an attempt table nothing else reads | |

**User's choice:** Supersede and create a new round.
**Notes:** Became D-05 and D-06. The roadmap's own success criterion 2 already says "stale or **superseded** buttons".

### Q2 — Where does the replanned round's lineup come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Re-snapshot the live roster | New round snapshots the active roster as Confirm does; "explicitly changed" means roster management; a replan with an emptied roster refuses per D-10 | ✓ |
| Copy the old snapshot verbatim | AVAIL-06 literally true; a removed member keeps being asked with no way to stop it | |
| Copy, minus anyone deactivated | Removals take effect, additions wait; a third rule about who is in a round | |

**User's choice:** Re-snapshot the live roster.
**Notes:** Became D-07. This settles the AVAIL-06 / D-09 tension deferred since Phase 2 and carried through Phase 3's deferred list.

### Q3 — What happens to the superseded round's messages?

| Option | Description | Selected |
|--------|-------------|----------|
| Neuter the old, post a fresh card | Old card edited to a terminal attempt line, announcement retracted, new day selector posted at the bottom | ✓ |
| Hand the card to the new round | `anchorMessageId` moves; one live card throughout; erases the failed attempt and may stay buried | |
| Leave the old card untouched | Fewest Telegram calls; leaves a keyboard that looks live and isn't | |

**User's choice:** Neuter the old, post a fresh card.
**Notes:** Became D-08.

### Q4 — What does a tap on a superseded round's button get?

| Option | Description | Selected |
|--------|-------------|----------|
| A distinct "replanned" alert | Separate from `PLANNING_STALE_TEXT`; points at `/plan_status`, not `/plan` | ✓ |
| Distinct alert plus a re-posted card | Self-service recovery, rate-limited by the existing cooldowns; adds a write path to a refusal | |
| Reuse the generic stale text | Cheapest; tells the tapper to send `/plan`, which will refuse because the new round holds the week | |

**User's choice:** A distinct "replanned" alert.
**Notes:** Became D-09.

---

## Cancel & change

### Q1 — How does someone reach cancel and change?

| Option | Description | Selected |
|--------|-------------|----------|
| Commands | `/plan_cancel` and `/plan_change`; the only surface that stays reachable once a booked rehearsal's messages are buried | |
| Controls on the card and announcement | Nothing to remember; reverses D-16 and depends on a message that may be buried | |
| Both commands and controls | Buttons for immediacy, commands as the durable fallback; two authorization surfaces | ✓ |

**User's choice:** Both commands and controls.
**Notes:** Became D-10. Reopened D-16, resolved by the next question.

### Q2 — Which message carries the Cancel and Change buttons?

| Option | Description | Selected |
|--------|-------------|----------|
| The round's current control message | Announcement when one exists, card otherwise — the rule D-17 already set for Mark as booked; D-16 narrows rather than reverses | ✓ |
| The availability card, always | One message owns every button; contradicts D-16 for booked rounds | |
| Both messages carry them | Most forgiving; two keyboards to keep synchronized | |

**User's choice:** The round's current control message.
**Notes:** Became D-11.

### Q3 — What does a cancellation write?

| Option | Description | Selected |
|--------|-------------|----------|
| New CANCELLED status + detail columns | Appended last; absent from `WEEK_CLAIMING_STATUSES` and `RECOVERABLE_ROUND_STATUSES`; `cancelledAt`/`cancelledByUserId` on the D-15 precedent | ✓ |
| Reuse SUPERSEDED | No migration; collapses "replaced" and "called off" into one label | |
| CANCELLED status, no detail columns | One migration, no durable answer to "who called this off" | |

**User's choice:** New CANCELLED status + detail columns.
**Notes:** Became D-13. The append position is load-bearing for `hasExactValues` in `prisma/migrate-deploy.mjs`.

### Q4 — Does a cancellation break through to the group?

| Option | Description | Selected |
|--------|-------------|----------|
| New message only when it was booked | Booked → fresh message (the band arranged their week around it); still-collecting → edit in place | ✓ |
| Always a new message | One path to build and test; pings everyone for a mistaken `/plan` | |
| Never a new message | Quietest; a days-later cancellation edits a buried message nobody will see | |

**User's choice:** New message only when it was booked.
**Notes:** Became D-15. Eligibility (author or administrator) and the named confirmation step were taken as given from LIFE-03/LIFE-04 and Phase 3 D-14; recorded as D-14.

---

## Previous rehearsal

### Q1 — When does a rehearsal become "the previous rehearsal"?

| Option | Description | Selected |
|--------|-------------|----------|
| After its scheduled end | `endsAt < now`; LIFE-05's literal text; `endsAt` already written by the confirm transaction | ✓ |
| Keep the start boundary | Zero change; leaves code and requirement disagreeing in writing | |
| End boundary with a start fallback | Guards a state confirm makes impossible | |

**User's choice:** After its scheduled end.
**Notes:** Became D-16. Verified before asking that `endsAt` is written by `confirm()` as `startsAt + durationMinutes * 60_000`, so no null-fallback is needed.

### Q2 — Which rounds count as the previous rehearsal?

| Option | Description | Selected |
|--------|-------------|----------|
| Any week-claiming round | Keep reading `WEEK_CLAIMING_STATUSES`; `CANCELLED` excluded for free by D-13 | ✓ |
| Booked rounds only | LIFE-05 as written; regresses PLAN-05/PLAN-07 markers for chats that skip Mark as booked | |
| Prefer booked, fall back to confirmed | Two-tier definition; markers could jump between two past rehearsals | |

**User's choice:** Any week-claiming round.
**Notes:** Became D-17. Upholds the reasoning Phase 3 recorded when it broadened this function.

### Q3 — After a cancellation, which week does the next `/plan` target?

| Option | Description | Selected |
|--------|-------------|----------|
| The freed week only if a day is left | `targetWeekStart()` rolls past a week with no still-selectable day; makes LIFE-06's "when appropriate" a rule | ✓ |
| Always the freed week | No change to PLAN-03; a Sunday-night cancellation yields a card where all seven buttons refuse | |
| Always roll forward | Unambiguous; a Monday cancellation costs the band the whole week | |

**User's choice:** The freed week only if a day is left.
**Notes:** Became D-18. Must reuse the existing `isPastDay` chat-local rule rather than restate it.

### Q4 — Which rounds confer `PREVIOUS_PARTICIPANTS` standing?

| Option | Description | Selected |
|--------|-------------|----------|
| Any round you were snapshotted into | Decouples `wasPreviousParticipant()` from the week-claim set; removes a silent lockout class | ✓ |
| Keep week-claiming only | One constant serves both questions; cancelling the only rehearsal revokes everyone's access silently | |
| Week-claiming plus cancelled | Fixes the lockout; creates a third status set to keep in sync | |

**User's choice:** Any round you were snapshotted into.
**Notes:** Became D-19. Raised because D-13 would otherwise introduce an unannounced authorization regression.

---

## Claude's Discretion

- Command names, button labels, marker glyphs, confirmation copy, and all card and announcement text.
- The name and direction of the superseded → successor link, or whether it is derived rather than stored.
- **Whether `/plan_change` may move a rehearsal to a different target week** — explicitly not decided; research and planning must resolve and record it, keeping `@@unique([chatId, activeWeekStart])` honest.
- Callback action kinds, `planningTargetSchema` entries, and `PLANNING_ROUTES` ids, with `protectedWhen` declared deliberately.
- The migration shape for `CANCELLED` and the two detail columns.
- Retry, backoff, and error classification on the neuter-old-card and post-new-card paths.
- Whether the blocked and cancelled renders are separate functions or one parameterised render.

## Deferred Ideas

- Reminder suppression after replan, cancellation, or completion — Phase 5 (REM-05).
- Targeted follow-ups mentioning only outstanding participants — Phase 5 (REM-03/REM-04).
- Duplicate-update and restart idempotency as delivered capabilities — Phase 5 (RELI-02/RELI-03).
- Per-round participant adjustment — still deferred from Phase 2 D-09 (the removed PLAN-09).
- Promoting the one-live-`book-request`-row invariant to a partial unique index — recorded in `03-SECURITY.md`.
- Automatic studio booking — v2.

No scope creep was raised; no ideas outside the phase domain came up during discussion.
