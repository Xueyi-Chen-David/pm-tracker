import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

/** 專案與任務的分頁：固定五個狀態，不能自訂。 */
export const PROJECT_STATUS_TABS: { status: ProjectStatus; label: string }[] = [
  { status: "ACTIVE", label: "進行中" },
  { status: "NOT_STARTED", label: "未開始" },
  { status: "ON_HOLD", label: "暫停" },
  { status: "COMPLETED", label: "已完成" },
  { status: "CANCELLED", label: "已取消" },
];

/** ?board=STATUS → 狀態；沒帶或不認得（例如舊的自訂視窗 id）就回進行中。 */
export function parseStatusTab(board: string | undefined): ProjectStatus {
  return PROJECT_STATUS_TABS.find((t) => t.status === board)?.status ?? "ACTIVE";
}

export function ProjectViewTabs({
  active,
  counts,
}: {
  active: ProjectStatus;
  counts: Record<ProjectStatus, number>;
}) {
  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b">
      {PROJECT_STATUS_TABS.map((t) => {
        const on = t.status === active;
        return (
          <Link
            key={t.status}
            href={`/projects?view=card&board=${t.status}`}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              on
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[11px] tabular-nums",
                on ? "bg-primary/10 text-primary" : "bg-muted",
              )}
            >
              {counts[t.status] ?? 0}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
