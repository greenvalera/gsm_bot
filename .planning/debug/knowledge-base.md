# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## group-migration-state — Telegram group upgrade strands rehearsal state
- **Date:** 2026-09-11
- **Error patterns:** group upgraded, supergroup, not configured, setup again, inaccessible draft
- **Root cause(s):** Telegram migration service messages were unhandled while all domain state used the exact incoming chat ID.
- **Fix:** Atomic chat-scoped transfer with idempotency ledger, conflict rejection, dual-chat serialization, old-update tombstones, retired anchors and rotated standing callbacks; explicit shared-service recovery for consumed events.
- **Files changed:** src/domain/chat/migration-service.ts, src/telegram/migration-handler.ts, src/app/create-bot.ts, src/app/recover-chat-migration.ts, prisma/schema.prisma, prisma/migrations/20260911090000_chat_migrations/migration.sql, generated Prisma client, migration tests, docs/chat-migration-recovery.md
- **Why not caught:** Transport tests exercised commands and callbacks but had no group migration service-message case.
- **Recurrence guard:** tests/integration/chat-migration.test.ts covers transfer, rollback, collisions, duplicates, out-of-order updates and fresh status recovery; tests/unit/chat-migration.test.ts covers identity parsing and serialization keys.
---

MemPalace indexing was skipped because no MemPalace tool is available in this execution context. This file is the durable fallback.
