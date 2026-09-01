-- CreateTable
CREATE TABLE "chat_status_cooldowns" (
    "chat_id" BIGINT NOT NULL,
    "last_posted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_status_cooldowns_pkey" PRIMARY KEY ("chat_id")
);
