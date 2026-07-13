"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  Pencil,
  Trash2,
  ExternalLink,
  Clock,
  Power,
} from "lucide-react";
import { deleteCourse, updateCourse } from "@/server/actions/training";
import { TRAINING_FORMAT, estMinLabel } from "@/lib/training";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  TrainingCourseDialog,
  type CourseEdit,
} from "./training-course-dialog";
import { TrainingAssignDialog } from "./training-assign-dialog";
import type { NameSource } from "@/lib/display";

type Member = NameSource & { id: string };

export function TrainingCourseCard({
  course,
  stats,
  assignedUserIds,
  members,
}: {
  course: CourseEdit & { active: boolean };
  stats: { total: number; completed: number; overdue: number };
  assignedUserIds: string[];
  members: Member[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pct =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const est = estMinLabel(course.estimatedMin);

  function remove() {
    if (!confirm(`刪除課程「${course.title}」？所有指派紀錄一併移除。`)) return;
    start(async () => {
      try {
        await deleteCourse(course.id);
        toast.success("已刪除課程");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  function toggleActive() {
    start(async () => {
      try {
        await updateCourse(course.id, { active: !course.active });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <div className={cn("space-y-2.5 rounded-lg border p-3", !course.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{course.title}</span>
        {course.required && (
          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            必修
          </span>
        )}
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px]",
            TRAINING_FORMAT[course.format].badge,
          )}
        >
          {TRAINING_FORMAT[course.format].label}
        </span>
        <span className="text-muted-foreground text-xs">{course.category}</span>
        {course.renewMonths && (
          <span className="text-muted-foreground text-[11px]">
            · 每 {course.renewMonths} 個月重訓
          </span>
        )}
        {!course.active && (
          <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">
            已停用
          </span>
        )}
      </div>

      {course.description && (
        <p className="text-muted-foreground text-sm">{course.description}</p>
      )}

      {/* 完成概況 */}
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span>
            完成 <span className="text-foreground font-medium">{stats.completed}</span>
            /{stats.total}
          </span>
          {stats.overdue > 0 && (
            <span className="font-medium text-rose-600">逾期 {stats.overdue}</span>
          )}
          {est && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {est}
            </span>
          )}
          <span className="ml-auto tabular-nums">{pct}%</span>
        </div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <TrainingAssignDialog
          courseId={course.id}
          courseTitle={course.title}
          members={members}
          assignedUserIds={assignedUserIds}
          trigger={
            <Button size="sm" variant="outline" className="h-8 gap-1">
              <Users className="h-3.5 w-3.5" /> 指派
            </Button>
          }
        />
        <TrainingCourseDialog
          course={course}
          trigger={
            <Button size="sm" variant="ghost" className="h-8 gap-1">
              <Pencil className="h-3.5 w-3.5" /> 編輯
            </Button>
          }
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1"
          disabled={pending}
          onClick={toggleActive}
        >
          <Power className="h-3.5 w-3.5" /> {course.active ? "停用" : "啟用"}
        </Button>
        {course.resourceUrl && (
          <a
            href={course.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex h-8 items-center gap-1 px-2 text-sm hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> 教材
          </a>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive ml-auto h-8 gap-1"
          disabled={pending}
          onClick={remove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
