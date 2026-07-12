-- Remove the DoctorProfile table and add the new standalone Doctor table.
-- This migration implements the schema changes for feature 003-remove-doctor-role.

-- DropForeignKey
ALTER TABLE "doctor_profile" DROP CONSTRAINT IF EXISTS "doctor_profile_userId_fkey";

-- DropForeignKey
ALTER TABLE "doctor_profile" DROP CONSTRAINT IF EXISTS "doctor_profile_approvedById_fkey";

-- DropIndex (the index on status was created in the init migration)
DROP INDEX IF EXISTS "doctor_profile_status_idx";

-- DropTable
DROP TABLE IF EXISTS "doctor_profile";

-- AlterTable: change User.role default from "patient" to "user"
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user';

-- CreateTable: standalone Doctor record
CREATE TABLE "doctor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "bio" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_status_idx" ON "doctor"("status");

-- CreateIndex
CREATE INDEX "doctor_specialty_idx" ON "doctor"("specialty");
