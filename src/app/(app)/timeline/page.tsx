import Link from "next/link";
import { requireUser } from "@/server/auth-helpers";
import { getTimelineData } from "@/server/queries";
import { PageHeader } from "@/components/page-header";
import { TimelineChart } from "@/components/timeline-chart";
import { RoadmapChart } from "@/components/roadmap-chart";
import { MilestoneStatusBadge } from "@/components/badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDate } from "@/lib/date";
import { Star } from "lucide-react";

export const metadata = { title: "時程藍圖 · Project Pulse" };

export default async function TimelinePage() {
  await requireUser();
  const all = await getTimelineData();
  // 時間線不顯示未開始 / 暫停的專案
  const projects = all.filter(
    (p) => p.status !== "NOT_STARTED" && p.status !== "ON_HOLD",
  );

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

  const allMilestones = projects
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

      {rows.length > 0 && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>路線圖（里程碑 / 目標）</CardTitle>
          </CardHeader>
          <CardContent>
            <RoadmapChart projects={projects} />
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
              還沒有專案。建立專案並設定開始日 / 完成日後即可看到時程。
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
                  <Link
                    key={m.id}
                    href={`/projects/${project.id}`}
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
                  </Link>
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
