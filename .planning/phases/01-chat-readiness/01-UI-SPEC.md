---
phase: 1
slug: chat-readiness
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-19
reviewed_at: 2026-08-19T17:50:56+03:00
---

# Phase 1 — UI Design Contract

> Telegram-native visual and interaction contract for Chat Readiness. Telegram clients own rendering; this contract fixes message hierarchy, wording, button semantics, and state behavior.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — Telegram Bot API with grammY |
| Preset | not applicable |
| Component library | Telegram native messages, inline keyboards, command replies, and location attachments |
| Icon library | Unicode emoji only: `⚙️` settings, `👥` roster, `📍` location, `✅` confirmation, `⚠️` warning, `🗑️` destructive removal |
| Font | Telegram client system font; the bot must not attempt to control typeface, size, button colour, or client theme |

**Platform rule:** Do not create a web view, custom CSS surface, reply keyboard, or a private-chat location-request button. The complete experience stays in the group via bot messages, commands, ordinary location attachments, and inline keyboards.

**Message hierarchy rule:** Put the purpose in a bold first line, use short labelled lines for values, and use one blank line before actions. Use emoji only as a leading state cue; never as the only carrier of meaning.

**Principal readiness focal point:** The unconfigured readiness prompt anchors attention on the bold `Set up rehearsal planning` heading; its single `Start setup` CTA is the only advancing control and follows immediately after the explanatory body.

---

## Spacing Scale

Telegram controls physical layout, so these are logical content-rhythm tokens rather than CSS requirements. Never add repeated blank lines or use decorative ASCII dividers.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Nominal gap within a compact label/value concept; express with a colon and one space (`Time: 19:30`) |
| sm | 8px | Nominal gap between related inline-keyboard controls; use adjacent buttons in a row |
| md | 16px | One text line between prompt context and the requested action or input |
| lg | 24px | One blank line between message sections such as `Schedule` and `Reminders` |
| xl | 32px | Separate bot messages for a new wizard step rather than padding one message |
| 2xl | 48px | Not used in Telegram messages; reserve for a future non-Telegram surface |
| 3xl | 64px | Not used in Telegram messages; reserve for a future non-Telegram surface |

Exceptions: inline-keyboard buttons use Telegram's client-defined touch targets and spacing; do not emulate 44px targets with padding or filler text.

---

## Typography

Telegram controls actual type metrics. The sizes below are the logical hierarchy to preserve with Telegram Markdown: bold for the 600 roles and plain text for 400 roles. Do not introduce a third weight.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 14px | 600 | 1.5 |
| Heading | 20px | 600 | 1.2 |
| Display | 28px | 600 | 1.2 |

**Formatting rule:** Use at most one heading per bot message. Use code formatting only for literal commands, IANA zones, IDs, and `HH:MM` values; never use code formatting for prose or names.

---

## Color

Telegram client themes control the pixels. The following palette is a semantic reference for message structure and any future rendered surface; implementation must use text, emoji, and Telegram's native button treatment rather than attempting to force these colours.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#FFFFFF` / client chat surface | Ordinary bot messages, setup prompts, and summaries |
| Secondary (30%) | `#F1F1F1` / client message-card surface | Settings dashboard and roster projection grouping |
| Accent (10%) | `#2481CC` / Telegram primary-action treatment | `Start setup`, `Save configuration`, `Use <timezone>`, `Save change`, and the selected planning-access policy only |
| Destructive | `#E53935` / destructive-action semantics | Final `Remove member` confirmation only |

Accent reserved for: the advancing or saving action in a wizard step, each equivalent `Use <IANA zone>` choice on a timezone-candidate surface, the selected planning-start policy, and final non-destructive saves. `Send another location`, `Cancel`, `Back`, `Keep member`, and non-advancing alternatives remain neutral. Destructive emphasis is reserved for final roster removal; it must not share accent styling.

---

## Interaction Contract

### Surface inventory

| Surface | Trigger | Required layout and behavior |
|---------|---------|------------------------------|
| Unconfigured readiness prompt | `/setup` in a chat without active configuration | Bold `Set up rehearsal planning`; body: `This chat is not configured yet.`; one `Start setup` inline button. Current-admin authorization runs before creating or resuming the draft. |
| Resumable setup wizard | `Start setup` or `/setup` by the draft owner within 30 minutes | One prompt per step. Begin every resumed prompt with `Setup in progress` and show `Step X of 8`. State is actor-bound and durable; it is never inferred from chat text alone. |
| Timezone candidate selection | Administrator attaches a location message while the timezone step is active | Bold `Time zone found`. For one valid result show `Candidate: <IANA zone>` and one `Use <IANA zone>` button. For multiple valid results show `Candidates:` followed by every code-formatted IANA zone and one corresponding `Use <IANA zone>` button per zone. End with `Send another location`. Every action is opaque and actor/chat/draft-bound; never choose the first result automatically or offer manual typed-zone entry. |
| Schedule input prompts | Each setup value needing text input | Ask for a single value per message. Time prompts show `Send a time in 24-hour format, for example 19:30.` Weekday and policy use inline keyboard choices. |
| Setup review | All eight values are valid | Bold `Review configuration`; show labelled values for time zone, default day, default start, duration, daily start, daily end, reminder times, and planning access. Buttons: `Save configuration` then `Cancel setup`. Saving is the only action that promotes values to active configuration. |
| Settings dashboard | `/settings` after setup | Bold `Chat settings`; sections in this fixed order: `Schedule`, `Availability reminders`, `Planning access`. Show committed values only and place exactly one `Edit …` button for each editable value or value-pair. No draft value is shown as active. |
| Single-setting review | An edit has one valid replacement value | Bold `Review change`; show `Current: <old>` and `New: <new>`. Buttons: `Save change` and `Keep current value`. Invalid or conflicting values leave the current value unchanged. |
| Roster projection | `/roster` | Bold `Band roster`; members sorted alphabetically by display label. Each entry is `• <Telegram name> — @username` when both are readable, `• <Telegram name>` when no username exists, or `• Telegram user ••••<last 4 ID digits>` when neither is readable. Each entry gets one `Remove member` inline action. |
| Empty roster | `/roster` with no active members | Use the copywriting empty state below and no Remove controls. Show a final instruction line: `Reply to a member's message, then send /roster_add.` |
| Roster-add confirmation | Valid `/roster_add` reply | Confirm in a concise group message: `✅ Added <member> to the band roster.` If already active, use `✅ <member> is already in the band roster.` No extra confirmation click is required. |
| Roster removal confirmation | `Remove member` for an active roster member | Bold `Remove <member>?`; body: `They will no longer be selected for future rehearsals.` Buttons: `Remove member` and `Keep member`. The confirmation is bound to the initiating administrator, chat, target membership, and expiry. |
| Permission denial | Protected command or callback after current-role check fails | Callback: private alert only, `Only current chat administrators can do that.` Command: concise group reply, `Only current chat administrators can change chat setup, roster, or planning access.` Delete the actor's setup/settings draft before showing the denial. |

### Setup wizard sequence

Use this exact order to minimize invalid cross-field combinations and make the final review readable:

1. Timezone from attached group location; administrator explicitly confirms the single inferred IANA zone or chooses one from every inferred candidate shown.
2. Default rehearsal weekday; inline choices `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` in two rows (4 then 3).
3. Default rehearsal start time; text input in `HH:MM`.
4. Rehearsal duration; positive whole minutes, entered as text.
5. Daily start boundary; text input in `HH:MM`.
6. Daily end boundary; text input in `HH:MM`.
7. Availability reminders; show the default pair `10:00 and 16:00` and buttons `Use defaults` and `Edit times`. Editing collects the first then second `HH:MM` value.
8. Planning-start access; inline choices `Admins only`, `Previous participants`, and `Anyone in chat`. Default selection is `Admins only`.

At each complete schedule change and again before `Save configuration`, validate `daily start < daily end`, `default start >= daily start`, and `default start + duration <= daily end`. On failure, name the conflict and re-prompt only the field that needs a new value; do not discard otherwise-valid draft values.

### Callback and command behavior

- Acknowledge every callback immediately. During a successful mutation, replace or update the originating bot message with the authoritative resulting state; a duplicate tap receives the brief private alert `Already applied.`
- Callback data is a short opaque, versioned action token only. It must not expose names, permissions, schedule values, or authorization claims.
- Current administrator authorization is rechecked before every protected command, every wizard step, every settings save, policy edit, roster action, and removal confirmation.
- A draft expires after 30 minutes of inactivity. The next attempt shows the documented expiry copy and starts no mutation. An administrator who was demoted loses their active draft immediately.
- Inline buttons must have action-first labels no longer than 24 visible characters where possible. Every roster-removal button uses `Remove member`; retain the full member name in the adjacent roster entry and confirmation heading.
- For a roster longer than 20 entries, split it into deterministic alphabetical pages of 20. The footer reads `Showing <start>–<end> of <total>` and has neutral `Previous` / `Next` buttons. Each page preserves per-member `Remove member` actions.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | `Start setup` |
| Empty state heading | `No band members yet` |
| Empty state body | `Reply to a member's message, then send /roster_add to add them.` |
| Invalid time input | `Use 24-hour time in HH:MM format, for example 19:30.` |
| Location resolution failure | `I couldn't determine a time zone from that location. Send a more precise location or another location in this group.` |
| Invalid schedule combination | `That schedule does not fit inside the daily time boundaries. No changes were saved.` |
| Expired draft | `This setup expired after 30 minutes of inactivity. Send /setup to start again.` |
| Stale setup action | `This setup action is no longer available. Send /setup to start again.` |
| Stale settings or roster action | `This action is no longer available. Open /settings or /roster and try again.` |
| Generic save error | `I couldn't save that change. Please try again.` |
| Permission error (command) | `Only current chat administrators can change chat setup, roster, or planning access.` |
| Permission error (callback alert) | `Only current chat administrators can do that.` |
| Destructive confirmation | `Remove <member>? They will no longer be selected for future rehearsals.` Buttons: `Remove member` / `Keep member`. |

**Voice rule:** Use direct, calm sentences. State what happened, then the next safe action. Do not blame the user, reveal internal IDs, mention database state, or claim that a draft was saved before the final confirmation succeeds.

---

## UI Considerations

> Populated by the ui-phase UI-consideration probe after checker approval. Empty-state and error-state copy remains in the Copywriting Contract; this section references those rows and locks the state behavior that planning must preserve.

Applicable state considerations resolved: 41 covered, 11 backstop, 0 unresolved. Ten non-applicable checks were dismissed with explicit rendering-invariant reasons.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty, partial | Setup wizard and schedule-input forms | ✅ covered | An unfilled step always renders its current prompt and required input format; completed draft values remain actor-bound, `Step X of 8` identifies progress, and no partial draft is presented as active configuration. |
| loading | Readiness, setup, schedule, and removal controls | ✅ covered | Every callback is acknowledged immediately; successful mutations replace the originating message with authoritative state, and text-input prompts render synchronously without a separate loading surface. |
| error | Readiness, setup, timezone, schedule, review, settings edit, and removal controls | ✅ covered | Validation, location, permission, expiry, save, duplicate, and stale-action failures use the corresponding Copywriting Contract row and preserve the last authoritative state. |
| populated | Timezone candidate selection, settings dashboard, and roster projection | ✅ covered | The timezone surface shows one valid candidate or every valid ambiguous candidate with one bound action per zone and no automatic first-result choice; settings shows all committed values in fixed section order; roster shows sorted readable identities with one `Remove member` action each. |
| overflow | All message surfaces; roster navigation | ✅ covered | Telegram-native message text wraps; more than 20 roster members use deterministic alphabetical pages of 20 with a position footer and `Previous` / `Next` controls. |
| zero-one-many | Roster projection and empty-roster variant | ✅ covered | Zero members uses the documented empty state with no removal controls; one member renders one entry/action; many members follow sorting and pagination rules. |
| long-text | Prompts, summaries, confirmations, feedback, labels, and identifiers | ✅ covered | Message values wrap in the Telegram client; action labels stay bounded and opaque callback tokens contain no user-facing values. Full member identity remains in adjacent message text and the confirmation heading. |
| loading | Location-to-zone lookup | 🧪 backstop | `{ statement: "A location lookup renders an in-flight state and then atomically replaces it with either the candidate zone or the documented resolution failure.", verification: backstop }` |
| loading | Setup-review and single-setting saves | 🧪 backstop | `{ statement: "Durable save handlers acknowledge the action immediately, prevent a second mutation, and replace the review only after the transaction outcome is known.", verification: backstop }` |
| loading, error | Settings dashboard | 🧪 backstop | `{ statement: "Settings projection handlers have held-out rendering tests for delayed reads and read failures, never presenting partial database results as authoritative configuration.", verification: backstop }` |
| loading, error | Populated and empty roster projections | 🧪 backstop | `{ statement: "Roster retrieval delay, failure, and retry behavior is exercised for both populated and empty results without losing deterministic ordering, paging, or member-action identity.", verification: backstop }` |
| long-text | Roster projection and removal confirmation | 🧪 backstop | `{ statement: "A held-out Unicode case verifies long display names and usernames wrap safely in roster and removal-confirmation messages while callback routing retains the intended membership identity.", verification: backstop }` |

Dismissed checks are not lifted as implementation truths:

| Category | Element(s) | Dismissal reason |
|----------|------------|------------------|
| empty, partial | Timezone candidate selection | The candidate surface is created atomically only after one or more valid candidates exist; empty, invalid, or failed resolution renders the documented failure surface instead. |
| loading | Schedule text-input prompt | The prompt is a synchronous Telegram message awaiting user input; async mutation loading is covered by the callback/save contracts. |
| empty, partial, zero-one-many | Settings dashboard | `/settings` is available only for a complete active configuration and always renders the same three fixed sections; drafts never enter this surface. |
| empty, partial | Single-setting review | Review is created only after both current and valid replacement values exist; invalid input re-renders the input prompt instead. |
| populated, partial | Empty-roster variant | This variant is selected only at zero active members; populated and partial roster states render the roster-projection surface instead. |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| none | none | not applicable — Telegram-native phase; verified 2026-08-19 |

No shadcn installation, official shadcn blocks, or third-party registries are permitted in this phase. Registry vetting is therefore not applicable.

---

## Decision Sources

| Source | Contract decisions applied |
|--------|----------------------------|
| `01-CONTEXT.md` | Guided resumable setup; atomic review/save; reply-anchored roster; alphabetical identity projection; second removal confirmation; settings dashboard; 24-hour time; location-confirmed timezone; default policy; current-permission denial and draft deletion. |
| `01-RESEARCH.md` | Telegram-native interaction limits; immediate callback acknowledgement; opaque callback tokens; actor-bound persistent drafts; cross-field validation; group-location restriction; pagination default. |
| `REQUIREMENTS.md` / `ROADMAP.md` | Phase-1 scope, all configuration fields, roster actions, planning-start policy, and protected-action authorization. |
| Codebase scan | Greenfield repository: no source UI, components, styles, Tailwind, React, or `components.json` to preserve. |
| Agent discretion | Exact prompts, button labels, wizard order, 20-member roster pagination, semantic palette, and logical type/spacing scales. |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved on 2026-08-19 after one focused revision and full re-verification; no recommendations remain.
