import type { JpNutrientKey, NutrientKey } from "./types";

/** 台灣法規營養素定義 */
export const TW_NUTRIENTS: Record<
  NutrientKey,
  { label: string; unit: string; indent: 0 | 1; order: number }
> = {
  energy: { label: "熱量", unit: "大卡", indent: 0, order: 1 },
  protein: { label: "蛋白質", unit: "公克", indent: 0, order: 2 },
  fat: { label: "脂肪", unit: "公克", indent: 0, order: 3 },
  saturatedFat: { label: "飽和脂肪", unit: "公克", indent: 1, order: 4 },
  transFat: { label: "反式脂肪", unit: "公克", indent: 1, order: 5 },
  carbohydrate: { label: "碳水化合物", unit: "公克", indent: 0, order: 6 },
  sugar: { label: "糖", unit: "公克", indent: 1, order: 7 },
  sodium: { label: "鈉", unit: "毫克", indent: 0, order: 8 },
  dietaryFiber: { label: "膳食纖維", unit: "公克", indent: 0, order: 9 },
  calcium: { label: "鈣", unit: "毫克", indent: 0, order: 10 },
  iron: { label: "鐵", unit: "毫克", indent: 0, order: 11 },
  vitaminC: { label: "維生素C", unit: "毫克", indent: 0, order: 12 },
};

/**
 * 日本欄位 → 標準單位。
 * 解析時會把 mg/g/µg 等統一換算成這裡的單位。
 */
export const JP_FIELD_UNITS: Record<JpNutrientKey, "kcal" | "kJ" | "g" | "mg"> = {
  energyKcal: "kcal",
  energyKj: "kJ",
  protein: "g",
  fat: "g",
  saturatedFat: "g",
  transFat: "g",
  cholesterol: "mg",
  carbohydrate: "g",
  availableCarb: "g",
  sugars: "g",
  dietaryFiber: "g",
  saltEquivalent: "g",
  sodium: "mg",
  calcium: "mg",
  iron: "mg",
  vitaminC: "mg",
};

/**
 * 日文欄位同義詞。比對時已先做全形→半形、去空白、去中黑點等正規化。
 * 順序重要：較長、較特定的字串要排在前面（例如「飽和脂肪酸」要在「脂肪」之前）。
 */
export const JP_SYNONYMS: Array<{ key: JpNutrientKey; patterns: string[] }> = [
  {
    key: "saturatedFat",
    patterns: ["飽和脂肪酸", "飽和脂肪", "うち飽和脂肪酸", "saturatedfat", "saturates"],
  },
  {
    key: "transFat",
    patterns: ["トランス脂肪酸", "トランス脂肪", "反式脂肪", "transfat"],
  },
  {
    key: "cholesterol",
    patterns: ["コレステロール", "cholesterol"],
  },
  {
    key: "availableCarb",
    patterns: ["糖質", "利用可能炭水化物", "availablecarbohydrate"],
  },
  {
    key: "sugars",
    patterns: ["糖類", "うち糖類", "sugars", "sugar"],
  },
  {
    key: "dietaryFiber",
    patterns: ["食物繊維", "食物せんい", "食物纖維", "dietaryfibre", "dietaryfiber", "fibre", "fiber"],
  },
  {
    key: "carbohydrate",
    patterns: ["炭水化物", "carbohydrate", "carbs"],
  },
  {
    key: "saltEquivalent",
    patterns: ["食塩相当量", "食塩相當量", "食塩", "塩分", "saltequivalent", "salt"],
  },
  {
    key: "sodium",
    patterns: ["ナトリウム", "sodium"],
  },
  {
    key: "protein",
    patterns: ["たんぱく質", "たん白質", "タンパク質", "蛋白質", "protein"],
  },
  {
    key: "fat",
    patterns: ["脂質", "脂肪", "fat"],
  },
  {
    key: "energyKcal",
    patterns: ["エネルギー", "熱量", "カロリー", "energy", "calories"],
  },
  {
    key: "calcium",
    patterns: ["カルシウム", "calcium"],
  },
  {
    key: "iron",
    patterns: ["鉄分", "鉄", "iron"],
  },
  {
    key: "vitaminC",
    patterns: ["ビタミンc", "vitaminc"],
  },
];

/** 日本欄位 → 台灣欄位的「直接對應」（不需計算的部分） */
export const DIRECT_MAP: Partial<Record<JpNutrientKey, NutrientKey>> = {
  energyKcal: "energy",
  protein: "protein",
  fat: "fat",
  saturatedFat: "saturatedFat",
  transFat: "transFat",
  carbohydrate: "carbohydrate",
  sugars: "sugar",
  dietaryFiber: "dietaryFiber",
  sodium: "sodium",
  calcium: "calcium",
  iron: "iron",
  vitaminC: "vitaminC",
};

/** 給前端顯示的日文欄位中文名 */
export const JP_FIELD_LABELS: Record<JpNutrientKey, string> = {
  energyKcal: "エネルギー（kcal）",
  energyKj: "エネルギー（kJ）",
  protein: "たんぱく質",
  fat: "脂質",
  saturatedFat: "飽和脂肪酸",
  transFat: "トランス脂肪酸",
  cholesterol: "コレステロール",
  carbohydrate: "炭水化物",
  availableCarb: "糖質",
  sugars: "糖類",
  dietaryFiber: "食物繊維",
  saltEquivalent: "食塩相当量",
  sodium: "ナトリウム",
  calcium: "カルシウム",
  iron: "鉄",
  vitaminC: "ビタミンC",
};
