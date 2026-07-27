"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Check, X, Plus } from "lucide-react";
import {
  requestCheckInCorrection,
  cancelCheckInCorrection,
  reviewCheckInCorrection,
} from "@/server/actions/attendance";
import type {
  CheckInCorrectionRow,
  PendingCheckInCorrection,
} from "@/server/queries";
import { displayName } from "@/lib/display";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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

const inputCls =
  "border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function timeOf(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "待審核", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "已核准", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "已駁回", cls: "bg-rose-100 text-rose-700" },
};

/**
 * 補打卡：本人送出申請 + 檢視自己的申請；具 attendance.manage 者另有待審核清單可核准 / 駁回。
 */
/**
 * 補打卡：本人的申請（mine）與管理者的待審核（pending）。
 *
 * 兩區各自可獨立顯示——「打卡 / 出勤」頁只放本人的申請，「出席狀況」頁只放待審核，
 * 故 mine=null 代表不渲染本人區、canReview=false 代表不渲染待審核區。
 */
export function CheckInCorrections({
  mine,
  pending,
  canReview,
}: {
  /** 本人的補打卡申請；null＝不顯示「我的補打卡」區。 */
  mine: CheckInCorrectionRow[] | null;
  pending: PendingCheckInCorrection[] | null;
  canReview: boolean;
}) {
  return (
    <div className={cn("grid gap-4", mine && canReview && "lg:grid-cols-2")}>
      {/* 本人：補打卡申請 */}
      {mine && (
        <div className="bg-card rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-4 w-4" /> 我的補打卡
            </h3>
            <RequestDialog />
          </div>
          {mine.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              忘記上 / 下班打卡時，點「補打卡」送出申請，經主管核准後補計工時。
            </p>
          ) : (
            <ul className="divide-y">
              {mine.map((c) => (
                <MyRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 管理者：待審核清單 */}
      {canReview && (
        <div className="bg-card rounded-xl border p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            待審核補打卡
            {pending && pending.length > 0 && (
              <span className="bg-rose-500 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                {pending.length}
              </span>
            )}
          </h3>
          {!pending || pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">目前沒有待審核的補打卡申請。</p>
          ) : (
            <ul className="divide-y">
              {pending.map((c) => (
                <ReviewRow key={c.id} c={c} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MyRow({ c }: { c: CheckInCorrectionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const meta = STATUS_META[c.status] ?? STATUS_META.pending;
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <span className={cn("shrink-0 rounded px-1.5 text-[10px] font-medium", meta.cls)}>
        {meta.label}
      </span>
      <span className="min-w-0 flex-1">
        {fmtDate(c.date)} {c.kind === "in" ? "上班" : "下班"} {timeOf(c.at)}
        {c.reason && (
          <span className="text-muted-foreground"> · {c.reason}</span>
        )}
        {c.status === "rejected" && c.reviewNote && (
          <span className="text-rose-600"> · {c.reviewNote}</span>
        )}
      </span>
      {c.status === "pending" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("撤回這筆補打卡申請？")) return;
            start(async () => {
              try {
                await cancelCheckInCorrection(c.id);
                toast.success("已撤回");
                router.refresh();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "撤回失敗");
              }
            });
          }}
          className="text-muted-foreground hover:text-foreground shrink-0 text-xs"
        >
          撤回
        </button>
      )}
    </li>
  );
}

function ReviewRow({ c }: { c: PendingCheckInCorrection }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function review(approve: boolean) {
    let note: string | undefined;
    if (!approve) {
      note = prompt("駁回原因（選填）") ?? undefined;
    }
    start(async () => {
      try {
        const res = await reviewCheckInCorrection(c.id, approve, note);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        toast.success(approve ? "已核准並補計工時" : "已駁回");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{displayName(c.requester)}</span>
        <span className="text-muted-foreground">
          {" "}
          · {fmtDate(c.date)} {c.kind === "in" ? "上班" : "下班"} {timeOf(c.at)}
          {c.reason && ` · ${c.reason}`}
        </span>
      </span>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" disabled={pending} onClick={() => review(true)} className="h-7 gap-1">
          <Check className="h-3.5 w-3.5" /> 核准
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => review(false)}
          className="h-7 gap-1 text-rose-600"
        >
          <X className="h-3.5 w-3.5" /> 駁回
        </Button>
      </div>
    </li>
  );
}

function RequestDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [kind, setKind] = useState<"in" | "out">("in");
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      try {
        await requestCheckInCorrection({ date, kind, time, reason: reason.trim() || undefined });
        toast.success("已送出補打卡申請");
        setOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "送出失敗");
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
        <Plus className="h-4 w-4" /> 補打卡
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>補打卡申請</DialogTitle>
            <DialogDescription>
              忘記上 / 下班打卡時填寫，送出後由具出勤管理權限者核准，核准後補計當日工時。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="c-date">日期</Label>
                <input
                  id="c-date"
                  type="date"
                  max={todayStr()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={cn(inputCls, "w-full")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-time">時間</Label>
                <input
                  id="c-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={cn(inputCls, "w-full")}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>類別</Label>
              <div className="flex gap-2">
                {(["in", "out"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
                      kind === k
                        ? "border-primary bg-primary/5 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {k === "in" ? "上班" : "下班"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-reason">事由（選填）</Label>
              <Textarea
                id="c-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="例：忘記打卡 / 系統當機"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              取消
            </Button>
            <Button onClick={submit} disabled={pending}>
              送出申請
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
