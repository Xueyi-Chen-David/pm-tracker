"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Plus, Star, Flag } from "lucide-react";
import {
  createMilestone,
  updateMilestone,
  deleteMilestone,
  toggleMilestoneDone,
} from "@/server/actions/milestones";
import { MilestoneStatusBadge } from "@/components/badges";
import { MILESTONE_STATUS_OPTIONS } from "@/lib/constants";
import { toDateInput } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";

type MilestoneStatus = "PLANNED" | "IN_PROGRESS" | "DONE" | "MISSED";
type Milestone = {
  id: string;
  title: string;
  status: MilestoneStatus;
  plannedDate: Date | string | null;
  actualDate: Date | string | null;
  isGoal: boolean;
};

const dateInput =
  "border-input bg-transparent dark:bg-input/30 h-8 rounded-md border px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function MilestonesPanel({
  projectId,
  milestones,
  canEdit,
}: {
  projectId: string;
  milestones: Milestone[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [planned, setPlanned] = useState("");
  const [isGoal, setIsGoal] = useState(false);

  function run(fn: () => Promise<unknown>, okMsg?: string) {
    start(async () => {
      try {
        await fn();
        if (okMsg) toast.success(okMsg);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  // 調整狀態：完成時自動記錄今天為實際達成日；其他狀態清掉實際日。
  function changeStatus(m: Milestone, status: MilestoneStatus) {
    if (status === m.status) return;
    if (status === "DONE") {
      run(
        () => toggleMilestoneDone({ id: m.id, projectId, done: true }),
        "已標記完成",
      );
    } else {
      run(
        () => updateMilestone({ id: m.id, projectId, status, actualDate: "" }),
        "已更新狀態",
      );
    }
  }

  return (
    <div className="space-y-3">
      <ul className="scroll-y max-h-[20rem] space-y-1.5 overflow-y-auto pr-1.5">
        {milestones.map((m) => {
          const done = m.status === "DONE";
          return (
            <li
              key={m.id}
              className="hover:bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg px-1.5 py-1.5"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                {canEdit ? (
                  <button
                    type="button"
                    disabled={pending}
                    title={m.isGoal ? "取消目標（改為一般里程碑）" : "設為目標"}
                    onClick={() =>
                      run(
                        () =>
                          updateMilestone({
                            id: m.id,
                            projectId,
                            isGoal: !m.isGoal,
                          }),
                        m.isGoal ? "已改為一般里程碑" : "已設為目標",
                      )
                    }
                    className="shrink-0"
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        m.isGoal
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ) : (
                  m.isGoal && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  )
                )}
                {canEdit ? (
                  <input
                    defaultValue={m.title}
                    disabled={pending}
                    onBlur={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (v && v !== m.title)
                        run(
                          () =>
                            updateMilestone({ id: m.id, projectId, title: v }),
                          "已更新名稱",
                        );
                    }}
                    className={cn(
                      "hover:bg-muted/50 focus:bg-muted/50 min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 outline-none",
                      done && "text-muted-foreground line-through",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "truncate",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {m.title}
                  </span>
                )}
              </span>

              {canEdit ? (
                <div className="flex items-center gap-1">
                  <select
                    value={m.status}
                    disabled={pending}
                    title="狀態"
                    onChange={(e) =>
                      changeStatus(m, e.target.value as MilestoneStatus)
                    }
                    className={dateInput}
                  >
                    {MILESTONE_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <label className="text-muted-foreground flex items-center gap-1 text-[10px]">
                    理想
                    <DatePicker
                      defaultValue={toDateInput(m.plannedDate)}
                      disabled={pending}
                      size="sm"
                      placeholder="未設定"
                      ariaLabel="理想完成日"
                      className="w-[9rem]"
                      onChange={(v) =>
                        run(() =>
                          updateMilestone({
                            id: m.id,
                            projectId,
                            plannedDate: v,
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="text-muted-foreground flex items-center gap-1 text-[10px]">
                    實際
                    <DatePicker
                      defaultValue={toDateInput(m.actualDate)}
                      disabled={pending}
                      size="sm"
                      placeholder="未設定"
                      ariaLabel="實際完成日"
                      className="w-[9rem]"
                      onChange={(v) =>
                        run(() =>
                          updateMilestone({
                            id: m.id,
                            projectId,
                            actualDate: v,
                          }),
                        )
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={pending}
                    title="刪除"
                    onClick={() => {
                      if (
                        !confirm(
                          `確定刪除${m.isGoal ? "目標" : "里程碑"}「${m.title}」嗎？此動作無法復原。`,
                        )
                      )
                        return;
                      run(
                        () => deleteMilestone({ id: m.id, projectId }),
                        "已刪除",
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <MilestoneStatusBadge status={m.status} />
                  <span className="text-muted-foreground text-xs">
                    {m.plannedDate ? `理想 ${toDateInput(m.plannedDate)}` : ""}
                    {m.actualDate ? ` · 實際 ${toDateInput(m.actualDate)}` : ""}
                  </span>
                </div>
              )}
            </li>
          );
        })}
        {milestones.length === 0 && (
          <li className="text-muted-foreground py-2 text-sm">尚無里程碑</li>
        )}
      </ul>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input
            placeholder="新增里程碑 / 目標…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 min-w-40 flex-1"
          />
          <DatePicker
            value={planned}
            onChange={setPlanned}
            title="理想完成日"
            ariaLabel="理想完成日"
            placeholder="理想完成日"
            className="w-[11rem]"
          />
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={isGoal}
              onChange={(e) => setIsGoal(e.target.checked)}
              className="accent-amber-500 h-4 w-4"
            />
            <Flag className="h-3.5 w-3.5" /> 設為目標
          </label>
          <Button
            size="sm"
            disabled={!title.trim() || pending}
            onClick={() =>
              run(async () => {
                await createMilestone({
                  projectId,
                  title,
                  plannedDate: planned || undefined,
                  isGoal,
                });
                setTitle("");
                setPlanned("");
                setIsGoal(false);
              }, "已新增里程碑")
            }
          >
            <Plus className="h-4 w-4" /> 新增
          </Button>
        </div>
      )}
    </div>
  );
}
