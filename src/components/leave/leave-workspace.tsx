"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, CalendarRange, Inbox, Trash2 } from "lucide-react";
import {
  decideLeaveApproval,
  cancelLeaveRequest,
  deleteLeaveRequest,
} from "@/server/actions/leave-requests";
import type { LeaveRequestRow } from "@/server/queries";
import {
  leaveStatusMeta,
  approvalStatusMeta,
} from "@/lib/leave-approval";
import { displayName } from "@/lib/display";
import { fmtDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { LeaveRequestForm } from "@/components/leave/leave-request-form";
import { LeaveApprovalFlowManager } from "@/components/leave/leave-approval-flow-manager";

type MemberOption = { membershipId: string; label: string };
type FlowStep = { approverType: "MANAGER" | "MEMBER"; approverMemberId: string | null };

export function LeaveWorkspace({
  myRequests,
  pending,
  allRequests,
  leaveTypes,
  canManageLeave,
  flowSteps,
  members,
}: {
  myRequests: LeaveRequestRow[];
  pending: LeaveRequestRow[];
  allRequests: LeaveRequestRow[] | null;
  leaveTypes: { id: string; name: string; color: string | null }[];
  canManageLeave: boolean;
  flowSteps: FlowStep[] | null;
  members: MemberOption[] | null;
}) {
  return (
    <Tabs defaultValue={pending.length > 0 ? "pending" : "mine"} className="gap-4">
      <TabsList className="h-9">
        <TabsTrigger value="mine" className="px-3">
          我的請假
        </TabsTrigger>
        <TabsTrigger value="pending" className="px-3">
          待我簽核
          {pending.length > 0 && (
            <span className="bg-rose-500 ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
              {pending.length}
            </span>
          )}
        </TabsTrigger>
        {canManageLeave && (
          <>
            <TabsTrigger value="all" className="px-3">
              全體請假
            </TabsTrigger>
            <TabsTrigger value="flow" className="px-3">
              簽核流程
            </TabsTrigger>
          </>
        )}
      </TabsList>

      {/* 我的請假 */}
      <TabsContent value="mine" className="space-y-3">
        <div className="flex justify-end">
          <LeaveRequestForm leaveTypes={leaveTypes} />
        </div>
        {myRequests.length === 0 ? (
          <Empty text="你還沒有送出任何請假申請。點右上「申請請假」開始。" />
        ) : (
          myRequests.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              footer={r.status === "PENDING" ? <CancelButton id={r.id} /> : null}
            />
          ))
        )}
      </TabsContent>

      {/* 待我簽核 */}
      <TabsContent value="pending" className="space-y-3">
        {pending.length === 0 ? (
          <Empty text="目前沒有輪到你簽核的請假申請。" />
        ) : (
          pending.map((r) => (
            <RequestCard
              key={r.id}
              req={r}
              showRequester
              footer={<ApprovalActions requestId={r.id} />}
            />
          ))
        )}
      </TabsContent>

      {/* 全體請假（HR） */}
      {canManageLeave && (
        <TabsContent value="all" className="space-y-3">
          {!allRequests || allRequests.length === 0 ? (
            <Empty text="尚無任何請假申請。" />
          ) : (
            allRequests.map((r) => (
              <RequestCard
                key={r.id}
                req={r}
                showRequester
                footer={<DeleteRequestButton id={r.id} status={r.status} />}
              />
            ))
          )}
        </TabsContent>
      )}

      {/* 簽核流程設定（HR） */}
      {canManageLeave && (
        <TabsContent value="flow">
          <LeaveApprovalFlowManager
            initialSteps={flowSteps ?? []}
            members={members ?? []}
            canManage={canManageLeave}
          />
        </TabsContent>
      )}
    </Tabs>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center text-sm">
      <Inbox className="h-6 w-6 opacity-50" />
      {text}
    </div>
  );
}

/** 一筆請假申請卡：狀態 + 假別 + 日期 + 事由 + 逐關簽核時間線 + 動作。 */
function RequestCard({
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

      {req.reason && (
        <p className="text-sm whitespace-pre-wrap">{req.reason}</p>
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
      <p className="text-muted-foreground text-xs">
        無簽核關卡 · 送出即自動核准
      </p>
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
                <p className="text-muted-foreground mt-0.5 whitespace-pre-wrap text-xs">
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

/** 「待我簽核」的核准 / 駁回動作（附意見輸入）。 */
function ApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<null | "APPROVE" | "REJECT">(null);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();

  function run() {
    if (!decision) return;
    start(async () => {
      try {
        await decideLeaveApproval({
          requestId,
          decision,
          comment: comment.trim() || undefined,
        });
        toast.success(decision === "APPROVE" ? "已核准" : "已駁回");
        setDecision(null);
        setComment("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "操作失敗");
      }
    });
  }

  return (
    <>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            setComment("");
            setDecision("APPROVE");
          }}
          className="gap-1"
        >
          <Check className="h-4 w-4" /> 核准
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setComment("");
            setDecision("REJECT");
          }}
          className="gap-1 text-rose-600"
        >
          <X className="h-4 w-4" /> 駁回
        </Button>
      </div>
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {decision === "APPROVE" ? "核准這筆請假" : "駁回這筆請假"}
            </DialogTitle>
            <DialogDescription>
              {decision === "APPROVE"
                ? "核准後將交給下一關簽核；若這是最後一關，會直接登記到出席月曆。"
                : "駁回後流程結束，申請人會收到通知。"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="附上意見（選填）"
            rows={3}
            maxLength={1000}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecision(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              onClick={run}
              disabled={pending}
              variant={decision === "REJECT" ? "destructive" : "default"}
            >
              {decision === "APPROVE" ? "確認核准" : "確認駁回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** 申請人撤回自己「待簽核」的申請。 */
function CancelButton({ id }: { id: string }) {
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
            await cancelLeaveRequest(id);
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

/** 管理員（leave.manage）刪除一筆請假簽核紀錄；已核准者提醒出席月曆需另行調整。 */
function DeleteRequestButton({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      disabled={pending}
      onClick={() => {
        const warn =
          status === "APPROVED"
            ? "確定刪除這筆「已核准」的請假簽核紀錄？\n\n注意：已登記到出席月曆的請假日不會一併移除，如需撤銷請另於「出席狀況」調整該員月曆。此動作無法復原。"
            : "確定刪除這筆請假簽核紀錄？此動作無法復原。";
        if (!confirm(warn)) return;
        start(async () => {
          try {
            await deleteLeaveRequest(id);
            toast.success("已刪除簽核紀錄");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "刪除失敗");
          }
        });
      }}
    >
      <Trash2 className="h-4 w-4" /> 刪除
    </Button>
  );
}
