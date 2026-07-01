import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addMonths,
  format,
} from "date-fns";
import type { ProjectType } from "@prisma/client";
import { HealthDot } from "@/components/badges";

type Milestone = {
  id: string;
  title: string;
  status: "PLANNED" | "IN_PROGRESS" | "DONE" | "MISSED";
  plannedDate: Date | null;
  actualDate: Date | null;
  isGoal: boolean;
};
type Row = {
  id: string;
  name: string;
  type: ProjectType;
  color: string | null;
  health: "GREEN" | "YELLOW" | "RED";
  progress: number;
  startDate: Date | null;
  targetDate: Date | null;
  actualEndDate: Date | null;
  milestones: Milestone[];
};

const ROW_H = 44; // px
const HEADER_H = 28;

export function TimelineChart({ rows }: { rows: Row[] }) {
  // 蒐集所有日期決定範圍
  const dates: Date[] = [];
  for (const r of rows) {
    for (const d of [r.startDate, r.targetDate, r.actualEndDate]) if (d) dates.push(d);
    for (const m of r.milestones)
      for (const d of [m.plannedDate, m.actualDate]) if (d) dates.push(d);
  }
  const today = new Date();
  dates.push(today);
  // 常態型（無結束日）要往未來持續延伸，故多留幾個月的未來範圍
  const hasRoutine = rows.some((r) => r.type === "ROUTINE");

  let rangeStart: Date;
  let rangeEnd: Date;
  if (dates.length <= 1) {
    rangeStart = startOfMonth(today);
    rangeEnd = endOfMonth(addMonths(today, 3));
  } else {
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    let maxT = Math.max(...dates.map((d) => d.getTime()));
    if (hasRoutine) maxT = Math.max(maxT, addMonths(today, 4).getTime());
    rangeStart = startOfMonth(min);
    rangeEnd = endOfMonth(new Date(maxT));
  }
  const span = rangeEnd.getTime() - rangeStart.getTime() || 1;
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / span) * 100));

  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[720px]">
        {/* 左：專案名稱欄 */}
        <div className="w-44 shrink-0">
          <div style={{ height: HEADER_H }} />
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/projects/${r.id}`}
              className="hover:bg-muted/40 flex items-center gap-1.5 truncate border-t pr-2 text-sm font-medium"
              style={{ height: ROW_H }}
              title={r.name}
            >
              <HealthDot health={r.health} />
              <span className="truncate">{r.name}</span>
            </Link>
          ))}
        </div>

        {/* 右：時間軸 */}
        <div className="relative flex-1">
          {/* 月份格線 */}
          {months.map((m) => (
            <div
              key={m.toISOString()}
              className="absolute top-0 bottom-0 border-l border-dashed border-slate-200"
              style={{ left: `${pct(m)}%` }}
            />
          ))}
          {/* 今日線 */}
          <div
            className="absolute top-0 bottom-0 z-10 border-l-2 border-red-400"
            style={{ left: `${pct(today)}%` }}
            title={`今天 ${format(today, "yyyy/M/d")}`}
          >
            <span className="absolute -top-0.5 -left-4 rounded bg-red-400 px-1 text-[9px] text-white">
              今天
            </span>
          </div>

          {/* 月份標籤 */}
          <div className="relative" style={{ height: HEADER_H }}>
            {months.map((m) => (
              <div
                key={m.toISOString()}
                className="text-muted-foreground absolute top-1.5 text-[11px]"
                style={{ left: `calc(${pct(m)}% + 4px)` }}
              >
                {format(m, "yyyy/M")}
              </div>
            ))}
          </div>

          {/* 每列 */}
          {rows.map((r) => {
            const color = r.color ?? "#64748b";
            const isRoutine = r.type === "ROUTINE";
            // 常態型不看 targetDate，一律從開始（或最左）延伸到最右側
            const hasBar = !isRoutine && r.startDate && r.targetDate;
            const left = hasBar ? pct(r.startDate!) : 0;
            const right = hasBar ? pct(r.targetDate!) : 0;
            const width = Math.max(right - left, 0);
            const routineLeft = r.startDate ? pct(r.startDate) : 0;
            return (
              <div
                key={r.id}
                className="relative border-t"
                style={{ height: ROW_H }}
              >
                {/* 理想 bar */}
                {hasBar && (
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: color + "33",
                      border: `1px solid ${color}66`,
                    }}
                    title={`理想時程 ${format(r.startDate!, "M/d")} – ${format(r.targetDate!, "M/d")}`}
                  >
                    {/* 進度填充（現實） */}
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${r.progress}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                )}
                {/* 常態型：開放式橫條，往右持續延伸 */}
                {isRoutine && (
                  <div
                    className="absolute top-1/2 h-4 -translate-y-1/2 rounded-l-full"
                    style={{
                      left: `${routineLeft}%`,
                      right: 0,
                      background: `linear-gradient(to right, ${color}55, ${color}14)`,
                      borderTop: `1px solid ${color}66`,
                      borderBottom: `1px solid ${color}66`,
                      borderLeft: `1px solid ${color}66`,
                    }}
                    title={`常態型・持續進行${
                      r.startDate ? ` · 自 ${format(r.startDate, "yyyy/M/d")}` : ""
                    }`}
                  >
                    <span
                      className="absolute top-1/2 right-0.5 -translate-y-1/2 text-[11px] leading-none"
                      style={{ color }}
                    >
                      ▶
                    </span>
                  </div>
                )}
                {!hasBar && !isRoutine && r.startDate && (
                  <Marker left={pct(r.startDate)} color={color} label="開始" />
                )}

                {/* 里程碑 */}
                {r.milestones.map((m) => {
                  const done = m.status === "DONE";
                  const pos = m.actualDate ?? m.plannedDate;
                  if (!pos) return null;
                  return (
                    <div
                      key={m.id}
                      className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pct(pos)}%` }}
                      title={`${m.isGoal ? "🎯 " : ""}${m.title}${
                        m.plannedDate ? ` · 理想 ${format(m.plannedDate, "M/d")}` : ""
                      }${m.actualDate ? ` · 實際 ${format(m.actualDate, "M/d")}` : ""}`}
                    >
                      {m.isGoal ? (
                        <span
                          className="text-[13px] leading-none"
                          style={{ color }}
                        >
                          ★
                        </span>
                      ) : (
                        <span
                          className="block h-3 w-3 rotate-45 rounded-[2px] border-2"
                          style={{
                            borderColor: color,
                            backgroundColor: done ? color : "#fff",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Marker({
  left,
  color,
  label,
}: {
  left: number;
  color: string;
  label: string;
}) {
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${left}%` }}
      title={label}
    >
      <span
        className="block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
