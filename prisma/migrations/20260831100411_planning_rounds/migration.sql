-- CreateEnum
CREATE TYPE "PlanningRoundStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ABANDONED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "PlanningStep" AS ENUM ('DAY', 'TIME', 'REVIEW');

-- AlterEnum
ALTER TYPE "CallbackActionKind" ADD VALUE 'PLANNING';

-- CreateTable
CREATE TABLE "planning_rounds" (
    "id" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,
    "author_user_id" BIGINT NOT NULL,
    "target_week_start" TEXT NOT NULL,
    "active_week_start" TEXT,
    "status" "PlanningRoundStatus" NOT NULL DEFAULT 'DRAFT',
    "step" "PlanningStep" NOT NULL DEFAULT 'DAY',
    "timezone" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "daily_start_minute" INTEGER NOT NULL,
    "daily_end_minute" INTEGER NOT NULL,
    "selected_date" TEXT,
    "selected_start_minute" INTEGER,
    "anchor_message_id" INTEGER,
    "starts_at" TIMESTAMPTZ(3),
    "ends_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "last_status_posted_at" TIMESTAMPTZ(3),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "planning_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_participants" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT NOT NULL,
    "membership_id" TEXT NOT NULL,

    CONSTRAINT "planning_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planning_rounds_chat_id_status_target_week_start_idx" ON "planning_rounds"("chat_id", "status", "target_week_start");

-- CreateIndex
CREATE INDEX "planning_rounds_chat_id_starts_at_idx" ON "planning_rounds"("chat_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "planning_rounds_chat_id_active_week_start_key" ON "planning_rounds"("chat_id", "active_week_start");

-- CreateIndex
CREATE UNIQUE INDEX "planning_participants_round_id_telegram_user_id_key" ON "planning_participants"("round_id", "telegram_user_id");

-- AddForeignKey
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "planning_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
