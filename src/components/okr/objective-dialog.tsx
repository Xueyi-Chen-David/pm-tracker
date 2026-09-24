"use client";

import { cloneElement, isValidElement, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createObjective, updateObjective } from "@/server/actions/okr";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { OwnerLite } from "@/components/okr/key-result-row";

type ObjectiveEdit = {
  id: string;
  title: string;
  description: string | null;
  cycle: string;
  targetDate: string | null;
  ownerId: string | null;
};

export function ObjectiveDialog({
  trigger,
  members,
  cycles,
  cycleOptions,
  defaultCycle,
  level,
  objective,
}: {
  trigger: React.ReactElement;
  members: OwnerLite[];
  cycles: string[];
  /** 有給就把「週期」欄改成固定下拉選單（季度用：Q1–Q4），讓使用者直接挑一個季別。 */
  cycleOptions?: string[];
  defaultCycle: string;
  level: "ANNUAL" | "QUARTERLY";
  objective?: ObjectiveEdit;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = !!objective;
  const isAnnual = level === "ANNUAL";
  const cycleLabel = isAnnual ? "年度" : "季度";
  const cyclePlaceholder = isAnnual ? "2026" : "2026 Q3";
  const listId = `okr-cycles-${level}`;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      title: String(fd.get("title") ?? "").trim(),
      level,
      cycle: String(fd.get("cycle") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || undefined,
      targetDate: String(fd.get("targetDate") ?? "") || undefined,
      ownerId: String(fd.get("ownerId") ?? "") || undefined,
    };
    if (!input.title) return setError("請輸入目標名稱");
    if (!input.cycle) return setError(`請輸入${cycleLabel}`);
    start(async () => {
      try {
        if (editing) await updateObjective(objective.id, input);
        else await createObjective(input);
        setOpen(false);
        toast.success(editing ? "已更新目標" : "已新增目標");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  const openDialog = () => {
    setError(null);
    setOpen(true);
  };

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(
            trigger as React.ReactElement<{ onClick?: () => void }>,
            { onClick: openDialog },
          )
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "編輯" : "新增"}
              {cycleLabel}目標
            </DialogTitle>
            <DialogDescription>
              {cycleLabel} OKR：目標（Objective）底下再加 Key Result，KR 可連專案即時反映進度。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="o-title">目標名稱</Label>
              <Input
                id="o-title"
                name="title"
                required
                defaultValue={objective?.title ?? ""}
                placeholder="例：IT 事業者申請"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="o-cycle">{cycleLabel}</Label>
                {cycleOptions ? (
                  <select
                    id="o-cycle"
                    name="cycle"
                    defaultValue={objective?.cycle ?? defaultCycle}
                    className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    {Array.from(
                      new Set([objective?.cycle ?? defaultCycle, ...cycleOptions]),
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <Input
                      id="o-cycle"
                      name="cycle"
                      list={listId}
                      required
                      defaultValue={objective?.cycle ?? defaultCycle}
                      placeholder={cyclePlaceholder}
                    />
                    <datalist id={listId}>
                      {cycles.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="o-date">目標日期（選填）</Label>
                <DatePicker
                  id="o-date"
                  name="targetDate"
                  placeholder="未設定"
                  defaultValue={objective?.targetDate ?? ""}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-owner">負責人（選填）</Label>
              <select
                id="o-owner"
                name="ownerId"
                defaultValue={objective?.ownerId ?? ""}
                className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">—</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-desc">說明（選填）</Label>
              <Textarea
                id="o-desc"
                name="description"
                rows={2}
                defaultValue={objective?.description ?? ""}
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
                {pending ? "儲存中…" : editing ? "儲存" : "新增"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
