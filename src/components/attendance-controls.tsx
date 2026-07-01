"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  createMemberEvent,
  deleteMemberEvent,
} from "@/server/actions/member-events";
import { MEMBER_EVENT_TYPES, memberEventBadge } from "@/lib/constants";
import { fmtDateShort } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Ev = {
  id: string;
  type: string;
  endDate: Date | string | null;
  note: string | null;
};

export function AttendanceControls({
  userId,
  name,
  date,
  events,
}: {
  userId: string;
  name: string;
  date: string; // yyyy-mm-dd
  events: Ev[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove(id: string, type: string) {
    if (!confirm(`移除「${type}」這筆事件？`)) return;
    start(async () => {
      try {
        await deleteMemberEvent({ id, userId });
        toast.success("已移除");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "移除失敗");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = String(fd.get("type") ?? "").trim();
    const endDate = String(fd.get("endDate") ?? "");
    const note = String(fd.get("note") ?? "");
    if (!type) {
      setError("請選擇類型");
      return;
    }
    start(async () => {
      try {
        await createMemberEvent({
          userId,
          type,
          startDate: date,
          endDate: endDate || undefined,
          note: note || undefined,
        });
        setOpen(false);
        toast.success("已登記");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登記失敗");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {events.length === 0 ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 在勤
        </span>
      ) : (
        events.map((ev) => (
          <span
            key={ev.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              memberEventBadge(ev.type),
            )}
            title={ev.note ?? undefined}
          >
            {ev.type}
            {ev.endDate ? ` 至 ${fmtDateShort(ev.endDate)}` : ""}
            <button
              type="button"
              onClick={() => remove(ev.id, ev.type)}
              disabled={pending}
              className="hover:opacity-70"
              title="移除"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="h-3.5 w-3.5" /> 登記
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>登記出席事件 · {name}</DialogTitle>
            <DialogDescription>{date} 起。跨多天才填結束日。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="att-type">類型</Label>
              <Input
                id="att-type"
                name="type"
                list="att-types"
                required
                placeholder="例：請假"
              />
              <datalist id="att-types">
                {MEMBER_EVENT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-end">結束日（選填）</Label>
              <Input id="att-end" name="endDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="att-note">備註（選填）</Label>
              <Textarea id="att-note" name="note" rows={2} />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
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
                {pending ? "登記中…" : "登記"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
