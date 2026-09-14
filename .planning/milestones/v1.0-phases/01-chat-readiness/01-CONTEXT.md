# Phase 1: Chat Readiness - Context

**Gathered:** 2026-08-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase prepares a Telegram group chat for rehearsal coordination. It delivers administrator-only initialization and configuration, a persistent administrator-managed band roster, a configurable policy for who may start planning, and current-permission checks for every protected action. Creating rehearsal proposals, collecting availability, lifecycle recovery, and reminder delivery belong to later phases.

</domain>

<decisions>
## Implementation Decisions

### Setup Conversation
- **D-01:** Initial chat configuration uses a guided `/setup` wizard.
- **D-02:** An incomplete setup remains resumable for 30 minutes of inactivity, after which its draft is discarded.
- **D-03:** Setup values do not become active incrementally. The bot presents a complete summary and saves the configuration atomically only after final confirmation.

### Roster Management
- **D-04:** An administrator adds a member by replying to that user's Telegram message with `/roster_add`; identity must be anchored to the replied-to Telegram user rather than a typed display name.
- **D-05:** `/roster` presents members alphabetically, showing the Telegram name and `@username` when available and a safe ID-based label when no readable identity is available.
- **D-06:** Each roster entry has an inline Remove action, and removal requires an explicit second confirmation showing the selected member.

### Settings Experience
- **D-07:** After setup, `/settings` shows the current configuration as a dashboard with a separate edit action for each value.
- **D-08:** Times are entered and displayed in 24-hour `HH:MM` format and interpreted in the chat's configured timezone.
- **D-09:** The administrator chooses the timezone by sharing a location. The bot infers an IANA timezone and requires explicit confirmation before saving it.
- **D-10:** Every individual settings change presents the old and new values and requires confirmation before it becomes active.

### Permission Behavior
- **D-11:** A newly initialized chat defaults to the administrators-only planning-start policy.
- **D-12:** Current Telegram chat administrators can always start planning. The previous-poll-participants and anyone-in-chat policies broaden access beyond administrators rather than replacing administrator access.
- **D-13:** Rejected button actions use a private callback alert where possible. Rejected commands receive a concise group reply that states the permission required.
- **D-14:** If an administrator loses current Telegram admin status during an unfinished setup or settings edit, that administrator's draft is discarded immediately.

### the agent's Discretion
- Exact button labels, message wording, and wizard step ordering, provided the decisions above remain intact.
- The implementation used to infer an IANA timezone from a shared location and the ambiguity fallback when a location maps to multiple plausible zones.
- Pagination or message-splitting behavior for long roster and settings views.
- The exact mechanism used to expire setup drafts after 30 minutes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Acceptance
- `.planning/ROADMAP.md` — Defines the Phase 1 boundary, goal, mapped requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — Defines CONF-01 through CONF-03, CONF-05, ROST-01 through ROST-03, and AUTH-01 through AUTH-02, plus milestone-wide exclusions.

### Product Constraints
- `.planning/PROJECT.md` — Defines Telegram-only interaction, persistent roster, per-chat settings, portability, and documentation-language constraints.

No external specifications or ADRs were referenced during the discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. The repository currently has no application source code or reusable components.

### Established Patterns
- No implementation conventions have emerged yet; this is the first product phase.
- Project-level stack guidance calls for TypeScript, grammY, PostgreSQL, Prisma, durable state, compact validated callback payloads, immediate callback acknowledgement, and current Telegram authorization checks.

### Integration Points
- This phase establishes the persistent chat settings, roster, and authorization services that the proposal, availability, lifecycle, and reminder phases will consume.
- Telegram commands, replies, location messages, and inline callbacks form the user-facing integration surface.

</code_context>

<specifics>
## Specific Ideas

- Setup should feel like a guided conversation rather than a collection of commands an administrator must discover.
- Member identity is derived from a replied-to Telegram message.
- Timezone selection should begin with a shared location while still storing a confirmed IANA timezone.
- Configuration changes should be reviewable before they affect active chat behavior.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Chat Readiness*
*Context gathered: 2026-08-19*
