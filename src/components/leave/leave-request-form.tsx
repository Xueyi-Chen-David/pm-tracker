"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, CalendarPlus } from "lucide-react";
import { submitLeaveRequest } from "@/server/actions/leave-requests";
import { toDateInput } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AttachmentField,
  type AttachmentValue,
} from "@/components/attachment-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";

type LeaveTypeOption = { id: string; name: string; color: string | null };

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

/** "HH:mm" 字串相減的小時數（結束早於或等於開始回 0）。 */
function diffHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const mins = eh * 60 + em - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

/** 「申請請假」對話框：填假別 / 起訖日（或單日時數）/ 事由，送出後進入簽核流程。 */
export function LeaveRequestForm({
  leaveTypes,
}: {
  leaveTypes: LeaveTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [mode, setMode] = useState<"day" | "hourly">("day");
  const [startDate, setStartDate] = useState(toDateInput(new Date()));
  const [endDate, setEndDate] = useState(toDateInput(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<AttachmentValue>(null);

  const hours = diffHours(startTime, endTime);

  function reset() {
    setLeaveTypeId("");
    setMode("day");
    setStartDate(toDateInput(new Date()));
    setEndDate(toDateInput(new Date()));
    setStartTime("09:00");
    setEndTime("11:00");
    setReason("");
    setAttachment(null);
  }

  function submit() {
    if (!startDate || (mode === "day" && !endDate)) {
      toast.error("請選擇日期");
      return;
    }
    if (mode === "day" && endDate < startDate) {
      toast.error("結束日期不能早於開始日期");
      return;
    }
    if (mode === "hourly" && hours <= 0) {
      toast.error("結束時間必須晚於開始時間");
      return;
    }
    start(async () => {
      try {
        const res = await submitLeaveRequest({
          leaveTypeId: leaveTypeId || undefined,
          startDate,
          endDate: mode === "hourly" ? startDate : endDate,
          startTime: mode === "hourly" ? startTime : undefined,
          endTime: mode === "hourly" ? endTime : undefined,
          reason: reason.trim() || undefined,
          attachment: attachment?.dataUrl,
          attachmentName: attachment?.name,
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(
          res.autoApproved
            ? res.autoApproveReason === "exempt"
              ? "已送出並自動核准（你免簽核）"
              : "已送出並自動核准（尚未設定簽核流程）"
            : "已送出請假申請，等待簽核",
        );
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "送出失敗");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" /> 申請請假
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <CalendarPlus className="h-4.5 w-4.5" /> 申請請假
          </DialogTitle>
          <DialogDescription>
            送出後依公司設定的簽核流程逐關簽核；每一關輪到的簽核人會收到通知。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="lr-type">假別</Label>
            <select
              id="lr-type"
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              className={inputCls}
            >
              <option value="">未指定（一般請假）</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>請假方式</Label>
            <div className="bg-muted grid grid-cols-2 gap-1 rounded-md p-1">
              <button
                type="button"
                onClick={() => setMode("day")}
                className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
                  mode === "day"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                整天（可跨日）
              </button>
              <button
                type="button"
                onClick={() => setMode("hourly")}
                className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
                  mode === "hourly"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                時數（單日）
              </button>
            </div>
          </div>
          {mode === "day" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lr-start">開始日期</Label>
                <input
                  id="lr-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className={inputCls}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lr-end">結束日期</Label>
                <input
                  id="lr-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="grid gap-1.5">
                <Label htmlFor="lr-hourly-date">日期</Label>
                <input
                  id="lr-hourly-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="lr-start-time">開始時間</Label>
                  <input
                    id="lr-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="lr-end-time">結束時間</Label>
                  <input
                    id="lr-end-time"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="text-muted-foreground text-xs">
                {hours > 0 ? `共 ${hours} 小時` : "結束時間必須晚於開始時間"}
              </div>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="lr-reason">事由（選填）</Label>
            <Textarea
              id="lr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：家庭事由 / 就醫 / 出國"
              rows={3}
              maxLength={2000}
            />
          </div>
          <AttachmentField value={attachment} onChange={setAttachment} />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            取消
          </Button>
          <Button onClick={submit} disabled={pending}>
            送出申請
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
