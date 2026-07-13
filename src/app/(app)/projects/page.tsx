import { Plus } from "lucide-react";
import { requireActiveOrg } from "@/server/org";
import {
  getProjectsWithTasks,
  getOrgMemberUsers,
  getProjectViews,
} from "@/server/queries";
import {
  filterByView,
  filterProjects,
  hasActiveFilters,
  parseDir,
  parseFilters,
  parseSort,
  sortProjects,
} from "@/lib/project-filter";
import { primaryName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { NewProjectButton } from "@/components/new-project-button";
import { ProjectViewTabs } from "@/components/project-view-tabs";
import { ProjectsToolbar } from "@/components/projects-toolbar";
import { Button } from "@/components/ui/button";
import {
  ProjectGoalCard,
  type ProjectGoalView,
} from "@/components/tasks/project-goal-card";

export const metadata = { title: "專案與任務 · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org } = await requireActiveOrg();
  const sp = await searchParams;

  const [rows, members, views] = await Promise.all([
    getProjectsWithTasks(org.id),
    getOrgMemberUsers(org.id),
    getProjectViews(org.id),
  ]);

  // 視窗（tabs）：以 status / type 篩出該視窗的專案。
  const activeView =
    views.find((v) => v.id === sp.board) ??
    views.find((v) => v.isSystem) ??
    views[0];
  const viewProjects = activeView ? filterByView(rows, activeView) : rows;
  const counts: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.id, filterByView(rows, v).length]),
  );

  // 工具列篩選 / 排序（套在視窗結果之上）。
  const filters = parseFilters(sp);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir, sort);
  const filteredRows = sortProjects(
    filterProjects(viewProjects, filters),
    sort,
    dir,
  );
  const filtered = hasActiveFilters(filters);

  // 負責人下拉：取實際出現在專案中的負責人（去重）。
  const ownerOptions = Array.from(
    new Map(
      rows
        .filter((p) => p.owner)
        .map((p) => [
          p.owner!.id,
          { id: p.owner!.id, label: primaryName(p.owner) },
        ]),
    ).values(),
  ).sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

  const projects: ProjectGoalView[] = filteredRows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    health: p.health,
    progress: p.progress,
    targetDate: ymd(p.targetDate),
    owner: p.owner,
    tasks: p.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      note: t.note,
      dueDate: ymd(t.dueDate),
      ownerLabel: t.ownerLabel,
      status: t.status,
      health: t.health,
      progress: t.progress,
      owners: t.owners,
    })),
  }));

  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="專案與任務"
        description={
          filtered
            ? `${activeView?.name ?? ""}：符合 ${projects.length} / ${viewProjects.length} 個專案`
            : `${projects.length} 個專案 · ${totalTasks} 項任務`
        }
      >
        <NewProjectButton
          users={members}
          trigger={
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增專案 / 任務
            </Button>
          }
        />
      </PageHeader>

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          目前還沒有任何專案。
          <br />
          點右上「新增專案 / 任務」開始，每個專案卡片下可就地新增任務。
        </div>
      ) : (
        <>
          <ProjectViewTabs
            views={views}
            counts={counts}
            activeId={activeView?.id ?? ""}
            viewMode="card"
          />
          <ProjectsToolbar owners={ownerOptions} />

          {projects.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
              {viewProjects.length === 0
                ? `「${activeView?.name ?? ""}」視窗目前沒有專案。`
                : "沒有符合條件的專案，試試調整或清除篩選。"}
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((p, i) => (
                <ProjectGoalCard
                  key={p.id}
                  project={p}
                  index={i}
                  members={members}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
