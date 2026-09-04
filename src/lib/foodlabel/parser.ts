import { JP_FIELD_UNITS, JP_SYNONYMS } from "./nutrients";
import type {
  BasisType,
  JpNutrientKey,
  Note,
  ParsedJapaneseLabel,
  ParsedValue,
} from "./types";

/** 全形 → 半形、統一分隔符號、去除裝飾字元 */
export function normalize(input: string): string {
  return input
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .replace(/[：:]/g, " ")
    .replace(/[･・]/g, "")
    .replace(/[―—─–‐-]/g, "-")
    .replace(/[〜～]/g, "~")
    .replace(/\r\n?/g, "\n");
}

/** 比對用的鍵值正規化：去空白、小寫、去掉「うち」等前綴 */
function keyNormalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^[-‐]+/, "")
    .replace(/^(うち|内|うち、)/, "");
}

const NUMBER = String.raw`\d+(?:\.\d+)?`;
const UNIT = String.raw`kcal|kj|mg|µg|μg|ug|mcg|g|ml|l|%`;

/**
 * 從一段緊接在欄位名之後的文字裡，取出數值與單位。
 * 支援：「350kcal」「8.2 g」「0.1未満」「1.2~1.5g」「(推定値) 12g」「12g以下」
 */
export function extractValue(
  segment: string,
): { value: number; unit: string; raw: string; qualifier?: ParsedValue["qualifier"] } | null {
  const cleaned = segment.replace(/\(.*?\)/g, " ");
  const rangeRe = new RegExp(`(${NUMBER})\\s*~\\s*(${NUMBER})\\s*(${UNIT})?`, "i");
  const range = cleaned.match(rangeRe);
  if (range) {
    const hi = parseFloat(range[2]);
    return {
      value: hi,
      unit: (range[3] ?? "").toLowerCase(),
      raw: range[0].trim(),
      qualifier: "range",
    };
  }

  const singleRe = new RegExp(`(${NUMBER})\\s*(${UNIT})?`, "i");
  const m = cleaned.match(singleRe);
  if (!m) return null;

  const after = cleaned.slice((m.index ?? 0) + m[0].length);
  let qualifier: ParsedValue["qualifier"] | undefined;
  if (/^\s*(未満|未滿|以下)/.test(after)) qualifier = "lessThan";
  if (/推定|約|およそ/.test(segment)) qualifier = "approx";

  return {
    value: parseFloat(m[1]),
    unit: (m[2] ?? "").toLowerCase(),
    raw: m[0].trim(),
    qualifier,
  };
}

/** 把解析到的單位換算成該欄位的標準單位 */
function toFieldUnit(
  key: JpNutrientKey,
  value: number,
  unit: string,
): { value: number; converted: boolean } | null {
  const target = JP_FIELD_UNITS[key];
  const u = unit.toLowerCase();

  if (target === "kcal") {
    if (u === "kcal" || u === "") return { value, converted: false };
    if (u === "kj") return { value: value / 4.184, converted: true };
    return null;
  }
  if (target === "kJ") {
    if (u === "kj") return { value, converted: false };
    return null;
  }
  if (target === "g") {
    if (u === "g" || u === "") return { value, converted: false };
    if (u === "mg") return { value: value / 1000, converted: true };
    if (u === "µg" || u === "μg" || u === "ug" || u === "mcg")
      return { value: value / 1_000_000, converted: true };
    return null;
  }
  // target === 'mg'
  if (u === "mg" || u === "") return { value, converted: false };
  if (u === "g") return { value: value * 1000, converted: true };
  if (u === "µg" || u === "μg" || u === "ug" || u === "mcg")
    return { value: value / 1000, converted: true };
  return null;
}

const SERVING_WORDS =
  "袋|食分|回分|人前|パック|カップ|切れ|本|個|枚|杯|包|尾|缶|瓶|串|粒|箱|皿|製品|食|玉|杓|さじ";
const PER_WORDS = "当たり|当り|あたり|当|辺り|per";

/** 判斷標示基準：100g当たり / 1袋(100g)当たり / 1食分当たり … */
export function detectBasis(text: string): {
  basisType: BasisType;
  basisAmount: number | null;
  basisUnit: "g" | "ml" | null;
  basisRaw: string | null;
  notes: Note[];
} {
  const notes: Note[] = [];

  // 1) 「1袋（100g）当たり」「1食分(25g)あたり」
  const servingWithSize = new RegExp(
    String.raw`(\d+(?:\.\d+)?)?\s*(${SERVING_WORDS})\s*[\(（]?\s*(${NUMBER})\s*(g|ml)\s*[\)）]?\s*(?:${PER_WORDS})`,
    "i",
  );
  const a = text.match(servingWithSize);
  if (a) {
    return {
      basisType: "perServing",
      basisAmount: parseFloat(a[3]),
      basisUnit: a[4].toLowerCase() as "g" | "ml",
      basisRaw: a[0].trim(),
      notes,
    };
  }

  // 2) 「100g当たり」「100ml当たり」「1000mLあたり」
  const perAmount = new RegExp(
    String.raw`(${NUMBER})\s*(g|ml)\s*[\)）]?\s*(?:${PER_WORDS})`,
    "i",
  );
  const b = text.match(perAmount);
  if (b) {
    const amount = parseFloat(b[1]);
    const unit = b[2].toLowerCase() as "g" | "ml";
    if (amount === 100) {
      return {
        basisType: unit === "g" ? "per100g" : "per100ml",
        basisAmount: 100,
        basisUnit: unit,
        basisRaw: b[0].trim(),
        notes,
      };
    }
    return {
      basisType: "perServing",
      basisAmount: amount,
      basisUnit: unit,
      basisRaw: b[0].trim(),
      notes,
    };
  }

  // 3) 「1食分当たり」但沒寫重量 → 無法換算成每100g
  const servingOnly = new RegExp(
    String.raw`(\d+(?:\.\d+)?)?\s*(${SERVING_WORDS})\s*(?:${PER_WORDS})`,
    "i",
  );
  const c = text.match(servingOnly);
  if (c) {
    notes.push({
      level: "warning",
      code: "BASIS_SERVING_WITHOUT_WEIGHT",
      message: `偵測到基準「${c[0].trim()}」但未標示每份重量／容量，無法自動換算為每100公克，請於下方手動輸入每一份量。`,
    });
    return {
      basisType: "perServing",
      basisAmount: null,
      basisUnit: null,
      basisRaw: c[0].trim(),
      notes,
    };
  }

  notes.push({
    level: "warning",
    code: "BASIS_UNKNOWN",
    message: "無法從文字中判斷標示基準（例如「100g当たり」或「1袋(100g)当たり」），已預設為每100公克，請確認。",
  });
  return { basisType: "unknown", basisAmount: null, basisUnit: null, basisRaw: null, notes };
}

interface Hit {
  key: JpNutrientKey;
  index: number;
  matchedText: string;
}

/** 解析日本營養成分表示 */
export function parseJapaneseLabel(rawInput: string): ParsedJapaneseLabel {
  const text = normalize(rawInput);
  const notes: Note[] = [];

  const basis = detectBasis(text);
  notes.push(...basis.notes);

  // 建立同義詞索引（長字串優先，避免「脂質」先吃掉「飽和脂肪酸」）
  const entries: Array<{ key: JpNutrientKey; pattern: string }> = [];
  for (const { key, patterns } of JP_SYNONYMS) {
    for (const p of patterns) entries.push({ key, pattern: keyNormalize(p) });
  }
  entries.sort((x, y) => y.pattern.length - x.pattern.length);

  // 以「去空白後的字串」掃描，同時保留對原文的位置對應
  const compact: string[] = [];
  const posMap: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) continue;
    compact.push(ch.toLowerCase());
    posMap.push(i);
  }
  const compactText = compact.join("");

  const hits: Hit[] = [];
  const taken = new Array(compactText.length).fill(false);

  for (const { key, pattern } of entries) {
    if (!pattern) continue;
    let from = 0;
    for (;;) {
      const idx = compactText.indexOf(pattern, from);
      if (idx === -1) break;
      from = idx + pattern.length;
      // 純英文的同義詞必須落在單字邊界，避免 "ca" 比對到 "kcal" 內部
      if (/^[a-z]+$/.test(pattern)) {
        const before = compactText[idx - 1];
        const after = compactText[idx + pattern.length];
        if ((before && /[a-z0-9]/.test(before)) || (after && /[a-z0-9]/.test(after))) continue;
      }
      // 已被更長的同義詞佔用就跳過
      let overlap = false;
      for (let i = idx; i < idx + pattern.length; i++) if (taken[i]) overlap = true;
      if (overlap) continue;
      for (let i = idx; i < idx + pattern.length; i++) taken[i] = true;
      hits.push({
        key,
        index: idx + pattern.length,
        matchedText: pattern,
      });
    }
  }

  hits.sort((x, y) => x.index - y.index);

  const jp: ParsedJapaneseLabel["jp"] = {};
  const usedRanges: Array<[number, number]> = [];

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (jp[hit.key]) continue; // 第一次出現優先
    const nextHitStart =
      i + 1 < hits.length ? hits[i + 1].index - hits[i + 1].matchedText.length : compactText.length;
    const window = compactText.slice(hit.index, Math.min(nextHitStart, hit.index + 40));

    let found = extractValue(window);
    // エネルギー 常寫成「1465kJ / 350kcal」，此時一律採用 kcal
    if (hit.key === "energyKcal") {
      const kcal = window.match(new RegExp(String.raw`(${NUMBER})\s*kcal`, "i"));
      if (kcal) {
        found = { value: parseFloat(kcal[1]), unit: "kcal", raw: kcal[0] };
      }
    }
    if (!found) continue;

    const converted = toFieldUnit(hit.key, found.value, found.unit);
    if (!converted) continue;

    const startOriginal = posMap[hit.index - hit.matchedText.length] ?? 0;
    usedRanges.push([startOriginal, posMap[Math.min(hit.index + window.length, posMap.length - 1)] ?? startOriginal]);

    jp[hit.key] = {
      value: converted.value,
      unit: JP_FIELD_UNITS[hit.key],
      raw: `${hit.matchedText} ${found.raw}`,
      qualifier: converted.converted ? "converted" : found.qualifier,
    };

    if (found.qualifier === "lessThan") {
      notes.push({
        level: "warning",
        code: "VALUE_LESS_THAN",
        nutrient: hit.key,
        message: `「${hit.matchedText}」原標示為「未満／以下」，已採用上限值 ${found.value}${found.unit} 計算，請確認實測值。`,
      });
    }
    if (found.qualifier === "range") {
      notes.push({
        level: "warning",
        code: "VALUE_RANGE",
        nutrient: hit.key,
        message: `「${hit.matchedText}」原標示為區間值，已採用上限 ${found.value}${found.unit} 計算。`,
      });
    }
  }

  // エネルギー 同時有 kJ 與 kcal 時，補記 kJ
  const kjMatch = text.match(new RegExp(String.raw`(${NUMBER})\s*kJ`, "i"));
  if (kjMatch) {
    jp.energyKj = {
      value: parseFloat(kjMatch[1]),
      unit: "kJ",
      raw: kjMatch[0],
    };
    if (!jp.energyKcal) {
      jp.energyKcal = {
        value: parseFloat(kjMatch[1]) / 4.184,
        unit: "kcal",
        raw: kjMatch[0],
        qualifier: "converted",
      };
      notes.push({
        level: "info",
        code: "ENERGY_FROM_KJ",
        nutrient: "energyKcal",
        message: `原標示僅有 ${kjMatch[1]} kJ，已依 1 kcal = 4.184 kJ 換算為大卡。`,
      });
    }
  }

  const unrecognizedLines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        /\d/.test(l) &&
        !/栄養成分|成分表示|推定値|当たり|当り|あたり/.test(l) &&
        !Object.values(jp).some((v) => {
          const num = v.raw.match(new RegExp(NUMBER));
          return num ? l.includes(num[0]) : false;
        }),
    );

  return {
    basisType: basis.basisType,
    basisAmount: basis.basisAmount,
    basisUnit: basis.basisUnit,
    basisRaw: basis.basisRaw,
    jp,
    unrecognizedLines,
    notes,
  };
}
