-- Existing laboratory reviews may have been created before they could be
-- associated with a patient booking, so the link remains nullable.
ALTER TABLE "laboratory_review" ADD COLUMN "laboratoryBookingId" TEXT;

CREATE UNIQUE INDEX "laboratory_review_laboratoryBookingId_key"
ON "laboratory_review"("laboratoryBookingId");

ALTER TABLE "laboratory_review"
ADD CONSTRAINT "laboratory_review_laboratoryBookingId_fkey"
FOREIGN KEY ("laboratoryBookingId") REFERENCES "laboratory_booking"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
