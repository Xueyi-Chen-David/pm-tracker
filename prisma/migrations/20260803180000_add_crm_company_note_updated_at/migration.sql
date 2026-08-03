-- AlterTable: 留言要能編輯了，補回 updatedAt（既有列先backfill成等於 createdAt，
-- 不然會全部看起來像「剛剛才編輯過」）。
ALTER TABLE "CrmCompanyNote" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "CrmCompanyNote" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "CrmCompanyNote" ALTER COLUMN "updatedAt" SET NOT NULL;
