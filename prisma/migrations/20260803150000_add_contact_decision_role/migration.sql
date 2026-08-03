-- AlterTable
ALTER TABLE "CrmContact" ADD COLUMN     "decisionRole" TEXT,
ADD COLUMN     "reportsToId" TEXT;

-- CreateIndex
CREATE INDEX "CrmContact_reportsToId_idx" ON "CrmContact"("reportsToId");

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_reportsToId_fkey" FOREIGN KEY ("reportsToId") REFERENCES "CrmContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
