/**
 * 食品標示規則引擎測試（日本標示 → 台灣營養標示）。
 *
 * 這裡測的是「法規怎麼算」，不碰資料庫也不碰 UI——引擎本來就是純函式。
 * 每一則的標題寫的是規則本身，改法規版本時看標題就知道該不該跟著改。
 */
import test from "node:test";
import assert from "node:assert/strict";

import { convert, roundTo } from "../src/lib/foodlabel/engine";
import {
  parseJapaneseLabel,
  detectBasis,
  normalize,
} from "../src/lib/foodlabel/parser";
import type {
  ConversionResult,
  NutrientKey,
  TaiwanLabelRow,
} from "../src/lib/foodlabel/types";

function row(r: ConversionResult, key: NutrientKey): TaiwanLabelRow {
  const found = r.label.rows.find((x) => x.key === key);
  assert.ok(found, `標示表裡找不到 ${key}`);
  return found;
}

function issue(r: ConversionResult, code: string) {
  return r.issues.find((i) => i.code === code);
}

// ── 解析：文字正規化與標示基準 ──────────────────────────

test("normalize 把全形數字與符號轉半形", () => {
  assert.equal(normalize("１００ｇ当たり"), "100g当たり");
});

test("detectBasis 認得「100g当たり」", () => {
  const b = detectBasis("栄養成分表示(100g当たり)");
  assert.equal(b.basisType, "per100g");
  assert.equal(b.basisAmount, 100);
});

test("detectBasis 認得「1袋（45g）当たり」並取出份量", () => {
  const b = detectBasis("栄養成分表示 1袋（45g）当たり");
  assert.equal(b.basisType, "perServing");
  assert.equal(b.basisAmount, 45);
  assert.equal(b.basisUnit, "g");
});

test("detectBasis 認得液體的「100ml当たり」", () => {
  const b = detectBasis("栄養成分表示（100ml当たり）");
  assert.equal(b.basisType, "per100ml");
  assert.equal(b.basisUnit, "ml");
});

// ── 解析：欄位辨識 ──────────────────────────────────

test("「飽和脂肪酸」不會被「脂質」搶走", () => {
  const p = parseJapaneseLabel("脂質 12.5g\nうち飽和脂肪酸 5.6g");
  assert.equal(p.jp.fat?.value, 12.5);
  assert.equal(p.jp.saturatedFat?.value, 5.6);
});

test("「糖質」與「糖類」分辨得出來", () => {
  const p = parseJapaneseLabel(
    "炭水化物 27.6g\n糖質 26.9g\n糖類 4.8g\n食物繊維 0.7g",
  );
  assert.equal(p.jp.availableCarb?.value, 26.9);
  assert.equal(p.jp.sugars?.value, 4.8);
  assert.equal(p.jp.dietaryFiber?.value, 0.7);
});

test("英文別名要落在單字邊界（ca 不可比對到 kcal 內部）", () => {
  const p = parseJapaneseLabel("1食（78g）当たり エネルギー 1465kJ / 350kcal");
  assert.equal(p.jp.calcium, undefined);
  assert.equal(p.jp.energyKcal?.value, 350);
});

// ── 換算：日本欄位 → 台灣欄位 ────────────────────────

test("食塩相当量換算為鈉：1.0g → 394mg", () => {
  const r = convert({
    sourceText: "栄養成分表示（100g当たり）\nエネルギー 100kcal\n食塩相当量 1.0g",
    product: { servingSize: 100, state: "solid" },
  });
  assert.ok(Math.abs((r.per100.sodium ?? 0) - 393.7) < 0.5);
  assert.equal(row(r, "sodium").perServing, "394");
});

test("有ナトリウム時優先採用，不用食塩相当量換算", () => {
  const r = convert({
    sourceText: "100g当たり ナトリウム 1850mg 食塩相当量 4.7g",
    product: { servingSize: 100 },
  });
  assert.equal(r.per100.sodium, 1850);
});

test("碳水化合物由「糖質＋食物繊維」計算", () => {
  const r = convert({
    sourceText: "100g当たり\n糖質 26.9g\n食物繊維 0.7g",
    product: { servingSize: 100 },
  });
  assert.ok(Math.abs((r.per100.carbohydrate ?? 0) - 27.6) < 1e-9);
});

test("只有糖質時「糖」判定為不合規（糖質 ≠ 糖）", () => {
  const r = convert({
    sourceText: "100g当たり\n糖質 26.9g\n食物繊維 0.7g",
    product: { servingSize: 100 },
  });
  assert.ok(issue(r, "MISSING_SUGAR"));
  assert.ok(
    r.label.notes.some((n) => n.code === "SUGAR_NOT_EQUAL_AVAILABLE_CARB"),
  );
});

test("kJ 單獨出現時換算為大卡", () => {
  const r = convert({
    sourceText: "100g当たり エネルギー 1465kJ",
    product: { servingSize: 100 },
  });
  assert.ok(Math.abs((r.per100.energy ?? 0) - 350.1) < 0.5);
});

test("同時有 kJ 與 kcal 時採用 kcal", () => {
  const r = convert({
    sourceText: "1食（78g）当たり エネルギー 1465kJ / 350kcal",
    product: { servingSize: 78 },
  });
  assert.equal(r.per100.energy, (350 / 78) * 100);
});

// ── 換算：基準與每份量 ──────────────────────────────

test("1袋(45g)基準換算為每100，再乘台灣每份量 30g", () => {
  const r = convert({
    sourceText:
      "栄養成分表示 1袋（45g）当たり\nエネルギー 232kcal\nたんぱく質 2.8g\n脂質 12.1g\n炭水化物 27.6g",
    product: { servingSize: 30, packageSize: 180 },
  });
  assert.ok(Math.abs((r.per100.energy ?? 0) - 515.55) < 0.1); // 232 / 45 * 100
  assert.equal(row(r, "energy").perServing, "155"); // 每100 * 0.3
  assert.equal(r.label.product.servingsPerPackage, 6); // 180 / 30
});

test("液體改用毫升表頭", () => {
  const r = convert({
    sourceText: "100ml当たり エネルギー 45kcal",
    product: { servingSize: 250, state: "liquid" },
  });
  assert.equal(r.label.per100HeaderText, "每100毫升");
  assert.equal(r.label.servingUnitText, "毫升");
});

// ── 台灣法規：修整、得以 0 標示、每日參考值 ──────────────

test("roundTo 對 .5 進位（不受浮點誤差影響）", () => {
  assert.equal(roundTo(2.45, 1), 2.5);
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(393.7, 0), 394);
});

test("低於門檻者以「0」標示；鈉超過 5mg/100ml 則不得以 0 標示", () => {
  const r = convert({
    sourceText:
      "栄養成分表示（100ml当たり）\nエネルギー 0kcal\nたんぱく質 0g\n脂質 0g\n炭水化物 0g\n食塩相当量 0.02g",
    product: { servingSize: 525, state: "liquid" },
  });
  assert.equal(row(r, "energy").perServing, "0");
  assert.equal(row(r, "energy").zeroDeclared, true);
  // 0.02 / 2.54 * 1000 ≒ 7.9 mg/100ml > 5mg 門檻
  assert.equal(row(r, "sodium").zeroDeclared, false);
  assert.equal(row(r, "sodium").perServing, "41");
});

test("每日參考值百分比：鈉 400mg / 2000mg = 20%", () => {
  const r = convert({
    sourceText: "100g当たり ナトリウム 400mg",
    product: { servingSize: 100 },
  });
  assert.equal(row(r, "sodium").dvPercent, "20%");
});

test("反式脂肪與糖無每日參考值，顯示「*」", () => {
  const r = convert({
    sourceText: "100g当たり トランス脂肪酸 0.5g 糖類 5g 脂質 10g",
    product: { servingSize: 100 },
  });
  assert.equal(row(r, "transFat").dvPercent, "*");
  assert.equal(row(r, "sugar").dvPercent, "*");
});

test("可指定法規版本", () => {
  const r = convert({
    sourceText: "100g当たり エネルギー 100kcal",
    product: { servingSize: 100 },
    regulationId: "tw-2026-01-01",
  });
  assert.equal(r.label.regulationVersion, "tw-2026-01-01");
});

// ── 合規檢查 ────────────────────────────────────────

test("日本沒強制標示的飽和脂肪 / 反式脂肪 / 糖，在台灣列為缺口", () => {
  const r = convert({
    sourceText:
      "100g当たり\nエネルギー 554kcal\nたんぱく質 4.7g\n脂質 35.2g\n炭水化物 54.1g\n食塩相当量 0.8g",
    product: { servingSize: 30, packageSize: 60 },
  });
  assert.ok(issue(r, "MISSING_TRANSFAT"));
  assert.ok(issue(r, "MISSING_SATURATEDFAT"));
  assert.ok(issue(r, "MISSING_SUGAR"));
  assert.equal(row(r, "transFat").missing, true);
  assert.equal(row(r, "transFat").perServing, "—");
});

test("邏輯檢查：飽和脂肪大於脂肪會被抓出來", () => {
  const r = convert({
    sourceText: "100g当たり 脂質 5g うち飽和脂肪酸 8g",
    product: { servingSize: 100 },
  });
  assert.ok(issue(r, "SATFAT_GT_FAT"));
});

test("熱量交叉驗算：數值不符時提出警告", () => {
  const r = convert({
    sourceText:
      "100g当たり\nエネルギー 100kcal\nたんぱく質 10g\n脂質 30g\n炭水化物 40g",
    product: { servingSize: 100 },
  });
  assert.ok(issue(r, "ENERGY_MISMATCH"));
});

test("熱量交叉驗算：合理數值不觸發警告", () => {
  const r = convert({
    sourceText:
      "100g当たり\nエネルギー 350kcal\nたんぱく質 8g\n脂質 12.5g\n炭水化物 50g",
    product: { servingSize: 100 },
  });
  assert.equal(issue(r, "ENERGY_MISMATCH"), undefined);
});

test("「0.1g未満」採上限值並提出警告", () => {
  const r = convert({
    sourceText: "100g当たり トランス脂肪酸 0.1g未満 脂質 10g",
    product: { servingSize: 100 },
  });
  assert.equal(r.per100.transFat, 0.1);
  assert.ok(r.label.notes.some((n) => n.code === "VALUE_LESS_THAN"));
});

test("沒設定每一份量時列為不合規（台灣強制標示每一份量）", () => {
  const r = convert({
    sourceText: "100g当たり エネルギー 100kcal",
    product: {},
  });
  assert.ok(issue(r, "MISSING_SERVING_SIZE"));
});
