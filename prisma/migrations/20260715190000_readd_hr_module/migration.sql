-- Re-add HR module (custom roles/permissions, leave types, payroll) to the DB.
--
-- Context: the shared Neon DB was driven to `main`'s timeline, where
-- `20260715150000_remove_hr_module` DROPPED these tables. The `hr-management`
-- branch still declares the HR models in schema.prisma, so the runtime client
-- hit "table OrgRoleDef does not exist". This migration re-creates them.
--
-- ADDITIVE ONLY: it deliberately does NOT touch PushSubscription /
-- DailyReportReaction / Task.description (features that live on `main` and
-- exist in the shared DB). Do not fold destructive drops into this file.

-- AlterTable: leave-type reference on attendance rows
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrgRoleDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibleModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRoleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "LeaveType" (
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
CREATE TABLE IF NOT EXISTS "SalaryProfile" (
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
CREATE TABLE IF NOT EXISTS "Payslip" (
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
CREATE TABLE IF NOT EXISTS "_MemberRoles" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MemberRoles_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgRoleDef_organizationId_idx" ON "OrgRoleDef"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRoleDef_organizationId_name_key" ON "OrgRoleDef"("organizationId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveType_organizationId_idx" ON "LeaveType"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "LeaveType_organizationId_name_key" ON "LeaveType"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryProfile_memberId_key" ON "SalaryProfile"("memberId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalaryProfile_organizationId_idx" ON "SalaryProfile"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payslip_organizationId_periodYear_periodMonth_idx" ON "Payslip"("organizationId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Payslip_memberId_idx" ON "Payslip"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Payslip_organizationId_memberId_periodYear_periodMonth_key" ON "Payslip"("organizationId", "memberId", "periodYear", "periodMonth");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_MemberRoles_B_index" ON "_MemberRoles"("B");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceRecord_leaveTypeId_idx" ON "AttendanceRecord"("leaveTypeId");

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
