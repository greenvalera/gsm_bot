# Phase 1: Chat Readiness - Pattern Map

**Mapped:** 2026-08-19  
**Files analyzed:** 25 proposed implementation files  
**Analogs found:** 0 / 25

## Mapping Basis

This is a greenfield repository. The source scan found only planning/configuration artifacts: no `src/`, `tests/`, `package.json`, Prisma schema, or existing Telegram implementation. Consequently, there is no codebase analog to copy for any Phase 1 file. The paths below are inferred implementation units from the prescriptive project structure in [01-RESEARCH.md](01-RESEARCH.md#L178) and the UI contract; they are not locked filenames. A planner may consolidate adjacent units while preserving their boundaries and the shared patterns below.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `package.json` | config | batch | — | none (greenfield) |
| `tsconfig.json` | config | transform | — | none (greenfield) |
| `vitest.config.ts` | config | batch | — | none (greenfield) |
| `prisma/schema.prisma` | model | CRUD | — | none (greenfield) |
| `src/app/config.ts` | config | transform | — | none (greenfield) |
| `src/app/main.ts` | controller | event-driven | — | none (greenfield) |
| `src/app/create-bot.ts` | provider | event-driven | — | none (greenfield) |
| `src/telegram/handlers.ts` | controller | request-response | — | none (greenfield) |
| `src/telegram/callbacks.ts` | controller | event-driven | — | none (greenfield) |
| `src/telegram/renderers.ts` | component | transform | — | none (greenfield) |
| `src/telegram/keyboards.ts` | component | transform | — | none (greenfield) |
| `src/domain/auth/authorization-service.ts` | service | request-response | — | none (greenfield) |
| `src/domain/auth/planning-access-service.ts` | service | request-response | — | none (greenfield) |
| `src/domain/chat/types.ts` | model | transform | — | none (greenfield) |
| `src/domain/chat/schedule-validator.ts` | utility | transform | — | none (greenfield) |
| `src/domain/chat/setup-service.ts` | service | CRUD | — | none (greenfield) |
| `src/domain/chat/settings-service.ts` | service | CRUD | — | none (greenfield) |
| `src/domain/roster/roster-service.ts` | service | CRUD | — | none (greenfield) |
| `src/infrastructure/db/prisma.ts` | provider | request-response | — | none (greenfield) |
| `src/infrastructure/db/repositories.ts` | service | CRUD | — | none (greenfield) |
| `src/infrastructure/time/timezone-resolver.ts` | provider | request-response | — | none (greenfield) |
| `src/infrastructure/time/clock.ts` | provider | request-response | — | none (greenfield) |
| `src/shared/callback-schema.ts` | utility | transform | — | none (greenfield) |
| `tests/unit/chat-readiness.test.ts` | test | transform | — | none (greenfield) |
| `tests/integration/chat-readiness.repository.test.ts` | test | CRUD | — | none (greenfield) |

## Pattern Assignments

There are no implementation excerpts to extract from the codebase. Copy the following project-level patterns into the initial files; all snippets are documented reference patterns, not existing project code.

### `src/app/main.ts` and `src/app/create-bot.ts` (controller/provider, event-driven)

**Analog:** None. Establish the composition-root seam described in [01-RESEARCH.md](01-RESEARCH.md#L178-L192): construct configuration, Prisma, clock, Telegram membership gateway, timezone resolver, services, grammY bot, then runner.

**Core event-ordering pattern** — source [01-RESEARCH.md](01-RESEARCH.md#L342-L352):

```typescript
bot.use(sequentialize((ctx) => {
  const chatKey = ctx.chat?.id.toString();
  return chatKey === undefined ? [] : [chatKey];
}));
```

Use chat-key sequentialization for UX only; database transactions and constraints remain the correctness boundary.

### `src/telegram/handlers.ts`, `callbacks.ts`, `keyboards.ts`, and `renderers.ts` (controller/component, request-response/event-driven/transform)

**Analog:** None. These files implement the Telegram projection layer, not persistence or authorization policy.

**Command and reply-anchored identity pattern** — source [01-RESEARCH.md](01-RESEARCH.md#L315-L329):

```typescript
bot.command("roster_add", async (ctx) => {
  const repliedUser = ctx.msg.reply_to_message?.from;
  if (!repliedUser || repliedUser.is_bot) {
    await ctx.reply("Reply to a band member's message, then use /roster_add.");
    return;
  }
  await rosterService.addFromRepliedUser(ctx.chat.id, ctx.from.id, repliedUser);
});
```

**Callback/error pattern** — source [01-RESEARCH.md](01-RESEARCH.md#L331-L339):

```typescript
await ctx.answerCallbackQuery({
  text: "Current chat administrator permission is required.",
  show_alert: true,
});
```

Call acknowledgement before durable work. Parse only opaque, versioned action tokens; do not encode names, permission claims, schedule values, or authoritative IDs in `callback_data` ([01-UI-SPEC.md](01-UI-SPEC.md#L117-L124)). The callback handler loads the server-side action, checks its chat/actor/target/expiry bindings, then calls the application service.

**Rendering/keyboard pattern:** Render committed settings only; each settings edit must show `Current` and `New` before save. Render setup drafts as `Setup in progress` / `Step X of 8`; never render a partial draft as active. Use the exact surface contracts for setup, dashboard, roster, removal confirmation, pagination, and denials in [01-UI-SPEC.md](01-UI-SPEC.md#L87-L100). Messages have one bold heading at most; literal commands, zones, IDs, and `HH:MM` use code formatting only ([01-UI-SPEC.md](01-UI-SPEC.md#L55-L64)).

### `src/domain/auth/authorization-service.ts` and `planning-access-service.ts` (service, request-response)

**Analog:** None. Create a narrow Telegram membership gateway behind the domain service. Never cache stored administrator status as authorization.

**Authorization/error pattern** — source [01-RESEARCH.md](01-RESEARCH.md#L217-L234):

```typescript
const authorization = await telegramMembershipGateway.getCurrentRole(chatId, actorId);
if (!authorization.isAdministrator) {
  await draftRepository.deleteForActor(chatId, actorId);
  throw new PermissionDeniedError("Current chat administrator permission is required.");
}
```

Apply before every protected command, callback, wizard step, settings save, roster mutation, and removal confirmation. `planning-access-service.ts` is the future-facing `canStartPlanning` seam: current admins always pass, while the configured policy may broaden access ([01-RESEARCH.md](01-RESEARCH.md#L217-L221)).

### `src/domain/chat/types.ts`, `schedule-validator.ts`, `setup-service.ts`, and `settings-service.ts` (model/utility/service, transform/CRUD)

**Analog:** None. Keep active configuration separate from actor-bound drafts. Model a draft with actor/chat, step, validated partial payload, expiry, and configuration revision.

**Atomic confirmation pattern** — source [01-RESEARCH.md](01-RESEARCH.md#L197-L215):

```typescript
await db.$transaction(async (tx) => {
  await requireCurrentChatAdministrator(tx, chatId, actorId);
  const draft = await setupDraftRepository.requireActive(tx, chatId, actorId, now);
  await chatConfigurationRepository.createFromConfirmedDraft(tx, draft);
  await setupDraftRepository.delete(tx, draft.id);
});
```

Validate strict `HH:MM`, positive duration, `dailyStart < dailyEnd`, and `defaultStart + duration <= dailyEnd` at each complete schedule edit and final setup save ([01-RESEARCH.md](01-RESEARCH.md#L291-L299); [01-UI-SPEC.md](01-UI-SPEC.md#L104-L115)). A failed validation or save leaves active configuration unchanged. Expire drafts after 30 minutes and discard immediately after a failed current-admin check.

### `src/domain/roster/roster-service.ts` (service, CRUD)

**Analog:** None. Use reply-anchored Telegram user identity, upsert/re-activate a chat membership, and soft-deactivate it on confirmed removal. Do not make a typed name or username a roster key.

For projection, order by safe display label and use the exact fallback and 20-entry deterministic pagination contract in [01-UI-SPEC.md](01-UI-SPEC.md#L96-L99) and [01-UI-SPEC.md](01-UI-SPEC.md#L123-L124). The removal confirmation must bind initiator, chat, target membership, and expiry before executing an idempotent deactivation ([01-RESEARCH.md](01-RESEARCH.md#L301-L309)).

### `prisma/schema.prisma`, `src/infrastructure/db/prisma.ts`, and `repositories.ts` (model/provider/service, CRUD)

**Analog:** None. Establish Prisma models/repositories for active `ChatConfiguration`, durable setup/settings drafts, known Telegram user identities, active/soft-deleted chat memberships, and expiring callback confirmation actions. Store Telegram identifiers as database `bigint`/TypeScript `bigint`, timestamps as `timestamptz`, and each chat zone as an IANA string.

Repository methods own short transactions, uniqueness/idempotency, and revision checks; handlers must not compose ad-hoc SQL. The research requires Prisma migrations and repositories instead of SQL in handlers ([01-RESEARCH.md](01-RESEARCH.md#L257-L265)).

### `src/infrastructure/time/timezone-resolver.ts` and `clock.ts` (provider, request-response)

**Analog:** None. Expose `TimezoneResolver.resolve(latitude, longitude)` as a fallible adapter and inject a clock into services/tests. A group user attaches a normal location message; display and explicitly confirm its IANA candidate before storing it. Never use a private-chat location-request keyboard ([01-RESEARCH.md](01-RESEARCH.md#L242-L246)).

### `src/shared/callback-schema.ts`, `src/app/config.ts`, `package.json`, `tsconfig.json`, and `vitest.config.ts` (utility/config, transform/batch)

**Analog:** None. Use Zod at both untrusted-input boundaries: boot configuration and callback/text values. Enable strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as specified by the project stack. Use Pino structured logs with bot-token/PII redaction; log action/chat/actor IDs rather than raw Telegram updates.

The first package-install plan must include the research-mandated human verification checkpoint because every proposed dependency is currently flagged SUS ([01-RESEARCH.md](01-RESEARCH.md#L128-L154)).

### `tests/unit/chat-readiness.test.ts` and `tests/integration/chat-readiness.repository.test.ts` (test, transform/CRUD)

**Analog:** None. Use injected fakes for membership gateway, resolver, and clock in unit tests. Use Testcontainers PostgreSQL plus Prisma migrations for repository/transaction tests. Cover the requirements-to-tests map in [01-RESEARCH.md](01-RESEARCH.md#L401-L445), particularly demotion deletes drafts, atomic promotion, reply-anchor validation, actor-bound/idempotent removal, safe roster rendering, and stale/expired callbacks.

## Shared Patterns

### Authorization and denial behavior

**Source:** [01-RESEARCH.md](01-RESEARCH.md#L217-L234), [01-UI-SPEC.md](01-UI-SPEC.md#L117-L124)  
**Apply to:** Every protected command and callback, draft read/write, settings save, roster mutation, and removal confirmation.

- Re-query current Telegram membership immediately at the action boundary.
- On denial, delete the actor's active setup/settings draft.
- For callbacks, acknowledge with a private alert; for commands, use the concise group denial copy.

### Durable state and atomic promotion

**Source:** [01-RESEARCH.md](01-RESEARCH.md#L197-L215)  
**Apply to:** Setup completion, each settings edit, roster changes, and action-token consumption.

- PostgreSQL is authoritative; grammY session/memory is not workflow state.
- Drafts are actor-bound, expire after 30 minutes, and cannot become active incrementally.
- Promote the complete validated configuration and delete its draft in one transaction.

### Validation, callbacks, and errors

**Source:** [01-RESEARCH.md](01-RESEARCH.md#L248-L265), [01-UI-SPEC.md](01-UI-SPEC.md#L128-L146)  
**Apply to:** All Telegram adapters and domain service entry points.

- Parse commands, input values, and callback tokens through schemas before mutations.
- Keep callback tokens compact, opaque, and versioned; the database action supplies authority.
- Preserve authoritative state on invalid, stale, duplicate, expiry, location-resolution, or persistence failures; use the UI contract's exact user-facing copy.

### Telegram-native rendering

**Source:** [01-UI-SPEC.md](01-UI-SPEC.md#L83-L124)  
**Apply to:** Renderers and keyboards.

- Use group messages and inline keyboards only; no WebView, CSS surface, reply keyboard, or private-chat location request.
- Acknowledge callbacks immediately; successful mutation replaces/updates the originating message from authoritative state.
- Keep buttons action-first and bounded; paginate rosters above 20 entries deterministically.

## No Analog Found

All 25 proposed files have no close code analog because this is the first implementation phase. The planner should use the documented patterns above and the phase research/UI contract, not invent a pre-existing local convention.

## Metadata

**Analog search scope:** repository root excluding `.git`; expected `src/`, `tests/`, package manifest, and Prisma paths  
**Files scanned:** 22 non-git repository files; 0 application-source files  
**Pattern extraction date:** 2026-08-19
