/**
 * 共用型別：日本標示 → 標準 Schema → 台灣標示
 */

/** 台灣營養標示的標準營養素代碼（Canonical Schema） */
export type NutrientKey =
  | "energy"
  | "protein"
  | "fat"
  | "saturatedFat"
  | "transFat"
  | "carbohydrate"
  | "sugar"
  | "sodium"
  | "dietaryFiber"
  | "calcium"
  | "iron"
  | "vitaminC";

/** 標示基準 */
export type BasisType =
  | "per100g" // 100g当たり
  | "per100ml" // 100ml当たり
  | "perServing" // 1食分 / 1袋 / 1本 当たり
  | "unknown";

export type PhysicalState = "solid" | "liquid";

/** 單一營養素的解析結果 */
export interface ParsedValue {
  /** 數值（已轉為該營養素的標準單位） */
  value: number;
  /** 標準單位 */
  unit: string;
  /** 原始文字，供稽核 */
  raw: string;
  /** 這個值是推估／上限／換算而來 */
  qualifier?: "lessThan" | "range" | "approx" | "converted";
}

/** 日本標示解析結果 */
export interface ParsedJapaneseLabel {
  basisType: BasisType;
  /** 若為 perServing：一份的重量／容量 */
  basisAmount: number | null;
  /** 'g' | 'ml' */
  basisUnit: "g" | "ml" | null;
  /** 原始的基準文字，例如「1袋（100g）当たり」 */
  basisRaw: string | null;
  /** 日本欄位的原始擷取值，key 為日文欄位代碼 */
  jp: Partial<Record<JpNutrientKey, ParsedValue>>;
  /** 無法辨識的行 */
  unrecognizedLines: string[];
  notes: Note[];
}

/** 日本標示欄位代碼 */
export type JpNutrientKey =
  | "energyKcal"
  | "energyKj"
  | "protein"
  | "fat"
  | "saturatedFat"
  | "transFat"
  | "cholesterol"
  | "carbohydrate"
  | "availableCarb" // 糖質
  | "sugars" // 糖類
  | "dietaryFiber" // 食物繊維
  | "saltEquivalent" // 食塩相当量
  | "sodium" // ナトリウム
  | "calcium"
  | "iron"
  | "vitaminC";

export type NoteLevel = "info" | "warning" | "error";

export interface Note {
  level: NoteLevel;
  /** 機器可讀代碼，方便前端分類與 i18n */
  code: string;
  message: string;
  /** 相關營養素 */
  nutrient?: NutrientKey | JpNutrientKey;
}

/** 標準 Schema：每 100g / 100ml 的營養素含量（標準單位） */
export type Per100 = Partial<Record<NutrientKey, number>>;

/** 產品層級資訊 */
export interface ProductInfo {
  productName: string;
  /** 每一份量（公克或毫升） */
  servingSize: number | null;
  /** 本包裝含幾份 */
  servingsPerPackage: number | null;
  /** 包裝總淨重／容量 */
  packageSize: number | null;
  state: PhysicalState;
}

export interface TaiwanLabelRow {
  key: NutrientKey;
  /** 台灣法規名稱，例如「飽和脂肪」 */
  label: string;
  /** 縮排層級：0 = 主項，1 = 其中之細項 */
  indent: 0 | 1;
  unit: string;
  /** 每份（已修整字串） */
  perServing: string;
  /** 每 100 公克 / 每 100 毫升（已修整字串） */
  per100: string;
  /** 每份的每日參考值百分比字串，無參考值時為 "*" */
  dvPercent: string;
  /** 未修整的原始數值，供稽核與匯出 */
  rawPerServing: number | null;
  rawPer100: number | null;
  /** 是否套用「得以 0 標示」規則 */
  zeroDeclared: boolean;
  /** 是否為必須標示但缺資料 */
  missing: boolean;
}

export interface TaiwanLabel {
  regulationVersion: string;
  product: ProductInfo;
  servingUnitText: string; // 公克 / 毫升
  per100HeaderText: string; // 每100公克 / 每100毫升
  rows: TaiwanLabelRow[];
  notes: Note[];
}

export interface ComplianceIssue {
  level: NoteLevel;
  code: string;
  title: string;
  detail: string;
  /** 法規依據 */
  basis?: string;
  /** 建議動作 */
  action?: string;
}

export interface ConversionResult {
  parsed: ParsedJapaneseLabel;
  per100: Per100;
  /** 每份的數值 */
  perServing: Per100;
  label: TaiwanLabel;
  issues: ComplianceIssue[];
  /** 換算過程紀錄，逐步顯示給使用者看 */
  trace: TraceStep[];
}

export interface TraceStep {
  step: string;
  detail: string;
  formula?: string;
}
