import { stageColor, fmtMoney, fmtMoneyShort } from "@/lib/crm";
import { cn } from "@/lib/utils";

export type FunnelStage = {
  key: string;
  label: string;
  color: string;
  count: number;
  value: number;
};

/**
 * 銷售漏斗視覺化（依 best practice）：
 * - 依階段流程順序由上而下（不重排）。
 * - 每段寬度 ∝ 商機數（非等寬），並直接標上 名稱 / 數量 / 金額。
 * - 段與段之間顯示「轉換率（相對上一階段）」的下滑。
 * - 下方附資料表（階段 / 商機數 / 金額 / 轉換率 / 佔首階段）方便精確閱讀。
 */
export function FunnelView({ stages }: { stages: FunnelStage[] }) {
  const totalCount = stages.reduce((s, x) => s + x.count, 0);
  const totalValue = stages.reduce((s, x) => s + x.value, 0);
  const maxCount = Math.max(1, ...stages.map((s) => s.count));
  const first = stages[0]?.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* 摘要 */}
      <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          商機總數{" "}
          <span className="text-foreground text-lg font-bold tabular-nums">
            {totalCount}
          </span>
        </span>
        <span>
          總金額{" "}
          <span className="text-foreground text-lg font-bold tabular-nums">
            {fmtMoney(totalValue)}
          </span>
        </span>
      </div>

      {/* 漏斗 */}
      <div>
        {stages.map((s, i) => {
          const col = stageColor(s.color);
          const widthPct = Math.max(8, (s.count / maxCount) * 100);
          const prev = i > 0 ? stages[i - 1].count : null;
          const conv =
            prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
          return (
            <div key={s.key}>
              {i > 0 && (
                <div className="text-muted-foreground py-0.5 text-center text-[11px]">
                  ↓ {conv !== null ? `${conv}%` : "—"}
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex w-28 shrink-0 items-center justify-end gap-1.5 text-right text-sm">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="flex flex-1 justify-center">
                  <div
                    className={cn(
                      "flex h-9 items-center justify-center rounded-md px-2 text-xs font-bold text-white",
                      col.dot,
                    )}
                    style={{ width: `${widthPct}%`, minWidth: "2.75rem" }}
                    title={`${s.label}：${s.count} 個商機`}
                  >
                    {s.count}
                  </div>
                </div>
                <div className="text-muted-foreground w-24 shrink-0 text-right text-xs tabular-nums">
                  {fmtMoneyShort(s.value)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 資料表 */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-muted-foreground bg-muted/50 text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">階段</th>
              <th className="px-3 py-2 text-right font-medium">商機數</th>
              <th className="px-3 py-2 text-right font-medium">金額</th>
              <th className="px-3 py-2 text-right font-medium">轉換率</th>
              <th className="px-3 py-2 text-right font-medium">佔首階段</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {stages.map((s, i) => {
              const col = stageColor(s.color);
              const prev = i > 0 ? stages[i - 1].count : null;
              const conv =
                prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
              const share =
                first > 0 ? Math.round((s.count / first) * 100) : null;
              return (
                <tr key={s.key} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={cn("h-2 w-2 rounded-full", col.dot)}
                      />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(s.value)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {i === 0 ? "—" : conv !== null ? `${conv}%` : "—"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {share !== null ? `${share}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
