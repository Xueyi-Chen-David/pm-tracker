-- ─────────────────────────────────────────────────────────────
-- 薪資勞健保合規（Phase 1）
--   PayrollSetting   ：每組織一份費率 / 投保上限設定（可帶當年法定預設）。
--   InsuranceBracket ：投保金額分級表（工資→投保金額對應）。
--   SalaryProfile    ：加投保薪資 / 眷口 / 加保旗標 / 勞退自提率。
--   Payslip          ：加勞健保自付、勞退自提，及公司負擔（雇主成本）欄位。
--   OrganizationMember：加到職日（特休年資）。
-- 純新增欄位 / 資料表，皆有預設值，不影響既有資料。
-- ─────────────────────────────────────────────────────────────

-- OrganizationMember：到職日
ALTER TABLE "OrganizationMember" ADD COLUMN "hireDate" DATE;

-- SalaryProfile：勞健保 / 勞退欄位
ALTER TABLE "SalaryProfile" ADD COLUMN "insuredSalary" INTEGER;
ALTER TABLE "SalaryProfile" ADD COLUMN "dependents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalaryProfile" ADD COLUMN "laborInsured" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryProfile" ADD COLUMN "healthInsured" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryProfile" ADD COLUMN "pensionEnrolled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalaryProfile" ADD COLUMN "pensionSelfRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Payslip：員工自付（已含入 deductionTotal / netPay）
ALTER TABLE "Payslip" ADD COLUMN "insuredSalary" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "laborInsEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "healthInsEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "pensionSelfEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- Payslip：公司負擔（雇主成本，不影響員工實發）
ALTER TABLE "Payslip" ADD COLUMN "laborInsEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "healthInsEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "pensionEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "occupationalEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "supplementaryEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "Payslip" ADD COLUMN "employerCostTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- PayrollSetting（每組織一份）
CREATE TABLE "PayrollSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "laborRate" DOUBLE PRECISION NOT NULL DEFAULT 0.125,
    "laborEmployeeShare" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "laborEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "healthRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0517,
    "healthEmployeeShare" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "healthEmployerShare" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "healthAvgDependents" DOUBLE PRECISION NOT NULL DEFAULT 0.57,
    "pensionEmployerRate" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "occupationalRate" DOUBLE PRECISION NOT NULL DEFAULT 0.002,
    "supplementaryRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0211,
    "laborCeiling" INTEGER NOT NULL DEFAULT 45800,
    "healthCeiling" INTEGER NOT NULL DEFAULT 313000,
    "pensionCeiling" INTEGER NOT NULL DEFAULT 150000,
    "minWageMonthly" INTEGER NOT NULL DEFAULT 29500,
    "minWageHourly" INTEGER NOT NULL DEFAULT 196,
    "seededYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollSetting_organizationId_key" ON "PayrollSetting"("organizationId");
ALTER TABLE "PayrollSetting" ADD CONSTRAINT "PayrollSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InsuranceBracket（投保金額分級表）
CREATE TABLE "InsuranceBracket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InsuranceBracket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InsuranceBracket_organizationId_amount_key" ON "InsuranceBracket"("organizationId", "amount");
CREATE INDEX "InsuranceBracket_organizationId_sortOrder_idx" ON "InsuranceBracket"("organizationId", "sortOrder");
ALTER TABLE "InsuranceBracket" ADD CONSTRAINT "InsuranceBracket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
