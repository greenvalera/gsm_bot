-- AlterEnum
ALTER TYPE "PlanningRoundStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "planning_rounds" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_user_id" BIGINT,
ADD COLUMN     "superseded_by_round_id" TEXT;
