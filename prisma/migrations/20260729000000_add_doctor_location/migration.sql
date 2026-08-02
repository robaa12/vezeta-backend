-- ============================================================================
-- Feature: doctor location / address
-- Adds free-text `address` and optional `latitude` / `longitude` columns
-- to the `doctor` table. All three are nullable: a doctor with no
-- location simply has all three NULL. Coordinate validity (lat in
-- [-90, 90], lng in [-180, 180]) is enforced at the DTO layer; the DB
-- adds a defensive CHECK constraint so bad data can't slip in via a
-- raw query. The application builds a clickable Google Maps URL from
-- these fields: a precise `?q=lat,lng` link when both coordinates are
-- set, otherwise a `?q=<address>` search link.
-- The migration is idempotent so it can be re-run safely.
-- ============================================================================

-- 1. Add the address column (free text, max 500 chars to match the DTO)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'doctor' AND column_name = 'address'
    ) THEN
        ALTER TABLE "doctor" ADD COLUMN "address" TEXT;
    END IF;
END$$;

-- 2. Add latitude / longitude (double precision; both nullable)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'doctor' AND column_name = 'latitude'
    ) THEN
        ALTER TABLE "doctor" ADD COLUMN "latitude" DOUBLE PRECISION;
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'doctor' AND column_name = 'longitude'
    ) THEN
        ALTER TABLE "doctor" ADD COLUMN "longitude" DOUBLE PRECISION;
    END IF;
END$$;

-- 3. Defensive CHECK constraints mirroring the DTO range validators.
--    The DTO is the primary enforcement point; these are belt-and-braces
--    so a future raw query cannot insert out-of-range coordinates.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_latitude_range'
    ) THEN
        ALTER TABLE "doctor"
            ADD CONSTRAINT "doctor_latitude_range"
            CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_longitude_range'
    ) THEN
        ALTER TABLE "doctor"
            ADD CONSTRAINT "doctor_longitude_range"
            CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
    END IF;
END$$;
