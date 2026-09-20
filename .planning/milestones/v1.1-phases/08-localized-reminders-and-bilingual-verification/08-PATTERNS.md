# Phase 8: Localized Reminders and Bilingual Verification - Pattern Map

**Mapped:** 2026-09-19
**Files classified:** 18 candidate implementation/verification files
**Analogs found:** 16 / 18 (14 exact, 2 role-match; 2 new inventory files lack a close analog)

This is the pattern-mapping step of the active plan-phase workflow. Research was explicitly skipped; no RESEARCH.md is assumed or created. Candidate new filenames below are planning suggestions, not existing files or locked product decisions. Existing behavior and Phase 8 context remain authoritative.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/telegram/reminder-renderers.ts` | component | transform | Existing functions in this file | exact |
| `src/domain/reminders/reminder-service.ts` | service | event-driven | Existing dispatch/reservation pipeline in this file | exact |
| `src/app/main.ts` | provider | event-driven | Existing reminder transport composition, lines 185–216 | exact |
| `src/infrastructure/jobs/reminder-queue.ts` (inspect; change only if needed) | service | event-driven | Existing queue integration | exact |
| `src/shared/i18n/index.ts` | model | transform | Existing `MessageParameters`, `MessageCatalog`, `renderMessage` | exact |
| `src/shared/i18n/en.ts` | config | transform | Existing typed English catalog | exact |
| `src/shared/i18n/uk.ts` | config | transform | Existing typed Ukrainian catalog | exact |
| `src/shared/i18n/planning-format.ts` | utility | transform | Existing civil-date and count helpers | exact |
| `src/telegram/presentation-locale.ts` (reuse; change only if needed) | utility | request-response | Existing durable resolver | exact |
| `tests/unit/reminder-renderers.test.ts` | test | transform | Existing reminder projection assertions | exact |
| `tests/unit/i18n.test.ts` | test | transform | Existing catalog parity and compile-only contracts | exact |
| `tests/unit/planning-format.test.ts` | test | transform | Existing formatting test suite | exact |
| `tests/integration/localized-reminders.test.ts` (new candidate) | test | event-driven | `tests/integration/reminder-followups.test.ts`, `tests/helpers/reminders.ts` | exact |
| `tests/integration/bilingual-workflow.test.ts` (new candidate; existing suites may instead be extended) | test | request-response | `tests/integration/localization-tracer.test.ts` | exact |
| `tests/fixtures/outbound-surfaces.ts` (new candidate) | config | batch | No maintained outbound inventory found | none |
| `tests/unit/outbound-surfaces.test.ts` (new candidate) | test | batch | No source-to-inventory completeness checker found | none |
| `Dockerfile` | config | batch | Existing final-runtime geo-tz smoke check, lines 39–45 | role-match |
| `.github/workflows/ci.yml` | config | batch | Existing image job, production-image `docker run` smoke | role-match |

The queue and locale resolver are explicit context references, but their existing behavior may need no edits. No migration or scheduling-model change is implied. Existing localized onboarding/planning/lifecycle suites are verification inputs; do not create a duplicate whole-workflow harness if those suites can carry the missing assertions.

## Pattern Assignments

### Reminder projections and formatting

**Targets:** `src/telegram/reminder-renderers.ts`, `src/shared/i18n/planning-format.ts`, their unit tests.

**Primary analog:** `src/telegram/reminder-renderers.ts` (lines 1–11, 24–108).

Imports use relative ESM `.js` paths and separate type imports:

```typescript
import type { AvailabilityParticipantCell } from "../domain/planning/planning-service.js";
import {
  escapeHtml,
  plainMemberLabel,
  sortRosterMembers,
} from "./roster-renderers.js";
```

Preserve pending filtering and result discrimination (lines 35–44):

```typescript
): FollowupRendered | { kind: "empty" | "unsendable" } {
  const pending = sortRosterMembers(
    input.participants.filter((p) => p.marker === "pending"),
  );
  if (pending.length === 0) return { kind: "empty" };
  if (
    !Number.isSafeInteger(input.anchorMessageId) ||
    input.anchorMessageId <= 0
  )
    return { kind: "unsendable" };
```

Preserve the bounded all-mentions loop (lines 69–79); substitute localized plain fallback labels where needed, but keep the established sort order and destinations:

```typescript
for (const labelLimit of [128, 64, 32, 16, 8, 1]) {
  const mentions = pending
    .map((p) => {
      const label = Array.from(plainMemberLabel(p))
        .slice(0, labelLimit)
        .join("");
      return `<a href="tg://user?id=${p.telegramUserId}">${escapeHtml(label)}</a>`;
    })
    .join(", ");
  const text = `${heading}${mentions}.\n${navigation}`;
  if (text.length <= 4096)
```

The final text assembly shown above is the replacement seam, not approved new copy. Its length check must include the translated heading, suffix and navigation. Retain basic-group `reply_parameters` with `allow_sending_without_reply: false` (lines 83–90), public/private supergroup path validation (lines 50–61), and empty/unsendable outcomes.

**Date analog:** `src/shared/i18n/planning-format.ts`, lines 77–83:

```typescript
export function formatPlanningDate(locale: Locale, date: CivilDate): string {
  const weekday = weekdayOf(date);
  const heading =
    locale === "uk" ? `${UK_WEEKDAYS[weekday][0]},` : WEEKDAY_LABELS[weekday];
  return `${heading} ${date.day} ${MONTHS[locale][date.month - 1]}`;
}
```

Reuse civil dates without host-timezone conversion. Add an appropriately scoped week-range helper for same-month and cross-month Ukrainian ranges; this exact range helper does not yet exist. Existing full Ukrainian weekdays are capitalized: D-06 needs a lowercase weekday inside its sentence, so explicitly account for that without changing previously accepted planning-card capitalization. Use the saved round timezone and range, not current chat scheduling settings. Preserve English wording unless a required formatting integration needs a documented narrow change.

### Durable delivery and runtime composition

**Targets:** reminder service, main composition, queue integration if needed, presentation-locale reuse.

**Primary analog:** `src/telegram/presentation-locale.ts`, lines 6–21; concrete caller in `src/telegram/planning-handlers.ts`, lines 378–383:

```typescript
const locale = await resolvePresentationLocale(
  deps.prisma,
  context.chatId,
  deps.logger,
);
return renderMessage(locale, key, undefined);
```

The resolver calls durable `LanguageService.resolve(chatId)`; on lookup error it logs `telegram.locale.failed` and returns its last-known/default presentation locale. This fallback is operational resilience, never proof of translation completeness and never authorization.

**Actual planning transport seam:** `src/app/main.ts`, lines 191–196:

```typescript
transport: async ({ chatId, targetWeek, callbackData }) => {
  const rendered = renderPlanningReminder(targetWeek, callbackData);
  const message = await bot.api.sendMessage(Number(chatId), rendered.text, {
    reply_markup: rendered.reply_markup,
  });
  return { messageId: message.message_id };
},
```

Thread a single resolved current locale through text and controls at actual render time. Do not merely modify the queue: the production planning renderer is called here. `ReminderMessage` currently contains chat ID, target week and callback data (`reminder-service.ts`, lines 258–265). Follow-ups instead render inside the service near line 683, before the `RESERVED` mutation near line 708, and the transport executes near line 784. Account for both distinct paths when selecting the injection boundary. Queue payloads must remain scheduling hints, not durable language authority.

**Preserve error classification:** `reminder-service.ts`, lines 41–48:

```typescript
if (
  !(error instanceof GrammyError) ||
  error.method !== "sendMessage" ||
  !Number.isInteger(error.error_code) ||
  error.error_code < 400 ||
  error.error_code >= 500
)
  return { kind: "unknown" };
```

Keep explicit rejection retry logic, unknown-outcome non-replay, active attempt ownership, occurrence identities, schedule generation, grace/cooldown and current-state eligibility unchanged. A locale change must not create a schedule change or a fresh occurrence.

### Catalog contracts and completeness verification

**Targets:** `index.ts`, `en.ts`, `uk.ts`, `tests/unit/i18n.test.ts`, proposed inventory/coverage test.

Use the existing `MessageParameters` map and mapped `MessageCatalog` (`index.ts`, lines 223–235). Both catalogs implement the same `satisfies MessageCatalog` contract; Ukrainian parameterized entries demonstrate the pattern (`uk.ts`, lines 292–298):

```typescript
"setup.progress": ({ step, prompt }) =>
  `Налаштування триває\nКрок ${step} із 8\n\n${prompt}`,
"duration.value": ({ minutes }) => formatPlanningDuration("uk", minutes),
"settings.current": ({ value }) => `Зараз: ${value}`,
"settings.new": ({ value }) => `Нове значення: ${value}`,
"settings.row": ({ label, value }) => `${label}: ${value}`,
```

Keep dynamic values as explicit parameters, distinguish escaped plain values from constructed trusted mention/link markup, and leave command tokens and URL destinations outside translated semantics.

**Test analog:** `tests/unit/i18n.test.ts`, lines 88–113 and 163–172. Existing parity starts with:

```typescript
expect(Object.keys(catalogs.en).sort()).toEqual(
  Object.keys(catalogs.uk).sort(),
);
```

Existing compile-only parameter checks:

```typescript
// @ts-expect-error Unknown message keys are rejected.
renderMessage("uk", "unknown", undefined);
// @ts-expect-error Required payload cannot be omitted.
renderMessage("uk", "duration.value", undefined);
// @ts-expect-error Numbers must not be supplied as strings.
renderMessage("uk", "duration.value", { minutes: "120" });
```

The current runtime test invokes every catalog function with one cast sample object. Extend it with typed key-specific representative inputs, including all new reminder parameters; do not assume key parity proves parameter compatibility or outbound coverage. The new maintained inventory must connect bot-owned messages, buttons, alerts, error/recovery paths and background delivery to catalogs and exercised bilingual tests, and fail when a new uncovered surface appears. A static list without a source/test comparison is insufficient. No close existing inventory/checker was found.

### Reminder and bilingual integration tests

**Targets:** reminder renderer tests, localized reminder integration, final bilingual regression coverage.

**Primary analogs:** `tests/helpers/reminders.ts` and `tests/integration/localization-tracer.test.ts`.

Reuse deterministic clock and injected transport (`tests/helpers/reminders.ts`, lines 92–101):

```typescript
app: new ReminderService({
  prisma,
  botUserId: 9n,
  now: () => at,
  logger: createLogger({ level: "silent" }),
  transport: vi.fn(async () => ({ messageId: 91 })),
  followups: {
    getChat: async () => ({ id: reminderChat, type: "group" as const }),
    send,
  },
}),
```

Use real PostgreSQL persistence with fixture round/occurrence builders. Explicitly reset or isolate language preferences too: `resetReminders` currently clears reminder/configuration data but does not clear independently persisted language preferences. Assert durable identity and scheduling fields alongside outbound text for both language-switch directions, already-scheduled work, restart/eligible recovery, duplicate dispatch, explicit rejection and uncertain delivery. Prove the real production render/transport path, not only mocked planning `ReminderMessage` arguments.

`reminder-followups.test.ts`, lines 190–214, already checks unknown outcomes and spacing; lines 215–249 check unsendable messages consume the occurrence without reserving spacing; lines 346–364 check refreshed anchors and competing reservations. Preserve these behaviors while adding localization coverage.

`localization-tracer.test.ts`, lines 151–165, intercepts Telegram API methods and records payloads; lines 195–209 submit real callbacks and assert exactly one acknowledgement:

```typescript
expect(
  calls.filter((c) => c.method === "answerCallbackQuery"),
).toHaveLength(1);
```

Use minted tokens and actual composed routes for authorization/stale controls and language switching. Existing localized onboarding, planning, feedback and lifecycle integration suites provide the broader regression base. Run the required 0, 1, 2, 5, 11, 14, 21, 22, 25, 101 and 111 count boundaries; retain escaping, astral Unicode, 200-unit alert limits, 4096 encoded-text limits and all-mentions assertions. `reminder-renderers.test.ts`, lines 103–136, already covers hostile names, 60 mentions and impossible capacity.

### Target-image verification

**Targets:** `Dockerfile`, `.github/workflows/ci.yml`.

Use the existing final runtime-stage pattern, not just the build stage. `Dockerfile`, lines 39–45:

```dockerfile
COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/package.json ./
COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=gsmbot:gsmbot /app/dist ./dist

# geo-tz loads its polygon boundary data from disk; prove the runtime copy kept it.
RUN test -d node_modules/geo-tz/data \
  && node --input-type=module -e 'import { find } from "geo-tz/dist/find-now"; const zones = find(47.650499, -122.350070); if (!Array.isArray(zones) || zones.length === 0) process.exit(1)'
```

Add an equivalent check importing the compiled `dist/shared/i18n/index.js`, rendering both catalogs and verifying Ukrainian Intl output/resolved support. CI already builds `gsmbot:ci` and executes a smoke command inside that built image. Extend this wiring to verify the actual pruned runtime as its configured non-root user. If a dedicated smoke module is selected, it is an additional new file and must be copied/compiled intentionally; no dedicated i18n smoke script currently exists.

## Shared Patterns

- **Explicit presentation locale:** resolve once per rendering decision and pass through the full projection. No client-language inference, queued locale snapshot, mutable global locale or locale-triggered schedule invalidation.
- **Authorization and acknowledgement:** continue using existing handlers/domain guards; background rendering introduces no permission bypass. Preserve exactly one callback acknowledgement owned by the outcome branch.
- **Escaping and identities:** retain opaque tokens, IDs, user mention links, navigation destinations and IANA identifiers. Escape dynamic labels once; shorten before escaping on Unicode code-point boundaries.
- **Durable delivery:** preserve claim-before-send and unknown-outcome non-replay. Localization failures must not reset durable claims or introduce duplicate sends.
- **Verification evidence:** run affected tests and repository CI gates against a recorded revision. Native acceptance stays separate from automated matches. Phase 5 native waivers remain scoped; Phase 7 H4 remains an unclassifiable-probe disposition, not a behavioral pass. Phase 8 manual scenarios must state one explicit acceptance condition at a time.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `tests/fixtures/outbound-surfaces.ts` (proposed) | config | batch | No maintained inventory covering all Telegram outbound surfaces was found. |
| `tests/unit/outbound-surfaces.test.ts` (proposed) | test | batch | Existing catalog parity tests do not identify new uncatalogued outbound copy. |

Implement these from the Phase 8 requirements and existing Vitest conventions; research was skipped, so no RESEARCH.md fallback exists. A new week-range formatter and image Intl assertions also require new logic, but have strong local formatting/smoke scaffolding analogs.

## Metadata

**Analog search scope:** `src/telegram`, `src/domain/reminders`, `src/infrastructure/jobs`, `src/shared/i18n`, `src/app`, `tests/unit`, `tests/integration`, `tests/helpers`, Dockerfile and CI; phase context and canonical planning references inspected.

**Implementation/test/build files directly inspected:** 18, including targeted composition/handler ranges; additional test filenames inventoried. Five principal pattern families were selected: reminder projection, durable/current-locale delivery, typed catalogs, persisted bilingual tests, runtime image smoke.

**Pattern extraction date:** 2026-09-19. Line references describe the working tree at mapping time. No source files changed and no tests, deployment or live Telegram actions executed during mapping.
