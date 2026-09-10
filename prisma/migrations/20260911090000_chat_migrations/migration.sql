CREATE TABLE "chat_migrations" (
  "old_chat_id" BIGINT NOT NULL PRIMARY KEY,
  "new_chat_id" BIGINT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_migrations_distinct_ids" CHECK ("old_chat_id" <> "new_chat_id")
);
