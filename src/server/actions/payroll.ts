"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireOrgPermission } from "@/server/org";
import {
  computePayslip as calcPayslip,
  parseMoneyLines,
  type AttendanceSummary,
  type LeaveTally,
  type PayType,
} from "@/lib/payroll";

/**
 * 薪資設定 / 薪資單。皆需 `payroll.manage` 權限（人資 / 管理者）。
 * 薪資單由 HR 產生時，依當月出席紀錄 + 打卡 + 薪資設定即時計算並落庫。
 */

const MoneyLineSchema = z.object({
  name: z.string().trim().min(1).max(40),
  amount: z.coerce.number().min(0).max(9_999_999),
});

const SalaryInput = z.object({
  memberId: z.string().min(1), // OrganizationMember.id
  payType: z.enum(["MONTHLY", "HOURLY"]),
  baseAmount: z.coerce.number().min(0).max(99_999_999),
  currency: z.string().trim().max(8).default("TWD"),
  standardWorkDays: z.coerce.number().int().min(1).max(31).default(22),
  standardHoursPerDay: z.coerce.number().min(1).max(24).default(8),
  overtimeMultiplier: z.coerce.number().min(1).max(5).default(1.34),
  allowances: z.array(MoneyLineSchema).default([]),
  deductions: z.array(MoneyLineSchema).default([]),
  note: z.string().trim().max(500).optional(),
});

/** 建立 / 更新某成員的薪資設定。 */
export async function upsertSalaryProfile(input: z.input<typeof SalaryInput>) {
  const { org } = await requireOrgPermission("payroll.manage");
  const d = SalaryInput.parse(input);
  // 確認 member 屬於本組織。
  const member = await db.organizationMember.findFirst({
    where: { id: d.memberId, organizationId: org.id },
    select: { id: true },
  });
  if (!member) throw new Error("該成員不屬於目前組織。");

  const data = {
    payType: d.payType,
    baseAmount: d.baseAmount,
    currency: d.currency || "TWD",
    standardWorkDays: d.standardWorkDays,
    standardHoursPerDay: d.standardHoursPerDay,
    overtimeMultiplier: d.overtimeMultiplier,
    allowances: d.allowances,
    deductions: d.deductions,
    note: d.note || null,
  };
  await db.salaryProfile.upsert({
    where: { memberId: d.memberId },
    update: data,
    create: { organizationId: org.id, memberId: d.memberId, ...data },
  });
  revalidatePath("/payroll");
}

/** yyyy-MM 邊界（UTC）。 */
function monthBounds(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

/** 由某成員某月的出席紀錄 + 打卡整理出勤彙總（供薪資計算）。 */
async function gatherAttendance(
  orgId: string,
  userId: string,
  year: number,
  month: number,
  standardHoursPerDay: number,
): Promise<AttendanceSummary> {
  const { start, end } = monthBounds(year, month);
  const [records, punches] = await Promise.all([
    db.attendanceRecord.findMany({
      where: { organizationId: orgId, userId, date: { gte: start, lt: end } },
      select: {
        present: true,
        holiday: true,
        leave: true,
        leaveTypeId: true,
        leaveType: { select: { name: true, paidPercent: true } },
      },
    }),
    db.checkIn.findMany({
      where: {
        organizationId: orgId,
        userId,
        valid: true,
        date: { gte: start, lt: end },
      },
      orderBy: { at: "asc" },
      select: { date: true, at: true, kind: true },
    }),
  ]);

  let presentDays = 0;
  let absentDays = 0;
  const leaveMap = new Map<string, LeaveTally>();
  for (const r of records) {
    if (r.holiday) continue; // 休假：不算出勤也不算缺勤，也不影響薪資
    if (r.leave) {
      const key = r.leaveTypeId ?? "__none";
      // 未指定假別的請假：視為全薪（100%），避免誤扣；HR 可補指派假別。
      const name = r.leaveType?.name ?? "未指定假別";
      const paidPercent = r.leaveType?.paidPercent ?? 100;
      const cur = leaveMap.get(key) ?? { name, paidPercent, days: 0 };
      cur.days += 1;
      leaveMap.set(key, cur);
      continue;
    }
    if (r.present) presentDays += 1;
    else absentDays += 1; // 明確登記的缺席（不含顯示層的「未打卡」自動缺席）
  }

  // 打卡 → 每日工時（最早上班 ~ 最晚下班）與加班（超過標準工時）。
  const byDate = new Map<string, { ins: Date[]; outs: Date[] }>();
  for (const p of punches) {
    const ds = p.date.toISOString().slice(0, 10);
    const slot = byDate.get(ds) ?? { ins: [], outs: [] };
    if (p.kind === "in") slot.ins.push(p.at);
    else if (p.kind === "out") slot.outs.push(p.at);
    byDate.set(ds, slot);
  }
  let workedHours = 0;
  let overtimeHours = 0;
  for (const { ins, outs } of byDate.values()) {
    if (!ins.length || !outs.length) continue;
    const firstIn = ins[0].getTime();
    const lastOut = outs[outs.length - 1].getTime();
    const worked = Math.max(0, (lastOut - firstIn) / 3_600_000);
    workedHours += worked;
    overtimeHours += Math.max(0, worked - standardHoursPerDay);
  }
  workedHours = Math.round(workedHours * 100) / 100;
  overtimeHours = Math.round(overtimeHours * 100) / 100;

  return {
    presentDays,
    absentDays,
    leaves: [...leaveMap.values()],
    workedHours,
    overtimeHours,
  };
}

const PeriodSchema = z.object({
  memberId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/** 產生（重算）某成員某月的薪資單。已存在則覆蓋（草稿）。 */
export async function computePayslip(input: z.input<typeof PeriodSchema>) {
  const { org, user } = await requireOrgPermission("payroll.manage");
  const d = PeriodSchema.parse(input);

  const member = await db.organizationMember.findFirst({
    where: { id: d.memberId, organizationId: org.id },
    select: { id: true, userId: true, salaryProfile: true },
  });
  if (!member) throw new Error("該成員不屬於目前組織。");
  if (!member.salaryProfile) {
    throw new Error("請先設定該成員的薪資，才能產生薪資單。");
  }
  const sp = member.salaryProfile;

  const att = await gatherAttendance(
    org.id,
    member.userId,
    d.year,
    d.month,
    sp.standardHoursPerDay,
  );

  const result = calcPayslip(
    {
      payType: sp.payType as PayType,
      baseAmount: Number(sp.baseAmount),
      standardWorkDays: sp.standardWorkDays,
      standardHoursPerDay: sp.standardHoursPerDay,
      overtimeMultiplier: sp.overtimeMultiplier,
      allowances: parseMoneyLines(sp.allowances),
      deductions: parseMoneyLines(sp.deductions),
    },
    att,
  );

  const data = {
    payType: result.payType,
    baseAmount: result.baseAmount,
    currency: sp.currency,
    workedDays: result.workedDays,
    leaveDays: result.leaveDays,
    absentDays: result.absentDays,
    overtimeHours: result.overtimeHours,
    grossPay: result.grossPay,
    overtimePay: result.overtimePay,
    allowanceTotal: result.allowanceTotal,
    leaveDeduction: result.leaveDeduction,
    absentDeduction: result.absentDeduction,
    deductionTotal: result.deductionTotal,
    netPay: result.netPay,
    breakdown: result.lines,
    createdById: user.id,
  };

  await db.payslip.upsert({
    where: {
      organizationId_memberId_periodYear_periodMonth: {
        organizationId: org.id,
        memberId: d.memberId,
        periodYear: d.year,
        periodMonth: d.month,
      },
    },
    // 重算：回到草稿狀態，覆蓋所有計算欄位。
    update: { ...data, status: "draft" },
    create: {
      organizationId: org.id,
      memberId: d.memberId,
      periodYear: d.year,
      periodMonth: d.month,
      status: "draft",
      ...data,
    },
  });
  revalidatePath("/payroll");
}

/** 產生（重算）當月所有「已設定薪資」成員的薪資單。 */
export async function computeAllPayslips(input: { year: number; month: number }) {
  const { org } = await requireOrgPermission("payroll.manage");
  const year = z.coerce.number().int().min(2000).max(2100).parse(input.year);
  const month = z.coerce.number().int().min(1).max(12).parse(input.month);

  const members = await db.organizationMember.findMany({
    where: { organizationId: org.id, active: true, salaryProfile: { isNot: null } },
    select: { id: true },
  });
  for (const m of members) {
    await computePayslip({ memberId: m.id, year, month });
  }
  revalidatePath("/payroll");
  return { count: members.length };
}

/** 核定 / 取消核定薪資單（finalized / draft）。 */
export async function setPayslipStatus(id: string, finalized: boolean) {
  const { org } = await requireOrgPermission("payroll.manage");
  await db.payslip.updateMany({
    where: { id, organizationId: org.id },
    data: { status: finalized ? "finalized" : "draft" },
  });
  revalidatePath("/payroll");
}

/** 刪除薪資單。 */
export async function deletePayslip(id: string) {
  const { org } = await requireOrgPermission("payroll.manage");
  await db.payslip.deleteMany({ where: { id, organizationId: org.id } });
  revalidatePath("/payroll");
}
