/**
 * CRM「統計」分頁用的純函式：企業基本檔案（CrmCompanyProfile）大部分欄位是自由文字
 * （headcount／capital／location 來源口徑不一），這裡做的是「盡量分桶」的簡單統計，
 * 不是精確分析——目的是讓使用者一眼看出手上名單的輪廓（電商比例、規模分佈、產品類型、
 * 地點集中在哪），不是嚴謹的 BI。無資料一律歸類到「不明」桶，不跳過、不當作 0。
 */
import type { CrmCompanyProfileRow } from "@/server/queries";

/** 產品類型封閉選項——編輯表單的 <select> 跟這裡的統計分組共用同一份，才分得乾淨。 */
export const PRODUCT_CATEGORY_OPTIONS = [
  "食品・飲料",
  "酒類",
  "調味料・加工食品",
  "工芸品・陶磁器",
  "服飾・織物",
  "美容・化粧品",
  "農産品・特産品",
  "家具・生活雑貨",
  "その他",
] as const;

export type Bucket = { label: string; count: number };

function tally(labels: (string | null)[], fallback = "不明"): Bucket[] {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const label = raw?.trim() || fallback;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ja"));
}

/** 電商：hasEcommerce===false 或沒填就是「無」；true 才依 ecommercePlatform 分組（沒填平台就是「有電商・平台不明」）。 */
export function ecommerceStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(
    rows.map((r) => {
      if (r.hasEcommerce === false) return "無";
      if (r.hasEcommerce === true) return r.ecommercePlatform?.trim() || "有電商・平台不明";
      return r.ecommercePlatform?.trim() ? r.ecommercePlatform.trim() : null; // 沒填是否有電商，但填了平台，仍算數
    }),
    "不明",
  );
}

export function productCategoryStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(rows.map((r) => r.productCategory));
}

export function locationStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(rows.map((r) => r.location));
}

const HEADCOUNT_BUCKETS = [
  { max: 10, label: "1–10 人" },
  { max: 50, label: "11–50 人" },
  { max: 100, label: "51–100 人" },
  { max: Infinity, label: "100 人以上" },
];

/** 從自由文字裡挑「最大」的一個數字當代表（例如「役員3・正社員13・従業員50、計66名」取 66，
 * 通常「計」「合計」後面或文字裡最大的那個數字最接近真實規模）。抓不到數字就是不明。 */
function extractHeadcountNumber(text: string): number | null {
  const nums = [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

export function headcountStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = r.headcount?.trim() ? extractHeadcountNumber(r.headcount) : null;
    const label = n === null ? "不明" : (HEADCOUNT_BUCKETS.find((b) => n <= b.max)?.label ?? "不明");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const order = [...HEADCOUNT_BUCKETS.map((b) => b.label), "不明"];
  return order
    .map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((b) => b.count > 0);
}

const CAPITAL_BUCKETS = [
  { max: 100, label: "100万円未満" },
  { max: 1000, label: "100–999万円" },
  { max: 3000, label: "1000–2999万円" },
  { max: Infinity, label: "3000万円以上" },
];

/** 資本額文字抓「万円」單位的數字（如「資本金1000万円」→1000）；抓不到單位就當不明——
 * 沒有「万円」字樣時貿然把裸數字當萬元會誤判（可能是年份、員工數殘留），寧可漏標不明。 */
function extractCapitalManYen(text: string): number | null {
  const m = text.match(/([\d,]+)\s*万円/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function capitalStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const n = r.capital?.trim() ? extractCapitalManYen(r.capital) : null;
    const label = n === null ? "不明" : (CAPITAL_BUCKETS.find((b) => n <= b.max)?.label ?? "不明");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const order = [...CAPITAL_BUCKETS.map((b) => b.label), "不明"];
  return order
    .map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((b) => b.count > 0);
}
