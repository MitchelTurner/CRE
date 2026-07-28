-- Industrial Signals module (occupier space-change intelligence)
-- Orthogonal to parcel enrichment Signal table.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "IndustrialSignalType" AS ENUM (
  'EQUIPMENT_FINANCING',
  'FLEET_CHANGE',
  'NEW_CARRIER',
  'ENV_PERMIT',
  'GENERATOR_STATUS_CHANGE',
  'SBA_LOAN',
  'IMPORT_VOLUME',
  'HIRING_SURGE',
  'YARD_UTILIZATION',
  'UTILITY_CAPACITY',
  'REFERRAL'
);

CREATE TABLE "Company" (
  "id" TEXT NOT NULL,
  "canonicalName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "naics" TEXT,
  "dotNumber" TEXT,
  "scSosEntityId" TEXT,
  "employeeCount" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");
CREATE UNIQUE INDEX "Company_dotNumber_key" ON "Company"("dotNumber");
CREATE UNIQUE INDEX "Company_scSosEntityId_key" ON "Company"("scSosEntityId");
CREATE INDEX "Company_normalizedName_idx" ON "Company"("normalizedName");

CREATE TABLE "CompanyAlias" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyAlias_normalizedName_idx" ON "CompanyAlias"("normalizedName");
CREATE INDEX "CompanyAlias_companyId_idx" ON "CompanyAlias"("companyId");

CREATE TABLE "Site" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "parcelId" TEXT,
  "rawAddress" TEXT NOT NULL,
  "normalized" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "matchMethod" TEXT,
  "matchConf" DOUBLE PRECISION,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Site_parcelId_idx" ON "Site"("parcelId");
CREATE INDEX "Site_normalized_idx" ON "Site"("normalized");
CREATE INDEX "Site_companyId_idx" ON "Site"("companyId");

CREATE TABLE "IndustrialSignal" (
  "id" TEXT NOT NULL,
  "type" "IndustrialSignalType" NOT NULL,
  "subtype" TEXT,
  "companyId" TEXT NOT NULL,
  "siteId" TEXT,
  "parcelId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "weight" DOUBLE PRECISION NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "headline" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dismissedAt" TIMESTAMP(3),
  "dismissedBy" TEXT,
  CONSTRAINT "IndustrialSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IndustrialSignal_source_sourceRef_key" ON "IndustrialSignal"("source", "sourceRef");
CREATE INDEX "IndustrialSignal_companyId_occurredAt_idx" ON "IndustrialSignal"("companyId", "occurredAt");
CREATE INDEX "IndustrialSignal_parcelId_occurredAt_idx" ON "IndustrialSignal"("parcelId", "occurredAt");
CREATE INDEX "IndustrialSignal_type_occurredAt_idx" ON "IndustrialSignal"("type", "occurredAt");

CREATE TABLE "SpaceScore" (
  "companyId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "bandLabel" TEXT NOT NULL,
  "topSignalIds" TEXT[],
  "computedAt" TIMESTAMP(3) NOT NULL,
  "previousScore" DOUBLE PRECISION,
  CONSTRAINT "SpaceScore_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE "SignalRaw" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceRef" TEXT NOT NULL,
  "bodyHash" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "SignalRaw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignalRaw_source_sourceRef_bodyHash_key" ON "SignalRaw"("source", "sourceRef", "bodyHash");
CREATE INDEX "SignalRaw_source_fetchedAt_idx" ON "SignalRaw"("source", "fetchedAt");
CREATE INDEX "SignalRaw_processedAt_idx" ON "SignalRaw"("processedAt");

CREATE TABLE "FmcsaSnapshot" (
  "id" TEXT NOT NULL,
  "dotNumber" TEXT NOT NULL,
  "snapshotMonth" TEXT NOT NULL,
  "legalName" TEXT NOT NULL,
  "phyStreet" TEXT,
  "phyCity" TEXT,
  "phyState" TEXT,
  "phyZip" TEXT,
  "powerUnits" INTEGER NOT NULL DEFAULT 0,
  "drivers" INTEGER NOT NULL DEFAULT 0,
  "cargoCarried" TEXT,
  "mcs150Mileage" INTEGER,
  "raw" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FmcsaSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FmcsaSnapshot_dotNumber_snapshotMonth_key" ON "FmcsaSnapshot"("dotNumber", "snapshotMonth");
CREATE INDEX "FmcsaSnapshot_phyState_phyZip_idx" ON "FmcsaSnapshot"("phyState", "phyZip");
CREATE INDEX "FmcsaSnapshot_snapshotMonth_idx" ON "FmcsaSnapshot"("snapshotMonth");

CREATE TABLE "ResolutionReview" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rawName" TEXT,
  "rawAddress" TEXT,
  "normalizedName" TEXT,
  "candidateId" TEXT,
  "candidateScore" DOUBLE PRECISION,
  "payload" JSONB,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  CONSTRAINT "ResolutionReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResolutionReview_status_createdAt_idx" ON "ResolutionReview"("status", "createdAt");
CREATE INDEX "ResolutionReview_kind_status_idx" ON "ResolutionReview"("kind", "status");

CREATE TABLE "SignalPlaybook" (
  "id" TEXT NOT NULL,
  "type" "IndustrialSignalType" NOT NULL,
  "subtype" TEXT NOT NULL DEFAULT '',
  "channel" TEXT NOT NULL,
  "urgencyDays" INTEGER NOT NULL,
  "talkTrack" TEXT NOT NULL,
  CONSTRAINT "SignalPlaybook_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignalPlaybook_type_subtype_key" ON "SignalPlaybook"("type", "subtype");

CREATE TABLE "BuildingAttributes" (
  "parcelId" TEXT NOT NULL,
  "clearHeightFt" DOUBLE PRECISION,
  "dockDoors" INTEGER,
  "driveInDoors" INTEGER,
  "sprinklerType" TEXT,
  "powerAmps" INTEGER,
  "powerVolts" INTEGER,
  "railServed" BOOLEAN,
  "yardAcres" DOUBLE PRECISION,
  "trailerStalls" INTEGER,
  "officeSf" INTEGER,
  "craneCapacityTon" DOUBLE PRECISION,
  "yearBuilt" INTEGER,
  "verifiedAt" TIMESTAMP(3),
  "verifiedBy" TEXT,
  "sourceNotes" TEXT,
  CONSTRAINT "BuildingAttributes_pkey" PRIMARY KEY ("parcelId")
);

CREATE TABLE "Requirement" (
  "id" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "minSf" INTEGER,
  "maxSf" INTEGER,
  "minClearHeight" DOUBLE PRECISION,
  "minDockDoors" INTEGER,
  "minYardAcres" DOUBLE PRECISION,
  "railRequired" BOOLEAN NOT NULL DEFAULT false,
  "submarkets" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "YardObservation" (
  "id" TEXT NOT NULL,
  "siteId" TEXT,
  "parcelId" TEXT,
  "flightDate" TIMESTAMP(3) NOT NULL,
  "trailerCount" INTEGER,
  "containerCount" INTEGER,
  "yardCoveragePct" DOUBLE PRECISION,
  "imageRef" TEXT,
  "annotatedImageRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "YardObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YardObservation_siteId_flightDate_idx" ON "YardObservation"("siteId", "flightDate");
CREATE INDEX "YardObservation_parcelId_flightDate_idx" ON "YardObservation"("parcelId", "flightDate");

ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialSignal" ADD CONSTRAINT "IndustrialSignal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndustrialSignal" ADD CONSTRAINT "IndustrialSignal_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SpaceScore" ADD CONSTRAINT "SpaceScore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trigram indexes for fuzzy company/site matching
CREATE INDEX "Company_normalizedName_trgm_idx" ON "Company" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "CompanyAlias_normalizedName_trgm_idx" ON "CompanyAlias" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "Site_normalized_trgm_idx" ON "Site" USING gin ("normalized" gin_trgm_ops);

-- Playbook seeds
INSERT INTO "SignalPlaybook" ("id", "type", "subtype", "channel", "urgencyDays", "talkTrack") VALUES
('pb_ucc_mh', 'EQUIPMENT_FINANCING', 'material_handling', 'call', 7,
 'Saw you''re putting in racking/conveyor ({{detail}}) — are you building out the current space or is this a stopgap? I ask because there are buildings in Greer with ESFR and 32'' clear that aren''t on the market yet.'),
('pb_ucc_prod', 'EQUIPMENT_FINANCING', 'production_equipment', 'call', 14,
 'Noticed {{company}} financed production equipment ({{detail}}). Power and floor loading get tight fast on these installs — happy to walk which Greenville-Spartanburg shells can actually take the load.'),
('pb_ucc_fleet', 'EQUIPMENT_FINANCING', 'fleet', 'call', 7,
 '{{company}} just financed fleet assets ({{detail}}). Where are you parking them? IOS inventory around I-85 is thin and mostly off-market.'),
('pb_ucc_fork', 'EQUIPMENT_FINANCING', 'forklift', 'call', 14,
 'Forklift financing at {{company}} usually means volume is up. Any pressure on dock count or clear height in the current box?'),
('pb_ucc_term', 'EQUIPMENT_FINANCING', 'termination', 'call', 21,
 'UCC termination on production gear at {{company}} with no replacement filing — sometimes that''s a line shut-down or disposition. Open to a quiet conversation about sublease / sale-leaseback options?'),
('pb_fmcsa_new', 'NEW_CARRIER', '', 'call', 7,
 'New FMCSA registrant {{company}} with {{detail}}. You''re going to need yard almost immediately — I cover truck parking / IOS along I-85 that rarely hits the MLS.'),
('pb_fmcsa_fleet', 'FLEET_CHANGE', 'growth', 'call', 7,
 '{{company}} grew fleet ({{detail}}). At that unit count, drop-and-hook needs roughly 1 trailer stall per 1.4 power units — where are you staging them today?'),
('pb_fmcsa_contr', 'FLEET_CHANGE', 'contraction', 'email', 21,
 'Fleet contraction signal at {{company}} ({{detail}}). If yard or warehouse is loosening up, I can quietly canvass sublease interest.'),
('pb_echo_permit', 'ENV_PERMIT', '', 'email', 21,
 'Saw the recent environmental permit activity for {{company}} ({{detail}}). Process changes often precede a space change — sharing our Greenville industrial snapshot in case helpful.'),
('pb_sba_504', 'SBA_LOAN', '504', 'email', 90,
 '{{company}} closed an SBA 504 ({{detail}}). Congrats on the owner-occupied move — I''ll keep you on our quarterly market note; revisit in ~36 months for expansion / sale-leaseback timing.'),
('pb_sba_7a', 'SBA_LOAN', '7a', 'email', 60,
 'SBA 7(a) approval for {{company}} ({{detail}}) — tagging as nurture. Reach out if working capital is funding a fit-out or second location.'),
('pb_yard_high', 'YARD_UTILIZATION', 'overflow', 'in_person', 7,
 'Attached annotated aerial for {{company}} — yard coverage >85% across two flights. Happy to walk overflow IOS options in person with the printout.');
