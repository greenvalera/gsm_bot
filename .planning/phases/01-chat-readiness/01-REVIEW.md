---
phase: 01-chat-readiness
reviewed: 2026-08-29T06:24:23Z
depth: standard
files_reviewed: 62
files_reviewed_list:
  - .codex/config.toml
  - .dockerignore
  - .github/workflows/ci.yml
  - .gitignore
  - .prettierignore
  - Dockerfile
  - compose.yaml
  - package.json
  - prisma.config.ts
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
  - tests/unit/timezone-prompt-copy.test.ts
  - tests/unit/update-path-logging.test.ts
  - tests/unit/update-route-ownership.test.ts
  - tsconfig.build.json
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 2
  warning: 10
  info: 0
  total: 12
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-08-29T06:24:23Z
**Depth:** standard
**Files Reviewed:** 62
**Status:** issues_found

## Summary

The implementation has two blocking correctness defects. Settings tokens remain bound to a draft row whose ID is reused across edits, so an old visible button can apply, save, or discard a newer edit. Compose also constructs database URLs by interpolating an unescaped password, which prevents startup for common strong-password characters.

The remaining findings concern failure atomicity and observability, an unrecoverable setup-conflict path, ineffective CI gates, a misleading roster recovery boundary, stale migration audit metadata, and order-dependent integration tests. Static type checking and all 88 unit tests pass; those results do not exercise the blocking stale-card or Compose-password paths.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Reused settings draft IDs let stale buttons operate on a different edit

**Classification:** BLOCKER  
**Files:** `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/settings-service.ts:199-223`, `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/settings-service.ts:235-271`, `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/settings-service.ts:383-430`

**Issue:** `beginEdit` uses `upsert` on `(chatId, actorUserId)`. Its update branch changes the field and payload but preserves the row ID. Every selection, save, and keep callback is bound only to that reusable `draftId`, so actions from an older card continue to match after another dashboard action repurposes the row.

A reachable example is: review a duration change and retain its Save token; begin a daily-end edit from another dashboard; then tap the old duration Save button. `saveChange` loads the reused ID and commits its current `DAILY_END_MINUTE` payload. The visible card says it saves duration, but a different setting is changed. Old selection tokens can likewise apply their value to a newly selected field, and an old Keep token can delete the newer draft.

**Fix:** give every edit generation a new immutable identity. Within a transaction, delete the actor's previous draft and create a new row rather than upserting it in place, or add a generation nonce/version and bind it into every begin/select/save/keep target. Re-check that generation inside each mutation transaction.

```ts
return this.prisma.$transaction(async (tx) => {
  await tx.settingsEditDraft.deleteMany({
    where: { chatId, actorUserId: actorId },
  });
  return tx.settingsEditDraft.create({
    data: {
      chatId,
      actorUserId: actorId,
      field,
      expectedRevision: committed.configuration.revision,
      expiresAt: expiresAt(now),
    },
  });
});
```

Add an integration test with two live dashboard messages proving every token from the first edit becomes stale after the second edit begins.

### CR-02: Compose-generated database URLs break for unescaped passwords

**Classification:** BLOCKER  
**File:** `/home/pogorelov/projects/bots/gsmbot/compose.yaml:23,37`

**Issue:** Compose inserts `POSTGRES_PASSWORD` directly into `DATABASE_URL`. Passwords containing URL delimiters such as `#`, `/`, or `?` produce an invalid or differently parsed URL even though PostgreSQL accepts those characters. The database starts with the raw password, but both migration and bot processes fail before connecting.

**Fix:** accept a separately supplied, correctly percent-encoded `DATABASE_URL` for Prisma consumers, while keeping raw `POSTGRES_PASSWORD` only for the database container. Alternatively, generate the URL with a script that applies `encodeURIComponent` before launching either service.

```yaml
migrate:
  environment:
    DATABASE_URL: ${DATABASE_URL:?Set an encoded PostgreSQL connection URL.}
bot:
  environment:
    DATABASE_URL: ${DATABASE_URL:?Set an encoded PostgreSQL connection URL.}
```

## Warnings

### WR-01: Malformed database URLs escape validation as raw `TypeError`s

**Classification:** WARNING  
**File:** `/home/pogorelov/projects/bots/gsmbot/src/app/config.ts:18-27`

**Issue:** Zod 4 still runs the `.refine()` callback when `.url()` has recorded a format issue. `new URL(value)` therefore throws out of `safeParse` for values such as `postgres` or `not-a-url`. The promised key-only error is bypassed, and Node's error object contains the original value in `error.input`.

**Fix:** make URL parsing non-throwing inside one refinement and add malformed-string tests.

```ts
function isPostgresUrl(value: string) {
  try {
    return ["postgres:", "postgresql:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
```

### WR-02: Intermediate callbacks are consumed before their durable transition succeeds

**Classification:** WARNING  
**Files:** `/home/pogorelov/projects/bots/gsmbot/src/telegram/settings-handlers.ts:582-626`, `/home/pogorelov/projects/bots/gsmbot/src/telegram/setup-handlers.ts:771-818`

**Issue:** Settings begin/select callbacks and non-terminal setup callbacks mark the action consumed in one statement, then update the draft separately. A transient database failure after consumption leaves the draft unchanged but permanently invalidates the button. These transitions lack the atomicity already used by save, cancel, and roster removal.

**Fix:** move action validation/consumption and the draft mutation into one service-level transaction. Commit both or neither, then perform the Telegram edit after the transaction returns the authoritative state.

### WR-03: Persistence exceptions are discarded, and roster failures are reported as stale

**Classification:** WARNING  
**Files:** `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/settings-service.ts:185-196,433-436,486-489`, `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/setup-service.ts:393-400,462-476`, `/home/pogorelov/projects/bots/gsmbot/src/domain/roster/roster-service.ts:283-285,348-350,387-389`, `/home/pogorelov/projects/bots/gsmbot/src/telegram/roster-handlers.ts:409-430,434-462`

**Issue:** Domain services collapse unexpected driver, transaction, and constraint errors into `{ kind: "failed" }` while discarding the error. The roster dispatcher then maps `failed` to the same stale alert as an expired or mis-bound action. Operators receive no evidence, and users are told a valid action is unavailable when storage actually failed.

**Fix:** bind and log unexpected errors once through `SafeLogger`, or rethrow them to a handler catch site. Handle `failed` separately in roster callbacks with the generic save-failure response.

### WR-04: Setup revision conflicts cannot be resolved by the instructed retry

**Classification:** WARNING  
**Files:** `/home/pogorelov/projects/bots/gsmbot/src/domain/chat/setup-service.ts:143-169,350-355`, `/home/pogorelov/projects/bots/gsmbot/src/telegram/setup-handlers.ts:707-738`

**Issue:** A setup draft retains its original `expectedRevision`. If another settings change advances the configuration, save returns `conflict`; the handler falls through to `"I couldn't save that change. Please try again."` Retrying cannot succeed, and `/setup` resumes the same stale draft while extending its expiry.

**Fix:** handle `conflict` explicitly. Delete or reset the stale draft and tell the actor to reopen setup against current settings, or provide a restart action that creates a new revision-bound draft.

### WR-05: Demotion cleanup is not atomic and can suppress the denial response

**Classification:** WARNING  
**File:** `/home/pogorelov/projects/bots/gsmbot/src/domain/auth/authorization-service.ts:103-111`

**Issue:** Setup and settings drafts are deleted in independent calls. If the first succeeds and the second fails, cleanup is partial and the method throws a database exception instead of `PermissionDeniedError`; callers send no permission denial.

**Fix:** delete both draft types in one Prisma transaction. If cleanup fails, log it and still return a permission-denied outcome without allowing downstream work.

### WR-06: The CI “Lint” step performs formatting only

**Classification:** WARNING  
**Files:** `/home/pogorelov/projects/bots/gsmbot/package.json:10-14`, `/home/pogorelov/projects/bots/gsmbot/.github/workflows/ci.yml:59-65`

**Issue:** `npm run lint` aliases the exact Prettier check CI already ran. No linter checks unused code, unsafe promises, suspicious coercions, or other correctness-oriented rules; TypeScript also omits `noUnusedLocals` and `noUnusedParameters`.

**Fix:** configure a pinned TypeScript-aware linter, or at minimum enable the compiler's unused-symbol checks and rename the CI step so it does not claim a nonexistent gate.

### WR-07: `prisma migrate status` does not implement the claimed schema-drift gate

**Classification:** WARNING  
**Files:** `/home/pogorelov/projects/bots/gsmbot/.github/workflows/ci.yml:77-84`, `/home/pogorelov/projects/bots/gsmbot/package.json:19-22`

**Issue:** `prisma migrate status` compares migration history/application state. It does not fail merely because `schema.prisma` was edited without a matching migration. A schema-only change can pass the step named “Confirm no migration drift.”

**Fix:** add `prisma migrate diff --exit-code` between committed migrations and `schema.prisma` with an appropriate shadow source, while retaining `migrate status` for pending/diverged history.

### WR-08: Roster delivery failures are caught as projection failures and retried

**Classification:** WARNING  
**File:** `/home/pogorelov/projects/bots/gsmbot/src/telegram/roster-handlers.ts:213-288`

**Issue:** `projectRoster` wraps terminal `emit` calls in the same `try` as database reads and token binding. If Telegram rejects the send/edit, the code logs `roster-projection-failed`, creates a retry action, and emits again on the channel that failed. The outer handler then logs the second exception as delivery failure, giving two classifications for one fault.

**Fix:** build the projection inside the guarded block, execute the final `emit` afterward, and let the caller's delivery catch own Telegram failures exactly once.

### WR-09: The repair migration changes data without updating its audit timestamp

**Classification:** WARNING  
**File:** `/home/pogorelov/projects/bots/gsmbot/prisma/migrations/20260824000000_repair_schedule_window_floor/migration.sql:21-23`

**Issue:** The migration changes `daily_start_minute` but leaves `updated_at` untouched. Prisma's `@updatedAt` behavior is client-side; no database trigger updates the column. Repaired rows therefore claim they were last updated before their actual last mutation.

**Fix:** set `updated_at = CURRENT_TIMESTAMP` in the repair and assert it in the migration integration test.

```sql
UPDATE "chat_configurations"
SET "daily_start_minute" = "default_start_minute",
    "updated_at" = CURRENT_TIMESTAMP
WHERE "default_start_minute" < "daily_start_minute";
```

### WR-10: Integration tests depend on prior tests creating shared state

**Classification:** WARNING  
**File:** `/home/pogorelov/projects/bots/gsmbot/tests/integration/chat-configuration.test.ts:585-641`

**Issue:** The duplicate-save test creates a draft with `expectedRevision = 1` and assumes the preceding promotion test already created `CHAT_ID`. Running that test alone, filtering by name, or shuffling order produces a conflict and cascading failures.

**Fix:** use a unique chat ID per test and arrange its configuration in that test or a per-test fixture. Use `beforeEach` cleanup/transactions so every test passes in isolation.

---

_Reviewed: 2026-08-29T06:24:23Z_  
_Reviewer: Codex (gsd-code-reviewer)_  
_Depth: standard_
