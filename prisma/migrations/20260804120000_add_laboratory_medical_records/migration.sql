-- CreateTable
CREATE TABLE "laboratory_medical_record" (
    "id" TEXT NOT NULL,
    "laboratoryBookingId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "notes" TEXT,
    "attachmentUrls" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laboratory_medical_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "laboratory_medical_record_laboratoryBookingId_key" ON "laboratory_medical_record"("laboratoryBookingId");

-- CreateIndex
CREATE INDEX "laboratory_medical_record_patientId_idx" ON "laboratory_medical_record"("patientId");

-- CreateIndex
CREATE INDEX "laboratory_medical_record_laboratoryId_idx" ON "laboratory_medical_record"("laboratoryId");

-- AddForeignKey
ALTER TABLE "laboratory_medical_record" ADD CONSTRAINT "laboratory_medical_record_laboratoryBookingId_fkey" FOREIGN KEY ("laboratoryBookingId") REFERENCES "laboratory_booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_medical_record" ADD CONSTRAINT "laboratory_medical_record_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_medical_record" ADD CONSTRAINT "laboratory_medical_record_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
