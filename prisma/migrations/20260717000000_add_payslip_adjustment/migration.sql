-- ─────────────────────────────────────────────────────────────
-- 當月一次性獎金 / 調整（三節 / 臨時 / 年終獎金、臨時扣款…）
--   PayslipAdjustment：只影響某成員某年某月，不進常駐薪資設定；
--   重算薪資單時折算進去，發完該月即結束。旗標於建立當下由科目快照。
-- 純新增資料表，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

CREATE TABLE "PayslipAdjustment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EARNING',
    "amount" DECIMAL(12,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "countsToInsurance" BOOLEAN NOT NULL DEFAULT false,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "taxFreeLimit" INTEGER,
    "sourceDefId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayslipAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayslipAdjustment_organizationId_memberId_periodYear_periodMonth_idx" ON "PayslipAdjustment"("organizationId", "memberId", "periodYear", "periodMonth");
ALTER TABLE "PayslipAdjustment" ADD CONSTRAINT "PayslipAdjustment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayslipAdjustment" ADD CONSTRAINT "PayslipAdjustment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
