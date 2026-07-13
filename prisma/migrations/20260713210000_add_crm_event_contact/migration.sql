-- CRM 活動可選關聯到某個客戶（聯絡人）。IF NOT EXISTS 讓 migration 可重複套用。
ALTER TABLE "CrmEvent" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
CREATE INDEX IF NOT EXISTS "CrmEvent_contactId_idx" ON "CrmEvent"("contactId");
DO $$ BEGIN
    ALTER TABLE "CrmEvent"
        ADD CONSTRAINT "CrmEvent_contactId_fkey"
        FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
