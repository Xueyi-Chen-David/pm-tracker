-- CrmCompanyNote：從「一間企業一段共用文字」改成「多筆、可回覆的進度備註動態」。
-- 清掉從沒真的寫過內容的空殼列（只是開過對話框存了 upsert 的 null note）。
DELETE FROM "CrmCompanyNote" WHERE "note" IS NULL OR trim("note") = '';

-- DropIndex
DROP INDEX "CrmCompanyNote_organizationId_company_key";
DROP INDEX "CrmCompanyNote_organizationId_idx";

-- AlterTable
ALTER TABLE "CrmCompanyNote" RENAME COLUMN "note" TO "body";
ALTER TABLE "CrmCompanyNote" ALTER COLUMN "body" SET NOT NULL;
ALTER TABLE "CrmCompanyNote" RENAME COLUMN "updatedById" TO "authorId";
ALTER TABLE "CrmCompanyNote" DROP COLUMN "updatedAt";
ALTER TABLE "CrmCompanyNote" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "CrmCompanyNote_organizationId_company_idx" ON "CrmCompanyNote"("organizationId", "company");
CREATE INDEX "CrmCompanyNote_parentId_idx" ON "CrmCompanyNote"("parentId");

-- AddForeignKey
ALTER TABLE "CrmCompanyNote" ADD CONSTRAINT "CrmCompanyNote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CrmCompanyNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
