-- Add optional user relation to item entries

ALTER TABLE "ItemEntry"
ADD COLUMN "userId" TEXT;

CREATE INDEX "ItemEntry_userId_idx" ON "ItemEntry"("userId");

ALTER TABLE "ItemEntry"
ADD CONSTRAINT "ItemEntry_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
