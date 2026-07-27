"use client";

import {
  cloneElement,
  isValidElement,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  createDealStage,
  updateDealStage,
  deleteDealStage,
} from "@/server/actions/crm";
import { STAGE_COLOR_NAMES, stageColor } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { StageView } from "@/components/crm/types";

/** 新增 / 編輯（含刪除）一個管線階段。無 stage＝新增。 */
export function StageDialog({
  trigger,
  stage,
}: {
  trigger: React.ReactElement;
  stage?: StageView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(stage?.label ?? "");
  const [note, setNote] = useState(stage?.note ?? "");
  const [color, setColor] = useState(stage?.color ?? "slate");
  const editing = !!stage;

  const openDialog = () => {
    setError(null);
    setLabel(stage?.label ?? "");
    setNote(stage?.note ?? "");
    setColor(stage?.color ?? "slate");
    setOpen(true);
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim()) return setError("請輸入階段名稱");
    const input = { label: label.trim(), note: note.trim() || undefined, color };
    start(async () => {
      try {
        if (editing) {
          const res = await updateDealStage(stage!.id, input);
          if (!res.ok) return setError(res.error);
        } else {
          await createDealStage(input);
        }
        setOpen(false);
        toast.success(editing ? "已更新階段" : "已新增階段");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  function remove() {
    if (!stage || !confirm(`刪除階段「${stage.label}」？`)) return;
    start(async () => {
      try {
        const res = await deleteDealStage(stage.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setOpen(false);
        toast.success("已刪除階段");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
      }
    });
  }

  return (
    <>
      {isValidElement(trigger)
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯階段" : "新增階段"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="st-label">名稱</Label>
              <Input
                id="st-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例：試用 / 正式服務"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="st-note">小備註（顯示在欄位上方，選填）</Label>
              <Textarea
                id="st-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="這個階段的說明 / 提醒"
              />
            </div>
            <div className="space-y-1.5">
              <Label>顏色</Label>
              <div className="flex flex-wrap gap-1.5">
                {STAGE_COLOR_NAMES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-6 w-6 rounded-full ring-offset-2 transition",
                      stageColor(c).dot,
                      color === c && "ring-primary ring-2",
                    )}
                  />
                ))}
              </div>
            </div>
            {error && (
              <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              {editing && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="text-destructive hover:bg-destructive/10 mr-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm"
                >
                  <Trash2 className="h-4 w-4" /> 刪除
                </button>
              )}
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
