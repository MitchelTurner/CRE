ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "lastOutcome" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3);

ALTER TABLE "LeadFeedback" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE INDEX IF NOT EXISTS "Lead_snoozedUntil_idx" ON "Lead"("snoozedUntil");
CREATE INDEX IF NOT EXISTS "LeadFeedback_reason_idx" ON "LeadFeedback"("reason");
