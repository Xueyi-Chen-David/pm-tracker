import Link from "next/link";
import {
  FolderKanban,
  AlertTriangle,
  MessageCircleQuestion,
  CircleCheckBig,
  FileText,
  CalendarClock,
} from "lucide-react";
import type { ProjectType } from "@prisma/client";
import { requireUser } from "@/server/auth-helpers";
import { getDashboardData } from "@/server/queries";
import { PROJECT_TYPE } from "@/lib/constants";
import { weekLabel, isOverdue, thisWeekStart } from "@/lib/date";
import { primaryName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/project-card";
import {
  HealthDot,
  HealthBadge,
  TypeBadge,
} from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "總覽 · Project Pulse" };

const GROUP_ORDER: ProjectType[] = ["PROJECT", "ROUTINE", "ONE_TIME"];

export default async function DashboardPage() {
  await requireUser();
  const { projects } = await getDashboardData();
  const week = thisWeekStart();

  const enriched = projects.map((p) => {
    const latest = p.weeklyUpdates[0];
    const updatedThisWeek =
      !!latest && latest.weekStart.getTime() === week.getTime();
    const overdue = isOverdue(p.targetDate, p.status === "COMPLETED");
    const needsAttention =
      p.status !== "COMPLETED" &&
      (p.health !== "GREEN" || !!latest?.risks || !!latest?.needsDecision || overdue);
    return { p, latest, updatedThisWeek, overdue, needsAttention };
  });

  const active = enriched.filter((e) => e.p.status !== "COMPLETED");
  const attention = enriched
    .filter((e) => e.needsAttention)
    .sort((a, b) => healthRank(b.p.health) - healthRank(a.p.health));
  const decisions = enriched.filter((e) => e.latest?.needsDecision);
  const updatedCount = active.filter((e) => e.updatedThisWeek).length;

  return (
    <div>
      <PageHeader
        title="總覽"
        description={`本週 ${weekLabel(week)} · 一眼掌握所有專案與任務的進度`}
      >
        <Link href="/report" className={buttonVariants({ variant: "outline" })}>
          <FileText className="h-4 w-4" /> 產生週報
        </Link>
      </PageHeader>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<FolderKanban className="h-5 w-5" />}
          label="專案 / 任務"
          value={projects.length}
          sub={`進行中 ${active.length}`}
          tone="slate"
        />
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          label="需要關注"
          value={attention.length}
          sub="有風險 / 落後 / 逾期"
          tone={attention.length > 0 ? "red" : "green"}
        />
        <Kpi
          icon={<MessageCircleQuestion className="h-5 w-5" />}
          label="需老闆決策"
          value={decisions.length}
          sub="待上層拍板"
          tone={decisions.length > 0 ? "amber" : "green"}
        />
        <Kpi
          icon={<CircleCheckBig className="h-5 w-5" />}
          label="本週已更新"
          value={`${updatedCount}/${active.length}`}
          sub="進行中專案更新覆蓋率"
          tone={
            active.length > 0 && updatedCount === active.length ? "green" : "slate"
          }
        />
      </div>

      {/* 需要關注 */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="h-5 w-5 text-amber-500" /> 需要關注
        </h2>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CircleCheckBig className="h-5 w-5" /> 本週所有專案狀態良好，沒有風險或逾期項目。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {attention.map((e) => (
              <ProjectCard key={e.p.id} project={e.p} />
            ))}
          </div>
        )}
      </section>

      {/* 需老闆決策 */}
      {decisions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <MessageCircleQuestion className="h-5 w-5 text-amber-500" /> 需老闆決策
          </h2>
          <div className="divide-y rounded-xl border bg-amber-50/40">
            {decisions.map((e) => (
              <Link
                key={e.p.id}
                href={`/projects/${e.p.id}`}
                className="hover:bg-amber-50 flex gap-3 px-4 py-3"
              >
                <HealthDot health={e.p.health} className="mt-1.5" />
                <div className="min-w-0">
                  <div className="font-medium">{e.p.name}</div>
                  <div className="text-sm whitespace-pre-wrap text-amber-800">
                    {e.latest?.needsDecision}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 全部專案：當週狀態 */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">所有專案 · 本週狀態</h2>
        <div className="space-y-6">
          {GROUP_ORDER.map((type) => {
            const items = enriched.filter((e) => e.p.type === type);
            if (items.length === 0) return null;
            return (
              <div key={type}>
                <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium">
                  <TypeBadge type={type} /> {PROJECT_TYPE[type].label}
                  <span>· {items.length} 項</span>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y">
                      {items.map((e) => (
                        <Link
                          key={e.p.id}
                          href={`/projects/${e.p.id}`}
                          className="hover:bg-muted/40 grid grid-cols-12 items-center gap-2 px-3 py-2.5 text-sm"
                        >
                          <div className="col-span-12 flex min-w-0 items-center gap-2 sm:col-span-4">
                            <HealthDot health={e.p.health} />
                            <span className="truncate font-medium">{e.p.name}</span>
                          </div>
                          <div className="text-muted-foreground col-span-4 hidden truncate sm:col-span-2 sm:block">
                            {e.p.owner ? primaryName(e.p.owner) : "—"}
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <ProgressBar value={e.p.progress} />
                          </div>
                          <div className="col-span-6 flex flex-wrap items-center justify-end gap-1.5 sm:col-span-3">
                            {e.updatedThisWeek ? (
                              <HealthBadge health={e.latest!.health} />
                            ) : (
                              <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                                本週未更新
                              </span>
                            )}
                            {e.overdue && (
                              <span className="inline-flex items-center gap-0.5 rounded-full border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-600">
                                <CalendarClock className="h-3 w-3" />逾期
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </section>

      {projects.length === 0 && (
        <div className="text-muted-foreground mt-8 rounded-xl border border-dashed py-16 text-center">
          還沒有任何專案。
          <Link href="/projects/new" className="text-primary ml-1 underline">
            建立第一個
          </Link>
        </div>
      )}
    </div>
  );
}

function healthRank(h: string) {
  return h === "RED" ? 2 : h === "YELLOW" ? 1 : 0;
}

const TONE: Record<string, string> = {
  slate: "text-slate-600 bg-slate-100",
  red: "text-red-600 bg-red-100",
  amber: "text-amber-600 bg-amber-100",
  green: "text-emerald-600 bg-emerald-100",
};

function Kpi({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone: keyof typeof TONE;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", TONE[tone])}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl leading-none font-bold">{value}</div>
          <div className="text-muted-foreground mt-1 text-xs">{label}</div>
          {sub && <div className="text-muted-foreground/80 text-[11px]">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
