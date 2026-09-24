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
  createCrmEvent,
  updateCrmEvent,
  deleteCrmEvent,
} from "@/server/actions/crm";
import { CRM_EVENT_TYPES } from "@/lib/crm";
import { toDateInput } from "@/lib/date";
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
} from "@/components/ui/dialog";
import type { EventView, ContactLite } from "@/components/crm/types";

const inputCls =
  "border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring";

/** 新增 / 編輯（含刪除）一筆 CRM 活動紀錄。無 event＝新增。 */
export function CrmEventDialog({
  trigger,
  contacts,
  event,
}: {
  trigger: React.ReactElement;
  contacts: ContactLite[];
  event?: EventView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = !!event;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      date: String(fd.get("date") ?? ""),
      type: String(fd.get("type") ?? "活動").trim() || "活動",
      title: String(fd.get("title") ?? "").trim(),
      link: String(fd.get("link") ?? "").trim() || undefined,
      notes: String(fd.get("notes") ?? "").trim() || undefined,
      contactId: String(fd.get("contactId") ?? "") || null,
    };
    if (!input.title) return setError("請輸入主題");
    start(async () => {
      try {
        const res = editing
          ? await updateCrmEvent(event.id, input)
          : await createCrmEvent(input);
        if (!res.ok) return setError(res.error);
        setOpen(false);
        toast.success(editing ? "已更新活動" : "已新增活動");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "儲存失敗");
      }
    });
  }

  function remove() {
    if (!event || !confirm(`刪除活動「${event.title}」？`)) return;
    start(async () => {
      try {
        await deleteCrmEvent(event.id);
        setOpen(false);
        toast.success("已刪除活動");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "刪除失敗");
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
        ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
            onClick: openDialog,
          })
        : trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯活動" : "新增活動"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-date">日期</Label>
                <DatePicker
                  id="ev-date"
                  name="date"
                  clearable={false}
                  defaultValue={event?.date ?? toDateInput(new Date())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-type">類型</Label>
                <Input
                  id="ev-type"
                  name="type"
                  list="crm-event-types"
                  defaultValue={event?.type ?? "活動"}
                  placeholder="例：拜訪"
                />
                <datalist id="crm-event-types">
                  {CRM_EVENT_TYPES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-title">主題</Label>
              <Input
                id="ev-title"
                name="title"
                required
                defaultValue={event?.title ?? ""}
                placeholder="例：拜訪井上酒造 / 參加展會"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-contact">關聯客戶（選填）</Label>
              <select
                id="ev-contact"
                name="contactId"
                defaultValue={event?.contact?.id ?? ""}
                className={inputCls}
              >
                <option value="">—</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company ? `${c.company}（${c.name}）` : c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-link">連結（選填）</Label>
              <Input
                id="ev-link"
                name="link"
                defaultValue={event?.link ?? ""}
                placeholder="https://…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ev-notes">內容 / 紀錄（選填）</Label>
              <Textarea
                id="ev-notes"
                name="notes"
                rows={5}
                defaultValue={event?.notes ?? ""}
                placeholder="做了什麼、重點、後續…"
              />
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
