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

/**
 * 電商平台的正式寫法 + 常見別名。ecommercePlatform 是自由文字欄位（打法不一：大小寫、
 * 全半形、簡稱、附加說明…），沒有先歸一化就直接照字串分組，「同一個平台」會被拆成
 * 好幾個桶（BASE / base / Base 各自算一筆，統計看起來又多又重複）。EC_PLATFORM_NAMES
 * 也是編輯表單 datalist 建議清單的資料來源（見 company-profile-card.tsx），單一真相。
 */
const EC_PLATFORMS: { canonical: string; aliases: string[] }[] = [
  { canonical: "Shopify", aliases: ["shopify"] },
  { canonical: "カラーミーショップ", aliases: ["カラーミー", "colorme", "color me"] },
  { canonical: "MakeShop", aliases: ["makeshop", "メイクショップ"] },
  { canonical: "futureshop", aliases: ["futureshop", "フューチャーショップ"] },
  { canonical: "BASE", aliases: ["base", "ベイス"] },
  { canonical: "楽天市場", aliases: ["楽天"] },
  { canonical: "自社サイト", aliases: ["自社"] },
];

export const EC_PLATFORM_NAMES = EC_PLATFORMS.map((p) => p.canonical);

/**
 * 把自由輸入的電商平台名稱對應回正式寫法；沒對到任何已知別名的自訂平台，保留原始輸入
 * （trim 後）當自己的桶，不硬塞進不相干的類別——這種名單本來就會有長尾的少見平台。
 */
export function normalizeEcPlatform(raw: string): string {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  for (const { canonical, aliases } of EC_PLATFORMS) {
    if (key === canonical.toLowerCase() || aliases.some((a) => key.includes(a))) {
      return canonical;
    }
  }
  return trimmed;
}

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

/**
 * 電商：hasEcommerce===false 或沒填就是「無」；true 才依 ecommercePlatform 分組
 * （沒填平台就是「有電商・平台不明」）。平台名稱分組前先過 normalizeEcPlatform，
 * 同一個平台的不同打法才會併成同一桶，不是每種寫法各自算一桶。
 */
export function ecommerceStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(
    rows.map((r) => {
      const platform = r.ecommercePlatform?.trim()
        ? normalizeEcPlatform(r.ecommercePlatform)
        : null;
      if (r.hasEcommerce === false) return "無";
      if (r.hasEcommerce === true) return platform || "有電商・平台不明";
      return platform; // 沒填是否有電商，但填了平台，仍算數
    }),
    "不明",
  );
}

export function productCategoryStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(rows.map((r) => r.productCategory));
}

/**
 * 47 都道府県。location 是自由文字（常見寫法：只填縣名／縣+市／完整地址），沒有先
 * 收斂到都道府県層級就直接分組，桶會依打了多細而爆炸（「福岡県」「福岡県福岡市」
 * 「福岡県福岡市博多区XX」各自算一桶）。抽出都道府県當統計層級，原始地點文字留給
 * 「點進某縣看細節」用（見 groupByPrefecture）。
 */
const PREFECTURES = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

/**
 * 從地點自由文字擷取都道府県層級。完整寫法（含 都/道/府/県 字尾，可以出現在文字任何
 * 位置，涵蓋「福岡県福岡市...」這種完整地址）優先比對；抓不到才試簡稱（打「福岡」
 * 沒加「県」）。兩種都沒對到就整段原文當自己的桶——可能是海外地址或特殊寫法，不硬塞。
 */
export function extractPrefecture(raw: string): string {
  const trimmed = raw.trim();
  for (const pref of PREFECTURES) {
    if (trimmed.includes(pref)) return pref;
  }
  for (const pref of PREFECTURES) {
    if (trimmed.startsWith(pref.slice(0, -1))) return pref;
  }
  return trimmed;
}

export function locationStats(rows: CrmCompanyProfileRow[]): Bucket[] {
  return tally(rows.map((r) => (r.location?.trim() ? extractPrefecture(r.location) : null)));
}

/** 依都道府県分組公司（含原始 location 文字），供「點某縣展開看底下哪些公司／地點」用。 */
export function groupByPrefecture(
  rows: CrmCompanyProfileRow[],
): Map<string, CrmCompanyProfileRow[]> {
  const map = new Map<string, CrmCompanyProfileRow[]>();
  for (const r of rows) {
    const key = r.location?.trim() ? extractPrefecture(r.location) : "不明";
    const arr = map.get(key) ?? [];
    arr.push(r);
    map.set(key, arr);
  }
  return map;
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
