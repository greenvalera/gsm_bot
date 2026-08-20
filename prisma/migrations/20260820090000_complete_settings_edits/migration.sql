-- Add target-field values only; the existing owner-bound JSON replacement draft
-- remains the sole settings-edit persistence shape.
ALTER TYPE "SettingsField" ADD VALUE 'TIMEZONE';
ALTER TYPE "SettingsField" ADD VALUE 'DEFAULT_WEEKDAY';
ALTER TYPE "SettingsField" ADD VALUE 'DEFAULT_START_MINUTE';
ALTER TYPE "SettingsField" ADD VALUE 'DURATION_MINUTES';
ALTER TYPE "SettingsField" ADD VALUE 'DAILY_START_MINUTE';
ALTER TYPE "SettingsField" ADD VALUE 'DAILY_END_MINUTE';
ALTER TYPE "SettingsField" ADD VALUE 'REMINDER_MINUTES';
