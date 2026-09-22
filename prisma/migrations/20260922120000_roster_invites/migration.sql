-- AlterEnum
ALTER TYPE "CallbackActionKind" ADD VALUE 'ROSTER_JOIN';

-- CreateTable
CREATE TABLE "roster_invites" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "username" TEXT NOT NULL,
    "invited_by_user_id" BIGINT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "consumed_by_user_id" BIGINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roster_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roster_invites_chat_id_username_key" ON "roster_invites"("chat_id", "username");
