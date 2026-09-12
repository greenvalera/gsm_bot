---
status: resolved
trigger: Repeat Docker Compose startup refuses the already migrated database
---

Expected: guarded migration deployment accepts an unchanged fully migrated database.
Observed: migration service exits 1 with Inconsistent planning schema baseline, blocking Compose bot startup. Existing bot can be restarted against preserved database.
Evidence: all 12 migrations, including 20260911090000_chat_migrations, are recorded complete. expectedApplicationCatalog does not describe chat_migrations.
Hypothesis: strict catalog guard was not extended for the new chat identity mapping table.
Resolution: added the migration-gated exact catalog for chat_migrations, including columns, primary/unique keys, distinct-ID CHECK and indexes. No guard bypass or schema migration was added.
Verification: existing fully-migrated test failed before fix (exit 1 instead of 0). Full migration-preflight suite passed after fix: 34/34, 147.55 seconds, including three new mapping-table drift refusals. Type checking and Docker migrate image build passed. Ordinary docker compose up -d --no-build bot now succeeds on the preserved live database; migrate exits 0 with No pending migrations to apply. One existing bot remains running and PostgreSQL healthy.
Next action: none for this defect.
Execution: inline GSD debug; no additional agent requested.
