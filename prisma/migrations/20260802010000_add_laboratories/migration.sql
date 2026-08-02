CREATE TABLE "laboratory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviewCount" INTEGER NOT NULL,
    "accreditation" TEXT NOT NULL,
    "turnaround" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "facilities" TEXT[] NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "laboratory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "laboratory_service" (
    "id" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "turnaround" TEXT NOT NULL,
    "preparation" TEXT NOT NULL,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "laboratory_service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "laboratory_review" (
    "id" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "laboratory_review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "laboratory_booking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "laboratoryId" TEXT NOT NULL,
    "laboratoryServiceId" TEXT NOT NULL,
    "reservationDate" DATE NOT NULL,
    "queueNumber" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "laboratory_booking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "laboratory_status_city_idx" ON "laboratory"("status", "city");
CREATE INDEX "laboratory_service_laboratoryId_status_idx" ON "laboratory_service"("laboratoryId", "status");
CREATE INDEX "laboratory_review_laboratoryId_createdAt_idx" ON "laboratory_review"("laboratoryId", "createdAt");
CREATE UNIQUE INDEX "laboratory_booking_laboratoryId_reservationDate_queueNumber_key" ON "laboratory_booking"("laboratoryId", "reservationDate", "queueNumber");
CREATE INDEX "laboratory_booking_userId_reservationDate_idx" ON "laboratory_booking"("userId", "reservationDate");
CREATE INDEX "laboratory_booking_laboratoryId_reservationDate_idx" ON "laboratory_booking"("laboratoryId", "reservationDate");

ALTER TABLE "laboratory_service" ADD CONSTRAINT "laboratory_service_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "laboratory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "laboratory_review" ADD CONSTRAINT "laboratory_review_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "laboratory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "laboratory_booking" ADD CONSTRAINT "laboratory_booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "laboratory_booking" ADD CONSTRAINT "laboratory_booking_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "laboratory_booking" ADD CONSTRAINT "laboratory_booking_laboratoryServiceId_fkey" FOREIGN KEY ("laboratoryServiceId") REFERENCES "laboratory_service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
