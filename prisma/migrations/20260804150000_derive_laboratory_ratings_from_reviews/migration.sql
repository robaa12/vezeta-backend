ALTER TABLE "laboratory" ALTER COLUMN "rating" SET DEFAULT 0;
ALTER TABLE "laboratory" ALTER COLUMN "reviewCount" SET DEFAULT 0;

UPDATE "laboratory" AS laboratory
SET
  "rating" = COALESCE((
    SELECT AVG(review."rating")
    FROM "laboratory_review" AS review
    WHERE review."laboratoryId" = laboratory."id"
  ), 0),
  "reviewCount" = (
    SELECT COUNT(*)
    FROM "laboratory_review" AS review
    WHERE review."laboratoryId" = laboratory."id"
  );
