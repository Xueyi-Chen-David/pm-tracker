"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Activity,
  Archive,
  Check,
  CircleDot,
  Flag,
  Gauge,
  HeartPulse,
  MessageSquarePlus,
  Pencil,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ActivityKind } from "@prisma/client";
import {
  addActivityNote,
  deleteActivity,
  updateActivityNote,
} from "@/server/actions/activity";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  message: string;
  createdAt: string; // ISO
  actorName: string | null;
};

const KIND_META: Record<
  ActivityKind,
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  CREATE: { icon: Sparkles, className: "bg-violet-100 text-violet-600" },
  STATUS: { icon: CircleDot, className: "bg-blue-100 text-blue-600" },
  HEALTH: { icon: HeartPulse, className: "bg-rose-100 text-rose-600" },
  PROGRESS: { icon: Gauge, className: "bg-emerald-100 text-emerald-600" },
  FIELD: { icon: Pencil, className: "bg-slate-100 text-slate-600" },
  MILESTONE: { icon: Flag, className: "bg-amber-100 text-amber-600" },
  MEMBER: { icon: Users, className: "bg-sky-100 text-sky-600" },
  WEEKLY: { icon: Activity, className: "bg-indigo-100 text-indigo-600" },
  ARCHIVE: { icon: Archive, className: "bg-zinc-100 text-zinc-600" },
  NOTE: { icon: StickyNote, className: "bg-yellow-100 text-yellow-700" },
};

export function ActivityLog({
  projectId,
  items,
  canEdit,
}: {
  projectId: string;
  items: ActivityItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(id: string, message: string) {
    setEditingId(id);
    setEditValue(message);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  function saveEdit(id: string) {
    const message = editValue.trim();
    if (!message) return;
    start(async () => {
      try {
        await updateActivityNote({ id, projectId, message });
        cancelEdit();
        toast.success("已更新備註");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新失敗");
      }
    });
  }

  function addNote() {
    const message = note.trim();
    if (!message) return;
    start(async () => {
      try {
        await addActivityNote({ projectId, message });
        setNote("");
        toast.success("已新增備註");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "新增失敗");
      }
    });
  }

  function remove(id: string) {
    if (!confirm("確定刪除這筆操作紀錄嗎？此動作無法復原。")) return;
    start(async () => {
      try {
        await deleteActivity({ id, projectId });
        toast.success("已刪除");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "刪除失敗");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1">
      {canEdit && (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="新增備註…（例：已與客戶確認延期）"
            rows={2}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote();
            }}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={!note.trim() || pending} onClick={addNote}>
              <MessageSquarePlus className="h-4 w-4" /> 新增備註
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          尚無操作紀錄。
        </p>
      ) : (
        <ol className="scroll-y max-h-[20rem] space-y-0.5 overflow-y-auto pr-1.5 lg:max-h-none lg:min-h-0 lg:flex-1">
          {items.map((it) => {
            const meta = KIND_META[it.kind] ?? KIND_META.NOTE;
            const Icon = meta.icon;
            const isNote = it.kind === "NOTE";
            const editing = editingId === it.id;
            return (
              <li
                key={it.id}
                className="group hover:bg-muted/40 flex items-start gap-2.5 rounded-lg px-1.5 py-1.5"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    meta.className,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <div className="space-y-1.5">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        autoFocus
                        className="resize-none text-sm"
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                            saveEdit(it.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={cancelEdit}
                        >
                          <X className="h-3.5 w-3.5" /> 取消
                        </Button>
                        <Button
                          size="sm"
                          disabled={!editValue.trim() || pending}
                          onClick={() => saveEdit(it.id)}
                        >
                          <Check className="h-3.5 w-3.5" /> 儲存
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-snug break-words whitespace-pre-wrap">
                        {it.message}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {it.actorName ? `${it.actorName} · ` : ""}
                        {format(parseISO(it.createdAt), "M/d HH:mm")}
                      </p>
                    </>
                  )}
                </div>
                {canEdit && !editing && (
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                    {isNote && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="編輯備註"
                        disabled={pending}
                        onClick={() => startEdit(it.id, it.message)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="刪除這筆紀錄"
                      disabled={pending}
                      onClick={() => remove(it.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
