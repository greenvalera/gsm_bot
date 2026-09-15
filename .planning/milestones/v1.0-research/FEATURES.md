# Feature Landscape

**Domain:** Private Telegram group rehearsal scheduling bot
**Researched:** 2026-08-19
**Confidence:** MEDIUM — the Telegram interaction constraints are verified against official documentation; the workflow recommendations are tailored to the explicit project scope and small-group scheduling practice.

## Product Model

This is a weekly, per-chat coordination workflow, not a general calendar product. A rehearsal must move through an explicit lifecycle: **not started → draft → collecting availability → ready to book → scheduled**, with **cancelled** and **superseded** as terminal historical outcomes. The current user-facing message must always make the target calendar week, proposed date/time, participant set, owner, and next action obvious.

All routine interaction should be command- and inline-button-driven. Telegram privacy-mode bots do not receive arbitrary group conversation, while inline buttons supply callback events and bot messages can be edited in place. The bot should therefore never rely on parsing casual messages such as “I can make Tuesday.” [Telegram Bot FAQ](https://core.telegram.org/bots/faq) (MEDIUM), [Telegram Bot API](https://core.telegram.org/bots/api) (MEDIUM).

## Table Stakes

Features users expect. Missing = the scheduling workflow is unreliable or requires the manual chasing it is meant to remove.

| Feature | Why Expected | Complexity | Notes | Confidence |
|---------|--------------|------------|-------|------------|
| Persistent, administrator-managed roster | A chat includes guests and non-playing members; the attendance population must be intentional. | Medium | Store Telegram user ID plus a display-name snapshot. Add/remove only by current chat administrators; retain historical snapshots for prior rounds. | MEDIUM |
| Per-chat planning policy and defaults | Bands must control who can initiate, rehearsal duration, day/time defaults, slot window, and reminder times. | Medium | Validate weekday, timezone, start/end boundaries, duration, and distinct reminder times. Settings changes affect future drafts, not an already-published round unless an authorized user deliberately replans. | MEDIUM |
| One authoritative weekly workflow | Users need one answer to “what is happening this week?” | High | Enforce one active planning process per chat and Monday–Sunday calendar week. Store the chat timezone and target week key; make start/retry operations idempotent. | MEDIUM |
| Monday planning nudges | A recurring rehearsal should not depend on someone remembering to start the conversation. | Medium | At 10:00 in the chat timezone, remind on Monday and daily until planning begins for the target week. Suppress reminders as soon as a draft or availability round exists. | MEDIUM |
| Permission-aware start and management | The group must be able to decide whether planning is admin-only, prior participants, or open to everyone. | Medium | Re-evaluate administrator status at each privileged action. Telegram provides administrator and member lookup/update mechanisms; `getChatMember` for other users is only guaranteed when the bot is a chat administrator. [Bot API](https://core.telegram.org/bots/api) (MEDIUM). | MEDIUM |
| Guided date selection within a complete calendar week | A planner needs to see the whole decision space without ambiguous phrases such as “next Tuesday.” | Medium | Show Monday through Sunday for the computed target week; label the date and weekday. Highlight configured default day and prior rehearsal day, collapsing them into one highlight when equal. | HIGH |
| Guided time-slot selection | The proposed time must be compatible with the configured rehearsal window and duration. | Medium | Generate one-hour slots only when the entire duration fits inside the configured boundary. Highlight default time and prior rehearsal time, collapsing equal values. | HIGH |
| Participant selection before publication | A given rehearsal may exclude a roster member, but the default should be familiar. | Medium | Start from the prior rehearsal’s participants, then let the planning author adjust the set from the roster. Require at least one participant before publishing. | HIGH |
| Custom availability card with individual state | Participants need an unambiguous one-tap way to respond and the group needs visible completion status. | High | Publish one bot message containing date, time, duration, target week, author, participant list, and `Can attend` / `Cannot attend`. Only the selected participants may change their own response. Use server-side round ID and response state; callback data is limited to 1–64 bytes. [Bot API](https://core.telegram.org/bots/api) (MEDIUM). | MEDIUM |
| Live completion and targeted follow-up | The bot’s primary value is removing manual chasing. | High | Edit the same availability card after each response to show `yes / no / pending` for every participant and a count. At configured daily times, remind only pending people in the group and list their names. If user-ID mentions are blocked by privacy settings, fall back to display-name text. [Bot API](https://core.telegram.org/bots/api) (MEDIUM). | MEDIUM |
| Immediate, explicit replanning after a “cannot attend” | An all-member rehearsal cannot silently proceed with a negative response. | High | Freeze and mark the current round superseded, disable or reject its buttons, notify the planning author, then return that author to date/time selection. A replacement round must have a new version and no copied availability answers. | HIGH |
| Clear ready-to-book outcome | The group must know that coordination is complete and what human action remains. | Medium | When every current participant is `Can attend`, stop follow-ups, mark the round ready, and announce the exact date/time and “ready to book.” Do not claim that a studio is booked. | HIGH |
| Authorized cancellation and change | Plans need a safe escape hatch after availability is complete. | High | An authorized user may cancel a scheduled rehearsal or change date/time. Cancellation produces a terminal record and stops reminders; changing date/time supersedes the old round and starts a fresh availability round. | HIGH |
| Recoverable status and history | People return to a busy chat and need context without re-running the flow. | Medium | A `/status` or equivalent entry point should show current state, proposal, pending members, owner, and whether action is required. Preserve prior scheduled/cancelled/superseded rounds as read-only audit context. | MEDIUM |

## Differentiators

Features that make this bot especially low-friction for a recurring band, rather than merely a generic yes/no poll.

| Feature | Value Proposition | Complexity | Notes | Confidence |
|---------|-------------------|------------|-------|------------|
| Previous-rehearsal-aware defaults | Planning becomes a quick confirmation of the normal routine while remaining adjustable. | Medium | Preselect prior participants and show the prior day/time alongside configured defaults. Never infer that a past preference is an availability answer. | HIGH |
| Response-aware reminders | The bot sends fewer noisy messages and makes accountability clear. | Medium | Mention only pending selected participants, show the count, and suppress all reminders once a round is complete, cancelled, or superseded. | HIGH |
| Visible planning ownership and handoff | A negative response does not leave the group wondering who must act next. | Medium | Display the planning author on the card and state that author has the next action after rejection. Permit an authorized recovery/transfer only if the author leaves or becomes ineligible. | MEDIUM |
| Stale-action protection with useful feedback | Repeated taps and out-of-date cards cannot corrupt a newer plan. | Medium | On every button press check chat, round version, participant membership, status, and user permission; answer the callback with a short explanation if it is stale or unauthorized. Telegram expects callback queries to be answered and supports editing inline-keyboard messages. [Bot API](https://core.telegram.org/bots/api) (MEDIUM). | MEDIUM |
| Week-aware continuity | The group does not accidentally plan two rehearsals for one week or skip into the wrong week. | High | Compute target week using “scheduled or occurred this week?” and make the target week explicit at every stage. A cancelled event must not be treated as scheduled when selecting the next target. | HIGH |

## Anti-Features

Features to explicitly NOT build in the first release.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automatic studio booking or website automation | It adds a vendor-specific browser-integration failure domain and conflates agreement with booking. It is explicitly deferred. | Announce `ready to book` with the final rehearsal details; capture booking as a later milestone after coordination is stable. |
| Native Telegram Polls | Polls do not enforce the selected roster, present a suitable named per-person status list, or model targeted pending reminders. | Use a custom bot message with inline buttons and server-side round state. |
| Multiple concurrent plans for one chat/week | Concurrent rounds create contradictory reminders and unclear authority. | Enforce a unique active `(chat, target-week)` workflow and expose its status/recovery path. |
| Free-text availability interpretation | Privacy mode can hide ordinary group messages; natural-language parsing introduces ambiguity and false positives. | Use `/` commands and inline choices for all state-changing actions. |
| External calendar sync, free/busy collection, or account linking | This increases privacy, consent, and support burden without serving the core private-group need. | Ask directly for a binary response for the selected proposal. |
| Automatic “best time” search across many candidates | It expands the product from a quick proposal-and-confirm flow into optimization/negotiation and prolongs each weekly decision. | Let the planning author select a replacement proposal immediately after a negative response. |
| Per-user direct-message reminders as a requirement | Users may not have started the bot or may block it; delivery cannot be assumed. | Send group-card follow-ups with pending names; DMs can be a later optional enhancement only. |

## Feature Dependencies

```text
Chat timezone + settings + roster
  → weekly target computation
  → start-authority evaluation
  → date selection (Monday–Sunday)
  → time-slot selection (within duration/window)
  → participant selection
  → versioned availability round / custom card
  → response validation + live status
  → reminders for pending participants
  → all yes → ready to book → scheduled record
  → any no → supersede round → author replans date/time

Scheduled record + cancellation/change authority
  → cancel terminal record OR supersede → fresh availability round

Administrator status + roster membership
  → roster management, settings, cancellation/change, and authorization checks
```

## Edge Cases That Must Become Requirements

| Area | Required behavior | Why it matters |
|------|-------------------|----------------|
| Timezone and daylight-saving changes | Store an IANA timezone per chat; evaluate Monday and reminder times in that timezone. Show the local time and date in every card. | A server-local clock will send/remind in the wrong week or hour. |
| Week boundary | Define week keys as local Monday 00:00 through next Monday 00:00. Re-evaluate target week when a draft is started, resumed, or published. | Sunday/Monday transitions otherwise create duplicate or misplaced plans. |
| Scheduled vs cancelled | Only a live scheduled/occurred rehearsal counts when choosing “current week” versus “next week.” A cancelled plan must not block current-week planning. | Prevents a cancellation from accidentally suppressing a replacement rehearsal. |
| Repeated callbacks and races | Make each response idempotent; serialize/transactionally update a round; reject any callback for a superseded or terminal round. | Double-taps and two simultaneous actions must not create conflicting outcomes. |
| Participant changes during a live round | Freeze the participant snapshot at publication. Changing participants requires a new round; do not silently add/remove people from an active request. | The completion denominator and consent scope remain trustworthy. |
| Member leaves / account no longer valid | Before reminder or privileged action, treat an absent roster member as an exception requiring admin resolution, not an automatic `Can attend`. | Avoids falsely declaring full availability. |
| Planning author unavailable | If the author leaves, loses authority, or is otherwise unable to replan after a negative answer, allow a defined authorized takeover. | The workflow must not become permanently stuck. |
| Message deletion or bot reinstallation | Keep workflow state independent of Telegram message existence; `/status` must recover the current card or clearly reveal the missing-message state. | Users can delete messages and Telegram message IDs are not the source of truth. |
| Invalid configuration | Reject windows with no full-duration hourly slot, default times outside the valid slots, duplicate/out-of-order reminders, and durations less than one slot. | Configuration must not yield a plan that cannot be published. |
| Reminder quietness | Do not send a reminder after a response, completion, cancellation, supersession, or a newer weekly workflow. Deduplicate job delivery. | Noise quickly makes a private-group bot unwelcome. |
| Audit language | Every state-changing announcement should say who changed what, for which target week, and why the prior round stopped. | The group needs enough traceability to resolve confusion without hidden admin logs. |

## MVP Recommendation

Prioritize:

1. Per-chat settings and roster, including chat timezone, start policy, valid time window/duration, defaults, and follow-up schedule.
2. A unique week-aware planning state machine with guided day/time/participant selection, followed by a secure custom availability card.
3. Live participant status, pending-only reminders, all-yes ready-to-book, and a robust negative-response replanning loop.
4. Authorized scheduled-rehearsal change/cancellation, status recovery, and terminal-history visibility.

Defer: calendar integrations, free/busy synchronization, DMs as a guaranteed reminder channel, native polls, multi-proposal optimization, and all studio-booking automation. They either violate the stated scope or weaken the deliberately simple, explicit weekly workflow.

## Sources

- [Telegram Bot API](https://core.telegram.org/bots/api) — inline keyboards, callbacks, message editing, poll constraints, administrator/member APIs, and chat-member updates (MEDIUM; official primary source, verified).
- [Telegram Bot FAQ](https://core.telegram.org/bots/faq) — privacy-mode message-delivery constraints and update-delivery behavior (MEDIUM; official primary source, verified).
- [SaaS Calendar & Scheduling UX: Examples & Patterns](https://www.saasui.design/blog/saas-calendar-scheduling-ux-patterns) — confirmation, rescheduling, reminders, and conflict-handling patterns (LOW; supplementary community source, used only as corroboration).

## Confidence Notes

| Area | Confidence | Basis |
|------|------------|-------|
| Telegram platform interaction constraints | MEDIUM | Current official Telegram documentation was inspected; the research seam classifies verified web findings as MEDIUM. |
| In-scope workflow and table stakes | HIGH | Directly grounded in the project’s active requirements and explicit decisions. |
| Differentiators and edge-case policy | MEDIUM | Strong product reasoning and common scheduling practice; final policy choices still need acceptance criteria during roadmap/phase planning. |
| Broader scheduling-UX corroboration | LOW | Only a limited supplementary web source was used; it is not presented as authoritative. |
