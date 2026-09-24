import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  addMonths,
  format,
} from "date-fns";
import type { ProjectType } from "@prisma/client";
import { cn } from "@/lib/utils";

type RMilestone = {
  id: string;
  title: string;
  plannedDate: Date | null;
  actualDate: Date | null;
  isGoal: boolean;
};
type RProject = {
  id: string;
  name: string;
  type: ProjectType;
  color: string | null;
  startDate: Date | null;
  targetDate: Date | null;
  milestones: RMilestone[];
};

/**
 * 路線圖：水平時間軸 + 里程碑 / 目標卡片（交錯）+ 下方「主要業務推進」泳道。
 * 純呈現用，資料來自各專案與其里程碑。
 */
export function RoadmapChart({
  projects,
  extraProjects = [],
}: {
  projects: RProject[];
  /** 只帶入里程碑、不畫泳道的專案（例如沒被勾選狀態、但有已完成里程碑的專案）。 */
  extraProjects?: RProject[];
}) {
  const milestones = [...projects, ...extraProjects]
    .flatMap((p) =>
      p.milestones.map((m) => ({
        id: m.id,
        projectId: p.id,
        title: m.title,
        date: m.actualDate ?? m.plannedDate,
        isGoal: m.isGoal,
        color: p.color ?? "#475569",
      })),
    )
    .filter(
      (
        m,
      ): m is {
        id: string;
        projectId: string;
        title: string;
        date: Date;
        isGoal: boolean;
        color: string;
      } => !!m.date,
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const lanes = projects
    .filter((p) => p.startDate || p.targetDate || p.type === "ROUTINE")
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color ?? "#475569",
      start: p.startDate,
      end: p.targetDate,
      isRoutine: p.type === "ROUTINE",
    }));

  if (milestones.length === 0 && lanes.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        尚無里程碑 / 時程可顯示。設定開始日、完成日與里程碑後即可看到路線圖。
      </p>
    );
  }

  const dates: Date[] = [];
  milestones.forEach((m) => dates.push(m.date));
  lanes.forEach((l) => {
    if (l.start) dates.push(l.start);
    if (l.end) dates.push(l.end);
  });
  const today = new Date();
  dates.push(today);
  const hasRoutine = lanes.some((l) => l.isRoutine);

  let rangeStart: Date;
  let rangeEnd: Date;
  if (dates.length <= 1) {
    rangeStart = startOfMonth(today);
    rangeEnd = endOfMonth(addMonths(today, 6));
  } else {
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    let maxT = Math.max(...dates.map((d) => d.getTime()));
    if (hasRoutine) maxT = Math.max(maxT, addMonths(today, 3).getTime());
    rangeStart = startOfMonth(min);
    rangeEnd = endOfMonth(new Date(maxT));
  }
  const span = rangeEnd.getTime() - rangeStart.getTime() || 1;
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - rangeStart.getTime()) / span) * 100));
  const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

  // 卡片不重疊：貪婪排到「不會橫向重疊」的最低一層。
  // 間距取 20%，即使列印縮到約 640–680px 寬，128px 的卡片也不會互相遮住。
  const CARD_GAP_PCT = 20;
  const ROW_STEP = 54;
  const rowLast: number[] = [];
  const placed = milestones.map((m) => {
    const p = pct(m.date);
    let row = rowLast.findIndex((last) => p - last >= CARD_GAP_PCT);
    if (row === -1) {
      row = rowLast.length;
      rowLast.push(p);
    } else {
      rowLast[row] = p;
    }
    return { m, p, row };
  });
  const rowCount = Math.max(rowLast.length, 1);
  const calloutHeight = rowCount * ROW_STEP + 4;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px] px-3 pb-1 print:min-w-0">
        {/* 里程碑 / 目標卡片（自動分層、不互相遮住）*/}
        <div className="relative" style={{ height: calloutHeight }}>
          {/* 連接線：先畫，墊在後面 → 比較長的線會被卡片蓋住 */}
          {placed.map(({ m, p, row }) => (
            <div
              key={`stem-${m.id}`}
              className="absolute bottom-0 w-px -translate-x-1/2 bg-slate-300"
              style={{ left: `${p}%`, height: 4 + row * ROW_STEP }}
            />
          ))}
          {/* 卡片：後畫，蓋在線的前面。點一下捲到甘特圖對應專案。 */}
          {placed.map(({ m, p, row }) => (
            <a
              key={m.id}
              href={`/projects#proj-${m.projectId}`}
              title="前往專案與任務"
              className="absolute w-32 -translate-x-1/2"
              style={{ left: `${p}%`, bottom: 4 + row * ROW_STEP }}
            >
              <div
                className={cn(
                  "rounded-md border px-2 py-1 text-center text-[11px] leading-tight shadow-sm transition hover:shadow-md",
                  m.isGoal
                    ? "border-emerald-700 bg-emerald-600 font-semibold text-white"
                    : "bg-white",
                )}
                style={m.isGoal ? undefined : { borderColor: m.color }}
              >
                <div className="line-clamp-2">{m.title}</div>
                <div className="text-[9px] font-normal opacity-80">
                  {format(m.date, "yyyy/M/d")}
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* 軸線 + 月份點 + 里程碑點 + 今天 */}
        <div className="relative border-t-2 border-slate-700">
          {months.map((mo) => (
            <span
              key={mo.toISOString()}
              className="absolute top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-700"
              style={{ left: `${pct(mo)}%` }}
            />
          ))}
          {milestones.map((m) => (
            <span
              key={m.id}
              className="absolute top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-white"
              style={{
                left: `${pct(m.date)}%`,
                backgroundColor: m.isGoal ? "#059669" : m.color,
              }}
            />
          ))}
          <span
            className="absolute top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-red-200"
            style={{ left: `${pct(today)}%` }}
            title={`今天 ${format(today, "yyyy/M/d")}`}
          />
        </div>

        {/* 月份標籤 */}
        <div className="relative mt-1" style={{ height: 14 }}>
          {months.map((mo) => (
            <span
              key={mo.toISOString()}
              className="text-muted-foreground absolute -translate-x-1/2 text-[10px]"
              style={{ left: `${pct(mo)}%` }}
            >
              {format(mo, "yyyy/M")}
            </span>
          ))}
        </div>

        {/* 主要業務推進（泳道）*/}
        {lanes.length > 0 && (
          <div className="mt-4">
            <div className="text-muted-foreground mb-1.5 text-xs font-medium">
              主要業務推進
            </div>
            <div className="space-y-1.5">
              {lanes.map((l) => {
                const left = l.start ? pct(l.start) : 0;
                const open = l.isRoutine || !l.end;
                const right = open ? 100 : pct(l.end!);
                const width = Math.max(right - left, 4);
                return (
                  <div key={l.id} className="relative h-6">
                    <a
                      href={`/projects#proj-${l.id}`}
                      className={cn(
                        "absolute top-0 flex h-6 items-center px-2 text-[11px] font-medium text-white",
                        open ? "rounded-l-md" : "rounded-md",
                      )}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: open
                          ? `linear-gradient(to right, ${l.color}, ${l.color}99)`
                          : l.color,
                      }}
                      title={`${l.name}（前往專案與任務）`}
                    >
                      <span className="truncate">
                        {l.name}
                        {open ? " ▸" : ""}
                      </span>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
