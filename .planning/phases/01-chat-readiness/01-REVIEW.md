---
phase: 01-chat-readiness
reviewed: 2026-08-26T02:55:00Z
depth: standard
files_reviewed: 59
files_reviewed_list:
  - compose.yaml
  - Dockerfile
  - .dockerignore
  - .github/workflows/ci.yml
  - .gitignore
  - package.json
  - .prettierignore
  - prisma/migrations/20260819000000_chat_readiness_core/migration.sql
  - prisma/migrations/20260819010000_settings_edits/migration.sql
  - prisma/migrations/20260819020000_roster/migration.sql
  - prisma/migrations/20260820030000_roster_removal/migration.sql
  - prisma/migrations/20260820090000_complete_settings_edits/migration.sql
  - prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql
  - prisma/schema.prisma
  - src/app/config.ts
  - src/app/create-bot.ts
  - src/app/main.ts
  - src/domain/auth/authorization-service.ts
  - src/domain/auth/planning-access-service.ts
  - src/domain/chat/schedule-validator.ts
  - src/domain/chat/settings-service.ts
  - src/domain/chat/setup-service.ts
  - src/domain/chat/types.ts
  - src/domain/roster/roster-service.ts
  - src/infrastructure/db/prisma.ts
  - src/infrastructure/time/timezone-resolver.ts
  - src/shared/callback-schema.ts
  - src/shared/logger.ts
  - src/telegram/callbacks.ts
  - src/telegram/handlers.ts
  - src/telegram/keyboards.ts
  - src/telegram/renderers.ts
  - src/telegram/roster-handlers.ts
  - src/telegram/roster-renderers.ts
  - src/telegram/settings-handlers.ts
  - src/telegram/setup-handlers.ts
  - tests/fakes/chat-readiness.ts
  - tests/helpers/postgres.ts
  - tests/integration/chat-configuration.test.ts
  - tests/integration/chat-readiness.e2e.test.ts
  - tests/integration/roster-repository.test.ts
  - tests/integration/schedule-window-repair.test.ts
  - tests/integration/walking-skeleton.test.ts
  - tests/unit/authorization.test.ts
  - tests/unit/config.test.ts
  - tests/unit/logger.test.ts
  - tests/unit/planning-access.test.ts
  - tests/unit/roster-add.test.ts
  - tests/unit/roster-remove.test.ts
  - tests/unit/roster-rendering.test.ts
  - tests/unit/schedule-settings.test.ts
  - tests/unit/settings-dashboard-keyboard.test.ts
  - tests/unit/settings.test.ts
  - tests/unit/setup.test.ts
  - tests/unit/update-path-logging.test.ts
  - tests/unit/update-route-ownership.test.ts
  - tsconfig.build.json
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 1
  warning: 9
  info: 0
  total: 10
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-08-26T02:55:00Z
**Depth:** standard
**Files Reviewed:** 59
**Status:** issues_found

## Summary

The four security invariants this phase claims are, on the whole, actually held.
I traced them rather than assuming them:

- **Redaction allow-list** — no log call in `src/` passes raw user text, a raw
  update, coordinates, a callback token or a roster label under an allow-listed
  key. `err`/`error` is the only structurally rendered key and it drops the
  stack. `scrubString` correctly rebuilds each `/g` regex per call, so
  `lastIndex` cannot make a scrub silently skip. No leak found.
- **Single-shot acknowledgement** — the guard in `callbacks.ts:217-223` is
  correct, including the `finally` fallback and its bound error logging.
- **Opaque callback data** — every minted token is `v1:<uuid>` (39 bytes, inside
  the 1–64 limit) and carries no identity, date or claim. Authority is re-read
  from `callback_actions` at the boundary.
- **Fail-closed authorization** — role is re-derived per update; a demoted actor
  is refused. **But the denial path is not read-only, and that is this review's
  one blocker (CR-01).**
- **Route ownership** — `hasInFlightAction` genuinely runs before `authorize`
  on both carrier routes and is `findUnique`-scoped to the actor's own rows.
  The invariant it advertises is nevertheless breakable in one state (WR-03).
- **Expected-revision transactions** — `saveConfiguration`, `saveChange`,
  `keepCurrent`, `beginRemoval` and `removeConfirmed` all re-read the action row
  inside the transaction and gate consumption on
  `updateMany({ consumedAt: null, expiresAt: { gt: now } })`, so a double click
  cannot double-commit. Combined with `sequentialize` by `chat.id` the
  concurrency story holds. The weakness is not atomicity but *binding*: a save
  token names a draft row, not the value being saved (WR-02).
- **Repair migration `20260824000000`** — I checked the invariant claim rather
  than the comment. Lowering `daily_start_minute` to `default_start_minute` does
  preserve `daily_start < daily_end` (because the pre-existing ceiling rule plus
  a positive duration puts `default_start` strictly below `daily_end`), the
  `WHERE` clause is a no-op on coherent rows, and deliberately not bumping
  `revision` is right. The statement is correct. One residual gap is noted in
  WR-09.

Verified dynamically: `npm test` — 73/73 unit tests pass. `loadConfig` was
probed directly and does **not** behave as documented for a malformed
`DATABASE_URL` (WR-01).

The findings below are all behavioural or operational. Nothing here is an
authorization bypass; the blocker is durable-state destruction on a transient
infrastructure failure.

## Critical Issues

### CR-01: A transient membership-lookup failure deletes the admin's in-flight drafts, silently

**File:** `src/domain/auth/authorization-service.ts:34-53`
**Severity:** BLOCKER (data loss on a transient error)

`requireCurrentAdministrator` collapses two very different facts into one:

```ts
let role: CurrentTelegramRole = "unknown";
try {
  role = await this.membershipGateway.getCurrentRole(chatId, actorId);
} catch {
  // Membership evidence that cannot be refreshed is never authority.
}

if (role === "creator" || role === "administrator") return;

await this.prisma.setupDraft.deleteMany({ where: { chatId, actorUserId: actorId } });
if (this.prisma.settingsEditDraft !== undefined) {
  await this.prisma.settingsEditDraft.deleteMany({ where: { chatId, actorUserId: actorId } });
}
throw new PermissionDeniedError();
```

Denying on `unknown` is correct — that is the fail-closed rule. **Destroying
durable state on `unknown` is not.** `getCurrentRole` in `src/app/main.ts:34-40`
is a live `bot.api.getChatMember` call, so a 429, a 5xx, a socket reset or a DNS
blip is enough to reach this branch.

Concrete consequence: a genuine, still-current administrator eight steps into
`/setup` taps one button during a Telegram hiccup. The callback boundary
(`src/telegram/callbacks.ts:238-256`) calls this method, the gateway throws, the
role is `unknown`, **both of that actor's drafts are hard-deleted**, and the
admin is told `"Only current chat administrators can do that."` — a statement
that is false. Thirty minutes of wizard input is gone, unrecoverably, and the
next `/setup` starts from step 1.

The empty `catch {}` makes it undiagnosable on top of that. Every other module in
this phase carries an explicit, documented "a deliberate no-op and a swallowed
failure look identical to an operator" rule (`handlers.ts:210-213`,
`callbacks.ts:120-132`, `roster-handlers.ts:62-70`). `AuthorizationService` is
the one module on the critical path that has no logger at all, so the *only*
signal that Telegram membership refresh is failing is destroyed here. This is
the exact F-4 defect class, in the one place it costs durable data.

**Fix:** separate the decision from the cleanup. Only a *positively observed*
non-administrator role may delete drafts; unavailable evidence must deny without
writing, and must leave a trace.

```ts
export class AuthorizationService {
  constructor(
    private readonly prisma: /* … */,
    private readonly membershipGateway: TelegramMembershipGateway,
    private readonly logger?: SafeLogger,
  ) {}

  async requireCurrentAdministrator(chatId: bigint, actorId: bigint): Promise<void> {
    let role: CurrentTelegramRole;
    try {
      role = await this.membershipGateway.getCurrentRole(chatId, actorId);
    } catch (error) {
      // Deny (evidence is not authority) but never mutate: a transient
      // getChatMember failure must not be indistinguishable from a demotion.
      this.logger?.warn(
        {
          event: "auth.membership-unavailable",
          chatId,
          actorId,
          outcome: "denied",
          reason: "membership-lookup-failed",
          err: error,
        },
        "Membership evidence could not be refreshed",
      );
      throw new PermissionDeniedError();
    }

    if (role === "creator" || role === "administrator") return;

    // Only an OBSERVED non-administrator role revokes the actor's drafts.
    await this.prisma.setupDraft.deleteMany({ where: { chatId, actorUserId: actorId } });
    if (this.prisma.settingsEditDraft !== undefined) {
      await this.prisma.settingsEditDraft.deleteMany({ where: { chatId, actorUserId: actorId } });
    }
    throw new PermissionDeniedError();
  }
}
```

`tests/unit/authorization.test.ts:32-45` asserts only that the throwing gateway
denies; it must be extended to assert that the throwing gateway performs **zero**
`deleteMany` calls, which is precisely the distinction the current
implementation loses.

## Warnings

### WR-01: `loadConfig` throws a raw `TypeError: Invalid URL` — the fail-closed contract does not hold for a malformed `DATABASE_URL`

**File:** `src/app/config.ts:17-26`, `src/app/config.ts:52-58`
**Severity:** WARNING

The module's own docstring says *"Error messages intentionally name invalid keys
only, never their values, because both the bot token and database URL contain
secrets."* That guarantee rests on `safeParse` returning a failure so
`invalidKeys` can format the message. It does not, for a malformed URL.

In Zod 4, the `.refine()` callback still executes after the `.url()` format check
fails, so `new URL(value)` throws out of `safeParse` itself. Probed against the
project's own `src/app/config.ts` and its pinned `zod@4.4.3`:

```
not-a-url                            -> TypeError "Invalid URL"
postgres                             -> TypeError "Invalid URL"
postgresql://ok:ok@localhost:5432/db -> OK
https://a.test/x                     -> Error "Invalid application configuration: DATABASE_URL"
```

Two problems. First, the documented behaviour is simply wrong for the most likely
operator typo (a truncated or unquoted connection string), and the error names
no key. Second, Node's `ERR_INVALID_URL` `TypeError` carries the **raw offending
string on `error.input`** — the full connection URL, password included. Today
`src/app/main.ts:90-95` routes it through `createLogger().error({ err })` and
`safeError` (`logger.ts:111-130`) keeps only `name`/`message`/`code`, so it is
contained. But it is a secret-bearing exception object escaping the one module
whose stated job is to stop that, and any future `console.error(error)` or
`util.inspect` on the boot path turns it into a live leak.

`tests/unit/config.test.ts:36-58` only exercises a *syntactically valid* URL with
the wrong protocol, which is why this is not caught.

**Fix:** never let `new URL` throw inside the refinement.

```ts
function isPostgresUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}

const environmentSchema = z.object({
  BOT_TOKEN: z.string().trim().min(1),
  DATABASE_URL: z
    .string()
    .refine(isPostgresUrl, { message: "must use a PostgreSQL connection URL" }),
  LOG_LEVEL: logLevelSchema.default("info"),
  APP_MODE: appModeSchema.default("production"),
});
```

Add a case to `tests/unit/config.test.ts` for `DATABASE_URL: "postgres"` and for
`DATABASE_URL: ""`, asserting the `"Invalid application configuration:
DATABASE_URL"` message.

### WR-02: The settings "Save change" token is bound to the draft row, not to the reviewed field or value

**File:** `src/domain/chat/settings-service.ts:330-400`, `src/telegram/settings-handlers.ts:431-453`
**Severity:** WARNING

The save target is `{ draftId, action: "save" }` (`settings-service.ts:313-320`),
and `saveChange` validates only `draft.id === target.data.draftId` before
applying `draft.field` with `replacementValue(draft)`. Neither the field nor the
value under review is bound into the action row.

`settings_edit_drafts` is unique on `(chat_id, actor_user_id)`
(`schema.prisma:89`), so **one actor has exactly one draft row and `beginEdit`
upserts it in place — the `id` never changes.** Every save token that actor has
ever minted therefore continues to match, forever, no matter what the draft now
contains.

Reachable path (no privilege boundary is crossed, but the button lies):

1. `/settings` twice — two live dashboard messages, D1 and D2.
2. On D1: edit *Duration*, type `90` → review card R1 reads
   `Current: 60 minutes / New: 90 minutes`, with save token S1.
3. On D2: edit *Daily end*, type `23:00` → review card R2. The single draft row
   is now `field = DAILY_END_MINUTE, replacementPayload = 1380`.
4. Tap **Save change** on R1. `saveChange` matches the draft id, reads the
   *current* field/payload, and commits `daily_end_minute = 1380`. Duration is
   untouched.

A card that says "New: 90 minutes" commits a daily-end change. The `revision`
guard does not help — no revision moved. The variant where step 3 is
`beginEdit` without a selection is safer but equally confusing: `replacementValue`
returns `undefined`, `configurationWithReplacement` rejects it, and the user gets
the generic `"I couldn't save that change. Please try again."` for a card that is
in fact fine.

**Fix:** bind the reviewed field and value into the action row, and re-verify
inside the transaction.

```ts
// settings-service.ts — mint
createSaveAction(chatId, actorId, draftId, field: SettingsField, value: unknown, now: Date) {
  return this.createAction(chatId, actorId, { draftId, action: "save", field, value }, now);
}

// settings-service.ts — inside saveChange's $transaction, after loading `draft`
if (draft.field !== target.data.field) {
  throw new SettingsTransactionAbort({ kind: "stale" });
}
const pending = replacementValue(draft);
if (!Object.is(JSON.stringify(pending), JSON.stringify(target.data.value))) {
  throw new SettingsTransactionAbort({ kind: "stale" });
}
```

The stale card then correctly reports `CALLBACK_STALE` instead of silently
committing something else. `settingsTargetSchema` in
`src/shared/callback-schema.ts:64` needs the matching `field`/`value` members.

### WR-03: An expired settings-edit draft is never deleted, so the actor's text and location routes go silent forever

**File:** `src/telegram/handlers.ts:324-340`, `src/telegram/handlers.ts:556-568`, `src/telegram/settings-handlers.ts:290-304`
**Severity:** WARNING

`hasInFlightAction` deliberately counts an existing row *regardless of
`expiresAt`* (`handlers.ts:315-322`), and the stated justification is that this
"keeps the documented expiry copy reachable". That justification holds for a
lapsed **setup** draft and fails for a lapsed **settings** draft, because the two
consumers behave differently:

- `SetupService.requireActive` (`setup-service.ts:172-188`) deletes the expired
  row and returns `{ kind: "expired" }`, which the handler answers with
  `DRAFT_EXPIRED`. Correct.
- `findSettingsDraft` (`settings-handlers.ts:290-304`) returns `null` for an
  expired row and **deletes nothing**.

So for an actor holding only a lapsed settings draft, `message:text` runs:

1. `hasInFlightAction` → `true` (the row exists).
2. `authorize` → a live `getChatMember` round-trip.
3. `findSettingsDraft` → `null`.
4. `handleSetupText` → `requireActive` → `{ kind: "missing" }` →
   `if (active.kind !== "active") return;` (`setup-handlers.ts:539`) — **silence**.

Two defects fall out of this. The lapsed row is never cleaned by any code path
(only `beginEdit`'s upsert or a matching `selectValue` can clear it), so the state
is permanent until the admin happens to start another settings edit. And the
route's own stated invariant — *"an ordinary message costs no role lookup, no
draft deletion and no reply"* (`handlers.ts:346-351`) — is violated for that
admin on **every message they send from then on**, indefinitely. The
documented expiry copy is simultaneously unreachable on the settings surface: an
admin who types `19:30` two hours after opening an edit gets nothing at all.

`message:location` (`handlers.ts:503-514`) has the identical shape.

**Fix:** make the settings lookup mirror the setup lookup so the expired row is
consumed and reported once.

```ts
// settings-handlers.ts
export type SettingsDraftLookup =
  | Readonly<{ kind: "active"; draft: SettingsEditDraft }>
  | Readonly<{ kind: "missing" | "expired" }>;

export async function requireSettingsDraft(
  deps: SettingsHandlerDependencies,
  context: ActionContext,
  now: Date,
): Promise<SettingsDraftLookup> {
  const draft = await deps.prisma.settingsEditDraft.findUnique({
    where: { chatId_actorUserId: { chatId: context.chatId, actorUserId: context.actorId } },
  });
  if (draft === null) return { kind: "missing" };
  if (draft.expiresAt <= now) {
    await deps.prisma.settingsEditDraft.delete({ where: { id: draft.id } });
    return { kind: "expired" };
  }
  return { kind: "active", draft };
}
```

and in both carrier routes answer `kind === "expired"` with the settings expiry
copy before falling through to the setup surface.

### WR-04: A `/setup` revision conflict is an unrecoverable dead end reported as "Please try again."

**File:** `src/domain/chat/setup-service.ts:143-170`, `src/domain/chat/setup-service.ts:350-355`, `src/telegram/setup-handlers.ts:694-699`
**Severity:** WARNING

`beginOrResume` captures `expectedRevision` at *creation* time and its `update`
branch deliberately refreshes only `expiresAt`:

```ts
// Deliberately NOT re-read here: a resumed draft keeps the revision it
// was created against, so a configuration that moved underneath it still
// produces the conflict it really is.
update: { expiresAt: expiresAt(now) },
```

Detecting the conflict is right. The problem is that there is no way out of it:

- `saveConfiguration` returns `{ kind: "conflict" }` (`setup-service.ts:353-355`).
- `dispatchSetupCallback` has explicit branches for `saved`, `duplicate`,
  `expired` and `stale`, and everything else falls through to
  `await ctx.reply(SAVE_FAILURE)` — `"I couldn't save that change. Please try
  again."` (`setup-handlers.ts:698`).
- Trying again cannot work: the draft's `expectedRevision` is frozen and nothing
  refreshes it.
- Sending `/setup` again does not reset it either — `beginOrResume` deletes only
  an *expired* row (`setup-service.ts:148-150`) and otherwise **extends
  `expiresAt` by another 30 minutes**, so each retry pushes the deadlock further
  out.

The only escape is the Cancel button, which the copy never mentions. The trigger
is ordinary: a second admin editing `/settings` while the first is mid-wizard, or
the same admin using `/settings` between two wizard steps.

**Fix:** give `conflict` its own branch and its own copy, and make the recovery
mechanical.

```ts
// setup-handlers.ts, inside the save branch
if (result.kind === "conflict") {
  await ctx.answerCallbackQuery({
    text: "Chat settings changed while you were setting up. Send /setup to start again with the current values.",
    show_alert: true,
  });
  await deps.setup.discard(context.chatId, context.actorId); // drops the stale draft
  return;
}
```

Alternatively, refresh `expectedRevision` in `beginOrResume`'s `update` branch
*and* restart the draft's collected values, so `/setup` is a genuine restart.
Either is fine; silently freezing the wizard is not.

### WR-05: No reaper for `callback_actions`, `setup_drafts` or `settings_edit_drafts`

**File:** `prisma/schema.prisma:69`, `prisma/schema.prisma:74`, `prisma/schema.prisma:90`, `prisma/schema.prisma:100-105`
**Severity:** WARNING

Nothing in `src/` ever deletes an expired row. Grep for every delete against
these tables returns only the two `deleteMany` calls in
`authorization-service.ts` and the targeted single-row deletes that follow a
successful commit. `callback_actions` in particular is **never deleted at all** —
consumption only sets `consumed_at`.

The mint rate is not small:

- `/settings` mints one row per `SettingsField` — 8 rows, every invocation
  (`settings-handlers.ts:164-175`), and the dashboard is re-minted after every
  successful save (`settings-handlers.ts:571-576`).
- `/roster` mints one removal action per visible member plus up to two page
  actions — up to 22 rows per page render (`roster-handlers.ts:233-272`), and
  every page tap re-mints the whole set.
- Each wizard step mints one row per button (`setup-handlers.ts:277-287`), and
  each timezone lookup mints one per candidate plus one
  (`setup-handlers.ts:189-213`, `501-511`).

Both draft tables already carry `@@index([expiresAt])`, which is exactly the
index a reaper needs and which nothing currently uses — the intent was clearly
there and the sweeper never landed. `callback_actions` has no `expires_at`-only
index at all, so a future sweep would be a sequential scan.

This is durable, monotonic growth in the primary database with no ceiling.

**Fix:** add an `expires_at` index for `callback_actions` and a periodic sweep
(pg-boss is already the chosen scheduler in the stack).

```prisma
model CallbackAction {
  // …
  @@index([chatId, actorUserId, expiresAt])
  @@index([expiresAt])
  @@map("callback_actions")
}
```

```ts
// e.g. a scheduled job, run hourly
const cutoff = new Date(now.getTime() - RETENTION_MS);
await prisma.$transaction([
  prisma.callbackAction.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  prisma.setupDraft.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
  prisma.settingsEditDraft.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
]);
```

The `settings_edit_drafts` sweep also closes WR-03's permanent-row half.

### WR-06: Every domain service swallows storage failures into `{ kind: "failed" }` with no logger

**File:** `src/domain/chat/setup-service.ts:393-401`, `src/domain/chat/setup-service.ts:462-477`, `src/domain/chat/settings-service.ts:186-197`, `src/domain/chat/settings-service.ts:401-405`, `src/domain/chat/settings-service.ts:454-458`, `src/domain/roster/roster-service.ts:283-285`, `src/domain/roster/roster-service.ts:348-350`, `src/domain/roster/roster-service.ts:387-389`
**Severity:** WARNING

The Telegram layer went to considerable lengths to close F-4 — a bounded
catch-site vocabulary per surface, `err` bound at every site, distinct
`event`/`outcome`/`reason` triples. The domain layer underneath it did not get
the same treatment, and it is where the durable failures actually happen.

`RosterService` is the starkest:

```ts
} catch {
  return { kind: "failed" };
}
```

A connection drop, a serialization failure, a deadlock, a constraint violation
and a Prisma bug are all reduced to the same three-character result with the
error object discarded before anything reads it. `SettingsService.getCommitted`
(`settings-service.ts:194-196`) does the same for the read behind `/settings`,
so a database outage renders as `"I couldn't load chat settings. Please try
again."` with no server-side evidence whatsoever.

`SetupService.saveConfiguration`'s outer handler is worse than a bare catch,
because it *looks* discriminating:

```ts
} catch (error) {
  if (error instanceof SetupTransactionAbort && error.result.kind !== "cancelled") {
    return error.result;
  }
  return { kind: "failed" };
}
```

Every non-abort throw — including the unique-constraint violation that a
concurrent `chatConfiguration.create` would raise — lands in the same
unlogged `{ kind: "failed" }`. An operator seeing `SAVE_FAILURE` in the chat has
no way to tell a genuine conflict from a driver fault.

**Fix:** thread the same `SafeLogger` the Telegram layer already has into each
service constructor and bind the caught value under `err` before returning the
result, using the bounded-outcome pattern already established in
`roster-handlers.ts:71-100`.

```ts
} catch (error) {
  this.logger?.error(
    {
      event: "domain.persistence.failure",
      chatId,
      actorId,
      outcome: "roster-removal-failed",
      reason: "transaction-aborted",
      err: error,
    },
    "Roster service absorbed a persistence failure",
  );
  return { kind: "failed" };
}
```

### WR-07: `/setup` on an already-configured chat says "This chat is not configured yet."

**File:** `src/telegram/setup-handlers.ts:443-449`
**Severity:** WARNING

```ts
await ctx.reply(
  "<b>Set up rehearsal planning</b>\nThis chat is not configured yet.",
  { /* … */ },
);
```

The text is unconditional. `handleSetupCommand` never reads
`chatConfiguration`, yet re-running setup on a configured chat is an explicitly
supported flow — `beginOrResume` seeds `expectedRevision` from the *active*
configuration precisely so that it works (`setup-service.ts:159-162`, whose own
comment describes the bug that fix closed). So the one message the admin sees
in the supported case is false, and it contradicts
`renderSettingsProjection`'s `not-configured` copy, which is the same claim used
correctly (`renderers.ts:115-120`).

**Fix:** branch on the committed configuration.

```ts
const active = await deps.prisma.chatConfiguration.findUnique({
  where: { chatId: context.chatId },
});
const heading =
  active === null
    ? "<b>Set up rehearsal planning</b>\nThis chat is not configured yet."
    : "<b>Set up rehearsal planning</b>\nThis will replace the chat's current configuration.";
await ctx.reply(heading, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("Start setup", token) });
```

### WR-08: `projectRoster` misclassifies a Telegram delivery failure as a projection failure, then retries on the same broken channel

**File:** `src/telegram/roster-handlers.ts:274-288`
**Severity:** WARNING

The `try` block spans both the durable read **and** the terminal `emit`:

```ts
await emit({
  kind: "page",
  ...renderRosterPage(projection),
  keyboard: rosterRemovalKeyboard(removalTokens as string[], navigation),
});
} catch (error) {
  logRosterFailure(deps, ROSTER_CATCH_SITES.projection, route, context, error);
  await emit(await failedProjection(deps, route, context, page, now));
}
```

`emit` is `ctx.editMessageText` / `ctx.reply`, so a Telegram-side rejection of
the final send (a `400 message is not modified`, a rate limit, a lost edit
target) is logged under `outcome: "roster-projection-failed"` — the vocabulary
entry documented as *"Listing or binding the page failed"*. An operator reading
that line will investigate the database while the fault is in the Telegram
channel. The surface's declared purpose is to make those two classes
distinguishable (`ROSTER_CATCH_SITES` comment, `roster-handlers.ts:62-79`); here
they are merged.

The recovery then does a second `emit` on the channel that just failed. In the
common case it fails identically, and that second failure propagates to
`handleRosterCommand`'s / `dispatchRosterCallback`'s outer catch, where it is
logged *again* under `delivery` — so a single fault produces two log lines with
two different classifications, plus a wasted API call and an orphaned retry
`callback_actions` row from `failedProjection`.

**Fix:** keep only the read and the binding inside the guarded region.

```ts
let final: RosterProjection;
try {
  const members = await deps.roster.listActive(context.chatId);
  const projection = paginateRoster(members, page);
  // … build removalTokens / navigation …
  final = { kind: "page", ...renderRosterPage(projection), keyboard: /* … */ };
} catch (error) {
  logRosterFailure(deps, ROSTER_CATCH_SITES.projection, route, context, error);
  final = await failedProjection(deps, route, context, page, now);
}
await emit(final); // delivery failures belong to the caller's `delivery` site
```

### WR-09: The floor repair migration covers committed rows only, and leaves `updated_at` stale

**File:** `prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql:21-23`
**Severity:** WARNING

The statement itself is correct — I verified the invariant argument rather than
trusting the comment, and lowering the floor really is the safe direction. Two
residual gaps:

1. **`setup_drafts` is not repaired.** A draft whose schedule was collected under
   the old validator can hold `default_start_minute < daily_start_minute`. After
   deployment, `completeConfiguration` (`setup-service.ts:93-104`) calls
   `validateSchedule`, returns `undefined`, and `saveConfiguration` aborts with
   `{ kind: "failed" }` → the generic `"I couldn't save that change. Please try
   again."` with no explanation of which value is now out of range. The exposure
   window is bounded by the 30-minute draft lifetime, but the failure mode
   during that window is opaque.
2. **`updated_at` is not advanced.** The column is `NOT NULL` with no database
   trigger (`@updatedAt` is client-side in Prisma), so a repaired row keeps a
   timestamp that predates its own last modification. Any later audit or
   change-detection based on `updated_at` will be wrong for exactly the rows this
   migration touched.

**Fix:**

```sql
UPDATE "chat_configurations"
SET "daily_start_minute" = "default_start_minute",
    "updated_at" = NOW()
WHERE "default_start_minute" < "daily_start_minute";

-- In-flight drafts were collected under the old rule and would otherwise fail
-- opaquely at review; repair them on the same terms.
UPDATE "setup_drafts"
SET "daily_start_minute" = "default_start_minute",
    "updated_at" = NOW()
WHERE "default_start_minute" IS NOT NULL
  AND "daily_start_minute" IS NOT NULL
  AND "default_start_minute" < "daily_start_minute";
```

Note that `tests/integration/schedule-window-repair.test.ts:72` asserts
`toHaveLength(1)` on the parsed statements and will need updating.

### WR-10: Dead exports and write-only persisted state

**File:** `src/domain/auth/planning-access-service.ts:39-43`, `src/telegram/renderers.ts:159-170`, `src/domain/chat/setup-service.ts:190-199`, `prisma/schema.prisma:58-59`
**Severity:** WARNING

- `PlanningAccessService` has no reference anywhere in `src/` or `tests/`. The
  free function `canStartPlanning` it wraps is referenced only by
  `tests/unit/planning-access.test.ts`. Neither is wired into any handler, so the
  `planning_access_policy` this phase collects and stores is currently
  write-only.
- `renderPlanningAccessReview` (`renderers.ts:159-170`) has no caller;
  `renderSettingsReview` superseded it. It duplicates that function's shape and
  will drift.
- `SetupDraft.candidateTimezone` is written by `selectTimezone`
  (`setup-service.ts:193`) — always to the same value as `timezone`, in the same
  statement — and is never read by any code path. It is a persisted column whose
  only content is a duplicate of the column beside it.
- `SetupStep` is a single-member enum (`schema.prisma:16-18`) whose `step` column
  is set once at draft creation (`setup-service.ts:157`) and never read or
  transitioned.

None of these is a correctness fault today, but each is a maintenance surface
that will be assumed live by the next reader — `candidateTimezone` in particular
reads as a two-phase confirm that does not exist.

**Fix:** delete `PlanningAccessService` and `renderPlanningAccessReview`, and
either drop `candidate_timezone`/`step` in a follow-up migration or add a comment
naming the phase that will consume them. If `canStartPlanning` is intended for a
later phase, keep it and say so in a docstring, since it currently exists only to
satisfy its own test.

---

_Reviewed: 2026-08-26T02:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
