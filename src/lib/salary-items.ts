/**
 * 薪資科目（Salary items）純邏輯 —— 前後端共用。
 *
 * 每個科目帶四個旗標：加項/減項、應稅/免稅、是否計入投保薪資（屬不屬工資）、經常性/非經常性。
 * 由這些旗標推導：應發 / 應扣明細、投保薪資工資基礎、應稅所得、非經常性給與（獎金，二代健保用）。
 */

export type SalaryItemKind = "EARNING" | "DEDUCTION";

/** 薪資科目定義（SalaryItemDef 的計算子集）。 */
export type SalaryItemDefLike = {
  id: string;
  name: string;
  kind: string; // EARNING | DEDUCTION
  taxable: boolean;
  countsToInsurance: boolean;
  recurring: boolean;
  taxFreeLimit: number | null;
};

/** 成員的科目金額（SalaryProfile.items）。 */
export type MemberItem = { defId: string; amount: number };

export const SALARY_ITEM_KIND_LABEL: Record<string, string> = {
  EARNING: "加項",
  DEDUCTION: "減項",
};

/** 台灣常見薪資科目預設（一鍵帶入用）。 */
export const DEFAULT_SALARY_ITEMS: Omit<SalaryItemDefLike, "id">[] = [
  { name: "伙食津貼", kind: "EARNING", taxable: false, countsToInsurance: true, recurring: true, taxFreeLimit: 3000 },
  { name: "全勤獎金", kind: "EARNING", taxable: true, countsToInsurance: true, recurring: true, taxFreeLimit: null },
  { name: "職務加給", kind: "EARNING", taxable: true, countsToInsurance: true, recurring: true, taxFreeLimit: null },
  { name: "交通津貼", kind: "EARNING", taxable: true, countsToInsurance: true, recurring: true, taxFreeLimit: null },
  { name: "績效獎金", kind: "EARNING", taxable: true, countsToInsurance: true, recurring: false, taxFreeLimit: null },
  { name: "年終獎金", kind: "EARNING", taxable: true, countsToInsurance: false, recurring: false, taxFreeLimit: null },
  { name: "職工福利金", kind: "DEDUCTION", taxable: false, countsToInsurance: false, recurring: true, taxFreeLimit: null },
];

/** 解析 SalaryProfile.items（Json）為 MemberItem[]。 */
export function parseMemberItems(v: unknown): MemberItem[] {
  if (!Array.isArray(v)) return [];
  const out: MemberItem[] = [];
  for (const it of v) {
    if (it && typeof it === "object") {
      const defId = String((it as Record<string, unknown>).defId ?? "").trim();
      const amount = Number((it as Record<string, unknown>).amount);
      if (defId && Number.isFinite(amount)) out.push({ defId, amount });
    }
  }
  return out;
}

export type MoneyLine = { label: string; amount: number };

export type ResolvedItems = {
  earnings: MoneyLine[]; // 加項明細（正數）
  deductions: MoneyLine[]; // 減項明細（正數，計算時再扣）
  /** 計入投保薪資的加項合計（不含本薪；本薪由呼叫端另加）。 */
  wageForInsurance: number;
  /** 應稅所得（加項，已扣掉免稅額；不含本薪）。 */
  taxableEarnings: number;
  /** 免稅合計（顯示 / 稽核用）。 */
  taxFreeTotal: number;
  /** 非經常性給與合計（獎金；二代健保高額獎金累計用）。 */
  bonusAmount: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * 依科目目錄把成員的科目金額展開成明細與各項合計。
 * 找不到 / 已停用的科目略過（避免舊資料指向已刪科目時出錯）。
 */
export function resolveSalaryItems(
  defs: SalaryItemDefLike[],
  items: MemberItem[],
): ResolvedItems {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const earnings: MoneyLine[] = [];
  const deductions: MoneyLine[] = [];
  let wageForInsurance = 0;
  let taxableEarnings = 0;
  let taxFreeTotal = 0;
  let bonusAmount = 0;

  for (const it of items) {
    const def = byId.get(it.defId);
    if (!def) continue;
    const amount = Number(it.amount) || 0;
    if (amount <= 0) continue;

    if (def.kind === "DEDUCTION") {
      deductions.push({ label: def.name, amount });
      continue;
    }
    // EARNING
    earnings.push({ label: def.name, amount });
    if (def.countsToInsurance) wageForInsurance += amount;
    if (!def.recurring) bonusAmount += amount;
    // 應稅：免稅科目在免稅上限內免稅，超過部分計為應稅。
    const taxFree = def.taxable
      ? 0
      : def.taxFreeLimit != null
        ? Math.min(amount, def.taxFreeLimit)
        : amount;
    taxFreeTotal += taxFree;
    taxableEarnings += amount - taxFree;
  }

  return {
    earnings,
    deductions,
    wageForInsurance: round2(wageForInsurance),
    taxableEarnings: round2(taxableEarnings),
    taxFreeTotal: round2(taxFreeTotal),
    bonusAmount: round2(bonusAmount),
  };
}

/** 當月一次性獎金 / 調整（PayslipAdjustment 的計算子集）。旗標已於建立時快照，計算不再回查科目。 */
export type AdjustmentLike = {
  id: string;
  label: string;
  kind: string; // EARNING | DEDUCTION
  amount: number;
  taxable: boolean;
  countsToInsurance: boolean;
  recurring: boolean;
  taxFreeLimit: number | null;
};

/**
 * 把「當月獎金 / 調整」折算成與薪資科目相同的 ResolvedItems（沿用同一套旗標邏輯）。
 * 每筆調整都自帶旗標快照，故合成一個一次性的 def 餵進 resolveSalaryItems 即可。
 */
export function resolveAdjustments(adjustments: AdjustmentLike[]): ResolvedItems {
  const defs: SalaryItemDefLike[] = adjustments.map((a) => ({
    id: `adj:${a.id}`,
    name: a.label,
    kind: a.kind,
    taxable: a.taxable,
    countsToInsurance: a.countsToInsurance,
    recurring: a.recurring,
    taxFreeLimit: a.taxFreeLimit,
  }));
  const items: MemberItem[] = adjustments.map((a) => ({
    defId: `adj:${a.id}`,
    amount: a.amount,
  }));
  return resolveSalaryItems(defs, items);
}
