/**
 * 薪資計算（純函式，方便測試 / 稽核）。參考台灣一般人資做法：
 *  - 月薪制（MONTHLY）：以「本薪」為基礎，依當月缺勤 / 請假（各假別給付比例）扣薪，
 *    加上加班費與固定加給，再扣固定扣除（勞健保自付 / 勞退…）得實發。
 *  - 時薪制（HOURLY）：依打卡工時 × 時薪計，超過標準工時的部分以加班倍率計；
 *    有薪假別依比例給薪。
 * 金額一律四捨五入到兩位小數（對應 Decimal(12,2)）。
 */

export type PayType = "MONTHLY" | "HOURLY";

export type MoneyLine = { label: string; amount: number };

export type LeaveTally = {
  name: string;
  paidPercent: number; // 0–100
  days: number;
};

/** 加班時數分級（勞基法§24）：wd＝平日、rd＝休息日。 */
export type OvertimeTiers = {
  wd1: number; // 平日前 2 小時
  wd2: number; // 平日第 3 小時起
  rd1: number; // 休息日前 2 小時
  rd2: number; // 休息日第 3–8 小時
  rd3: number; // 休息日第 9 小時起
};

/** 加班費計價設定（各級倍率 + 每小時工資基數）。 */
export type OvertimeConfig = OvertimeTiers & {
  hourlyBase: number; // 平日每小時工資（月薪 ÷ divisor，勞基法慣例 240）
};

/** 一位成員某月的出勤彙總（由 action 從出席紀錄 / 打卡整理）。 */
export type AttendanceSummary = {
  presentDays: number; // 出勤天（present=true，含出差 / 在家工作）
  absentDays: number; // 缺勤天（未請假未到）
  leaves: LeaveTally[]; // 各假別天數
  workedHours: number; // 時薪制：實際工時（打卡）
  overtimeHours: number; // 加班時數（超過標準工時的部分；未分級時的總時數）
  overtimeTiers?: OvertimeTiers; // §24 分級時數（有帶 salary.overtime 時據此計價）
};

export type SalaryInput = {
  payType: PayType;
  baseAmount: number; // 月薪金額 或 時薪金額
  standardWorkDays: number; // 月薪制每月標準工作天
  standardHoursPerDay: number;
  overtimeMultiplier: number;
  allowances: MoneyLine[];
  deductions: MoneyLine[];
  overtime?: OvertimeConfig; // §24 分級加班費（月薪制；有帶時取代單一倍率）
};

export type PayslipResult = {
  payType: PayType;
  baseAmount: number;
  workedDays: number;
  leaveDays: number;
  absentDays: number;
  overtimeHours: number;
  overtimePay: number;
  allowanceTotal: number;
  leaveDeduction: number; // 月薪制：請假扣薪合計（時薪制為 0）
  absentDeduction: number; // 月薪制：缺勤扣薪（時薪制為 0）
  deductionTotal: number; // 固定扣除合計
  grossPay: number; // 應發
  netPay: number; // 實發
  lines: MoneyLine[]; // 逐項明細（正＝加項、負＝減項）
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sum(lines: MoneyLine[]): number {
  return lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
}

/** 解析 SalaryProfile.allowances / deductions（Json）為 MoneyLine[]，過濾非法項目。 */
export function parseMoneyLines(v: unknown): MoneyLine[] {
  if (!Array.isArray(v)) return [];
  const out: MoneyLine[] = [];
  for (const item of v) {
    if (item && typeof item === "object") {
      const name = String((item as Record<string, unknown>).name ?? "").trim();
      const amount = Number((item as Record<string, unknown>).amount);
      if (name && Number.isFinite(amount)) out.push({ label: name, amount });
    }
  }
  return out;
}

/** 計算一位成員某月的薪資單。
 * statutoryDeductions＝勞健保自付 / 勞退自提等法定代扣（正數，會併入應扣、從實發扣除）。
 */
export function computePayslip(
  salary: SalaryInput,
  att: AttendanceSummary,
  statutoryDeductions: MoneyLine[] = [],
): PayslipResult {
  const allowanceTotal = round2(sum(salary.allowances));
  const fixedDeductionTotal = round2(sum(salary.deductions));
  const statutoryTotal = round2(sum(statutoryDeductions));
  const deductionTotal = round2(fixedDeductionTotal + statutoryTotal);
  const leaveDays = round2(att.leaves.reduce((a, l) => a + l.days, 0));

  const lines: MoneyLine[] = [];

  if (salary.payType === "MONTHLY") {
    const base = salary.baseAmount;
    const days = salary.standardWorkDays > 0 ? salary.standardWorkDays : 22;
    const dailyRate = base / days;
    const hoursPerDay =
      salary.standardHoursPerDay > 0 ? salary.standardHoursPerDay : 8;
    const hourlyRate = dailyRate / hoursPerDay;

    lines.push({ label: "本薪（月薪）", amount: round2(base) });

    // 請假扣薪：各假別依「未給付比例」扣。
    let leaveDeduction = 0;
    for (const lv of att.leaves) {
      const unpaid = (100 - Math.min(100, Math.max(0, lv.paidPercent))) / 100;
      if (unpaid <= 0 || lv.days <= 0) continue;
      const amt = round2(lv.days * dailyRate * unpaid);
      if (amt <= 0) continue;
      leaveDeduction += amt;
      lines.push({
        label: `${lv.name} ${lv.days} 天 扣薪（給付 ${lv.paidPercent}%）`,
        amount: -amt,
      });
    }
    leaveDeduction = round2(leaveDeduction);

    // 缺勤扣薪：未請假未到，一律以日薪扣。
    const absentDeduction = round2(att.absentDays * dailyRate);
    if (absentDeduction > 0) {
      lines.push({
        label: `缺勤 ${att.absentDays} 天`,
        amount: -absentDeduction,
      });
    }

    // 加班費：有 §24 分級設定（salary.overtime + att.overtimeTiers）→ 逐級計價；否則用單一倍率（相容舊資料）。
    let overtimePay: number;
    let overtimeHours: number;
    if (salary.overtime && att.overtimeTiers) {
      const c = salary.overtime;
      const t = att.overtimeTiers;
      overtimePay = round2(
        c.hourlyBase *
          (t.wd1 * c.wd1 +
            t.wd2 * c.wd2 +
            t.rd1 * c.rd1 +
            t.rd2 * c.rd2 +
            t.rd3 * c.rd3),
      );
      overtimeHours = round2(t.wd1 + t.wd2 + t.rd1 + t.rd2 + t.rd3);
    } else {
      overtimePay = round2(
        att.overtimeHours * hourlyRate * salary.overtimeMultiplier,
      );
      overtimeHours = att.overtimeHours;
    }
    if (overtimePay > 0) {
      lines.push({
        label: overtimeHours > 0 ? `加班 ${overtimeHours} 小時` : "加班費",
        amount: overtimePay,
      });
    }

    for (const a of salary.allowances)
      lines.push({ label: a.label, amount: round2(a.amount) });
    for (const s of statutoryDeductions)
      lines.push({ label: s.label, amount: -round2(s.amount) });
    for (const d of salary.deductions)
      lines.push({ label: d.label, amount: -round2(d.amount) });

    const grossPay = round2(
      base - leaveDeduction - absentDeduction + overtimePay + allowanceTotal,
    );
    const netPay = round2(grossPay - deductionTotal);

    return {
      payType: "MONTHLY",
      baseAmount: round2(base),
      workedDays: att.presentDays,
      leaveDays,
      absentDays: att.absentDays,
      overtimeHours,
      overtimePay,
      allowanceTotal,
      leaveDeduction,
      absentDeduction,
      deductionTotal,
      grossPay,
      netPay,
      lines,
    };
  }

  // ── 時薪制 ──
  const hourlyRate = salary.baseAmount;
  const hoursPerDay =
    salary.standardHoursPerDay > 0 ? salary.standardHoursPerDay : 8;
  const overtimeHours = Math.max(0, att.overtimeHours);
  const regularHours = Math.max(0, att.workedHours - overtimeHours);

  const regularPay = round2(regularHours * hourlyRate);
  lines.push({
    label: `工時 ${round2(regularHours)} 小時 × ${hourlyRate}`,
    amount: regularPay,
  });

  const overtimePay = round2(
    overtimeHours * hourlyRate * salary.overtimeMultiplier,
  );
  if (overtimePay > 0) {
    lines.push({
      label: `加班 ${round2(overtimeHours)} 小時（×${salary.overtimeMultiplier}）`,
      amount: overtimePay,
    });
  }

  // 有薪假別：依比例給薪（時薪 × 標準工時 × 天數 × 比例）。
  let leavePay = 0;
  for (const lv of att.leaves) {
    const paid = Math.min(100, Math.max(0, lv.paidPercent)) / 100;
    if (paid <= 0 || lv.days <= 0) continue;
    const amt = round2(lv.days * hoursPerDay * hourlyRate * paid);
    if (amt <= 0) continue;
    leavePay += amt;
    lines.push({
      label: `${lv.name} ${lv.days} 天 給薪（${lv.paidPercent}%）`,
      amount: amt,
    });
  }
  leavePay = round2(leavePay);

  for (const a of salary.allowances)
    lines.push({ label: a.label, amount: round2(a.amount) });
  for (const s of statutoryDeductions)
    lines.push({ label: s.label, amount: -round2(s.amount) });
  for (const d of salary.deductions)
    lines.push({ label: d.label, amount: -round2(d.amount) });

  const grossPay = round2(regularPay + overtimePay + leavePay + allowanceTotal);
  const netPay = round2(grossPay - deductionTotal);

  return {
    payType: "HOURLY",
    baseAmount: round2(hourlyRate),
    workedDays: att.presentDays,
    leaveDays,
    absentDays: att.absentDays,
    overtimeHours: round2(overtimeHours),
    overtimePay,
    allowanceTotal,
    leaveDeduction: 0,
    absentDeduction: 0,
    deductionTotal,
    grossPay,
    netPay,
    lines,
  };
}
