"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronsUpDown,
  MessageCircleQuestion,
} from "lucide-react";
import type { ProjectOverview } from "@/server/queries";
import {
  HealthDot,
  HealthBadge,
  TypeBadge,
  StatusBadge,
  PriorityBadge,
} from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { fmtDate, isOverdue } from "@/lib/date";
import { primaryName } from "@/lib/display";
import {
  SORT_DEFAULT_DIR,
  type SortDir,
  type SortKey,
} from "@/lib/project-filter";
import { useListParams } from "@/lib/use-list-params";
import { cn } from "@/lib/utils";

/** 可排序的表頭欄位：點擊切換排序鍵 / 方向，與工具列共用同一組 URL 參數。 */
function SortHeader({ field, label }: { field: SortKey; label: string }) {
  const { params, setParams } = useListParams();
  const active = ((params.get("sort") as SortKey) || "default") === field;
  const dir: SortDir =
    params.get("dir") === "asc" || params.get("dir") === "desc"
      ? (params.get("dir") as SortDir)
      : SORT_DEFAULT_DIR[field];

  function onClick() {
    if (!active) setParams({ sort: field, dir: null }); // 用該欄位的預設方向
    else setParams({ dir: dir === "asc" ? "desc" : "asc" });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "hover:text-foreground -mx-1 inline-flex items-center gap-0.5 rounded px-1 transition-colors",
        active && "text-foreground font-semibold",
      )}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

export function ProjectsListTable({
  projects,
  week,
}: {
  projects: ProjectOverview[];
  week: Date;
}) {
  return (
    <div className="bg-card overflow-x-auto rounded-xl border">
      <div className="min-w-[940px]">
        {/* 表頭 */}
        <div className="text-muted-foreground bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-xs font-medium">
          <div className="min-w-[200px] flex-1">
            <SortHeader field="name" label="名稱" />
          </div>
          <div className="w-16 shrink-0">
            <SortHeader field="type" label="類型" />
          </div>
          <div className="w-20 shrink-0">
            <SortHeader field="status" label="狀態" />
          </div>
          <div className="w-14 shrink-0">
            <SortHeader field="priority" label="優先序" />
          </div>
          <div className="w-28 shrink-0">負責人</div>
          <div className="w-32 shrink-0">
            <SortHeader field="progress" label="進度" />
          </div>
          <div className="w-24 shrink-0">
            <SortHeader field="target" label="截止日" />
          </div>
          <div className="w-20 shrink-0">本週</div>
        </div>

        {/* 列 */}
        <div className="divide-y">
          {projects.map((p) => {
            const latest = p.weeklyUpdates[0];
            const updatedThisWeek =
              !!latest && latest.weekStart.getTime() === week.getTime();
            const overdue = isOverdue(p.targetDate, p.status === "COMPLETED");
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <div className="flex min-w-[200px] flex-1 items-center gap-2">
                  <HealthDot health={p.health} />
                  <span className="truncate font-medium">{p.name}</span>
                  {latest?.risks && (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                  )}
                  {latest?.needsDecision && (
                    <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  )}
                </div>
                <div className="w-16 shrink-0">
                  <TypeBadge type={p.type} />
                </div>
                <div className="w-20 shrink-0">
                  <StatusBadge status={p.status} />
                </div>
                <div className="w-14 shrink-0">
                  <PriorityBadge priority={p.priority} />
                </div>
                <div className="text-muted-foreground w-28 shrink-0 truncate">
                  {p.owner ? primaryName(p.owner) : "—"}
                </div>
                <div className="w-32 shrink-0">
                  <ProgressBar value={p.progress} />
                </div>
                <div
                  className={cn(
                    "w-24 shrink-0 text-xs",
                    overdue ? "font-medium text-red-600" : "text-muted-foreground",
                  )}
                >
                  {overdue && <CalendarClock className="mr-0.5 inline h-3 w-3" />}
                  {p.targetDate ? fmtDate(p.targetDate) : "—"}
                </div>
                <div className="w-20 shrink-0">
                  {updatedThisWeek ? (
                    <HealthBadge health={latest!.health} />
                  ) : (
                    <span className="text-muted-foreground rounded-full border px-1.5 py-0.5 text-[11px]">
                      未更新
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
