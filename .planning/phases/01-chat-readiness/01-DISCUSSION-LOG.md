# Phase 1: Chat Readiness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-19
**Phase:** 1-Chat Readiness
**Areas discussed:** Setup conversation, Roster management, Settings experience, Permission behavior

---

## Setup Conversation

### Initial setup style

| Option | Description | Selected |
|--------|-------------|----------|
| Guided setup wizard | `/setup` walks through timezone, rehearsal defaults, time boundaries, reminders, and planning permissions. | ✓ |
| Independent commands | Each setting has its own command. | |
| Hybrid | Guided first-time setup plus individual commands for later edits. | |

### Interrupted setup

| Option | Description | Selected |
|--------|-------------|----------|
| Save progress and resume | Continue from the first unfinished step after an interruption. | |
| Restart from beginning | Re-enter all prior choices. | |
| Discard after timeout | Resume temporarily, then require a fresh setup. | ✓ |

### Draft timeout

| Option | Description | Selected |
|--------|-------------|----------|
| 15 minutes | Short-lived draft. | |
| 30 minutes | Moderate window for checking configuration details. | ✓ |
| 24 hours | Resume across several sessions. | |

### Activation point

| Option | Description | Selected |
|--------|-------------|----------|
| Final confirmation | Show a complete summary and save atomically. | ✓ |
| After every step | Each answer becomes active immediately. | |
| Defaults immediately | Initialize defaults first and apply overrides at completion. | |

**User's choices:** Guided wizard; discard after a 30-minute inactivity timeout; activate only after final confirmation.
**Notes:** The setup draft must not partially alter active chat configuration.

---

## Roster Management

### Adding a member

| Option | Description | Selected |
|--------|-------------|----------|
| Reply with `/roster_add` | Admin replies to the target user's message for an unambiguous Telegram identity. | ✓ |
| Member requests access | Member sends a request that an admin approves. | |
| Enter numeric ID | Admin types a Telegram user ID. | |

### Removing a member

| Option | Description | Selected |
|--------|-------------|----------|
| Roster Remove buttons | `/roster` supplies an inline removal action per member. | ✓ |
| Reply with `/roster_remove` | Admin finds and replies to the member's message. | |
| Typed command | Admin supplies a name or ID. | |

### Removal protection

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit confirmation | Show the member and require a second confirmation. | ✓ |
| Remove with Undo | Remove immediately but offer recovery. | |
| Remove immediately | One action permanently removes the member. | |

### Roster presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical detailed list | Show Telegram name and username when available, with an ID-based fallback. | ✓ |
| Date-added order | Oldest roster members first. | |
| Compact numbered list | Short output with less identity detail. | |

**User's choices:** Reply-based addition; inline removal with confirmation; alphabetical detailed roster.
**Notes:** No free-text member matching was selected.

---

## Settings Experience

### Editing after setup

| Option | Description | Selected |
|--------|-------------|----------|
| `/settings` dashboard | Display current values with an edit action for each. | ✓ |
| Repeat `/setup` | Rerun the full prefilled wizard. | |
| Separate commands | One command per setting. | |

### Time format

| Option | Description | Selected |
|--------|-------------|----------|
| 24-hour `HH:MM` | Interpret and display times in the configured timezone. | ✓ |
| 12-hour format | Use AM/PM. | |
| Accept both | Accept both inputs but normalize display. | |

### Timezone selection

| Option | Description | Selected |
|--------|-------------|----------|
| Type IANA timezone | Validate an identifier such as `Europe/Kyiv`. | |
| Choose from city list | Navigate region and city buttons. | |
| Send location | Infer an IANA timezone from a location and confirm it. | ✓ |

### Settings activation

| Option | Description | Selected |
|--------|-------------|----------|
| Preview and confirm | Show old and new values before saving. | ✓ |
| Save immediately | Apply as soon as validation passes. | |
| Stage multiple changes | Save a full batch after review. | |

**User's choices:** Settings dashboard; 24-hour times; location-derived timezone with confirmation; preview and confirm each change.
**Notes:** The persisted timezone must still be an IANA timezone despite the location-first input experience.

---

## Permission Behavior

### Default planning policy

| Option | Description | Selected |
|--------|-------------|----------|
| Administrators only | Safest initial policy. | ✓ |
| Previous-poll participants | Prior participants may initiate planning. | |
| Anyone in chat | Any current chat participant may initiate planning. | |

### Rejected-action feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Private where possible | Callback alert for buttons; concise group reply for commands. | ✓ |
| Always in group | Make every rejection public. | |
| Minimal denial | Do not identify the required permission. | |

### Lost admin status during a draft

| Option | Description | Selected |
|--------|-------------|----------|
| Retain until timeout | Block access but preserve the draft temporarily. | |
| Discard immediately | Cancel the draft when current permission is lost. | ✓ |
| Admin takeover | Allow a different current admin to continue it. | |

### Administrator access under broader policies

| Option | Description | Selected |
|--------|-------------|----------|
| Admins always allowed | Other policies broaden access beyond administrators. | ✓ |
| Apply policy literally | Admins must independently satisfy the selected policy. | |
| Initializing admin only | Only the first admin bypasses the policy. | |

**User's choices:** Administrators-only default; private denials where possible; immediate draft discard on lost admin status; administrators always retain planning access.
**Notes:** Current Telegram permission must be revalidated at each protected action boundary.

---

## the agent's Discretion

- Exact copy, button labels, wizard ordering, roster pagination, location-to-timezone inference mechanism, and draft-expiration implementation.

## Deferred Ideas

None.
