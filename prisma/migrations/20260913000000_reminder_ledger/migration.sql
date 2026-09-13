CREATE TYPE "ReminderKind" AS ENUM ('PLANNING_START', 'FOLLOW_UP');
CREATE TYPE "ReminderDisposition" AS ENUM ('PENDING', 'RESERVED', 'SENT', 'UNKNOWN', 'REJECTED', 'SKIPPED', 'COALESCED', 'OBSOLETE');

ALTER TABLE "planning_rounds"
  ADD COLUMN "first_availability_published_at" TIMESTAMPTZ(3),
  ADD COLUMN "availability_anchor_acknowledged_at" TIMESTAMPTZ(3),
  ADD COLUMN "reminder_grace_restart_at" TIMESTAMPTZ(3),
  ADD COLUMN "last_reminder_attempt_at" TIMESTAMPTZ(3);

CREATE TABLE "chat_reminder_states" (
  "chat_id" BIGINT NOT NULL,
  "generation" INTEGER NOT NULL DEFAULT 1,
  "effective_from" TIMESTAMPTZ(3) NOT NULL,
  "quiet_week_start" DATE,
  "quiet_until" TIMESTAMPTZ(3),
  "last_planning_attempt_at" TIMESTAMPTZ(3),
  CONSTRAINT "chat_reminder_states_pkey" PRIMARY KEY ("chat_id"),
  CONSTRAINT "chat_reminder_states_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat_configurations"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "reminder_occurrences" (
  "id" TEXT NOT NULL,
  "chat_id" BIGINT NOT NULL,
  "kind" "ReminderKind" NOT NULL,
  "scope" TEXT NOT NULL,
  "generation" INTEGER NOT NULL,
  "civil_date" DATE NOT NULL,
  "minute" INTEGER NOT NULL,
  "round_id" TEXT,
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "disposition" "ReminderDisposition" NOT NULL DEFAULT 'PENDING',
  "attempt_id" TEXT,
  "reserved_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "message_id" INTEGER,
  "reason" TEXT,
  "retry_at" TIMESTAMPTZ(3),
  "previous_spacing_at" TIMESTAMPTZ(3),
  CONSTRAINT "reminder_occurrences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reminder_occurrences_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat_configurations"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reminder_occurrences_round_id_chat_id_fkey" FOREIGN KEY ("round_id", "chat_id") REFERENCES "planning_rounds"("id", "chat_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "reminder_occurrences_identity_key" ON "reminder_occurrences"("chat_id", "kind", "scope", "generation", "civil_date", "minute");
CREATE INDEX "reminder_occurrences_disposition_due_at_idx" ON "reminder_occurrences"("disposition", "due_at");

-- One activation instant; no synthetic historic occurrences or publication.
INSERT INTO "chat_reminder_states" ("chat_id", "generation", "effective_from")
SELECT "chat_id", 1, CURRENT_TIMESTAMP FROM "chat_configurations";
