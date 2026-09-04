import type { NutrientKey } from "./types";

/**
 * 台灣包裝食品營養標示規則集（Rule Engine 的設定資料）
 *
 * 設計原則：法規條件不寫死在程式邏輯裡，全部集中在這個版本化的設定物件。
 * 法規修正時只需新增一個版本，程式碼不用動。
 *
 * ⚠️ 上線前請以 TFDA 公告之最新條文核對本檔數值：
 *   - 包裝食品營養標示應遵行事項
 *   - 包裝食品營養宣稱應遵行事項（113 年修正，部分規定自 2026-01-01 施行）
 *   https://foodlabel.fda.gov.tw/
 */

export type ToleranceDirection = "notMoreThan120" | "notLessThan80";

export interface TaiwanRegulation {
  id: string;
  title: string;
  /** 施行日（ISO） */
  effectiveFrom: string;
  sourceNote: string;

  /** 應標示之營養素（順序即標示順序） */
  mandatory: NutrientKey[];
  /** 得自願標示之營養素 */
  voluntary: NutrientKey[];

  /** 數值修整：各營養素標示到小數點後幾位 */
  decimals: Record<NutrientKey, number>;

  /**
   * 得以「0」標示之上限（以每 100 公克固體 / 每 100 毫升液體計）
   * 依「包裝食品營養標示應遵行事項」之得以 0 標示規定。
   */
  zeroThresholdPer100: Partial<Record<NutrientKey, number>>;

  /** 每日參考值（供 %DV 計算），null 代表無參考值，標示「*」 */
  dailyValue: Partial<Record<NutrientKey, number | null>>;

  /** 食鹽相當量 → 鈉 的換算除數（NaCl 分子量 58.44 / Na 22.99 ≒ 2.54） */
  saltToSodiumDivisor: number;

  /** 熱量計算之能量係數（大卡 / 公克） */
  energyFactors: {
    protein: number;
    fat: number;
    carbohydrate: number;
    dietaryFiber: number;
    alcohol: number;
    organicAcid: number;
  };

  /** 熱量交叉驗算的容許誤差（比例） */
  energyCrossCheckTolerance: number;

  /** 標示值與檢驗值之誤差允許範圍 */
  tolerance: Partial<Record<NutrientKey, ToleranceDirection>>;
}

const DEFAULT_DECIMALS: Record<NutrientKey, number> = {
  energy: 0,
  protein: 1,
  fat: 1,
  saturatedFat: 1,
  transFat: 1,
  carbohydrate: 1,
  sugar: 1,
  sodium: 0,
  dietaryFiber: 1,
  calcium: 0,
  iron: 1,
  vitaminC: 1,
};

export const TW_2015: TaiwanRegulation = {
  id: "tw-2015-07-01",
  title: "包裝食品營養標示應遵行事項（現行）",
  effectiveFrom: "2015-07-01",
  sourceNote:
    "衛生福利部食品藥物管理署「包裝食品營養標示應遵行事項」；應標示八項營養素、每份量與每日參考值百分比。",

  mandatory: [
    "energy",
    "protein",
    "fat",
    "saturatedFat",
    "transFat",
    "carbohydrate",
    "sugar",
    "sodium",
  ],
  voluntary: ["dietaryFiber", "calcium", "iron", "vitaminC"],

  decimals: DEFAULT_DECIMALS,

  zeroThresholdPer100: {
    energy: 4, // 大卡
    protein: 0.5,
    fat: 0.5,
    saturatedFat: 0.1,
    transFat: 0.3,
    carbohydrate: 0.5,
    sugar: 0.5,
    sodium: 5, // 毫克
  },

  dailyValue: {
    energy: 2000,
    protein: 60,
    fat: 60,
    saturatedFat: 18,
    transFat: null, // 無每日參考值
    carbohydrate: 300,
    sugar: null, // 無每日參考值
    sodium: 2000,
    dietaryFiber: 25,
    calcium: 800,
    iron: 15,
    vitaminC: 100,
  },

  saltToSodiumDivisor: 2.54,

  energyFactors: {
    protein: 4,
    fat: 9,
    carbohydrate: 4,
    dietaryFiber: 2,
    alcohol: 7,
    organicAcid: 3,
  },

  energyCrossCheckTolerance: 0.2,

  tolerance: {
    energy: "notMoreThan120",
    fat: "notMoreThan120",
    saturatedFat: "notMoreThan120",
    transFat: "notMoreThan120",
    sugar: "notMoreThan120",
    sodium: "notMoreThan120",
    protein: "notLessThan80",
    carbohydrate: "notLessThan80",
    dietaryFiber: "notLessThan80",
    calcium: "notLessThan80",
    iron: "notLessThan80",
    vitaminC: "notLessThan80",
  },
};

/**
 * 2026-01-01 施行版本。
 * 目前規則內容與現行版相同，保留為獨立版本以便未來只改這裡。
 */
export const TW_2026: TaiwanRegulation = {
  ...TW_2015,
  id: "tw-2026-01-01",
  title: "包裝食品營養標示（含 113 年修正營養宣稱，2026-01-01 施行）",
  effectiveFrom: "2026-01-01",
  sourceNote:
    "同現行營養標示規定；另適用 113 年公告修正之「包裝食品營養宣稱應遵行事項」，部分規定自 2026-01-01 施行。使用前請核對最新條文。",
};

export const REGULATIONS: Record<string, TaiwanRegulation> = {
  [TW_2015.id]: TW_2015,
  [TW_2026.id]: TW_2026,
};

export const DEFAULT_REGULATION_ID = TW_2015.id;

export function getRegulation(id?: string | null): TaiwanRegulation {
  if (id && REGULATIONS[id]) return REGULATIONS[id];
  return REGULATIONS[DEFAULT_REGULATION_ID];
}

/** 依施行日自動挑選適用版本 */
export function getRegulationForDate(date: Date): TaiwanRegulation {
  const applicable = Object.values(REGULATIONS)
    .filter((r) => new Date(r.effectiveFrom) <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
  return applicable[0] ?? TW_2015;
}
