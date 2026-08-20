-- CreateEnum
CREATE TYPE "PlanningAccessPolicy" AS ENUM ('ADMINS_ONLY', 'PREVIOUS_PARTICIPANTS', 'ANYONE_IN_CHAT');

-- CreateEnum
CREATE TYPE "SetupStep" AS ENUM ('READINESS');

-- CreateEnum
CREATE TYPE "CallbackActionKind" AS ENUM ('START_SETUP');

-- CreateTable
CREATE TABLE "chat_configurations" (
    "chat_id" BIGINT NOT NULL,
    "timezone" TEXT NOT NULL,
    "default_weekday" INTEGER NOT NULL,
    "default_start_minute" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "daily_start_minute" INTEGER NOT NULL,
    "daily_end_minute" INTEGER NOT NULL,
    "reminder_minutes" INTEGER[] NOT NULL,
    "planning_access_policy" "PlanningAccessPolicy" NOT NULL DEFAULT 'ADMINS_ONLY',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_configurations_pkey" PRIMARY KEY ("chat_id")
);

-- CreateTable
CREATE TABLE "setup_drafts" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "actor_user_id" BIGINT NOT NULL,
    "step" "SetupStep" NOT NULL DEFAULT 'READINESS',
    "candidate_timezone" TEXT,
    "timezone" TEXT,
    "default_weekday" INTEGER,
    "default_start_minute" INTEGER,
    "duration_minutes" INTEGER,
    "daily_start_minute" INTEGER,
    "daily_end_minute" INTEGER,
    "reminder_minutes" INTEGER[] NOT NULL,
    "planning_access_policy" "PlanningAccessPolicy",
    "expected_revision" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "setup_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callback_actions" (
    "token" TEXT NOT NULL,
    "kind" "CallbackActionKind" NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "actor_user_id" BIGINT NOT NULL,
    "target_id" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callback_actions_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "setup_drafts_chat_id_actor_user_id_key" ON "setup_drafts"("chat_id", "actor_user_id");

-- CreateIndex
CREATE INDEX "setup_drafts_expires_at_idx" ON "setup_drafts"("expires_at");

-- CreateIndex
CREATE INDEX "callback_actions_chat_id_actor_user_id_expires_at_idx" ON "callback_actions"("chat_id", "actor_user_id", "expires_at");
