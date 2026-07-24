-- AlterTable
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "salePrice" INTEGER;
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "totalTax" DOUBLE PRECISION;
ALTER TABLE "Parcel" ADD COLUMN IF NOT EXISTS "paidDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosEntityId" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosStatus" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosRegisteredAgent" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosAgentAddress" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosFetchedAt" TIMESTAMP(3);
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "sosRaw" JSONB;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "leadType" TEXT NOT NULL DEFAULT 'seller';

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeadFeedback" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Parcel_fairMarketVal_idx" ON "Parcel"("fairMarketVal");
CREATE INDEX IF NOT EXISTS "Contact_ownerId_idx" ON "Contact"("ownerId");
CREATE INDEX IF NOT EXISTS "Signal_parcelId_type_idx" ON "Signal"("parcelId", "type");
CREATE INDEX IF NOT EXISTS "Signal_type_detectedAt_idx" ON "Signal"("type", "detectedAt");
CREATE INDEX IF NOT EXISTS "Lead_leadType_idx" ON "Lead"("leadType");
CREATE INDEX IF NOT EXISTS "LeadFeedback_leadId_idx" ON "LeadFeedback"("leadId");
CREATE INDEX IF NOT EXISTS "LeadFeedback_rating_idx" ON "LeadFeedback"("rating");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "LeadFeedback" ADD CONSTRAINT "LeadFeedback_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
