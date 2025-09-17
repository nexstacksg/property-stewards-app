-- Convert inspector specialization from text[] to text

ALTER TABLE "Inspector"
  ALTER COLUMN "specialization" DROP NOT NULL,
  ALTER COLUMN "specialization" TYPE TEXT USING (
    CASE
      WHEN "specialization" IS NULL THEN NULL
      ELSE array_to_string("specialization", ', ')
    END
  );
