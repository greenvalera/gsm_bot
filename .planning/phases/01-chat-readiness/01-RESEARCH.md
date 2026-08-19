# Phase 1: Chat Readiness - Research

**Researched:** 2026-08-19
**Domain:** Durable Telegram group-chat configuration, roster management, and authorization
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from AGENTS.md)

- Keep all primary interactions inside the Telegram group chat; do not introduce a separate client application. [VERIFIED: AGENTS.md]
- Preserve per-chat settings and an administrator-managed persistent roster. [VERIFIED: AGENTS.md]
- Keep planning documentation in English and scripts/instructions portable between Codex and Claude Code. [VERIFIED: AGENTS.md]
- Phase work must proceed through the GSD workflow; no project skills or implementation conventions currently exist. [VERIFIED: AGENTS.md]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONF-01 | A chat administrator can initialize the bot with an IANA time zone. | Location-to-zone adapter, confirmation gate, transactional setup draft. |
| CONF-02 | A chat administrator can configure the default rehearsal weekday and start time. | Typed settings model, strict `HH:MM` parsing, atomic setup/settings writes. |
| CONF-03 | A chat administrator can configure rehearsal duration and daily time boundaries. | Cross-field validation preserves valid future slot generation. |
| CONF-05 | A chat administrator can configure availability-reminder times, defaulting to 10:00 and 16:00. | Persist local times in the chat zone and validate each edit before confirmation. |
| ROST-01 | A chat administrator can add identifiable Telegram users to the persistent band roster. | Reply-anchored user identity, upserted user record, unique active membership. |
| ROST-02 | A chat administrator can remove users from the band roster. | Two-step, actor-bound removal confirmation and idempotent deactivation. |
| ROST-03 | A chat administrator can view the current band roster. | Safe identity projection and deterministic alphabetical ordering. |
| AUTH-01 | A chat administrator can choose who may start planning. | Persisted planning-start policy and future-facing `canStartPlanning` seam. |
| AUTH-02 | The bot revalidates the user's current permission before every protected action. | Telegram `getChatMember` authorization middleware/service at every command and callback boundary. |
</phase_requirements>

## Summary

Build Phase 1 as the durable foundation of the bot: a TypeScript/grammY command adapter over PostgreSQL/Prisma repositories. Persist active configuration, roster membership, and short-lived setup/settings drafts in PostgreSQL; Telegram messages and inline keyboards are only interaction projections. This directly supports the locked requirement that configuration does not take effect until the final confirmation and that an interrupted draft can resume for 30 minutes. [CITED: https://grammy.dev/plugins/session.html] [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

Every protected command and callback must call a single authorization service that queries the actor's *current* membership with Telegram before mutating data. Telegram documents that `getChatMember` returns member information and is guaranteed for other users only when the bot itself is an administrator, so the setup/help flow must state that the bot needs administrator status in a supported group. [CITED: https://core.telegram.org/bots/api]

Use an explicit, database-stored draft state machine for setup and settings edits instead of treating grammY sessions as the source of truth. grammY's default session storage is RAM and is lost on restart; it supports external persistence, but a first-class draft table lets authorization, expiry, atomic confirmation, and later audit behavior live in the same transaction as settings. [CITED: https://grammy.dev/plugins/session.html]

**Primary recommendation:** Establish the database schema, authorization seam, and test harness first; then implement the guided setup, settings dashboard, and roster commands on top of those durable services. [VERIFIED: .planning/ROADMAP.md]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Telegram commands, replies, locations, and callbacks | Browser / Client | API / Backend | Telegram clients originate updates; the bot adapter interprets only allowed update shapes. [CITED: https://core.telegram.org/bots/api] |
| Current administrator authorization | API / Backend | Telegram API | Authorization must be checked at the mutation boundary against current Telegram member state. [CITED: https://core.telegram.org/bots/api] |
| Setup/settings workflow and validation | API / Backend | Database / Storage | The backend owns step progression, validation, expiry, and confirmation semantics. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |
| Chat defaults, policy, roster, and drafts | Database / Storage | API / Backend | They must survive restarts and support transactional updates. [CITED: https://grammy.dev/plugins/session.html] |
| IANA-zone inference from shared coordinates | API / Backend | Database / Storage | An adapter resolves coordinates; the confirmed IANA zone is the durable value. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |
| Dashboard/roster rendering | API / Backend | Browser / Client | The bot renders committed state; Telegram displays it. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `grammy` | `1.45.1` [ASSUMED] | Telegram command, update, and keyboard adapter | Its documented `bot.command()` handler model fits `/setup`, `/settings`, and roster commands. [CITED: https://grammy.dev/guide/commands.html] |
| `@grammyjs/runner` | `2.0.3` [ASSUMED] | Bounded long-poll update runner | Configure chat-key sequentialization for a smooth wizard, while retaining database constraints as the correctness boundary. [CITED: https://grammy.dev/plugins/runner] |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg`, `pg` | `7.9.1`, `7.9.1`, `7.9.1`, `8.23.0` [ASSUMED] | PostgreSQL schema, migrations, and typed repositories | The project-selected persistent relational stack supports atomic configuration and uniqueness. [VERIFIED: .planning/research/STACK.md] |
| `zod` | `4.4.3` [ASSUMED] | Parse environment variables, callbacks, command values, and draft payloads | Enforce an untrusted-input boundary before domain actions. [VERIFIED: .planning/research/STACK.md] |
| `pino` | `10.3.1` [ASSUMED] | Structured, redacted logs | Make authorization failures, draft expiry, and Telegram update errors observable without logging secrets. [VERIFIED: .planning/research/STACK.md] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tz-lookup` | `6.1.25` [ASSUMED] | Candidate coordinate-to-IANA-zone adapter behind `TimezoneResolver` | Use only after the mandatory human package-verification checkpoint; require the administrator to confirm the result. |
| `vitest` | `4.1.11` [ASSUMED] | Fast unit and handler tests | Use for domain validation, authorization, draft expiry, and rendering tests. [VERIFIED: .planning/research/STACK.md] |
| `testcontainers` | `12.1.0` [ASSUMED] | Disposable PostgreSQL integration database | Use for migrations and transactional-repository integration tests. [VERIFIED: .planning/research/STACK.md] |
| `prettier` | `3.9.6` [ASSUMED] | Deterministic source/configuration formatting check | Pin as a development dependency and expose `format` plus `format:check`; install only after the same package-legitimacy checkpoint as every other direct package. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL draft records | grammY session as the source of truth | grammY can persist sessions, but draft records need authorization revocation, expiry, and atomic settings promotion in the same data model. [CITED: https://grammy.dev/plugins/session.html] |
| Offline timezone resolver adapter | Remote geocoding/timezone API | A remote service adds credential, availability, privacy, and retry dependencies for a small coordinate lookup. [ASSUMED] |
| Reply-anchored roster addition | Typed display name or `@username` | Typed labels are ambiguous and usernames may be absent or change; the replied message exposes the specific Telegram user identity. [CITED: https://core.telegram.org/bots/api] |

**Installation:**

```bash
npm install grammy @grammyjs/runner zod pino prisma @prisma/client @prisma/adapter-pg pg tz-lookup
npm install --save-dev typescript vitest testcontainers prettier @types/node
```

All packages above are constrained by the Package Legitimacy Audit's required human checkpoint; do not install them before that checkpoint is accepted. [VERIFIED: package-legitimacy seam]

## Package Legitimacy Audit

The package-legitimacy seam returned `SUS` with unknown registry metadata for every queried package in this environment. Direct `npm view` returned the listed versions and repository URLs and no `postinstall` field, but registry existence is not enough to establish package legitimacy. Per the package legitimacy protocol, each package remains flagged and the planner must insert a `checkpoint:human-verify` before the install task. [VERIFIED: package-legitimacy seam] [ASSUMED]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `grammy` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/grammyjs/grammY` | SUS | Flagged — human checkpoint |
| `@grammyjs/runner` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/grammyjs/runner` | SUS | Flagged — human checkpoint |
| `zod` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/colinhacks/zod` | SUS | Flagged — human checkpoint |
| `pino` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/pinojs/pino` | SUS | Flagged — human checkpoint |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/prisma/prisma` | SUS | Flagged — human checkpoint |
| `pg` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/brianc/node-postgres` | SUS | Flagged — human checkpoint |
| `tz-lookup` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/darkskyapp/tz-lookup` | SUS | Flagged — human checkpoint |
| `vitest` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/vitest-dev/vitest` | SUS | Flagged — human checkpoint |
| `testcontainers` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/testcontainers/testcontainers-node` | SUS | Flagged — human checkpoint |
| `prettier` [ASSUMED] | npm | metadata unavailable | metadata unavailable | `github.com/prettier/prettier` | SUS | Flagged — human checkpoint |

**Packages removed due to [SLOP] verdict:** none. [VERIFIED: package-legitimacy seam]

**Packages flagged as suspicious [SUS]:** all packages in the table; the planner inserts `checkpoint:human-verify` before installation. [VERIFIED: package-legitimacy seam]

## Architecture Patterns

### System Architecture Diagram

```text
Telegram group update
  ├─ /setup, /settings, /roster_add (reply), /roster
  ├─ attached location message
  └─ inline callback
          |
          v
grammY adapter ──> validate update shape / callback token
          |
          +──> answer callback immediately (private alert on rejection)
          |
          v
AuthorizationService ──> Telegram getChatMember(actor, chat)
          |                         |
          | denied                  | current admin
          v                         v
concise group reply          Draft / Settings / Roster application service
                                      |
                         short PostgreSQL transaction
                           ├─ active chat configuration + revision
                           ├─ roster membership + known Telegram identity
                           └─ actor-bound expiring draft / confirmation action
                                      |
                                      v
                             Telegram dashboard, prompt, or roster projection
```

The handler must re-check authorization immediately before every protected mutation and callback confirmation. Telegram clients keep a callback progress indicator until `answerCallbackQuery`; its optional `show_alert` supports the locked private denial behavior. [CITED: https://core.telegram.org/bots/api]

### Recommended Project Structure

```text
src/
├── app/                 # command/callback dispatch and composition root
├── telegram/            # grammY context helpers, commands, keyboards, rendering
├── domain/chat/         # settings, policy, setup-draft state machine and validation
├── domain/roster/       # user identity and membership services
├── domain/auth/         # current-role checks and future planning-access seam
├── infrastructure/db/   # Prisma client, repositories, migrations
├── infrastructure/time/ # timezone-resolver adapter and clock
└── shared/              # Zod schemas, errors, result types, logging
tests/
├── unit/                # domain validation and rendering
└── integration/         # Prisma/PostgreSQL repositories and migrations
```

This is a prescriptive greenfield structure, not a discovery of existing files. [ASSUMED]

### Pattern 1: Separate active settings from actor-bound drafts

**What:** Store a completed `ChatConfiguration` record separately from `SetupDraft` and `SettingsEditDraft` records. A draft contains its actor, chat, current step, validated partial payload, expiry time, and the configuration revision it started from. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**When to use:** For `/setup` and every dashboard edit, including timezone selection. A draft may be resumed only by its original actor before expiry; a failed current-admin check deletes it immediately. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Example:**

```typescript
// Source: phase decision D-02/D-03; implementation skeleton [ASSUMED]
await db.$transaction(async (tx) => {
  await requireCurrentChatAdministrator(tx, chatId, actorId);
  const draft = await setupDraftRepository.requireActive(tx, chatId, actorId, now);
  await chatConfigurationRepository.createFromConfirmedDraft(tx, draft);
  await setupDraftRepository.delete(tx, draft.id);
});
```

The transaction has exactly two outcomes: existing active configuration remains unchanged, or the complete confirmed configuration becomes active and the draft disappears. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

### Pattern 2: Authorization at every action boundary

**What:** Place `requireCurrentChatAdministrator(chatId, actorId)` before every protected command and every protected callback, not only at wizard entry. Implement `canStartPlanning` as a separate policy service for Phase 2 to consume. [VERIFIED: .planning/REQUIREMENTS.md]

**When to use:** `/setup`, `/settings`, each settings edit confirmation, `/roster_add`, `/roster`, removal request/confirmation, and planning-policy edits. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Example:**

```typescript
// Source: Telegram getChatMember API; status mapping intentionally hidden in the gateway.
const authorization = await telegramMembershipGateway.getCurrentRole(chatId, actorId);
if (!authorization.isAdministrator) {
  await draftRepository.deleteForActor(chatId, actorId);
  throw new PermissionDeniedError("Current chat administrator permission is required.");
}
```

Telegram's `getChatMember` call provides the current role and is the right boundary for this check; do not treat a prior successful setup action or stored `isAdmin` flag as proof. [CITED: https://core.telegram.org/bots/api]

### Pattern 3: Reply-anchored roster identity and soft removal

**What:** `/roster_add` must require `ctx.msg.reply_to_message?.from`; persist that user ID plus last-known display name and optional username, then create or reactivate the membership in the current chat. Remove membership with a two-step, initiating-admin-bound confirmation; retain the identity record and mark the membership inactive. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**When to use:** Any roster change. Reject a command without a replied-to readable user, a bot account, or an anonymous/channel-originated message. A reply has the original message in `reply_to_message`, but the nested message may not contain another nested reply, which is sufficient for this single-level identity anchor. [CITED: https://core.telegram.org/bots/api]

### Pattern 4: Location-to-zone is a fallible adapter, confirmation is authoritative

**What:** Parse an attached group `location` update, call `TimezoneResolver.resolve(latitude, longitude)`, display the candidate IANA identifier, and store it only after the administrator confirms it. Keep the resolver's package and polygon/source data behind one interface. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**When to use:** Initial setup and later timezone edits. Do not use `KeyboardButton.request_location` in this group workflow: Telegram documents that it is available only in private chats. Ask the administrator to attach a location message in the group instead. [CITED: https://core.telegram.org/bots/api]

### Anti-Patterns to Avoid

- **Incremental live setup writes:** Do not persist one active value per wizard step; the locked decision requires an all-or-nothing confirmation. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]
- **Memory-only wizard state:** It breaks resumability after process restart and cannot reliably enforce expiry/revocation. [CITED: https://grammy.dev/plugins/session.html]
- **Cached administrator status:** It violates the required current-permission check and leaves stale drafts usable after demotion. [VERIFIED: .planning/REQUIREMENTS.md]
- **Typed names as roster keys:** They can collide, change, or be absent; use the replied Telegram user ID. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]
- **Long or descriptive callback data:** Telegram caps `callback_data` at 1–64 bytes; use short versioned action tokens and reload authoritative data. [CITED: https://core.telegram.org/bots/api]
- **Using a location-request keyboard in a group:** Telegram limits that button type to private chats. [CITED: https://core.telegram.org/bots/api]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram update parsing and command routing | Custom Bot API HTTP client | grammY command/update adapter | grammY documents `bot.command()` and Telegram-specific context handling. [CITED: https://grammy.dev/guide/commands.html] |
| Persistent relational schema and migrations | SQL strings scattered through handlers | Prisma migrations and repositories | Typed schema changes and transactions isolate Telegram adapters from data operations. [VERIFIED: .planning/research/STACK.md] |
| Untrusted callback/configuration parsing | Ad-hoc casts and string splits | Zod schemas | Typed parse failures make invalid input non-mutating. [VERIFIED: .planning/research/STACK.md] |
| Coordinate-to-timezone geometry | Custom country/longitude rules | A vetted offline timezone resolver behind `TimezoneResolver` | Political boundaries, enclaves, and daylight-zone borders make bespoke rules unsafe. [ASSUMED] |
| Current Telegram member role | Local role cache | `getChatMember` via a narrow gateway | Permission changes must take effect at the next protected action. [CITED: https://core.telegram.org/bots/api] |

**Key insight:** the phase's complexity is not the wizard UI; it is making Telegram interactions an authenticated projection of durable, transactionally updated state. [VERIFIED: .planning/ROADMAP.md]

## Common Pitfalls

### Pitfall 1: An administrator is demoted mid-draft

**What goes wrong:** A stored draft remains available and a former administrator finalizes it. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Why it happens:** Authorization was checked only when `/setup` or `/settings` began. [VERIFIED: .planning/REQUIREMENTS.md]

**How to avoid:** Revalidate the current Telegram role before every step that reads or mutates a protected draft, immediately delete that actor's draft on denial, and make the final confirmation transaction perform its own authorization check. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Warning signs:** A database query can find a still-active draft for an actor whose role lookup is no longer administrative. [ASSUMED]

### Pitfall 2: Group location UX follows private-chat documentation

**What goes wrong:** The bot offers a location-request button that clients cannot use in the group. [CITED: https://core.telegram.org/bots/api]

**Why it happens:** `KeyboardButton.request_location` is documented as private-chat-only. [CITED: https://core.telegram.org/bots/api]

**How to avoid:** Prompt the administrator to attach/share a location message in the group, correlate it to the active actor-bound draft, and confirm the inferred IANA zone. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Warning signs:** A setup prompt relies on a reply keyboard with `request_location` rather than a standard location attachment instruction. [ASSUMED]

### Pitfall 3: Time defaults are individually valid but mutually invalid

**What goes wrong:** A default start time plus duration extends past the configured daily end boundary, making Phase 2 unable to highlight a usable default. [VERIFIED: .planning/ROADMAP.md]

**Why it happens:** Validators check the strings independently rather than validating the complete schedule configuration. [ASSUMED]

**How to avoid:** On final setup and every individual edit confirmation, validate strict `HH:MM`, positive duration, start boundary before end boundary, and `default start + duration <= daily end`; reject the proposal before updating active settings. [ASSUMED]

**Warning signs:** A settings edit succeeds but a deterministic future slot generator would have no valid slot at the displayed default. [ASSUMED]

### Pitfall 4: Inline removal callback authorizes the wrong user or member

**What goes wrong:** A stale, forwarded, or differently clicked confirmation removes an unintended current roster member. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]

**Why it happens:** Callback data is treated as an authority rather than a pointer to server-side state. [CITED: https://core.telegram.org/bots/api]

**How to avoid:** Keep callback data short, look up a server-side confirmation action, bind it to chat, initiating actor, target membership, and expiry, then recheck admin permission and target membership in the removal transaction. [CITED: https://core.telegram.org/bots/api]

**Warning signs:** Handler code deletes by an ID parsed from callback text without loading and authorizing the corresponding record. [ASSUMED]

## Code Examples

Verified patterns from official sources:

### Command and reply-anchored roster addition

```typescript
// Source: https://grammy.dev/guide/commands.html
bot.command("roster_add", async (ctx) => {
  const repliedUser = ctx.msg.reply_to_message?.from;
  if (!repliedUser || repliedUser.is_bot) {
    await ctx.reply("Reply to a band member's message, then use /roster_add.");
    return;
  }
  await rosterService.addFromRepliedUser(ctx.chat.id, ctx.from.id, repliedUser);
});
```

The handler pattern uses grammY command matching; Telegram supplies the original message in `reply_to_message`. [CITED: https://grammy.dev/guide/commands.html] [CITED: https://core.telegram.org/bots/api]

### Immediate callback acknowledgement and private rejection

```typescript
// Source: https://core.telegram.org/bots/api
await ctx.answerCallbackQuery({
  text: "Current chat administrator permission is required.",
  show_alert: true,
});
```

Telegram documents both the need to acknowledge callbacks and the alert option used by the locked denial behavior. [CITED: https://core.telegram.org/bots/api]

### Chat-key sequentialization

```typescript
// Source: https://grammy.dev/plugins/runner
bot.use(sequentialize((ctx) => {
  const chatKey = ctx.chat?.id.toString();
  return chatKey === undefined ? [] : [chatKey];
}));
```

Sequentialization improves in-process wizard ordering for one chat; each service operation must still use database transactions and constraints for correctness across restarts and replicas. [CITED: https://grammy.dev/plugins/runner] [ASSUMED]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory conversational bot state | PostgreSQL-backed domain and draft state | Project stack decision | Survives restarts and supports atomic configuration promotion. [VERIFIED: .planning/research/STACK.md] |
| One-time role check | Current role check at every protected Telegram action | Phase requirement AUTH-02 | Prevents demoted users from continuing setup/settings changes. [VERIFIED: .planning/REQUIREMENTS.md] |
| Text/name roster entry | Reply-anchored Telegram identity | Phase decision D-04 | Prevents ambiguity and supports persistent identity even when `@username` is absent. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |

**Deprecated/outdated:** Using grammY's default in-memory session as production workflow storage is unsuitable here because it is lost when the bot stops. [CITED: https://grammy.dev/plugins/session.html]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tz-lookup` is the suitable maintained offline coordinate-to-IANA-zone package for this bot. | Standard Stack | Wrong resolver or boundary data would infer a wrong zone; human verification is mandatory before install. |
| A2 | All initial npm packages are safe to install once the human checkpoint accepts them. | Package Legitimacy Audit | Dependency supply-chain risk remains until metadata/maintainer review succeeds. |
| A3 | Cross-field settings validation should require default start plus duration to fit inside the daily boundary. | Common Pitfalls | A different product interpretation could allow a default that Phase 2 cannot schedule. |
| A4 | Bind roster-removal confirmation to the initiating administrator. | Common Pitfalls | Product may instead want any current admin to confirm; this is a small UX policy decision. |
| A5 | A new greenfield structure and `npm run` validation scripts will be introduced as documented. | Architecture Patterns / Validation | The final project tooling layout may differ once implementation starts. |

## Resolved Questions

1. **RESOLVED — Timezone-boundary package acceptance**
   - What we know: Telegram provides shared location coordinates, not an IANA zone, and group location-request buttons are private-chat-only. [CITED: https://core.telegram.org/bots/api]
   - Conditional resolution path: Plan 01-01 contains a blocking human package-legitimacy checkpoint that independently reviews `tz-lookup` maintainer/repository identity, release and boundary-data freshness, license, install scripts, and dependency tree. Approval permits the pinned adapter to enter the lockfile; rejection halts execution and returns to planning. This records the resolution mechanism without pretending the package has already been approved. [VERIFIED: Plan 01-01]

2. **RESOLVED — Roster removal confirmer**
   - What we know: Removal needs a second confirmation displaying the selected member. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md]
   - Selected policy: Bind confirmation to the initiating administrator, chat, target membership, and expiry. A different administrator cannot consume the action; they must open their own removal flow. [RESOLVED: planner discretion, implemented by the roster-removal plan]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | TypeScript bot runtime | ✓, below proposed project pin | `v24.18.0` | Use the Compose image pinned to the project Node line. [VERIFIED: local environment probe] |
| npm | Package installation and scripts | ✓ | `11.16.0` | — [VERIFIED: local environment probe] |
| Docker Engine | PostgreSQL integration tests/local services | ✓ | `29.7.2` | — [VERIFIED: local environment probe] |
| Docker Compose | Local PostgreSQL service | ✓ | `v5.4.0` | — [VERIFIED: local environment probe] |
| PostgreSQL client/server | Direct local DB validation | ✗ | — | Use Docker Compose/Testcontainers. [VERIFIED: local environment probe] |

**Missing dependencies with no fallback:** none. [VERIFIED: local environment probe]

**Missing dependencies with fallback:** a local PostgreSQL installation is absent; Docker is available for Compose/Testcontainers. [VERIFIED: local environment probe]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.11` [ASSUMED] |
| Config file | none — create in Wave 0 [VERIFIED: repository file audit] |
| Quick run command | `npm run test:unit` [ASSUMED] |
| Full suite command | `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:integration` [ASSUMED] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | Location candidate is confirmed before an IANA timezone becomes active; setup commits once. | unit + integration | `npm run test:unit -- setup` / `npm run test:integration -- chat-configuration` | ❌ Wave 0 |
| CONF-02 | Weekday/default start accepts valid values and rejects invalid `HH:MM`. | unit | `npm run test:unit -- schedule-settings` | ❌ Wave 0 |
| CONF-03 | Duration/boundaries/default start obey cross-field invariants. | unit + integration | `npm run test:unit -- schedule-settings` / `npm run test:integration -- chat-configuration` | ❌ Wave 0 |
| CONF-05 | Two reminder times default and can be atomically edited. | unit + integration | `npm run test:unit -- reminder-times` / `npm run test:integration -- chat-configuration` | ❌ Wave 0 |
| ROST-01 | Only a replied readable Telegram user can create/reactivate membership. | unit + integration | `npm run test:unit -- roster-add` / `npm run test:integration -- roster-repository` | ❌ Wave 0 |
| ROST-02 | Remove requires a second actor-bound confirmation and is idempotent. | unit + integration | `npm run test:unit -- roster-remove` / `npm run test:integration -- roster-repository` | ❌ Wave 0 |
| ROST-03 | Roster projection sorts safely and falls back to an ID-based label. | unit | `npm run test:unit -- roster-rendering` | ❌ Wave 0 |
| AUTH-01 | Admin, previous-poll-participant, and anyone policies are persisted and passed to the future access seam. | unit + integration | `npm run test:unit -- planning-access` / `npm run test:integration -- chat-configuration` | ❌ Wave 0 |
| AUTH-02 | Every protected command/callback rechecks current admin status; a demoted actor loses its draft. | unit + integration | `npm run test:unit -- authorization` / `npm run test:integration -- draft-repository` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:unit` [ASSUMED]
- **Per wave merge:** `npm run format:check && npm run lint && npm run typecheck && npm test` [ASSUMED]
- **Phase gate:** Full suite plus `npm run test:integration` green before `$gsd-verify-work`. [ASSUMED]

### Wave 0 Gaps

- [ ] `package.json`, TypeScript configuration, and explicit lint/typecheck/test scripts — establishes the greenfield runtime/tooling. [VERIFIED: repository file audit]
- [ ] `vitest.config.ts` and `tests/unit/` — covers pure domain and handler behavior. [ASSUMED]
- [ ] PostgreSQL Testcontainers fixture plus `tests/integration/` — covers migrations, transactional confirmation, and uniqueness. [ASSUMED]
- [ ] Fake `TelegramMembershipGateway`, fake clock, and deterministic `TimezoneResolver` fixture — makes authorization/expiry/error paths testable. [ASSUMED]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Treat Telegram `from.id` as the actor identity and validate current membership through the Telegram API at each protected action. [CITED: https://core.telegram.org/bots/api] |
| V3 Session Management | partial | Store actor-bound, expiring setup/settings drafts in PostgreSQL; do not use an authentication session as the authority. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |
| V4 Access Control | yes | Central `AuthorizationService`, current-admin revalidation, and callback action-to-actor/chat binding. [VERIFIED: .planning/REQUIREMENTS.md] |
| V5 Input Validation | yes | Zod-parse updates, callback payloads, `HH:MM`, durations, coordinates, and draft values before state changes. [VERIFIED: .planning/research/STACK.md] |
| V6 Cryptography | partial | Use platform secret injection for bot/database credentials; do not hand-roll secret storage or signatures. [ASSUMED] |

### Known Threat Patterns for TypeScript Telegram Bot + PostgreSQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/replayed callback data | Tampering | Short opaque callback token; load server-side action; bind actor/chat/target/expiry; reauthorize before mutation. [CITED: https://core.telegram.org/bots/api] |
| Former admin completes saved draft | Elevation of privilege | Current membership check at every step and draft deletion on denied check. [VERIFIED: .planning/phases/01-chat-readiness/01-CONTEXT.md] |
| Reply to anonymous/non-user message | Spoofing | Require a readable replied `from` user; never construct identity from display text. [CITED: https://core.telegram.org/bots/api] |
| Malformed time/location/command input | Tampering | Strict schema parsing and complete cross-field validation before persistence. [ASSUMED] |
| Bot token or private roster data in logs | Information disclosure | Pino redaction; log IDs/action types rather than raw update payloads or tokens. [VERIFIED: .planning/research/STACK.md] |

## Sources

### Primary (HIGH confidence)

- [Telegram Bot API](https://core.telegram.org/bots/api) — `getChatMember`, `reply_to_message`, callback acknowledgement/alerts, callback byte limit, group location-button restriction, and update semantics.
- [grammY commands](https://grammy.dev/guide/commands.html) — `bot.command()` command registration.
- [grammY sessions](https://grammy.dev/plugins/session.html) — default RAM storage, persistence options, and session tradeoffs.
- [grammY runner](https://grammy.dev/plugins/runner) — sequentialization and runner concurrency behavior.

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — project-selected TypeScript/grammY/PostgreSQL/Prisma/Zod/Pino/Vitest stack.
- `.planning/phases/01-chat-readiness/01-CONTEXT.md` — locked user decisions controlling all workflow behavior.
- `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md` — phase scope, acceptance criteria, and requirements mapping.

### Tertiary (LOW confidence)

- npm registry metadata queried on 2026-08-19 — versions and repository URLs; package legitimacy seam metadata was unavailable, so every package remains human-gated.

## Metadata

**Confidence breakdown:**

- Standard stack: MEDIUM — selected at project level, while current package-legitimacy metadata is unavailable and must be human-verified.
- Architecture: HIGH — driven directly by locked phase behavior and Telegram's documented group/update constraints.
- Pitfalls: MEDIUM — authorization and Telegram constraints are documented; schedule cross-field policy is an explicit planning assumption.

**Research date:** 2026-08-19
**Valid until:** 2026-09-18 for stable Telegram/grammY patterns; recheck package metadata immediately before installation.
