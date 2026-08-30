# Phase 2: Weekly Rehearsal Proposal - Pattern Map

**Mapped:** 2026-08-30
**Files analyzed:** 17 (7 new source, 8 modified source, 2 new test groups)
**Analogs found:** 15 / 17

Phase 1 shipped every seam this phase extends. The default assumption for every
file below is **copy the Phase 1 analog**, not invent. Where research names a
hardened defect (F-3, F-4, F-5/F-6, F-7, F-9, T-01-21-*), the analog is the
repaired version and re-deriving it re-introduces the defect.

---

## File Classification

| New/Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `prisma/schema.prisma` | modified | model | CRUD | existing `ChatConfiguration` / `SetupDraft` / `CallbackAction` models, same file | exact |
| `src/infrastructure/time/civil.ts` | new | utility | transform | `src/domain/chat/schedule-validator.ts` (pure, throwing codec + typed result) | role-match |
| `src/infrastructure/time/zoned-clock.ts` | new | provider | transform | `src/infrastructure/time/timezone-resolver.ts` (discriminated-union result, `Intl` seam) | exact |
| `src/domain/planning/slot-generator.ts` | new | utility | transform | `src/domain/chat/schedule-validator.ts` | exact |
| `src/domain/planning/target-week.ts` | new | utility | transform | `src/domain/auth/planning-access-service.ts` (pure injected-input policy fn) | role-match |
| `src/domain/planning/planning-service.ts` | new | service | CRUD | `src/domain/roster/roster-service.ts` (+ `settings-service.ts` for revision guard) | exact |
| `src/telegram/planning-renderers.ts` | new | component | transform | `src/telegram/roster-renderers.ts` | exact |
| `src/telegram/planning-handlers.ts` | new | controller | event-driven | `src/telegram/roster-handlers.ts` | exact |
| `src/telegram/keyboards.ts` (day/slot rows) | modified | component | transform | `SETUP_WEEKDAY_BUTTONS` / `SETUP_POLICY_BUTTONS`, same file | exact |
| `src/shared/callback-schema.ts` (planning target) | modified | utility | transform | `rosterRemovalTargetSchema` + `create/parseRosterRemovalTarget`, same file | exact |
| `src/telegram/callbacks.ts` (per-kind authority) | modified | middleware | request-response | itself — this is a surgical extension, no external analog | exact (self) |
| `src/telegram/handlers.ts` (`/plan`, `/plan_status`, routes) | modified | route | request-response | `CHAT_READINESS_ROUTES` + `bot.command("roster_add")`, same file | exact |
| `src/domain/auth/authorization-service.ts` (`currentRole`) | modified | service | request-response | `requireCurrentAdministrator`, same file (copy the try/catch + `logFailure`, drop the deletes) | exact (self) |
| `src/telegram/roster-renderers.ts` (export `escapeHtml`) | modified | component | transform | itself (one-line export) | exact (self) |
| `src/app/create-bot.ts` (composition) | modified | config | — | existing `registerChatReadinessHandlers` / `registerChatReadinessCallbacks` wiring | exact |
| `tests/unit/planning-*.test.ts` | new | test | — | `tests/unit/schedule-settings.test.ts` (serialized keyboard shape), `tests/unit/roster-remove.test.ts` | role-match |
| `tests/integration/planning.e2e.test.ts` | new | test | — | `tests/integration/chat-readiness.e2e.test.ts` | exact |

---

## Pattern Assignments

### `prisma/schema.prisma` (model, CRUD)

**Analog:** the models already in the same file. Follow them exactly.

Conventions to copy verbatim (from `ChatConfiguration`, lines 37-52):

```prisma
model ChatConfiguration {
  chatId               BigInt               @id @map("chat_id")
  ...
  revision             Int                  @default(1)
  createdAt            DateTime             @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt            DateTime             @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("chat_configurations")
}
```

- `BigInt` + `@map("snake_case")` for every chat/user id; `@db.Timestamptz(3)` on every instant.
- `revision Int @default(1)` — the optimistic-concurrency column the whole
  service layer depends on.
- `@@map` to a snake_case plural table name; enums are SCREAMING_SNAKE members.
- Add `PLANNING` to `CallbackActionKind` (schema lines 20-24), which today reads
  `START_SETUP / SETTINGS_EDIT / ROSTER_REMOVE`.
- New tables/enums per RESEARCH Pattern 3 (`PlanningRound`, `PlanningParticipant`,
  `PlanningRoundStatus`, `PlanningStep`).
- Civil dates are `String "YYYY-MM-DD"`, never `@db.Date` (Pitfall 7).
- Regenerate and **commit** `src/generated/prisma/**` (`npm run db:generate`).

---

### `src/infrastructure/time/zoned-clock.ts` (provider, transform)

**Analog:** `src/infrastructure/time/timezone-resolver.ts`

**Result-type pattern** (lines 3-16) — copy this discriminated-union shape for
`WallClockResolution`; note `Readonly<{...}>` on every variant and a named
`cause`/`kind` union rather than thrown errors:

```typescript
export type TimezoneResolution =
  | Readonly<{ kind: "resolved"; candidate: string }>
  | Readonly<{ kind: "ambiguous"; candidates: readonly [string, string, ...string[]] }>
  | Readonly<{ kind: "failure"; cause: "invalid-coordinates" | "empty-result" | "resolver-error" }>;
```

**`Intl` guard pattern** (lines 20-27) — the existing zone-validity probe; reuse
it rather than writing a second one:

```typescript
function isValidIanaZone(value: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
```

**Body:** take the verified `offsetMsAt` / `resolveWallClock` implementation from
`02-RESEARCH.md` Pattern 1 verbatim. Memoize one `Intl.DateTimeFormat` per zone
in a module-level `Map` (Pitfall 10). This file is the ONLY place `Intl` DST
reasoning may live.

---

### `src/domain/planning/slot-generator.ts` + `target-week.ts` + `civil.ts` (utility, transform)

**Analog:** `src/domain/chat/schedule-validator.ts`

**The containment rule to delegate to, not restate** (lines 61-75) — the floor
half was missing until Phase 1 plan 01-18 (F-5/F-6); a second copy re-introduces it:

```typescript
  if (values.dailyStartMinute >= values.dailyEndMinute) {
    return { valid: false, reason: "invalid-boundaries" };
  }
  // The rehearsal is contained by the window at BOTH ends. Only the ceiling was
  // ever enforced, so a rehearsal starting before the window opened was
  // accepted. Starting exactly at the floor is inside the window, hence `<`.
  if (values.defaultStartMinute < values.dailyStartMinute) {
    return { valid: false, reason: "outside-boundaries" };
  }
  if (values.defaultStartMinute + values.durationMinutes > values.dailyEndMinute) {
    return { valid: false, reason: "outside-boundaries" };
  }
```

**Formatting to reuse, never re-derive** (lines 23-40): `parseLocalTime` and
`formatLocalTime` already own the strict 24-hour `HH:MM` contract. Slot labels
call `formatLocalTime(minute)`.

**Result-shape pattern** (lines 10-19): a `Readonly<{ valid: true }> | Readonly<{ valid: false; reason: <bounded union> }>`
— use the same closed-union-reason shape for `slotAvailability`
(`"available" | "past" | "nonexistent"`) and any target-week outcome.

**Pure-policy pattern for `target-week.ts`** — `src/domain/auth/planning-access-service.ts:20-37`
is the shape: every input injected via a `Readonly<{...}>` param, a `switch` with
a fail-closed `default`, zero I/O, and a thin class wrapper if a service seam is
wanted. Inject `nowCivil` and the `weekIsClaimed` predicate; never call `Date.now()`
or `Intl` inside.

**`civil.ts` weekday rule (Pitfall 4):** define `IsoWeekday = 1|2|3|4|5|6|7` and a
single `isoWeekdayOf()` here. `ChatConfiguration.defaultWeekday` is 1..7 MON=1;
`WEEKDAYS`/`WEEKDAY_LABELS` in `src/domain/chat/types.ts` are 0-indexed;
`getUTCDay()` is 0..6 SUN=0. Convert at exactly one boundary — any `+1`/`-1` next
to a weekday outside `civil.ts` is a bug.

---

### `src/domain/planning/planning-service.ts` (service, CRUD)

**Analog:** `src/domain/roster/roster-service.ts` (transactions, token minting,
exactly-once consumption) + `src/domain/chat/settings-service.ts` (revision guard).

**Imports + narrowed persistence pattern** (`roster-service.ts:1-10, 33-39`):

```typescript
import {
  CallbackActionKind,
  type Prisma,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import {
  createCallbackToken,
  createRosterRemovalTarget,
  parseRosterRemovalTarget,
} from "../../shared/callback-schema.js";

type RosterPersistence = Pick<
  PrismaClient,
  "$transaction" | "callbackAction" | "chatMembership"
>;

/** Every roster callback action (row, confirmation, page, retry) shares this lifetime. */
export const ROSTER_ACTION_LIFETIME_MS = 30 * 60 * 1000;
```

Copy: `.js` extensions on every relative import, a `Pick<PrismaClient, ...>`
persistence type (so tests inject a partial client), and a module-level
`*_LIFETIME_MS` constant. `PLANNING_INACTIVITY_MS = 30 * 60 * 1000` follows the
same shape (RESEARCH Pattern 8; assumption A2).

**Token-minting pattern** (`roster-service.ts:186-200`) — the exact shape for
minting each step's day/time/back/confirm actions with a `createMany` inside the
step-transition transaction:

```typescript
    const token = createCallbackToken();
    await this.prisma.callbackAction.create({
      data: {
        token,
        kind: CallbackActionKind.ROSTER_REMOVE,
        chatId,
        actorUserId: actorId,
        targetId: createRosterRemovalTarget({ action: "request", membershipId }),
        expiresAt: actionExpiresAt(now),
      },
    });
    return token;
```

**Exactly-once consumption + transactional mutation** (`roster-service.ts:312-350`)
— this is the template for every planning transition and for Confirm:

```typescript
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.callbackAction.findUnique({ where: { token: callbackToken } });
        if (
          action === null ||
          action.kind !== CallbackActionKind.ROSTER_REMOVE ||
          action.chatId !== chatId ||
          action.actorUserId !== actorId ||
          action.expiresAt <= now
        )
          return { kind: "stale" };
        if (action.consumedAt !== null) return { kind: "duplicate" };
        const target = parseRosterRemovalTarget(action.targetId);
        if (!target.success || target.data.action !== "confirm") return { kind: "stale" };
        const consumed = await tx.callbackAction.updateMany({
          where: { token: callbackToken, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) return { kind: "duplicate" };
        const removed = await tx.chatMembership.updateMany({
          where: { id: target.data.membershipId, chatId, activeAt: { not: null }, deactivatedAt: null },
          data: { activeAt: null, deactivatedAt: now },
        });
        return removed.count === 1 ? { kind: "removed" } : { kind: "stale" };
      });
    } catch {
      return { kind: "failed" };
    }
```

Note the ordering that MUST be preserved: re-validate the row's kind/chat/actor/
expiry → `duplicate` on `consumedAt !== null` → parse the target → consume via
`updateMany ... consumedAt: null` and assert `count === 1` → then mutate → assert
`count === 1` → outer `catch` collapses to `{ kind: "failed" }`.

**Expected-revision guard** (`settings-service.ts:408-419`) — copy for every
planning-round transition and for the Confirm promotion:

```typescript
        if (draft.expectedRevision !== active!.revision)
          throw new SettingsTransactionAbort({ kind: "conflict" });
        const updated = await tx.chatConfiguration.updateMany({
          where: { chatId, revision: draft.expectedRevision },
          data: { [property]: candidate[property], revision: { increment: 1 } } as never,
        });
        if (updated.count !== 1)
          throw new SettingsTransactionAbort({ kind: "conflict" });
```

**Active-roster read for the confirm-time snapshot** (`roster-service.ts:162-168`)
— the exact predicate for D-09/D-10; do not write a second one:

```typescript
  async listActive(chatId: bigint): Promise<readonly RosterMember[]> {
    const memberships = await this.prisma.chatMembership.findMany({
      where: { chatId, activeAt: { not: null }, deactivatedAt: null },
      include: { telegramUser: true },
    });
    return memberships.map(toMember);
  }
```

**Result-union pattern** (`roster-service.ts:41-52`) — every method returns a
closed `kind` union (`"confirmation" | "duplicate" | "stale" | "failed"`), never
throws to the handler. Planning adds `"empty-roster"`, `"not-author"`,
`"not-takeover-eligible"` in the same style.

---

### `src/shared/callback-schema.ts` (utility, transform) — modified

**Analog:** `rosterRemovalTargetSchema` in the same file (lines 67-83, 133-147).

```typescript
// Roster-surface callback targets. Membership actions name the exact target
// membership; view actions carry only a page index. Neither ever carries a
// Telegram identity, a display name, or an authorization claim.
const rosterRemovalTargetSchema = z.union([
  z.object({ action: z.enum(["request", "confirm", "keep"]), membershipId: z.string().min(1) }).strict(),
  z.object({ action: z.enum(["page", "retry"]), page: z.number().int().min(0) }).strict(),
]);

export type RosterRemovalAction = z.infer<typeof rosterRemovalTargetSchema>;

export function createRosterRemovalTarget(target: RosterRemovalAction) {
  return JSON.stringify(target);
}

export function parseRosterRemovalTarget(targetId: string | null) {
  try {
    return rosterRemovalTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return rosterRemovalTargetSchema.safeParse(undefined);
  }
}
```

Copy exactly: `.strict()` on every member, a `z.union` of `.strict()` objects
(roster uses `union`, setup/settings use `discriminatedUnion` — either is in-house
style; `union` + `.strict()` is the most recent), an exported `z.infer` type, a
`create*Target` that is just `JSON.stringify`, and a `parse*Target` whose
`try/catch` funnels a `JSON.parse` throw into `safeParse(undefined)` so a corrupt
row is an ordinary parse failure. The wire token stays `createCallbackToken()`
(`v1:${randomUUID()}`, line 85-87) matching `callbackTokenSchema` (line 5).
Never put the date, minute, round id, or any authority on the wire.

---

### `src/telegram/keyboards.ts` (component, transform) — modified

**Analog:** `SETUP_WEEKDAY_BUTTONS` (lines 24-34) and `SETUP_POLICY_BUTTONS`
(lines 44-60), same file.

```typescript
export const SETUP_WEEKDAY_BUTTONS: readonly (readonly SetupKeyboardButton[])[] =
  [
    ["MON", "TUE", "WED", "THU"].map((value) => ({ text: WEEKDAY_LABELS[value as Weekday], action: `weekday:${value}` as SetupActionKey })),
    ["FRI", "SAT", "SUN"].map((value) => ({ text: WEEKDAY_LABELS[value as Weekday], action: `weekday:${value}` as SetupActionKey })),
  ];

/**
 * One declared row per policy, so every label gets the full card width. A
 * single mapped array would put all three in one row at roughly a third of the
 * width each, which is what truncated "Previous participants" to "Previous
 * particip…" (F-9). The row split is deliberate ...
 * `tests/unit/schedule-settings.test.ts` asserts the serialized shape.
 */
```

**Rules this establishes for the day and slot keyboards:** rows are *declared*
constants (4/3 for days, per D-08's emoji-prefixed labels; 3/3/3/1 proposed for
slots), never a bare `.map()` over the full array; the `readonly (readonly T[])[]`
type is the row contract; and the serialized shape is pinned by a unit test.

**Builder pattern** (lines 68-82, `setupKeyboard`) — takes declared rows plus a
`tokenFor(action) => string`, so the pure row table never touches token minting.
Copy this signature for `planningDayKeyboard(rows, tokenFor)` /
`planningSlotKeyboard(...)`. `rosterRemovalKeyboard` (lines 145-158) shows the
optional trailing-controls pattern for Back / Confirm / Take over rows.

---

### `src/telegram/planning-renderers.ts` (component, transform)

**Analog:** `src/telegram/roster-renderers.ts`

**Text rendering pattern** (lines 98-118) — pure function, returns `{ text }`,
lines joined with `\n`, `<b>` heading first, no keyboard and no I/O:

```typescript
export function renderRosterPage(projection: RosterPage<RosterIdentity>) {
  if (projection.total === 0) {
    return { text: ["<b>No band members yet</b>", "Reply to a member's message, then send /roster_add to add them."].join("\n") };
  }
  const lines = ["<b>Band roster</b>", ...projection.members.map((member) => `• ${memberLabel(member)}`)];
  ...
  return { text: lines.join("\n") };
}
```

The D-08 legend line goes into this `lines` array above the keyboard.

**Escaping — reuse, do not duplicate** (lines 14-19). It is currently
module-private; export it (a one-line change) and import it in
`planning-renderers.ts`:

```typescript
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
```

**Member labels — reuse `memberLabel` / `sortRosterMembers`** (lines 29-60) for
the review step's participant list. `memberLabel` already carries the
`Telegram user ••••NNNN` fallback that threat T-01-21 requires; a full numeric
Telegram ID must never reach chat text.

---

### `src/telegram/planning-handlers.ts` (controller, event-driven)

**Analog:** `src/telegram/roster-handlers.ts`

**Imports + dependency interface** (lines 1-57):

```typescript
import type { CommandContext, Context, InlineKeyboard } from "grammy";
import { CallbackActionKind, type PrismaClient } from "../generated/prisma/client.js";
import { AuthorizationService } from "../domain/auth/authorization-service.js";
import { createCallbackToken, parseRosterRemovalTarget, type ActionContext } from "../shared/callback-schema.js";
import type { SafeLogger } from "../shared/logger.js";
import type { CallbackActionRow, CallbackContext } from "./callbacks.js";
import type { ChatReadinessRouteId } from "./handlers.js";

const CALLBACK_STALE = "This action is no longer available. Open /settings or /roster and try again.";
const ALREADY_APPLIED = "Already applied.";
const SAVE_FAILED = "I couldn't save that change. Please try again.";

export interface RosterHandlerDependencies {
  logger: SafeLogger;
  prisma: PrismaClient;
  authorization: AuthorizationService;
  roster: RosterService;
  now: () => Date;
}
```

Copy: module-level copy constants at the top (`ALREADY_APPLIED` is the required
duplicate-tap text), a `*HandlerDependencies` interface carrying
`logger / prisma / authorization / <service> / now: () => Date` (the injected
clock is mandatory — no `new Date()` in handlers).

**Bounded catch-site vocabulary + `err`-bound failure log** (lines 71-112). Every
absorbed failure must land here; a caught value bound under any key other than
`err` is unloggable (the redactor renders only `err` structurally):

```typescript
const ROSTER_CATCH_SITES = {
  retryAction: { outcome: "retry-action-unavailable" },
  projection: { outcome: "roster-projection-failed" },
  add: { outcome: "roster-add-failed" },
  delivery: { outcome: "telegram-delivery-failed" },
} as const;

function logRosterFailure(deps, site, route: ChatReadinessRouteId, context: ActionContext, error: unknown) {
  deps.logger.error(
    { event: HANDLER_FAILURE_EVENT, route, chatId: context.chatId, actorId: context.actorId, outcome: site.outcome, err: error },
    "Roster surface absorbed a failure",
  );
}
```

**Dispatcher shape** (lines 368-430) — the exact signature and the parse-first,
answer-stale-first structure planning's `dispatchPlanningCallback` must copy:

```typescript
export async function dispatchRosterCallback(
  ctx: CallbackContext,
  deps: RosterHandlerDependencies,
  context: ActionContext,
  action: CallbackActionRow,
  now: Date,
) {
  const target = parseRosterRemovalTarget(action.targetId);
  if (!target.success) {
    await ctx.answerCallbackQuery({ text: CALLBACK_STALE, show_alert: true });
    return;
  }
  ...
  if (target.data.action === "request") {
    const result = await deps.roster.beginRemoval(context.chatId, context.actorId, action.token, now);
    if (result.kind === "confirmation") {
      const projection = renderRemovalConfirmation(result.member);
      await ctx.editMessageText(projection.text, {
        parse_mode: "HTML",
        reply_markup: rosterRemovalConfirmationKeyboard(result.removeToken, result.keepToken),
      });
```

Note: the dispatcher **answers the callback from the branch that owns the
outcome** — never at the top (F-3). Every `result.kind` must have a branch;
`duplicate` answers `Already applied.` with no second transition.

**Projection type** (lines 114-119) — `Readonly<{ kind; text; keyboard? }>`; the
card is emitted only when fully bound. Planning's step projections copy this.

**In-place card edit** (`src/telegram/settings-handlers.ts:472-478`) — the exact
`editMessageText` call shape for D-01:

```typescript
  await ctx.api.editMessageText(
    context.chatId.toString(),
    inFlight.message_id,
    "<b>Time zone found</b>\nChoose a time zone before reviewing the change.",
    { parse_mode: "HTML", reply_markup: keyboard },
  );
```

Positional `chatIdString, messageId, text, options`. Wrap with the Pitfall 3
guard: compare the newly rendered `{ text, reply_markup }` against the last
render and skip the call when identical; additionally treat a `GrammyError`
whose `description` contains `message is not modified` as success.

---

### `src/telegram/handlers.ts` (route, request-response) — modified

**Analog:** `CHAT_READINESS_ROUTES` (lines 86-182) and `bot.command("setup")`
(lines 358-379), same file.

**Route-table entry shape and the load-bearing `protectedWhen`** (lines 86-125):

```typescript
export type ChatReadinessRoute = Readonly<{
  id: ChatReadinessRouteId;
  kind: ChatReadinessRouteKind;
  filter: string;
  surface: "setup" | "settings" | "roster";
  protectedRoute: true;
  protectedWhen: ChatReadinessProtection;
}>;

export const CHAT_READINESS_ROUTES: readonly ChatReadinessRoute[] = [
  { id: "command:setup", kind: "command", filter: "setup", surface: "setup", protectedRoute: true, protectedWhen: "always" },
  ...
  { id: "update:message:text", kind: "update", filter: "message:text", surface: "setup", protectedRoute: true, protectedWhen: "in-flight" },
```

Its doc comment states the invariant: conflating `always` with `in-flight` is
finding F-7. Phase 2 adds `surface: "planning"` and a third dimension,
`authority` (RESEARCH Pattern 6), plus a combined `ALL_ROUTES` for the bounded
route-id resolver so `chatReadinessRouteId` (lines 195-201) still proves at run
time that every emitted label is a table member. Phase 2 registers **no** new
`message:text` / `message:location` route (avoids deferred item N-6).

**Command-handler skeleton** (lines 358-379):

```typescript
  bot.command("setup", async (ctx) => {
    const updateId = ctx.update.update_id;
    const context = actionContext(ctx.chat?.id, ctx.from?.id);
    if (context === undefined) {
      logRoute(services, "command:setup", updateId, "unresolved-context");
      if (ctx.chat !== undefined) await ctx.reply(COMMAND_DENIAL);
      return;
    }
    if (!(await authorize(services, context))) {
      logRoute(services, "command:setup", updateId, "denied", context);
      await ctx.reply(COMMAND_DENIAL);
      return;
    }
    logRoute(services, "command:setup", updateId, "authorized-and-dispatched", context);
    await handleSetupCommand(ctx, services, context);
  });
```

`/plan` copies this exactly but substitutes `canStartPlanning({ currentRole, policy,
wasPreviousParticipant })` for `authorize(...)`, and denial is a **concise group
reply** (D-13 of Phase 1), not a private alert. `/plan_status` uses a
`chat-member` check, fail-closed on an unavailable lookup, plus the
`lastStatusPostedAt` cooldown (Pitfall 8) — it must never be a silent branch.

**Outcome vocabulary** (lines 220-229) — extend, do not free-form:

```typescript
export const CHAT_READINESS_ROUTE_OUTCOMES = [
  "authorized-and-dispatched",
  "denied",
  "no-in-flight-action",
  "unresolved-context",
  "timezone-resolution-requested",
] as const;
```

---

### `src/telegram/callbacks.ts` (middleware, request-response) — modified

**Analog:** itself. This is the highest-risk edit in the phase; the surrounding
code is the specification.

**Current route type to extend** (lines 62-66):

```typescript
/** One feature surface's dispatch entry, keyed by the stored action kind. */
export type CallbackRoute = Readonly<{
  staleText: string;
  dispatch: CallbackDispatcher;
}>;
```

Add `authority: "current-admin" | "route-resolved"` and
`actorBinding: "strict" | "route-resolved"`. Every existing Phase 1 route
declares `"current-admin"` / `"strict"` and must be observably unchanged.

**The unconditional pre-parse denial that must be restructured** (in the
`bot.on("callback_query:data", ...)` body):

```typescript
      try {
        await deps.authorization.requireCurrentAdministrator(context.chatId, context.actorId);
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) throw error;
        logCallbackBranch(deps, updateId, CALLBACK_BOUNDARY_BRANCHES.denied, context);
        await ctx.answerCallbackQuery({ text: CALLBACK_DENIAL, show_alert: true });
        return;
      }
```

Replace with the non-destructive `currentRole()` lookup (still before parse and
before any durable read), keep the admin fast path identical, and move only the
*denial decision for non-admins* to after the kind is known — per RESEARCH
Pattern 5. Never call `requireCurrentAdministrator` from planning code: on denial
it runs `setupDraft.deleteMany` / `settingsEditDraft.deleteMany` (Pitfall 2).

**The stale/actor-binding check to split** (the `action.chatId !== context.chatId ||
action.actorUserId !== context.actorId || action.expiresAt <= now` branch): chat
binding and expiry stay at the boundary for all routes; only the actor comparison
is deferred to the dispatcher for `actorBinding: "route-resolved"`, so D-02 can
name the owning author.

**Single-shot acknowledgement guard — do not touch:**

```typescript
    const deliver = ctx.answerCallbackQuery.bind(ctx);
    let answered = false;
    (ctx as AnswerableContext).answerCallbackQuery = async (...args) => {
      if (answered) return true;
      answered = true;
      return deliver(...args);
    };
```

**Route registration** (`registerChatReadinessCallbacks`) — add
`[CallbackActionKind.PLANNING]: planningCallbackRoute(deps)` to the same
`exhaustive: true` registration. A **second** `registerCallbackBoundary` is
unreachable: `unresolved()` calls `next()` only when `!options.exhaustive`.

**Extracted-route helper to copy** (`rosterCallbackRoute`):

```typescript
export function rosterCallbackRoute(deps: RosterHandlerDependencies) {
  return {
    staleText: GENERIC_STALE_TEXT,
    dispatch: (ctx, context, action, now) => dispatchRosterCallback(ctx, deps, context, action, now),
  } satisfies CallbackRoute;
}
```

---

### `src/domain/auth/authorization-service.ts` (service, request-response) — modified

**Analog:** `requireCurrentAdministrator` in the same file (lines 117-155). Add a
sibling `currentRole()`; leave the original untouched.

Copy the try/catch and the `logFailure` call; drop the two `deleteMany` calls and
return `"unknown"` instead of throwing:

```typescript
    try {
      role = await this.membershipGateway.getCurrentRole(chatId, actorId);
    } catch (error) {
      this.logFailure(AUTHORIZATION_CATCH_SITES.membershipLookup, chatId, actorId, error);
      throw new PermissionDeniedError();   // planning variant: return "unknown"
    }
```

`canStartPlanning` already denies `"unknown"` (`isCurrentMember` accepts only
`creator | administrator | member | restricted`, and the `default:` branch
returns `false`) — so returning `"unknown"` is fail-closed.

---

## Shared Patterns

### Structured logging (apply to every new file that catches or branches)
**Source:** `src/shared/logger.ts:21-52`, `src/telegram/roster-handlers.ts:94-112`

The redactor is an **allow list**. Already permitted and usable:
`chatId, actorId, targetId, updateId, messageId, actionId, draftId, membershipId,`
**`roundId`**, `jobId`, `actionKind, callbackKind, route, command, field, event,`
`outcome, reason, status, signal, revision, expectedRevision, attempt, count, page,`
`pageCount, durationMs`.

Not allowed and NOT to be added casually: `weekday`, `minute`, `date`, `weekStart`,
`timezone` (a location proxy — deliberately excluded by T-01-21-03). Prefer bounded
classifications (`step`, `outcome`, `reason`) over values. An allow-listed key
holding an **object** is redacted, not walked (T-01-21-02). The caught error goes
under `err` and nowhere else.

Every terminating branch — including deliberate no-ops — must emit an
event/outcome/reason triple; a silent return is finding F-4.

### Callback boundary contract
**Source:** `src/telegram/callbacks.ts` (branch table `CALLBACK_BOUNDARY_BRANCHES`)
**Apply to:** every planning callback path

Order is the contract: fresh role → parse `v1:<uuid>` → load the `CallbackAction`
row → per-kind authority → dispatch. Nothing in the token is ever authority. The
one honoured `answerCallbackQuery` belongs to the branch that owns the outcome.

### Exactly-once / duplicate taps
**Source:** `RosterService.removeConfirmed` (`roster-service.ts:328-336`)
**Apply to:** every planning transition and Confirm

`updateMany({ where: { token, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } })`
then `count !== 1 → "duplicate"` → answer `Already applied.` with no second
transition.

### Optimistic concurrency
**Source:** `settings-service.ts:408-419`
**Apply to:** `PlanningRound` step transitions, takeover, re-anchor, confirm

`where: { id, revision: expectedRevision }` + `data: { revision: { increment: 1 } }`
+ `count !== 1 → "stale"/"conflict"`.

### Keyboard row split + label width
**Source:** `keyboards.ts:44-60` (F-9 comment), pinned by `tests/unit/schedule-settings.test.ts`
**Apply to:** day selector, slot selector, review controls

Declared row constants, ≤ 24 visible characters per label including the D-08
emoji prefix, serialized shape asserted in a unit test.

### Injected clock
**Source:** `now: () => Date` on every `*HandlerDependencies`; `now: Date` on every service method
**Apply to:** all planning files. No `new Date()` / `Date.now()` inside handlers,
services, or renderers — required for deterministic DST and past-boundary tests.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/infrastructure/time/civil.ts` (arithmetic core) | utility | transform | No civil-date arithmetic exists in the repo. Its *shape* follows `schedule-validator.ts` (pure, no I/O, closed result unions), but the body is new. Use `02-RESEARCH.md` Pattern 1/Pattern 4 and Pitfall 4. |
| `src/domain/planning/target-week.ts` (`weekIsClaimed` seam) | utility | transform | No week-claim concept exists yet. Policy-function *shape* from `planning-access-service.ts`; the predicate itself is new and is the single Phase 4 extension point (LIFE-02/LIFE-06). |

Both are pure, dependency-free, and fully unit-testable — the lowest-risk place
in the phase for original code.

---

## Metadata

**Analog search scope:** `src/app`, `src/domain`, `src/infrastructure`,
`src/shared`, `src/telegram`, `prisma`, `tests`
**Files scanned:** 20 source files read (excluding `src/generated/prisma/**`)
**Pattern extraction date:** 2026-08-30
