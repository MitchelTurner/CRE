-- CreateTable
CREATE TABLE IF NOT EXISTS "FieldCapture" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageMime" TEXT,
    "imageBase64" TEXT,
    "distanceM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldCapture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FieldCapture_parcelId_createdAt_idx" ON "FieldCapture"("parcelId", "createdAt");
CREATE INDEX IF NOT EXISTS "FieldCapture_createdAt_idx" ON "FieldCapture"("createdAt");
CREATE INDEX IF NOT EXISTS "FieldCapture_latitude_longitude_idx" ON "FieldCapture"("latitude", "longitude");

DO $$ BEGIN
  ALTER TABLE "FieldCapture" ADD CONSTRAINT "FieldCapture_parcelId_fkey"
    FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
