-- AlterEnum
BEGIN;
CREATE TYPE "PlanningRoundStatus_new" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');
ALTER TABLE "public"."planning_rounds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "planning_rounds" ALTER COLUMN "status" TYPE "PlanningRoundStatus_new" USING ("status"::text::"PlanningRoundStatus_new");
ALTER TYPE "PlanningRoundStatus" RENAME TO "PlanningRoundStatus_old";
ALTER TYPE "PlanningRoundStatus_new" RENAME TO "PlanningRoundStatus";
DROP TYPE "public"."PlanningRoundStatus_old";
ALTER TABLE "planning_rounds" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- CreateIndex
CREATE INDEX "callback_actions_expires_at_idx" ON "callback_actions"("expires_at");

-- CreateIndex
CREATE INDEX "planning_participants_telegram_user_id_idx" ON "planning_participants"("telegram_user_id");

-- AddForeignKey
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "chat_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
