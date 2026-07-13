"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format } from "date-fns";
import { ExternalLink, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import type { TrainingFormat, TrainingStatus } from "@prisma/client";
import { setAssignmentStatus } from "@/server/actions/training";
import {
  TRAINING_FORMAT,
  TRAINING_STATUS,
  TRAINING_STATUS_ORDER,
  estMinLabel,
  isTrainingOverdue,
  needsRenewal,
} from "@/lib/training";
import { cn } from "@/lib/utils";

export type TrainingAssignmentView = {
  id: string;
  status: TrainingStatus;
  dueDate: string | Date | null;
  completedAt: string | Date | null;
  course: {
    title: string;
    description: string | null;
    category: string;
    format: TrainingFormat;
    resourceUrl: string | null;
    estimatedMin: number | null;
    required: boolean;
    renewMonths: number | null;
  };
};

const STATUS_ACTIVE: Record<TrainingStatus, string> = {
  NOT_STARTED: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-blue-600 text-white",
  COMPLETED: "bg-emerald-600 text-white",
};

export function TrainingAssignmentCard({ a }: { a: TrainingAssignmentView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const overdue = isTrainingOverdue(a.dueDate, a.status);
  const renew = needsRenewal(a.completedAt, a.course.renewMonths);
  const est = estMinLabel(a.course.estimatedMin);

  function setStatus(status: TrainingStatus) {
    if (status === a.status) return;
    start(async () => {
      try {
        await setAssignmentStatus({ id: a.id, status });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border p-3",
        overdue && "border-rose-300 bg-rose-50/40",
        renew && "border-amber-300 bg-amber-50/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium">{a.course.title}</span>
        {a.course.required && (
          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
            必修
          </span>
        )}
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px]",
            TRAINING_FORMAT[a.course.format].badge,
          )}
        >
          {TRAINING_FORMAT[a.course.format].label}
        </span>
        <span className="text-muted-foreground text-xs">{a.course.category}</span>
      </div>

      {a.course.description && (
        <p className="text-muted-foreground text-sm">{a.course.description}</p>
      )}

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {est && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {est}
          </span>
        )}
        {a.dueDate && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "font-medium text-rose-600",
            )}
          >
            {overdue && <AlertTriangle className="h-3 w-3" />}
            應完成 {format(new Date(a.dueDate), "yyyy/M/d")}
            {overdue && "（逾期）"}
          </span>
        )}
        {a.status === "COMPLETED" && a.completedAt && (
          <span className="text-emerald-600">
            完成 {format(new Date(a.completedAt), "yyyy/M/d")}
          </span>
        )}
        {renew && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-600">
            <RefreshCw className="h-3 w-3" />
            需重訓
          </span>
        )}
        {a.course.resourceUrl && (
          <a
            href={a.course.resourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            開啟教材
          </a>
        )}
      </div>

      <div className="inline-flex rounded-md border p-0.5 text-xs">
        {TRAINING_STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            disabled={pending}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              a.status === s
                ? STATUS_ACTIVE[s]
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {TRAINING_STATUS[s].label}
          </button>
        ))}
      </div>
    </div>
  );
}
