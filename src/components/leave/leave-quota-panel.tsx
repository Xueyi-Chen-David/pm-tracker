"use client";

import type { LeaveQuotaOverview } from "@/server/queries";
import { displayName } from "@/lib/display";
import { formatSeniority } from "@/lib/leave-entitlement";
import { fmtDate } from "@/lib/date";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * 特休 / 假別額度總覽（HR）：依到職日年資自動給特休天數（§38），
 * 比對當年已休 → 剩餘 + 未休折算金額；其他假別顯示額度 / 已用。
 */
export function LeaveQuotaPanel({
  quota,
  year,
}: {
  quota: LeaveQuotaOverview;
  year: number;
}) {
  const asOf = new Date();
  const { rows, quotaTypes } = quota;
  const noHire = rows.filter((r) => !r.hireDate).length;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {year} 年度 · 特休依到職日年資自動計算（勞基法§38）。未設到職日者無法計算特休——
        可在成員「個人資料」補上到職日。「未休折算」＝剩餘特休 × 日薪（月薪 ÷ 30），供年度結算參考。
      </p>
      {noHire > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          有 {noHire} 位成員尚未設定到職日，特休天數顯示為「—」。
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 text-left font-medium">成員</th>
              <th className="px-3 py-2 text-left font-medium">年資</th>
              <th className="px-3 py-2 text-right font-medium">特休應有</th>
              <th className="px-3 py-2 text-right font-medium">已休</th>
              <th className="px-3 py-2 text-right font-medium">剩餘</th>
              <th className="px-3 py-2 text-right font-medium">未休折算</th>
              {quotaTypes.map((t) => (
                <th key={t.id} className="px-3 py-2 text-right font-medium">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.membershipId} className="hover:bg-muted/30 border-t">
                <td className="px-3 py-2">
                  <div>{displayName(r)}</div>
                  {r.hireDate && (
                    <div className="text-muted-foreground text-[11px]">
                      到職 {fmtDate(r.hireDate)}
                    </div>
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2">
                  {formatSeniority(r.hireDate, asOf)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.specialTotal != null ? r.specialTotal : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.specialUsed}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {r.specialRemaining != null ? r.specialRemaining : "—"}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {r.unpaidValue != null ? fmt(r.unpaidValue) : "—"}
                </td>
                {quotaTypes.map((t) => {
                  const ol = r.otherLeaves.find((x) => x.id === t.id);
                  return (
                    <td
                      key={t.id}
                      className="px-3 py-2 text-right tabular-nums"
                    >
                      {ol ? (
                        <span
                          className={
                            ol.used > ol.quota ? "text-rose-600 font-medium" : ""
                          }
                        >
                          {ol.used}
                          <span className="text-muted-foreground"> / {ol.quota}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        「已休」由出席月曆的請假紀錄（依假別）統計；病假 / 事假等以假別的年度額度（在「假別」設定）為分母。
      </p>
    </div>
  );
}
