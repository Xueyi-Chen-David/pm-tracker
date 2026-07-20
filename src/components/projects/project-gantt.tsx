import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addDays,
  addMonths,
  differenceInCalendarDays,
  isWeekend,
  getDate,
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

const ROW_H = 48; // px
const MONTH_H = 20; // 表頭上排（月）
const DAY_H = 24; // 表頭下排（日）
const HEADER_H = MONTH_H + DAY_H;

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

/** 距離截止日的倒數標籤與顏色（甘特圖的重點：一眼看出還剩多少 / 是否逾期）。 */
function deadlineInfo(
  due: Date | null,
  status: TaskView["status"],
  today: Date,
): { label: string; chip: string; color: string } | null {
  if (status === "DONE")
    return {
      label: "已完成",
      chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
      color: "#059669",
    };
  if (!due) return null;
  const d = differenceInCalendarDays(due, today);
  if (d < 0)
    return {
      label: `逾期 ${-d} 天`,
      chip: "border-rose-200 bg-rose-50 text-rose-600",
      color: "#e11d48",
    };
  if (d === 0)
    return {
      label: "今天到期",
      chip: "border-amber-200 bg-amber-50 text-amber-700",
      color: "#d97706",
    };
  if (d <= 3)
    return {
      label: `還剩 ${d} 天`,
      chip: "border-amber-200 bg-amber-50 text-amber-700",
      color: "#d97706",
    };
  return {
    label: `還剩 ${d} 天`,
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    color: "#059669",
  };
}

/**
 * 專案內「任務」的甘特圖。重點是**時間**：
 *  - 上方是可讀到每一天的日期刻度（範圍短→每天、長→每隔幾天以 M/d 標示）。
 *  - 左欄顯示起訖日期與「距離截止還剩幾天 / 逾期」倒數。
 *  - 橫條依緊急度著色，底部細線順帶帶出完成百分比。
 *  - 已取消的任務不列入。
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
  const today = new Date();
  // 已取消不進甘特圖。
  const rows = tasks
    .filter((t) => t.status !== "CANCELLED")
    .map((t) => ({
      task: t,
      start: toDate(t.startDate),
      due: toDate(t.dueDate),
    }));
  const goalMarks = goals
    .filter((g) => g.isGoal)
    .map((g) => ({ ...g, at: toDate(g.actualDate) ?? toDate(g.plannedDate) }))
    .filter((g) => g.at);

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

  // 時間範圍：涵蓋所有任務起訖 + 今天，往前後各補一天讓邊界不貼齊。
  const dates: Date[] = [today];
  for (const r of dated) {
    if (r.start) dates.push(r.start);
    if (r.due) dates.push(r.due);
  }
  for (const g of goalMarks) dates.push(g.at!);
  const minD = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxD = new Date(Math.max(...dates.map((d) => d.getTime())));
  const rangeStart = addDays(startOfMonth(minD), 0);
  const rangeEnd =
    maxD.getTime() > minD.getTime()
      ? endOfMonth(maxD)
      : endOfMonth(addMonths(minD, 1));
  const totalDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;

  // 依範圍長度決定每天像素寬與刻度密度：短→每天、中→每 7 天、長→每 14 天。
  const dense = totalDays <= 62;
  const DAY_W = dense ? 28 : totalDays <= 180 ? 14 : 8;
  const step = dense ? 1 : totalDays <= 180 ? 7 : 14;
  const timelineW = totalDays * DAY_W;
  const dayIndex = (d: Date) => differenceInCalendarDays(d, rangeStart);
  const xOf = (d: Date) => dayIndex(d) * DAY_W;
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

  // 刻度（日期標籤 + 格線）位置。
  const ticks: { i: number; date: Date }[] = [];
  for (let i = 0; i < totalDays; i += step) {
    ticks.push({ i, date: addDays(rangeStart, i) });
  }
  const bodyH = dated.length * ROW_H;
  const todayInRange =
    today.getTime() >= rangeStart.getTime() && today.getTime() <= rangeEnd.getTime();

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="flex w-max">
          {/* ── 左欄：任務 + 日期 + 倒數（水平捲動時固定） ── */}
          <div className="bg-card sticky left-0 z-30 w-40 shrink-0 border-r sm:w-60">
            <div
              className="bg-muted/40 border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
              style={{ height: HEADER_H }}
            >
              <div className="flex h-full items-end pb-1">任務 / 期間 · 倒數</div>
            </div>
            {dated.map(({ task, start, due }) => {
              const dl = deadlineInfo(due, task.status, today);
              return (
                <div
                  key={task.id}
                  className="flex flex-col justify-center gap-1 border-t px-3 first:border-t-0"
                  style={{ height: ROW_H }}
                  title={task.title}
                >
                  <div className="flex items-center gap-1.5">
                    <HealthDot health={task.health} className="shrink-0" />
                    <span
                      className={cn(
                        "truncate text-sm",
                        task.status === "DONE" && "text-muted-foreground",
                      )}
                    >
                      {task.title}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pl-[14px] text-[11px] leading-none">
                    <span className="text-muted-foreground tabular-nums">
                      {rangeText(start, due)}
                    </span>
                    {dl && (
                      <span
                        className={cn(
                          "rounded border px-1 py-px font-medium tabular-nums",
                          dl.chip,
                        )}
                      >
                        {dl.label}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── 時間軸（固定像素寬，可讀到每一天） ── */}
          <div className="shrink-0" style={{ width: timelineW }}>
            {/* 表頭：上排月份、下排日期 */}
            <div
              className="bg-muted/40 relative border-b"
              style={{ height: HEADER_H }}
            >
              {/* 月份 */}
              {months.map((m) => (
                <div
                  key={m.toISOString()}
                  className="text-muted-foreground absolute top-0 flex items-center px-1 text-[11px] font-semibold tabular-nums"
                  style={{ left: xOf(m), height: MONTH_H }}
                >
                  {format(m, "yyyy/M")}
                </div>
              ))}
              {/* 日期刻度 */}
              {ticks.map(({ i, date }) => {
                const weekend = isWeekend(date);
                return (
                  <div
                    key={i}
                    className={cn(
                      "text-muted-foreground absolute text-center text-[10px] leading-none tabular-nums",
                      weekend && "text-rose-400",
                    )}
                    style={{
                      left: xOf(date),
                      top: MONTH_H + 6,
                      width: DAY_W * step,
                    }}
                  >
                    {dense ? getDate(date) : format(date, "M/d")}
                  </div>
                );
              })}
            </div>

            {/* 內容：格線 / 週末 / 今日 / 目標 疊在列上 */}
            <div className="relative" style={{ height: bodyH }}>
              {/* 週末底色（僅每日刻度時） */}
              {dense &&
                Array.from({ length: totalDays }).map((_, i) => {
                  const d = addDays(rangeStart, i);
                  if (!isWeekend(d)) return null;
                  return (
                    <div
                      key={`we-${i}`}
                      className="bg-muted/40 absolute top-0 bottom-0"
                      style={{ left: i * DAY_W, width: DAY_W }}
                    />
                  );
                })}
              {/* 刻度格線 */}
              {ticks.map(({ i }) => (
                <div
                  key={`gl-${i}`}
                  className="absolute top-0 bottom-0 border-l border-border/60"
                  style={{ left: i * DAY_W }}
                />
              ))}
              {/* 目標里程碑（★） */}
              {goalMarks.map((g) => (
                <div
                  key={g.id}
                  className="absolute top-0 bottom-0 z-10 border-l border-dashed border-amber-400"
                  style={{ left: xOf(g.at!) + DAY_W / 2 }}
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
                  style={{ left: xOf(today) + DAY_W / 2 }}
                  title={`今天 ${format(today, "yyyy/M/d")}`}
                >
                  <span className="absolute -top-0 -left-4 rounded bg-red-400 px-1 text-[9px] leading-tight text-white">
                    今天
                  </span>
                </div>
              )}

              {/* 任務橫條 */}
              {dated.map(({ task, start, due }, idx) => {
                const point = due ?? start; // 至少一個存在
                const hasBar = start && due;
                const dl = deadlineInfo(due, task.status, today);
                const barColor = dl?.color ?? accent;
                const top = idx * ROW_H;
                if (hasBar) {
                  const left = xOf(start);
                  const w = Math.max(
                    (differenceInCalendarDays(due, start) + 1) * DAY_W,
                    DAY_W,
                  );
                  return (
                    <div
                      key={task.id}
                      className="absolute overflow-hidden rounded-md shadow-sm"
                      style={{
                        left: left + 1,
                        width: w - 2,
                        top: top + ROW_H / 2 - 10,
                        height: 20,
                        backgroundColor: barColor + "2e",
                        border: `1px solid ${barColor}66`,
                      }}
                      title={`${task.title} · ${format(start, "yyyy/M/d")} – ${format(due, "yyyy/M/d")}${dl ? ` · ${dl.label}` : ""} · 完成 ${task.progress}%`}
                    >
                      <div
                        className="absolute bottom-0 left-0 h-[3px]"
                        style={{ width: `${task.progress}%`, backgroundColor: barColor }}
                      />
                    </div>
                  );
                }
                // 單一日期：菱形
                return (
                  <div
                    key={task.id}
                    className="absolute z-10"
                    style={{
                      left: xOf(point!) + DAY_W / 2,
                      top: top + ROW_H / 2,
                      transform: "translate(-50%,-50%)",
                    }}
                    title={`${task.title} · ${due ? "到期" : "開始"} ${format(point!, "yyyy/M/d")}${dl ? ` · ${dl.label}` : ""}`}
                  >
                    <span
                      className="block h-3 w-3 rotate-45 rounded-[2px] border-2"
                      style={{
                        borderColor: barColor,
                        backgroundColor:
                          task.status === "DONE" ? barColor : "var(--card)",
                      }}
                    />
                  </div>
                );
              })}
              {/* 列分隔線 */}
              {dated.map((_, idx) =>
                idx === 0 ? null : (
                  <div
                    key={`row-${idx}`}
                    className="absolute right-0 left-0 border-t"
                    style={{ top: idx * ROW_H }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 圖例 */}
      <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-md border border-emerald-300 bg-emerald-100" />
          寬裕
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-md border border-amber-300 bg-amber-100" />
          將到期（≤3 天）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-6 rounded-md border border-rose-300 bg-rose-100" />
          已逾期
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-6" style={{ backgroundColor: accent }} />
          底線＝完成度
        </span>
        {goalMarks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-500">★ 目標</span>
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
