-- ─────────────────────────────────────────────────────────────
-- 人資（HR）模組：自訂角色 / 權限、假別、薪資設定、薪資單。
--   • OrgRoleDef      自訂職能角色（人資 / 會計…），permissions 存權限 key。
--   • _MemberRoles    OrganizationMember ↔ OrgRoleDef 多對多（一人可兼多角色）。
--   • LeaveType       假別（paidPercent 決定薪資給付比例）。
--   • SalaryProfile   每位成員的薪資設定（月薪 / 時薪）。
--   • Payslip         每月薪資單（依出勤即時計算後落庫）。
--   • AttendanceRecord.leaveTypeId  請假時對應的假別（供薪資扣薪）。
-- 皆為純新增，不動既有資料。
-- ─────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN "leaveTypeId" TEXT;

-- CreateTable
CREATE TABLE "OrgRoleDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRoleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paidPercent" INTEGER NOT NULL DEFAULT 100,
    "annualQuotaDays" DOUBLE PRECISION,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "payType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "baseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "standardWorkDays" INTEGER NOT NULL DEFAULT 22,
    "standardHoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "overtimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.34,
    "allowances" JSONB,
    "deductions" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "payType" TEXT NOT NULL,
    "baseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "workedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leaveDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtimePay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "allowanceTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "leaveDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "absentDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductionTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MemberRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MemberRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AttendanceRecord_leaveTypeId_idx" ON "AttendanceRecord"("leaveTypeId");

-- CreateIndex
CREATE INDEX "OrgRoleDef_organizationId_idx" ON "OrgRoleDef"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRoleDef_organizationId_name_key" ON "OrgRoleDef"("organizationId", "name");

-- CreateIndex
CREATE INDEX "LeaveType_organizationId_idx" ON "LeaveType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_organizationId_name_key" ON "LeaveType"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryProfile_memberId_key" ON "SalaryProfile"("memberId");

-- CreateIndex
CREATE INDEX "SalaryProfile_organizationId_idx" ON "SalaryProfile"("organizationId");

-- CreateIndex
CREATE INDEX "Payslip_organizationId_periodYear_periodMonth_idx" ON "Payslip"("organizationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "Payslip_memberId_idx" ON "Payslip"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_organizationId_memberId_periodYear_periodMonth_key" ON "Payslip"("organizationId", "memberId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX "_MemberRoles_B_index" ON "_MemberRoles"("B");

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRoleDef" ADD CONSTRAINT "OrgRoleDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryProfile" ADD CONSTRAINT "SalaryProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryProfile" ADD CONSTRAINT "SalaryProfile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberRoles" ADD CONSTRAINT "_MemberRoles_A_fkey" FOREIGN KEY ("A") REFERENCES "OrgRoleDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MemberRoles" ADD CONSTRAINT "_MemberRoles_B_fkey" FOREIGN KEY ("B") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
