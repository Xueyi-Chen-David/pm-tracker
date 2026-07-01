"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  AlertTriangle,
  MessageCircleQuestion,
  CheckCircle2,
  Circle,
  User,
} from "lucide-react";
import { deleteWeeklyUpdate } from "@/server/actions/weekly";
import { HealthBadge } from "@/components/badges";
import { ProgressBar } from "@/components/progress-bar";
import { WeeklyUpdateDialog } from "@/components/weekly-update-dialog";
import { Button } from "@/components/ui/button";
import { weekLabel, toDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";

export type WeeklyTaskItem = {
  id: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
};

export type WeeklyItem = {
  id: string;
  weekStart: string; // ISO
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
  thisWeekGoals: string | null;
  thisWeekDone: string | null;
  nextWeekGoals: string | null;
  risks: string | null;
  needsDecision: string | null;
  note: string | null;
  authorName: string | null;
  tasks: WeeklyTaskItem[];
};

type MemberOption = {
  id: string;
  name: string | null;
  nickname?: string | null;
  useNickname?: boolean | null;
  email: string | null;
};

export function WeeklyHistory({
  projectId,
  items,
  members,
  canEdit,
}: {
  projectId: string;
  items: WeeklyItem[];
  members: MemberOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        尚無每週進度紀錄。
      </p>
    );
  }

  return (
    <ol className="scroll-y max-h-[28rem] space-y-3 overflow-y-auto pr-1.5">
      {items.map((u) => (
        <li
          key={u.id}
          className="bg-card relative rounded-lg border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">
                {weekLabel(u.weekStart)}
              </span>
              <HealthBadge health={u.health} />
            </div>
            {canEdit && (
              <div className="flex items-center gap-1">
                <WeeklyUpdateDialog
                  projectId={projectId}
                  defaultWeekStart={toDateInput(u.weekStart)}
                  members={members}
                  existing={{
                    weekStart: toDateInput(u.weekStart),
                    progress: u.progress,
                    health: u.health,
                    thisWeekGoals: u.thisWeekGoals,
                    thisWeekDone: u.thisWeekDone,
                    nextWeekGoals: u.nextWeekGoals,
                    risks: u.risks,
                    needsDecision: u.needsDecision,
                    note: u.note,
                    tasks: u.tasks.map((t) => ({
                      title: t.title,
                      assigneeId: t.assigneeId,
                      done: t.done,
                    })),
                  }}
                  trigger={
                    <Button variant="ghost" size="icon-sm" title="編輯">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="刪除"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `確定刪除 ${weekLabel(u.weekStart)} 的週報嗎？此動作無法復原。`,
                      )
                    )
                      return;
                    start(async () => {
                      await deleteWeeklyUpdate({ id: u.id, projectId });
                      toast.success("已刪除");
                      router.refresh();
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="mt-2">
            <ProgressBar value={u.progress} />
          </div>

          {u.tasks.length > 0 && (
            <ul className="mt-2 space-y-1">
              {u.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-1.5 text-sm">
                  {t.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="text-muted-foreground h-4 w-4 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      t.done && "text-muted-foreground line-through",
                    )}
                  >
                    {t.title}
                  </span>
                  {t.assigneeName && (
                    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px]">
                      <User className="h-3 w-3" />
                      {t.assigneeName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <Cell label="本週目標" value={u.thisWeekGoals} />
            <Cell label="本週完成" value={u.thisWeekDone} />
            <Cell label="下週目標" value={u.nextWeekGoals} />
            {u.risks && (
              <Cell
                label="風險 / 阻礙"
                value={u.risks}
                icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                tone="red"
              />
            )}
            {u.needsDecision && (
              <Cell
                label="需要老闆決策"
                value={u.needsDecision}
                icon={<MessageCircleQuestion className="h-3.5 w-3.5 text-amber-500" />}
                tone="amber"
              />
            )}
          </div>
          {u.authorName && (
            <div className="text-muted-foreground mt-2 text-[11px]">
              更新者：{u.authorName}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function Cell({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  icon?: React.ReactNode;
  tone?: "red" | "amber";
}) {
  if (!value) return null;
  const toneClass =
    tone === "red"
      ? "bg-red-50 border-red-100"
      : tone === "amber"
        ? "bg-amber-50 border-amber-100"
        : "bg-muted/40 border-transparent";
  return (
    <div className={`rounded-md border p-2 ${toneClass}`}>
      <div className="text-muted-foreground mb-0.5 flex items-center gap-1 text-[11px] font-medium">
        {icon}
        {label}
      </div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  );
}
