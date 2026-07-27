"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Inbox } from "lucide-react";
import { cancelLeaveRequest } from "@/server/actions/leave-requests";
import type { LeaveRequestRow } from "@/server/queries";
import { leaveStatusMeta, approvalStatusMeta } from "@/lib/leave-approval";
import { displayName } from "@/lib/display";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttachmentLink } from "@/components/attachment-field";

/**
 * 請假申請卡與其零件。
 *
 * 「我的請假」已搬到「打卡 / 請假 / 出差」頁，「待我簽核 / 全體請假」仍在請假簽核頁，
 * 兩邊都要畫同一張卡，故抽成共用檔（原本內嵌在 leave-workspace.tsx）。
 */

export function Empty({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center text-sm">
      <Inbox className="h-6 w-6 opacity-50" />
      {text}
    </div>
  );
}

/** 一筆請假申請卡：狀態 + 假別 + 日期 + 事由 + 逐關簽核時間線 + 動作。 */
export function RequestCard({
  req,
  showRequester,
  footer,
}: {
  req: LeaveRequestRow;
  showRequester?: boolean;
  footer?: React.ReactNode;
}) {
  const status = leaveStatusMeta(req.status);
  const sameDay = +new Date(req.startDate) === +new Date(req.endDate);
  const range =
    fmtDate(req.startDate) + (sameDay ? "" : ` – ${fmtDate(req.endDate)}`);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
            status.badge,
          )}
        >
          {status.label}
        </span>
        {req.leaveType && (
          <span
            className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium"
            style={{
              borderColor: req.leaveType.color ?? "#cbd5e1",
              color: req.leaveType.color ?? "#475569",
            }}
          >
            {req.leaveType.name}
          </span>
        )}
        {showRequester && (
          <span className="text-sm font-medium">
            {displayName(req.member.user)}
          </span>
        )}
        <span className="text-muted-foreground inline-flex items-center gap-1 text-sm">
          <CalendarRange className="h-3.5 w-3.5" />
          {range}
          {req.days > 0 && ` · ${req.days} 天`}
        </span>
      </div>

      {req.reason && <p className="text-sm whitespace-pre-wrap">{req.reason}</p>}

      {req.attachment && (
        <AttachmentLink attachment={req.attachment} name={req.attachmentName} />
      )}

      <ApprovalTimeline req={req} />

      {footer && <div className="flex justify-end pt-1">{footer}</div>}
    </Card>
  );
}

/** 逐關簽核時間線：每關的簽核人 + 狀態 + 意見；目前這關（待簽）以主色標示。 */
function ApprovalTimeline({ req }: { req: LeaveRequestRow }) {
  if (req.approvals.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">無簽核關卡 · 送出即自動核准</p>
    );
  }
  return (
    <ol className="space-y-1.5 border-t pt-3">
      {req.approvals.map((a) => {
        const meta = approvalStatusMeta(a.status);
        const isCurrent =
          req.status === "PENDING" &&
          a.sortOrder === req.currentStep &&
          a.status === "PENDING";
        return (
          <li key={a.id} className="flex items-start gap-2 text-sm">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : a.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-700"
                    : a.status === "REJECTED"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {a.sortOrder + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">
                  {displayName(a.approverMember.user)}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 text-[11px] font-medium",
                    isCurrent
                      ? "border-amber-200 bg-amber-100 text-amber-700"
                      : meta.badge,
                  )}
                >
                  {isCurrent ? "簽核中" : meta.label}
                </span>
                {a.decidedAt && (
                  <span className="text-muted-foreground text-[11px]">
                    {fmtDate(a.decidedAt)}
                  </span>
                )}
              </div>
              {a.comment && (
                <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-wrap">
                  「{a.comment}」
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 申請人撤回自己「待簽核」的申請。 */
export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      disabled={pending}
      onClick={() => {
        if (!confirm("確定撤回這筆請假申請？")) return;
        start(async () => {
          try {
            const res = await cancelLeaveRequest(id);
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("已撤回申請");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "撤回失敗");
          }
        });
      }}
    >
      撤回申請
    </Button>
  );
}
