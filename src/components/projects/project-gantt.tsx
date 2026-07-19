import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addMonths,
  format,
  parseISO,
  isValid,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import { HealthDot } from "@/components/badges";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/components/tasks/task-row";

type GoalMark = {
  id: string;
  title: string;
  plannedDate: Date | string | null;
  actualDate: Date | string | null;
  isGoal: boolean;
};

const ROW_H = 40; // px
const HEADER_H = 28;

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

/**
 * 專案內「任務」的甘特圖：每條任務一列，橫條＝開始→到期，內填完成進度；只有到期日
 * 的任務以菱形標記呈現。紅線＝今天；★＝專案目標里程碑（垂直參考線）。沿用時程藍圖的
 * 視覺語言（淺色規劃區間 + 深色進度填充），但聚焦在單一專案的任務層級。
 */
export function ProjectGantt({
  tasks,
  color,
  goals = [],
}: {
  tasks: TaskView[];
  color: string | null;
  /** 專案里程碑（取 isGoal 者當作垂直目標線）。 */
  goals?: GoalMark[];
}) {
  const accent = color ?? "#7c3aed";
  const rows = tasks.map((t) => ({
    task: t,
    start: toDate(t.startDate),
    due: toDate(t.dueDate),
  }));
  const goalMarks = goals
    .filter((g) => g.isGoal)
    .map((g) => ({ ...g, at: toDate(g.actualDate) ?? toDate(g.plannedDate) }))
    .filter((g) => g.at);

  const dated = rows.filter((r) => r.start || r.due);
  if (dated.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
        <CalendarRange className="h-5 w-5 opacity-60" />
        任務尚未設定開始 / 到期日，無法排上時程。
        <span className="text-xs">在上方任務列的日期欄設定起訖日後即會顯示。</span>
      </div>
    );
  }

  // 決定時間範圍
  const dates: Date[] = [];
  for (const r of rows) {
    if (r.start) dates.push(r.start);
    if (r.due) dates.push(r.due);
  }
  for (const g of goalMarks) dates.push(g.at!);
  const today = new Date();
  dates.push(today);

  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  const rangeStart = startOfMonth(min);
  // 至少展示到下個月底，避免只有一個時間點時整條擠在邊緣。
  const rangeEnd = endOfMonth(max.getTime() > min.getTime() ? max : addMonths(min, 1));
  const span = rangeEnd.getTime() - rangeStart.getTime() || 1;
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / span) * 100));
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex min-w-[640px]">
          {/* 左：任務名稱欄 */}
          <div className="w-40 shrink-0 sm:w-48">
            <div style={{ height: HEADER_H }} />
            {rows.map(({ task }) => (
              <div
                key={task.id}
                className="flex items-center gap-1.5 border-t pr-2 text-sm"
                style={{ height: ROW_H }}
                title={task.title}
              >
                <HealthDot health={task.health} />
                <span
                  className={cn(
                    "truncate",
                    task.status === "CANCELLED" &&
                      "text-muted-foreground line-through",
                    task.status === "DONE" && "text-muted-foreground",
                  )}
                >
                  {task.title}
                </span>
              </div>
            ))}
          </div>

          {/* 右：時間軸 */}
          <div className="relative flex-1">
            {/* 月份格線 */}
            {months.map((m) => (
              <div
                key={m.toISOString()}
                className="absolute top-0 bottom-0 border-l border-dashed border-slate-200 dark:border-slate-700"
                style={{ left: `${pct(m)}%` }}
              />
            ))}
            {/* 目標里程碑（★）垂直參考線 */}
            {goalMarks.map((g) => (
              <div
                key={g.id}
                className="absolute top-0 bottom-0 z-10 border-l border-dashed border-amber-400"
                style={{ left: `${pct(g.at!)}%` }}
                title={`🎯 ${g.title} · ${format(g.at!, "yyyy/M/d")}`}
              >
                <span className="absolute -top-0.5 -left-1.5 text-[11px] leading-none text-amber-500">
                  ★
                </span>
              </div>
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

            {/* 每列任務 */}
            {rows.map(({ task, start, due }) => {
              const hasBar = start && due;
              const cancelled = task.status === "CANCELLED";
              const barColor = cancelled ? "#94a3b8" : accent;
              return (
                <div
                  key={task.id}
                  className="relative border-t"
                  style={{ height: ROW_H }}
                >
                  {hasBar ? (
                    <div
                      className="absolute top-1/2 h-4 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${pct(start)}%`,
                        width: `${Math.max(pct(due) - pct(start), 0)}%`,
                        backgroundColor: barColor + "33",
                        border: `1px solid ${barColor}66`,
                      }}
                      title={`${task.title} · ${format(start, "M/d")} – ${format(due, "M/d")} · ${task.progress}%`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${task.progress}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                  ) : (
                    // 只有單一日期：以菱形標出
                    <div
                      className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${pct((due ?? start)!)}%` }}
                      title={`${task.title} · ${due ? "到期" : "開始"} ${format((due ?? start)!, "yyyy/M/d")}`}
                    >
                      <span
                        className="block h-3 w-3 rotate-45 rounded-[2px] border-2"
                        style={{
                          borderColor: barColor,
                          backgroundColor:
                            task.status === "DONE" ? barColor : "#fff",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 圖例 */}
      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-6 rounded-full"
            style={{ backgroundColor: accent + "33", border: `1px solid ${accent}66` }}
          />
          規劃區間
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-6 rounded-full"
            style={{ backgroundColor: accent }}
          />
          完成進度
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 rounded-[2px] border-2 border-slate-400" />
          單一日期任務
        </span>
        {goalMarks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-500">
            ★ 目標里程碑
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-red-400" /> 今天
        </span>
      </div>
    </div>
  );
}
