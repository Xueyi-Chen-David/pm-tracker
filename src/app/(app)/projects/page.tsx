import Link from "next/link";
import { Plus } from "lucide-react";
import type { ProjectType } from "@prisma/client";
import { requireActiveOrg } from "@/server/org";
import {
  getProjectsOverview,
  getOrgMemberUsers,
  getProjectViews,
} from "@/server/queries";
import { PROJECT_TYPE } from "@/lib/constants";
import {
  filterByView,
  filterProjects,
  hasActiveFilters,
  parseDir,
  parseFilters,
  parseSort,
  sortProjects,
} from "@/lib/project-filter";
import { thisWeekStart } from "@/lib/date";
import { primaryName } from "@/lib/display";
import { PageHeader } from "@/components/page-header";
import { ProjectCard } from "@/components/project-card";
import { ProjectsListTable } from "@/components/projects-list-table";
import { ProjectsToolbar } from "@/components/projects-toolbar";
import { ProjectViewTabs } from "@/components/project-view-tabs";
import { ViewToggle } from "@/components/view-toggle";
import { NewProjectButton } from "@/components/new-project-button";
import { Button } from "@/components/ui/button";

export const metadata = { title: "專案與任務 · Project Pulse" };

const GROUP_ORDER: ProjectType[] = ["PROJECT", "ROUTINE", "ONE_TIME"];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org } = await requireActiveOrg();
  const sp = await searchParams;
  const view = sp.view === "card" ? "card" : "list";
  const [allProjects, users, views] = await Promise.all([
    getProjectsOverview(org.id),
    getOrgMemberUsers(org.id),
    getProjectViews(org.id),
  ]);
  const week = thisWeekStart();

  // 視窗（tabs）：以 status / type 篩出該視窗的專案
  const activeView =
    views.find((v) => v.id === sp.board) ??
    views.find((v) => v.isSystem) ??
    views[0];
  const viewProjects = activeView
    ? filterByView(allProjects, activeView)
    : allProjects;
  const counts: Record<string, number> = Object.fromEntries(
    views.map((v) => [v.id, filterByView(allProjects, v).length]),
  );

  // 工具列篩選 / 排序（套在視窗結果之上）
  const filters = parseFilters(sp);
  const sort = parseSort(sp.sort);
  const dir = parseDir(sp.dir, sort);
  const projects = sortProjects(filterProjects(viewProjects, filters), sort, dir);

  const filtered = hasActiveFilters(filters);

  // 負責人下拉：取實際出現在專案中的負責人（去重）
  const ownerOptions = Array.from(
    new Map(
      allProjects
        .filter((p) => p.owner)
        .map((p) => [p.owner!.id, { id: p.owner!.id, label: primaryName(p.owner) }]),
    ).values(),
  ).sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

  const byType = GROUP_ORDER.map((type) => ({
    type,
    items: projects.filter((p) => p.type === type),
  }));

  return (
    <div>
      <PageHeader
        title="專案與任務"
        description={
          filtered
            ? `${activeView?.name ?? ""}：符合 ${projects.length} / ${viewProjects.length} 項`
            : `${activeView?.name ?? ""}：${projects.length} 項 · 全部 ${allProjects.length} 項`
        }
      >
        <ViewToggle view={view} />
        <NewProjectButton
          users={users}
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> 新增
            </Button>
          }
        />
      </PageHeader>

      {allProjects.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
          目前還沒有任何專案。
          <Link href="/projects/new" className="text-primary ml-1 underline">
            建立第一個
          </Link>
        </div>
      ) : (
        <>
          <ProjectViewTabs
            views={views}
            counts={counts}
            activeId={activeView?.id ?? ""}
            viewMode={view}
          />
          <ProjectsToolbar owners={ownerOptions} />

          {projects.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center">
              {viewProjects.length === 0
                ? `「${activeView?.name ?? ""}」視窗目前沒有專案。`
                : "沒有符合條件的項目，試試調整或清除篩選。"}
            </div>
          ) : view === "list" ? (
            <ProjectsListTable projects={projects} week={week} />
          ) : (
            <div className="space-y-8">
              {byType.map(
                ({ type, items }) =>
                  items.length > 0 && (
                    <section key={type}>
                      <div className="mb-3 flex items-baseline gap-2">
                        <h2 className="text-lg font-semibold">
                          {PROJECT_TYPE[type].label}
                        </h2>
                        <span className="text-muted-foreground text-sm">
                          {items.length} 項 · {PROJECT_TYPE[type].hint}
                        </span>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((p) => (
                          <ProjectCard key={p.id} project={p} />
                        ))}
                      </div>
                    </section>
                  ),
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
