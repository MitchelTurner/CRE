-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "situsAddress" TEXT,
    "landUseCode" TEXT,
    "landUseDesc" TEXT,
    "propType" TEXT,
    "subdivision" TEXT,
    "deedDate" TIMESTAMP(3),
    "fairMarketVal" INTEGER,
    "rawAttributes" JSONB NOT NULL,
    "ownerId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "isCommercial" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "mailingAddress" TEXT NOT NULL DEFAULT '',
    "mailingCity" TEXT,
    "mailingState" TEXT,
    "mailingZip" TEXT,
    "isEntity" BOOLEAN NOT NULL DEFAULT false,
    "isAbsentee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoreVersion" TEXT NOT NULL,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "digestId" TEXT,
    "whyNow" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "leadCount" INTEGER NOT NULL,
    "htmlBody" TEXT NOT NULL,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSeen" INTEGER NOT NULL DEFAULT 0,
    "recordsUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_pin_key" ON "Parcel"("pin");

-- CreateIndex
CREATE INDEX "Parcel_landUseCode_idx" ON "Parcel"("landUseCode");

-- CreateIndex
CREATE INDEX "Parcel_isCommercial_isActive_idx" ON "Parcel"("isCommercial", "isActive");

-- CreateIndex
CREATE INDEX "Parcel_ownerId_idx" ON "Parcel"("ownerId");

-- CreateIndex
CREATE INDEX "Owner_nameNormalized_idx" ON "Owner"("nameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_nameNormalized_mailingAddress_key" ON "Owner"("nameNormalized", "mailingAddress");

-- CreateIndex
CREATE INDEX "Score_parcelId_scoredAt_idx" ON "Score"("parcelId", "scoredAt");

-- CreateIndex
CREATE INDEX "Score_total_idx" ON "Score"("total");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_parcelId_idx" ON "Lead"("parcelId");

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signal" ADD CONSTRAINT "Signal_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

