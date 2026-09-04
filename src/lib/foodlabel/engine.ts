/**
 * 食品標示模組的轉換引擎：日本「栄養成分表示」→ 台灣「包裝食品營養標示」。
 *
 * 這一層刻意是**純函式、零 DB 依賴**：所有輸入由呼叫端給，輸出是純資料。
 * 好處是規則可以單獨測試，也能在 server action、批次工具、未來的 API 共用同一份邏輯。
 * 法規條件不寫死在這裡，全部集中在 ./regulations.ts 的版本化設定物件。
 */
import { TW_NUTRIENTS } from "./nutrients";
import { parseJapaneseLabel } from "./parser";
import { getRegulation, type TaiwanRegulation } from "./regulations";
import type {
  ComplianceIssue,
  ConversionResult,
  Note,
  NutrientKey,
  ParsedJapaneseLabel,
  Per100,
  ProductInfo,
  TaiwanLabel,
  TaiwanLabelRow,
  TraceStep,
} from "./types";

/** 四捨五入到指定小數位（半值進位） */
export function roundTo(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  const shifted = value * f;
  // 修掉浮點誤差後再進位，避免 1.005 → 1.00
  const corrected = Math.round(parseFloat(shifted.toPrecision(12)));
  return corrected / f;
}

export function formatTo(value: number, decimals: number): string {
  return roundTo(value, decimals).toFixed(decimals);
}

export interface ConvertInput {
  /** 日本標示原文（貼上或 OCR 結果） */
  sourceText?: string;
  /** 或直接給已解析的日本欄位值，供手動輸入模式使用 */
  parsedOverride?: ParsedJapaneseLabel;
  product: Partial<ProductInfo>;
  regulationId?: string;
  /** 使用者手動指定的標示基準（覆寫自動判讀） */
  basisOverride?: { amount: number; unit: "g" | "ml" } | null;
}

/** 步驟 2：日本欄位 → 台灣標準 Schema（含換算與衍生計算） */
function mapToCanonical(
  parsed: ParsedJapaneseLabel,
  reg: TaiwanRegulation,
): { values: Per100; notes: Note[]; trace: TraceStep[] } {
  const jp = parsed.jp;
  const values: Per100 = {};
  const notes: Note[] = [];
  const trace: TraceStep[] = [];

  if (jp.energyKcal) values.energy = jp.energyKcal.value;
  if (jp.protein) values.protein = jp.protein.value;
  if (jp.fat) values.fat = jp.fat.value;
  if (jp.saturatedFat) values.saturatedFat = jp.saturatedFat.value;
  if (jp.transFat) values.transFat = jp.transFat.value;
  if (jp.dietaryFiber) values.dietaryFiber = jp.dietaryFiber.value;
  if (jp.calcium) values.calcium = jp.calcium.value;
  if (jp.iron) values.iron = jp.iron.value;
  if (jp.vitaminC) values.vitaminC = jp.vitaminC.value;

  // ── 鈉：食塩相当量 → 鈉 ──────────────────────────────
  if (jp.sodium) {
    values.sodium = jp.sodium.value;
    trace.push({
      step: "鈉",
      detail: `日本標示已直接提供ナトリウム ${jp.sodium.value} mg，直接對應台灣「鈉」。`,
    });
  } else if (jp.saltEquivalent) {
    const mg = (jp.saltEquivalent.value / reg.saltToSodiumDivisor) * 1000;
    values.sodium = mg;
    trace.push({
      step: "鈉（由食塩相当量換算）",
      detail: `日本「食塩相当量 ${jp.saltEquivalent.value} g」不是台灣的「鈉」，需換算。`,
      formula: `鈉(mg) = 食塩相当量(g) ÷ ${reg.saltToSodiumDivisor} × 1000 = ${jp.saltEquivalent.value} ÷ ${reg.saltToSodiumDivisor} × 1000 = ${mg.toFixed(1)} mg`,
    });
    notes.push({
      level: "info",
      code: "SODIUM_FROM_SALT",
      nutrient: "sodium",
      message: `已將食塩相当量 ${jp.saltEquivalent.value} g 換算為鈉 ${Math.round(mg)} mg（除以 ${reg.saltToSodiumDivisor}）。`,
    });
  }

  // ── 碳水化合物：台灣的碳水化合物含膳食纖維 ──────────────
  if (jp.carbohydrate) {
    values.carbohydrate = jp.carbohydrate.value;
    trace.push({
      step: "碳水化合物",
      detail: `日本「炭水化物 ${jp.carbohydrate.value} g」已包含食物繊維，與台灣「碳水化合物」定義一致，直接對應。`,
    });
  } else if (jp.availableCarb && jp.dietaryFiber) {
    values.carbohydrate = jp.availableCarb.value + jp.dietaryFiber.value;
    trace.push({
      step: "碳水化合物（由糖質＋食物繊維計算）",
      detail: "日本以「糖質」與「食物繊維」分列時，台灣的碳水化合物為兩者相加。",
      formula: `碳水化合物 = 糖質 ${jp.availableCarb.value} + 食物繊維 ${jp.dietaryFiber.value} = ${(jp.availableCarb.value + jp.dietaryFiber.value).toFixed(1)} g`,
    });
    notes.push({
      level: "info",
      code: "CARB_FROM_SUM",
      nutrient: "carbohydrate",
      message: "碳水化合物已由「糖質＋食物繊維」計算得出。",
    });
  } else if (jp.availableCarb) {
    values.carbohydrate = jp.availableCarb.value;
    notes.push({
      level: "warning",
      code: "CARB_WITHOUT_FIBER",
      nutrient: "carbohydrate",
      message:
        "原標示只有「糖質」而無「食物繊維」。台灣的碳水化合物須包含膳食纖維，目前數值可能偏低，請補上食物繊維含量。",
    });
  }

  // ── 糖：糖類 → 糖；糖質 ≠ 糖 ───────────────────────────
  if (jp.sugars) {
    values.sugar = jp.sugars.value;
    trace.push({
      step: "糖",
      detail: `日本「糖類 ${jp.sugars.value} g」對應台灣「糖」（單醣＋雙醣）。`,
    });
  } else if (jp.availableCarb) {
    notes.push({
      level: "error",
      code: "SUGAR_NOT_EQUAL_AVAILABLE_CARB",
      nutrient: "sugar",
      message:
        "原標示只有「糖質」沒有「糖類」。「糖質」＝碳水化合物－膳食纖維，並不等於台灣的「糖」，不可直接套用，須另行檢驗或依配方計算。",
    });
  }

  return { values, notes, trace };
}

/** 步驟 3：把任何基準的數值統一換算成每 100 g / 100 ml */
function normalizeToPer100(
  values: Per100,
  basisAmount: number | null,
): { per100: Per100; trace: TraceStep[] } {
  const trace: TraceStep[] = [];
  if (!basisAmount || basisAmount === 100) {
    return { per100: { ...values }, trace };
  }
  const factor = 100 / basisAmount;
  const per100: Per100 = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "number") per100[k as NutrientKey] = v * factor;
  }
  trace.push({
    step: "統一為每 100 公克／毫升",
    detail: `原標示基準為每 ${basisAmount}，先換算為每 100 的含量後，再依台灣每一份量重新計算。`,
    formula: `係數 = 100 ÷ ${basisAmount} = ${factor.toFixed(4)}`,
  });
  return { per100, trace };
}

function scale(values: Per100, factor: number): Per100 {
  const out: Per100 = {};
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "number") out[k as NutrientKey] = v * factor;
  }
  return out;
}

/** 步驟 4：套用台灣法規產生標示表 */
function buildLabel(
  per100: Per100,
  perServing: Per100,
  product: ProductInfo,
  reg: TaiwanRegulation,
  notes: Note[],
): TaiwanLabel {
  const isLiquid = product.state === "liquid";
  const keys: NutrientKey[] = [
    ...reg.mandatory,
    ...reg.voluntary.filter((k) => per100[k] !== undefined),
  ];

  const rows: TaiwanLabelRow[] = keys
    .slice()
    .sort((a, b) => TW_NUTRIENTS[a].order - TW_NUTRIENTS[b].order)
    .map((key) => {
      const def = TW_NUTRIENTS[key];
      const decimals = reg.decimals[key];
      const v100 = per100[key];
      const vServ = perServing[key];
      const missing = v100 === undefined;

      const threshold = reg.zeroThresholdPer100[key];
      const zeroDeclared =
        !missing && threshold !== undefined && (v100 as number) <= threshold;

      const dv = reg.dailyValue[key];
      let dvPercent = "*";
      if (!missing && dv != null && vServ !== undefined) {
        dvPercent = zeroDeclared ? "0%" : `${Math.round((vServ / dv) * 100)}%`;
      }

      return {
        key,
        label: def.label,
        indent: def.indent,
        unit: def.unit,
        perServing: missing ? "—" : zeroDeclared ? "0" : formatTo(vServ ?? 0, decimals),
        per100: missing ? "—" : zeroDeclared ? "0" : formatTo(v100 as number, decimals),
        dvPercent: missing ? "—" : dvPercent,
        rawPerServing: vServ ?? null,
        rawPer100: v100 ?? null,
        zeroDeclared,
        missing,
      };
    });

  for (const r of rows) {
    if (r.zeroDeclared) {
      notes.push({
        level: "info",
        code: "ZERO_DECLARATION",
        nutrient: r.key,
        message: `${r.label} 每100${isLiquid ? "毫升" : "公克"}含量未超過 ${reg.zeroThresholdPer100[r.key]}${r.unit}，依規定得以「0」標示。`,
      });
    }
  }

  return {
    regulationVersion: reg.id,
    product,
    servingUnitText: isLiquid ? "毫升" : "公克",
    per100HeaderText: isLiquid ? "每100毫升" : "每100公克",
    rows,
    notes,
  };
}

/** 步驟 5：合規檢查 */
function checkCompliance(
  parsed: ParsedJapaneseLabel,
  per100: Per100,
  product: ProductInfo,
  reg: TaiwanRegulation,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const unitOf = (k: NutrientKey) => TW_NUTRIENTS[k].unit;

  // 強制標示項目是否齊全
  for (const key of reg.mandatory) {
    if (per100[key] === undefined) {
      issues.push({
        level: "error",
        code: `MISSING_${key.toUpperCase()}`,
        title: `缺少強制標示項目：${TW_NUTRIENTS[key].label}`,
        detail:
          key === "transFat"
            ? "日本並未強制標示トランス脂肪酸，但台灣「反式脂肪」為應標示項目。"
            : key === "saturatedFat"
              ? "日本「飽和脂肪酸」為任意標示項目，但台灣「飽和脂肪」為應標示項目。"
              : key === "sugar"
                ? "日本「糖類」為任意標示項目，但台灣「糖」為應標示項目。"
                : `原始日本標示中找不到可對應到「${TW_NUTRIENTS[key].label}」的資料。`,
        basis: `${reg.title}：應標示熱量、蛋白質、脂肪、飽和脂肪、反式脂肪、碳水化合物、糖、鈉。`,
        action: "請向日本供應商索取檢驗報告或配方計算資料後補入。",
      });
    }
  }

  // 每一份量 / 包裝份數
  if (!product.servingSize) {
    issues.push({
      level: "error",
      code: "MISSING_SERVING_SIZE",
      title: "未設定每一份量",
      detail: "台灣營養標示須標示「每一份量」及「本包裝含幾份」。",
      action: "請在左側產品資訊輸入每一份量。",
    });
  }
  if (!product.servingsPerPackage) {
    issues.push({
      level: "warning",
      code: "MISSING_SERVINGS_PER_PACKAGE",
      title: "未計算本包裝含幾份",
      detail: "需要包裝總淨重／容量與每一份量才能計算份數。",
      action: "請輸入包裝總淨重（或容量）。",
    });
  }

  // 邏輯一致性
  const gt = (a?: number, b?: number) => a !== undefined && b !== undefined && a > b + 1e-9;
  if (gt(per100.saturatedFat, per100.fat)) {
    issues.push({
      level: "error",
      code: "SATFAT_GT_FAT",
      title: "飽和脂肪大於脂肪",
      detail: `飽和脂肪 ${per100.saturatedFat?.toFixed(1)} ${unitOf("saturatedFat")} 大於脂肪 ${per100.fat?.toFixed(1)} ${unitOf("fat")}，數值不合理。`,
      action: "請確認原標示或 OCR 辨識是否有誤。",
    });
  }
  if (gt(per100.sugar, per100.carbohydrate)) {
    issues.push({
      level: "error",
      code: "SUGAR_GT_CARB",
      title: "糖大於碳水化合物",
      detail: `糖 ${per100.sugar?.toFixed(1)} 公克大於碳水化合物 ${per100.carbohydrate?.toFixed(1)} 公克，數值不合理。`,
      action: "請確認原標示或 OCR 辨識是否有誤。",
    });
  }
  if (gt(per100.dietaryFiber, per100.carbohydrate)) {
    issues.push({
      level: "error",
      code: "FIBER_GT_CARB",
      title: "膳食纖維大於碳水化合物",
      detail: "台灣的碳水化合物應包含膳食纖維，數值不合理。",
      action: "請確認碳水化合物是否誤用日本「糖質」數值。",
    });
  }

  // 熱量交叉驗算
  const { protein, fat, carbohydrate, dietaryFiber, energy } = per100;
  if (energy !== undefined && protein !== undefined && fat !== undefined && carbohydrate !== undefined) {
    const fiber = dietaryFiber ?? 0;
    const netCarb = Math.max(carbohydrate - fiber, 0);
    const calc =
      protein * reg.energyFactors.protein +
      fat * reg.energyFactors.fat +
      netCarb * reg.energyFactors.carbohydrate +
      fiber * reg.energyFactors.dietaryFiber;
    const diff = Math.abs(calc - energy) / Math.max(energy, 1);
    if (diff > reg.energyCrossCheckTolerance) {
      issues.push({
        level: "warning",
        code: "ENERGY_MISMATCH",
        title: "熱量與三大營養素計算值不符",
        detail: `依能量係數計算為 ${calc.toFixed(0)} 大卡／100，但標示為 ${energy.toFixed(0)} 大卡／100，差異 ${(diff * 100).toFixed(0)}%。`,
        basis: `能量係數：蛋白質 ${reg.energyFactors.protein}、脂肪 ${reg.energyFactors.fat}、碳水化合物 ${reg.energyFactors.carbohydrate}、膳食纖維 ${reg.energyFactors.dietaryFiber} 大卡／公克。`,
        action: "可能是含醣醇、酒精或有機酸，或數值辨識有誤，請人工確認。",
      });
    }
  }

  // 來源資料品質
  if (parsed.basisType === "unknown") {
    issues.push({
      level: "warning",
      code: "BASIS_ASSUMED",
      title: "標示基準以每100公克假設",
      detail: "無法從原文判斷「〜当たり」的基準，計算結果可能整體偏差。",
      action: "請手動指定原標示基準。",
    });
  }
  if (parsed.jp.saltEquivalent && !parsed.jp.sodium) {
    issues.push({
      level: "info",
      code: "SODIUM_CONVERTED",
      title: "鈉為食塩相当量換算值",
      detail: `已依 鈉(mg) = 食塩相当量(g) ÷ ${reg.saltToSodiumDivisor} × 1000 換算。`,
      action: "如供應商能提供鈉的實測值，建議以實測值標示。",
    });
  }

  // 誤差允許範圍提醒
  issues.push({
    level: "info",
    code: "TOLERANCE_REMINDER",
    title: "標示值與檢驗值之誤差允許範圍",
    detail:
      "熱量、脂肪、飽和脂肪、反式脂肪、糖、鈉：檢驗值不得超過標示值之 120%；蛋白質、碳水化合物、膳食纖維、維生素、礦物質：檢驗值不得低於標示值之 80%。",
    action: "轉換後的數值建議再以台灣實驗室檢驗確認。",
  });

  return issues;
}

/** 主流程 */
export function convert(input: ConvertInput): ConversionResult {
  const reg = getRegulation(input.regulationId);
  const parsed =
    input.parsedOverride ??
    parseJapaneseLabel(input.sourceText ?? "");

  const notes: Note[] = [...parsed.notes];
  const trace: TraceStep[] = [];

  // 基準
  const basisAmount = input.basisOverride?.amount ?? parsed.basisAmount ?? 100;
  const basisUnit =
    input.basisOverride?.unit ?? parsed.basisUnit ?? (input.product.state === "liquid" ? "ml" : "g");

  trace.push({
    step: "判讀原標示基準",
    detail: parsed.basisRaw
      ? `原文基準：「${parsed.basisRaw}」→ 每 ${basisAmount} ${basisUnit}`
      : `未偵測到基準文字，採用每 ${basisAmount} ${basisUnit}`,
  });

  const mapped = mapToCanonical(parsed, reg);
  notes.push(...mapped.notes);
  trace.push(...mapped.trace);

  const normalized = normalizeToPer100(mapped.values, basisAmount);
  trace.push(...normalized.trace);
  const per100 = normalized.per100;

  // 產品資訊
  const state = input.product.state ?? (basisUnit === "ml" ? "liquid" : "solid");
  const servingSize =
    input.product.servingSize ?? (parsed.basisType === "perServing" ? basisAmount : null);
  const packageSize = input.product.packageSize ?? null;
  const servingsPerPackage =
    input.product.servingsPerPackage ??
    (packageSize && servingSize ? roundTo(packageSize / servingSize, 1) : null);

  const product: ProductInfo = {
    productName: input.product.productName ?? "",
    servingSize,
    servingsPerPackage,
    packageSize,
    state,
  };

  const perServing = servingSize ? scale(per100, servingSize / 100) : {};
  if (servingSize) {
    trace.push({
      step: "換算為台灣「每份」數值",
      detail: `每一份量 ${servingSize} ${state === "liquid" ? "毫升" : "公克"}。`,
      formula: `每份值 = 每100之值 × ${servingSize} ÷ 100`,
    });
  }

  const label = buildLabel(per100, perServing, product, reg, notes);
  trace.push({
    step: "數值修整",
    detail:
      "熱量取至整數、鈉取至整數（毫克）、其餘營養素取至小數點後一位；符合「得以 0 標示」條件者以 0 呈現。",
  });

  const issues = checkCompliance(parsed, per100, product, reg);

  return { parsed, per100, perServing, label, issues, trace };
}
