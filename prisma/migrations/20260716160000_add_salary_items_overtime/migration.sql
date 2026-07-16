-- ─────────────────────────────────────────────────────────────
-- 薪資科目 + 加班費分級（Phase 2）＋二代健保/扣繳稅欄位（Phase 3 預留）
--   SalaryItemDef    ：薪資科目目錄（加項/減項、應稅、計入投保、經常性、免稅上限）。
--   SalaryProfile    ：加 items（科目金額）與 taxWithholdRate（就源扣繳率）。
--   PayrollSetting   ：加班費倍率 §24 + 二代健保門檻。
--   Payslip          ：加二代健保員工自付、扣繳稅、應稅所得、獎金快照。
-- 純新增欄位 / 資料表，皆有預設值，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

-- SalaryProfile
ALTER TABLE "SalaryProfile" ADD COLUMN "items" JSONB;
ALTER TABLE "SalaryProfile" ADD COLUMN "taxWithholdRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- PayrollSetting：加班費 §24
ALTER TABLE "PayrollSetting" ADD COLUMN "overtimeDivisor" INTEGER NOT NULL DEFAULT 240;
ALTER TABLE "PayrollSetting" ADD COLUMN "otWeekday1" DOUBLE PRECISION NOT NULL DEFAULT 1.34;
ALTER TABLE "PayrollSetting" ADD COLUMN "otWeekday2" DOUBLE PRECISION NOT NULL DEFAULT 1.67;
ALTER TABLE "PayrollSetting" ADD COLUMN "otRestday1" DOUBLE PRECISION NOT NULL DEFAULT 1.34;
ALTER TABLE "PayrollSetting" ADD COLUMN "otRestday2" DOUBLE PRECISION NOT NULL DEFAULT 1.67;
ALTER TABLE "PayrollSetting" ADD COLUMN "otRestday3" DOUBLE PRECISION NOT NULL DEFAULT 2.67;
-- PayrollSetting：二代健保門檻
ALTER TABLE "PayrollSetting" ADD COLUMN "supplementaryBonusMultiple" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "PayrollSetting" ADD COLUMN "supplementarySingleMin" INTEGER NOT NULL DEFAULT 20000;

-- Payslip：Phase 2/3 欄位
ALTER TABLE "Payslip" ADD COLUMN "supplementaryEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "incomeTaxWithheld" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "taxableIncome" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "bonusAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- SalaryItemDef（薪資科目目錄）
CREATE TABLE "SalaryItemDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'EARNING',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "countsToInsurance" BOOLEAN NOT NULL DEFAULT true,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "taxFreeLimit" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryItemDef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalaryItemDef_organizationId_name_key" ON "SalaryItemDef"("organizationId", "name");
CREATE INDEX "SalaryItemDef_organizationId_idx" ON "SalaryItemDef"("organizationId");
ALTER TABLE "SalaryItemDef" ADD CONSTRAINT "SalaryItemDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
