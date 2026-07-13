-- CRM 活動紀錄（org-scoped，類似會議記錄）。用 IF NOT EXISTS 讓 migration 可重複套用。
CREATE TABLE IF NOT EXISTS "CrmEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT '活動',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "link" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CrmEvent_organizationId_idx" ON "CrmEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "CrmEvent_date_idx" ON "CrmEvent"("date");
DO $$ BEGIN
    ALTER TABLE "CrmEvent"
        ADD CONSTRAINT "CrmEvent_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
