"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
} from "lucide-react";
import type { Health, ProjectStatus, ProjectType } from "@prisma/client";
import { createTask } from "@/server/actions/tasks";
import { rollupTasks } from "@/lib/tasks";
import { fmtDateShort } from "@/lib/date";
import { HealthDot, StatusBadge, TypeBadge } from "@/components/badges";
import { MemberName } from "@/components/member-name";
import { Button } from "@/components/ui/button";
import { TaskRow, type TaskView } from "@/components/tasks/task-row";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type ProjectGoalView = {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  health: Health;
  progress: number;
  targetDate: string | null;
  owner: OwnerLite | null;
  tasks: TaskView[];
};

export function ProjectGoalCard({
  project,
  index,
  members,
}: {
  project: ProjectGoalView;
  index: number;
  members: OwnerLite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();

  const roll = rollupTasks(project.tasks);
  const hasTasks = roll.total > 0;
  // 有任務 → 顯示任務彙總（也已回寫到 Project）；無任務 → 顯示專案自身值。
  const progress = hasTasks ? roll.progress : project.progress;
  const health = hasTasks ? roll.health : project.health;

  function addTask(title: string) {
    const t = title.trim();
    if (!t) return;
    start(async () => {
      try {
        await createTask({ projectId: project.id, title: t });
        setAdding(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  return (
    <section className="bg-card overflow-hidden rounded-xl border shadow-sm">
      {/* 卡頭 */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-primary bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
          title={open ? "收合" : "展開"}
        >
          {index + 1}
        </button>
        <div className="min-w-0 flex-1">
          <Link
            href={`/projects/${project.id}`}
            className="hover:text-primary hover:underline block truncate text-[15px] font-semibold"
          >
            {project.name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} />
            <TypeBadge type={project.type} />
            {project.targetDate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
                <CalendarClock className="h-3 w-3" />
                {fmtDateShort(project.targetDate)}
              </span>
            )}
            {project.owner && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <MemberName u={project.owner} className="min-w-0" />
              </span>
            )}
          </div>
        </div>

        {/* 彙總 */}
        <div className="flex items-center gap-2.5">
          <HealthDot health={health} />
          <div className="bg-muted hidden h-2 w-32 overflow-hidden rounded-full sm:block">
            <div
              className="h-full rounded-full bg-violet-600"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="w-9 text-right text-sm font-bold tabular-nums">
            {progress}%
          </span>
          <span className="text-muted-foreground w-14 text-xs">
            {hasTasks ? `${roll.doneCount}/${roll.total} 完成` : "—"}
          </span>
          <Link
            href={`/projects/${project.id}`}
            className="text-muted-foreground hover:bg-muted rounded-md p-1.5"
            title="開啟專案詳情"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* 任務表 */}
      {open && (
        <div className="border-t">
          {project.tasks.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground text-[11px]">
                    <th className="py-1.5 pr-2 pl-3 text-left font-medium">任務</th>
                    <th className="px-2 py-1.5 text-left font-medium">負責人</th>
                    <th className="px-2 py-1.5 text-left font-medium">狀態</th>
                    <th className="px-2 py-1.5 text-left font-medium">進度</th>
                    <th className="px-2 py-1.5 text-center font-medium">健康</th>
                    <th className="w-48 px-2 py-1.5 text-left font-medium">這週備註</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {project.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} members={members} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 新增任務 */}
          <div className="px-3 py-2">
            {adding ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  addTask(String(fd.get("title") ?? ""));
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="title"
                  autoFocus
                  placeholder="任務名稱…"
                  className="border-input h-8 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none"
                />
                <Button type="submit" size="sm" disabled={pending}>
                  新增
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAdding(false)}
                >
                  取消
                </Button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
              >
                <Plus className="h-4 w-4" /> 新增任務
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
