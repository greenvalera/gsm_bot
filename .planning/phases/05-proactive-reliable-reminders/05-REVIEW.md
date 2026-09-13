---
phase: 05-proactive-reliable-reminders
reviewed: 2026-09-13T01:43:00Z
depth: standard
review_snapshot: 8f2ffda49f1fa31084fe8a12713481b88442258b
review_complete: true
files_reviewed: 56
files_reviewed_list:
  - package.json
  - prisma/migrate-deploy.mjs
  - prisma/provision-reminders.mjs
  - prisma/migrations/20260913000000_reminder_ledger/migration.sql
  - prisma/schema.prisma
  - src/app/create-bot.ts
  - src/app/main.ts
  - src/domain/chat/settings-service.ts
  - src/domain/chat/setup-service.ts
  - src/domain/planning/planning-service.ts
  - src/domain/reminders/reminder-occurrences.ts
  - src/domain/reminders/reminder-policy.ts
  - src/domain/reminders/reminder-service.ts
  - src/infrastructure/jobs/reminder-queue.ts
  - src/shared/callback-schema.ts
  - src/shared/chat-coordinator.ts
  - src/telegram/handlers.ts
  - src/telegram/planning-handlers.ts
  - src/telegram/reminder-renderers.ts
  - tests/helpers/reminders.ts
  - tests/helpers/postgres.ts
  - tests/integration/reminder-actions.test.ts
  - tests/integration/reminder-coordination.test.ts
  - tests/integration/reminder-publication.test.ts
  - tests/integration/reminder-queue.test.ts
  - tests/integration/reminder-recovery.test.ts
  - tests/integration/reminder-settings.test.ts
  - tests/integration/reminder-tracer.test.ts
  - tests/integration/reminder-weekly.test.ts
  - tests/unit/reminder-occurrences.test.ts
  - tests/unit/reminder-policy.test.ts
  - prisma/queue/pg-boss-12.27.0.sql
  - src/generated/prisma/browser.ts
  - src/generated/prisma/client.ts
  - src/generated/prisma/commonInputTypes.ts
  - src/generated/prisma/enums.ts
  - src/generated/prisma/internal/class.ts
  - src/generated/prisma/internal/prismaNamespace.ts
  - src/generated/prisma/internal/prismaNamespaceBrowser.ts
  - src/generated/prisma/models.ts
  - src/generated/prisma/models/ChatConfiguration.ts
  - src/generated/prisma/models/ChatReminderState.ts
  - src/generated/prisma/models/PlanningRound.ts
  - src/generated/prisma/models/ReminderOccurrence.ts
  - tests/integration/migration-preflight.test.ts
  - tests/integration/planning-recovery.test.ts
  - tests/integration/reminder-delivery.test.ts
  - tests/integration/reminder-followups.test.ts
  - tests/integration/reminder-idempotency.test.ts
  - tests/integration/reminder-lifecycle.test.ts
  - tests/integration/reminder-start.test.ts
  - tests/unit/planning-logging.test.ts
  - tests/unit/reminder-renderers.test.ts
  - src/domain/chat/migration-service.ts
  - tests/integration/reminder-migration.test.ts
  - tests/integration/reminder-runtime.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 5: Code Review Report

Independent standard-depth review against baseline `3a34bcf`, finalized at source commit `8f2ffda`. The 56-file scope above includes Plan 09 and all review fixes. Review covers changed behavior, relevant callers and test reliability; generated Prisma files were checked as schema derivatives. No structural pre-pass was supplied.

## Narrative Findings (AI reviewer)

No unresolved BLOCKER or WARNING findings remain in the reviewed scope. Five findings were raised and fixed across review iterations. This code-review verdict does not imply live Telegram acceptance or waive the separate security assessment.

## Resolved findings

| ID | Classification | Defect and independently checked closure |
|---|---|---|
| CR-01 | BLOCKER | One failed follow-up chat lookup aborted global reconciliation. Plan 09 added per-occurrence failure isolation and current-anchor reply fallback. The two-chat regression checks healthy-chat delivery despite the first lookup/send failure. |
| CR-02 | BLOCKER | A fresh Monday Start callback rejected an unfinished prior-week draft that ordinary `/plan` would retire. `5d25b0a`/`6f515f2` add transactional retirement after capability validation. Regression cases preserve current/future and snapshotted-timezone drafts, deny unauthorized retirement, verify duplicate handling, and roll retirement back when new-round creation fails. |
| WR-01 | WARNING | Assertions inside the capability test transport could be swallowed by production error handling. `c0f21da` captures the capability and asserts publisher, expiry, parsed target and byte length outside transport, also requiring a SENT outcome. |
| CR-03 | BLOCKER | One-shot signal listeners restored default termination on repeated SIGTERM/SIGINT during drain. `9f461e8` retains persistent handlers until cleanup settles. Signal-emitter tests check repeated same-type delivery and listener lifetime; main retains idempotent shutdown ownership. |
| CR-04 | BLOCKER | The runner's stop promise does not drain its concurrent update handlers, allowing database shutdown underneath accepted work. `216845c` adds shared coordinator update ownership and admission/drain wiring. Follow-up `8f2ffda` tracks only actually executing middleware, so an update queued behind hung reminder HTTP cannot hold database cleanup indefinitely. Admission is rechecked after key acquisition. The actual grammY/concurrent-sink test checks running-handler drain; the second adversarial schedule checks queued work behind a hung reminder never enters and does not extend its deadline. |

## Evidence and limits

- Inspected ledger identity, reservation/coalescing and rejection transitions; civil-time generation, grace/spacing rules; authorization/replay; publication acknowledgment; lifecycle invalidation; migration transfer/collision handling; queue provisioning and runtime shutdown.
- A read-only reproduction using installed `createRunner` and `createConcurrentSink` demonstrated the original CR-04: after `await runner.stop()`, the paused consumer remained unfinished with one pending task. The fix independently tracks middleware rather than trusting that promise.
- The embedded generated Prisma schema matches the source after formatting normalization. Checked-in queue SQL matches the pinned package's construction output after CRLF normalization.
- Inspected focused regression assertions and the final fixes. Full regression execution belongs to the execution/validation workflow; the reviewer did not duplicate its bulk test runs or mutate application code.
- Arbitrary middleware already executing cannot be forcibly canceled safely. After its drain deadline, runtime records teardown failure and keeps Prisma available until that middleware settles. Queued updates are refused; reminder HTTP has its own bounded drain and late outcomes cannot replay consumed reservations. This documented limitation is not a guarantee of a fixed maximum process-exit time.
- Existing dependency advisories remain subject to the separate security artifact. Real Telegram presentation and notification behavior remain subject to UAT.

_Reviewer: gsd-code-reviewer_
