-- Phase 3 proprietary data: SF + listing flag for matching / coverage KPI
ALTER TABLE "BuildingAttributes" ADD COLUMN IF NOT EXISTS "buildingSf" INTEGER;
ALTER TABLE "BuildingAttributes" ADD COLUMN IF NOT EXISTS "isListed" BOOLEAN NOT NULL DEFAULT false;
