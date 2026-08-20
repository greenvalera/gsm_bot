-- Persist only reply-anchored Telegram identities and one durable membership per chat.
CREATE TABLE "telegram_users" (
    "telegram_user_id" BIGINT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("telegram_user_id")
);

CREATE TABLE "chat_memberships" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "active_at" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_memberships_chat_id_telegram_user_id_key"
  ON "chat_memberships"("chat_id", "telegram_user_id");

CREATE INDEX "chat_memberships_chat_id_active_at_idx"
  ON "chat_memberships"("chat_id", "active_at");

ALTER TABLE "chat_memberships"
  ADD CONSTRAINT "chat_memberships_telegram_user_id_fkey"
  FOREIGN KEY ("telegram_user_id") REFERENCES "telegram_users"("telegram_user_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
