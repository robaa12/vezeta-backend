-- Services with a known price remain FIXED; unpriced services become
-- ON_REQUEST so they may advertise a clinic-confirmed discount without
-- implying that the application can calculate a final price.
ALTER TABLE "doctor_service"
  ADD COLUMN "pricingMode" TEXT NOT NULL DEFAULT 'ON_REQUEST';

UPDATE "doctor_service"
SET "pricingMode" = 'FIXED'
WHERE "price" IS NOT NULL;

ALTER TABLE "doctor_service"
  ADD CONSTRAINT "doctor_service_pricing_mode_valid"
  CHECK ("pricingMode" IN ('FIXED', 'ON_REQUEST'));
