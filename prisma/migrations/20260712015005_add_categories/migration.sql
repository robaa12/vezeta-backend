-- ============================================================================
-- Feature 005-doctor-categories
-- Adds the `category` table and replaces `doctor.specialty` (free-text)
-- with a required `doctor.categoryId` foreign key. The migration is
-- idempotent so it can be re-run safely (e.g. after a partial failure).
-- ============================================================================

-- 1. Create the category table
CREATE TABLE IF NOT EXISTS "category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "category_status_idx" ON "category"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "category_name_status_key" ON "category"("name", "status");

-- 2. Add categoryId as NULLABLE first so the backfill can run
ALTER TABLE "doctor" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

-- 3. Backfill distinct ACTIVE categories from existing specialties
INSERT INTO "category" ("id", "name", "status", "createdAt", "updatedAt")
SELECT
    'cat_' || substr(md5(random()::text), 1, 24) || '_' || row_number() OVER () AS id,
    DISTINCT_SPECIALTY.name,
    'ACTIVE',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "specialty" AS name
    FROM "doctor"
    WHERE "specialty" IS NOT NULL AND length(trim("specialty")) > 0
) AS DISTINCT_SPECIALTY
WHERE NOT EXISTS (
    SELECT 1 FROM "category" c
    WHERE c."name" = DISTINCT_SPECIALTY.name AND c."status" = 'ACTIVE'
);

-- 4. "General" fallback for doctors with empty / null specialty (only if any exist)
INSERT INTO "category" ("id", "name", "status", "createdAt", "updatedAt")
SELECT 'cat_general_fallback', 'General', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM "doctor" WHERE "specialty" IS NULL OR length(trim("specialty")) = 0
)
AND NOT EXISTS (
    SELECT 1 FROM "category" WHERE "name" = 'General' AND "status" = 'ACTIVE'
);

-- 5. Backfill doctor.categoryId from the matching category row
UPDATE "doctor" d
SET "categoryId" = c."id"
FROM "category" c
WHERE c."name" = d."specialty"
  AND c."status" = 'ACTIVE'
  AND (d."specialty" IS NOT NULL AND length(trim(d."specialty")) > 0)
  AND d."categoryId" IS NULL;

-- 6. Backfill any still-null doctor.categoryId to "General" (safety net)
UPDATE "doctor" d
SET "categoryId" = (
    SELECT "id" FROM "category" WHERE "name" = 'General' AND "status" = 'ACTIVE' LIMIT 1
)
WHERE d."categoryId" IS NULL
  AND EXISTS (SELECT 1 FROM "category" WHERE "name" = 'General' AND "status" = 'ACTIVE');

-- 7. NOW it is safe to make categoryId NOT NULL
ALTER TABLE "doctor" ALTER COLUMN "categoryId" SET NOT NULL;

-- 8. Add FK constraint (idempotent) and supporting index
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doctor_categoryId_fkey'
    ) THEN
        ALTER TABLE "doctor"
            ADD CONSTRAINT "doctor_categoryId_fkey"
            FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "doctor_categoryId_idx" ON "doctor"("categoryId");

-- 9. Drop the legacy specialty column + its index
DROP INDEX IF EXISTS "doctor_specialty_idx";
ALTER TABLE "doctor" DROP COLUMN IF EXISTS "specialty";
