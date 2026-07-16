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
  type MoneyLine,
  type PayType,
} from "@/lib/payroll";
import {
  computeStatutory,
  employerSupplementaryPremium,
  type PayrollRates,
} from "@/lib/insurance";
import { resolveSalaryItems, parseMemberItems } from "@/lib/salary-items";

/** 四捨五入到兩位小數（金額）。 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

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
  // 勞健保 / 勞退
  insuredSalary: z.coerce.number().int().min(0).max(10_000_000).nullish(),
  dependents: z.coerce.number().int().min(0).max(3).default(0),
  laborInsured: z.boolean().default(true),
  healthInsured: z.boolean().default(true),
  pensionEnrolled: z.boolean().default(true),
  pensionSelfRate: z.coerce.number().min(0).max(0.06).default(0),
  // 薪資科目金額（Phase 2）
  items: z
    .array(
      z.object({
        defId: z.string().min(1),
        amount: z.coerce.number().min(0).max(99_999_999),
      }),
    )
    .default([]),
  // 薪資所得就源扣繳率（Phase 3；0–1）
  taxWithholdRate: z.coerce.number().min(0).max(1).default(0),
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
    insuredSalary: d.insuredSalary ?? null,
    dependents: d.dependents,
    laborInsured: d.laborInsured,
    healthInsured: d.healthInsured,
    pensionEnrolled: d.pensionEnrolled,
    pensionSelfRate: d.pensionSelfRate,
    items: d.items,
    taxWithholdRate: d.taxWithholdRate,
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

  // 打卡 → 每日工時（最早上班 ~ 最晚下班）與加班分級（§24：平日 / 休息日）。
  const byDate = new Map<string, { ins: Date[]; outs: Date[] }>();
  for (const p of punches) {
    const ds = p.date.toISOString().slice(0, 10);
    const slot = byDate.get(ds) ?? { ins: [], outs: [] };
    if (p.kind === "in") slot.ins.push(p.at);
    else if (p.kind === "out") slot.outs.push(p.at);
    byDate.set(ds, slot);
  }
  let workedHours = 0;
  const tiers = { wd1: 0, wd2: 0, rd1: 0, rd2: 0, rd3: 0 };
  for (const [ds, { ins, outs }] of byDate) {
    if (!ins.length || !outs.length) continue;
    const worked = Math.max(
      0,
      (outs[outs.length - 1].getTime() - ins[0].getTime()) / 3_600_000,
    );
    workedHours += worked;
    const weekday = new Date(`${ds}T00:00:00.000Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) {
      // 休息日 / 例假：全部工時皆為加班（前2 / 3–8 / 9+）。
      tiers.rd1 += Math.min(worked, 2);
      tiers.rd2 += Math.min(Math.max(0, worked - 2), 6);
      tiers.rd3 += Math.max(0, worked - 8);
    } else {
      // 平日：超過標準工時的部分為加班（前2 / 3+）。
      const ot = Math.max(0, worked - standardHoursPerDay);
      tiers.wd1 += Math.min(ot, 2);
      tiers.wd2 += Math.max(0, ot - 2);
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  workedHours = r2(workedHours);
  const overtimeTiers = {
    wd1: r2(tiers.wd1), wd2: r2(tiers.wd2),
    rd1: r2(tiers.rd1), rd2: r2(tiers.rd2), rd3: r2(tiers.rd3),
  };
  const overtimeHours = r2(
    overtimeTiers.wd1 + overtimeTiers.wd2 + overtimeTiers.rd1 + overtimeTiers.rd2 + overtimeTiers.rd3,
  );

  return {
    presentDays,
    absentDays,
    leaves: [...leaveMap.values()],
    workedHours,
    overtimeHours,
    overtimeTiers,
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

  // 薪資科目（Phase 2）：展開成加項 / 減項，並帶出「計入投保」「應稅」「非經常性(獎金)」合計。
  const itemDefs = await db.salaryItemDef.findMany({
    where: { organizationId: org.id },
    select: {
      id: true,
      name: true,
      kind: true,
      taxable: true,
      countsToInsurance: true,
      recurring: true,
      taxFreeLimit: true,
    },
  });
  const resolvedItems = resolveSalaryItems(itemDefs, parseMemberItems(sp.items));

  // 合併：舊的自由加給 / 扣除（未分類）＋科目展開的加項 / 減項。
  const legacyAllowances = parseMoneyLines(sp.allowances);
  const legacyAllowanceSum = legacyAllowances.reduce((a, l) => a + l.amount, 0);
  const allowances = [...legacyAllowances, ...resolvedItems.earnings];
  const deductionLines = [
    ...parseMoneyLines(sp.deductions),
    ...resolvedItems.deductions,
  ];

  // 投保用月工資：本薪（時薪換算月薪）＋計入投保的科目加項＋未分類加給。
  const baseMonthlyEquiv =
    sp.payType === "HOURLY"
      ? Number(sp.baseAmount) * sp.standardHoursPerDay * sp.standardWorkDays
      : Number(sp.baseAmount);
  const monthlyWage =
    baseMonthlyEquiv + resolvedItems.wageForInsurance + legacyAllowanceSum;

  // 勞健保 / 勞退：只有在組織已設定 PayrollSetting（帶過法定預設）時才自動計算，
  // 否則維持舊行為（僅手動固定扣除），確保未設定的組織不受影響。
  const setting = await db.payrollSetting.findUnique({
    where: { organizationId: org.id },
  });
  const statutoryLines: MoneyLine[] = [];
  let statutory: ReturnType<typeof computeStatutory> | null = null;
  let rates: PayrollRates | null = null;

  if (setting) {
    const brackets = await db.insuranceBracket.findMany({
      where: { organizationId: org.id },
      orderBy: { sortOrder: "asc" },
      select: { amount: true },
    });
    rates = {
      laborRate: setting.laborRate,
      laborEmployeeShare: setting.laborEmployeeShare,
      laborEmployerShare: setting.laborEmployerShare,
      healthRate: setting.healthRate,
      healthEmployeeShare: setting.healthEmployeeShare,
      healthEmployerShare: setting.healthEmployerShare,
      healthAvgDependents: setting.healthAvgDependents,
      pensionEmployerRate: setting.pensionEmployerRate,
      occupationalRate: setting.occupationalRate,
      supplementaryRate: setting.supplementaryRate,
      laborCeiling: setting.laborCeiling,
      healthCeiling: setting.healthCeiling,
      pensionCeiling: setting.pensionCeiling,
    };
    statutory = computeStatutory(
      rates,
      brackets.map((b) => b.amount),
      {
        wage: monthlyWage,
        insuredOverride: sp.insuredSalary,
        dependents: sp.dependents,
        pensionSelfRate: sp.pensionSelfRate,
        laborInsured: sp.laborInsured,
        healthInsured: sp.healthInsured,
        pensionEnrolled: sp.pensionEnrolled,
      },
    );
    if (statutory.laborEmployee > 0)
      statutoryLines.push({ label: "勞保自付", amount: statutory.laborEmployee });
    if (statutory.healthEmployee > 0)
      statutoryLines.push({
        label:
          sp.dependents > 0
            ? `健保自付（含 ${sp.dependents} 眷口）`
            : "健保自付",
        amount: statutory.healthEmployee,
      });
    if (statutory.pensionSelf > 0)
      statutoryLines.push({
        label: "勞退自提",
        amount: statutory.pensionSelf,
      });
  }

  // 加班費 §24 分級（月薪制）：時薪基數＝月薪 ÷ divisor（勞基法慣例 240）。有 setting 才啟用分級。
  const overtime =
    setting && sp.payType === "MONTHLY"
      ? {
          hourlyBase: Number(sp.baseAmount) / (setting.overtimeDivisor || 240),
          wd1: setting.otWeekday1,
          wd2: setting.otWeekday2,
          rd1: setting.otRestday1,
          rd2: setting.otRestday2,
          rd3: setting.otRestday3,
        }
      : undefined;

  const result = calcPayslip(
    {
      payType: sp.payType as PayType,
      baseAmount: Number(sp.baseAmount),
      standardWorkDays: sp.standardWorkDays,
      standardHoursPerDay: sp.standardHoursPerDay,
      overtimeMultiplier: sp.overtimeMultiplier,
      allowances,
      deductions: deductionLines,
      overtime,
    },
    att,
    statutoryLines,
  );

  // 二代健保雇主補充保費：以實際給付工資（應發）與投保金額差額估算。
  const supplementaryEmployer =
    setting && rates && statutory
      ? employerSupplementaryPremium(rates, result.grossPay, statutory.insuredHealth)
      : 0;
  const employerCostTotal =
    (statutory?.employerTotal ?? 0) + supplementaryEmployer;

  // ── Phase 3：員工端二代健保（高額獎金）＋薪資所得就源扣繳 ──
  const taxableIncome = Math.max(0, round2(result.grossPay - resolvedItems.taxFreeTotal));
  const bonusAmount = resolvedItems.bonusAmount;

  // 二代健保員工自付：年度累計非經常性獎金超過「投保金額 × 倍數」的部分 × 費率。
  let supplementaryEmployee = 0;
  if (setting && statutory && bonusAmount > 0) {
    const prior = await db.payslip.aggregate({
      where: {
        organizationId: org.id,
        memberId: d.memberId,
        periodYear: d.year,
        NOT: { periodMonth: d.month },
      },
      _sum: { bonusAmount: true },
    });
    const priorBonus = Number(prior._sum.bonusAmount ?? 0);
    const threshold = statutory.insuredHealth * setting.supplementaryBonusMultiple;
    const excess = Math.min(
      bonusAmount,
      Math.max(0, priorBonus + bonusAmount - threshold),
    );
    supplementaryEmployee = Math.round(excess * setting.supplementaryRate);
  }

  // 薪資所得就源扣繳（依成員 taxWithholdRate；0＝不代扣）。
  const incomeTaxWithheld = round2(taxableIncome * (sp.taxWithholdRate || 0));

  // 把員工端二代健保 / 扣繳稅併入應扣、明細與實發。
  const extraDeductions = round2(supplementaryEmployee + incomeTaxWithheld);
  const breakdown = [...result.lines];
  if (supplementaryEmployee > 0)
    breakdown.push({ label: "二代健保補充保費", amount: -supplementaryEmployee });
  if (incomeTaxWithheld > 0)
    breakdown.push({ label: "薪資所得扣繳稅", amount: -incomeTaxWithheld });
  const deductionTotal = round2(result.deductionTotal + extraDeductions);
  const netPay = round2(result.netPay - extraDeductions);

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
    deductionTotal,
    netPay,
    breakdown,
    createdById: user.id,
    taxableIncome,
    bonusAmount,
    supplementaryEmployee,
    incomeTaxWithheld,
    // 勞健保自付（已含入 deductionTotal / netPay）
    insuredSalary: statutory?.insuredLabor ?? 0,
    laborInsEmployee: statutory?.laborEmployee ?? 0,
    healthInsEmployee: statutory?.healthEmployee ?? 0,
    pensionSelfEmployee: statutory?.pensionSelf ?? 0,
    // 公司負擔
    laborInsEmployer: statutory?.laborEmployer ?? 0,
    healthInsEmployer: statutory?.healthEmployer ?? 0,
    pensionEmployer: statutory?.pensionEmployer ?? 0,
    occupationalEmployer: statutory?.occupationalEmployer ?? 0,
    supplementaryEmployer,
    employerCostTotal,
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
