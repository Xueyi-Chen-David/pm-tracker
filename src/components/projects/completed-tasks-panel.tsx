"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  CalendarCheck,
  RotateCcw,
  XCircle,
} from "lucide-react";
import type { KrStatus } from "@prisma/client";
import { updateTask } from "@/server/actions/tasks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { displayInitial, displayName } from "@/lib/display";
import { fmtDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { TaskView } from "@/components/tasks/task-row";

const VARIANTS = {
  done: {
    status: "DONE" as KrStatus,
    label: "已完成",
    countCls: "text-emerald-600",
    icon: CheckCircle2,
    iconCls: "text-emerald-500",
    empty: "目前還沒有已完成的任務。",
    strike: false,
  },
  cancelled: {
    status: "CANCELLED" as KrStatus,
    label: "已取消",
    countCls: "text-slate-500",
    icon: XCircle,
    iconCls: "text-slate-400",
    empty: "目前沒有已取消的任務。",
    strike: true,
  },
} as const;

/**
 * 專案內依狀態分組的任務清單：`done`＝已完成、`cancelled`＝已取消。
 * 只在該狀態有任務時，才在管理面板出現對應分頁；每筆顯示負責人與到期日。
 */
export function TaskListPanel({
  tasks,
  variant,
  canEdit = false,
}: {
  tasks: TaskView[];
  variant: keyof typeof VARIANTS;
  /** 具編輯權限時，提供「還原」把任務改回進行中。 */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const v = VARIANTS[variant];
  const list = tasks.filter((t) => t.status === v.status);
  const total = tasks.length;
  const Icon = v.icon;

  function restore(id: string) {
    start(async () => {
      try {
        await updateTask(id, { status: "IN_PROGRESS" });
        toast.success("已還原為進行中");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "還原失敗");
      }
    });
  }

  if (list.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
        <Icon className="h-5 w-5 opacity-60" />
        {v.empty}
      </div>
    );
  }

  return (
    <div>
      <p className="text-muted-foreground mb-3 text-xs">
        {v.label} <span className={cn("font-medium", v.countCls)}>{list.length}</span>
        {total > 0 && ` / ${total}`} 項任務。
      </p>
      <ul className="divide-y">
        {list.map((t) => {
          const owners = t.owners;
          const ownerText =
            owners.length > 0
              ? owners.map((o) => displayName(o)).join("、")
              : t.ownerLabel;
          return (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <Icon className={cn("h-4 w-4 shrink-0", v.iconCls)} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium break-words",
                    v.strike && "text-muted-foreground line-through",
                  )}
                >
                  {t.title}
                </p>
                {(ownerText || t.dueDate) && (
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                    {ownerText && <span className="truncate">{ownerText}</span>}
                    {t.dueDate && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck className="h-3 w-3" />
                        {fmtDateShort(t.dueDate)}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {owners.length > 0 && (
                <span className="flex items-center">
                  {owners.slice(0, 4).map((o, i) => (
                    <Avatar
                      key={o.id}
                      className={cn(
                        "h-6 w-6 border border-white",
                        i > 0 && "-ml-1.5",
                      )}
                    >
                      {o.image && <AvatarImage src={o.image} alt="" />}
                      <AvatarFallback className="text-[9px]">
                        {displayInitial(o)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => restore(t.id)}
                  disabled={pending}
                  title="還原為進行中"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">還原</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
