ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "submarket" TEXT;
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "countySlug" TEXT NOT NULL DEFAULT 'greenville';

CREATE INDEX IF NOT EXISTS "Parcel_submarket_idx" ON "Parcel"("submarket");
CREATE INDEX IF NOT EXISTS "Parcel_countySlug_idx" ON "Parcel"("countySlug");

ALTER TABLE "EventAttendee" ADD COLUMN IF NOT EXISTS "metAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "EventAttendee_metAt_idx" ON "EventAttendee"("metAt");

CREATE TABLE IF NOT EXISTS "SaleComp" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT,
    "pin" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "grantor" TEXT,
    "grantee" TEXT,
    "salePrice" INTEGER,
    "buyerType" TEXT,
    "book" TEXT,
    "page" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleComp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaleComp_parcelId_recordedAt_idx" ON "SaleComp"("parcelId", "recordedAt");
CREATE INDEX IF NOT EXISTS "SaleComp_pin_idx" ON "SaleComp"("pin");
CREATE INDEX IF NOT EXISTS "SaleComp_recordedAt_idx" ON "SaleComp"("recordedAt");

DO $$ BEGIN
  ALTER TABLE "SaleComp" ADD CONSTRAINT "SaleComp_parcelId_fkey"
    FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
