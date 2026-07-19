import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addMonths,
  differenceInCalendarDays,
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

const ROW_H = 46; // px
const HEADER_H = 30;

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "string" ? parseISO(v) : v;
  return isValid(d) ? d : null;
}

/** 左欄日期摘要：起訖 / 只有到期 / 只有開始。 */
function rangeText(start: Date | null, due: Date | null): string {
  if (start && due) return `${format(start, "M/d")} – ${format(due, "M/d")}`;
  if (due) return `到期 ${format(due, "M/d")}`;
  if (start) return `開始 ${format(start, "M/d")}`;
  return "";
}

/**
 * 專案內「任務」的甘特圖：每條任務一列，左欄顯示名稱與起訖日期，右側時間軸以橫條表示
 * 規劃區間並填入完成進度；只有單一日期的任務以菱形標出。上方為月份刻度，紅線＝今天，
 * ★＝專案目標里程碑（垂直參考線）。
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

  // 只有設了日期的任務能排上時程；沒日期的任務不畫（避免定位到 null 而報錯）。
  const dated = rows.filter((r) => r.start || r.due);
  const undatedCount = rows.length - dated.length;
  if (dated.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
        <CalendarRange className="h-5 w-5 opacity-60" />
        任務尚未設定開始 / 到期日，無法排上時程。
        <span className="text-xs">在「任務」分頁的日期欄設定起訖日後即會顯示。</span>
      </div>
    );
  }

  // 決定時間範圍
  const dates: Date[] = [];
  for (const r of dated) {
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
  const todayInRange =
    today.getTime() >= rangeStart.getTime() && today.getTime() <= rangeEnd.getTime();

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[680px]">
          {/* ── 表頭：左欄留白 + 月份刻度 ── */}
          <div className="bg-muted/40 flex border-b">
            <div className="w-36 shrink-0 border-r px-3 py-1.5 text-[11px] font-medium text-muted-foreground sm:w-56">
              任務 / 期間
            </div>
            <div className="relative flex-1" style={{ height: HEADER_H }}>
              {months.map((m) => (
                <div
                  key={m.toISOString()}
                  className="text-muted-foreground absolute top-1/2 -translate-y-1/2 text-[11px] font-medium tabular-nums"
                  style={{ left: `calc(${pct(m)}% + 4px)` }}
                >
                  {format(m, "yyyy/M")}
                </div>
              ))}
            </div>
          </div>

          {/* ── 資料列 ── */}
          <div className="flex">
            {/* 左：任務名稱 + 日期 */}
            <div className="w-36 shrink-0 border-r sm:w-56">
              {dated.map(({ task, start, due }) => (
                <div
                  key={task.id}
                  className="flex flex-col justify-center gap-0.5 border-t px-3 first:border-t-0"
                  style={{ height: ROW_H }}
                  title={task.title}
                >
                  <div className="flex items-center gap-1.5">
                    <HealthDot health={task.health} className="shrink-0" />
                    <span
                      className={cn(
                        "truncate text-sm",
                        task.status === "CANCELLED" &&
                          "text-muted-foreground line-through",
                        task.status === "DONE" && "text-muted-foreground",
                      )}
                    >
                      {task.title}
                    </span>
                  </div>
                  <span className="text-muted-foreground pl-[14px] text-[11px] tabular-nums">
                    {rangeText(start, due)}
                  </span>
                </div>
              ))}
            </div>

            {/* 右：時間軸 */}
            <div className="relative flex-1">
              {/* 月份格線 */}
              {months.map((m, i) =>
                i === 0 ? null : (
                  <div
                    key={m.toISOString()}
                    className="absolute top-0 bottom-0 border-l border-dashed border-border"
                    style={{ left: `${pct(m)}%` }}
                  />
                ),
              )}
              {/* 目標里程碑（★）垂直參考線 */}
              {goalMarks.map((g) => (
                <div
                  key={g.id}
                  className="absolute top-0 bottom-0 z-10 border-l border-dashed border-amber-400"
                  style={{ left: `${pct(g.at!)}%` }}
                  title={`🎯 ${g.title} · ${format(g.at!, "yyyy/M/d")}`}
                >
                  <span className="absolute -top-2 -left-1.5 text-[11px] leading-none text-amber-500">
                    ★
                  </span>
                </div>
              ))}
              {/* 今日線 */}
              {todayInRange && (
                <div
                  className="absolute top-0 bottom-0 z-20 border-l-2 border-red-400"
                  style={{ left: `${pct(today)}%` }}
                  title={`今天 ${format(today, "yyyy/M/d")}`}
                >
                  <span className="absolute -top-2 -left-4 rounded bg-red-400 px-1 text-[9px] leading-tight text-white">
                    今天
                  </span>
                </div>
              )}

              {/* 每列任務 */}
              {dated.map(({ task, start, due }) => {
                const point = due ?? start; // 兩者至少一個存在（dated 已過濾）
                const hasBar = start && due;
                const cancelled = task.status === "CANCELLED";
                const barColor = cancelled ? "#94a3b8" : accent;
                const barW = hasBar ? Math.max(pct(due) - pct(start), 1.5) : 0;
                const days =
                  hasBar && start && due
                    ? differenceInCalendarDays(due, start) + 1
                    : 0;
                return (
                  <div
                    key={task.id}
                    className="relative border-t first:border-t-0"
                    style={{ height: ROW_H }}
                  >
                    {hasBar ? (
                      <div
                        className="group absolute top-1/2 flex h-5 -translate-y-1/2 items-center rounded-md shadow-sm"
                        style={{
                          left: `${pct(start)}%`,
                          width: `${barW}%`,
                          backgroundColor: barColor + "2e",
                          border: `1px solid ${barColor}66`,
                        }}
                        title={`${task.title} · ${format(start, "yyyy/M/d")} – ${format(due, "yyyy/M/d")}（${days} 天）· ${task.progress}%`}
                      >
                        {/* 進度填充 */}
                        <div
                          className="absolute inset-y-0 left-0 rounded-md"
                          style={{
                            width: `${task.progress}%`,
                            backgroundColor: barColor,
                          }}
                        />
                        {/* 進度數字（橫條夠寬才顯示） */}
                        {barW > 10 && (
                          <span
                            className="relative z-10 px-1.5 text-[10px] font-semibold tabular-nums"
                            style={{ color: task.progress >= 55 ? "#fff" : barColor }}
                          >
                            {task.progress}%
                          </span>
                        )}
                      </div>
                    ) : (
                      // 只有單一日期：以菱形標出
                      <div
                        className="absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1"
                        style={{ left: `${pct(point!)}%` }}
                        title={`${task.title} · ${due ? "到期" : "開始"} ${format(point!, "yyyy/M/d")}`}
                      >
                        <span
                          className="block h-3 w-3 shrink-0 -translate-x-1/2 rotate-45 rounded-[2px] border-2"
                          style={{
                            borderColor: barColor,
                            backgroundColor:
                              task.status === "DONE" ? barColor : "var(--card)",
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
      </div>

      {/* 圖例 */}
      <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-3 w-6 rounded-md"
            style={{ backgroundColor: accent + "2e", border: `1px solid ${accent}66` }}
          />
          規劃區間
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-md" style={{ backgroundColor: accent }} />
          完成進度
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 rounded-[2px] border-2 border-slate-400" />
          單一日期
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
      {undatedCount > 0 && (
        <p className="text-muted-foreground mt-1.5 text-[11px]">
          另有 {undatedCount} 項未設定日期的任務未顯示。
        </p>
      )}
    </div>
  );
}
