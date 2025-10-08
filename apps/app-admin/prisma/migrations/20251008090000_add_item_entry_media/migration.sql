DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'itementrymediatype'
  ) THEN
    CREATE TYPE "ItemEntryMediaType" AS ENUM ('PHOTO', 'VIDEO');
  END IF;
END
$$;

CREATE TABLE "ItemEntryMedia" (
  "id" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "caption" TEXT,
  "type" "ItemEntryMediaType" NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemEntryMedia_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ItemEntryMedia"
  ADD CONSTRAINT "ItemEntryMedia_entryId_fkey"
  FOREIGN KEY ("entryId") REFERENCES "ItemEntry"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ItemEntryMedia_entryId_idx" ON "ItemEntryMedia" ("entryId");
CREATE INDEX "ItemEntryMedia_type_idx" ON "ItemEntryMedia" ("type");

-- Backfill existing photos
INSERT INTO "ItemEntryMedia" ("id", "entryId", "url", "caption", "type", "order")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 24) AS id,
  ie."id",
  photo.value,
  NULL::TEXT,
  'PHOTO'::"ItemEntryMediaType",
  photo.ord - 1
FROM "ItemEntry" ie
CROSS JOIN LATERAL (
  SELECT value, ord
  FROM unnest(ie."photos") WITH ORDINALITY AS t(value, ord)
) AS photo
WHERE array_length(ie."photos", 1) IS NOT NULL;

-- Backfill existing videos
INSERT INTO "ItemEntryMedia" ("id", "entryId", "url", "caption", "type", "order")
SELECT
  substr(md5(random()::text || clock_timestamp()::text), 1, 24) AS id,
  ie."id",
  video.value,
  NULL::TEXT,
  'VIDEO'::"ItemEntryMediaType",
  video.ord - 1
FROM "ItemEntry" ie
CROSS JOIN LATERAL (
  SELECT value, ord
  FROM unnest(ie."videos") WITH ORDINALITY AS t(value, ord)
) AS video
WHERE array_length(ie."videos", 1) IS NOT NULL;
