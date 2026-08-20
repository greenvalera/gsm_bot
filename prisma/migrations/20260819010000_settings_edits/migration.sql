-- Persist the first revision-safe settings edit without exposing replacement
-- values in Telegram callback data.
CREATE TYPE "SettingsField" AS ENUM ('PLANNING_ACCESS_POLICY');

ALTER TYPE "CallbackActionKind" ADD VALUE 'SETTINGS_EDIT';

CREATE TABLE "settings_edit_drafts" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "actor_user_id" BIGINT NOT NULL,
    "field" "SettingsField" NOT NULL,
    "replacement_payload" JSONB,
    "expected_revision" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "settings_edit_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "settings_edit_drafts_chat_id_actor_user_id_key"
  ON "settings_edit_drafts"("chat_id", "actor_user_id");

CREATE INDEX "settings_edit_drafts_expires_at_idx"
  ON "settings_edit_drafts"("expires_at");
