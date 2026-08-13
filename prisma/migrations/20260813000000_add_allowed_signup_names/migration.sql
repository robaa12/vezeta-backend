-- ============================================================================
-- Feature: signup allowlist
-- Adds the `allowed_signup_name` table. An admin records the four-word full
-- name of each person allowed to register; the Better Auth user-create hook
-- claims a matching ACTIVE row and flips it to USED, so one entry admits one
-- account. The migration is idempotent so it can be re-run safely.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "allowed_signup_name" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "usedByEmail" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "allowed_signup_name_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "allowed_signup_name_status_idx"
    ON "allowed_signup_name"("status");

-- Supports the signup claim, which looks up (normalizedName, status='ACTIVE').
CREATE INDEX IF NOT EXISTS "allowed_signup_name_normalizedName_status_idx"
    ON "allowed_signup_name"("normalizedName", "status");

-- At most one *live* entry per name. USED and DEACTIVATED rows are history and
-- stay unconstrained, so a name can be re-added and consumed again later.
-- This is a partial unique index, which Prisma's schema language cannot
-- express — it exists only here. Do not run `prisma migrate dev` against this
-- schema: it would report the index as drift and try to drop it.
CREATE UNIQUE INDEX IF NOT EXISTS "allowed_signup_name_active_key"
    ON "allowed_signup_name"("normalizedName")
    WHERE "status" = 'ACTIVE';
