"use client";

import { cloneElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { assignCourse } from "@/server/actions/training";
import { MemberName } from "@/components/member-name";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { NameSource } from "@/lib/display";

type Member = NameSource & { id: string };

export function TrainingAssignDialog({
  trigger,
  courseId,
  courseTitle,
  members,
  assignedUserIds,
}: {
  trigger: React.ReactElement<{ onClick?: () => void }>;
  courseId: string;
  courseTitle: string;
  members: Member[];
  assignedUserIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState("");
  const assignedSet = new Set(assignedUserIds);

  const unassigned = members.filter((m) => !assignedSet.has(m.id));

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  function submit() {
    const userIds = [...picked];
    if (userIds.length === 0) {
      toast.error("請至少選一位成員");
      return;
    }
    start(async () => {
      try {
        await assignCourse({ courseId, userIds, dueDate: due || undefined });
        toast.success(`已指派「${courseTitle}」給 ${userIds.length} 位成員`);
        setOpen(false);
        setPicked(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "指派失敗");
      }
    });
  }

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>指派課程</DialogTitle>
            <DialogDescription>
              「{courseTitle}」— 選擇要指派的成員，可設定應完成日。被指派者會收到通知。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-due">應完成日（選填）</Label>
              <Input
                id="assign-due"
                type="date"
                value={due}
                onChange={(e) => setDue(e.currentTarget.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">選擇成員</span>
              {unassigned.length > 0 && (
                <button
                  type="button"
                  className="text-primary text-xs hover:underline"
                  onClick={() =>
                    setPicked((prev) =>
                      prev.size === unassigned.length
                        ? new Set()
                        : new Set(unassigned.map((m) => m.id)),
                    )
                  }
                >
                  {picked.size === unassigned.length ? "取消全選" : "全選未指派"}
                </button>
              )}
            </div>

            <div className="scroll-y max-h-64 space-y-0.5 overflow-y-auto rounded-md border p-1">
              {members.map((m) => {
                const already = assignedSet.has(m.id);
                return (
                  <label
                    key={m.id}
                    className={
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm " +
                      (already
                        ? "text-muted-foreground"
                        : "hover:bg-muted cursor-pointer")
                    }
                  >
                    {already ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={picked.has(m.id)}
                        onChange={(e) => toggle(m.id, e.currentTarget.checked)}
                        className="accent-primary h-4 w-4"
                      />
                    )}
                    <MemberName u={m} className="min-w-0" />
                    {already && (
                      <span className="ml-auto shrink-0 text-[11px]">已指派</span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              取消
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "指派中…" : `指派（${picked.size}）`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
