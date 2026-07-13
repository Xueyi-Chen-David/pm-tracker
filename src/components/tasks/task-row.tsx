"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { updateTask, setTaskOwners, deleteTask } from "@/server/actions/tasks";
import { TASK_STATUS } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { displayInitial } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { HealthDot } from "@/components/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Health, KrStatus } from "@prisma/client";
import type { OwnerLite } from "@/components/okr/key-result-row";

export type TaskView = {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  ownerLabel: string | null;
  status: KrStatus;
  health: Health;
  progress: number;
  owners: OwnerLite[];
};

const HEALTH_CYCLE: Record<Health, Health> = {
  GREEN: "YELLOW",
  YELLOW: "RED",
  RED: "GREEN",
};

const inputCls =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring";

function autoSizeNote(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function TaskRow({
  task,
  members,
}: {
  task: TaskView;
  members: OwnerLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ownerIds, setOwnerIds] = useState<Set<string>>(
    () => new Set(task.owners.map((o) => o.id)),
  );

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function patch(data: Parameters<typeof updateTask>[1]) {
    run(() => updateTask(task.id, data));
  }

  function toggleOwner(id: string, on: boolean) {
    const next = new Set(ownerIds);
    if (on) next.add(id);
    else next.delete(id);
    setOwnerIds(next);
    run(() => setTaskOwners(task.id, [...next]));
  }

  return (
    <tr className={cn("hover:bg-muted/30", pending && "opacity-60")}>
      {/* 名稱 */}
      <td className="py-1.5 pr-2 pl-3">
        <input
          defaultValue={task.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== task.title) patch({ title: v });
          }}
          className="hover:bg-muted/50 focus:bg-muted/50 min-w-0 w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none"
        />
      </td>

      {/* 負責人 */}
      <td className="px-2 py-1.5">
        <Popover>
          <PopoverTrigger className="hover:bg-muted flex items-center gap-1 rounded-md px-1 py-0.5">
            {task.owners.length === 0 && !task.ownerLabel ? (
              <span className="text-muted-foreground/60 text-xs">指派…</span>
            ) : (
              <span className="flex items-center">
                {task.owners.slice(0, 3).map((o, i) => (
                  <Avatar
                    key={o.id}
                    className={cn("h-6 w-6 border-2 border-white", i > 0 && "-ml-2")}
                  >
                    {o.image && <AvatarImage src={o.image} alt="" />}
                    <AvatarFallback className="text-[9px]">
                      {displayInitial(o)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {task.ownerLabel && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    {task.ownerLabel}
                  </span>
                )}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60">
            <div className="text-sm font-medium">負責人</div>
            <div className="scroll-y max-h-56 space-y-0.5 overflow-y-auto">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={ownerIds.has(m.id)}
                    disabled={pending}
                    onChange={(e) => toggleOwner(m.id, e.currentTarget.checked)}
                    className="accent-primary h-4 w-4"
                  />
                  <MemberName u={m} className="min-w-0" />
                </label>
              ))}
            </div>
            <div className="space-y-1 border-t pt-2">
              <div className="text-muted-foreground text-xs">
                外部負責人（非成員，自由文字）
              </div>
              <input
                defaultValue={task.ownerLabel ?? ""}
                placeholder="例：Also（律師）"
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (task.ownerLabel ?? "")) patch({ ownerLabel: v });
                }}
                className={inputCls}
              />
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* 狀態 */}
      <td className="px-2 py-1.5">
        <select
          value={task.status}
          disabled={pending}
          onChange={(e) => patch({ status: e.currentTarget.value as KrStatus })}
          className={cn(
            "h-7 rounded-full border px-2 text-xs font-medium outline-none",
            TASK_STATUS[task.status].badge,
          )}
        >
          {(Object.keys(TASK_STATUS) as KrStatus[]).map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS[s].label}
            </option>
          ))}
        </select>
      </td>

      {/* 進度 */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${task.progress}%`,
                backgroundColor: task.progress >= 100 ? "#10b981" : "#3b82f6",
              }}
            />
          </div>
          <input
            type="number"
            min={0}
            max={100}
            defaultValue={task.progress}
            disabled={pending}
            onBlur={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.currentTarget.value) || 0));
              if (v !== task.progress) patch({ progress: v });
            }}
            className="border-input h-7 w-12 rounded border bg-transparent px-1 text-xs outline-none"
          />
        </div>
      </td>

      {/* 健康度 RAG */}
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          disabled={pending}
          title="點擊切換 順利/注意/延宕"
          onClick={() => patch({ health: HEALTH_CYCLE[task.health] })}
        >
          <HealthDot health={task.health} />
        </button>
      </td>

      {/* 這週備註 */}
      <td className="px-2 py-1.5 align-top">
        <textarea
          ref={autoSizeNote}
          defaultValue={task.note ?? ""}
          placeholder="—"
          rows={1}
          onInput={(e) => autoSizeNote(e.currentTarget)}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            if (v !== (task.note ?? "")) patch({ note: v });
          }}
          className="hover:bg-muted/50 focus:bg-muted/50 block w-48 max-w-full resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 text-xs leading-snug break-words whitespace-pre-wrap outline-none"
        />
      </td>

      {/* ⋯ 選單 */}
      <td className="px-1 py-1.5 text-center">
        <Popover>
          <PopoverTrigger className="hover:bg-muted text-muted-foreground rounded-md p-1">
            <MoreHorizontal className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">到期日</div>
              <input
                type="date"
                defaultValue={task.dueDate ?? ""}
                disabled={pending}
                onChange={(e) => patch({ dueDate: e.currentTarget.value || null })}
                className={inputCls}
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm(`刪除任務「${task.title}」？`))
                  run(() => deleteTask(task.id));
              }}
              className="text-destructive hover:bg-destructive/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <Trash2 className="h-4 w-4" /> 刪除任務
            </button>
          </PopoverContent>
        </Popover>
      </td>
    </tr>
  );
}
