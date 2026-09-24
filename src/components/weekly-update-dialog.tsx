"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { upsertWeeklyUpdateAction } from "@/server/actions/weekly";
import { HEALTH_OPTIONS } from "@/lib/constants";
import { displayName, type NameSource } from "@/lib/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

type Task = { title: string; assigneeId: string; done: boolean };
type MemberOption = NameSource & { id: string };

type TaskSource = { title: string; assigneeId: string | null; done: boolean }[];

type Existing = {
  weekStart: string; // yyyy-mm-dd
  progress: number;
  health: string;
  thisWeekGoals?: string | null;
  thisWeekDone?: string | null;
  nextWeekGoals?: string | null;
  risks?: string | null;
  needsDecision?: string | null;
  note?: string | null;
  tasks?: TaskSource;
};

// 新增本週進度時，從「上一週」自動帶入的內容（下週目標 → 本週目標、未完成任務 → 本週任務）。
type CarryOver = {
  thisWeekGoals?: string | null;
  tasks?: TaskSource; // 已由上層過濾成未完成、done=false
};

const selectClass =
  "border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

// 任務負責人下拉：寬度依名字自動縮放（不要 w-full）
const taskSelectClass =
  "border-input bg-transparent dark:bg-input/30 h-8 max-w-[10rem] rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

const toTasks = (src?: TaskSource): Task[] =>
  (src ?? []).map((t) => ({
    title: t.title,
    assigneeId: t.assigneeId ?? "",
    done: t.done,
  }));

export function WeeklyUpdateDialog({
  projectId,
  defaultWeekStart,
  existing,
  members,
  carryOver,
  trigger,
}: {
  projectId: string;
  defaultWeekStart: string;
  existing?: Existing;
  members: MemberOption[];
  carryOver?: CarryOver;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  // 編輯既有紀錄用其內容；新增則帶入上一週的未完成任務與下週目標。
  const seedTasks = existing?.tasks ?? carryOver?.tasks;
  const seedGoals = existing ? existing.thisWeekGoals : carryOver?.thisWeekGoals;
  const showCarryHint =
    !existing &&
    !!(carryOver?.thisWeekGoals?.trim() || carryOver?.tasks?.length);

  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(existing?.progress ?? 0);
  const [tasks, setTasks] = useState<Task[]>(toTasks(seedTasks));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setProgress(existing?.progress ?? 0);
      setTasks(toTasks(seedTasks));
      setError(null);
    }
  }

  function addTask() {
    setTasks((prev) => [...prev, { title: "", assigneeId: "", done: false }]);
  }
  function updateTask(i: number, patch: Partial<Task>) {
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeTask(i: number) {
    setTasks((prev) => prev.filter((_, idx) => idx !== i));
  }

  const tasksPayload = JSON.stringify(
    tasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        assigneeId: t.assigneeId || null,
        done: t.done,
      })),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await upsertWeeklyUpdateAction(null, fd);
      if (res?.ok) {
        setOpen(false);
        toast.success("已儲存本週進度");
        router.refresh();
      } else {
        setError(res?.error ?? "儲存失敗");
      }
    });
  }

  return (
    <>
      <span onClick={() => handleOpenChange(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {existing ? "編輯本週進度" : "新增本週進度"}
            </DialogTitle>
            <DialogDescription>
              紀錄本週目標、完成、整體進度與風險，作為歷史趨勢與週報來源。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="tasks" value={tasksPayload} />
            {showCarryHint && (
              <p className="bg-muted/60 text-muted-foreground rounded-md px-3 py-2 text-xs">
                已自動帶入上週的「下週目標」與未完成任務，可自由修改後儲存。
              </p>
            )}
            {existing && (
              <input
                type="hidden"
                name="originalWeekStart"
                value={existing.weekStart}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="weekStart">週次（該週任一天）</Label>
                <DatePicker
                  id="weekStart"
                  name="weekStart"
                  clearable={false}
                  defaultValue={existing?.weekStart ?? defaultWeekStart}
                />
                {existing && (
                  <p className="text-muted-foreground text-[11px]">
                    改成其他週會把這筆紀錄移到該週。
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="health">本週狀態</Label>
                <select
                  id="health"
                  name="health"
                  defaultValue={existing?.health ?? "GREEN"}
                  className={selectClass}
                >
                  {HEALTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="progress">整體進度：{progress}%</Label>
              <input
                id="progress"
                name="progress"
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="accent-primary h-9 w-full cursor-pointer"
              />
            </div>

            {/* 本週任務（可多筆、各自指定負責人）*/}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>本週任務</Label>
                <Button type="button" variant="outline" size="sm" onClick={addTask}>
                  <Plus className="h-3.5 w-3.5" /> 新增任務
                </Button>
              </div>
              {tasks.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  尚無任務，點「新增任務」可指定每項任務的負責人。
                </p>
              ) : (
                <div className="space-y-1.5">
                  {tasks.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={t.done}
                        title="完成"
                        onChange={(e) => updateTask(i, { done: e.target.checked })}
                        className="accent-emerald-600 h-4 w-4 shrink-0 cursor-pointer"
                      />
                      <Input
                        value={t.title}
                        onChange={(e) => updateTask(i, { title: e.target.value })}
                        placeholder="任務內容…"
                        className="h-8 min-w-0 flex-1"
                      />
                      <select
                        value={t.assigneeId}
                        onChange={(e) =>
                          updateTask(i, { assigneeId: e.target.value })
                        }
                        title="負責人"
                        className={taskSelectClass + " shrink-0"}
                      >
                        <option value="">未指派</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {displayName(m)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="移除任務"
                        onClick={() => removeTask(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Area name="thisWeekGoals" label="本週目標" value={seedGoals} />
            <Area name="thisWeekDone" label="本週完成" value={existing?.thisWeekDone} />
            <Area name="nextWeekGoals" label="下週目標" value={existing?.nextWeekGoals} />
            <Area
              name="risks"
              label="風險 / 阻礙"
              value={existing?.risks}
              placeholder="目前遇到的困難、卡點…（留空表示無）"
            />
            <Area
              name="needsDecision"
              label="需要老闆決策"
              value={existing?.needsDecision}
              placeholder="需要上層拍板的事項…（留空表示無）"
            />

            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "儲存中…" : "儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Area({
  name,
  label,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  value?: string | null;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        rows={2}
        defaultValue={value ?? ""}
        placeholder={placeholder}
      />
    </div>
  );
}
