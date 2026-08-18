"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Building2 } from "lucide-react";
import {
  ecommerceStats,
  productCategoryStats,
  locationStats,
  headcountStats,
  capitalStats,
  type Bucket,
} from "@/lib/crm-company-stats";
import type { CrmCompanyProfileRow } from "@/server/queries";

/** 跟 progress-chart.tsx／daily-report-trend.tsx 同一套色票風格（固定 hex，不是 CSS 變數——
 * recharts 畫在 SVG 裡拿不到 Tailwind token）；夠多顏色循環使用，桶數再多也不會撞色太快。 */
const PALETTE = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

/**
 * 「統計」分頁：企業基本檔案大部分欄位是自由文字，分組/分桶邏輯全在
 * lib/crm-company-stats.ts（純函式，好測試好複用），這裡只負責畫圖——
 * 用圓餅圖（實際是甜甜圈，中間留白比較不悶）取代原本的長條清單，好看一點也一眼看出比例。
 */
export function CompanyStatsPanel({ profiles }: { profiles: CrmCompanyProfileRow[] }) {
  const total = profiles.length;

  if (total === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
        還沒有任何公司資料可以統計。先在「依公司」建幾筆基本檔案，或用「新增公司」建一筆。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        依目前 {total} 家有基本檔案的公司統計；欄位是自由文字的部分（人數／資本額／地點）用最佳猜測分組，僅供參考。
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <DonutStatCard title="電商使用情況" buckets={ecommerceStats(profiles)} total={total} />
        <DonutStatCard title="人數規模" buckets={headcountStats(profiles)} total={total} />
        <DonutStatCard title="產品類型" buckets={productCategoryStats(profiles)} total={total} />
        <DonutStatCard title="地點分析" buckets={locationStats(profiles)} total={total} />
        <DonutStatCard title="資本額" buckets={capitalStats(profiles)} total={total} />
      </div>
    </div>
  );
}

function DonutStatCard({ title, buckets, total }: { title: string; buckets: Bucket[]; total: number }) {
  const data = buckets.map((b, i) => ({
    name: b.label,
    value: b.count,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Building2 className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={30}
                outerRadius={54}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value} 家`, name]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm leading-none font-bold tabular-nums">{total}</span>
            <span className="text-muted-foreground text-[10px] leading-none">家</span>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {buckets.map((b, i) => (
            <div key={b.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: PALETTE[i % PALETTE.length] }}
              />
              <span className="min-w-0 flex-1 truncate" title={b.label}>
                {b.label}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {b.count} · {Math.round((b.count / total) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
