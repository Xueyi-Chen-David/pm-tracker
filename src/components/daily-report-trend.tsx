"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

export type DailyTrendPoint = { label: string; score: number };

function barColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

export function DailyReportTrend({ data }: { data: DailyTrendPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
        還沒有足夠的每日紀錄，填幾天後就能看到趨勢。
      </div>
    );
  }
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickMargin={6}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
          />
          <Tooltip
            formatter={(v) => [`${v} / 100`, "完成度"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={barColor(d.score)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
