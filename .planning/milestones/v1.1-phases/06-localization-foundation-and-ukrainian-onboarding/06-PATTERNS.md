# Phase 6: Localization Foundation and Ukrainian Onboarding - Pattern Map

**Mapped:** 2026-09-16
**Scope:** LANG-01–05, TEXT-01, L10N-01. Research explicitly skipped. Prospective new filenames below are planning suggestions, not existing modules. Preserve the existing dirty workspace.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `prisma/schema.prisma` | model | CRUD | Its `ChatStatusCooldown` model, lines 97–113 | exact |
| `prisma/migrations/<timestamp>_chat_preferences/migration.sql` | migration | batch | Existing committed migrations | role-match |
| `prisma/migrate-deploy.mjs` | utility | batch | Existing catalog/preflight implementation | exact |
| `src/domain/chat/language-service.ts` (new) | service | CRUD | `src/domain/chat/setup-service.ts` | role-match |
| `src/domain/chat/migration-service.ts` | service | CRUD | Its existing atomic chat transfer | exact |
| `src/shared/i18n/types.ts` (new) | model | transform | Renderer readonly input/output types | role-match |
| `src/shared/i18n/en.ts` (new) | config | transform | No typed catalog exists | none |
| `src/shared/i18n/uk.ts` (new) | config | transform | No typed catalog exists | none |
| `src/shared/i18n/index.ts` (new) | utility | transform | `src/telegram/renderers.ts` pure projections | role-match |
| `src/shared/i18n/format.ts` (new, if needed) | utility | transform | Existing `formatLocalTime` use in renderers | role-match |
| `src/telegram/renderers.ts` | component | transform | Existing setup/settings projections | exact |
| `src/telegram/keyboards.ts` | component | transform | Existing label/action separation | exact |
| `src/telegram/setup-handlers.ts` | controller | request-response | Existing setup route | exact |
| `src/telegram/settings-handlers.ts` | controller | request-response | Existing settings route | exact |
| `src/telegram/roster-renderers.ts` | component | transform | Existing safe roster rendering | exact |
| `src/telegram/roster-handlers.ts` | controller | request-response | Existing roster route | exact |
| `src/telegram/callbacks.ts` | middleware | request-response | Existing single callback boundary | exact |
| `src/shared/callback-schema.ts` | utility | transform | Existing Zod discriminated targets | exact |
| `src/telegram/handlers.ts` | route | request-response | Existing composed registration | exact |
| `src/app/create-bot.ts` | provider | event-driven | Existing dependency composition | exact |
| `src/app/main.ts` | provider | event-driven | Existing runtime composition | exact |
| `src/domain/chat/setup-service.ts` | service | CRUD | Its actor-scoped resume | exact |
| `src/telegram/migration-handler.ts` (review; change if needed) | middleware | event-driven | Existing migration interception | exact |
| `tests/unit/localization.test.ts` (new) | test | transform | `tests/unit/roster-rendering.test.ts` | role-match |
| `tests/unit/language.test.ts` (new) | test | request-response | Existing setup/settings/callback tests | role-match |
| `tests/integration/chat-language.test.ts` (new) | test | CRUD | `tests/integration/chat-configuration.test.ts` | role-match |
| `tests/integration/chat-migration.test.ts` | test | CRUD | Existing migration suite | exact |
| `tests/integration/migration-preflight.test.ts` | test | batch | Existing migration/preflight suite | exact |
| `tests/unit/setup.test.ts` | test | request-response | Existing setup suite | exact |
| `tests/unit/settings.test.ts` | test | request-response | Existing settings suite | exact |
| `tests/unit/settings-dashboard-keyboard.test.ts` | test | transform | Existing layout suite | exact |
| `tests/unit/roster-rendering.test.ts` | test | transform | Existing hostile-name and navigation suite | exact |
| `tests/unit/roster-add.test.ts` | test | request-response | Existing add route suite | exact |
| `tests/unit/roster-remove.test.ts` | test | request-response | Existing confirmation suite | exact |
| `tests/unit/callback-authority.test.ts` | test | request-response | Existing authority/ack suite | exact |
| `tests/unit/timezone-prompt-copy.test.ts` | test | transform | Existing privacy-mode prompt contract | exact |
| `tests/fakes/chat-readiness.ts` | utility | CRUD | Existing fake dependencies | exact |

37 candidate files: 27 exact/self analogs, 8 role matches, 2 without catalog analogs. The planner should collapse or rename suggested modules where appropriate and include additional touched call-site tests in each plan's file list. A self analog means extend the existing implementation rather than replacing its behavior.

## Pattern Assignments

### Independent persistence and migration

**Apply to:** schema, preference migration, language service, migration service, database tests.

**Analog:** `prisma/schema.prisma`, lines 106–113. An independent chat-keyed model already exists before configuration:

```prisma
model ChatStatusCooldown {
  chatId       BigInt   @id @map("chat_id")
  lastPostedAt DateTime @map("last_posted_at") @db.Timestamptz(3)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  @@map("chat_status_cooldowns")
}
```

Copy the independent key and naming conventions, not cooldown semantics. Do not require a `ChatConfiguration` FK or create placeholder configuration. The design must distinguish implicit English from explicit English selection so first setup can ask once while repeated setup can resume. Existing configured groups should retain English and have a deliberate setup-routing rule.

**Imports/dependency style:** `src/domain/chat/setup-service.ts`, lines 1–7:

```ts
import {
  PlanningAccessPolicy,
  SetupStep,
  type PrismaClient,
} from "../../generated/prisma/client.js";
import { parseSetupTarget } from "../../shared/callback-schema.js";
import { validateSchedule } from "./schedule-validator.js";
```

Use `.js` specifiers, generated Prisma types, injected persistence, explicit bigint chat IDs and clocks. Its lines 20–24 narrow persistence with `Pick<PrismaClient, ...>`; use that seam for preference unit tests. Language writes must not call the schedule activation/change functions imported at lines 8–11 or increment configuration revisions.

**Atomic identity transfer:** `src/domain/chat/migration-service.ts`, lines 22–30:

```ts
return prisma.$transaction(
  async (tx) => {
    // Rare administrative transition. Lock all affected tables in one order so
    // concurrent setup/roster/recovery cannot create target state mid-transfer.
    await tx.$executeRaw`LOCK TABLE chat_migrations, chat_configurations,
    chat_memberships, planning_rounds, planning_participants, setup_drafts,
    settings_edit_drafts, callback_actions, chat_status_cooldowns,
    chat_reminder_states, reminder_occurrences
    IN SHARE ROW EXCLUSIVE MODE`;
```

Add preferences to this transaction's lock, destination-conflict assessment and transfer. Lines 39–46 recognize duplicate migration pairs; lines 48–67 reject conflicting destination state. Follow that fail-closed behavior for conflicting preferences rather than silently overwriting an administrator's selection. Lines 179–191 move setup/settings drafts and expire old-message callback tokens. Preserve this existing identity-transition behavior; language-only changes themselves must not invalidate tokens or drafts.

`src/telegram/migration-handler.ts`, lines 39–41 already invokes this service on migration events. Lines 43–55 suppress delayed old-chat updates. Preference-only migration must work without a configuration row. Keep old-message callbacks stale, and avoid introducing preferences at an old tombstoned ID.

### Explicit-locale rendering and catalog files

**Apply to:** new i18n modules, renderers, keyboards, roster renderers, localization unit tests.

**Analog:** `src/telegram/renderers.ts`, lines 27–30 and 71–76:

```ts
export type SetupProjection = Readonly<{
  text: string;
  buttons?: readonly (readonly SetupKeyboardButton[])[];
}>;

/** Renders only a fully validated draft; partial setup values never enter review. */
export function renderSetupReview(draft: CompleteSetupReview): SetupProjection {
  return {
    text: ["<b>Review configuration</b>", ...reviewLines(draft)].join("\n"),
    buttons: SETUP_REVIEW_BUTTONS,
  };
}
```

Keep pure data-to-projection functions and add explicit locale inputs. Both text and button factories must use the same resolved locale. Build complete phrase entries with typed parameters; avoid concatenating translated fragments and do not retain module-level English button constants as the only rendering path. There is no existing typed bilingual catalog to copy: define one shared key/parameter contract and check both catalogs against it.

`renderers.ts` lines 119–123 currently render only an instruction for `not-configured`; replace that projection with language, the bilingual `Мова / Language` entry, and Continue setup. Do not pass partial configuration into `renderSettingsDashboard`, whose input requires complete schedule values (lines 91–100).

`renderers.ts` lines 58–68 centralize review lines, making them the insertion point for the localized language row. Its lines 246–281 select setup prompts from persisted values; keep those state predicates independent of translations. Keep time values formatted through `formatLocalTime` and retain IANA strings verbatim.

Background acceptance can call the same catalog/renderer interface with an explicit locale and ordinary data, without constructing a grammY context. Full reminder-worker delivery wiring remains Phase 8; do not claim a context-free unit test proves delivery localization.

### Setup/settings/roster controller adaptations

**Apply to:** handlers, composition files, setup service, actor/draft tests.

**Analog:** `src/domain/chat/setup-service.ts`, lines 147–157:

```ts
async beginOrResume(chatId: bigint, actorId: bigint, now: Date) {
  const existing = await this.prisma.setupDraft.findUnique({
    where: { chatId_actorUserId: { chatId, actorUserId: actorId } },
  });

  if (existing !== null && existing.expiresAt <= now) {
    await this.prisma.setupDraft.delete({ where: { id: existing.id } });
  }

  return this.prisma.setupDraft.upsert({
```

Its create branch (lines 158–168) initializes schedule draft state with the current configuration revision; its update branch is only `update: { expiresAt: expiresAt(now) }` (line 172). Continue setup should reuse this actor-scoped behavior. Do not search for and take over another administrator's draft. Expired drafts restart, while language survives independently.

Handler pattern assignments are to each existing handler's own command, callback and text/location routes. Resolve language at the response boundary, including after awaited transitions, so an answer to an older-language prompt produces the current language. Add locale dependencies at both full composition and focused test registrations. Keep all existing outcome distinctions (expired, stale, duplicate, conflict, failed), and translate onboarding permission/error paths now.

The settings language action is an immediate durable mutation; do not reuse schedule edit confirmation/save semantics or bump their `expectedRevision`. Selecting the current language still validates the action, returns to settings, and performs no preference mutation or extra success feedback. Language selection must not invalidate a still-valid independent language screen from another administrator (D-14).

Roster rendering must preserve member identity, HTML escaping, truncation, stable pagination and callback targets. Translate heading, loading/empty/failure states, navigation and removal confirmation without adding a roster workflow. Keep command tokens unchanged.

### Callback schemas, authorization and acknowledgement

**Apply to:** language callbacks, shared callback schema, callback boundary, callback tests.

**Validation analog:** `src/shared/callback-schema.ts`, lines 195–202:

```ts
export function parseSetupTarget(targetId: string | null) {
  try {
    return setupTargetSchema.safeParse(
      targetId === null ? undefined : JSON.parse(targetId),
    );
  } catch {
    return setupTargetSchema.safeParse(undefined);
  }
}
```

Follow the existing Zod action-discriminated schema style, fixed supported locale values and malformed-JSON handling. `createCallbackToken` (lines 148–150) returns `v1:${randomUUID()}`; locale, return destination and action metadata belong in the durable target, not wire authority.

**Guard analog:** `src/telegram/callbacks.ts`, lines 295–299:

```ts
const role = await deps.authorization.currentRole(
  context.chatId,
  context.actorId,
);
const isAdministrator = role === "creator" || role === "administrator";
```

Register language routes with current-admin authority and preserve chat/actor/expiry/consumption checks. Lines 418–435 enforce chat binding, expiry and strict actor binding. Do not make a language revision into an additional validity requirement, which would violate D-14/D-15. Localized stale and denial text must be resolved when replying, rather than frozen in route registration constants.

**Acknowledgement analog:** `src/telegram/callbacks.ts`, lines 266–273:

```ts
const deliver = ctx.answerCallbackQuery.bind(ctx);
let answered = false;
(ctx as AnswerableContext).answerCallbackQuery = async (...args) => {
  if (answered) return true;
  const delivered = await deliver(...args);
  answered = true;
  return delivered;
};
```

The `finally` fallback (lines 447–455) sends a bare answer only if no branch answered. Reuse this exactly-once boundary. Do not add an eager acknowledgement that consumes the user's one feedback opportunity. Same-language selection may rely on the fallback.

### Tests and migration verification

**Apply to:** candidate test files above, fake persistence, preflight changes.

`tests/unit/roster-rendering.test.ts` lines 1–23 show Vitest, real grammY Bot, generated callback enums and production registration imports. Lines 25–27 inject fixed bigint IDs and a fixed clock. Extend established harnesses to assert rendered API payloads and durable callback bindings, not just catalog lookup implementation details.

Concrete navigation assertion pattern, lines 549–552:

```ts
expect(String(second.text)).toContain("Showing 21–21 of 21");
expectPageBinding(harness, second, sorted.slice(ROSTER_PAGE_SIZE));
expect(navigationToken(keyboardOf(second), "Next")).toBeUndefined();
expect(navigationToken(keyboardOf(second), "Previous")).toMatch(/^v1:/);
```

Repeat meaningful assertions for Ukrainian labels, retained English, hostile names and Telegram size limits. Tests must preserve the stable identity assertions while changing visible strings.

**Real database analog:** `tests/helpers/postgres.ts`, lines 31–34:

```ts
/** Applies the reviewed migration history; never uses schema push or implicit DDL. */
export async function applyCommittedMigrations(databaseUrl: string) {
  await runPrisma(["migrate", "deploy"], databaseUrl);
  await runPrisma(["migrate", "status"], databaseUrl);
```

Use committed migration history and existing Testcontainers helpers. The helper also supports `mode: "before"` with an exclusive migration cutoff (lines 15–18) for upgrade testing. Align migration preflight catalog expectations/ledger with the new schema rather than merely regenerating Prisma.

Required new behavioral cases: unconfigured English default and explicit English tracking; Ukrainian selection before setup; two independent groups; repeated setup and service reconstruction; preference-only migration and duplicate migration; nonadmin rejection; expired/consumed/foreign tokens; last valid explicit language selection wins; same-language no extra mutation/message but one ack; old-language text reply advances in current locale; open settings/roster confirmations remain valid; locale changes preserve schedule revisions, reminder generation/due times and domain rows.

## Shared Patterns

- Durable state is Prisma/PostgreSQL; pure renderer inputs do not infer locale from Telegram user/client language.
- Public callbacks carry opaque tokens; fresh authorization and stored target validation own authority.
- Preserve structured operational logs and existing failure classifications; localization applies to user-facing copy, not log identifier values.
- Keep language preference writes separate from configuration commits, draft invalidation and reminder rescheduling.
- Use explicit locale at rendering boundaries with safe dynamic names and unchanged commands/identifiers.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/shared/i18n/en.ts` | config | transform | Existing English copy is distributed across renderers/handlers; no typed message catalog exists. |
| `src/shared/i18n/uk.ts` | config | transform | No Ukrainian catalog or shared parameter contract exists. |

Research was intentionally skipped; the planner must specify the small typed catalog contract directly from approved context and existing TypeScript conventions. No external research dependency is implied.

## Metadata

**Search scope:** `src/telegram`, `src/domain/chat`, `src/shared`, `src/app`, `prisma`, `tests/unit`, `tests/integration`, `tests/helpers`.
**Primary analog families:** Independent chat-keyed persistence; actor-scoped setup service; pure projections; callback boundary/schema; existing Vitest/PostgreSQL harnesses.
**Source status:** Working tree, including pre-existing edits; line references describe the inspected files and may move during implementation.
**Pattern extraction date:** 2026-09-16.
