# Phase 05: Proactive Reliable Reminders - Pattern Map

**Mapped:** 2026-09-13
**Scope:** Proposed research file map, existing integration seams, and verification. New paths and symbols below are proposals, not existing APIs.

## File Classification

Rows group tightly coupled edit targets where they share an assignment. Migration timestamp and queue provisioning filename must be chosen by the planner.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| Add `src/domain/reminders/reminder-policy.ts` | utility | transform | `src/domain/planning/target-week.ts`, planning-service availability projection | role-match |
| Add `src/domain/reminders/reminder-occurrences.ts` | utility | transform | `src/domain/planning/slot-generator.ts` | exact |
| Add `src/domain/reminders/reminder-service.ts` | service | CRUD | `src/domain/planning/planning-service.ts` | exact for transactions; new ledger semantics |
| Add `src/infrastructure/jobs/reminder-queue.ts` | service | event-driven | None | none |
| Add `src/app/reminder-runtime.ts`; edit `src/app/main.ts` | service | event-driven | `src/app/main.ts` | role-match |
| Edit `src/app/create-bot.ts`; proposed shared coordination utility | middleware | event-driven | `create-bot.ts` and migration keys | role-match; shared worker entry is new |
| Add `src/telegram/reminder-delivery.ts` | service | request-response | `src/telegram/planning-handlers.ts` publication/recovery | role-match; uncertain send policy is new |
| Add `src/telegram/reminder-renderers.ts` | utility | transform | `src/telegram/planning-renderers.ts` | exact |
| Edit `src/shared/callback-schema.ts`, `src/telegram/callbacks.ts`, `src/telegram/handlers.ts` | route | request-response | Existing PLANNING route | exact |
| Edit `src/domain/chat/settings-service.ts`, `setup-service.ts`; related persistence types | service | CRUD | Existing guarded save transactions | exact |
| Edit `src/domain/planning/planning-service.ts`, `src/telegram/planning-handlers.ts` | service/controller | CRUD / request-response | Existing lifecycle and anchor methods | exact |
| Edit `src/domain/chat/migration-service.ts`, `src/app/recover-chat-migration.ts` as needed | service | batch | Existing chat migration | exact |
| Edit `prisma/schema.prisma`; add `prisma/migrations/<timestamp>_reminders/migration.sql` | model/migration | CRUD | Existing planning schema and committed migrations | exact |
| Edit `prisma/migrate-deploy.mjs`; add reviewed queue provisioning artifact | migration | batch | Explicit migration catalog/preflight | role-match; queue schema has no analog |
| Edit dependency manifest/lock, Docker/deployment migration wiring, `vitest.config.ts` if needed | config | batch | Existing files | exact edit targets |
| Add unit `reminder-policy`, `reminder-occurrences`, `reminder-renderers`, `reminder-delivery` tests | test | transform / request-response | Target-week, slot-generation, availability-card, planning-recovery suites | exact/role-match |
| Add integration `reminder-lifecycle`, `reminder-idempotency`, `reminder-recovery`, `reminder-settings`, `reminder-queue` tests | test | CRUD / event-driven | `tests/integration/planning-recovery.test.ts`, PostgreSQL helper | role-match |
| Edit `tests/integration/chat-migration.test.ts`, `migration-preflight.test.ts`; callback/route unit suites | test | batch / request-response | Existing files | exact |

## Pattern Assignments

### Calendar policy and occurrence generation

Copy the pure input/output structure from `src/domain/planning/slot-generator.ts:73–89`:

```typescript
export function slotAvailability(
  timezone: string,
  date: CivilDate,
  startMinute: MinuteOfDay,
  now: Date,
): SlotAvailability {
  const resolved = resolveWallClock(
    timezone,
    date.year,
    date.month,
    date.day,
    startMinute,
  );
  if (resolved.kind === "skipped") return "nonexistent";
  return resolved.instantMs <= now.getTime() ? "past" : "available";
}
```

Imports in that file, lines 1–7, use relative `.js` module paths, `import type`, shared `CivilDate` / `MinuteOfDay`, and the existing time adapter. Reminder generation should use those types and `resolveWallClock` instead of offset arithmetic. Define reminder-specific occurrence/grace/cutoff outcomes; slot availability's `<= now` is not a substitute for the reminder recovery policy. Record DST gap/overlap policy from research explicitly.

`target-week.ts` supplies civil week arithmetic, but its manual search and week-claim predicate are deliberately insufficient for proactive eligibility: drafts suppress reminders, next week waits until Monday, and cancellation has a durable quiet period.

### Ledger, lifecycle hooks, and authoritative participant state

Strong analog: `src/domain/planning/planning-service.ts:1390–1450`. Existing `replanRound(chatId, actorId, callbackToken, expectedRevision, now, resolveRole): Promise<ReplanResult>` resolves Telegram role before entering a transaction, then validates token identity, exact round and revision, and participants inside it. Its concurrency primitive is concrete:

```typescript
// planning-service.ts:1415–1419
await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${target.data.roundId}, 0))`;
const round = await tx.planningRound.findUnique({
  where: { id: target.data.roundId },
});
```

Use compatible lock ownership/order for reminder claims against the same round. A unique occurrence row alone cannot serialize two different occurrences' shared spacing reservation. Claim and reserve spacing atomically, commit, then perform HTTP; no Telegram request inside a database transaction.

Reuse this existing pure derivation (`planning-service.ts:757–765`):

```typescript
export function availabilityOutcome(
  participants: readonly Readonly<{ marker: ParticipantMarker }>[],
): AvailabilityOutcome {
  if (participants.length === 0) return "collecting";
  if (participants.some((cell) => cell.marker === "unavailable"))
    return "blocked";
  if (participants.some((cell) => cell.marker === "pending"))
    return "collecting";
  return "all-available";
}
```

Do not infer pending recipients from current roster or an incomplete count alone. Use exact round snapshot and existing marker conversion/projection. Cancellation suppression belongs in the durable lifecycle transaction; checking only existing round status later loses the quiet-week fact.

### Saved schedule generation hooks

`SettingsService` uses a narrow persistence interface (`settings-service.ts:17–20`):

```typescript
type SettingsPersistence = Pick<
  PrismaClient,
  "settingsEditDraft" | "chatConfiguration" | "callbackAction" | "$transaction"
>;
```

`saveChange` starts at line 362; its transaction begins at 369, guarded configuration update is at 411, action consumption at 420, and typed abort handling at 434. Put reminder generation/cutoff mutation inside this same successful transaction. Extend the narrow persistence contract and fakes when additional delegates are needed. Preserve duplicate/conflict rollback semantics. Schedule edits create only future work and retain publication/spacing state.

`SetupService.saveConfiguration` begins at line 303, transaction at 317, initial configuration creation/update branch before line 379's callback consumption. Add activation boundary there, including the first setup midweek case. Do not implement activation solely as a handler callback after commit.

### Callback routing, authorization, and shared chat coordination

Existing composition (`src/app/create-bot.ts:65–66`):

```typescript
bot.use(sequentialize(migrationKeys));
bot.use(migrationBoundary(deps.prisma, deps.now));
```

The worker must enter the same effective chat coordination as updates, including old/new chat identities for migration. A separate worker-local mutex does not coordinate with this middleware. Factor/inject a shared coordinator if necessary, retaining migration ordering and database guards. This is a proposed integration seam, not an existing callable worker lock.

Callback route declaration (`src/telegram/callbacks.ts:503–515`):

```typescript
export function planningCallbackRoute(deps: PlanningHandlerDependencies) {
  return {
    staleText: PLANNING_STALE_TEXT,
    nonMemberText: PLANNING_NON_MEMBER_DENIAL,
    authority: "route-resolved",
    actorBinding: "route-resolved",
    dispatch: (
      ctx: CallbackContext,
      context: ActionContext,
      action: CallbackActionRow,
      now: Date,
    ) => dispatchPlanningCallback(ctx, deps, context, action, now),
  } satisfies CallbackRoute;
}
```

The exhaustive registration is `callbacks.ts:519–548`; add any new callback kind to that same registration. The existing boundary checks chat/expiry at 418–436 and guarantees fallback acknowledgement in `finally` at 447–476. Keep exactly one acknowledgement and do not attach a second unreachable boundary.

**Critical authorization seam:** `handlePlanCommand` at `planning-handlers.ts:1820–1830` calls `startOrResume` directly. Current-policy authorization is upstream in `handlers.ts:592–640`, using `canStartPlanning`, current Telegram role, current saved policy and previous-participant lookup. A reminder callback must preserve this gate before reusing the planning entry; admitting a current chat member at the callback boundary alone is insufficient. The Start button is public, not bound to its original publisher actor, but its durable chat/target/expiry and current clicker's permissions still apply.

### Rendering, publication acknowledgement, and current-card navigation

`planning-renderers.ts:1–50` imports domain projection types, civil helpers and existing label helpers; lines 52–58 document pure rendering with no clock, token minting or I/O. Keep reminder renderer equally pure. Pending mentions require escaped labels or Telegram entities and real user identities; ordinary card labels must remain ordinary card labels. Basic-group reply navigation and supergroup URLs have distinct research policies.

Publication integration is `dispatchConfirm` (`planning-handlers.ts:2289–2357`). It commits `planning.confirm(...)` before:

```typescript
// planning-handlers.ts:2336–2342, abbreviated arguments below this range
await editAnchor(
  ctx,
  deps,
  context,
  result.round,
  renderAvailabilityCard(
```

The existing call absorbs failed edit delivery and returns without a durable publication acknowledgement. An anchor can refer to the earlier review card. Add an explicit successful availability-publication acknowledgement path; do not use confirmation or existing anchor creation time as proof of publication. Failed publication recovery must establish the first reliable grace boundary.

`repostAnchor` starts at line 1629 and distinguishes `slot?: RepostSlot` from `card?: "availability" | "announcement"` at 1651–1655. It selects `announcementMessageId` versus `anchorMessageId` at 1680–1683. A reminder must link/reply to the current availability anchor, never accidentally to the separate announcement. Reanchoring must preserve this distinction and not manufacture historic publication time.

The new reminder delivery policy cannot copy every announcement retry behavior: unknown outcomes are terminal for that occurrence. Persist accepted/known rejection/uncertain outcomes and reserve spacing for potentially delivered sends. Existing service result unions and safe logging are useful structural analogs, not proof that those delivery semantics already exist.

### Runtime, migrations, and deployment ownership

`main.ts:26–48` builds config, redacted logger, Prisma, membership gateway and injected `now`. Add reminder runtime through the same composition. Existing shutdown (`main.ts:72–80`) is:

```typescript
void runner
  .stop()
  .then(() => prisma.$disconnect())
  .then(() => {
    logger.info("Telegram runner and Prisma pool stopped");
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
```

Extend ordering to stop new claims and drain/record in-flight reminder work before disconnecting Prisma. Start/recovery should fail visibly when required schema is unavailable. There is no current pg-boss adapter to copy; use research's pinned API guidance and explicit dependency checkpoint. Queue construction/migration belongs to the migration stage, not implicit runtime DDL.

`prisma/migrate-deploy.mjs:11–21` names reviewed migrations, and lines 22–40 describe exact chat configuration columns including reminder minutes, revision and timestamp types. Extend migration catalog/preflight alongside actual SQL and schema; do not merely add Prisma fields. Queue schema ownership/provisioning is a new contract requiring explicit fresh/upgrade/second-deploy tests.

`migration-service.ts` starts its transaction at 22; table moves are explicit at 66–104, including configuration, memberships, rounds, drafts and callbacks. Transfer/invalidate new reminder state in that transaction and preserve canonical-chat tombstone behavior. Old queue payloads must not continue delivery to the source chat after migration; anchor clearing requires publication/navigation recovery.

### Test assignments

Use existing target-week/slot-generation/zoned-clock suites for deterministic calendar boundaries and availability-card suites for pure presentation. `tests/integration/planning-recovery.test.ts:35–43` supplies the real-database/recreated-composition pattern:

```typescript
import {
  createChatConfiguration,
  createClock,
} from "../fakes/chat-readiness.js";
import {
  type PostgresTestContainer,
  startPostgresTestContainer,
} from "../helpers/postgres.js";
import { withDirectPlanningRoundInterference } from "../helpers/racing-client.js";
```

`tests/helpers/postgres.ts:31–35` applies real committed migrations:

```typescript
export async function applyCommittedMigrations(databaseUrl: string) {
  await runPrisma(["migrate", "deploy"], databaseUrl);
  await runPrisma(["migrate", "status"], databaseUrl);
}
```

Its `startPostgresTestContainer(setup = { mode: "all" })` at 107 supports `none` and `before` modes for migration upgrades. Extend migration-stage queue setup intentionally; the current helper executes Prisma migrations only. Durable tests must recreate runtime/service against the same database, not only instantiate a new in-memory fake. Cover competing occurrence rows, accepted-send/outcome-write failure, and worker/update coordination in addition to duplicate same-row claims.

## Shared Patterns

- Relative `.js` imports and `import type`; injected `now`, Prisma and safe logger.
- Tagged result unions for stale/duplicate/conflict outcomes; throw typed aborts when partial transactional writes must roll back.
- Current authorization at action boundaries; opaque database-backed callback identity.
- SQL locks/revision predicates protect durable state; single-process coordination also covers publication and update/worker interleaving.
- Domain commit and Telegram effect are separate; record delivery uncertainty explicitly.
- English project documentation; Telegram Web acceptance work uses the existing project UAT skill and real controls.

## No Analog Found

| File / capability | Role | Data Flow | Reason |
|---|---|---|---|
| `reminder-queue.ts` | service | event-driven | No existing durable queue adapter |
| Reviewed pg-boss schema provisioning | migration | batch | Existing preflight handles application migrations; queue lifecycle is new |
| Unknown-send occurrence ledger and coalescing | service | CRUD | Existing guarded transitions help, but do not implement D-11/D-12 |
| Shared worker/update coordinator entry | middleware | event-driven | Existing sequentialization is attached to Telegram middleware |

## Metadata

**Analog search scope:** `src/app`, `src/domain`, `src/infrastructure/time`, `src/shared`, `src/telegram`, `prisma`, `tests`.
**Strong pattern families:** calendar transforms, guarded planning transactions, callback/publication handling, composition/migration, database recovery tests.
**Extraction:** concrete excerpts and integration line references checked against working tree on 2026-09-13. No source edits or external research performed. Counts are grouped assignments above, not an asserted final implementation file count.
