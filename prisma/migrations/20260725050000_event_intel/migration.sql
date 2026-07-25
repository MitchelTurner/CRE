-- Event intelligence (M4–M9)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venue" TEXT,
    "city" TEXT,
    "hostOrg" TEXT,
    "url" TEXT,
    "sourceId" TEXT NOT NULL,
    "category" TEXT,
    "ownerDensity" TEXT,
    "audience" TEXT,
    "rawPayload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Event_dedupeKey_key" ON "Event"("dedupeKey");
CREATE INDEX IF NOT EXISTS "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX IF NOT EXISTS "Event_ownerDensity_status_idx" ON "Event"("ownerDensity", "status");
CREATE INDEX IF NOT EXISTS "Event_status_idx" ON "Event"("status");

CREATE TABLE IF NOT EXISTS "Person" (
    "id" TEXT NOT NULL,
    "nameRaw" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "company" TEXT,
    "title" TEXT,
    "source" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Person_nameNormalized_idx" ON "Person"("nameNormalized");
CREATE INDEX IF NOT EXISTS "Person_source_idx" ON "Person"("source");
CREATE INDEX IF NOT EXISTS "Person_nameNormalized_trgm_idx" ON "Person" USING GIN ("nameNormalized" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EventAttendee_eventId_personId_key" ON "EventAttendee"("eventId", "personId");
CREATE INDEX IF NOT EXISTS "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");
CREATE INDEX IF NOT EXISTS "EventAttendee_personId_idx" ON "EventAttendee"("personId");

CREATE TABLE IF NOT EXISTS "PersonOwnerMatch" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "confirmed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonOwnerMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PersonOwnerMatch_personId_ownerId_key" ON "PersonOwnerMatch"("personId", "ownerId");
CREATE INDEX IF NOT EXISTS "PersonOwnerMatch_ownerId_idx" ON "PersonOwnerMatch"("ownerId");
CREATE INDEX IF NOT EXISTS "PersonOwnerMatch_confirmed_idx" ON "PersonOwnerMatch"("confirmed");

CREATE TABLE IF NOT EXISTS "EventBrief" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "matchCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventBrief_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventBrief_eventId_createdAt_idx" ON "EventBrief"("eventId", "createdAt");

CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'quarterly',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "stats" JSONB NOT NULL,
    "htmlBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Report_kind_periodEnd_idx" ON "Report"("kind", "periodEnd");

CREATE INDEX IF NOT EXISTS "Owner_nameNormalized_trgm_idx" ON "Owner" USING GIN ("nameNormalized" gin_trgm_ops);

DO $$ BEGIN
  ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PersonOwnerMatch" ADD CONSTRAINT "PersonOwnerMatch_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PersonOwnerMatch" ADD CONSTRAINT "PersonOwnerMatch_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EventBrief" ADD CONSTRAINT "EventBrief_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
