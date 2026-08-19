---
phase: 1
slug: chat-readiness
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-19
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
| Destructive | `#E53935` / destructive-action semantics | Final `Remove <member>` confirmation only |

Accent reserved for: the single advancing or saving action in a wizard step, the accepted timezone candidate, the selected planning-start policy, and final non-destructive saves. `Cancel`, `Back`, `Keep member`, and alternative choices remain neutral. Destructive emphasis is reserved for final roster removal; it must not share accent styling.

---

## Interaction Contract

### Surface inventory

| Surface | Trigger | Required layout and behavior |
|---------|---------|------------------------------|
| Unconfigured readiness prompt | `/setup` in a chat without active configuration | Bold `Set up rehearsal planning`; body: `This chat is not configured yet.`; one `Start setup` inline button. Current-admin authorization runs before creating or resuming the draft. |
| Resumable setup wizard | `Start setup` or `/setup` by the draft owner within 30 minutes | One prompt per step. Begin every resumed prompt with `Setup in progress` and show `Step X of 8`. State is actor-bound and durable; it is never inferred from chat text alone. |
| Timezone candidate | Administrator attaches a location message while the timezone step is active | Bold `Time zone found`; show `Candidate: <IANA zone>`; buttons: `Use <IANA zone>` and `Send another location`. Never offer manual typed-zone entry. |
| Schedule input prompts | Each setup value needing text input | Ask for a single value per message. Time prompts show `Send a time in 24-hour format, for example 19:30.` Weekday and policy use inline keyboard choices. |
| Setup review | All eight values are valid | Bold `Review configuration`; show labelled values for time zone, default day, default start, duration, daily start, daily end, reminder times, and planning access. Buttons: `Save configuration` then `Cancel setup`. Saving is the only action that promotes values to active configuration. |
| Settings dashboard | `/settings` after setup | Bold `Chat settings`; sections in this fixed order: `Schedule`, `Availability reminders`, `Planning access`. Show committed values only and place exactly one `Edit …` button for each editable value or value-pair. No draft value is shown as active. |
| Single-setting review | An edit has one valid replacement value | Bold `Review change`; show `Current: <old>` and `New: <new>`. Buttons: `Save change` and `Keep current value`. Invalid or conflicting values leave the current value unchanged. |
| Roster projection | `/roster` | Bold `Band roster`; members sorted alphabetically by display label. Each entry is `• <Telegram name> — @username` when both are readable, `• <Telegram name>` when no username exists, or `• Telegram user ••••<last 4 ID digits>` when neither is readable. Each entry gets one `Remove` inline action. |
| Empty roster | `/roster` with no active members | Use the copywriting empty state below and no Remove controls. Show a final instruction line: `Reply to a member's message, then send /roster_add.` |
| Roster-add confirmation | Valid `/roster_add` reply | Confirm in a concise group message: `✅ Added <member> to the band roster.` If already active, use `✅ <member> is already in the band roster.` No extra confirmation click is required. |
| Roster removal confirmation | `Remove` for an active roster member | Bold `Remove <member>?`; body: `They will no longer be selected for future rehearsals.` Buttons: `Remove <member>` and `Keep member`. The confirmation is bound to the initiating administrator, chat, target membership, and expiry. |
| Permission denial | Protected command or callback after current-role check fails | Callback: private alert only, `Only current chat administrators can do that.` Command: concise group reply, `Only current chat administrators can change chat setup, roster, or planning access.` Delete the actor's setup/settings draft before showing the denial. |

### Setup wizard sequence

Use this exact order to minimize invalid cross-field combinations and make the final review readable:

1. Timezone from attached group location; administrator confirms the inferred IANA zone.
2. Default rehearsal weekday; inline choices `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` in two rows (4 then 3).
3. Default rehearsal start time; text input in `HH:MM`.
4. Rehearsal duration; positive whole minutes, entered as text.
5. Daily start boundary; text input in `HH:MM`.
6. Daily end boundary; text input in `HH:MM`.
7. Availability reminders; show the default pair `10:00 and 16:00` and buttons `Use defaults` and `Edit times`. Editing collects the first then second `HH:MM` value.
8. Planning-start access; inline choices `Admins only`, `Previous participants`, and `Anyone in chat`. Default selection is `Admins only`.

At each complete schedule change and again before `Save configuration`, validate `daily start < daily end` and `default start + duration <= daily end`. On failure, name the conflict and re-prompt only the field that needs a new value; do not discard otherwise-valid draft values.

### Callback and command behavior

- Acknowledge every callback immediately. During a successful mutation, replace or update the originating bot message with the authoritative resulting state; a duplicate tap receives the brief private alert `Already applied.`
- Callback data is a short opaque, versioned action token only. It must not expose names, permissions, schedule values, or authorization claims.
- Current administrator authorization is rechecked before every protected command, every wizard step, every settings save, policy edit, roster action, and removal confirmation.
- A draft expires after 30 minutes of inactivity. The next attempt shows the documented expiry copy and starts no mutation. An administrator who was demoted loses their active draft immediately.
- Inline buttons must have action-first labels no longer than 24 visible characters where possible. If a member name makes `Remove <member>` longer, use `Remove member` and retain the full name in the confirmation heading.
- For a roster longer than 20 entries, split it into deterministic alphabetical pages of 20. The footer reads `Showing <start>–<end> of <total>` and has neutral `Previous` / `Next` buttons. Each page preserves per-member Remove actions.

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
| Stale or already-completed action | `This action is no longer available.` |
| Generic save error | `I couldn't save that change. Please try again.` |
| Permission error (command) | `Only current chat administrators can change chat setup, roster, or planning access.` |
| Permission error (callback alert) | `Only current chat administrators can do that.` |
| Destructive confirmation | `Remove <member>? They will no longer be selected for future rehearsals.` Buttons: `Remove <member>` / `Keep member`. |

**Voice rule:** Use direct, calm sentences. State what happened, then the next safe action. Do not blame the user, reveal internal IDs, mention database state, or claim that a draft was saved before the final confirmation succeeds.

---

## UI Considerations

Applicable state considerations resolved: 16 covered, 3 backstop, 0 unresolved.

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Roster list | ✅ covered | Empty roster renders the documented heading and add-by-reply instruction; it has no Remove controls. |
| loading | Inline callbacks and save actions | ✅ covered | Every callback is acknowledged immediately; the originating message is replaced with the authoritative outcome after the durable operation completes. |
| error | Setup wizard, settings edit, roster commands, callbacks | ✅ covered | Validation, location, permission, expiry, stale-action, and generic-save copy is defined above; each message gives a safe retry path. |
| populated | Settings dashboard and roster list | ✅ covered | Dashboard renders committed values in fixed section order; roster renders alphabetical labelled entries with a Remove action for every active member. |
| partial | Setup and individual-setting drafts | ✅ covered | Draft values remain private to their actor and show `Step X of 8`; only completed active configuration appears in `/settings`. |
| overflow | Roster list | ✅ covered | More than 20 members uses deterministic alphabetical pages of 20 with position copy and Previous/Next controls. |
| zero-one-many | Roster list | ✅ covered | Zero uses the empty state; one renders one bullet and one Remove action; many follows the sorted list/paging rule. |
| long-text | Member names, usernames, IANA zones, labels, button text | ✅ covered | Message values may wrap; callback tokens never contain labels; buttons switch to `Remove member` when a full-name action would exceed 24 visible characters. |
| loading | Location-to-zone lookup | 🧪 backstop | Render `Finding time zone…` while resolving a location, then replace it with the candidate or documented resolution error; cover this state with a handler-rendering test. |
| error | Cross-field schedule validation | 🧪 backstop | A failing final validation leaves active settings untouched and re-prompts the offending field; verify with a unit test and transaction-level integration test. |
| long-text | Roster and settings messages | 🧪 backstop | Verify a long Unicode display name, username, and IANA zone render safely without breaking callback routing or losing the member identity. |

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

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
