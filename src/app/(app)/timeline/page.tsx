import { requireActiveOrg } from "@/server/org";
import { getTimelineData } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { TimelineChart } from "@/components/timeline-chart";
import { RoadmapChart } from "@/components/roadmap-chart";
import { MilestoneStatusBadge } from "@/components/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/date";
import { Star } from "lucide-react";
import { TimelineFilters } from "@/components/timeline-filters";
import { parseTimelineStatuses } from "@/lib/timeline-filter";

export const metadata = { title: "時程藍圖 · Project Pulse" };

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org } = await requireActiveOrg();
  const sp = await searchParams;
  const all = await getTimelineData(org.id);

  // 要帶入哪些狀態的專案（?status=ACTIVE,COMPLETED；預設只看進行中）。
  const statuses = parseTimelineStatuses(sp.status);
  // 已完成的里程碑預設一律帶入（?done=0 關閉）——就算所屬專案沒被勾選也顯示。
  const includeDone = sp.done !== "0";

  const projects = all.filter((p) => statuses.includes(p.status));
  const selectedIds = new Set(projects.map((p) => p.id));
  const doneOnly = includeDone
    ? all
        .filter((p) => !selectedIds.has(p.id))
        .map((p) => ({ ...p, milestones: p.milestones.filter((m) => m.status === "DONE") }))
        .filter((p) => p.milestones.length > 0)
    : [];

  const rows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    color: p.color,
    health: p.health,
    progress: p.progress,
    startDate: p.startDate,
    targetDate: p.targetDate,
    actualEndDate: p.actualEndDate,
    milestones: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      plannedDate: m.plannedDate,
      actualDate: m.actualDate,
      isGoal: m.isGoal,
    })),
  }));

  const allMilestones = [...projects, ...doneOnly]
    .flatMap((p) =>
      p.milestones.map((m) => ({ project: p, m })),
    )
    .sort((a, b) => {
      const da = (a.m.plannedDate ?? a.m.actualDate)?.getTime() ?? Infinity;
      const db = (b.m.plannedDate ?? b.m.actualDate)?.getTime() ?? Infinity;
      return da - db;
    });

  return (
    <div>
      <PageHeader
        title="時程藍圖"
        description="各專案的理想時程（淺色橫條）對比現實進度（深色填充），里程碑顯示計畫日 vs 實際達成日。"
      />

      <TimelineFilters statuses={statuses} includeDone={includeDone} />

      {(rows.length > 0 || doneOnly.length > 0) && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>路線圖（里程碑 / 目標）</CardTitle>
          </CardHeader>
          <CardContent>
            <RoadmapChart projects={projects} extraProjects={doneOnly} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>甘特圖</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              {all.length === 0
                ? "還沒有專案。建立專案並設定開始日 / 完成日後即可看到時程。"
                : "目前勾選的狀態沒有專案。"}
            </p>
          ) : (
            <>
              <TimelineChart rows={rows} />
              <Legend />
            </>
          )}
        </CardContent>
      </Card>

      {allMilestones.length > 0 && (
        <Card className="mt-5">
          <CardHeader>
            <CardTitle>里程碑與目標</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {allMilestones.map(({ project, m }) => {
                const slipped =
                  m.plannedDate &&
                  m.actualDate &&
                  m.actualDate.getTime() > m.plannedDate.getTime();
                return (
                  <a
                    key={m.id}
                    href={`/projects#proj-${project.id}`}
                    className="hover:bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                      {m.isGoal && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <span className="truncate font-medium">{m.title}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        · {project.name}
                      </span>
                    </span>
                    <MilestoneStatusBadge status={m.status} />
                    <span className="text-muted-foreground text-xs">
                      理想 {fmtDate(m.plannedDate)}
                    </span>
                    <span
                      className={
                        slipped
                          ? "text-xs font-medium text-red-600"
                          : "text-muted-foreground text-xs"
                      }
                    >
                      實際 {fmtDate(m.actualDate)}
                    </span>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded-full bg-slate-300/40 ring-1 ring-slate-300" />
        理想時程
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-6 rounded-full bg-slate-500" />
        現實進度填充
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-6 rounded-l-full ring-1 ring-slate-300"
          style={{
            background: "linear-gradient(to right, #94a3b855, #94a3b814)",
          }}
        />
        常態型（持續進行）▶
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rotate-45 rounded-[2px] border-2 border-slate-500 bg-white" />
        里程碑（計畫）
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rotate-45 rounded-[2px] border-2 border-slate-500 bg-slate-500" />
        已完成
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-slate-500">★</span> 目標
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 border-l-2 border-red-400" /> 今天
      </span>
    </div>
  );
}
