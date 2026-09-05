-- CreateEnum
CREATE TYPE "ParticipantAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- AlterEnum
ALTER TYPE "PlanningRoundStatus" ADD VALUE 'BOOKED';

-- AlterTable
ALTER TABLE "planning_participants" ADD COLUMN     "answered_at" TIMESTAMPTZ(3),
ADD COLUMN     "availability" "ParticipantAvailability";

-- AlterTable
ALTER TABLE "planning_rounds" ADD COLUMN     "announcement_message_id" INTEGER,
ADD COLUMN     "booked_at" TIMESTAMPTZ(3),
ADD COLUMN     "booked_by_user_id" BIGINT,
ADD COLUMN     "ready_announced_at" TIMESTAMPTZ(3);
