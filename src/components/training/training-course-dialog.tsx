"use client";

import { cloneElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { TrainingFormat } from "@prisma/client";
import { createCourse, updateCourse } from "@/server/actions/training";
import { TRAINING_FORMAT_OPTIONS, TRAINING_CATEGORIES } from "@/lib/training";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export type CourseEdit = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  format: TrainingFormat;
  resourceUrl: string | null;
  estimatedMin: number | null;
  required: boolean;
  renewMonths: number | null;
};

const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function TrainingCourseDialog({
  trigger,
  course,
}: {
  trigger: React.ReactElement<{ onClick?: () => void }>;
  course?: CourseEdit;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = !!course;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || undefined,
      category: String(fd.get("category") ?? "").trim() || undefined,
      format: (fd.get("format") as TrainingFormat) ?? "ONLINE",
      resourceUrl: String(fd.get("resourceUrl") ?? "").trim() || undefined,
      estimatedMin: fd.get("estimatedMin")
        ? Number(fd.get("estimatedMin"))
        : undefined,
      required: fd.get("required") === "on",
      renewMonths: fd.get("renewMonths")
        ? Number(fd.get("renewMonths"))
        : undefined,
    };
    if (!input.title) return setError("請輸入課程名稱");
    start(async () => {
      try {
        if (editing) await updateCourse(course.id, input);
        else await createCourse(input);
        setOpen(false);
        toast.success(editing ? "已更新課程" : "已新增課程");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  return (
    <>
      {cloneElement(trigger, {
        onClick: () => {
          setError(null);
          setOpen(true);
        },
      })}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯課程" : "新增課程"}</DialogTitle>
            <DialogDescription>
              建立訓練課程後，可指派給成員並追蹤完成狀況。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-title">課程名稱</Label>
              <Input
                id="c-title"
                name="title"
                required
                defaultValue={course?.title ?? ""}
                placeholder="例：資訊安全意識訓練"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-category">分類</Label>
                <Input
                  id="c-category"
                  name="category"
                  list="training-categories"
                  defaultValue={course?.category ?? ""}
                  placeholder="法遵 / 合規"
                />
                <datalist id="training-categories">
                  {TRAINING_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-format">形式</Label>
                <select
                  id="c-format"
                  name="format"
                  defaultValue={course?.format ?? "ONLINE"}
                  className={selectClass}
                >
                  {TRAINING_FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-url">教材 / 課程連結（選填）</Label>
              <Input
                id="c-url"
                name="resourceUrl"
                type="url"
                defaultValue={course?.resourceUrl ?? ""}
                placeholder="https://…"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-min">預估時數（分鐘，選填）</Label>
                <Input
                  id="c-min"
                  name="estimatedMin"
                  type="number"
                  min={0}
                  defaultValue={course?.estimatedMin ?? ""}
                  placeholder="60"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-renew">有效月數（選填）</Label>
                <Input
                  id="c-renew"
                  name="renewMonths"
                  type="number"
                  min={1}
                  defaultValue={course?.renewMonths ?? ""}
                  placeholder="12（每年重訓）"
                />
                <p className="text-muted-foreground text-[11px]">
                  設定後，完成滿此月數會標記「需重訓」。
                </p>
              </div>
            </div>

            <label className="bg-muted/40 flex items-center gap-2 rounded-md px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="required"
                defaultChecked={course?.required ?? false}
                className="accent-primary h-4 w-4"
              />
              必修課程（法遵 / 強制）
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="c-desc">說明（選填）</Label>
              <Textarea
                id="c-desc"
                name="description"
                rows={2}
                defaultValue={course?.description ?? ""}
              />
            </div>

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
                {pending ? "儲存中…" : editing ? "儲存" : "新增課程"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
