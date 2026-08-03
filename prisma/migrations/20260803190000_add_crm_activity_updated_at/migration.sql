-- AlterTable: 活動/跟進要能編輯了，補回 updatedAt（既有列 backfill 成等於 createdAt）。
ALTER TABLE "CrmActivity" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "CrmActivity" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "CrmActivity" ALTER COLUMN "updatedAt" SET NOT NULL;
