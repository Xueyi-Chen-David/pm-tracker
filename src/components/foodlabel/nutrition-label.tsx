"use client";

import type { TaiwanLabel } from "@/lib/foodlabel/types";
import { cn } from "@/lib/utils";

/**
 * 台灣營養標示（可直接交付印製的樣式）。
 * 兩種法定並列格式：每份＋每日參考值百分比，或每份＋每100公克／毫升。
 */
export function NutritionLabel({
  label,
  format,
  className,
}: {
  label: TaiwanLabel;
  format: "dv" | "per100";
  className?: string;
}) {
  const { product, rows, servingUnitText, per100HeaderText } = label;
  const serving = product.servingSize
    ? `${trimNum(product.servingSize)} ${servingUnitText}`
    : "—";
  const servings = product.servingsPerPackage
    ? `${trimNum(product.servingsPerPackage)} 份`
    : "—";
  const hasMissing = rows.some((r) => r.missing);

  return (
    <div
      className={cn(
        "border-foreground bg-background text-foreground w-full max-w-[26rem] border-2 p-4 text-[13px] leading-relaxed",
        className,
      )}
    >
      <h3 className="mb-1.5 text-center text-base font-bold tracking-[0.3em]">
        營養標示
      </h3>
      <div>每一份量　{serving}</div>
      <div>本包裝含　{servings}</div>

      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr className="border-foreground border-b">
            <th />
            <th className="py-0.5 text-right text-xs font-semibold">每份</th>
            <th className="py-0.5 text-right text-xs font-semibold">
              {format === "dv" ? "每日參考值百分比" : per100HeaderText}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={cn("py-0.5", r.indent === 1 && "pl-4")}>
                {r.label}
              </td>
              <td
                className={cn(
                  "py-0.5 text-right tabular-nums",
                  r.missing && "text-destructive font-semibold",
                )}
              >
                {r.perServing}
                {r.missing ? "" : ` ${r.unit}`}
              </td>
              <td
                className={cn(
                  "py-0.5 text-right tabular-nums",
                  r.missing && "text-destructive font-semibold",
                )}
              >
                {format === "dv"
                  ? r.dvPercent
                  : `${r.per100}${r.missing ? "" : ` ${r.unit}`}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {format === "dv" && (
        <p className="border-foreground mt-1.5 border-t pt-1 text-[11px] leading-snug">
          *參考值未訂定
          <br />
          每日參考值：熱量 2000 大卡、蛋白質 60 公克、脂肪 60 公克、飽和脂肪 18
          公克、碳水化合物 300 公克、鈉 2000 毫克。
        </p>
      )}
      {hasMissing && (
        <p className="text-destructive border-foreground mt-1.5 border-t pt-1 text-[11px] leading-snug">
          「—」為日本原標示缺少的台灣強制項目，補齊前不可印製。
        </p>
      )}
    </div>
  );
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
