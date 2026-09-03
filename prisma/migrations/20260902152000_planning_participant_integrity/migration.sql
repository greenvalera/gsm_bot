BEGIN;

-- Prevent legacy writers from invalidating the checks before the new
-- constraints commit. SHARE ROW EXCLUSIVE conflicts with all row writes while
-- still allowing ordinary reads during the migration.
LOCK TABLE "planning_rounds", "planning_participants", "chat_memberships"
  IN SHARE ROW EXCLUSIVE MODE;

-- These checks are authoritative. The JavaScript preflight exists only to give
-- operators aggregate diagnostics before Prisma starts this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "planning_rounds" WHERE "status"::text = 'ABANDONED'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Planning participant integrity migration blocked by legacy round state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "planning_participants" AS participant
    LEFT JOIN "planning_rounds" AS round ON round."id" = participant."round_id"
    LEFT JOIN "chat_memberships" AS membership ON membership."id" = participant."membership_id"
    WHERE round."id" IS NULL
       OR membership."id" IS NULL
       OR membership."chat_id" IS DISTINCT FROM round."chat_id"
       OR membership."telegram_user_id" IS DISTINCT FROM participant."telegram_user_id"
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'Planning participant integrity migration blocked by invalid participant bindings';
  END IF;
END
$$;

-- AlterEnum
CREATE TYPE "PlanningRoundStatus_new" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');
ALTER TABLE "public"."planning_rounds" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "planning_rounds" ALTER COLUMN "status" TYPE "PlanningRoundStatus_new" USING ("status"::text::"PlanningRoundStatus_new");
ALTER TYPE "PlanningRoundStatus" RENAME TO "PlanningRoundStatus_old";
ALTER TYPE "PlanningRoundStatus_new" RENAME TO "PlanningRoundStatus";
DROP TYPE "public"."PlanningRoundStatus_old";
ALTER TABLE "planning_rounds" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "callback_actions_expires_at_idx" ON "callback_actions"("expires_at");

-- CreateIndex
CREATE INDEX "planning_participants_telegram_user_id_idx" ON "planning_participants"("telegram_user_id");

-- Add and backfill the participant's chat identity before making it required.
ALTER TABLE "planning_participants" ADD COLUMN "chat_id" BIGINT;
UPDATE "planning_participants" AS participant
SET "chat_id" = round."chat_id"
FROM "planning_rounds" AS round
WHERE participant."round_id" = round."id";
ALTER TABLE "planning_participants" ALTER COLUMN "chat_id" SET NOT NULL;

-- Composite referenced keys bind both sides of a participant snapshot to the
-- same chat and bind its redundant Telegram identity to the membership row.
CREATE UNIQUE INDEX "planning_rounds_id_chat_id_key" ON "planning_rounds"("id", "chat_id");
CREATE UNIQUE INDEX "chat_memberships_id_chat_id_telegram_user_id_key" ON "chat_memberships"("id", "chat_id", "telegram_user_id");

-- Replace the round-only relationship with the round/chat relationship.
ALTER TABLE "planning_participants" DROP CONSTRAINT "planning_participants_round_id_fkey";
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_round_id_chat_id_fkey" FOREIGN KEY ("round_id", "chat_id") REFERENCES "planning_rounds"("id", "chat_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_membership_id_chat_id_telegram_user__fkey" FOREIGN KEY ("membership_id", "chat_id", "telegram_user_id") REFERENCES "chat_memberships"("id", "chat_id", "telegram_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
