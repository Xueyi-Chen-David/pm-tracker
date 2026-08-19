"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, ChevronRight } from "lucide-react";
import {
  ecommerceStats,
  productCategoryStats,
  locationStats,
  groupByPrefecture,
  headcountStats,
  capitalStats,
  type Bucket,
} from "@/lib/crm-company-stats";
import { cn } from "@/lib/utils";
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
        <LocationStatCard profiles={profiles} total={total} />
        <DonutStatCard title="資本額" buckets={capitalStats(profiles)} total={total} />
      </div>
    </div>
  );
}

/** 甜甜圈本體（圖 + 中心總數），DonutStatCard／LocationStatCard 共用，只有旁邊的圖例不同。 */
function Donut({
  data,
  total,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
}) {
  return (
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
        <Donut data={data} total={total} />
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

/**
 * 地點分析：跟 DonutStatCard 同一套甜甜圖，只是分組層級收斂到都道府県（見
 * lib/crm-company-stats.ts 的 extractPrefecture），且圖例可以點——點某縣展開，
 * 底下列出這個縣目前有哪些公司、原始填的地點文字是什麼（可能比「XX県」更細）。
 */
function LocationStatCard({ profiles, total }: { profiles: CrmCompanyProfileRow[]; total: number }) {
  const buckets = locationStats(profiles);
  const byPrefecture = groupByPrefecture(profiles);
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = buckets.map((b, i) => ({
    name: b.label,
    value: b.count,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <Building2 className="h-3.5 w-3.5" />
        地點分析
      </div>
      <div className="flex items-center gap-3">
        <Donut data={data} total={total} />
        <div className="min-w-0 flex-1 space-y-1">
          {buckets.map((b, i) => {
            const companies = byPrefecture.get(b.label) ?? [];
            const isOpen = expanded === b.label;
            return (
              <div key={b.label}>
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : b.label)}
                  className="hover:bg-muted/60 -mx-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs"
                  aria-expanded={isOpen}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-left" title={b.label}>
                    {b.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {b.count} · {Math.round((b.count / total) * 100)}%
                  </span>
                  <ChevronRight
                    className={cn(
                      "text-muted-foreground h-3 w-3 shrink-0 transition-transform",
                      isOpen && "rotate-90",
                    )}
                  />
                </button>
                {isOpen && (
                  <ul className="border-muted mt-0.5 mb-1 ml-3.5 space-y-0.5 border-l pl-2">
                    {companies.map((c) => (
                      <li key={c.company} className="truncate text-[11px]">
                        <span className="font-medium">{c.company}</span>
                        {c.location?.trim() && c.location.trim() !== b.label && (
                          <span className="text-muted-foreground ml-1">
                            · {c.location.trim()}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
