ALTER TABLE "laboratory_service" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "laboratory_service" ADD COLUMN "discountPercent" INTEGER;
ALTER TABLE "laboratory_service" DROP COLUMN "popular";
