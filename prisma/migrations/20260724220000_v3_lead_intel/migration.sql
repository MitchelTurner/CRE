-- AlterTable Parcel
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "floodZone" TEXT;

-- AlterTable Owner
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "clusterKey" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "portfolioScore" INTEGER;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "relatedOwnerIds" JSONB;

-- CreateTable EnrichmentReview
CREATE TABLE IF NOT EXISTS "EnrichmentReview" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reasons" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EnrichmentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable CrmSync
CREATE TABLE IF NOT EXISTS "CrmSync" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "payload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmSync_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "Parcel_latitude_longitude_idx" ON "Parcel"("latitude", "longitude");
CREATE INDEX IF NOT EXISTS "Owner_clusterKey_idx" ON "Owner"("clusterKey");
CREATE INDEX IF NOT EXISTS "EnrichmentReview_status_createdAt_idx" ON "EnrichmentReview"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EnrichmentReview_parcelId_idx" ON "EnrichmentReview"("parcelId");
CREATE INDEX IF NOT EXISTS "CrmSync_leadId_idx" ON "CrmSync"("leadId");
CREATE INDEX IF NOT EXISTS "CrmSync_provider_status_idx" ON "CrmSync"("provider", "status");

-- FKs
DO $$ BEGIN
  ALTER TABLE "EnrichmentReview" ADD CONSTRAINT "EnrichmentReview_parcelId_fkey"
    FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CrmSync" ADD CONSTRAINT "CrmSync_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
