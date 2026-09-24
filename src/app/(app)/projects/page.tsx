import { Plus } from "lucide-react";
import { requireActiveOrg, isManagerOrBoss } from "@/server/org";
import {
  getProjectsWithTasks,
  getOrgMemberUsers,
  distinctOwners,
} from "@/server/queries";
import { getProjectDetailBundle } from "@/server/project-bundle";
import {
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
import { Button } from "@/components/ui/button";
import {
  PROJECT_STATUS_TABS,
  ProjectViewTabs,
  parseStatusTab,
} from "@/components/project-view-tabs";
import type { ProjectStatus } from "@prisma/client";
import { ProjectsToolbar } from "@/components/projects-toolbar";
import { CollapseAllButton } from "@/components/projects/collapse-all-button";
import {
  ProjectManageCard,
  type ProjectManageView,
} from "@/components/projects/project-manage-card";

export const metadata = { title: "專案與任務 · Project Pulse" };

function ymd(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, membership } = await requireActiveOrg();
  const canManage = isManagerOrBoss(membership);
  const sp = await searchParams;

  // 這頁不再有「封存」分頁：以前封存過的專案一併列出，依狀態落在各分頁（完成 / 暫停…）。
  const [rows, members] = await Promise.all([
    getProjectsWithTasks(org.id, "all"),
    getOrgMemberUsers(org.id),
  ]);

  // 分頁固定五個狀態（進行中 / 未開始 / 暫停 / 已完成 / 已取消），不能自訂。
  const activeStatus = parseStatusTab(sp.board);
  const currentName =
    PROJECT_STATUS_TABS.find((t) => t.status === activeStatus)?.label ?? "";
  const viewProjects = rows.filter((p) => p.status === activeStatus);
  const counts = Object.fromEntries(
    PROJECT_STATUS_TABS.map((t) => [t.status, rows.filter((p) => p.status === t.status).length]),
  ) as Record<ProjectStatus, number>;

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

  // 手動排序（上/下移）只在「預設順序」時提供——此時畫面順序才等同 sortOrder；
  // 其餘排序方式下手動搬移沒有意義，故隱藏控制項。限管理者 / 老闆。
  const canReorder = canManage && sort === "default";

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

  const projects: ProjectManageView[] = filteredRows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    health: p.health,
    priority: p.priority,
    progress: p.progress,
    description: p.description,
    startDate: ymd(p.startDate),
    targetDate: ymd(p.targetDate),
    actualEndDate: p.actualEndDate?.toISOString() ?? null,
    statusChangedAt: p.statusChangedAt?.toISOString() ?? null,
    color: p.color,
    archived: p.archived,
    countInProgress: p.countInProgress,
    ownerId: p.ownerId,
    owner: p.owner,
    tasks: p.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      note: t.note,
      startDate: ymd(t.startDate),
      dueDate: ymd(t.dueDate),
      ownerLabel: t.ownerLabel,
      status: t.status,
      health: t.health,
      progress: t.progress,
      owners: t.owners,
      primaryOwnerId: t.primaryOwnerId,
      reminderDays: t.reminderDays,
    })),
    milestones: p.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      plannedDate: ymd(m.plannedDate),
      isGoal: m.isGoal,
    })),
    // 團隊＝在此專案有負責任務的人（Task.owners 聯集，去重）。
    team: distinctOwners(p.tasks),
  }));

  const totalTasks = projects.reduce((s, p) => s + p.tasks.length, 0);

  // 就地展開管理：**預設全部展開**，使用者可個別收合（URL `collapsed` 記錄被收合者）。
  // 沿用舊的 `expand` 參數（來自舊詳情頁轉址）僅作為「只展開這幾個」的相容行為。
  const collapsedIds = new Set(
    (sp.collapsed?.split(",").filter(Boolean)) ?? [],
  );
  const forceExpand = sp.expand?.split(",").filter(Boolean) ?? [];
  const useForceExpand = forceExpand.length > 0; // 空的 ?expand= 不該把全部收合
  const isExpanded = (id: string) =>
    useForceExpand ? forceExpand.includes(id) : !collapsedIds.has(id);
  const bundleEntries = await Promise.all(
    projects
      .filter((p) => isExpanded(p.id))
      .map(
        async (p) =>
          [p.id, await getProjectDetailBundle(org.id, p.id)] as const,
      ),
  );
  const bundles = new Map(bundleEntries);

  return (
    <div className="space-y-4">
      <PageHeader
        title="專案與任務"
        description={
          filtered
            ? `${currentName}：符合 ${projects.length} / ${viewProjects.length} 個專案`
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
          <ProjectViewTabs active={activeStatus} counts={counts} />
          <ProjectsToolbar owners={ownerOptions}>
            {projects.length > 0 && (
              <CollapseAllButton
                ids={projects.map((p) => p.id)}
                allCollapsed={projects.every((p) => !isExpanded(p.id))}
              />
            )}
          </ProjectsToolbar>

          {projects.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
              {viewProjects.length === 0
                ? `目前沒有「${currentName}」的專案。`
                : "沒有符合條件的專案，試試調整或清除篩選。"}
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((p, i) => (
                <ProjectManageCard
                  key={p.id}
                  project={p}
                  index={i}
                  members={members}
                  canEdit={true}
                  canReorder={canReorder}
                  siblingIds={projects.map((x) => x.id)}
                  expanded={isExpanded(p.id)}
                  bundle={bundles.get(p.id) ?? null}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
