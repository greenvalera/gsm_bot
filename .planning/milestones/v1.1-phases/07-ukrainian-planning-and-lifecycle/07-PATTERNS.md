# Phase 7: Ukrainian Planning and Lifecycle - Pattern Map

**Mapped:** 2026-09-18
**Basis:** Current working tree and 07-CONTEXT.md; external research explicitly skipped.
**Files classified:** 15 implementation/test entries (test families grouped below).
**Strong analog families:** 5. Existing-file modifications use their own implementation as the primary analog.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/shared/i18n/index.ts` | utility | transform | Existing typed `MessageParameters` and `renderMessage` | exact |
| `src/shared/i18n/en.ts` | config | transform | Existing English catalog | exact |
| `src/shared/i18n/uk.ts` | config | transform | Existing Ukrainian catalog | exact |
| `src/shared/i18n/formatters.ts` (proposed) | utility | transform | `dayHeadingLabel`, `weekdayLabel`, catalog `duration.value` | role-match |
| `src/telegram/planning-renderers.ts` | component | transform | Existing pure projections; localized roster projections | exact |
| `src/telegram/keyboards.ts` | component | transform | `setupWeekdayButtons`, locale-aware settings/roster keyboard factories | exact |
| `src/telegram/planning-handlers.ts` | controller | event-driven | Existing planning dispatch and locale-aware onboarding handlers | exact |
| `src/telegram/callbacks.ts` | middleware | event-driven | Existing locale resolver and branch-owned acknowledgement boundary | exact |
| `src/telegram/handlers.ts` | route | request-response | Existing localized denial helper at lines 954–956 | exact |
| `src/telegram/roster-renderers.ts` | utility | transform | Existing localized HTML identity helper | exact |
| `src/telegram/presentation-locale.ts` (reuse; change only if needed) | utility | request-response | Existing durable preference resolver | exact |
| `src/telegram/renderers.ts` (duration compatibility consumer) | component | transform | Existing `formatSettingValue` duration call at line 116 | exact |
| `tests/unit/i18n.test.ts` and proposed formatter unit suite | test | transform | Existing catalog/escaping/type-contract suite | exact / role-match |
| Existing planning card/keyboard/ownership unit suites | test | transform | Existing deterministic projection fixtures | exact |
| Proposed `tests/integration/localized-planning.e2e.test.ts`, plus affected lifecycle/recovery suites | test | event-driven | `localized-onboarding.e2e.test.ts` and existing planning Telegram integration suites | exact |

The new formatter and integration filenames are planning suggestions, not locked context decisions. No database schema or scheduling changes are implied. `presentation-locale.ts` is an integration seam, not a mandatory edit.

## Pattern Assignments

### Typed catalogs and shared formatting

**Analog:** `src/shared/i18n/index.ts`, existing catalog contract near the end of the file:

```typescript
export type MessageCatalog = {
  readonly [Key in keyof MessageParameters]: (
    params: MessageParameters[Key],
  ) => string;
};
export const catalogs: Record<Locale, MessageCatalog> = { en, uk };
export function renderMessage<Key extends keyof MessageParameters>(
  locale: Locale,
  key: Key,
  params: MessageParameters[Key],
): string {
  return catalogs[locale][key](params);
}
```

Extend `MessageParameters` with whole planning/lifecycle phrases and matching entries in both catalogs. Keep explicit locale and typed payloads; do not build translated sentences by replacing English substrings. Existing `weekdayLabel` expects ISO weekdays 1–7 and throws on invalid values. Existing `duration.value` in `uk.ts:138` expresses minutes, so it is a starting point rather than acceptance-complete natural hours/minutes formatting.

**Civil-date analog:** `src/telegram/planning-renderers.ts:77–83`:

```typescript
export function dayHeadingLabel(date: CivilDate) {
  const month = MONTH_LABELS[date.month - 1];
  return `${WEEKDAY_LABELS[weekdayOf(date)]} ${date.day} ${month}`;
}
```

Preserve `CivilDate`/`parseCivilDate`/`weekdayOf`; replace presentation labels without reinterpreting date-only data in the machine timezone. Ukrainian headings require full weekday plus grammatical month names, with no displayed year even across year boundaries. Compact day buttons remain compact. Time labels already come from `formatLocalTime` and domain slot projections; preserve authoritative timezone and 24-hour semantics. Summary ranges omit redundant duration; separately displayed durations use natural hours/minutes. Cover counts 0, 1, 2, 5, 11, 14, 21, 22, 25, 101, 111 and mixed-hour/minute values.

### Planning projections and controls

**Analog:** `planning-renderers.ts:219–253`, `renderDayStep`:

```typescript
const buttons: PlanningKeyboardButton[] = [];
for (const day of projection.days) {
  const token = tokenFor(day.isoDate);
  if (token === undefined) continue;
  buttons.push({ text: dayButtonLabel(day), token });
}
```

Keep pure projection input and `{ text, keyboard }` output. Add locale to every relevant renderer and helper, not just the main day card. Concrete inventory: `planningOwnerLine:152`, `dayButtonLabel:182`, `renderDayStep:219`, `renderTimeStep:314`, `renderReviewStep:387`, `renderAvailabilityCard:539`, `renderRetiredPlanningMessage:620`, `renderCancellationConfirmation:629`, `renderChangeConfirmation:640`, `renderCancellationNotice:651`, `renderSupersededAttemptLine:667`, `renderBlockedAnnouncement:684`, `renderReadyAnnouncement:719`, `renderRetractedAnnouncement:741`, `renderBookingConfirmation:786`.

`keyboards.ts:27–93` already supplies locale-aware setup button factories and English compatibility constants. Reuse that approach for planning row definitions currently using English constants at lines 269–378 and 526–545. Preserve `PlanningControlAction:247`, opaque token lookup, row omission for unminted controls, marker order and row budgets. Day rows remain `[4, 3]` (`:421`); time rows remain `[3, 3, 3, 1]` (`:433`). Localize visible text without translating action values or callback data. `planningControlRows:392` remains the action-to-token assembly seam.

Apply context wording exactly: Можу / Не можу; Очікуємо відповідь / Може / Не може; Організатор; Стати організатором; Усі можуть! Час бронювати репетицію.; Студію заброньовано; Студію вже заброньовано на цей час?; Так, заброньовано / Назад. Booking Back retains existing `book-keep` behavior.

### Locale resolution, dispatch and ordinary updates

**Analog:** `src/telegram/presentation-locale.ts:7–23`:

```typescript
export async function resolvePresentationLocale(
  prisma: PrismaClient,
  chatId: bigint,
  logger?: SafeLogger,
  lastKnown: Locale = "en",
): Promise<Locale> {
  try {
    return (await new LanguageService(prisma).resolve(chatId)).locale;
  } catch (error) {
    logger?.error(
      { event: "telegram.locale.failed", chatId, err: error },
      "Could not resolve presentation locale; using fallback",
    );
    return lastKnown;
  }
}
```

Read durable chat preference at the rendering/action boundary, then thread one locale through text, controls, fallback labels and feedback. Never use fallback resolution as authorization. `planning-handlers.ts` currently does not import locale utilities and has 4,984 lines: targeted editing must cover helper chains, not only command entry points.

Key seams: `withLifecycleControls:1134`, `renderStep:1215`, `replaceAnchor:1553`, `repostAnchor:1660`, `/plan` handler `:1866`, `/plan_status` handler `:2050`, direct availability render in confirmation `:2403`, and `dispatchAnnouncement:2491`. `renderStep` branches on status before wizard step; preserve this order and its optional shared availability projection / explicit card-kind arguments. They prevent rendering inconsistent state and bypassing announcement claims.

**Full-payload comparison:** `planning-handlers.ts:1439–1455`:

```typescript
const key = `${chatId.toString()}:${messageId}`;
const fingerprint = JSON.stringify({
  text: card.text,
  reply_markup: card.keyboard,
});
if (LAST_RENDER.get(key) === fingerprint) return "unchanged";
// editMessageText uses the same text and keyboard, then:
rememberRender(key, fingerprint);
```

A locale change must reach rendering even when the selected answer or domain revision did not change. Preserve comparison of BOTH text and keyboard and cache population only after successful/not-modified delivery. Test repeat-answer and same-selection paths plus cold-cache operation; do not merely increment a domain revision to force translation. `dispatchAnnouncement:2501` deliberately returns for directive `none`; localization must not invent notification entitlement or bypass durable claims to repaint messages. Only ordinary authorized updates refresh active cards; language changes themselves do not scan/rewrite history.

### Feedback, authority and identity

`planning-handlers.ts:74–212` contains English denial/stale/duplicate/validation/recovery constants. Translate by semantic branch. `PLANNING_REPLANNED_TEXT:125` maps to current `/plan_status`; generic stale `CALLBACK_STALE:122` maps to `/plan`; cancelled/no-round branches must retain their distinct recovery facts. D-15's retry invitation is only valid for definitely uncommitted actions, not committed mutations with failed Telegram delivery. Preserve existing log reasons and compensation behavior.

`handlers.ts:635–748` has command-boundary planning and membership refusals before the planning handler is entered. Include these; localizing only planning-handlers leaves English denials. The existing localized helper at `handlers.ts:954–956` resolves locale then renders `common.denied`.

`callbacks.ts` already imports the presentation resolver. Its planning-specific stale constant is at line 65; boundary registration at 274 wraps acknowledgement around line 298, and planning route composition starts at 533. Keep route-resolved planning authority and actor binding, immediate branch-owned feedback and exactly-once acknowledgement. Do not add an unconditional early acknowledgement that suppresses the private localized result.

`planning-handlers.ts:58–63` explicitly prohibits using the onboarding administrator helper for planning: it deletes setup/settings drafts on denial. Preserve `AuthorizationService.currentRole` plus round ownership and action-specific eligibility.

**Identity analog:** `src/telegram/roster-renderers.ts:23–29, 39–73`:

```typescript
export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
export function plainMemberLabel(member: RosterIdentity): string {
  return localizedPlainMemberLabel(member, "en");
}
export function localizedMemberLabel(member: RosterIdentity, locale: Locale) {
  return escapeHtml(localizedPlainMemberLabel(member, locale));
}
```

Use `localizedMemberLabel` for HTML cards. The localized plain helper is currently private, while `plainMemberLabel` forces English; expose or parameterize this seam for `planningNotAuthorText` (`planning-handlers.ts:285`). Keep bounded plain-text callback alerts, Unicode-safe truncation and masked four-digit fallback IDs. Do not HTML-escape private alerts or double-escape names. Preserve roster sorting and domain participant order.

### Tests

**Analog:** `tests/integration/localized-onboarding.e2e.test.ts:1–20, 39–68`:

```typescript
import { createBot } from "../../src/app/create-bot.js";
import { createPrismaClient } from "../../src/infrastructure/db/prisma.js";
import { renderMessage, type Locale } from "../../src/shared/i18n/index.js";
// Testcontainers setup creates real PostgreSQL and a migrated Prisma client.
// createBot receives injected now(), membershipGateway and timezoneResolver.
bot.api.config.use(async (_previous, method, payload) => {
  calls.push({ method, payload });
  expect(["sendMessage", "editMessageText", "answerCallbackQuery"]).toContain(method);
  // Return a deterministic Telegram API result.
});
```

The same fixture exposes callbacks by visible label and asserts `Buffer.byteLength(callback_data) <= 64` around lines 89–100. Extend this composition style for current-language commands, stale/denial routes and language switching with real durable planning state. Snapshot answers, selected date/time, ownership, stable action targets and schedule values before/after language-only changes; reuse an existing valid control after switching. Assert exactly one acknowledgement per callback and matching text/button language.

`tests/unit/i18n.test.ts:49–74` checks catalog parity/nonempty output using a shared sample payload. Adding parameterized keys may require extending that sample. Lines 105–112 test exactly-once escaping, 113–120 exercise context-free rendering, and 123–132 are compile-time misuse checks. Keep English assertions while adding exact Ukrainian phrases and morphology boundaries.

Existing unit entry points: `planning-day-card.test.ts`, `planning-time-card.test.ts`, `planning-availability-card.test.ts`, `planning-keyboards.test.ts`, `planning-ownership.test.ts`, `callback-authority.test.ts`, `onboarding-feedback.test.ts`. Existing integration entry points: `planning-availability.test.ts`, `planning-booking.test.ts`, `planning-recovery.test.ts`, `planning-replan-telegram.test.ts`, `planning-cancel-telegram.test.ts`, `planning-change-telegram.test.ts`, `planning-lifecycle-review.test.ts`. Match each new localized branch to its existing domain scenario rather than duplicating a new state machine in tests.

## Shared Patterns

- TypeScript ESM relative imports use `.js`; type-only imports are explicit. Keep strict optional-property semantics by omitting absent keyboard properties.
- Durable state, action capabilities, fresh role checks and announcement claims remain the authority. Localization changes projections and feedback.
- Pure renderers own HTML escaping and presentation; catalogs accept already-safe HTML dynamic values. Callback alerts remain plain text.
- One current locale governs the complete card payload. English fallback is resilience, not evidence of Ukrainian coverage.
- No new help command/menu is implied: inventory existing guidance strings and command refusals. Actual reminder-worker translation and the complete outbound inventory/runtime verification belong to Phase 8.

## No Analog Found

No complete localized planning/lifecycle end-to-end fixture exists yet. Combine the existing bilingual onboarding transport harness with established planning/lifecycle fixtures. Natural Ukrainian full-date and mixed-hour/minute formatting has only partial analogs; add focused pure helpers and table-driven tests, retaining civil-date arithmetic. Do not infer missing external research.

## Metadata

**Analog search scope:** `src/telegram`, `src/shared/i18n`, `src/app`, planning-related unit/integration tests and package scripts.
**Extraction date:** 2026-09-18.
**Verification entry points:** `npm run build`, `npm run test:unit -- <affected files>`, `npm run test:integration -- <affected files>`; integration suites require PostgreSQL/Testcontainers support. No tests run for this read-only mapping task.
**Workspace caution:** Numerous unrelated source/config/test changes exist. Preserve them, especially civil-time helpers and existing planning test edits. No source/config files changed by this mapping.
