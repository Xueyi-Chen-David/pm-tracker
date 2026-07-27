"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlignLeft,
  Bell,
  CalendarDays,
  GripVertical,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  updateTask,
  setTaskOwners,
  setTaskPrimaryOwner,
  deleteTask,
} from "@/server/actions/tasks";
import { TASK_STATUS } from "@/lib/tasks";
import { fmtDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import { displayInitial, displayName } from "@/lib/display";
import { MemberName } from "@/components/member-name";
import { HealthDot } from "@/components/badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  /** 任務說明（這個任務要做什麼）。 */
  description: string | null;
  note: string | null;
  startDate: string | null;
  dueDate: string | null;
  ownerLabel: string | null;
  status: KrStatus;
  health: Health;
  progress: number;
  owners: OwnerLite[];
  /** 主負責人 userId（owners 之一）；null＝未指定。 */
  primaryOwnerId: string | null;
  /** 到期提醒天數（前 N 天），由大到小。空＝不提醒。 */
  reminderDays: number[];
};

const HEALTH_CYCLE: Record<Health, Health> = {
  GREEN: "YELLOW",
  YELLOW: "RED",
  RED: "GREEN",
};

const inputCls =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring";

// 任務名稱下那一列 meta（說明 / 日期）的共用外觀：矮、灰、hover 才浮出底色。
// min-w-0 讓 truncate 在 flex 容器裡真的能截斷；max-w-full 擋住長說明把欄位撐爆。
const metaCls =
  "text-muted-foreground hover:bg-muted/60 hover:text-foreground flex min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] transition-colors";
// 沒有內容時只留圖示：淡一點、不佔一整行，滑過 / 聚焦才變明顯。
const emptyMetaCls =
  "text-muted-foreground/40 focus-visible:text-foreground";
// popover 在手機上不能比視窗寬。
const popoverCls = "w-[min(18rem,calc(100vw-2rem))]";

function autoSizeNote(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function TaskRow({
  task,
  members,
  drag,
}: {
  task: TaskView;
  members: OwnerLite[];
  /** 拖放排序（選填）。未傳入時不顯示拖曳把手。 */
  drag?: {
    dragging: boolean;
    onDragStart: () => void;
    onDragEnter: () => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ownerIds, setOwnerIds] = useState<Set<string>>(
    () => new Set(task.owners.map((o) => o.id)),
  );
  // 主負責人 userId（owners 之一）。本機維護，改動即存。
  const [primaryId, setPrimaryId] = useState<string | null>(
    task.primaryOwnerId,
  );
  // 到期提醒天數（前 N 天）。本機維護，改動即存。
  const [reminders, setReminders] = useState<number[]>(task.reminderDays);
  const [customDay, setCustomDay] = useState("");
  // 任務說明的置中 Dialog：草稿在本機編輯，按「儲存」才寫回。
  const [descOpen, setDescOpen] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    start(async () => {
      try {
        const res = await fn();
        if (res && res.ok === false) {
          toast.error(res.error ?? "更新失敗");
          return;
        }
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function patch(data: Parameters<typeof updateTask>[1]) {
    run(() => updateTask(task.id, data));
  }

  /** 存任務說明並關窗；沒改就只關窗（不打伺服器）。 */
  function saveDescription() {
    if (descDraft !== (task.description ?? "")) patch({ description: descDraft });
    setDescOpen(false);
  }

  function toggleOwner(id: string, on: boolean) {
    const next = new Set(ownerIds);
    if (on) next.add(id);
    else next.delete(id);
    setOwnerIds(next);
    // 移除的若是主負責人，本機一併清除（伺服器端 setTaskOwners 也會清）。
    if (!on && primaryId === id) setPrimaryId(null);
    run(() => setTaskOwners(task.id, [...next]));
  }

  /** 設定 / 取消主負責人（再點一次同一人＝取消）。只有負責人能被設為主負責人。 */
  function togglePrimary(id: string) {
    if (!ownerIds.has(id)) return;
    const next = primaryId === id ? null : id;
    setPrimaryId(next);
    run(() => setTaskPrimaryOwner(task.id, next));
  }

  function saveReminders(next: number[]) {
    const cleaned = [...new Set(next.filter((n) => n > 0 && n <= 365))].sort(
      (a, b) => b - a,
    );
    setReminders(cleaned);
    run(() => updateTask(task.id, { reminderDays: cleaned }));
  }
  function addReminder(n: number) {
    if (!n || reminders.includes(n)) return;
    saveReminders([...reminders, n]);
  }
  function removeReminder(n: number) {
    saveReminders(reminders.filter((x) => x !== n));
  }

  // 顯示時把主負責人排到最前面。
  const orderedOwners = primaryId
    ? [...task.owners].sort(
        (a, b) => Number(b.id === primaryId) - Number(a.id === primaryId),
      )
    : task.owners;

  return (
    <tr
      className={cn(
        "hover:bg-muted/30",
        pending && "opacity-60",
        drag?.dragging && "bg-primary/5 opacity-60",
      )}
      onDragEnter={
        drag
          ? (e) => {
              e.preventDefault();
              drag.onDragEnter();
            }
          : undefined
      }
      onDragOver={drag ? (e) => e.preventDefault() : undefined}
      onDrop={
        drag
          ? (e) => {
              e.preventDefault();
              drag.onDrop();
            }
          : undefined
      }
    >
      {/* 拖曳把手 */}
      {drag && (
        <td className="w-6 pl-2 align-top">
          <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", task.id);
              drag.onDragStart();
            }}
            onDragEnd={drag.onDragEnd}
            className="text-muted-foreground/50 hover:text-foreground mt-1.5 cursor-grab active:cursor-grabbing"
            title="拖曳排序"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </td>
      )}
      {/* 名稱 */}
      <td className="py-1.5 pr-2 pl-3 align-top">
        <input
          defaultValue={task.title}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (v && v !== task.title) patch({ title: v });
          }}
          className="hover:bg-muted/50 focus:bg-muted/50 min-w-0 w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-medium outline-none"
        />
        {/* 說明 / 日期：併成任務名稱下的同一列 meta。有值＝顯示內容，沒值＝只留一個
            淡淡的圖示鈕（不再每列都印一次「新增說明」「設定日期」的灰字）。 */}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
          {/* 說明改用置中 Dialog（而非貼著小圖示的 popover）：說明常是整段文字，
              窄窄的浮層打起來很擠，而且列在表格深處時 popover 會擠在邊緣。
              Dialog 空間夠、焦點明確，因此改成明確的「儲存 / 取消」而非失焦自動存。 */}
          <Dialog
            open={descOpen}
            onOpenChange={(o: boolean) => {
              setDescOpen(o);
              // 每次打開都以目前值重新起草，避免沿用上次取消掉的草稿。
              if (o) setDescDraft(task.description ?? "");
            }}
          >
            <DialogTrigger
              className={cn(metaCls, !task.description && emptyMetaCls)}
              // 說明被截斷時，滑過原生 tooltip 就能看全文，不必特地打開。
              title={task.description || "新增說明"}
              aria-label={task.description ? "編輯任務說明" : "新增說明"}
            >
              <AlignLeft className="h-3 w-3 shrink-0" />
              {task.description && (
                <span className="truncate">{task.description}</span>
              )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>任務說明</DialogTitle>
                <DialogDescription className="truncate">
                  {task.title}
                </DialogDescription>
              </DialogHeader>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.currentTarget.value)}
                placeholder="這個任務要做什麼…"
                rows={8}
                disabled={pending}
                autoFocus
                className="border-input focus:border-ring block w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-sm leading-snug outline-none"
              />
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDescOpen(false)}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button onClick={saveDescription} disabled={pending}>
                  儲存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 開始 / 結束日：點一下就能設定（不用進 ⋯ 選單）。 */}
          <Popover>
            <PopoverTrigger
              className={cn(
                metaCls,
                !(task.startDate || task.dueDate) && !reminders.length && emptyMetaCls,
              )}
              title="設定開始 / 結束日期"
              aria-label="設定開始 / 結束日期"
            >
              <CalendarDays className="h-3 w-3 shrink-0" />
              {(task.startDate || task.dueDate) && (
                <span className="tabular-nums">
                  {task.startDate ? fmtDateShort(task.startDate) : "—"}
                  {" → "}
                  {task.dueDate ? fmtDateShort(task.dueDate) : "—"}
                </span>
              )}
              {reminders.length > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-amber-600"
                  title={`到期前 ${reminders.join("、")} 天提醒`}
                >
                  <Bell className="h-3 w-3 shrink-0" />
                  {reminders.join(",")}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className={popoverCls}>
            <div className="space-y-1">
              <div className="text-muted-foreground text-xs">開始日</div>
              <input
                type="date"
                defaultValue={task.startDate ?? ""}
                max={task.dueDate ?? undefined}
                disabled={pending}
                onChange={(e) =>
                  patch({ startDate: e.currentTarget.value || null })
                }
                className={inputCls}
              />
            </div>
            <div className="mt-2 space-y-1">
              <div className="text-muted-foreground text-xs">結束 / 到期日</div>
              <input
                type="date"
                defaultValue={task.dueDate ?? ""}
                min={task.startDate ?? undefined}
                disabled={pending}
                onChange={(e) =>
                  patch({ dueDate: e.currentTarget.value || null })
                }
                className={inputCls}
              />
            </div>

            {/* 到期提醒（前 N 天）：天數自由設定，可多個。 */}
            <div className="mt-3 space-y-1.5 border-t pt-2">
              <div className="text-muted-foreground flex items-center gap-1 text-xs">
                <Bell className="h-3 w-3" /> 到期提醒（前 N 天）
              </div>
              {!task.dueDate && (
                <p className="text-muted-foreground/70 text-[11px]">
                  設定到期日後，會在指定天數前發通知給負責人。
                </p>
              )}
              {reminders.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {reminders.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700"
                    >
                      前 {n} 天
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeReminder(n)}
                        className="hover:text-amber-900"
                        title="移除"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1">
                {[7, 3, 1].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={pending || reminders.includes(n)}
                    onClick={() => addReminder(n)}
                    className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    前 {n} 天
                  </button>
                ))}
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDay}
                    disabled={pending}
                    placeholder="天"
                    onChange={(e) => setCustomDay(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addReminder(Number(customDay));
                        setCustomDay("");
                      }
                    }}
                    className="border-input h-7 w-14 rounded-md border bg-transparent px-1.5 text-xs outline-none focus:border-ring"
                  />
                  <button
                    type="button"
                    disabled={pending || !customDay}
                    onClick={() => {
                      addReminder(Number(customDay));
                      setCustomDay("");
                    }}
                    className="hover:bg-muted rounded-md border p-1 disabled:opacity-40"
                    title="新增自訂天數"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            </div>
            </PopoverContent>
          </Popover>
        </div>
      </td>

      {/* 負責人 */}
      <td className="px-2 py-1.5 align-top">
        <Popover>
          <PopoverTrigger className="hover:bg-muted flex w-full items-start gap-1 rounded-md px-1 py-0.5 text-left">
            {task.owners.length === 0 && !task.ownerLabel ? (
              <span className="text-muted-foreground/60 text-xs">指派…</span>
            ) : (
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {task.owners.length > 0 && (
                  <span className="flex items-center">
                    {orderedOwners.slice(0, 3).map((o, i) => (
                      <span
                        key={o.id}
                        className={cn("relative", i > 0 && "-ml-2")}
                      >
                        <Avatar className="h-6 w-6 border-2 border-white">
                          {o.image && <AvatarImage src={o.image} alt="" />}
                          <AvatarFallback className="text-[9px]">
                            {displayInitial(o)}
                          </AvatarFallback>
                        </Avatar>
                        {primaryId === o.id && (
                          <Star
                            className="absolute -top-1 -right-0.5 h-3 w-3 fill-amber-400 text-amber-500"
                            aria-label="主負責人"
                          />
                        )}
                      </span>
                    ))}
                  </span>
                )}
                <span className="min-w-0 text-left text-xs leading-tight break-words">
                  {orderedOwners.map((o) => displayName(o)).join("、")}
                  {task.owners.length > 0 && task.ownerLabel && "、"}
                  {task.ownerLabel && (
                    <span className="text-muted-foreground">{task.ownerLabel}</span>
                  )}
                </span>
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64">
            <div className="text-sm font-medium">負責人</div>
            <p className="text-muted-foreground text-[11px]">
              勾選負責人；點 ☆ 設為主負責人（僅一位）。
            </p>
            <div className="scroll-y max-h-56 space-y-0.5 overflow-y-auto">
              {members.map((m) => {
                const isOwner = ownerIds.has(m.id);
                const isPrimary = primaryId === m.id;
                return (
                  <div
                    key={m.id}
                    className="hover:bg-muted flex items-center gap-2 rounded-md px-1.5 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={isOwner}
                      disabled={pending}
                      onChange={(e) => toggleOwner(m.id, e.currentTarget.checked)}
                      className="accent-primary h-4 w-4"
                    />
                    <MemberName u={m} className="min-w-0 flex-1" />
                    {/* 主負責人星標：只有已勾選的負責人可設。 */}
                    {isOwner && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => togglePrimary(m.id)}
                        title={isPrimary ? "取消主負責人" : "設為主負責人"}
                        className="shrink-0 rounded p-0.5 hover:bg-muted"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4",
                            isPrimary
                              ? "fill-amber-400 text-amber-500"
                              : "text-muted-foreground/40",
                          )}
                        />
                      </button>
                    )}
                  </div>
                );
              })}
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
      <td className="px-2 py-1.5 align-top">
        <select
          value={task.status}
          disabled={pending}
          onChange={(e) => patch({ status: e.currentTarget.value as KrStatus })}
          className={cn(
            "h-7 w-full min-w-0 rounded-full border px-2 text-xs font-medium outline-none",
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
      <td className="px-2 py-1.5 align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="bg-muted h-1.5 w-full min-w-[2.5rem] flex-1 overflow-hidden rounded-full">
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
            className="border-input h-7 w-11 shrink-0 rounded border bg-transparent px-1 text-xs outline-none"
          />
        </div>
      </td>

      {/* 健康度 RAG */}
      <td className="px-2 py-1.5 text-center align-top">
        <button
          type="button"
          disabled={pending}
          title="點擊切換 順利/注意/延宕"
          onClick={() => patch({ health: HEALTH_CYCLE[task.health] })}
        >
          <HealthDot health={task.health} />
        </button>
      </td>

      {/* 進度追蹤 */}
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
          className="hover:bg-muted/50 focus:bg-muted/50 block w-full max-w-full resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 text-xs leading-snug break-words whitespace-pre-wrap outline-none"
        />
      </td>

      {/* ⋯ 選單 */}
      <td className="px-1 py-1.5 text-center align-top">
        <Popover>
          <PopoverTrigger className="hover:bg-muted text-muted-foreground rounded-md p-1">
            <MoreHorizontal className="h-4 w-4" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
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
