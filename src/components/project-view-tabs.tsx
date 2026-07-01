"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import type { ProjectView } from "@prisma/client";
import {
  createProjectViewAction,
  deleteProjectView,
  type ViewActionState,
} from "@/server/actions/views";
import { PROJECT_STATUS_OPTIONS, PROJECT_TYPE_OPTIONS } from "@/lib/constants";
import { describeView } from "@/lib/project-filter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

function ChipGroup({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className="has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors"
          >
            <input type="checkbox" name={name} value={o.value} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ProjectViewTabs({
  views,
  counts,
  activeId,
  viewMode,
}: {
  views: ProjectView[];
  counts: Record<string, number>;
  activeId: string;
  viewMode: "list" | "card";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function hrefFor(id: string) {
    return `/projects?view=${viewMode}&board=${id}`;
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res: ViewActionState = await createProjectViewAction(null, fd);
      if (res?.ok && res.id) {
        setOpen(false);
        toast.success("已新增視窗");
        router.push(hrefFor(res.id));
        router.refresh();
      } else {
        setError(res?.error ?? "新增失敗");
      }
    });
  }

  function handleDelete(v: ProjectView) {
    if (!confirm(`刪除視窗「${v.name}」？（裡面的專案不會被刪除）`)) return;
    start(async () => {
      try {
        await deleteProjectView(v.id);
        toast.success("已刪除視窗");
        router.push(`/projects?view=${viewMode}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
      }
    });
  }

  return (
    <div className="mb-3 flex items-center gap-1 overflow-x-auto border-b">
      {views.map((v) => {
        const active = v.id === activeId;
        return (
          <div key={v.id} className="relative flex items-center">
            <Link
              href={hrefFor(v.id)}
              title={describeView(v)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {v.name}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-primary/10 text-primary" : "bg-muted",
                )}
              >
                {counts[v.id] ?? 0}
              </span>
            </Link>
            {active && !v.isSystem && (
              <button
                type="button"
                title="刪除此視窗"
                disabled={pending}
                onClick={() => handleDelete(v)}
                className="text-muted-foreground hover:text-destructive -ml-1 mr-1 rounded p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        title="新增視窗"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-muted-foreground hover:text-foreground ml-1 shrink-0 rounded p-1.5"
      >
        <Plus className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增視窗</DialogTitle>
            <DialogDescription>
              依狀態 / 類型把專案分到不同視窗。兩者皆留空＝顯示全部。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="v-name">名稱</Label>
              <Input id="v-name" name="name" required placeholder="例：進行中 / 我的專案" />
            </div>

            <ChipGroup label="狀態（可複選，留空＝不限）" name="statuses" options={PROJECT_STATUS_OPTIONS} />
            <ChipGroup label="類型（可複選，留空＝不限）" name="types" options={PROJECT_TYPE_OPTIONS} />

            <label className="bg-muted/40 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="exclude"
                className="accent-primary mt-0.5 h-4 w-4"
              />
              <span>
                反向（排除）：顯示「<strong className="font-semibold">不符合</strong>
                」上述條件的專案。
                <br />
                <span className="text-muted-foreground text-xs">
                  例：勾「完成、暫停」並開啟反向＝只看「進行中等其餘」專案。
                </span>
              </span>
            </label>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                取消
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "新增中…" : "新增視窗"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
