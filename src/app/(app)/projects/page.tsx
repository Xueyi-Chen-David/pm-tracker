import { Plus } from "lucide-react";
import type { ProjectView } from "@prisma/client";
import { db } from "@/server/db";
import { requireActiveOrg, isManagerOrBoss } from "@/server/org";
import {
  getProjectsWithTasks,
  getOrgMemberUsers,
  getProjectViews,
  distinctOwners,
} from "@/server/queries";
import { getProjectDetailBundle } from "@/server/project-bundle";
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
import { Button } from "@/components/ui/button";
import { ProjectViewTabs } from "@/components/project-view-tabs";
import { ProjectsToolbar } from "@/components/projects-toolbar";
import {
  ProjectManageCard,
  type ProjectManageView,
} from "@/components/projects/project-manage-card";

export const metadata = { title: "專案與任務 · Project Pulse" };

/** 「封存」是內建虛擬視窗（非 DB 中的 ProjectView）：顯示 archived=true 的專案。 */
const ARCHIVED_VIEW_ID = "archived";

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

  const isArchivedView = sp.board === ARCHIVED_VIEW_ID;
  const [rows, members, views, archivedCount] = await Promise.all([
    getProjectsWithTasks(org.id),
    getOrgMemberUsers(org.id),
    getProjectViews(org.id),
    db.project.count({ where: { organizationId: org.id, archived: true } }),
  ]);
  // 封存視窗才另外撈 archived=true 的專案（含任務 / 里程碑）。
  const archivedRows = isArchivedView
    ? await getProjectsWithTasks(org.id, true)
    : [];

  // 視窗（tabs）：以 status / type 篩出該視窗的專案；封存視窗直接用 archivedRows。
  const activeView = isArchivedView
    ? null
    : (views.find((v) => v.id === sp.board) ??
      views.find((v) => v.isSystem) ??
      views[0]);
  const currentName = isArchivedView ? "封存" : (activeView?.name ?? "");
  const viewProjects = isArchivedView
    ? archivedRows
    : activeView
      ? filterByView(rows, activeView)
      : rows;
  const counts: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.id, filterByView(rows, v).length]),
  );
  counts[ARCHIVED_VIEW_ID] = archivedCount;

  // 內建「封存」虛擬視窗，接在使用者的視窗後面。
  const archivedView: ProjectView = {
    id: ARCHIVED_VIEW_ID,
    name: "封存",
    statuses: [],
    types: [],
    exclude: false,
    isSystem: true,
    sortOrder: 9999,
    createdAt: new Date(0),
    organizationId: org.id,
  };
  const tabViews = [...views, archivedView];

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

  // 手動排序（上/下移）只在「預設順序」且非封存視窗時提供——此時畫面順序才等同 sortOrder；
  // 其餘排序方式下手動搬移沒有意義，故隱藏控制項。限管理者 / 老闆。
  const canReorder = canManage && sort === "default" && !isArchivedView;

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
  const forceExpand = sp.expand?.split(",").filter(Boolean);
  const isExpanded = (id: string) =>
    forceExpand ? forceExpand.includes(id) : !collapsedIds.has(id);
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

      {rows.length === 0 && archivedCount === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          目前還沒有任何專案。
          <br />
          點右上「新增專案 / 任務」開始，每個專案卡片下可就地新增任務。
        </div>
      ) : (
        <>
          <ProjectViewTabs
            views={tabViews}
            counts={counts}
            activeId={isArchivedView ? ARCHIVED_VIEW_ID : (activeView?.id ?? "")}
            viewMode="card"
          />
          <ProjectsToolbar owners={ownerOptions} />

          {projects.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
              {isArchivedView
                ? "目前沒有封存的專案。"
                : viewProjects.length === 0
                  ? `「${currentName}」視窗目前沒有專案。`
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
