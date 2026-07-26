-- CreateTable
CREATE TABLE IF NOT EXISTS "UserProgress" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL DEFAULT 'default',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "XpEvent" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL DEFAULT 'default',
    "action" TEXT NOT NULL,
    "xpDelta" INTEGER NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserBadge" (
    "id" TEXT NOT NULL,
    "userKey" TEXT NOT NULL DEFAULT 'default',
    "badgeId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "parcelId" TEXT,
    "personId" TEXT,
    "leadId" TEXT,
    "eventId" TEXT,
    "meetingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProgress_userKey_key" ON "UserProgress"("userKey");
CREATE INDEX IF NOT EXISTS "XpEvent_userKey_createdAt_idx" ON "XpEvent"("userKey", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "XpEvent_userKey_action_entityId_key" ON "XpEvent"("userKey", "action", "entityId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBadge_userKey_badgeId_key" ON "UserBadge"("userKey", "badgeId");
CREATE INDEX IF NOT EXISTS "UserBadge_userKey_earnedAt_idx" ON "UserBadge"("userKey", "earnedAt");
CREATE INDEX IF NOT EXISTS "Note_kind_createdAt_idx" ON "Note"("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "Note_parcelId_idx" ON "Note"("parcelId");
CREATE INDEX IF NOT EXISTS "Note_personId_idx" ON "Note"("personId");
CREATE INDEX IF NOT EXISTS "Note_leadId_idx" ON "Note"("leadId");
CREATE INDEX IF NOT EXISTS "Note_eventId_idx" ON "Note"("eventId");

ALTER TABLE "Note" ADD CONSTRAINT "Note_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
