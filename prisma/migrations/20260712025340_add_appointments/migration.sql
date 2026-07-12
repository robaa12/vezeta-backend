-- CreateTable
CREATE TABLE "doctor_slot" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "patientNotes" TEXT,
    "adminNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_slot_doctorId_startsAt_idx" ON "doctor_slot"("doctorId", "startsAt");

-- CreateIndex
CREATE INDEX "doctor_slot_status_idx" ON "doctor_slot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slotId_key" ON "appointment"("slotId");

-- CreateIndex
CREATE INDEX "appointment_userId_scheduledAt_idx" ON "appointment"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointment_doctorId_scheduledAt_idx" ON "appointment"("doctorId", "scheduledAt");

-- CreateIndex
CREATE INDEX "appointment_status_idx" ON "appointment"("status");

-- AddForeignKey
ALTER TABLE "doctor_slot" ADD CONSTRAINT "doctor_slot_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "doctor_slot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
