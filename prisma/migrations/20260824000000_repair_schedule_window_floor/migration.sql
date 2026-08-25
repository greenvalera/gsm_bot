-- Data repair only: no schema change, so prisma/schema.prisma is untouched and
-- this migration introduces no drift.
--
-- The schedule validator is about to gain the floor rule it always lacked
-- (default_start_minute >= daily_start_minute). Rows committed before that rule
-- existed can violate it, and such a row makes /settings unloadable, so it must
-- be repaired here, strictly before the rule is enforced.
--
-- Lowering the floor to the rehearsal start is the provably invariant-preserving
-- direction. The pre-existing ceiling rule already guarantees
-- default_start_minute + duration_minutes <= daily_end_minute with a positive
-- duration, so the new floor (= default_start_minute) is strictly below
-- daily_end_minute and daily_start_minute < daily_end_minute still holds.
-- Raising the rehearsal start to meet the floor has no such guarantee: it could
-- push default_start_minute + duration_minutes past daily_end_minute and break
-- the ceiling rule instead.
--
-- "revision" is deliberately NOT bumped: it is the optimistic-concurrency token
-- that every open SetupDraft and SettingsEditDraft is holding, and incrementing
-- it here would silently invalidate live drafts.
UPDATE "chat_configurations"
SET "daily_start_minute" = "default_start_minute"
WHERE "default_start_minute" < "daily_start_minute";
