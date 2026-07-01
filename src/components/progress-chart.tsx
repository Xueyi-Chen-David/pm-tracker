"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { HEALTH } from "@/lib/constants";

const HEALTH_COLOR: Record<string, string> = {
  GREEN: "#10b981",
  YELLOW: "#f59e0b",
  RED: "#ef4444",
};

export type ChartPoint = {
  label: string;
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
};

export function ProgressChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
        尚無每週進度資料，新增第一筆後即可看到趨勢。
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickMargin={8}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value, _name, item) => {
              const health = ((item as { payload?: ChartPoint } | undefined)
                ?.payload?.health ?? "GREEN") as keyof typeof HEALTH;
              return [`${value}% · ${HEALTH[health].label}`, "進度"];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="progress"
            stroke="#2563eb"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: ChartPoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || !payload) {
                return <g key={index} />;
              }
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill={HEALTH_COLOR[payload.health] ?? "#2563eb"}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              );
            }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
