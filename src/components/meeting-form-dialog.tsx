"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createMeetingAction,
  updateMeetingAction,
} from "@/server/actions/meetings";
import { Users, X } from "lucide-react";
import { MEETING_CATEGORIES } from "@/lib/constants";
import { toDateInput } from "@/lib/date";
import { displayName, type NameSource } from "@/lib/display";
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
import { MeetingNotesCanvas, type NoteImage } from "@/components/meeting-notes-canvas";

export type MemberOption = NameSource & { id: string };

export type MeetingValues = {
  id?: string;
  date?: string; // yyyy-mm-dd
  category?: string;
  title?: string;
  attendeeIds?: string[];
  attendees?: string | null;
  link?: string | null;
  notes?: string | null;
  /** 改版前舊紀錄的浮動圖片（新紀錄圖片已內嵌在 notes 裡，這裡會是空陣列）。 */
  legacyImages?: NoteImage[];
  recordedById?: string | null;
};

export function MeetingFormDialog({
  mode,
  values,
  members,
  currentUserId,
  trigger,
}: {
  mode: "create" | "edit";
  values?: MeetingValues;
  members: MemberOption[];
  /** 新增時「記錄人」預設帶入的人（通常是目前登入者）。 */
  currentUserId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [attendees, setAttendees] = useState<Set<string>>(
    new Set(values?.attendeeIds ?? []),
  );
  const action = mode === "create" ? createMeetingAction : updateMeetingAction;

  // 重新開啟時還原為原本的與會者
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAttendees(new Set(values?.attendeeIds ?? []));
      setError(null);
    }
  }

  function toggle(id: string) {
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = members.length > 0 && attendees.size === members.length;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await action(null, fd);
      if (res?.ok) {
        setOpen(false);
        toast.success(mode === "create" ? "已新增會議" : "已更新會議");
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? "新增會議" : "編輯會議"}</DialogTitle>
            <DialogDescription>
              記錄會議類別、與會者與重點決議；會自動歸入該日期所屬的週報。
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {values?.id && <input type="hidden" name="id" value={values.id} />}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-date">日期</Label>
                <Input
                  id="m-date"
                  name="date"
                  type="date"
                  required
                  defaultValue={values?.date ?? toDateInput(new Date())}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-category">會議類別</Label>
                <Input
                  id="m-category"
                  name="category"
                  required
                  list="meeting-categories"
                  defaultValue={values?.category ?? ""}
                  placeholder="例：全體會議"
                />
                <datalist id="meeting-categories">
                  {MEETING_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-title">主題</Label>
              <Input
                id="m-title"
                name="title"
                required
                defaultValue={values?.title ?? ""}
                placeholder="例：Q3 產品方向討論"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-link">會議連結（選填）</Label>
                <Input
                  id="m-link"
                  name="link"
                  defaultValue={values?.link ?? ""}
                  placeholder="https://…（Google Meet / 會議文件）"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-recorder">記錄人</Label>
                <select
                  id="m-recorder"
                  name="recordedById"
                  defaultValue={values?.recordedById ?? currentUserId}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {displayName(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>
                  與會者
                  <span className="text-muted-foreground ml-1 font-normal">
                    （已選 {attendees.size} 人）
                  </span>
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={allSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setAttendees(new Set(members.map((m) => m.id)))
                    }
                  >
                    <Users className="h-3.5 w-3.5" /> 全體
                  </Button>
                  {attendees.size > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAttendees(new Set())}
                    >
                      <X className="h-3.5 w-3.5" /> 清除
                    </Button>
                  )}
                </div>
              </div>
              <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
                {members.length === 0 ? (
                  <p className="text-muted-foreground col-span-2 py-2 text-center text-sm">
                    尚無成員
                  </p>
                ) : (
                  members.map((m) => (
                    <label
                      key={m.id}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="attendeeIds"
                        value={m.id}
                        checked={attendees.has(m.id)}
                        onChange={() => toggle(m.id)}
                        className="accent-primary h-4 w-4"
                      />
                      <span className="truncate">{displayName(m)}</span>
                    </label>
                  ))
                )}
              </div>
              <Textarea
                name="attendees"
                rows={2}
                defaultValue={values?.attendees ?? ""}
                placeholder="其他與會者（非系統成員，選填）…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>會議記錄 / 決議（選填）</Label>
              <MeetingNotesCanvas
                defaultNotes={values?.notes}
                legacyImages={values?.legacyImages ?? []}
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
                {pending ? "儲存中…" : mode === "create" ? "新增" : "儲存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
