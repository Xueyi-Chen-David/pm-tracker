import Link from "next/link";
import { AlertTriangle, MessageCircleQuestion, CalendarClock } from "lucide-react";
import type { ProjectOverview } from "@/server/queries";
import { HealthDot, TypeBadge, StatusBadge, PriorityBadge } from "@/components/badges";
import { MemberAvatars } from "@/components/member-avatars";
import { ProgressBar } from "@/components/progress-bar";
import { fmtDate, isOverdue, weekLabel } from "@/lib/date";
import { MemberName } from "@/components/member-name";
import { cn } from "@/lib/utils";

export function ProjectCard({ project }: { project: ProjectOverview }) {
  const latest = project.weeklyUpdates[0];
  const overdue = isOverdue(project.targetDate, project.status === "COMPLETED");
  const accent = project.color ?? "#94a3b8";

  return (
    <Link
      href={`/projects/${project.id}`}
      className="bg-card group relative block overflow-hidden rounded-xl border p-4 transition-shadow hover:shadow-md"
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <HealthDot health={project.health} />
          <span className="truncate font-semibold group-hover:underline">
            {project.name}
          </span>
        </div>
        <TypeBadge type={project.type} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={project.status} />
        {(project.priority === "HIGH" || project.priority === "URGENT") && (
          <PriorityBadge priority={project.priority} />
        )}
        {overdue && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <CalendarClock className="h-3 w-3" /> 逾期
          </span>
        )}
        {latest?.risks && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
            <AlertTriangle className="h-3 w-3" /> 風險
          </span>
        )}
        {latest?.needsDecision && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <MessageCircleQuestion className="h-3 w-3" /> 需決策
          </span>
        )}
      </div>

      <div className="mt-3">
        <ProgressBar value={project.progress} />
      </div>

      <div className="text-muted-foreground mt-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          {project.members.length > 0 ? (
            <MemberAvatars members={project.members} />
          ) : (
            <span>未指派成員</span>
          )}
          {project.owner && (
            <span className="inline-flex min-w-0 items-baseline gap-1">
              負責人 <MemberName u={project.owner} className="min-w-0" />
            </span>
          )}
        </div>
        <div className={cn("whitespace-nowrap", overdue && "text-red-600 font-medium")}>
          {project.targetDate ? `截止 ${fmtDate(project.targetDate)}` : "無截止日"}
        </div>
      </div>

      {latest && (
        <div className="text-muted-foreground mt-2 border-t pt-2 text-xs">
          <span className="font-medium">{weekLabel(latest.weekStart)}</span>
          {latest.thisWeekDone && (
            <span className="ml-1 line-clamp-1">
              · 完成：{latest.thisWeekDone}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
