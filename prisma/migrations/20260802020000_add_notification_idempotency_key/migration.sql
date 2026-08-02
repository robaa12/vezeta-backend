-- A non-null idempotency key acts as the cross-replica delivery claim.
-- Existing appointment reminders are backfilled before the unique index is
-- added. If historical duplicates exist, only the earliest retains the key.
ALTER TABLE "notification" ADD COLUMN "idempotencyKey" TEXT;

WITH ranked_reminders AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "metadata"->>'kind', "metadata"->>'appointmentId'
            ORDER BY "createdAt", "id"
        ) AS row_number
    FROM "notification"
    WHERE "metadata"->>'kind' IN (
        'appointment.reminder.24h',
        'appointment.reminder.1h'
    )
      AND "metadata"->>'appointmentId' IS NOT NULL
)
UPDATE "notification" AS notification
SET "idempotencyKey" =
    'appointment-reminder:' || (notification."metadata"->>'kind') || ':' ||
    (notification."metadata"->>'appointmentId')
FROM ranked_reminders
WHERE notification."id" = ranked_reminders."id"
  AND ranked_reminders.row_number = 1;

CREATE UNIQUE INDEX "notification_idempotencyKey_key"
ON "notification"("idempotencyKey");
