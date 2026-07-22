-- ============================================================================
-- Feature 007-doctor-services
-- Adds the `doctor_service` table for per-doctor service offerings.
-- Each doctor can have many services; each service has an optional
-- price and an optional discount percentage (0-100). A service with a
-- discount must have a price (enforced in the DTO). Lifecycle is the
-- same ACTIVE/DEACTIVATED pattern as Doctor/Category.
-- The migration is idempotent so it can be re-run safely.
-- ============================================================================

-- 1. Create the doctor_service table
CREATE TABLE IF NOT EXISTS "doctor_service" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10, 2),
    "discountPercent" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_service_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes (matches the Prisma @@index declarations)
CREATE INDEX IF NOT EXISTS "doctor_service_doctorId_status_idx"
    ON "doctor_service"("doctorId", "status");
CREATE INDEX IF NOT EXISTS "doctor_service_doctorId_idx"
    ON "doctor_service"("doctorId");

-- 3. Add the FK to doctor (idempotent) with ON DELETE CASCADE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_service_doctorId_fkey'
    ) THEN
        ALTER TABLE "doctor_service"
            ADD CONSTRAINT "doctor_service_doctorId_fkey"
            FOREIGN KEY ("doctorId") REFERENCES "doctor"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;

-- 4. Sanity check: discountPercent, when set, must be 0-100. Price, when
-- set, must be non-negative. We add CHECK constraints to enforce at the
-- DB level in addition to the DTO.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_service_discount_range'
    ) THEN
        ALTER TABLE "doctor_service"
            ADD CONSTRAINT "doctor_service_discount_range"
            CHECK ("discountPercent" IS NULL OR ("discountPercent" >= 0 AND "discountPercent" <= 100));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_service_price_nonneg'
    ) THEN
        ALTER TABLE "doctor_service"
            ADD CONSTRAINT "doctor_service_price_nonneg"
            CHECK ("price" IS NULL OR "price" >= 0);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_service_status_valid'
    ) THEN
        ALTER TABLE "doctor_service"
            ADD CONSTRAINT "doctor_service_status_valid"
            CHECK ("status" IN ('ACTIVE', 'DEACTIVATED'));
    END IF;
END$$;
